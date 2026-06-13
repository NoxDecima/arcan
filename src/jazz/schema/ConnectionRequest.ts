import { co, z } from "jazz-tools";
import { FileBlob } from "./FileBlob";

export const ConnectionRequest = co.map({
  requesterAccountID: z.string(),
  requesterFingerprint: z.string(),
  requesterDisplayName: z.string(),
  requesterAvatar: FileBlob.optional(),
  recipientAccountID: z.string(),
  channel: z.enum(["qr", "link", "group"]),
  invitationID: z.string().optional(),
  createdAt: z.date(),
  expiresAt: z.date(),
  approvedAt: z.date().optional(),
});
