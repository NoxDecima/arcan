import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PassphraseGrid } from "@/components/passphrase-grid";

const PHRASE = Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(" ");

describe("PassphraseGrid", () => {
  test("renders all 24 words with 01-style index numbers", () => {
    render(<PassphraseGrid phrase={PHRASE} />);
    expect(screen.getByText("word1")).toBeInTheDocument();
    expect(screen.getByText("word24")).toBeInTheDocument();
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
  });

  test("uses font-mono for the words", () => {
    const { container } = render(<PassphraseGrid phrase={PHRASE} />);
    const word = container.querySelector("[data-testid='passphrase-word-1']");
    expect(word?.className).toMatch(/font-mono/);
  });

  test("exposes data-testid=\"passphrase-grid\" on the wrapper", () => {
    render(<PassphraseGrid phrase={PHRASE} />);
    expect(screen.getByTestId("passphrase-grid")).toBeInTheDocument();
  });

  test("grid uses 3-column layout (compact prop is now an alias for the same 3-col)", () => {
    // Both default and compact use 3-col to match hf-flows.jsx#ScRecovery metrics.
    const { rerender, container } = render(<PassphraseGrid phrase={PHRASE} />);
    expect(container.querySelector("[data-testid='passphrase-grid']")?.className).toMatch(/grid-cols-3/);
    rerender(<PassphraseGrid phrase={PHRASE} compact />);
    expect(container.querySelector("[data-testid='passphrase-grid']")?.className).toMatch(/grid-cols-3/);
  });

  test("when withCopyButton, clicking it calls navigator.clipboard.writeText with the phrase", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<PassphraseGrid phrase={PHRASE} withCopyButton />);
    await userEvent.click(screen.getByTestId("passphrase-copy-btn"));
    expect(writeText).toHaveBeenCalledWith(PHRASE);
  });
});
