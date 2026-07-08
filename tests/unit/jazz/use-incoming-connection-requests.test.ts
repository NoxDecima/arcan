import { describe, test, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIncomingConnectionRequests } from "@/jazz/use-incoming-connection-requests";

const accountMock = vi.fn();
vi.mock("jazz-tools/react", () => ({
  useAccount: () => accountMock(),
}));

const FUTURE = new Date(Date.now() + 60_000);
const PAST = new Date(Date.now() - 60_000);

function makeRequest(id: string, overrides: Record<string, unknown> = {}) {
  return {
    $jazz: { id },
    requesterDisplayName: "Bob",
    requesterAccountID: "bob-account",
    expiresAt: FUTURE,
    ...overrides,
  };
}

function withRoot(incoming: unknown[], dismissedIDs: string[] = []) {
  accountMock.mockReturnValue({
    $isLoaded: true,
    root: {
      incomingRequests: incoming,
      dismissedRequestIDs: dismissedIDs,
    },
  });
}

describe("useIncomingConnectionRequests", () => {
  test("returns a pending request with dismissedLocally=false", () => {
    withRoot([makeRequest("req-1")]);
    const { result } = renderHook(() => useIncomingConnectionRequests());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].dismissedLocally).toBe(false);
  });

  test("locally-dismissed requests STAY in the list, flagged dismissedLocally", () => {
    // Walkthrough fix (2026-07-08): dismissing the incoming-connection modal
    // must not remove the request from the pending surfaces — only an explicit
    // approve/deny decision does. The hook reports the flag; the modal filters
    // on it, the pending list does not.
    withRoot([makeRequest("req-1")], ["req-1"]);
    const { result } = renderHook(() => useIncomingConnectionRequests());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].dismissedLocally).toBe(true);
  });

  test("approved and expired requests are filtered out", () => {
    withRoot([
      makeRequest("req-approved", { approvedAt: new Date() }),
      makeRequest("req-expired", { expiresAt: PAST }),
      makeRequest("req-live"),
    ]);
    const { result } = renderHook(() => useIncomingConnectionRequests());
    expect(result.current.map((p) => (p.request as any).$jazz.id)).toEqual([
      "req-live",
    ]);
  });
});
