import { useAccount } from "jazz-tools/react";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";

/**
 * DevicesSection: lists all registered devices for the account.
 */
export function DevicesSection() {
  const me = useAccount(JazzMessangerAccount, {
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

  const devices = me.root.devices;

  return (
    <section>
      <h2 className="text-base font-semibold text-gray-800 mb-2">Devices</h2>
      <ul
        data-testid="device-list"
        className="bg-white rounded border border-gray-200 divide-y divide-gray-100"
      >
        {devices.length === 0 ? (
          <li className="px-4 py-3 text-sm text-gray-400">No devices found</li>
        ) : (
          devices.map((device, idx) => (
            <li key={idx} className="px-4 py-3 flex flex-col gap-0.5">
              <span className="text-sm font-medium text-gray-800">
                {device.label}
              </span>
              <span className="text-xs text-gray-500">
                Added{" "}
                {device.addedAt instanceof Date
                  ? device.addedAt.toLocaleDateString()
                  : new Date(device.addedAt).toLocaleDateString()}
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
