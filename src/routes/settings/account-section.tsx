import { useState } from "react";
import { useAccount, useLogOut } from "jazz-tools/react";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { SafetyNumber } from "@/components/safety-number";
import { getAccountPubkeyHex } from "@/auth/pubkey";
import { authClient } from "@/auth/client";
import { Button } from "@/components/ui/button";
import { ChangePasswordModal } from "./change-password-modal";
import { ViewRecoveryCodeModal } from "./view-recovery-code-modal";

/**
 * AccountSection: shows the user's safety number derived from their
 * Ed25519 signing public key, plus password / recovery-code management
 * and a sign-out action.
 *
 * Sign-out: calls authClient.signOut() first so the Better Auth cookie
 * is invalidated server-side, then logOut() to clear local Jazz
 * credentials. After logOut, App's useIsAuthenticated flips and the
 * /auth/login route renders.
 */
export function AccountSection() {
  const me = useAccount(JazzMessangerAccount);
  const logOut = useLogOut();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showRecoveryCode, setShowRecoveryCode] = useState(false);

  async function handleSignOut() {
    if (
      !confirm(
        "Sign out? You'll need your password to sign back in. Local data will be cleared.",
      )
    )
      return;
    try {
      await authClient.signOut();
    } catch {
      // Network failure shouldn't block local logOut. The Better Auth
      // session will expire naturally; clear local creds either way.
    }
    logOut();
  }

  if (!me.$isLoaded) {
    return (
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-2">Account</h2>
        <p className="text-sm text-gray-400">Loading…</p>
      </section>
    );
  }

  const fingerprintHex = getAccountPubkeyHex(me);

  return (
    <section>
      <h2 className="text-base font-semibold text-gray-800 mb-2">Account</h2>
      <div className="bg-white rounded border border-gray-200 px-4 py-3 flex flex-col gap-2">
        <p className="text-sm text-gray-600">Your safety number:</p>
        <SafetyNumber fingerprintHex={fingerprintHex} />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Button
          variant="outline"
          onClick={() => setShowChangePassword(true)}
          data-testid="change-password-btn"
        >
          Change password
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowRecoveryCode(true)}
          data-testid="view-recovery-code-btn"
        >
          View recovery code
        </Button>
        <Button
          variant="outline"
          onClick={() => void handleSignOut()}
          data-testid="sign-out-btn"
        >
          Sign out
        </Button>
      </div>
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
      {showRecoveryCode && (
        <ViewRecoveryCodeModal onClose={() => setShowRecoveryCode(false)} />
      )}
    </section>
  );
}
