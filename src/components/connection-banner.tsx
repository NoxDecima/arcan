import { useSyncConnectionStatus } from "jazz-tools/react";

/**
 * Shows a subtle banner when sync is disconnected. Renders nothing when online.
 *
 * Uses Jazz's useSyncConnectionStatus hook. Per docs/jazz-api-notes.md §3,
 * the hook returns `true` when connected, `false` when disconnected (with
 * ~5-second detection delay from missing server pings). It is NOT
 * "connected"/"disconnected" string literals.
 */
export function ConnectionBanner() {
  const isConnected = useSyncConnectionStatus();

  if (isConnected !== false) return null;

  return (
    <div
      className="bg-yellow-100 text-yellow-900 text-xs px-3 py-2 border-b border-yellow-300"
      data-testid="connection-banner"
    >
      ⚠ No connection — messages will send when you reconnect.
    </div>
  );
}
