import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsScreen } from "@/ui/screens/settings-screen";

const baseProps = {
  account: { name: "ada", initials: "A" },
  onOpenProfile: () => {},
  onChangePassword: () => {},
  onRecoveryCode: () => {},
  onFeedback: () => {},
  theme: "dark" as const,
  onTheme: () => {},
  accent: "tokyo",
  accentKeys: ["tokyo"],
  onAccent: () => {},
  accentSolid: { tokyo: "#7aa2f7" },
  notifications: [],
  devices: [],
  onLinkDevice: () => {},
  onSignOut: () => {},
};

const scaleProps = {
  uiScale: 100,
  uiScaleSteps: [90, 100, 115, 130] as const,
  onUiScale: () => {},
  uiScaleRowTestId: "ui-scale-row",
};

describe("SettingsScreen ui-scale pill", () => {
  test("row is absent when onUiScale is not wired (parity-cell mode)", () => {
    render(<SettingsScreen {...baseProps} uiScaleRowTestId="ui-scale-row" />);
    expect(screen.queryByTestId("ui-scale-row")).toBeNull();
  });

  test("renders the four steps with spec testids", () => {
    render(<SettingsScreen {...baseProps} {...scaleProps} />);
    expect(screen.getByTestId("ui-scale-row")).toBeInTheDocument();
    for (const n of [90, 100, 115, 130]) {
      const btn = screen.getByTestId(`ui-scale-${n}`);
      expect(btn).toBeInTheDocument();
      expect(btn.textContent).toBe(`${n}%`);
    }
  });

  test("active step carries the accent fill, inactive steps do not", () => {
    render(<SettingsScreen {...baseProps} {...scaleProps} uiScale={115} />);
    expect(screen.getByTestId("ui-scale-115").className).toContain(
      "bg-arcan-accent-fill",
    );
    expect(screen.getByTestId("ui-scale-100").className).not.toContain(
      "bg-arcan-accent-fill",
    );
  });

  test("clicking a step reports the numeric value", async () => {
    const onUiScale = vi.fn();
    render(
      <SettingsScreen {...baseProps} {...scaleProps} onUiScale={onUiScale} />,
    );
    await userEvent.click(screen.getByTestId("ui-scale-130"));
    expect(onUiScale).toHaveBeenCalledTimes(1);
    expect(onUiScale).toHaveBeenCalledWith(130);
  });
});
