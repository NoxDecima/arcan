import { Link } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import type { Account } from "jazz-tools";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Button } from "@/components/ui/button";
import { getCurrentSessionFingerprint } from "@/auth/session";

/**
 * DevicesSection: lists all registered (non-revoked) devices for the account.
 *
 * Soft revoke: flips device.revoked = true and hides the device from the list.
 * Full cryptographic revocation (account secret rotation) is deferred to E1.1.
 */
export function DevicesSection() {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { devices: { $each: true } } },
  });

  if (!me.$isLoaded) {
    return (
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-2">Devices</h2>
        <p className="text-sm text-gray-400">Loading…</p>
      </section>
    );
  }

  const allDevices = me.root.devices;
  // Filter out revoked devices from the displayed list
  const devices = allDevices.filter((d) => d && !d.revoked);

  // Get current session fingerprint to prevent revoking the current device
  let currentFingerprint: string | null = null;
  try {
    currentFingerprint = getCurrentSessionFingerprint(me as unknown as Account);
  } catch {
    // Non-local account — shouldn't happen here but guard defensively
  }

  function handleRevoke(idx: number) {
    const device = devices[idx];
    if (!device) return;
    const confirmed = confirm(
      "Revoke this device? It will be hidden from your list. Note: revocation is currently soft — the device may continue to function until full cryptographic revocation lands in a later release."
    );
    if (!confirmed) return;
    (device as any).$jazz.set("revoked", true);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold text-gray-800">Devices</h2>
        <Button asChild variant="outline" size="sm" data-testid="link-new-device-btn">
          <Link to="/pair?role=initiator">Link new device</Link>
        </Button>
      </div>
      <ul
        data-testid="device-list"
        className="bg-white rounded border border-gray-200 divide-y divide-gray-100"
      >
        {devices.length === 0 ? (
          <li className="px-4 py-3 text-sm text-gray-400">No devices found</li>
        ) : (
          devices.map((device, idx) => {
            const isCurrentDevice =
              currentFingerprint !== null &&
              (device as any).sessionFingerprint === currentFingerprint;
            return (
              <li key={idx} className="px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-gray-800 flex items-center gap-2">
                    {device.label}
                    {isCurrentDevice && (
                      <span
                        data-testid={`device-current-badge-${idx}`}
                        className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200"
                      >
                        This device
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-gray-500">
                    Added{" "}
                    {device.addedAt instanceof Date
                      ? device.addedAt.toLocaleDateString()
                      : new Date(device.addedAt).toLocaleDateString()}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid={`revoke-device-btn-${idx}`}
                  onClick={() => handleRevoke(idx)}
                  disabled={isCurrentDevice}
                  title={isCurrentDevice ? "This is your current device — use Sign out instead." : undefined}
                >
                  Revoke
                </Button>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
