import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";

export interface PendingRequest {
  request: any;
  dismissedLocally: boolean;
}

/**
 * Connection-request drain handler: persist an arriving ConnectionRequest
 * into the durable me.root.incomingConnectionRequests co.record, KEYED BY
 * REQUEST COVALUE ID. Two sessions racing the drain issue same-key sets that
 * converge by LWW instead of concurrent list appends that both survive
 * (FM2) — the three-layer dedup the legacy CoList needed is structural here.
 *
 * Routed to by useInboxDispatcher (src/jazz/use-inbox-dispatcher.ts) — the
 * single app-wide inbox subscription (Unit 9-0 one-shot semantics; see git
 * history for the full diagnosis). This used to be the callback body of a
 * dedicated useIncomingConnectionRequestInbox hook; owning a second
 * `inbox.subscribe` was the shared-processed-feed hazard (the conversation
 * drain could consume-and-mark-processed a ConnectionRequest during this
 * drain's mount/record-wait gap — the sender got its end-to-end ack while
 * the request was never persisted, permanent silent loss).
 */
export async function handleIncomingConnectionRequest(
  me: any,
  request: any,
): Promise<void> {
  try {
    const id = request?.$jazz?.id;
    if (!id) return;

    // Guard: $jazz.set is only available when the record is a fully-loaded
    // CoMap (it is, per the resolve in App.tsx — and the dispatcher refuses
    // to subscribe at all while the record is absent).
    const record = me?.root?.incomingConnectionRequests;
    if (!record || typeof (record as any).$jazz?.set !== "function") {
      return;
    }
    // Shape guard (FM4 e2e finding, 2026-07-21): Inbox.subscribe does NOT
    // filter by schema — EVERY inbox message's payload is loaded under the
    // subscribed schema, including ConversationNotification payloads
    // (verified against jazz-tools src/tools/coValues/inbox.ts
    // processMessage). A foreign payload read through the ConnectionRequest
    // schema has all fields undefined; persisting it creates a phantom
    // pending row whose approve stamps an unrelated CoValue. The dispatcher
    // routes by raw payload shape, so foreign payloads should never reach
    // this handler — kept as defense in depth for any other call path.
    if (typeof (request as any)?.requesterAccountID !== "string") {
      return;
    }

    if ((record as any)[id]) return; // cheap same-session skip
    (record as any).$jazz.set(id, request);
  } catch (e) {
    console.warn(
      "[connection-requests] Failed to persist incoming request:",
      e,
    );
  }
}

/**
 * Migration-pending READ fallback (same pattern as handshake.ts's
 * legacyContactBookEntries, per the Task 4 review amendment): the migration's
 * backfill retries forever when a legacy request ref is permanently
 * unavailable — for such an account me.root.incomingConnectionRequests stays
 * ABSENT indefinitely. Absent (undefined/null) is NOT the same as an empty
 * record: it means "backfill pending", and readers must fall back to the
 * legacy CoLists so pending requests don't vanish from the UI. Read-only —
 * the legacy lists are write-frozen from this slice on.
 */
function legacyIncomingEntries(me: any): any[] {
  const legacy = me?.root?.incomingRequests;
  if (!legacy) return [];
  try {
    return (Array.from(legacy as Iterable<any>) as any[]).filter(
      (r: any) => r && r.$jazz?.id,
    );
  } catch {
    return [];
  }
}

/** Same migration-pending fallback for the dismissed-request lookup. */
function legacyDismissedLookup(me: any): Record<string, boolean> {
  const legacy = me?.root?.dismissedRequestIDs;
  if (!legacy) return {};
  try {
    const out: Record<string, boolean> = {};
    for (const id of Array.from(legacy as Iterable<string>)) {
      if (typeof id === "string") out[id] = true;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Read-only hook over the durable record. Filters approved/denied/expired,
 * then collapses rows PER REQUESTER (latest createdAt wins — FM1 belt:
 * duplicate real requests from the same person render as one row). Sorted
 * by createdAt so ordering is stable (records have no insertion order).
 *
 * Locally-dismissed requests are NOT filtered out (user decision, 2026-07-08
 * walkthrough): they return with `dismissedLocally: true` — the prompt skips
 * them, the pending surfaces keep showing them.
 */
export function useIncomingConnectionRequests(): PendingRequest[] {
  // $onError: "catch" at the $each level (Task 6 review amendment): one
  // unavailable child request must not stall $isLoaded for the whole record.
  // Caught entries resolve to null — the `r &&` filter below covers them.
  const me = useAccount(ArcanAccount, {
    resolve: {
      root: {
        dismissedRequests: true,
        incomingConnectionRequests: { $each: { $onError: "catch" } },
      },
    },
  });

  if (!me.$isLoaded) return [];

  const dismissedRecord = (me as any).root?.dismissedRequests;
  const dismissed: Record<string, boolean> =
    dismissedRecord == null
      ? legacyDismissedLookup(me)
      : (dismissedRecord as Record<string, boolean>);
  const incomingRecord = (me as any).root?.incomingConnectionRequests;
  const incoming =
    incomingRecord == null
      ? legacyIncomingEntries(me)
      : Object.values(incomingRecord as Record<string, any>);

  const live = incoming.filter(
    (r: any) =>
      r &&
      // Shape filter (FM4 e2e finding): records polluted before the drain's
      // shape guard existed can hold foreign payloads (all fields undefined
      // through this schema). Never render them as approvable rows.
      typeof r.requesterAccountID === "string" &&
      !r.approvedAt &&
      !r.deniedAt &&
      (!r.expiresAt || new Date(r.expiresAt).getTime() > Date.now()),
  );

  const latestByRequester = new Map<string, any>();
  for (const r of live) {
    const key = (r.requesterAccountID as string) ?? r.$jazz.id;
    const prev = latestByRequester.get(key);
    if (
      !prev ||
      new Date(r.createdAt ?? 0).getTime() >
        new Date(prev.createdAt ?? 0).getTime()
    ) {
      latestByRequester.set(key, r);
    }
  }

  return Array.from(latestByRequester.values())
    .sort(
      (a: any, b: any) =>
        new Date(a.createdAt ?? 0).getTime() -
        new Date(b.createdAt ?? 0).getTime(),
    )
    .map((r: any) => ({
      request: r,
      dismissedLocally: !!dismissed[r.$jazz.id],
    }));
}
