import { render, fireEvent } from "@testing-library/react";
import { Fab } from "@/components/fab";

describe("Fab", () => {
  it("renders an accent-filled pill button with the plus icon", () => {
    const { getByTestId } = render(<Fab label="New chat" onClick={() => {}} />);
    const btn = getByTestId("fab");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.className).toMatch(/\bbg-arcan-accent\b/);
    expect(btn.className).toMatch(/\btext-on-accent\b/);
    expect(btn.className).toMatch(/\brounded-pill\b/);
    expect(btn.querySelector('svg[data-icon="plus"]')).not.toBeNull();
    expect(btn.getAttribute("aria-label")).toBe("New chat");
  });

  it("fires onClick when pressed", () => {
    let clicked = false;
    const { getByTestId } = render(
      <Fab label="New chat" onClick={() => (clicked = true)} />,
    );
    fireEvent.click(getByTestId("fab"));
    expect(clicked).toBe(true);
  });

  it("floats above the bottom tab bar on mobile (inline bottom offset clears 56px)", () => {
    const { getByTestId } = render(<Fab label="New chat" onClick={() => {}} />);
    const styleAttr = getByTestId("fab").getAttribute("style") ?? "";
    // React's style serializer folds the constant `16px + 56px` to `72px`
    // (= 16px FAB inset + 56px tab-bar height) before emitting the inline
    // declaration, so we assert the folded form. The env() inset is added
    // *outside* the fold and is preserved verbatim.
    expect(styleAttr).toMatch(
      /bottom:\s*calc\(72px \+ env\(safe-area-inset-bottom\)\)/,
    );
  });
});
