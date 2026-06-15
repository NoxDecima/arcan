import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { ModalShell, ModalFooter } from "@/components/modal-shell";
import { changePassword } from "@/auth/flows";

interface ChangePasswordModalProps {
  onClose: () => void;
}

/**
 * Re-derives the AES key from the current password, decrypts the seed
 * envelope locally, re-encrypts it under the new password's KDF key, and
 * POSTs the new envelope + Better Auth password change in one call. The
 * server-side endpoint revokes other sessions on success.
 *
 * Failure cases:
 *  - Wrong current password → decrypt throws locally; no POST is made.
 *  - Server rejects new password (policy) → POST returns 4xx, surfaced.
 */
export function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 12) {
      setError("New password must be at least 12 characters");
      return;
    }
    if (next !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setIsLoading(false);
    }
  }

  const doneFooter = (
    <ModalFooter>
      <Button type="button" onClick={onClose}>Close</Button>
    </ModalFooter>
  );

  const formFooter = (
    <ModalFooter>
      <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
        Cancel
      </Button>
      <Button
        type="submit"
        form="change-password-form"
        disabled={isLoading}
        data-testid="change-password-submit"
      >
        {isLoading ? "Saving…" : "Change password"}
      </Button>
    </ModalFooter>
  );

  return (
    <ModalShell
      open
      onClose={onClose}
      title="change password"
      dataTestId="change-password-modal"
      footer={done ? doneFooter : formFooter}
    >
      {done ? (
        <p className="text-sm text-green">
          Password changed. Other devices were signed out.
        </p>
      ) : (
        <form id="change-password-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
          <TextField
            type="password"
            placeholder="Current password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            data-testid="change-password-current"
          />
          <TextField
            type="password"
            placeholder="New password (≥12 chars)"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            data-testid="change-password-new"
          />
          <TextField
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            data-testid="change-password-confirm"
          />
          {error && (
            <p
              className="rounded-r-3 border border-red/30 bg-red/10 px-3 py-2 text-sm text-red"
              data-testid="change-password-error"
            >
              {error}
            </p>
          )}
        </form>
      )}
    </ModalShell>
  );
}
