import { co, z } from "jazz-tools";

/**
 * Invitation: an invite record created by one account for another.
 *
 * Deviation from plan: uses co.map() / z.* functional API instead of
 * `class Invitation extends CoMap`.
 */
export const Invitation = co.map({
  inviterAccountID: z.string(),
  inviterFingerprint: z.string(),
  inviterDisplayName: z.string(),
  createdAt: z.date(),
  expiresAt: z.date(),
  recipientAccountID: z.string().optional(),
  recipientFingerprint: z.string().optional(),
  recipientDisplayName: z.string().optional(),
  acceptedAt: z.date().optional(),
  consumed: z.boolean(),
});
