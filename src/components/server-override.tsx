import { useState } from "react";
import { isTauri } from "@/platform/is-tauri";
import {
  bakedOrigin,
  getServerOrigin,
  getServerOverride,
  setServerOverride,
  clearServerOverride,
} from "@/platform/server-config";
import { clearAuthToken } from "@/platform/auth-transport";
import { ModalShell } from "@/components/modal-shell";
import { Button } from "@/components/ui/button";

/**
 * Shell-only server switcher (spec §Server configuration): a quiet line at
 * the foot of the login screen showing the configured server; tapping opens
 * a dialog to change it. Saving clears the bearer token and reloads.
 *
 * Returns null on web — zero visual change for the web app.
 */
export function ServerOverride() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(getServerOverride() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  if (!isTauri()) return null;

  const current = new URL(getServerOrigin()).host;

  async function apply(origin: string | null) {
    setError(null);
    setChecking(true);
    try {
      // setServerOverride validates the URL and throws a user-facing message on
      // bad input (e.g. missing https). We call it first so validation errors
      // surface before any network probe. On reset (origin === null) there's
      // nothing to validate; the baked origin is always well-formed.
      if (origin !== null) {
        setServerOverride(origin);
      }
      const target = origin ?? bakedOrigin();
      // Reachability probe — better-auth exposes /api/auth/ok on every
      // deployment; any HTTP response (even 404) proves the host resolves
      // and speaks TLS. Network-level failure is the signal we care about.
      await fetch(`${target}/api/auth/ok`, { method: "GET" });
      if (origin === null) {
        clearServerOverride();
      }
      clearAuthToken();
      window.location.assign("/");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not reach that server. Check the address and try again.",
      );
      setChecking(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="mx-auto mt-4 block text-xs text-dim underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
        data-testid="server-override-trigger"
      >
        server: {current}
      </button>
      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        title="Change server"
      >
        <p className="text-xs text-dim">
          Point this app at a different Arcan server. Your session on the
          current server will be signed out.
        </p>
        <input
          className="w-full rounded-r-4 border border-hairline bg-panel p-2 font-mono text-sm text-text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="https://chat.example.com"
          data-testid="server-override-input"
        />
        {error && (
          <p className="text-xs text-red" data-testid="server-override-error">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            onClick={() => void apply(value)}
            disabled={checking || !value.trim()}
            data-testid="server-override-save"
          >
            {checking ? "checking…" : "use this server"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => void apply(null)}
            disabled={checking}
            data-testid="server-override-reset"
          >
            reset to default
          </Button>
        </div>
      </ModalShell>
    </>
  );
}
