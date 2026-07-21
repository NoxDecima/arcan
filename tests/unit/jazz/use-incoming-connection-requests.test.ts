import { describe, test, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useIncomingConnectionRequests,
  handleIncomingConnectionRequest,
} from "@/jazz/use-incoming-connection-requests";

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

// The drain's SUBSCRIPTION lifecycle (single Inbox.load, record-absent
// no-subscribe gating — Task 7 pin, unmount unsubscribe) is pinned in
// tests/unit/jazz/use-inbox-dispatcher.test.ts: the shared-processed-feed
// hazard moved the subscribe into the single app-wide dispatcher. This file
// pins the persistence HANDLER the dispatcher routes connection payloads to.
describe("handleIncomingConnectionRequest (drain handler)", () => {
  function makeMe(record: unknown) {
    return {
      $isLoaded: true,
      $jazz: { id: "me-account" },
      root: { incomingConnectionRequests: record },
    };
  }

  function makeRecord() {
    const setSpy = vi.fn();
    const record: Record<string, unknown> = {};
    (record as any).$jazz = { id: "record-1", set: setSpy };
    return { record, setSpy };
  }

  test("persists arriving requests by CoValue ID", async () => {
    const { record, setSpy } = makeRecord();
    const request = { $jazz: { id: "req-1" }, requesterAccountID: "bob" };
    await handleIncomingConnectionRequest(makeMe(record), request);
    expect(setSpy).toHaveBeenCalledWith("req-1", request);
  });

  test("record absent → persists nothing, does not throw (defense in depth)", async () => {
    // The dispatcher must not even subscribe in this state (pinned in
    // use-inbox-dispatcher.test.ts); the handler additionally refuses to
    // act should it ever be reached with the record missing.
    const request = { $jazz: { id: "req-1" }, requesterAccountID: "bob" };
    await expect(
      handleIncomingConnectionRequest(makeMe(undefined), request),
    ).resolves.toBeUndefined();
  });

  test("foreign inbox payload (no requesterAccountID) is NOT persisted (FM4 shape guard)", async () => {
    // Inbox.subscribe does not filter by schema: ConversationNotification
    // payloads reach this drain too, with every ConnectionRequest field
    // undefined. Persisting one creates a phantom approvable pending row.
    // The dispatcher routes such payloads away; the handler keeps its own
    // guard for any other call path.
    const { record, setSpy } = makeRecord();
    // A ConversationNotification read through the ConnectionRequest schema.
    await handleIncomingConnectionRequest(makeMe(record), {
      $jazz: { id: "notif-1" },
      conversationID: "co_zConvo",
    });
    expect(setSpy).not.toHaveBeenCalled();
  });

  test("already-persisted ID → same-session skip (no second set)", async () => {
    const { record, setSpy } = makeRecord();
    const request = { $jazz: { id: "req-1" }, requesterAccountID: "bob" };
    (record as any)["req-1"] = request;
    await handleIncomingConnectionRequest(makeMe(record), request);
    expect(setSpy).not.toHaveBeenCalled();
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

  test("malformed entries (no requesterAccountID) never render (FM4 shape filter)", () => {
    // Records polluted before the drain shape guard existed can hold foreign
    // payloads — all ConnectionRequest fields undefined. They must not
    // surface as blank approvable rows.
    withRoot([
      { $jazz: { id: "notif-1" }, conversationID: "co_zConvo" },
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
