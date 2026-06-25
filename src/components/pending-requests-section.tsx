import { Link } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useIncomingConnectionRequests } from "@/jazz/use-incoming-connection-requests";
import {
  approveConnectionRequest,
  dismissConnectionRequest,
} from "@/jazz/invitations";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";

/**
 * Pending connection-request section for the sidebar contacts tab (Unit 9-7,
 * §2-I). Surfaces incoming requests as compact approve/decline cards.
 *
 * Reads the durable, read-only `useIncomingConnectionRequests()` hook (Unit
 * 9-0) — it does NOT open an inbox subscription (that lives once in App.tsx via
 * useIncomingConnectionRequestInbox). Approve/decline call the shared helpers in
 * src/jazz/invitations.ts so this surface and the full /connections/pending
 * route never diverge.
 *
 * Renders nothing when there are no pending requests.
 */
export function PendingRequestsSection() {
  const me = useAccount(ArcanAccount, { resolve: { profile: true } });
  const pending = useIncomingConnectionRequests();

  if (!me.$isLoaded) return null;
  if (pending.length === 0) return null;

  return (
    <section
      data-testid="pending-section"
      className="mb-2 flex flex-col gap-2 rounded-r-3 border border-hairline bg-panel p-2"
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">
          pending requests
        </span>
        <Link
          to="/connections/pending"
          className="text-[10px] text-arcan-accent"
          data-testid="pending-section-see-all"
        >
          see all
        </Link>
      </div>
      {pending.map(({ request }) => (
        <PendingRow key={(request as any).$jazz.id} me={me as any} request={request} />
      ))}
    </section>
  );
}

function PendingRow({ me, request }: { me: any; request: any }) {
  const r = request as any;
  const shared = useSharedGroups(r.requesterAccountID);
  const toast = useToast();

  return (
    <div
      data-testid="pending-section-row"
      data-request-id={r.$jazz.id}
      className="flex flex-col gap-2 rounded-r-3 bg-bg p-2"
    >
      <div className="flex items-center gap-2">
        <Avatar
          initials={r.requesterDisplayName?.[0] ?? "?"}
          size="sm"
          loadAs={me}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-text">
            {r.requesterDisplayName}
          </div>
          <div className="text-xs text-text-2">wants to connect</div>
          {shared.length > 0 && (
            <div className="text-[11px] text-arcan-accent">
              both in: {shared.map((s: any) => s.title).join(" · ")}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          data-testid="pending-section-approve"
          onClick={async () => {
            await approveConnectionRequest(me, request);
            toast({ icon: "check", text: "contact added", tone: "success" });
          }}
        >
          approve
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          data-testid="pending-section-decline"
          onClick={async () => {
            await dismissConnectionRequest(me, request);
            toast({ icon: "check", text: "request dismissed", tone: "neutral" });
          }}
        >
          decline
        </Button>
      </div>
    </div>
  );
}
