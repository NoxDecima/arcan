import { describe, it, expect } from "vitest";
import { Invitation } from "@/jazz/schema/Invitation";

describe("Invitation schema", () => {
  it("is defined and exported", () => {
    expect(Invitation).toBeDefined();
    expect(Invitation).toHaveProperty("builtin", "CoMap");
    expect(typeof Invitation.create).toBe("function");
  });
});
