import { co, z } from "jazz-tools";

// NOTE: an optional `requesterAvatar: FileBlob` field existed here but was
// never populated by createConnectionRequest. The requester's avatar is
// resolved live from their profile via useAccountAvatars (same as message
// rows), so the snapshot field was dropped (2026-07-08). Old persisted
// requests carrying the key are unaffected — co.map ignores unknown keys.
export const ConnectionRequest = co.map({
  requesterAccountID: z.string(),
  requesterFingerprint: z.string(),
  requesterDisplayName: z.string(),
  recipientAccountID: z.string(),
  channel: z.enum(["qr", "link", "group"]),
  invitationID: z.string().optional(),
  createdAt: z.date(),
  expiresAt: z.date(),
  approvedAt: z.date().optional(),
  deniedAt: z.date().optional(),
});

/**
 * IncomingConnectionRequestsRecord: the durable inbox-drain target
 * (contact-robustness slice) — keyed by request CoValue ID so racing drains
 * converge by LWW (FM2). Single schema instance shared by ArcanAccountRoot's
 * `incomingConnectionRequests` field and the backfill/recovery runners —
 * defined HERE for the same cycle-freedom reason as Contact.ts's
 * ContactsRecord (backfill.ts may not import ArcanAccount).
 */
export const IncomingConnectionRequestsRecord = co.record(
  z.string(),
  ConnectionRequest,
);
