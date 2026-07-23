import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  routeInboxPayload,
  useInboxDispatcher,
} from "@/jazz/use-inbox-dispatcher";

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

// The conversation-side handler + self-heal are mocked: the dispatcher tests
// pin the ROUTING/GATING wiring; handleConversationNotification's own
// persistence behavior is pinned in known-conversations-dedup.test.ts against
// real Jazz test accounts.
const handleConversationMock = vi.fn();
const selfHealMock = vi.fn();
vi.mock("@/jazz/conversation", () => ({
  handleConversationNotification: (...args: unknown[]) =>
    handleConversationMock(...args),
  selfHealKnownConversations: (...args: unknown[]) => selfHealMock(...args),
}));

/**
 * Inbox payload double: proxy fields spread on top (what the connection
 * handler reads) + $jazz.raw.get (what the dispatcher routes by — schema
 * proxies hide undeclared foreign fields, raw reads do not).
 */
function makePayload(id: string, fields: Record<string, unknown>) {
  return {
    ...fields,
    $jazz: {
      id,
      raw: { get: (k: string) => (fields as Record<string, unknown>)[k] },
    },
  };
}

function makeMe(overrides: { record?: unknown; known?: unknown } = {}) {
  const setSpy = vi.fn();
  // Genuinely usable records carry $isLoaded: true (jazz-tools 0.20.18 sets
  // it at construction for every loaded CoValue — see the shape notes in
  // handshake.ts isPrunableForeignIncomingEntry). The gate must require it.
  const record: Record<string, unknown> = {};
  (record as any).$isLoaded = true;
  (record as any).$jazz = { id: "record-1", set: setSpy };
  const known: Record<string, unknown> = {};
  (known as any).$isLoaded = true;
  (known as any).$jazz = { id: "known-1", push: vi.fn() };
  const me = {
    $isLoaded: true,
    $jazz: { id: "me-account" },
    root: {
      incomingConnectionRequests:
        "record" in overrides ? overrides.record : record,
      knownConversations: "known" in overrides ? overrides.known : known,
    },
  };
  return { me, setSpy };
}

/**
 * The phantom/loading STUB shape: what a set-but-unusable record field reads
 * as off a subscription proxy — truthy, `$jazz.id` present, `$isLoaded:
 * false` (createUnloadedCoValue for UNAVAILABLE/UNAUTHORIZED/DELETED/LOADING;
 * pinned against the real runtime in backfill-recovery.test.ts "dispatcher
 * gate shapes"). Gating on `$jazz.id` alone accepted this — the wedge that
 * let the dispatcher consume inbox messages with nowhere to persist them.
 */
function makeStub(id: string) {
  return { $jazz: { id, loadingState: "unavailable" }, $isLoaded: false };
}

describe("routeInboxPayload (pure)", () => {
  test("string conversationID → conversation", () => {
    expect(routeInboxPayload({ conversationID: "co_zConvo" })).toBe(
      "conversation",
    );
  });

  test("string requesterAccountID → connection", () => {
    expect(routeInboxPayload({ requesterAccountID: "co_zBob" })).toBe(
      "connection",
    );
  });

  test("neither field → ignore", () => {
    expect(routeInboxPayload({})).toBe("ignore");
  });

  test("non-string field values → ignore (shape, not mere presence)", () => {
    expect(
      routeInboxPayload({ conversationID: 42, requesterAccountID: null }),
    ).toBe("ignore");
  });

  test("both fields present → conversation wins (documented precedence)", () => {
    // Impossible with current payload schemas (each carries exactly one of
    // the two); pinned so the precedence is deliberate, not incidental.
    expect(
      routeInboxPayload({
        conversationID: "co_zConvo",
        requesterAccountID: "co_zBob",
      }),
    ).toBe("conversation");
  });
});

describe("useInboxDispatcher — gating (Task 7 pin, now covering BOTH targets)", () => {
  beforeEach(() => {
    inboxLoadMock.mockReset();
    handleConversationMock.mockReset();
    selfHealMock.mockReset();
  });

  test("incomingConnectionRequests absent → does NOT subscribe (inbox untouched)", async () => {
    // Migration-stuck account: incomingConnectionRequests never backfilled.
    // Subscribing would mark inbox messages processed with nowhere to persist
    // ConnectionRequests — permanent loss. The dispatcher must leave the
    // inbox alone even though knownConversations IS ready.
    const { me } = makeMe({ record: undefined });
    renderHook(() => useInboxDispatcher(me));
    await act(async () => {});
    expect(inboxLoadMock).not.toHaveBeenCalled();
  });

  test("knownConversations absent → does NOT subscribe (inbox untouched)", async () => {
    // Same loss mode on the conversation side: the shared processed feed
    // means consuming for ONE kind marks the message processed for BOTH.
    // Until every persistence target is ready, nothing may be consumed.
    const { me } = makeMe({ known: undefined });
    renderHook(() => useInboxDispatcher(me));
    await act(async () => {});
    expect(inboxLoadMock).not.toHaveBeenCalled();
  });

  test("me not loaded → does NOT subscribe", async () => {
    renderHook(() => useInboxDispatcher({ $isLoaded: false }));
    await act(async () => {});
    expect(inboxLoadMock).not.toHaveBeenCalled();
  });

  test("phantom STUB incomingConnectionRequests ($isLoaded false, $jazz.id present) → does NOT subscribe", async () => {
    // The phantom-wedge loss mode: a stub satisfies a bare `$jazz.id` gate,
    // the dispatcher subscribes, the handler early-returns on the unusable
    // record, jazz marks the message processed, the sender gets its ack —
    // the request is permanently lost. The gate must require a genuinely
    // USABLE record ($isLoaded === true); unconsumed messages stay durable.
    const { me } = makeMe({ record: makeStub("co_zPhantomRecord") });
    renderHook(() => useInboxDispatcher(me));
    await act(async () => {});
    expect(inboxLoadMock).not.toHaveBeenCalled();
  });

  test("phantom STUB knownConversations → does NOT subscribe (same hole, conversation side)", async () => {
    const { me } = makeMe({ known: makeStub("co_zPhantomKnown") });
    renderHook(() => useInboxDispatcher(me));
    await act(async () => {});
    expect(inboxLoadMock).not.toHaveBeenCalled();
  });

  test("null record read → does NOT subscribe (absent branch)", async () => {
    // Defensive shape: a field-caught phantom actually reads as the STUB
    // (empirical pin in backfill-recovery.test.ts), but null reads must
    // gate too — the absent branch covers them.
    const { me } = makeMe({ record: null });
    renderHook(() => useInboxDispatcher(me));
    await act(async () => {});
    expect(inboxLoadMock).not.toHaveBeenCalled();
  });
});

