import { co } from "jazz-tools";
import type { Group } from "jazz-tools";
import { FileBlob } from "@/jazz/schema/FileBlob";

export const MAX_ATTACHMENT_BYTES = 5_000_000;

export class AttachmentTooLargeError extends Error {
  readonly filename: string;
  readonly size: number;
  constructor(filename: string, size: number) {
    super(
      `${filename} is ${(size / 1_000_000).toFixed(1)} MB. Max 5 MB per attachment.`,
    );
    this.name = "AttachmentTooLargeError";
    this.filename = filename;
    this.size = size;
  }
}

/**
 * Upload a file as a Jazz FileBlob owned by the given group.
 *
 * Caller is responsible for passing the correct owning group:
 * - Message attachments → author's per-message WriteGroup.
 * - Profile avatar → the profile's owning group (me.profile.$jazz.owner).
 *
 * Throws AttachmentTooLargeError when file.size > MAX_ATTACHMENT_BYTES.
 * Throws on Jazz/network errors (caller surfaces).
 */
export async function uploadAttachment(
  owner: Group,
  file: File,
): Promise<any> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentTooLargeError(file.name, file.size);
  }
  const stream = await co.fileStream().createFromBlob(file, { owner });
  const blob = FileBlob.create(
    {
      mimeType: file.type,
      size: file.size,
      filename: file.name,
      data: stream,
    },
    { owner },
  );
  return blob;
}
