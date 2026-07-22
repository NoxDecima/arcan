import { co, z, Group, Inbox } from "jazz-tools";
import { Contact, ContactBook } from "./Contact";
import { OutgoingConnectionRequest } from "./OutgoingConnectionRequest";
import { PendingNotification } from "./PendingNotification";
import { DeviceRecord } from "./DeviceRecord";
import { EphemeralPairing } from "./EphemeralPairing";
import { Invitation } from "./Invitation";
import { ConnectionRequest } from "./ConnectionRequest";
import { Conversation } from "./Conversation";
import { FileBlob } from "./FileBlob";
import { planContactMigration } from "../contact-migration";
import { getCurrentSessionFingerprint } from "@/auth/session";

/**
 * ArcanAccount: the root account schema for the application.
 *
 * IMPORTANT DEVIATION FROM PLAN:
 * jazz-tools 0.20.18 `co.account()` accepts only `{ profile, root }` as
 * its shape (enforced by `BaseAccountShape`). The plan's top-level account
 * fields (`contactBook`, `devices`) cannot be direct keys
 * of the account — they must live inside the `root` CoMap instead.
 *
 * `profile` uses `co.profile()` (not `co.map()`) because the profile slot
 * requires a CoProfileSchema (a CoMapSchema with the built-in profile
 * defaults for name/inbox/inboxInvite). We extend it with `displayName`
 * and `bio` from our MessangerProfile design; the `avatar` ref is added
 * here as well via co.profile(). The standalone `MessangerProfile` schema
 * is kept for direct use in non-account contexts.
 *
 * Additional deviations:
 * - `class ArcanAccount extends Account` → `co.account({...})`
 * - `co.ref(Profile)` → profile slot becomes `co.profile({...})`
 * - `co.ref(ContactBook)` etc. → moved into root map
 */
export const ArcanAccountRoot = co.map({
  contactBook: ContactBook,
  devices: co.list(DeviceRecord),
  knownConversations: co.list(Conversation),
  // Slice 8 — per-conversation read cutoff (ms epoch). Keys are
  // Conversation IDs; absent keys mean "never opened" (all unread).
  //
  // OPTIONAL because pre-Slice-8 accounts in production don't have this
  // field. Jazz validates required refs strictly at resolve time, BEFORE
  // withMigration's backfill writes propagate to the subscription view —
  // marking the field required broke existing accounts on sign-in. The
  // backfill below is now a best-effort upgrade (populates the field when
  // missing so subsequent writes have somewhere to land) rather than a
  // load-blocker.
  lastReadAt: co.record(z.string(), z.number()).optional(),
  // Unit 7 — per-account settings (appearance + notifications).
  // OPTIONAL for the same reason as lastReadAt above.
  settings: co.map({
    appearance: co.map({
      theme: z.enum(["light", "dark"]),
      accent: z.enum(["tokyo", "violet", "teal", "lime", "amber", "rose"]),
    }),
    notifications: co.map({
      sound: z.boolean(),
      browser: z.boolean(),
    }),
  }).optional(),
  // Unit 2 — device pairing approval gate. All pending EphemeralPairings are
  // pushed here so every logged-in trusted device on the account can surface
  // the approval prompt. OPTIONAL so pre-Unit-2 accounts don't break.
  pendingPairings: co.list(EphemeralPairing).optional(),
  // Unit 1 — local list of ConnectionRequest IDs the recipient dismissed
  // without acting. The shared CoValue is never mutated; requester sees nothing.
  // OPTIONAL for back-compat with pre-Unit-1 accounts (backfill below).
  dismissedRequestIDs: co.list(z.string()).optional(),
  // Unit 1 Phase 10 — live invitations created by this user for the management
  // screen. OPTIONAL for back-compat with pre-Phase-10 accounts (backfill below).
  liveInvitations: co.list(Invitation).optional(),
  // Unit 9-0 — durable store of incoming ConnectionRequests delivered via the
  // recipient's Inbox. jazz-tools Inbox.subscribe is one-shot+destructive (it
  // marks each message `processed` in a persisted stream after first delivery),
  // so surfacing requests via ephemeral component-local state lost them on the
  // /connections/pending full reload. A single app-level subscription (now
  // useInboxDispatcher) drains the inbox into durable account state once;
  // readers (the prompt + the pending route) read from there and survive
  // reloads.
  // OPTIONAL for back-compat with pre-Unit-9 accounts (backfill below).
  incomingRequests: co.list(ConnectionRequest).optional(),
  // ── Contact-robustness slice (2026-07-20) ──────────────────────────────
  // Keyed-record replacements for the fragile CoLists (Jazz canon: duplicate-
  // sensitive facts live in co.records — per-key LWW instead of concurrent-
  // append duplication). NEW FIELD NAMES, not in-place list→record changes:
  // the old fields' refs point at raw CoLists that a co.record schema cannot
  // wrap. Old fields stay (write-frozen) for the migration backfill to read;
  // removal is a later slice. All optional per the lastReadAt lesson above.
  //
  // contacts — THE contact book. Key: contact's account ID.
  contacts: co.record(z.string(), Contact).optional(),
  // incomingConnectionRequests — durable drain target. Key: request CoValue ID
  // (same-key writes from racing drains converge instead of duplicating, FM2).
  incomingConnectionRequests: co.record(z.string(), ConnectionRequest).optional(),
  // outgoingRequests — durable outbound-request memory (FM1/FM3/FM4).
  // Key: counterpart account ID.
  outgoingRequests: co.record(z.string(), OutgoingConnectionRequest).optional(),
  // dismissedRequests — replaces dismissedRequestIDs. Key: request CoValue ID.
  dismissedRequests: co.record(z.string(), z.boolean()).optional(),
  // pendingNotifications — outbound conversation/member-add notification retry
  // state. Key: `${conversationID}:${targetAccountID}`.
  pendingNotifications: co.record(z.string(), PendingNotification).optional(),
});

