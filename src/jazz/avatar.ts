import type { Account, Group } from "jazz-tools";
import { uploadAttachment } from "@/jazz/attachments";
import { updateConversationIcon } from "@/jazz/conversation";

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

/**
 * Resize an image File to a square `targetSize × targetSize` JPEG (cover crop).
 *
 * Uses canvas 2D; runs in the browser only. Output is type `image/jpeg` at
 * 0.85 quality, named `<original-stem>.jpg`. Returns the original file when
 * the input isn't an image (defensive — caller should already gate by type).
 *
 * Used by `setConversationIcon` and could be reused by `setProfileAvatar` in
 * a follow-up — both want 256px square uploads.
 */
export async function resizeImageToSquare(
  file: File,
  targetSize = 256,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = (e) => reject(e);
      el.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    // Cover-crop: scale so the shorter dimension fills the target, then center.
    const scale = Math.max(targetSize / img.width, targetSize / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const dx = (targetSize - drawW) / 2;
    const dy = (targetSize - drawH) / 2;
    ctx.drawImage(img, dx, dy, drawW, drawH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
    );
    if (!blob) return file;

    const stem = file.name.replace(/\.[^.]+$/, "") || "icon";
    return new File([blob], `${stem}.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Set a conversation's icon from a raw image File. Resizes client-side to
 * 256×256 (cover crop, JPEG) and uploads as a FileBlob owned by the
 * conversation's owning group, then assigns via `updateConversationIcon`.
 *
 * Mirrors `setProfileAvatar` for the conversation-icon case. Admin gating
 * is the caller's responsibility (UI gates this; cojson-level admin gating
 * for `conversation.icon` is a future trust-circle hardening item).
 */
export async function setConversationIcon(
  me: Account,
  conversation: any,
  file: File,
): Promise<void> {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }
  const resized = await resizeImageToSquare(file, 256);
  const blob = await uploadAttachment(conversationGroup, resized);
  await updateConversationIcon(me, conversation, blob);
}

/**
 * Clear a conversation's icon — reverts to the monogram fallback.
 */
export async function clearConversationIcon(
  me: Account,
  conversation: any,
): Promise<void> {
  await updateConversationIcon(me, conversation, null);
}
