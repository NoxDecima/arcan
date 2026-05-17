import { useEffect, useRef } from "react";
import { useAccount } from "jazz-tools/react";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { DeviceRecord } from "@/jazz/schema/DeviceRecord";
import { getCurrentSessionFingerprint } from "@/auth/session";
import { deriveDeviceLabel } from "@/jazz/schema/JazzMessangerAccount";
import { Sidebar } from "@/components/sidebar";
import { EmptyState } from "@/components/empty-state";

/**
 * HomeRoute: two-column layout with sidebar on the left and main content area
 * on the right.
 *
 * Navigation strategy: react-router-dom. No callback props — Sidebar uses
 * <Link to="/settings"> internally.
 *
 * Device registration: checks whether the current session fingerprint is
 * already present in me.root.devices. If not, pushes a new DeviceRecord.
 * This handles the case where a responder logs in via QR pairing — their
 * device is NOT added by withMigration (which only fires during account
 * creation, guarded by has("root")), so we register it here on first home
 * mount instead.
 *
 * If a matching record exists but is revoked (the user revoked this device
 * then re-paired it), un-revoke it and bump lastSeenAt so the device
 * reappears in the list. Session fingerprints are stable per (device,
 * account), so without this branch a re-paired revoked device would never
 * show up again.
 *
 * For existing non-revoked records, lastSeenAt is updated to now on each
 * home mount so the device list reflects accurate activity.
 *
 * A useRef guard prevents React StrictMode's double-effect from creating two
 * DeviceRecords in development.
 */
export function HomeRoute() {
  const me = useAccount(JazzMessangerAccount, {
    resolve: {
      root: { devices: { $each: true } },
    },
  });

  const registrationAttempted = useRef(false);

  useEffect(() => {
    if (!me.$isLoaded) return;
    if (registrationAttempted.current) return;
    registrationAttempted.current = true;

    try {
      const fingerprint = getCurrentSessionFingerprint(me);
      const now = new Date();

      const existing = me.root.devices.find(
        (d) => (d as any).sessionFingerprint === fingerprint,
      );

      if (!existing) {
        const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
        me.root.devices.$jazz.push(
          DeviceRecord.create(
            {
              label: deriveDeviceLabel(ua),
              addedAt: now,
              lastSeenAt: now,
              sessionFingerprint: fingerprint,
              revoked: false,
            },
            { owner: me },
          ),
        );
      } else {
        // Update last-seen; restore the record if it was previously revoked
        // (re-pairing a revoked device is a clear "I want it back" signal).
        if ((existing as any).revoked) {
          (existing as any).$jazz.set("revoked", false);
        }
        (existing as any).$jazz.set("lastSeenAt", now);
      }
    } catch {
      // getCurrentSessionFingerprint can throw if called on a non-local account;
      // this should never happen for `me` but guard defensively.
    }
  }, [me.$isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen">
      <Sidebar />

      <main
        data-testid="home-main"
        className="flex-1 flex flex-col bg-gray-50"
      >
        <EmptyState
          title="No conversations yet"
          description="Send an invite link to a friend to start your first conversation."
        />
      </main>
    </div>
  );
}
