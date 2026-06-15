import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { ModalShell, ModalFooter } from "@/components/modal-shell";
import { PassphraseGrid } from "@/components/passphrase-grid";
import { viewRecoveryCode } from "@/auth/flows";

interface ViewRecoveryCodeModalProps {
  onClose: () => void;
}

/**
 * Prompts the user to confirm their current password, then derives the
 * seed locally (via flows.viewRecoveryCode → GET /me/auth-material + KDF
 * + AES decrypt) and renders the 24-word BIP-39 encoding.
 *
 * The recovery code never leaves the browser; the server only sees the
 * encrypted envelope and never sees the password.
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
      setCode(await viewRecoveryCode({ currentPassword: password }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retrieve recovery code");
    } finally {
      setIsLoading(false);
    }
  }

  const passwordFooter = (
    <ModalFooter>
      <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
        Cancel
      </Button>
      <Button
        type="submit"
        form="view-recovery-code-form"
        disabled={isLoading}
        data-testid="view-recovery-code-submit"
      >
        {isLoading ? "…" : "Show code"}
      </Button>
    </ModalFooter>
  );

  const codeFooter = (
    <ModalFooter>
      <Button type="button" onClick={onClose}>Done</Button>
    </ModalFooter>
  );

  return (
    <ModalShell
      open
      onClose={onClose}
      title="view recovery code"
      dataTestId="view-recovery-code-modal"
      footer={code ? codeFooter : passwordFooter}
    >
      {code ? (
        <>
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
        </>
      ) : (
        <form id="view-recovery-code-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
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
            <p className="rounded-r-3 border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
              {error}
            </p>
          )}
        </form>
      )}
    </ModalShell>
  );
}
