import { useAccount, useLogOut } from "jazz-tools/react";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { SafetyNumber } from "@/components/safety-number";
import { getAccountPubkeyHex } from "@/auth/pubkey";
import { Button } from "@/components/ui/button";

/**
 * AccountSection: shows the user's safety number derived from their
 * Ed25519 signing public key, plus a sign-out action.
 */
export function AccountSection() {
  const me = useAccount(JazzMessangerAccount);
  const logOut = useLogOut();

  function handleSignOut() {
    if (!confirm("Sign out? You'll need your passphrase to sign back in. Local data will be cleared.")) return;
    logOut();
    // After logout, App.tsx will detect !me and render OnboardingRoute.
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
      <Button
        variant="outline"
        onClick={handleSignOut}
        data-testid="sign-out-btn"
        className="mt-4"
      >
        Sign out
      </Button>
    </section>
  );
}
