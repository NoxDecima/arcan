import { Link } from "react-router-dom";
import { ProfileSection } from "./profile-section";
import { DevicesSection } from "./devices-section";
import { AccountSection } from "./account-section";
import { InvitesSection } from "./invites-section";
import { NotificationsSection } from "./notifications-section";

/**
 * SettingsRoute: settings page with profile, devices, and account sections.
 *
 * Navigation strategy: react-router-dom. Back navigation is a <Link to="/">.
 * No callback props.
 */
export function SettingsRoute() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-6">
        {/* Back navigation */}
        <Link
          to="/"
          className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block"
        >
          ← Home
        </Link>

        <h1 className="text-xl font-bold text-gray-900 mb-6">Settings</h1>

        <div className="flex flex-col gap-6">
          <ProfileSection />
          <NotificationsSection />
          <DevicesSection />
          <InvitesSection />
          <AccountSection />
        </div>
      </div>
    </div>
  );
}
