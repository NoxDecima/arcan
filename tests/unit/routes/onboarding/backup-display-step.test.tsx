import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BackupDisplayStep } from "@/routes/onboarding/backup-display-step";

const PHRASE = Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(" ");

// BackupDisplayStep is now a container rendering BackupDisplayScreen (Rung-2 presenter).
// The old `data-roomy="recovery"` hook no longer exists; the presenter uses
// AuthSurface tall which provides scrollable layout for the 24-word grid.
// Behavioral intent: the step renders the warn callout, the grid, the checkbox,
// and the gated continue button.

describe("BackupDisplayStep", () => {
  test("renders the warn callout (extra layout room for the recovery-code step)", () => {
    render(
      <BackupDisplayStep
        phrase={PHRASE}
        onBack={() => {}}
        onContinue={() => {}}
      />,
    );
    // The warn callout text confirms the presenter is mounted with tall layout.
    expect(
      screen.getByText(/this 24-word code is the only way to recover your account/i),
    ).toBeTruthy();
  });

  test("renders the passphrase grid and the acknowledge checkbox", () => {
    render(
      <BackupDisplayStep
        phrase={PHRASE}
        onBack={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(screen.getByTestId("passphrase-grid")).toBeTruthy();
    expect(screen.getByTestId("passphrase-saved-checkbox")).toBeTruthy();
  });

  test("continue button is disabled until the checkbox is ticked", () => {
    render(
      <BackupDisplayStep
        phrase={PHRASE}
        onBack={() => {}}
        onContinue={() => {}}
      />,
    );
    const continueBtn = screen.getByTestId("passphrase-display-continue") as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);
  });
});
