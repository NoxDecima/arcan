import { co, z } from "jazz-tools";
import { MessangerProfile } from "./Profile";
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
});
