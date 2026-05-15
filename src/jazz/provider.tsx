import { JazzReactProvider } from "jazz-tools/react";
import { JazzMessangerAccount } from "./schema/JazzMessangerAccount";

/**
 * The WebSocket sync URL. Defaults to a local development sync server.
 * Set VITE_SYNC_URL in your .env file for production (must use ws:// or wss://).
 */
const SYNC_URL =
  (import.meta.env.VITE_SYNC_URL as `ws://${string}` | `wss://${string}`) ??
  "ws://localhost:4200";

interface MessangerProviderProps {
  children: React.ReactNode;
}

/**
 * MessangerProvider: top-level Jazz context provider for the application.
 *
 * Wires JazzReactProvider with:
 * - WebSocket sync (VITE_SYNC_URL env var, defaulting to ws://localhost:4200)
 * - IndexedDB persistence for local-first operation
 * - JazzMessangerAccount as the AccountSchema (activates the migration hook)
 * - A centered "Loading..." fallback shown while the context initialises
 *
 * Place this at the root of the React tree, above all consumers of
 * useAccount / useCoState / usePassphraseAuth.
 */
export function MessangerProvider({ children }: MessangerProviderProps) {
  return (
    <JazzReactProvider
      sync={{ peer: SYNC_URL }}
      AccountSchema={JazzMessangerAccount}
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
