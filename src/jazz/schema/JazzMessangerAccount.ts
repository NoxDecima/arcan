import { co, z, Group, Inbox } from "jazz-tools";
import { ContactBook } from "./Contact";
import { DeviceRecord } from "./DeviceRecord";
import { Invitation } from "./Invitation";
import { Conversation } from "./Conversation";
import { FileBlob } from "./FileBlob";
import { getCurrentSessionFingerprint } from "@/auth/session";

/**
 * JazzMessangerAccount: the root account schema for the application.
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
 * - `class JazzMessangerAccount extends Account` → `co.account({...})`
 * - `co.ref(Profile)` → profile slot becomes `co.profile({...})`
 * - `co.ref(ContactBook)` etc. → moved into root map
 */
export const JazzMessangerAccountRoot = co.map({
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
  // Slice 8 — per-account notification preferences. Both default to
  // false (off) until the user explicitly enables.
  // OPTIONAL for the same reason as lastReadAt above.
  notificationPrefs: co
    .map({
      sound: z.boolean(),
      browser: z.boolean(),
    })
    .optional(),
});

export const JazzMessangerAccount = co.account({
  profile: co.profile({
    displayName: z.string(),
    bio: z.string().optional(),
    avatar: FileBlob.optional(),
  }),
  root: JazzMessangerAccountRoot,
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
    const lastReadAt = co
      .record(z.string(), z.number())
      .create({} as Record<string, number>, { owner: me });
    const notificationPrefs = co
      .map({ sound: z.boolean(), browser: z.boolean() })
      .create({ sound: false, browser: false }, { owner: me });

    me.$jazz.set(
      "root",
      JazzMessangerAccountRoot.create(
        {
          contactBook,
          devices,
          invitesIssued,
          knownConversations,
          lastReadAt,
          notificationPrefs,
        },
        { owner: me },
      ),
    );

    // Add a device record for the device on which the account was created.
    // This runs only once (guarded by the has("root") check above).
    // sessionFingerprint uses the Jazz SessionID, which is stable for the
    // current device+account pair across page reloads (until local storage
    // is cleared or the user logs out). See src/auth/session.ts.
    const now = new Date();
    const ua =
      typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
    const label = deriveDeviceLabel(ua);
    devices.$jazz.push(
      DeviceRecord.create(
        {
          label,
          addedAt: now,
          lastSeenAt: now,
          sessionFingerprint: getCurrentSessionFingerprint(me),
          revoked: false,
        },
        { owner: me },
      ),
    );
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

  // -- 2c. lastReadAt + notificationPrefs backfill (existing accounts) --
  // Both fields are Slice 8 additions; pre-Slice-8 accounts have me.root
  // but neither field. Same guard pattern as the knownConversations
  // backfill — runs only when me.root is a fully-loaded CoMap.
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
  if (
    me.root &&
    !(me.root as any).notificationPrefs &&
    typeof (me.root as any).$jazz?.set === "function"
  ) {
    (me.root as any).$jazz.set(
      "notificationPrefs",
      co
        .map({ sound: z.boolean(), browser: z.boolean() })
        .create({ sound: false, browser: false }, { owner: me }),
    );
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
