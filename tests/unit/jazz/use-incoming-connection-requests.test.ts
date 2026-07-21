import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useIncomingConnectionRequests,
  useIncomingConnectionRequestInbox,
} from "@/jazz/use-incoming-connection-requests";

const accountMock = vi.fn();
vi.mock("jazz-tools/react", () => ({
  useAccount: () => accountMock(),
}));

// Partial mock: only Inbox is stubbed — the schema modules need the real
// co/z exports at import time.
const inboxLoadMock = vi.fn();
vi.mock("jazz-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jazz-tools")>();
  return {
    ...actual,
    Inbox: { load: (...args: unknown[]) => inboxLoadMock(...args) },
  };
});

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

describe("useIncomingConnectionRequestInbox (drain)", () => {
  beforeEach(() => {
    inboxLoadMock.mockReset();
  });

  test("record absent → does NOT subscribe (inbox untouched; Task 7 review)", async () => {
    // Migration-stuck account: incomingConnectionRequests never backfilled.
    // Subscribing would mark inbox messages processed with nowhere to
    // persist them — permanent loss. The drain must leave the inbox alone.
    const me = { $isLoaded: true, $jazz: { id: "me-account" }, root: {} };
    renderHook(() => useIncomingConnectionRequestInbox(me));
    await act(async () => {});
    expect(inboxLoadMock).not.toHaveBeenCalled();
  });

  test("record present → subscribes and persists arriving requests by ID", async () => {
    const setSpy = vi.fn();
    const record: Record<string, unknown> = {};
    (record as any).$jazz = { id: "record-1", set: setSpy };
    const me = {
      $isLoaded: true,
      $jazz: { id: "me-account" },
      root: { incomingConnectionRequests: record },
    };

    let drain: ((request: unknown) => Promise<void>) | undefined;
    const unsubscribe = vi.fn();
    inboxLoadMock.mockResolvedValue({
      subscribe: (_schema: unknown, cb: (request: unknown) => Promise<void>) => {
        drain = cb;
        return unsubscribe;
      },
    });

    const { unmount } = renderHook(() =>
      useIncomingConnectionRequestInbox(me),
    );
    await act(async () => {});
    expect(inboxLoadMock).toHaveBeenCalledTimes(1);
    expect(drain).toBeDefined();

    const request = { $jazz: { id: "req-1" } };
    await drain!(request);
    expect(setSpy).toHaveBeenCalledWith("req-1", request);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

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
