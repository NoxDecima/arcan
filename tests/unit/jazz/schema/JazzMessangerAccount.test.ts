import { describe, it, expect } from "vitest";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";

describe("JazzMessangerAccount schema", () => {
  it("is defined and exported", () => {
    expect(JazzMessangerAccount).toBeDefined();
    // jazz-tools 0.20.18 co.account() returns an AccountSchema instance (object)
    expect(JazzMessangerAccount).toHaveProperty("builtin", "Account");
    expect(typeof JazzMessangerAccount.create).toBe("function");
  });
});
