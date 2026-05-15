import { describe, it, expect } from "vitest";
import { MessangerProfile } from "@/jazz/schema/Profile";

describe("MessangerProfile schema", () => {
  it("is defined and exported", () => {
    expect(MessangerProfile).toBeDefined();
    // jazz-tools 0.20.18 co.map() returns a CoMapSchema instance (object), not a class
    expect(MessangerProfile).toHaveProperty("builtin", "CoMap");
    expect(typeof MessangerProfile.create).toBe("function");
  });
});
