import { useAccount } from "jazz-tools/react";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";

/**
 * ProfileSection: displays the user's profile information in settings.
 */
export function ProfileSection() {
  const me = useAccount(JazzMessangerAccount, {
    resolve: { profile: true },
  });

  if (!me.$isLoaded) {
    return (
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-2">Profile</h2>
        <p className="text-sm text-gray-400">Loading…</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-gray-800 mb-2">Profile</h2>
      <div className="bg-white rounded border border-gray-200 px-4 py-3">
        <p className="text-xs text-gray-500 mb-1">Display name</p>
        <p
          data-testid="settings-display-name"
          className="text-sm font-medium text-gray-800"
        >
          {me.profile.displayName}
        </p>
      </div>
    </section>
  );
}
