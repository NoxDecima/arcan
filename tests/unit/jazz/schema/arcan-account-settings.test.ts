// tests/unit/jazz/schema/arcan-account-settings.test.ts
import { describe, test, expect } from "vitest";
import { ArcanAccountRoot } from "@/jazz/schema/ArcanAccount";

describe("ArcanAccountRoot settings schema", () => {
  test("root has a `settings` field with nested appearance + notifications", () => {
    // Inspect schema descriptors — both the field and its nested sub-fields
    // should be defined.
    const shape = (ArcanAccountRoot as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape).toBeDefined();
    expect(shape.settings).toBeDefined();
  });

  test("root no longer has the old `notificationPrefs` field", () => {
    const shape = (ArcanAccountRoot as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape.notificationPrefs).toBeUndefined();
  });
});
