import { describe, test, expect } from "vitest";
import { EphemeralPairing } from "@/jazz/schema/EphemeralPairing";

describe("EphemeralPairing enriched fields", () => {
  test("schema includes the five new optional fields", () => {
    const shape = (EphemeralPairing as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape.responderUserAgent).toBeDefined();
    expect(shape.responderFirstSeenAt).toBeDefined();
    expect(shape.responderFingerprint).toBeDefined();
    expect(shape.approvedAt).toBeDefined();
    expect(shape.rejectedAt).toBeDefined();
  });
});
