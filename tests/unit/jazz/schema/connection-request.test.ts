import { describe, test, expect } from "vitest";
import { ConnectionRequest } from "@/jazz/schema/ConnectionRequest";

describe("ConnectionRequest schema", () => {
  test("has the expected field shape", () => {
    const shape = (ConnectionRequest as unknown as { shape: Record<string, unknown> }).shape;
    for (const field of [
      "requesterAccountID", "requesterFingerprint", "requesterDisplayName",
      "recipientAccountID", "channel", "invitationID",
      "createdAt", "expiresAt", "approvedAt",
    ]) {
      expect(shape[field], `missing field: ${field}`).toBeDefined();
    }
  });
  test("does NOT include rejectedAt — dismiss is local-only", () => {
    const shape = (ConnectionRequest as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape.rejectedAt).toBeUndefined();
  });
});
