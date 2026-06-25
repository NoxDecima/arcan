import { Routes, Route, Navigate, Link } from "react-router-dom";
import { ProfileSection } from "./profile-section";
import { DevicesSection } from "./devices-section";
import { AccountSection } from "./account-section";
import { InvitesSection } from "./invites-section";
import { NotificationsSection } from "./notifications-section";
import { AppearanceSection } from "./appearance-section";
import { FeedbackSection } from "./feedback-section";
import { ChangePasswordRoute } from "./change-password-route";
import { RecoveryCodeRoute } from "./recovery-code-route";

/**
 * SettingsIndex: the settings landing page with profile, appearance,
 * feedback, notifications, devices, invites, and account sections.
 *
 * Navigation strategy: react-router-dom. Back navigation is a <Link to="/">.
 * No callback props.
 */
function SettingsIndex() {
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

/**
 * SettingsRoute: dispatcher for the /settings/* route group.
 *
 * Unit 9-2: the change-password and view-recovery-code flows are now
 * dedicated routes (formerly modals opened from the account section) so the
 * persistent AppShell sidebar stays mounted around them. Sub-route paths are
 * relative to /settings (this component is the element for `/settings/*`).
 */
export function SettingsRoute() {
  return (
    <Routes>
      <Route index element={<SettingsIndex />} />
      <Route path="change-password" element={<ChangePasswordRoute />} />
      <Route path="recovery-code" element={<RecoveryCodeRoute />} />
      <Route path="*" element={<Navigate to="/settings" replace />} />
    </Routes>
  );
}
