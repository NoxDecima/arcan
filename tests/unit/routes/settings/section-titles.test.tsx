import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { ThemeProvider } from "@/styles/use-theme";
import { AccentProvider } from "@/styles/use-accent";
import { ProfileSection } from "@/routes/settings/profile-section";
import { AppearanceSection } from "@/routes/settings/appearance-section";
import { NotificationsSection } from "@/routes/settings/notifications-section";
import { DevicesSection } from "@/routes/settings/devices-section";
import { AccountSection } from "@/routes/settings/account-section";
import { FeedbackSection } from "@/routes/settings/feedback-section";
import { InvitesSection } from "@/routes/settings/invites-section";

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

vi.mock("@/auth/pubkey", () => ({
  getAccountPubkeyHex: () => "deadbeef".repeat(8),
}));

vi.mock("@/auth/session", () => ({
  getCurrentSessionFingerprint: () => null,
}));

vi.mock("@/components/safety-number", () => ({
  SafetyNumber: () => <div data-testid="safety-number-stub" />,
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
    [ProfileSection, "profile"],
    [AppearanceSection, "appearance"],
    [NotificationsSection, "notifications"],
    [DevicesSection, "devices"],
    [AccountSection, "account"],
    [FeedbackSection, "give feedback"],
    [InvitesSection, "pending invitations"],
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
