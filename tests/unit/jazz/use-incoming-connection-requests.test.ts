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
    createdAt: new Date(Date.now() - 10_000),
    expiresAt: FUTURE,
    ...overrides,
  };
}

function withRoot(incoming: any[], dismissedIDs: string[] = []) {
  const record: Record<string, any> = {};
  for (const r of incoming) record[r.$jazz.id] = r;
  const dismissed: Record<string, boolean> = {};
  for (const id of dismissedIDs) dismissed[id] = true;
  accountMock.mockReturnValue({
    $isLoaded: true,
    root: {
      incomingConnectionRequests: record,
      dismissedRequests: dismissed,
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
    withRoot([makeRequest("req-1")], ["req-1"]);
    const { result } = renderHook(() => useIncomingConnectionRequests());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].dismissedLocally).toBe(true);
  });

  test("approved, denied, and expired requests are filtered out", () => {
    withRoot([
      makeRequest("req-approved", { approvedAt: new Date() }),
      makeRequest("req-denied", { deniedAt: new Date() }),
      makeRequest("req-expired", { expiresAt: PAST }),
      makeRequest("req-live"),
    ]);
    const { result } = renderHook(() => useIncomingConnectionRequests());
    expect(result.current.map((p) => (p.request as any).$jazz.id)).toEqual([
      "req-live",
    ]);
  });

  test("collapses duplicate requests per requester — latest createdAt wins (FM1 belt)", () => {
    withRoot([
      makeRequest("req-old", { createdAt: new Date(Date.now() - 60_000) }),
      makeRequest("req-new", { createdAt: new Date(Date.now() - 1_000) }),
      makeRequest("req-other", {
        requesterAccountID: "carol-account",
        createdAt: new Date(Date.now() - 30_000),
      }),
    ]);
    const { result } = renderHook(() => useIncomingConnectionRequests());
    expect(result.current.map((p) => (p.request as any).$jazz.id)).toEqual([
      "req-other",
      "req-new",
    ]);
  });
});
