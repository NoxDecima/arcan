import { useLogOut } from "jazz-tools/react";
import { authClient } from "@/auth/client";
import { PCard, PRow } from "@/ui/kit";

/**
 * SignOutCard (Unit 9-5a): standalone danger-red card at the bottom of
 * settings. Sign-out logic lifted from the old AccountSection — calls
 * authClient.signOut() to invalidate the Better Auth cookie server-side,
 * then logOut() to clear local Jazz creds. Network failure on signOut()
 * must not block the local logOut().
 *
 * Wave C: settings-kit imports replaced with @/ui/kit equivalents.
 * SignOutCard is no longer rendered by SettingsBody (logic folded into
 * the container). Stays functional for isolated unit tests; Phase 4 deletes.
 */
export function SignOutCard() {
  const logOut = useLogOut();

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
      // Network failure shouldn't block local logOut; the Better Auth
      // session will expire naturally.
    }
    logOut();
  }

  return (
    <PCard>
      <PRow
        icon="logout"
        label="sign out"
        danger
        last
        onClick={() => void handleSignOut()}
        data-testid="sign-out-btn"
      />
    </PCard>
  );
}
