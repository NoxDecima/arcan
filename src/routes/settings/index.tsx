import { Link } from "react-router-dom";
import { ProfileSection } from "./profile-section";
import { DevicesSection } from "./devices-section";
import { AccountSection } from "./account-section";
import { InvitesSection } from "./invites-section";
import { NotificationsSection } from "./notifications-section";
import { AppearanceSection } from "./appearance-section";
import { FeedbackSection } from "./feedback-section";

/**
 * SettingsRoute: settings page with profile, devices, and account sections.
 *
 * Navigation strategy: react-router-dom. Back navigation is a <Link to="/">.
 * No callback props.
 */
export function SettingsRoute() {
  return (
    <div className="min-h-screen bg-panel-2">
      <div className="max-w-xl mx-auto px-4 py-6">
        {/* Back navigation */}
        <Link
          to="/"
          className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block"
        >
          ← home
        </Link>

        <h1 className="text-xl font-bold text-text mb-6">settings</h1>

        <div className="flex flex-col gap-6">
          <ProfileSection />
          <AppearanceSection />
          <FeedbackSection />
          <NotificationsSection />
          <DevicesSection />
          <InvitesSection />
          <AccountSection />
        </div>
      </div>
    </div>
  );
}