export const ArcanAccount = co.account({
  profile: co.profile({
    displayName: z.string(),
    bio: z.string().optional(),
    avatar: FileBlob.optional(),
  }),
  root: ArcanAccountRoot,
}).withMigration(async (me, creationProps) => {
  /**
   * Migration: runs on every node startup (both new and existing accounts).
   * All branches MUST be idempotent — guarded with me.$jazz.has() checks.
   *
   * Sequence:
   * 1. Initialize profile with a publicly-readable Group so contacts can see
   *    the user's display name. The Group is created and "everyone" granted
   *    "reader" access before the profile is assigned.
   * 2. Initialize root with account-private ownership (only `me` as owner).
   *
   * creationProps is `{ name: string }` on first creation (from signUp),
   * and `undefined` on subsequent node startups.
   */

  // -- 1. Profile initialization --
  if (!me.$jazz.has("profile")) {
    const profileGroup = Group.create({ owner: me });
    profileGroup.addMember("everyone", "reader");

    const displayName = creationProps?.name ?? "Anonymous";

    me.$jazz.set(
      "profile",
      co
        .profile({
          displayName: z.string(),
          bio: z.string().optional(),
          avatar: FileBlob.optional(),
        })
        .create(
          { name: displayName, displayName },
          profileGroup,
        ),
    );
  }

  // -- 2. Root initialization --
  if (!me.$jazz.has("root")) {
    const contactBook = ContactBook.create([], { owner: me });
    const devices = co.list(DeviceRecord).create([], { owner: me });
    const knownConversations = co.list(Conversation).create([], { owner: me });
    const pendingPairings = co.list(EphemeralPairing).create([], { owner: me });
    const lastReadAt = co
      .record(z.string(), z.number())
      .create({} as Record<string, number>, { owner: me });
    const settings = co
      .map({
        appearance: co.map({
          theme: z.enum(["light", "dark"]),
          accent: z.enum(["tokyo", "violet", "teal", "lime", "amber", "rose"]),
        }),
        notifications: co.map({ sound: z.boolean(), browser: z.boolean() }),
      })
      .create(
        {
          appearance: co
            .map({
              theme: z.enum(["light", "dark"]),
              accent: z.enum(["tokyo", "violet", "teal", "lime", "amber", "rose"]),
            })
            .create({ theme: "dark", accent: "tokyo" }, { owner: me }),
          notifications: co
            .map({ sound: z.boolean(), browser: z.boolean() })
            .create({ sound: true, browser: false }, { owner: me }),
        },
        { owner: me },
      );
    const dismissedRequestIDs = co.list(z.string()).create([], { owner: me });
    const liveInvitations = co.list(Invitation).create([], { owner: me });
    const incomingRequests = co.list(ConnectionRequest).create([], { owner: me });
    const contacts = co
      .record(z.string(), Contact)
      .create({}, { owner: me });
    const incomingConnectionRequests = co
      .record(z.string(), ConnectionRequest)
      .create({}, { owner: me });
    const outgoingRequests = co
      .record(z.string(), OutgoingConnectionRequest)
      .create({}, { owner: me });
    const dismissedRequests = co
      .record(z.string(), z.boolean())
      .create({}, { owner: me });
    const pendingNotifications = co
      .record(z.string(), PendingNotification)
      .create({}, { owner: me });

    me.$jazz.set(
      "root",
      ArcanAccountRoot.create(
        {
          contactBook,
          devices,
          knownConversations,
          pendingPairings,
          lastReadAt,
          settings,
          dismissedRequestIDs,
          liveInvitations,
          incomingRequests,
          contacts,
          incomingConnectionRequests,
          outgoingRequests,
          dismissedRequests,
          pendingNotifications,
        },
        { owner: me },
      ),
    );
    // First DeviceRecord for the signup device is pushed by the self-register
    // block (step 2d) below — same code path used for paired devices.
  }

  // -- 2b. knownConversations backfill (existing accounts) --
  // For accounts that already have root (created before Slice 3b), initialize
  // knownConversations if not yet present.
  //
  // Guard: me.root.$jazz.set is only available when me.root is a fully-loaded
  // CoMap. In the withLoadedAccount migration path the root may be a partial
  // proxy whose $jazz only exposes { id, loadingState } (no set method).
  // Checking typeof ensures we don't throw on partially-loaded roots; the
  // backfill will run again on the next load once the root is resolved.
  if (
    me.root &&
    !(me.root as any).knownConversations &&
    typeof (me.root as any).$jazz?.set === "function"
  ) {
    (me.root as any).$jazz.set(
      "knownConversations",
      co.list(Conversation).create([], { owner: me }),
    );
  }

  // -- 2c. lastReadAt + settings backfill (existing accounts) --
  // lastReadAt is a Slice 8 addition; settings replaces the old notificationPrefs
  // field from Slice 8 (Unit 7 destructive baseline). Same guard pattern as the
  // knownConversations backfill — runs only when me.root is a fully-loaded CoMap.
  //
  // For lastReadAt: seed with per-conversation latest-message timestamps
  // so the user's existing conversations don't all appear unread on first
  // sign-in post-migration. The user effectively "read everything that
  // existed at migration time"; only newer messages count as unread.
  // Empty conversations (or those whose messages aren't yet resolved
  // when the migration runs) default to Date.now() — same effect.
  if (
    me.root &&
    !(me.root as any).lastReadAt &&
    typeof (me.root as any).$jazz?.set === "function"
  ) {
    const initialLastRead: Record<string, number> = {};
    const knownConvs = (me.root as any).knownConversations ?? [];
    const now = Date.now();
    for (const conv of knownConvs) {
      const cid = conv?.$jazz?.id;
      if (typeof cid !== "string") continue;
      let latest = 0;
      for (const m of conv?.messages ?? []) {
        const ts =
          m?.sentAt instanceof Date
            ? m.sentAt.getTime()
            : new Date(m?.sentAt ?? 0).getTime();
        if (ts > latest) latest = ts;
      }
      initialLastRead[cid] = latest > 0 ? latest : now;
    }
    (me.root as any).$jazz.set(
      "lastReadAt",
      co
        .record(z.string(), z.number())
        .create(initialLastRead, { owner: me }),
    );
  }
  // -- 2c. settings backfill (existing accounts) --
  // Per the destructive baseline this is a clean rebuild; backfill still runs
  // defensively so any in-flight dev accounts pick up the new shape.
  if (
    me.root &&
    typeof (me.root as any).$jazz?.set === "function" &&
    !(me.root as any).settings
  ) {
    const settings = co
      .map({
        appearance: co.map({
          theme: z.enum(["light", "dark"]),
          accent: z.enum(["tokyo", "violet", "teal", "lime", "amber", "rose"]),
        }),
        notifications: co.map({ sound: z.boolean(), browser: z.boolean() }),
      })
      .create(
        {
          appearance: co
            .map({
              theme: z.enum(["light", "dark"]),
              accent: z.enum(["tokyo", "violet", "teal", "lime", "amber", "rose"]),
            })
            .create({ theme: "dark", accent: "tokyo" }, { owner: me }),
          notifications: co
            .map({ sound: z.boolean(), browser: z.boolean() })
            .create({ sound: true, browser: false }, { owner: me }),
        },
        { owner: me },
      );
    (me.root as any).$jazz.set("settings", settings);
  }

  // -- 2d. pendingPairings backfill (existing accounts) --
  // Unit 2 addition. Same guard pattern as the other backfills.
  if (
    me.root &&
    typeof (me.root as any).$jazz?.set === "function" &&
    !(me.root as any).pendingPairings
  ) {
    (me.root as any).$jazz.set(
      "pendingPairings",
      co.list(EphemeralPairing).create([], { owner: me }),
    );
  }

  // -- 2e. dismissedRequestIDs backfill (existing accounts) --
  // Unit 1 addition; same guard pattern as the settings backfill above.
  if (
    me.root &&
    typeof (me.root as any).$jazz?.set === "function" &&
    !(me.root as any).dismissedRequestIDs
  ) {
    (me.root as any).$jazz.set(
      "dismissedRequestIDs",
      co.list(z.string()).create([], { owner: me }),
    );
  }

  // -- 2f. liveInvitations backfill (existing accounts) --
  // Unit 1 Phase 10 addition; same guard pattern as the dismissedRequestIDs backfill.
  if (
    me.root &&
    typeof (me.root as any).$jazz?.set === "function" &&
    !(me.root as any).liveInvitations
  ) {
    (me.root as any).$jazz.set(
      "liveInvitations",
      co.list(Invitation).create([], { owner: me }),
    );
  }

  // -- 2h. incomingRequests backfill (existing accounts) --
  // Unit 9-0 addition; same guard pattern as the liveInvitations backfill.
  if (
    me.root &&
    typeof (me.root as any).$jazz?.set === "function" &&
    !(me.root as any).incomingRequests
  ) {
    (me.root as any).$jazz.set(
      "incomingRequests",
      co.list(ConnectionRequest).create([], { owner: me }),
    );
  }

  // -- 2i. contacts (list → keyed record) backfill — contact-robustness slice.
  // Guarded by field absence like every other backfill. On ANY failure we
  // skip WITHOUT setting the field — the migration reruns on next startup
  // and retries (same recovery contract as block 2g).
  //
  // RAW-SCAN MECHANISM (falsy-entry fix, 2026-07-22) — do NOT "simplify"
  // this back to a deep ensureLoaded of the list: a falsy (null) raw entry
  // in the legacy CoList makes `contactBook: { $each: { $onError: "catch" } }`
  // REJECT in jazz-tools 0.20.18. SubscriptionScope.loadCoListKey
  // (node_modules/jazz-tools/src/tools/subscribe/SubscriptionScope.ts:1117-1129)
  // files an index-keyed "ref on position N is required but missing"
  // validation error that $onError: "catch" CANNOT suppress — unlike
  // loadCoMapKey (:1047-1055), which pre-adds caught keys to skipInvalidKeys,
  // loadCoListKey never adds index keys. One raw null therefore wedged this
  // backfill on EVERY startup: `contacts` never got created and the account
  // stayed migration-pending forever (live-account bug). $onError only ever
  // suppressed entries that DID resolve but errored (unavailable children) —
  // it never covered falsy raw entries.
  //
  // Mechanism: shallow-load the list CoValue only, filter its raw id array
  // to ref-shaped strings (drops null/bogus poisons), then load each entry
  // individually with Contact.load — which SETTLES (never throws); a
  // never-synced/unavailable entry comes back not-loaded and is dropped by
  // the $isLoaded filter (note: dropped entries are stubs/not-loaded values,
  // NOT nulls). Skipped entries heal on a later launch via the startup
  // reconcile pass (reconcileLegacyContacts in handshake.ts), pin copied
  // verbatim.
  // Dedup policy lives in planContactMigration (unit-tested): latest entry
  // wins per account ID, EXCEPT fingerprint conflicts where the OLDEST pin
  // is kept (TOFU) and the conflict is flagged on the kept Contact.
  if (
    me.root &&
    typeof (me.root as any).$jazz?.set === "function" &&
    !(me.root as any).contacts
  ) {
    try {
      const loaded = await me.$jazz.ensureLoaded({
        resolve: { root: { contactBook: true } },
      });
      const rawIDs = (
        ((loaded.root as any).contactBook?.$jazz.raw.asArray() ??
          []) as unknown[]
      ).filter(
        (v): v is string => typeof v === "string" && v.startsWith("co_"),
      );
      const entries = (
        await Promise.all(
          rawIDs.map((id) => Contact.load(id, { loadAs: me })),
        )
      ).filter((c: any) => c?.$isLoaded === true) as any[];
      // The planner's views mapping below drops any remaining malformed
      // shapes (non-string IDs/pins); plan indexes stay consistent because
      // they are taken over THIS loaded-and-filtered array.
      const views = entries
        .map((c, index) => ({
          contactAccountID: c?.contactAccountID as string,
          pinnedFingerprint: c?.pinnedFingerprint as string,
          addedAtMs: (() => { const t = new Date(c.addedAt).getTime(); return c?.addedAt && Number.isFinite(t) ? t : 0; })(),
          index,
        }))
        .filter(
          (v) =>
            typeof v.contactAccountID === "string" &&
            typeof v.pinnedFingerprint === "string",
        );
      const plan = planContactMigration(views);
      const record = co
        .record(z.string(), Contact)
        .create({}, { owner: me });
      for (const [accountID, index] of Object.entries(
        plan.keepIndexByAccountID,
      )) {
        const kept = entries[index];
        const conflict = plan.conflictByAccountID[accountID];
        if (conflict && typeof kept?.$jazz?.set === "function") {
          kept.$jazz.set("fingerprintConflict", true);
          kept.$jazz.set(
            "conflictingFingerprint",
            conflict.observedFingerprint,
          );
        }
        record.$jazz.set(accountID, kept);
      }
      (me.root as any).$jazz.set("contacts", record);
    } catch (e) {
      console.warn("[migration] contacts backfill skipped (will retry):", e);
    }
  }

  // -- 2j. incomingConnectionRequests (list → keyed record) backfill.
  // Keyed by request CoValue ID — historical drain-race duplicates (FM2)
  // collapse automatically because same-key sets converge.
  if (
    me.root &&
    typeof (me.root as any).$jazz?.set === "function" &&
    !(me.root as any).incomingConnectionRequests
  ) {
    try {
      // RAW-SCAN MECHANISM — same falsy-entry fix as block 2i (2026-07-22),
      // see the full rationale there: a null raw entry in the legacy CoList
      // makes a deep `$each: { $onError: "catch" }` resolve REJECT
      // (loadCoListKey files an uncatchable index-keyed validation error),
      // wedging this backfill forever — the field stays absent and the inbox
      // drain never starts. Shallow-load the list, filter raw ids, load each
      // request individually (settles, never throws), keep loaded ones.
      // Dropping an unloadable request is acceptable because requests expire
      // in ≤7 days; unlike 2i (TOFU pins = security state, healed later by
      // reconcileLegacyContacts), requests need no reconcile net.
      const loaded = await me.$jazz.ensureLoaded({
        resolve: { root: { incomingRequests: true } },
      });
      const rawIDs = (
        ((loaded.root as any).incomingRequests?.$jazz.raw.asArray() ??
          []) as unknown[]
      ).filter(
        (v): v is string => typeof v === "string" && v.startsWith("co_"),
      );
      const entries = (
        await Promise.all(
          rawIDs.map((id) => ConnectionRequest.load(id, { loadAs: me })),
        )
      ).filter((r: any) => r?.$isLoaded === true) as any[];
      const record = co
        .record(z.string(), ConnectionRequest)
        .create({}, { owner: me });
      for (const r of entries) {
        record.$jazz.set(r.$jazz.id as string, r);
      }
      (me.root as any).$jazz.set("incomingConnectionRequests", record);
    } catch (e) {
      console.warn(
        "[migration] incomingConnectionRequests backfill skipped (will retry):",
        e,
      );
    }
  }

  // -- 2k. dismissedRequests (string list → keyed record) backfill.
  if (
    me.root &&
    typeof (me.root as any).$jazz?.set === "function" &&
    !(me.root as any).dismissedRequests
  ) {
    try {
      const loaded = await me.$jazz.ensureLoaded({
        resolve: { root: { dismissedRequestIDs: true } },
      });
      const record = co
        .record(z.string(), z.boolean())
        .create({}, { owner: me });
      for (const id of Array.from(
        (loaded.root as any).dismissedRequestIDs ?? [],
      ) as string[]) {
        if (typeof id === "string") record.$jazz.set(id, true);
      }
      (me.root as any).$jazz.set("dismissedRequests", record);
    } catch (e) {
      console.warn(
        "[migration] dismissedRequests backfill skipped (will retry):",
        e,
      );
    }
  }

  // -- 2l. outgoingRequests + pendingNotifications init (no historical data
  // exists for either — spec §5 accepts that pre-slice outbound requests are
  // unrecoverable).
  if (
    me.root &&
    typeof (me.root as any).$jazz?.set === "function" &&
    !(me.root as any).outgoingRequests
  ) {
    (me.root as any).$jazz.set(
      "outgoingRequests",
      co.record(z.string(), OutgoingConnectionRequest).create({}, { owner: me }),
    );
  }
  if (
    me.root &&
    typeof (me.root as any).$jazz?.set === "function" &&
    !(me.root as any).pendingNotifications
  ) {
    (me.root as any).$jazz.set(
      "pendingNotifications",
      co.record(z.string(), PendingNotification).create({}, { owner: me }),
    );
  }

  // -- 2g. Self-register the current device's session --
  // Runs on every node startup. The root-init branch above pushes a
  // DeviceRecord only at account creation, so devices paired later (via
  // QR pairing or any future onboarding flow that authenticates against
  // an existing root) would otherwise never appear in Settings → Devices.
  //
  // Idempotent: matches by sessionFingerprint, which is stable per
  // (device + account + localStorage) per src/auth/session.ts. Skips if
  // the current session already has a record.
  //
  // Awaits an explicit ensureLoaded so we can safely iterate `devices`
  // and push to it — without this the list may be a NotLoaded proxy at
  // migration time, leading to a false "no existing record" read and a
  // duplicate push on the next startup.
  try {
    const loaded = await me.$jazz.ensureLoaded({
      resolve: { root: { devices: { $each: true } } },
    });
    const sid = getCurrentSessionFingerprint(me);
    const devices = loaded.root.devices;
    const already = devices.find((d) => d?.sessionFingerprint === sid);
    if (!already) {
      const now = new Date();
      const ua =
        typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
      devices.$jazz.push(
        DeviceRecord.create(
          {
            label: deriveDeviceLabel(ua),
            addedAt: now,
            lastSeenAt: now,
            sessionFingerprint: sid,
            revoked: false,
          },
          { owner: me },
        ),
      );
    }
  } catch (e) {
    console.warn("[devices] self-register skipped:", e);
    // Non-fatal: the migration runs again on next startup and will retry.
  }

  // -- 3. Inbox initialization --
  // NOTE: contrary to an earlier comment here, Inbox.load() does NOT create the
  // inbox if it is missing — in jazz-tools 0.20.18 it throws when
  // me.profile.inbox is unset. The inbox CoValue is created by the jazz-tools
  // account/profile bootstrap (co.profile() seeds the `inbox` slot), so by the
  // time this migration step runs on a freshly-initialised profile the inbox
  // already exists and Inbox.load() merely returns it. Running on every startup
  // is a cheap idempotent verification that the inbox resolves; failures are
  // non-fatal and retried on the next startup.
  try {
    await Inbox.load(me);
  } catch (e) {
    console.warn("[inbox] Failed to load inbox on migration:", e);
    // Non-fatal: subsequent app bootstrap will retry
  }

});

/**
 * Derives a human-readable device label from a User-Agent string.
 * Returns a string like "Firefox browser", "Chrome browser", etc.
 */
export function deriveDeviceLabel(ua: string): string {
  if (/Firefox\//i.test(ua)) return "Firefox browser";
  if (/Edg\//i.test(ua)) return "Edge browser";
  if (/OPR\//i.test(ua)) return "Opera browser";
  if (/Chrome\//i.test(ua)) return "Chrome browser";
  if (/Safari\//i.test(ua)) return "Safari browser";
  return "Web browser";
}
