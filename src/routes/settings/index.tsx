import { Routes, Route, Navigate } from "react-router-dom";
import { AccountSection } from "./account-section";
import { SignOutCard } from "./sign-out-card";
import { AppearanceSection } from "./appearance-section";
import { NotificationsSection } from "./notifications-section";
import { FeedbackRow } from "./feedback-section";
import { DevicesSection } from "./devices-section";
import { ChangePasswordRoute } from "./change-password-route";
import { RecoveryCodeRoute } from "./recovery-code-route";
import { FeedbackRoute } from "./feedback-route";

/**
 * SettingsBody (Unit 9-5a): the settings landing page, rebuilt against the
 * prototype (design/proto.jsx:261 SettingsScreen). Section order:
 * account → feedback → appearance → notifications → devices → sign-out.
 *
 * 9-5a owns SettingsBody, the account card, and the sign-out card. The block
 * between the account section and SignOutCard is the 9-5b insertion zone —
 * 9-5b replaces the placeholder children (feedback → appearance →
 * notifications → devices) with prototype-matched cards and the feedback
 * row→route, without editing the account or sign-out code.
 *
 * The desktop sidebar persists via AppShell (this page renders inside the
 * shell outlet), so no header/back chrome is added here.
 */
function SettingsBody() {
  return (
    <div className="min-h-screen bg-bg" data-testid="settings-body">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 p-4">
        {/* account — owned by 9-5a */}
        <AccountSection />

        {/* === 9-5b INSERTION ZONE START ===
            9-5b replaces these placeholder sections (feedback → appearance →
            notifications → devices), in this order, with prototype-matched
            cards (feedback collapses to a single row → /settings/feedback).
            Do NOT touch AccountSection or SignOutCard. */}
        <div data-testid="settings-9-5b-zone" className="flex flex-col gap-4">
          <FeedbackRow />
          <AppearanceSection />
          <NotificationsSection />
          <DevicesSection />
        </div>
        {/* === 9-5b INSERTION ZONE END === */}

        {/* sign-out — owned by 9-5a, always last */}
        <SignOutCard />
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
      <Route index element={<SettingsBody />} />
      <Route path="change-password" element={<ChangePasswordRoute />} />
      <Route path="recovery-code" element={<RecoveryCodeRoute />} />
      <Route path="feedback" element={<FeedbackRoute />} />
      <Route path="*" element={<Navigate to="/settings" replace />} />
    </Routes>
  );
}
