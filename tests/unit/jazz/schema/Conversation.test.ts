import { describe, it, expect } from "vitest";
import { Conversation } from "@/jazz/schema/Conversation";

describe("Conversation schema", () => {
  it("is defined and exported", () => {
    expect(Conversation).toBeDefined();
    expect(Conversation).toHaveProperty("builtin", "CoMap");
    expect(typeof Conversation.create).toBe("function");
  });
});
