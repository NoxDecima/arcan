/**
 * appearance-accent-check.test.tsx
 *
 * Verifies the accent swatch check-mark logic via the live SettingsScreen
 * presenter (retargeted from retired AccentSwatches in appearance-section,
 * which is scheduled for deletion in Phase 4).
 *
 * Behavioral assertions preserved:
 *  - Only the selected swatch carries a check-mark (accent-check-<key>).
 *  - The check-mark moves when the selected accent changes (rerender).
 */
import { render, screen } from "@testing-library/react";
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

function renderSettings(accent: string) {
  return render(
    <SettingsScreen
      account={{ name: "Test", initials: "T" }}
      onOpenProfile={vi.fn()}
      onChangePassword={vi.fn()}
      onRecoveryCode={vi.fn()}
      onFeedback={vi.fn()}
      theme={"light" as ThemeName}
      onTheme={vi.fn()}
      accent={accent}
      accentKeys={ACCENT_KEYS}
      onAccent={vi.fn()}
      accentSolid={ACCENT_SOLID}
      notifications={[]}
      devices={[]}
      onLinkDevice={vi.fn()}
      onSignOut={vi.fn()}
    />,
  );
}

describe("SettingsScreen accent check-mark", () => {
  it("renders a check-mark only on the selected swatch", () => {
    renderSettings("violet");
    // Selected swatch has the check testid; others do not.
    expect(screen.getByTestId("accent-check-violet")).toBeInTheDocument();
    expect(screen.queryByTestId("accent-check-tokyo")).toBeNull();
  });

  it("moves the check-mark when the selection changes", () => {
    const { rerender } = renderSettings("tokyo");
    expect(screen.getByTestId("accent-check-tokyo")).toBeInTheDocument();
    rerender(
      <SettingsScreen
        account={{ name: "Test", initials: "T" }}
        onOpenProfile={vi.fn()}
        onChangePassword={vi.fn()}
        onRecoveryCode={vi.fn()}
        onFeedback={vi.fn()}
        theme={"light" as ThemeName}
        onTheme={vi.fn()}
        accent="rose"
        accentKeys={ACCENT_KEYS}
        onAccent={vi.fn()}
        accentSolid={ACCENT_SOLID}
        notifications={[]}
        devices={[]}
        onLinkDevice={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );
    expect(screen.getByTestId("accent-check-rose")).toBeInTheDocument();
    expect(screen.queryByTestId("accent-check-tokyo")).toBeNull();
  });
});
