import { describe, test, expect, vi } from "vitest";
import {
  denyConnectionRequest,
  dismissConnectionRequest,
} from "@/jazz/invitations";

function makeRecipient(incomingIDs: string[], dismissedIDs: string[] = []) {
  const removeSpy = vi.fn();
  const pushDismissedSpy = vi.fn();
  const incoming = incomingIDs.map((id) => ({ $jazz: { id } }));
  const dismissed: string[] & { $jazz?: unknown } = [...dismissedIDs];
  (dismissed as any).$jazz = { push: pushDismissedSpy };
  const recipient = {
    root: {
      incomingRequests: Object.assign(incoming, {
        $jazz: { remove: removeSpy },
      }),
      dismissedRequestIDs: dismissed,
    },
  };
  return { recipient, removeSpy, pushDismissedSpy };
}

describe("denyConnectionRequest", () => {
  test("removes the request from incomingRequests by $jazz.id", async () => {
    const { recipient, removeSpy } = makeRecipient(["req-1", "req-2"]);
    await denyConnectionRequest(recipient as any, {
      $jazz: { id: "req-1", set: vi.fn() },
    } as any);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    const predicate = removeSpy.mock.calls[0][0];
    expect(predicate({ $jazz: { id: "req-1" } })).toBe(true);
    expect(predicate({ $jazz: { id: "req-2" } })).toBe(false);
  });

  test("also records the ID in dismissedRequestIDs (modal stays muted)", async () => {
    const { recipient, pushDismissedSpy } = makeRecipient(["req-1"]);
    await denyConnectionRequest(recipient as any, {
      $jazz: { id: "req-1", set: vi.fn() },
    } as any);
    expect(pushDismissedSpy).toHaveBeenCalledWith("req-1");
  });

  test("does not duplicate an already-recorded dismissed ID", async () => {
    const { recipient, pushDismissedSpy } = makeRecipient(["req-1"], ["req-1"]);
    await denyConnectionRequest(recipient as any, {
      $jazz: { id: "req-1", set: vi.fn() },
    } as any);
    expect(pushDismissedSpy).not.toHaveBeenCalled();
  });

  test("stamps deniedAt on the shared request", async () => {
    const { recipient } = makeRecipient(["req-1"]);
    const setSpy = vi.fn();
    const request = { $jazz: { id: "req-1", set: setSpy } } as any;
    await denyConnectionRequest(recipient as any, request);
    expect(setSpy).toHaveBeenCalledWith("deniedAt", expect.any(Date));
  });

  test("does not re-stamp deniedAt when already set", async () => {
    const { recipient } = makeRecipient(["req-1"]);
    const setSpy = vi.fn();
    const request = {
      deniedAt: new Date(),
      $jazz: { id: "req-1", set: setSpy },
    } as any;
    await denyConnectionRequest(recipient as any, request);
    expect(setSpy).not.toHaveBeenCalled();
  });
});

describe("dismissConnectionRequest", () => {
  test("only records the ID — does NOT touch incomingRequests", async () => {
    const { recipient, removeSpy, pushDismissedSpy } = makeRecipient(["req-1"]);
    await dismissConnectionRequest(recipient as any, {
      $jazz: { id: "req-1" },
    } as any);
    expect(pushDismissedSpy).toHaveBeenCalledWith("req-1");
    expect(removeSpy).not.toHaveBeenCalled();
  });
});
