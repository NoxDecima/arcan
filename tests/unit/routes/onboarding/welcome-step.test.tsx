import { describe, test, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { WelcomeStep } from "@/routes/onboarding/welcome-step";

describe("WelcomeStep", () => {
  test("renders the short tagline subtitle", () => {
    render(
      <WelcomeStep
        onCreateAccount={vi.fn()}
        onRestoreAccount={vi.fn()}
        onSignInWithPassword={vi.fn()}
      />
    );
    expect(screen.getByText("local-first · end-to-end encrypted")).toBeTruthy();
    expect(
      screen.queryByText(/recovery code is your escape hatch/i),
    ).toBeNull();
  });

  test("renders three lowercase CTAs and wires each callback", () => {
    const onCreate = vi.fn();
    const onRestore = vi.fn();
    const onSignIn = vi.fn();
    render(
      <WelcomeStep
        onCreateAccount={onCreate}
        onRestoreAccount={onRestore}
        onSignInWithPassword={onSignIn}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "create account" }));
    expect(onCreate).toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "restore from recovery code" }),
    );
    expect(onRestore).toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "already on a device? sign in" }),
    );
    expect(onSignIn).toHaveBeenCalled();
  });
});
