import { useEffect } from "react";
import { useAccount } from "jazz-tools/react";
import { Inbox } from "jazz-tools";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { ConnectionRequest } from "@/jazz/schema/ConnectionRequest";

export interface PendingRequest {
  request: any;
  dismissedLocally: boolean;
}

/**
 * App-level inbox subscription — the ONLY place that calls
 * `inbox.subscribe(ConnectionRequest, …)`.
 *
 * jazz-tools' Inbox delivery is one-shot + destructive: each message is marked
 * `processed` in a persisted stream after first delivery, so a fresh subscription
 * skips already-processed messages on replay. Previously every consumer of
 * `useIncomingConnectionRequests` spun up its own subscription, so whichever
 * component mounted first (the app-wide IncomingConnectionPrompt) consumed and
 * marked-processed the request; navigating to /connections/pending is a full
 * reload, which remounted the hook with empty `useState` and a fresh
 * subscription that skipped the now-processed message → request lost forever.
 *
 * Mirroring useConversationInboxSubscription → me.root.knownConversations, this
 * hook drains the inbox exactly once (mounted once in App.tsx) and persists each
 * ConnectionRequest into `me.root.incomingRequests`, deduped by $jazz.id. Readers
 * read from that durable CoList and therefore survive reloads/navigation.
 *
 * The effect re-runs only when `me.$isLoaded` or `me.$jazz.id` changes (i.e. on
 * sign-in / account switch), not on every render.
 */
export function useIncomingConnectionRequestInbox(me: any): void {
  useEffect(() => {
    if (!me?.$isLoaded) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const inbox = await Inbox.load(me);
        if (cancelled) return;
        unsubscribe = inbox.subscribe(
          ConnectionRequest,
          async (request: any) => {
            try {
              const id = request?.$jazz?.id;
              if (!id) return;

              // Dedup against the durable list. Guard: $jazz.push is only
              // available when incomingRequests is a fully-loaded CoList (it is,
              // per the resolve in App.tsx); skip if it's a NotLoaded proxy.
              const list = me?.root?.incomingRequests;
              if (!list || typeof (list as any).$jazz?.push !== "function") return;
              const already = Array.from(list as Iterable<any>).some(
                (r: any) => r?.$jazz?.id === id,
              );
              if (already) return;

              (list as any).$jazz.push(request);
            } catch (e) {
              console.warn(
                "[connection-requests] Failed to persist incoming request:",
                e,
              );
            }
          },
        );
      } catch (e) {
        console.warn("[connection-requests] inbox subscribe failed:", e);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.$isLoaded, (me as any)?.$jazz?.id]);
}

/**
 * Read-only hook: resolves the durable `me.root.incomingRequests` list, applies
 * the approved/expired filter, and returns the pending set.
 *
 * Locally-dismissed requests are NOT filtered out (user decision, 2026-07-08
 * walkthrough): dismissing the modal is "not now", not a decision. They are
 * returned with `dismissedLocally: true` — the IncomingConnectionPrompt skips
 * them (stays closed), the pending surfaces keep showing them until an
 * explicit approve/deny.
 *
 * Does NOT create an inbox subscription — that lives solely in
 * useIncomingConnectionRequestInbox (mounted once in App.tsx). Both the
 * IncomingConnectionPrompt and the PendingConnectionsRoute call this hook; since
 * it only reads reactive CoState, multiple callers no longer race over a
 * destructive inbox.
 */
export function useIncomingConnectionRequests(): PendingRequest[] {
  const me = useAccount(ArcanAccount, {
    resolve: {
      root: {
        dismissedRequestIDs: true,
        incomingRequests: { $each: true },
      },
    },
  });

  if (!me.$isLoaded) return [];

  const dismissed = new Set(
    Array.from(((me as any).root?.dismissedRequestIDs as Iterable<string>) ?? []),
  );
  const incoming = Array.from(
    ((me as any).root?.incomingRequests as Iterable<any>) ?? [],
  );

  return incoming
    .filter(
      (r: any) =>
        r &&
        !r.approvedAt &&
        (!r.expiresAt || new Date(r.expiresAt).getTime() > Date.now()),
    )
    .map((r: any) => ({
      request: r,
      dismissedLocally: dismissed.has(r.$jazz.id),
    }));
}
