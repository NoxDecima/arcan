import { describe, test, expect } from "vitest";
import { SystemEvent } from "@/jazz/schema/SystemEvent";

describe("SystemEvent", () => {
  test("kind enum includes 'renamed'", () => {
    const shape = (SystemEvent as unknown as { shape: { kind: { options: string[] } } }).shape;
    expect(shape.kind.options).toContain("renamed");
  });
  test("optional newTitle field exists", () => {
    const shape = (SystemEvent as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape.newTitle).toBeDefined();
  });
});
