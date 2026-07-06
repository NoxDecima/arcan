import { describe, test, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { WelcomeStep } from "@/routes/onboarding/welcome-step";

// WelcomeStep is now a thin container rendering WelcomeScreen (Rung-1 presenter).
// Behavioral assertions are preserved; import path is unchanged.

describe("WelcomeStep", () => {
  test("renders the short tagline subtitle (with // sysComment prefix per proto:542)", () => {
    render(
      <WelcomeStep
        onCreateAccount={vi.fn()}
        onRestoreAccount={vi.fn()}
        onSignInWithPassword={vi.fn()}
      />
    );
    // WelcomeScreen renders '// local-first · end-to-end encrypted' (sysComment=true per proto).
    expect(
      screen.getByText(/local-first · end-to-end encrypted/),
    ).toBeTruthy();
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
    // The "already on a device?" prefix is rendered as adjacent text;
    // the button itself only contains "sign in".
    expect(screen.getByText(/already on a device\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "sign in" }));
    expect(onSignIn).toHaveBeenCalled();
  });

  test("renders a hero-size Arcan mark (Lattice full tier, ≥44px)", () => {
    const { container } = render(
      <WelcomeStep
        onCreateAccount={vi.fn()}
        onRestoreAccount={vi.fn()}
        onSignInWithPassword={vi.fn()}
      />,
    );
    // WelcomeScreen renders ArcanMark stacked size={64}.
    // ArcanMark stacked: an svg[role='img'] sibling of the "arcan" span inside a flex-col div.
    const wordmarkLabel = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "arcan",
    );
    expect(wordmarkLabel).toBeTruthy();
    const mark = wordmarkLabel!.parentElement!.querySelector(
      "svg[role='img']",
    ) as SVGElement | null;
    expect(mark).not.toBeNull();
    expect(Number(mark!.getAttribute("width"))).toBeGreaterThanOrEqual(44);
  });

  test("is a single surface: create + restore + inline sign-in, in design order", () => {
    render(
      <WelcomeStep
        onCreateAccount={vi.fn()}
        onRestoreAccount={vi.fn()}
        onSignInWithPassword={vi.fn()}
      />,
    );
    // All three affordances live on one surface — no intermediate choice screen.
    const create = screen.getByTestId("create-account-btn");
    const restore = screen.getByTestId("restore-account-btn");
    const signin = screen.getByTestId("signin-existing-btn");
    expect(create.textContent).toBe("create account");
    expect(restore.textContent).toBe("restore from recovery code");
    expect(signin.textContent).toBe("sign in");
    // Design order: create precedes restore precedes the inline sign-in.
    expect(
      create.compareDocumentPosition(restore) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      restore.compareDocumentPosition(signin) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
