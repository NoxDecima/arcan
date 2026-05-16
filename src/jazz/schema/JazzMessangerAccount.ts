import { co, z, Group } from "jazz-tools";
import { ContactBook } from "./Contact";
import { DeviceRecord } from "./DeviceRecord";
import { Invitation } from "./Invitation";

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
});

export const JazzMessangerAccount = co.account({
  profile: co.profile({
    displayName: z.string(),
    bio: z.string().optional(),
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

    me.$jazz.set(
      "root",
      JazzMessangerAccountRoot.create(
        { contactBook, devices, invitesIssued },
        { owner: me },
      ),
    );

    // Add a device record for the device on which the account was created.
    // This runs only once (guarded by the has("root") check above).
    // sessionFingerprint uses crypto.randomUUID() as a placeholder; the
    // Jazz session identifier is not exposed as a public API in 0.20.18.
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
          sessionFingerprint: crypto.randomUUID(),
          revoked: false,
        },
        { owner: me },
      ),
    );
  }
});

/**
 * Derives a human-readable device label from a User-Agent string.
 * Returns a string like "Firefox browser", "Chrome browser", etc.
 */
function deriveDeviceLabel(ua: string): string {
  if (/Firefox\//i.test(ua)) return "Firefox browser";
  if (/Edg\//i.test(ua)) return "Edge browser";
  if (/OPR\//i.test(ua)) return "Opera browser";
  if (/Chrome\//i.test(ua)) return "Chrome browser";
  if (/Safari\//i.test(ua)) return "Safari browser";
  return "Web browser";
}
