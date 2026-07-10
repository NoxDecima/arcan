import { JazzReactProvider } from "jazz-tools/react";
import { ArcanAccount } from "./schema/ArcanAccount";
// Side-effect import: instantiate the Better Auth client singleton so its
// nanostores are ready before any component calls authClient.useSession().
// Better Auth 1.6 does not ship a provider component — auth state is a
// global nanostore reached via authClient.useSession() / signIn() / etc.
import "@/auth/client";
import { deriveSyncUrl } from "@/platform/server-config";

/**
 * Derive a default sync-server URL from the current page origin.
 *
 * When VITE_SYNC_URL is unset, the built image asks the browser to connect
 * to wss://<host>/sync/ on the same origin it was loaded from. This makes
 * the same Docker image domain-portable — the operator can deploy it to
 * any domain without rebuilding.
 *
 * Edge cases:
 * - SSR / non-browser context: window is undefined; fall back to the
 *   local-dev default so unit tests + node tooling don't crash.
 * - Non-standard ports: window.location.host already includes the port if
 *   the page is served on a non-default one (e.g. "localhost:8080"), so
 *   the resulting URL targets the same port. Correct behaviour for users
 *   who reverse-proxy through their own gateway.
 *
 * Tested in tests/unit/jazz/provider.test.ts.
 *
 * Note: actual sync-URL selection (including Tauri shell support) now lives
 * in @/platform/server-config.deriveSyncUrl. This function remains the
 * documented web fallback.
 */
export function deriveDefaultSyncURL(): `ws://${string}` | `wss://${string}` {
  if (typeof window === "undefined") return "ws://localhost:4200";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/sync/`;
}

const SYNC_URL = deriveSyncUrl();

interface MessangerProviderProps {
  children: React.ReactNode;
}

/**
 * MessangerProvider: top-level Jazz context provider for the application.
 *
 * Wires JazzReactProvider with:
 * - WebSocket sync (VITE_SYNC_URL env var, defaulting to a
 *   window.location-derived URL — see deriveDefaultSyncURL above)
 * - IndexedDB persistence for local-first operation
 * - ArcanAccount as the AccountSchema (activates the migration hook)
 * - A centered "Loading..." fallback shown while the context initialises
 *
 * Place this at the root of the React tree, above all consumers of
 * useAccount / useCoState / usePassphraseAuth.
 */
export function MessangerProvider({ children }: MessangerProviderProps) {
  return (
    <JazzReactProvider
      sync={{ peer: SYNC_URL }}
      AccountSchema={ArcanAccount}
      storage="indexedDB"
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            fontSize: "1.25rem",
            color: "#666",
          }}
        >
          Loading…
        </div>
      }
    >
      {children}
    </JazzReactProvider>
  );
}
