import { ProfileSection } from "./profile-section";
import { DevicesSection } from "./devices-section";
import { AccountSection } from "./account-section";

/**
 * SettingsRoute: settings page with profile, devices, and account sections.
 *
 * Navigation strategy: Option A (state machine). Receives an
 * `onNavigateToHome` callback from App.tsx; rendered when view === "settings".
 */
interface SettingsRouteProps {
  onNavigateToHome: () => void;
}

export function SettingsRoute({ onNavigateToHome }: SettingsRouteProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-6">
        {/* Back navigation */}
        <button
          onClick={onNavigateToHome}
          className="text-sm text-blue-600 hover:underline mb-4 inline-block"
        >
          ← Home
        </button>

        <h1 className="text-xl font-bold text-gray-900 mb-6">Settings</h1>

        <div className="flex flex-col gap-6">
          <ProfileSection />
          <DevicesSection />
          <AccountSection />
        </div>
      </div>
    </div>
  );
}
