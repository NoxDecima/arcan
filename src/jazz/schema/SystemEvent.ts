import { co, z } from "jazz-tools";

/**
 * A membership-related event captured in the conversation's sidecar log.
 *
 * Events are written by the actor performing the action:
 *   - admin adding/removing/promoting a member writes their own event
 *   - a leaver writes their own "left" event BEFORE self-revoking (otherwise
 *     they would lose write permission and the event couldn't land)
 *
 * The log is application-level: a determined actor calling cojson directly
 * could change membership without writing an event. This is consistent with
 * the trust-circle threat model — the log is for UX clarity, not security.
 *
 * `targetAccountID` is omitted for kind="left" (actor IS target).
 */
export const SystemEvent = co.map({
  kind: z.enum(["added", "removed", "left", "promoted", "renamed"]),
  actorAccountID: z.string(),
  targetAccountID: z.string().optional(),
  newTitle: z.string().optional(),
  occurredAt: z.date(),
});
