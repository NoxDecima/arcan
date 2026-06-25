import { useNavigate } from "react-router-dom";
import { useAccount, useLogOut } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { SafetyNumber } from "@/components/safety-number";
import { getAccountPubkeyHex } from "@/auth/pubkey";
import { authClient } from "@/auth/client";
import { Button } from "@/components/ui/button";
import { Skel } from "@/components/skeleton";

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
  const me = useAccount(ArcanAccount);
  const logOut = useLogOut();
  const navigate = useNavigate();

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
      <section data-testid="account-section-loading">
        <h2 className="text-base font-semibold text-text mb-2">account</h2>
        <div className="bg-panel rounded border border-hairline px-4 py-3 flex flex-col gap-2">
          <Skel w="55%" h={12} />
          <Skel w="80%" h={14} />
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skel key={i} w="100%" h={36} r={6} />
          ))}
        </div>
      </section>
    );
  }

  const fingerprintHex = getAccountPubkeyHex(me);

  return (
    <section>
      <h2 className="text-base font-semibold text-text mb-2">account</h2>
      <div className="bg-panel rounded border border-hairline px-4 py-3 flex flex-col gap-2">
        <p className="text-sm text-text-2">your safety number:</p>
        <SafetyNumber fingerprintHex={fingerprintHex} />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Button
          variant="outline"
          onClick={() => navigate("/settings/change-password")}
          data-testid="change-password-btn"
        >
          change password
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate("/settings/recovery-code")}
          data-testid="view-recovery-code-btn"
        >
          view recovery code
        </Button>
        <Button
          variant="outline"
          onClick={() => void handleSignOut()}
          data-testid="sign-out-btn"
        >
          sign out
        </Button>
      </div>
    </section>
  );
}
