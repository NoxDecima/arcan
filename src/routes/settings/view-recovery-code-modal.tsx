import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { viewRecoveryCode } from "@/auth/flows";

interface ViewRecoveryCodeModalProps {
  onClose: () => void;
}

/**
 * ViewRecoveryCodeModal: prompts the user to confirm their current
 * password, then derives the seed locally (via flows.viewRecoveryCode →
 * GET /me/auth-material + KDF + AES decrypt) and renders the 24-word
 * BIP-39 encoding.
 *
 * Security note: the recovery code never leaves the browser; the server
 * only sees the encrypted envelope and never sees the password.
 */
export function ViewRecoveryCodeModal({ onClose }: ViewRecoveryCodeModalProps) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const result = await viewRecoveryCode({ currentPassword: password });
      setCode(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to retrieve recovery code",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="view-recovery-code-modal"
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold">View recovery code</h2>
        {code ? (
          <>
            <p className="text-sm text-gray-600">
              Write this down somewhere safe. It's the only way back in if you
              forget your password.
            </p>
            <pre
              data-testid="recovery-code-display"
              className="bg-gray-100 rounded p-3 text-sm font-mono whitespace-pre-wrap break-words"
            >
              {code}
            </pre>
            <Button type="button" onClick={onClose} className="w-full">
              Done
            </Button>
          </>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <p className="text-sm text-gray-600">
              Confirm your password to view the code.
            </p>
            <input
              type="password"
              placeholder="Current password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              data-testid="view-recovery-code-password"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                data-testid="view-recovery-code-submit"
                className="flex-1"
              >
                {isLoading ? "…" : "Show code"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
