import { describe, test, expect } from "vitest";
import { Conversation } from "@/jazz/schema/Conversation";

describe("Conversation schema", () => {
  test("includes an optional icon field", () => {
    const shape = (Conversation as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape.icon).toBeDefined();
  });
});
