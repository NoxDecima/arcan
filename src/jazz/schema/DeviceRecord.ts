import { co, z } from "jazz-tools";

/**
 * DeviceRecord: tracks a registered device for an account.
 *
 * Deviation from plan: uses co.map() / z.* functional API instead of
 * `class DeviceRecord extends CoMap`.
 */
export const DeviceRecord = co.map({
  label: z.string(),
  addedAt: z.date(),
  lastSeenAt: z.date(),
  sessionFingerprint: z.string(),
  revoked: z.boolean(),
});
