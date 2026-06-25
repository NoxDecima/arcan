import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { ThemeProvider } from "@/styles/use-theme";
import { AccentProvider } from "@/styles/use-accent";
import { AppearanceSection } from "@/routes/settings/appearance-section";
import { NotificationsSection } from "@/routes/settings/notifications-section";
import { DevicesSection } from "@/routes/settings/devices-section";
import { FeedbackSection } from "@/routes/settings/feedback-section";

// As of Unit 9-5a, AccountSection uses SectionLabel (a <span>) not an <h2>,
// and ProfileSection / InvitesSection are no longer part of the settings
// surface (MeRow subsumes the profile; invites aren't in the prototype). This
// suite now only covers the sections that still render an <h2> — those are
// 9-5b's to rebuild and will be revisited there.

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "Alice" },
    root: {
      devices: [],
      invitesIssued: [],
      settings: {
        appearance: { theme: "dark", accent: "tokyo", $jazz: { set: vi.fn() } },
        notifications: { sound: false, browser: false, $jazz: { set: vi.fn() } },
      },
    },
    $jazz: { id: "alice-account-id" },
  }),
  useLogOut: () => vi.fn(),
}));

vi.mock("@/auth/session", () => ({
  getCurrentSessionFingerprint: () => null,
}));

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <ThemeProvider>
          <AccentProvider>{children}</AccentProvider>
        </ThemeProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("settings section titles are lowercase", () => {
  test.each([
    [AppearanceSection, "appearance"],
    [NotificationsSection, "notifications"],
    [DevicesSection, "devices"],
    [FeedbackSection, "give feedback"],
  ])("renders a lowercase h2 with the expected label", (Section, label) => {
    render(
      <Wrap>
        <Section />
      </Wrap>
    );
    const heading = screen.getByRole("heading", { level: 2, name: label });
    expect(heading.textContent).toBe(label);
  });
});
