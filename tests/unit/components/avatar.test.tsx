import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { Avatar } from "@/components/avatar";

describe("Avatar", () => {
  test("uses rounded-rect (not rounded-full)", () => {
    const { getByRole } = render(<Avatar initials="AB" size="md" />);
    const el = getByRole("img");
    expect(el.className).toContain("rounded-avatar");
    expect(el.className).not.toContain("rounded-full");
  });
  test("lg size uses the larger avatar radius", () => {
    const { getByRole } = render(<Avatar initials="AB" size="lg" />);
    expect(getByRole("img").className).toContain("rounded-avatar-lg");
  });
});
