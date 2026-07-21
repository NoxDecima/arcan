import { co, z } from "jazz-tools";
import { ConnectionRequest } from "./ConnectionRequest";

/**
 * OutgoingConnectionRequest: durable record of a connection request THIS
 * account sent (contact-robustness slice, FM1/FM3/FM4). Lives in
 * me.root.outgoingRequests, a co.record keyed by counterpart account ID —
 * per-key LWW makes "one pending request per counterpart" structural.
 *
 * The counterpart identity (fingerprint + display name) is snapshotted at
 * send time — from the Invitation (invite channel) or the co-member's live
 * profile + pubkey (group channel) — because the ConnectionRequest CoValue
 * only carries the REQUESTER's identity, and the approval watcher needs the
 * counterpart's identity to write the Contact after approval (TOFU pin at
 * request time, per threat model §6).
 *
 * status lifecycle: pending → approved | denied | expired (terminal), or
 * pending → failed → pending (watcher re-send). archivedAt hides the entry
 * from active watching once terminal.
 */
export const OutgoingConnectionRequest = co.map({
  request: ConnectionRequest,
  counterpartAccountID: z.string(),
  counterpartFingerprint: z.string(),
  counterpartDisplayName: z.string(),
  channel: z.enum(["invite", "group"]),
  sentAt: z.date(),
  // Set when the Inbox end-to-end ack resolved ("delivered" UI state).
  deliveredAt: z.date().optional(),
  status: z.enum(["pending", "approved", "denied", "failed", "expired"]),
  archivedAt: z.date().optional(),
});
