import { co, z } from "jazz-tools";

/**
 * FileBlob: metadata envelope around a Jazz FileStream (BinaryCoStream equivalent in 0.20.18).
 *
 * Deviation from plan: jazz-tools 0.20.18 does not expose `BinaryCoStream` directly as a co.ref
 * target in the zod-schema API. The equivalent is `co.fileStream()`, which wraps Jazz's
 * built-in FileStream class. `data` is therefore typed as `co.fileStream()` rather than
 * `co.ref(BinaryCoStream)`.
 */
export const FileBlob = co.map({
  mimeType: z.string(),
  size: z.number(),
  filename: z.string().optional(),
  data: co.fileStream(),
  // Intrinsic pixel dimensions of image attachments, captured at upload
  // (feedback round 5). Optional FOREVER: required-field validation runs
  // before migration backfill visibility, and legacy attachments have none.
  // Consumers (grid aspect, placeholder reservation) treat absence as
  // "unknown" and fall back to fixed layout.
  width: z.number().optional(),
  height: z.number().optional(),
});
