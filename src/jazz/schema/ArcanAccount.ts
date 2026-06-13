import { co, z, Group, Inbox } from "jazz-tools";
import { ContactBook } from "./Contact";
import { DeviceRecord } from "./DeviceRecord";
import { EphemeralPairing } from "./EphemeralPairing";
import { Invitation } from "./Invitation";
import { Conversation } from "./Conversation";
import { FileBlob } from "./FileBlob";
import { getCurrentSessionFingerprint } from "@/auth/session";

/**
 * ArcanAccount: the root account schema for the application.
 *
 * IMPORTANT DEVIATION FROM PLAN:
 * jazz-tools 0.20.18 `co.account()` accepts only `{ profile, root }` as
 * its shape (enforced by `BaseAccountShape`). The plan's top-level account
 * fields (`contactBook`, `devices`, `invitesIssued`) cannot be direct keys
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
  invitesIssued: co.list(Invitation),
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
    const invitesIssued = co.list(Invitation).create([], { owner: me });
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
            .create({ sound: false, browser: false }, { owner: me }),
        },
        { owner: me },
      );

    me.$jazz.set(
      "root",
      ArcanAccountRoot.create(
        {
          contactBook,
          devices,
          invitesIssued,
          knownConversations,
          pendingPairings,
          lastReadAt,
          settings,
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
            .create({ sound: false, browser: false }, { owner: me }),
        },
        { owner: me },
      );
    (me.root as any).$jazz.set("settings", settings);
  }

  // -- 2e. pendingPairings backfill (existing accounts) --
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

  // -- 2d. Self-register the current device's session --
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
  // Inbox.load is idempotent: creates the inbox if missing, returns existing
  // if already present. The framework writes the inbox CoValue ID to
  // me.profile.inbox automatically. Running on every startup ensures existing
  // accounts (created before this migration step was added) also get an inbox.
  try {
    await Inbox.load(me);
  } catch (e) {
    console.warn("[inbox] Failed to load/create inbox on migration:", e);
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
