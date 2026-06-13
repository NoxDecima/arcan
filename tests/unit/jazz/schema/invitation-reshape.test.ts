import { describe, test, expect } from "vitest";
import { Invitation } from "@/jazz/schema/Invitation";

describe("Invitation (reshaped, multi-use)", () => {
  test("schema has channel + revokedAt, no consumed/recipient* fields", () => {
    const shape = (Invitation as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape.channel).toBeDefined();
    expect(shape.revokedAt).toBeDefined();
    expect(shape.consumed).toBeUndefined();
    expect(shape.recipientAccountID).toBeUndefined();
    expect(shape.recipientFingerprint).toBeUndefined();
    expect(shape.recipientDisplayName).toBeUndefined();
    expect(shape.acceptedAt).toBeUndefined();
  });
  test("inviter fields preserved", () => {
    const shape = (Invitation as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape.inviterAccountID).toBeDefined();
    expect(shape.inviterFingerprint).toBeDefined();
    expect(shape.inviterDisplayName).toBeDefined();
  });
});
