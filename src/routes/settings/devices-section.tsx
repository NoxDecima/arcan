import { useNavigate } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import type { Account } from "jazz-tools";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Button } from "@/components/ui/button";
import { getCurrentSessionFingerprint } from "@/auth/session";
import { Skel } from "@/components/skeleton";
import { Card, SectionLabel, SRow } from "./settings-kit";

/**
 * DevicesSection (Unit 9-5b, 4-H): device rows in a Card, with the
 * "link a device" row at the BOTTOM (proto.jsx SettingsScreen line 309).
 *
 * Soft revoke: flips device.revoked = true and hides the device. Full
 * cryptographic revocation (secret rotation) is deferred — see NOX-10.
 */
export function DevicesSection() {
  const navigate = useNavigate();
  const me = useAccount(ArcanAccount, {
    resolve: { root: { devices: { $each: true } } },
  });

  if (!me.$isLoaded) {
    return (
      <div data-testid="devices-section-loading">
        <SectionLabel>devices</SectionLabel>
        <Card>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between px-3.5 py-3"
            >
              <div className="flex flex-col gap-1">
                <Skel w={140} h={12} />
                <Skel w={90} h={10} />
              </div>
              <Skel w={72} h={28} r={6} />
            </div>
          ))}
        </Card>
      </div>
    );
  }

  const allDevices = me.root.devices;
  const devices = allDevices.filter((d) => d && !d.revoked);

  let currentFingerprint: string | null = null;
  try {
    currentFingerprint = getCurrentSessionFingerprint(me as unknown as Account);
  } catch {
    // Non-local account — guard defensively.
  }

  function handleRevoke(idx: number) {
    const device = devices[idx];
    if (!device) return;
    const confirmed = confirm(
      "Forget this device? It stays hidden from your list, but anything already synced to it remains readable. Full cryptographic revocation lands in a later release.",
    );
    if (!confirmed) return;
    (device as any).$jazz.set("revoked", true);
  }

  return (
    <div>
      <SectionLabel>devices</SectionLabel>
      <Card data-testid="devices-card">
        {devices.length === 0 ? (
          <SRow icon="device" label="no devices found" />
        ) : (
          devices.map((device, idx) => {
            const isCurrentDevice =
              currentFingerprint !== null &&
              (device as any).sessionFingerprint === currentFingerprint;
            const added =
              device.addedAt instanceof Date
                ? device.addedAt.toLocaleDateString()
                : new Date(device.addedAt).toLocaleDateString();
            return (
              <SRow
                key={idx}
                data-testid={`device-row-${idx}`}
                icon="device"
                label={device.label + (isCurrentDevice ? " · this device" : "")}
                sub={`added ${added}`}
                control={
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`revoke-device-btn-${idx}`}
                    onClick={() => handleRevoke(idx)}
                    disabled={isCurrentDevice}
                    title={
                      isCurrentDevice
                        ? "This is your current device — use Sign out instead."
                        : undefined
                    }
                  >
                    forget
                  </Button>
                }
              />
            );
          })
        )}
        {/* link row LAST (proto.jsx line 309) */}
        <SRow
          data-testid="link-device-row"
          icon="plus"
          label="link a device"
          onClick={() => navigate("/pair?role=initiator")}
          last
        />
      </Card>
      <p className="mt-3 max-w-xl text-xs leading-relaxed text-dim">
        forgetting a device hides it here, but it can still read everything it
        has already synced. full cryptographic revocation lands in the upcoming
        overhaul — see NOX-10.
      </p>
    </div>
  );
}
