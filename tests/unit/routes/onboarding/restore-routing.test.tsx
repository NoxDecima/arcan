import { describe, test, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// The onboarding step tree mounts RestoreWithCodeStep, which calls Jazz hooks
// at render time (useSignInToJazzWithSeed). Those require a JazzProvider we
// don't mount here — this routing test only exercises step navigation, not
// the Jazz bridge — so stub the bridge hooks to inert closures.
vi.mock("@/jazz/createAccountFromSeed", () => ({
  useCreateAccountWithSeed: () => vi.fn(),
  useSetDisplayNameOnMe: () => vi.fn(),
  useSignInToJazzWithSeed: () => vi.fn(),
}));

import { OnboardingRoute } from "@/routes/onboarding/index";

describe("OnboardingRoute restore routing", () => {
  test("welcome → restore-with-code → back lands on welcome (no restore-choice)", () => {
    render(
      <MemoryRouter>
        <OnboardingRoute />
      </MemoryRouter>,
    );
    // Welcome surface is shown first.
    fireEvent.click(screen.getByTestId("restore-account-btn"));
    // We are now on the restore-with-code step.
    expect(screen.getByTestId("restore-passphrase-input")).toBeTruthy();
    // The intermediate "how would you like to sign in?" choice is gone.
    expect(screen.queryByTestId("restore-choice-signin")).toBeNull();
    expect(screen.queryByTestId("restore-choice-code")).toBeNull();
    // Back returns to the welcome surface (not an intermediate screen).
    const backBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent === "back");
    expect(backBtn).toBeTruthy();
    fireEvent.click(backBtn!);
    expect(screen.getByTestId("create-account-btn")).toBeTruthy();
  });
});
