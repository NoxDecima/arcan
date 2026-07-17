import { describe, test, expect } from "vitest";
import { editBoxWidth } from "@/lib/edit-box-width";

describe("editBoxWidth (feedback round 4)", () => {
  test("mobile bubble (190) → fits inside with padding", () => {
    expect(editBoxWidth(190)).toBe(166);
  });
  test("desktop bubble (460) → keeps the historical 220px", () => {
    expect(editBoxWidth(460)).toBe(220);
  });
});
