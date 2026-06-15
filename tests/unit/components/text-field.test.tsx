import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { TextField } from "@/components/ui/text-field";

describe("TextField", () => {
  test("renders an input with the given props", () => {
    render(<TextField placeholder="current password" type="password" data-testid="pwd" />);
    const input = screen.getByTestId("pwd") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.placeholder).toBe("current password");
  });

  test("uses Arcan tokens, not shadcn bg-background", () => {
    render(<TextField data-testid="t" />);
    const input = screen.getByTestId("t");
    // Arcan tokens
    expect(input.className).toMatch(/\bbg-bg\b/);
    expect(input.className).toMatch(/\bborder-hairline\b/);
    expect(input.className).toMatch(/\btext-text\b/);
    // Should NOT carry the shadcn shim token that was the bug source
    expect(input.className).not.toMatch(/\bbg-background\b/);
  });

  test("forwards controlled value/onChange", async () => {
    function Wrapper() {
      const [v, setV] = useState("");
      return <TextField data-testid="t" value={v} onChange={(e) => setV(e.target.value)} />;
    }
    render(<Wrapper />);
    const input = screen.getByTestId("t") as HTMLInputElement;
    await userEvent.type(input, "abc");
    expect(input.value).toBe("abc");
  });
});
