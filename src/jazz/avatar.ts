import type { Account, Group } from "jazz-tools";
import { uploadAttachment } from "@/jazz/attachments";

/**
 * Set the user's profile avatar. Replaces any prior avatar.
 *
 * Owner of the new FileBlob is the profile's owning group (= the account's
 * profile group). Prior FileBlob CoValues become unreferenced — same caveat
 * as deleted-message attachments (see NOX-21).
 */
export async function setProfileAvatar(me: Account, file: File): Promise<void> {
  const profileGroup = (me as any).profile.$jazz.owner as Group;
  const blob = await uploadAttachment(profileGroup, file);
  (me as any).profile.$jazz.set("avatar", blob);
}

/**
 * Remove the user's profile avatar. The prior FileBlob remains in storage
 * (Jazz append-only); the field is just cleared from the current view.
 */
export async function clearProfileAvatar(me: Account): Promise<void> {
  (me as any).profile.$jazz.delete("avatar");
}
