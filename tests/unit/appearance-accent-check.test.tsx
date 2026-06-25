import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AccentSwatches } from "@/routes/settings/appearance-section";

describe("AccentSwatches", () => {
  it("renders a check-mark only on the selected swatch", () => {
    render(<AccentSwatches accent="violet" onPick={() => {}} />);
    // Every swatch is a labelled button (aria-label = accent key).
    expect(screen.getByLabelText("violet")).toBeInTheDocument();
    // The selected swatch carries the check; identify via a test id.
    expect(screen.getByTestId("accent-check-violet")).toBeInTheDocument();
    expect(screen.queryByTestId("accent-check-tokyo")).toBeNull();
  });

  it("moves the check-mark when the selection changes", () => {
    const { rerender } = render(<AccentSwatches accent="tokyo" onPick={() => {}} />);
    expect(screen.getByTestId("accent-check-tokyo")).toBeInTheDocument();
    rerender(<AccentSwatches accent="rose" onPick={() => {}} />);
    expect(screen.getByTestId("accent-check-rose")).toBeInTheDocument();
    expect(screen.queryByTestId("accent-check-tokyo")).toBeNull();
  });
});
