import { describe, test, expect, vi } from "vitest";
import {
  denyConnectionRequest,
  dismissConnectionRequest,
} from "@/jazz/invitations";

function makeRecipient(incomingIDs: string[], dismissedIDs: string[] = []) {
  const deleteSpy = vi.fn();
  const setDismissedSpy = vi.fn();
  const incoming: Record<string, any> = {};
  for (const id of incomingIDs) incoming[id] = { $jazz: { id } };
  (incoming as any).$jazz = { delete: deleteSpy };
  const dismissed: Record<string, any> = {};
  for (const id of dismissedIDs) dismissed[id] = true;
  (dismissed as any).$jazz = { set: setDismissedSpy };
  const recipient = {
    root: {
      incomingConnectionRequests: incoming,
      dismissedRequests: dismissed,
    },
  };
  return { recipient, deleteSpy, setDismissedSpy };
}

describe("denyConnectionRequest", () => {
  test("deletes the request key from incomingConnectionRequests", async () => {
    const { recipient, deleteSpy } = makeRecipient(["req-1", "req-2"]);
    await denyConnectionRequest(recipient as any, {
      $jazz: { id: "req-1", set: vi.fn() },
    } as any);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith("req-1");
  });

  test("records the ID in dismissedRequests (modal stays muted)", async () => {
    const { recipient, setDismissedSpy } = makeRecipient(["req-1"]);
    await denyConnectionRequest(recipient as any, {
      $jazz: { id: "req-1", set: vi.fn() },
    } as any);
    expect(setDismissedSpy).toHaveBeenCalledWith("req-1", true);
  });

  test("stamps deniedAt on the shared request", async () => {
    const { recipient } = makeRecipient(["req-1"]);
    const setSpy = vi.fn();
    await denyConnectionRequest(recipient as any, {
      $jazz: { id: "req-1", set: setSpy },
    } as any);
    expect(setSpy).toHaveBeenCalledWith("deniedAt", expect.any(Date));
  });

  test("does not re-stamp deniedAt when already set", async () => {
    const { recipient } = makeRecipient(["req-1"]);
    const setSpy = vi.fn();
    await denyConnectionRequest(recipient as any, {
      deniedAt: new Date(),
      $jazz: { id: "req-1", set: setSpy },
    } as any);
    expect(setSpy).not.toHaveBeenCalled();
  });
});

describe("dismissConnectionRequest", () => {
  test("only records the ID — does NOT touch incomingConnectionRequests", async () => {
    const { recipient, deleteSpy, setDismissedSpy } = makeRecipient(["req-1"]);
    await dismissConnectionRequest(recipient as any, {
      $jazz: { id: "req-1" },
    } as any);
    expect(setDismissedSpy).toHaveBeenCalledWith("req-1", true);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