describe("useInboxDispatcher — single subscription, routed drain", () => {
  beforeEach(() => {
    inboxLoadMock.mockReset();
    handleConversationMock.mockReset();
    selfHealMock.mockReset();
  });

  function mountWithDrain(me: any) {
    let drain: ((payload: unknown) => Promise<void>) | undefined;
    const unsubscribe = vi.fn();
    inboxLoadMock.mockResolvedValue({
      subscribe: (
        _schema: unknown,
        cb: (payload: unknown) => Promise<void>,
      ) => {
        drain = cb;
        return unsubscribe;
      },
    });
    const rendered = renderHook(() => useInboxDispatcher(me));
    return { rendered, unsubscribe, drain: () => drain };
  }

  test("both targets ready → exactly ONE Inbox.load + subscribe; unmount unsubscribes", async () => {
    const { me } = makeMe();
    const { rendered, unsubscribe, drain } = mountWithDrain(me);
    await act(async () => {});
    expect(inboxLoadMock).toHaveBeenCalledTimes(1);
    expect(drain()).toBeDefined();
    rendered.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test("self-heal runs synchronously before the async drain opens", async () => {
    const { me } = makeMe();
    mountWithDrain(me);
    // No await yet: the heal must already have run (ordering contract from
    // useConversationInboxSubscription — heal before the drain can push).
    expect(selfHealMock).toHaveBeenCalledWith(me);
    await act(async () => {});
  });

  test("connection payload → persisted by ID into incomingConnectionRequests; conversation handler untouched", async () => {
    const { me, setSpy } = makeMe();
    const { drain } = mountWithDrain(me);
    await act(async () => {});

    const request = makePayload("req-1", { requesterAccountID: "co_zBob" });
    await drain()!(request);
    expect(setSpy).toHaveBeenCalledWith("req-1", request);
    expect(handleConversationMock).not.toHaveBeenCalled();
  });

  test("conversation payload → routed to handleConversationNotification; request record untouched", async () => {
    const { me, setSpy } = makeMe();
    const { drain } = mountWithDrain(me);
    await act(async () => {});

    const notification = makePayload("notif-1", {
      conversationID: "co_zConvo",
    });
    await drain()!(notification);
    expect(handleConversationMock).toHaveBeenCalledTimes(1);
    expect(handleConversationMock).toHaveBeenCalledWith(me, "co_zConvo");
    expect(setSpy).not.toHaveBeenCalled();
  });

  test("replayed ConnectionRequest cannot be eaten by the conversation route (FM-race pin)", async () => {
    // The hazard this dispatcher exists for: with two subscriptions sharing
    // one processed feed, a replayed ConnectionRequest could be consumed by
    // the conversation drain during the connection drain's mount gap. With
    // ONE subscription, a request payload MUST reach the request record even
    // when interleaved with conversation notifications.
    const { me, setSpy } = makeMe();
    const { drain } = mountWithDrain(me);
    await act(async () => {});

    await drain()!(makePayload("notif-1", { conversationID: "co_zA" }));
    await drain()!(makePayload("req-1", { requesterAccountID: "co_zBob" }));
    await drain()!(makePayload("notif-2", { conversationID: "co_zB" }));

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith("req-1", expect.anything());
    expect(handleConversationMock).toHaveBeenCalledTimes(2);
  });

  test("unknown payload shape → ignored (no persist, no conversation handler, no throw)", async () => {
    const { me, setSpy } = makeMe();
    const { drain } = mountWithDrain(me);
    await act(async () => {});

    await drain()!(makePayload("mystery-1", { something: "else" }));
    expect(setSpy).not.toHaveBeenCalled();
    expect(handleConversationMock).not.toHaveBeenCalled();
  });

  test("payload without $jazz.raw → ignored, no throw", async () => {
    const { me, setSpy } = makeMe();
    const { drain } = mountWithDrain(me);
    await act(async () => {});

    await drain()!({ requesterAccountID: "co_zBob" }); // no $jazz at all
    expect(setSpy).not.toHaveBeenCalled();
    expect(handleConversationMock).not.toHaveBeenCalled();
  });
});
