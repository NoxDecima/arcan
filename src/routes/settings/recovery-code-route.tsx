import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { PassphraseGrid } from "@/components/passphrase-grid";
import { viewRecoveryCode } from "@/auth/flows";

/**
 * RecoveryCodeRoute (Unit 9-2): the former ViewRecoveryCodeModal, lifted to
 * a route at /settings/recovery-code. Content ported as-is — the visual
 * rebuild is 9-5.
 *
 * Prompts the user to confirm their current password, then derives the
 * seed locally (via flows.viewRecoveryCode → GET /me/auth-material + KDF
 * + AES decrypt) and renders the 24-word BIP-39 encoding.
 *
 * The recovery code never leaves the browser; the server only sees the
 * encrypted envelope and never sees the password.
 */
export function RecoveryCodeRoute() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      setCode(await viewRecoveryCode({ currentPassword: password }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retrieve recovery code");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto bg-panel-2"
      data-testid="recovery-code-route"
    >
      <div className="max-w-xl mx-auto px-4 py-6">
        <Link
          to="/settings"
          className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block"
        >
          ← back
        </Link>

        <h1 className="text-xl font-bold text-text mb-1">view recovery code</h1>
        <p className="mb-6 text-[11.5px] leading-relaxed text-text-2">
          this is the master secret to your account — anyone with this code can
          access your account. only reveal it somewhere private.
        </p>

        {code ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-2">
              Write this down somewhere safe. It's the only way back in if you
              forget your password.
            </p>
            {/* Keep data-testid="recovery-code-display" for e2e compat by adding
                a hidden sr-only string under the grid. The grid itself owns the
                visible 24 words via PassphraseGrid. */}
            <PassphraseGrid phrase={code} withCopyButton />
            <span data-testid="recovery-code-display" className="sr-only">
              {code}
            </span>
            <div className="flex gap-2 mt-2">
              <Button type="button" onClick={() => navigate("/settings")}>
                done
              </Button>
            </div>
          </div>
        ) : (
          <form
            id="view-recovery-code-form"
            onSubmit={handleSubmit}
            className="flex flex-col gap-3"
          >
            <p className="text-sm text-text-2">
              Confirm your password to view the code.
            </p>
            <TextField
              type="password"
              placeholder="Current password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              data-testid="view-recovery-code-password"
            />
            {error && (
              <p className="rounded-r-4 border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
                {error}
              </p>
            )}
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/settings")}
                disabled={isLoading}
              >
                cancel
              </Button>
              <Button
                type="submit"
                variant="outline"
                disabled={isLoading}
                data-testid="view-recovery-code-submit"
                className="border-red/40 text-red hover:bg-red/10"
              >
                {isLoading ? "…" : "show code"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
