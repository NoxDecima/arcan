import { co, z } from "jazz-tools";

export const Invitation = co.map({
  inviterAccountID: z.string(),
  inviterFingerprint: z.string(),
  inviterDisplayName: z.string(),
  channel: z.enum(["qr", "link"]),
  createdAt: z.date(),
  expiresAt: z.date().optional(),
  revokedAt: z.date().optional(),
});
