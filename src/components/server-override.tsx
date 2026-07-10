import { useState } from "react";
import { isTauri } from "@/platform/is-tauri";
import {
  bakedOrigin,
  getServerOrigin,
  getServerOverride,
  validateServerOrigin,
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

  function handleClose() {
    setOpen(false);
    setError(null);
    setChecking(false);
  }

  async function apply(origin: string | null) {
    setError(null);
    setChecking(true);

    // Step 1: validate (throws immediately with a user-facing message; nothing persisted).
    let target: string;
    if (origin === null) {
      target = bakedOrigin();
    } else {
      try {
        target = validateServerOrigin(origin);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Invalid server address.");
        setChecking(false);
        return;
      }
    }

    // Step 2: probe — success requires an Arcan server new enough to carry the
    // shell CORS config; older/foreign servers read as unreachable.
    try {
      await fetch(`${target}/api/auth/ok`, { signal: AbortSignal.timeout(10_000) });
    } catch {
      setError("Could not reach that server. Check the address and try again.");
      setChecking(false);
      return;
    }

    // Step 3: persist — probe already passed; if storage fails the error is
    // honest (nothing was persisted, nothing needs rolling back).
    try {
      if (origin === null) {
        clearServerOverride();
      } else {
        setServerOverride(origin);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save server address.");
      setChecking(false);
      return;
    }

    clearAuthToken();
    window.location.assign("/");
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
        onClose={handleClose}
        title="Change server"
      >
        <p className="text-xs text-dim">
          Point this app at a different Arcan server. Your session on the
          current server will be signed out.
        </p>
        <input
          aria-label="Server URL"
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
