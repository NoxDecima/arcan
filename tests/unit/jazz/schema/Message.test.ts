import { describe, it, expect } from "vitest";
import { Message } from "@/jazz/schema/Message";

describe("Message schema", () => {
  it("is defined and exported", () => {
    expect(Message).toBeDefined();
    expect(Message).toHaveProperty("builtin", "CoMap");
    expect(typeof Message.create).toBe("function");
  });
});
