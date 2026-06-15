// src/routes/settings/profile-section.tsx
import { useAccount } from "jazz-tools/react";
import { useNavigate } from "react-router-dom";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Skel } from "@/components/skeleton";

/**
 * Unit 4 Phase 5: settings → profile section is now a single navigation row
 * that drops the user into the polymorphic /profile/<own-id> view. All the
 * avatar/name editing affordances live there now (camera overlay + pencil),
 * keeping settings focused on app-wide configuration.
 */
export function ProfileSection() {
  const me = useAccount(ArcanAccount, { resolve: {} });
  const navigate = useNavigate();

  if (!me.$isLoaded) {
    return (
      <section data-testid="profile-section-loading">
        <h2 className="text-base font-semibold text-text mb-2">profile</h2>
        <div className="w-full p-4 rounded-r-3 border border-hairline bg-panel">
          <Skel w="40%" h={14} />
        </div>
      </section>
    );
  }

  const myID = (me as any).$jazz?.id as string | undefined;

  return (
    <section>
      <h2 className="text-base font-semibold text-text mb-2">profile</h2>
      <button
        type="button"
        onClick={() => myID && navigate(`/profile/${myID}`)}
        disabled={!myID}
        data-testid="settings-profile-row"
        className="w-full p-4 rounded-r-3 border border-hairline bg-panel text-left flex items-center justify-between hover:bg-panel-2 disabled:opacity-50"
      >
        <span className="text-sm text-text">your profile</span>
        <span className="text-dim">›</span>
      </button>
    </section>
  );
}
