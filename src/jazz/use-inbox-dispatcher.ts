import { useEffect } from "react";
import { Inbox } from "jazz-tools";
import { ConnectionRequest } from "@/jazz/schema/ConnectionRequest";
import {
  handleConversationNotification,
  selfHealKnownConversations,
} from "@/jazz/conversation";
import { handleIncomingConnectionRequest } from "@/jazz/use-incoming-connection-requests";

/**
 * Single app-wide inbox dispatcher.
 *
 * WHY ONE SUBSCRIPTION: jazz-tools `Inbox.subscribe` consumers share ONE
 * processed feed and each receives EVERY message regardless of the schema
 * passed (verified at node_modules/jazz-tools/src/tools/coValues/inbox.ts —
 * `processMessage` loads any payload under the subscribed schema, runs the
 * callback, then marks the tx processed for ALL consumers). With the former
 * two subscriptions (conversation drain + connection drain), a replayed
 * ConnectionRequest could be consumed AND MARKED PROCESSED by the
 * conversation drain during the connection drain's mount/record-wait gap:
 * the sender received its end-to-end ack (deliveredAt stamped, retries
 * suppressed) while the recipient never persisted the request — permanent
 * silent loss. One subscription that routes by payload shape closes the
 * race structurally.
 *
 * GATING (Task 7 amendment pattern, now covering BOTH targets): consuming a
 * message marks it processed for both payload kinds, so the dispatcher must
 * not subscribe until EVERY persistence target is available —
 * me.root.knownConversations (conversation route) AND
 * me.root.incomingConnectionRequests (connection route). Unprocessed
 * messages are durable in the Inbox and replay on eventual subscribe, so
 * waiting is safe; consuming early is the loss mode.
 *
 * ROUTING: by raw payload fields. Schema proxies hide undeclared foreign
 * fields (a ConversationNotification read through the ConnectionRequest
 * schema has every declared field undefined), so the discriminants are read
 * via `$jazz.raw.get(...)` on the loaded CoValue instead.
 */
export type InboxRoute = "conversation" | "connection" | "ignore";

/**
 * Pure payload-shape → route decision.
 * - string `conversationID` → conversation drain (sidebar auto-discovery)
 * - string `requesterAccountID` → connection drain (pending-request record)
 * - neither → ignore (unknown payload kind; logged once by the dispatcher)
 * conversationID wins should both ever appear (impossible with the current
 * payload schemas — each carries exactly one of the two).
 */
export function routeInboxPayload(fields: {
  conversationID?: unknown;
  requesterAccountID?: unknown;
}): InboxRoute {
  if (typeof fields.conversationID === "string") return "conversation";
  if (typeof fields.requesterAccountID === "string") return "connection";
  return "ignore";
}

/** Raw CoMap field read; undefined when the value has no raw map. */
function rawField(value: any, key: string): unknown {
  const raw = value?.$jazz?.raw;
  return typeof raw?.get === "function" ? raw.get(key) : undefined;
}

/** Track warned IDs per-payload so every unknown shape is logged exactly once. */
const warnedUnknownPayloadIDs = new Set<string>();

/**
 * Mount ONCE in the authenticated branch of App.tsx — the ONLY place that
 * calls `inbox.subscribe`. The subscribed schema is ConnectionRequest so the
 * connection route receives the payload exactly as the old drain did; the
 * conversation route only needs the raw `conversationID` string (the handler
 * loads the Conversation itself).
 *
 * The effect re-runs when `me.$isLoaded` / `me.$jazz.id` change (sign-in /
 * account switch) or when either persistence target appears.
 */
export function useInboxDispatcher(me: any): void {
  const recordID = me?.root?.incomingConnectionRequests?.$jazz?.id;
  const knownID = me?.root?.knownConversations?.$jazz?.id;

  useEffect(() => {
    if (!me?.$isLoaded) return;
    // Either target absent → leave the inbox untouched (see GATING above).
    if (!recordID || !knownID) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    // Self-heal: remove any duplicate entries in knownConversations that
    // may have been created by two devices each appending the same ID before
    // CRDT sync merged their writes. Idempotent; silent; runs on every mount.
    // Ordering contract: the heal MUST run synchronously here, before the
    // async Inbox.load drain below opens — moving it into the async block
    // could race the drain's own push.
    selfHealKnownConversations(me);

    (async () => {
      try {
        const inbox = await Inbox.load(me);
        if (cancelled) return;
        unsubscribe = inbox.subscribe(
          ConnectionRequest,
          async (payload: any) => {
            const route = routeInboxPayload({
              conversationID: rawField(payload, "conversationID"),
              requesterAccountID: rawField(payload, "requesterAccountID"),
            });
            if (route === "conversation") {
              await handleConversationNotification(
                me,
                rawField(payload, "conversationID") as string,
              );
            } else if (route === "connection") {
              await handleIncomingConnectionRequest(me, payload);
            } else {
              const pid = String(payload?.$jazz?.id ?? "unknown");
              if (!warnedUnknownPayloadIDs.has(pid)) {
                warnedUnknownPayloadIDs.add(pid);
                console.warn(
                  "[inbox] Ignoring inbox payload of unknown shape:",
                  pid,
                );
              }
            }
          },
        );
      } catch (e) {
        console.warn("[inbox] Failed to subscribe to inbox:", e);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.$isLoaded, (me as any)?.$jazz?.id, recordID, knownID]);
}
