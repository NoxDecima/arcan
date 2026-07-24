import { describe, it, expect } from "vitest";
import {
  imageAspect,
  gridUnitAspect,
  heroAspect,
  CELL_MIN,
  CELL_MAX,
} from "@/components/attachment-grid";

describe("imageAspect", () => {
  it("returns w/h when both dims are positive numbers", () => {
    expect(imageAspect({ width: 800, height: 400 })).toBe(2);
  });
  it("returns null when a dimension is missing or non-positive", () => {
    expect(imageAspect({ width: 800 })).toBeNull();
    expect(imageAspect({ width: 0, height: 400 })).toBeNull();
    expect(imageAspect({})).toBeNull();
    expect(imageAspect(null)).toBeNull();
  });
});

describe("gridUnitAspect", () => {
  it("returns null if ANY member lacks dimensions (fall back to squares)", () => {
    expect(gridUnitAspect([2, null, 1])).toBeNull();
  });
  it("averages then clamps into [3/4, 4/3]", () => {
    expect(gridUnitAspect([0.5, 0.5])).toBeCloseTo(CELL_MIN, 5);
    expect(gridUnitAspect([3, 3])).toBeCloseTo(CELL_MAX, 5);
    expect(gridUnitAspect([1, 1])).toBeCloseTo(1, 5);
  });
  it("returns null for an empty list", () => {
    expect(gridUnitAspect([])).toBeNull();
  });
});

describe("heroAspect", () => {
  it("doubles the unit and clamps into [1.5, 2.5]", () => {
    expect(heroAspect(1)).toBe(2);
    expect(heroAspect(CELL_MIN)).toBe(1.5);
    expect(heroAspect(CELL_MAX)).toBeCloseTo(2.5, 5);
  });
});
