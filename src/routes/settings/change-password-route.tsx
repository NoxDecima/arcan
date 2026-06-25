import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { changePassword } from "@/auth/flows";
import { useToast } from "@/components/toast";

/**
 * ChangePasswordRoute (Unit 9-2): the former ChangePasswordModal, lifted to
 * a route at /settings/change-password. Content ported as-is — the visual
 * rebuild is 9-5.
 *
 * Re-derives the AES key from the current password, decrypts the seed
 * envelope locally, re-encrypts it under the new password's KDF key, and
 * POSTs the new envelope + Better Auth password change in one call. The
 * server-side endpoint revokes other sessions on success.
 *
 * Failure cases:
 *  - Wrong current password → decrypt throws locally; no POST is made.
 *  - Server rejects new password (e.g. policy) → POST returns 4xx, surfaced.
 *
 * Success surfaces as a toast ("password changed") + navigation back to
 * /settings (the modal previously auto-closed).
 */
export function ChangePasswordRoute() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

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
      toast({
        icon: "check",
        text: "password changed",
        tone: "success",
      });
      navigate("/settings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-panel-2"
      data-testid="change-password-route"
    >
      <div className="max-w-xl mx-auto px-4 py-6">
        <Link
          to="/settings"
          className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block"
        >
          ← back
        </Link>

        <h1 className="text-xl font-bold text-text mb-1">change password</h1>
        <p className="mb-6 text-[11.5px] leading-relaxed text-text-2">
          changing your password re-encrypts your account and will sign you out
          on your other devices.
        </p>

        <form
          id="change-password-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-3"
        >
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
              className="rounded-r-4 border border-red/30 bg-red/10 px-3 py-2 text-sm text-red"
              data-testid="change-password-error"
            >
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
              data-testid="change-password-submit"
              className="border-red/40 text-red hover:bg-red/10"
            >
              {isLoading ? "saving…" : "change password"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
