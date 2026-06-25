import { useEffect, useState } from "react";
import { useAccount } from "jazz-tools/react";
import { Inbox } from "jazz-tools";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { ConnectionRequest } from "@/jazz/schema/ConnectionRequest";

export interface PendingRequest {
  request: any;
  dismissedLocally: boolean;
}

/**
 * Subscribes to incoming ConnectionRequests via the Inbox and exposes the
 * non-dismissed, non-approved, non-expired set as React state.
 */
export function useIncomingConnectionRequests(): PendingRequest[] {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { dismissedRequestIDs: true } },
  });
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    // [SPIKE-9-0] temporary instrumentation — reverted in Phase 3.2
    console.log(
      "[SPIKE-RECIP] effect run; me.$isLoaded=", me.$isLoaded,
      "profileLoaded=", (me as any)?.profile?.$isLoaded,
      "profileInbox=", (me as any)?.profile?.inbox ?? "<none>",
    );
    if (!me.$isLoaded) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const inbox = await Inbox.load(me as any);
        console.log("[SPIKE-RECIP] Inbox.load OK");
        if (cancelled) return;
        unsub = inbox.subscribe(ConnectionRequest, async (req: any) => {
          console.log(
            "[SPIKE-RECIP] subscribe CALLBACK fired id=", req?.$jazz?.id,
            "channel=", (req as any)?.channel,
            "recipient=", (req as any)?.recipientAccountID,
          );
          setItems((cur) => {
            const id = req?.$jazz?.id;
            if (!id) return cur;
            if (cur.some((c) => (c as any)?.$jazz?.id === id)) return cur;
            return [...cur, req];
          });
        });
        console.log("[SPIKE-RECIP] inbox.subscribe registered");
      } catch (e) {
        console.log("[SPIKE-RECIP] Inbox.load/subscribe THREW:", String(e));
        console.warn("[connection-requests] inbox subscribe failed:", e);
      }
    })();
    return () => { cancelled = true; unsub?.(); };
  }, [me.$isLoaded]);

  const dismissed = new Set(
    Array.from(((me as any).root?.dismissedRequestIDs as Iterable<string>) ?? [])
  );
  const result = items
    .filter((r: any) => !r?.approvedAt && (!r?.expiresAt || new Date(r.expiresAt).getTime() > Date.now()))
    .map((r: any) => ({ request: r, dismissedLocally: dismissed.has(r.$jazz.id) }))
    .filter((p) => !p.dismissedLocally);
  // [SPIKE-9-0] temporary instrumentation — reverted in Phase 3.2
  console.log("[SPIKE-RECIP] render; rawItems=", items.length, "postFilterItems=", result.length);
  return result;
}
