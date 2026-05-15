import { co, z } from "jazz-tools";
import { FileBlob } from "./FileBlob";

/**
 * MessangerProfile: the user-visible profile stored in each account.
 *
 * Named MessangerProfile to avoid collision with the jazz-tools built-in
 * `Profile` export. The account schema will reference this under the
 * `profile` key via co.profile().
 *
 * Deviation from plan: jazz-tools 0.20.18 uses co.map() schema objects
 * instead of `class Profile extends CoMap`. Optional CoValue refs use
 * `schema.optional()` (e.g. `FileBlob.optional()`), while optional
 * primitives use Zod's `.optional()` method on the zod schema.
 */
export const MessangerProfile = co.map({
  displayName: z.string(),
  bio: z.string().optional(),
  avatar: FileBlob.optional(),
});
