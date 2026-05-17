import { describe, it, expect } from "vitest";
import { EphemeralPairing } from "@/jazz/schema/EphemeralPairing";

describe("EphemeralPairing schema", () => {
  it("is defined and exported", () => {
    expect(EphemeralPairing).toBeDefined();
    expect(EphemeralPairing).toHaveProperty("builtin", "CoMap");
    expect(typeof EphemeralPairing.create).toBe("function");
  });
});
