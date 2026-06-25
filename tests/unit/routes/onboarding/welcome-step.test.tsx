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
    // The "already on a device?" prefix is rendered as adjacent text;
    // the button itself only contains "sign in" (see welcome-step.tsx
    // — Unit 8a's AuthSurface layout uses a span + small accent button
    // pair rather than a single full-width Button).
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
    // The Wordmark renders <Lattice> as an svg[role="img"] paired with the
    // "arcan" text span inside the same wrapper. NOTE: AuthSurface also draws
    // a decorative size=360 watermark Lattice, so we must target the Wordmark's
    // mark specifically — the svg sibling of the "arcan" span — rather than the
    // first svg[role="img"] in the tree (which would be the watermark).
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
});
