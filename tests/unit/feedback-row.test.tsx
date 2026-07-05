/**
 * feedback-row.test.tsx
 *
 * Verifies the feedback row rendered by the live SettingsScreen presenter
 * (retargeted from retired FeedbackRow in feedback-section, scheduled for
 * deletion in Phase 4).
 *
 * Behavioral assertions preserved:
 *  - The row renders the expected copy.
 *  - Clicking the row invokes the onFeedback callback (navigation is now
 *    lifted to the container; the presenter just fires the prop).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SettingsScreen } from "@/ui/screens/settings-screen";
import type { ThemeName } from "@/ui/screens/settings-types";

const ACCENT_KEYS = ["tokyo", "violet", "teal", "lime", "amber", "rose"];
const ACCENT_SOLID: Record<string, string> = {
  tokyo:  "#7aa2f7",
  violet: "#bb9af7",
  teal:   "#73daca",
  lime:   "#9ece6a",
  amber:  "#e0af68",
  rose:   "#f7768e",
};

function renderSettings(onFeedback = vi.fn()) {
  return { onFeedback, ...render(
    <SettingsScreen
      account={{ name: "Test", initials: "T" }}
      onOpenProfile={vi.fn()}
      onChangePassword={vi.fn()}
      onRecoveryCode={vi.fn()}
      onFeedback={onFeedback}
      theme={"light" as ThemeName}
      onTheme={vi.fn()}
      accent="violet"
      accentKeys={ACCENT_KEYS}
      onAccent={vi.fn()}
      accentSolid={ACCENT_SOLID}
      notifications={[]}
      devices={[]}
      onLinkDevice={vi.fn()}
      onSignOut={vi.fn()}
      feedbackRowTestId="feedback-row"
    />,
  )};
}

describe("SettingsScreen feedback row", () => {
  it("renders the collapsed row copy", () => {
    renderSettings();
    expect(screen.getByText("give feedback")).toBeInTheDocument();
    expect(screen.getByText("report a bug or share an idea")).toBeInTheDocument();
  });

  it("calls onFeedback when the row is clicked", async () => {
    const user = userEvent.setup();
    const { onFeedback } = renderSettings();
    await user.click(screen.getByTestId("feedback-row"));
    expect(onFeedback).toHaveBeenCalledTimes(1);
  });
});
