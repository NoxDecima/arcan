import { Link } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import type { Account } from "jazz-tools";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Button } from "@/components/ui/button";
import { getCurrentSessionFingerprint } from "@/auth/session";
import { Skel } from "@/components/skeleton";

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
      <section data-testid="devices-section-loading">
        <h2 className="text-base font-semibold text-text mb-2">devices</h2>
        <ul className="bg-panel rounded border border-hairline divide-y divide-hairline">
          {[0, 1].map((i) => (
            <li key={i} className="px-4 py-3 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <Skel w={140} h={12} />
                <Skel w={90} h={10} />
              </div>
              <Skel w={72} h={28} r={6} />
            </li>
          ))}
        </ul>
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
      "Forget this device? It stays hidden from your list, but anything already synced to it remains readable. Full cryptographic revocation lands in a later release."
    );
    if (!confirmed) return;
    (device as any).$jazz.set("revoked", true);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold text-text">devices</h2>
        <Button asChild variant="outline" size="sm" data-testid="link-new-device-btn">
          <Link to="/pair?role=initiator">link new device</Link>
        </Button>
      </div>
      <ul
        data-testid="device-list"
        className="bg-panel rounded border border-hairline divide-y divide-hairline"
      >
        {devices.length === 0 ? (
          <li className="px-4 py-3 text-sm text-dim">No devices found</li>
        ) : (
          devices.map((device, idx) => {
            const isCurrentDevice =
              currentFingerprint !== null &&
              (device as any).sessionFingerprint === currentFingerprint;
            return (
              <li key={idx} className="px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-text flex items-center gap-2">
                    {device.label}
                    {isCurrentDevice && (
                      <span
                        data-testid={`device-current-badge-${idx}`}
                        className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-panel-2 text-text-2 border border-hairline"
                      >
                        This device
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-dim">
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
                  forget
                </Button>
              </li>
            );
          })
        )}
      </ul>
      <p className="mt-4 text-xs text-dim leading-relaxed max-w-xl">
        Forgetting a device hides it here, but it can still read everything it has already synced.
        Full cryptographic revocation lands in the upcoming overhaul — see NOX-10.
      </p>
    </section>
  );
}
