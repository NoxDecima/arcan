import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { changePassword } from "@/auth/flows";

interface ChangePasswordModalProps {
  onClose: () => void;
}

/**
 * ChangePasswordModal: re-derives the AES key from the current password,
 * decrypts the seed envelope locally, re-encrypts it under the new
 * password's KDF key, and POSTs the new envelope + Better Auth password
 * change in one call. The server-side endpoint revokes other sessions on
 * success.
 *
 * Failure cases:
 * - Wrong current password → decrypt throws locally; no POST is made.
 * - Server rejects new password (e.g. policy) → POST returns 4xx, surfaced.
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
      setError(
        err instanceof Error ? err.message : "Failed to change password",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="change-password-modal"
    >
      <form
        className="bg-panel rounded-lg p-6 w-full max-w-md space-y-4"
        onSubmit={handleSubmit}
      >
        <h2 className="text-lg font-semibold">Change password</h2>
        {done ? (
          <>
            <p className="text-sm text-green">
              Password changed. Other devices were signed out.
            </p>
            <Button type="button" onClick={onClose} className="w-full">
              Close
            </Button>
          </>
        ) : (
          <>
            <input
              type="password"
              placeholder="Current password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              data-testid="change-password-current"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              placeholder="New password (≥12 chars)"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              data-testid="change-password-new"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              data-testid="change-password-confirm"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {error && (
              <p
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                data-testid="change-password-error"
              >
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                data-testid="change-password-submit"
                className="flex-1"
              >
                {isLoading ? "Saving…" : "Change password"}
              </Button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
