import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { ThemeProvider } from "@/styles/use-theme";
import { AccentProvider } from "@/styles/use-accent";
import { AppearanceSection } from "@/routes/settings/appearance-section";
import { NotificationsSection } from "@/routes/settings/notifications-section";
import { DevicesSection } from "@/routes/settings/devices-section";
import { FeedbackRow } from "@/routes/settings/feedback-section";

// As of Unit 9-5b, every settings section is rebuilt on the kit: the card
// sections (appearance / notifications / devices) caption themselves with
// SectionLabel (a <span>, not an <h2>), and the feedback form collapsed to a
// FeedbackRow whose label is "give feedback". The lowercase invariant still
// holds; we now assert the lowercase label text rather than an <h2> role.

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
    [FeedbackRow, "give feedback"],
  ])("renders a lowercase label with the expected text", (Section, label) => {
    render(
      <Wrap>
        <Section />
      </Wrap>
    );
    // PSectionLabel renders "// <label>" (PSectionLabel sections) or the raw
    // label (FeedbackRow). Use an anchored regex to avoid false multi-match on
    // substrings like "browser notifications" matching "notifications".
    const els = screen.getAllByText(new RegExp(`^(// )?${label}$`));
    expect(els.length).toBeGreaterThan(0);
    expect(els[0]!.textContent).toContain(label);
    expect(label).toBe(label.toLowerCase());
  });
});
