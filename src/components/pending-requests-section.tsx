import { Link } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useIncomingConnectionRequests } from "@/jazz/use-incoming-connection-requests";
import {
  approveConnectionRequest,
  dismissConnectionRequest,
} from "@/jazz/invitations";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import { HAv, PSectionLabel, PButton, MuteLink, tapClass } from "@/ui/kit";
import { useToast } from "@/components/toast";

/**
 * Pending connection-request section for the sidebar contacts tab (Unit 9-7,
 * §2-I). Surfaces incoming requests as compact approve/decline rows.
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
      className="px-2 pb-2 flex flex-col gap-1"
    >
      <div className="flex items-center justify-between">
        <PSectionLabel>pending</PSectionLabel>
        <Link
          to="/connections/pending"
          className="pr-1 font-body text-ui-sub text-arcan-accent pb-2"
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
      className="flex flex-col gap-2 px-1 py-2"
    >
      <div className="flex items-center gap-2.5">
        <HAv txt={r.requesterDisplayName?.[0] ?? "?"} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-body font-semibold text-ui-contact text-text">
            {r.requesterDisplayName}
          </div>
          <div className="font-body text-ui-sub text-dim">wants to connect</div>
          {shared.length > 0 && (
            <div className="font-body text-ui-sub text-arcan-accent">
              both in: {shared.map((s: any) => s.title).join(" · ")}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 pl-[42px]">
        <PButton
          primary
          label="approve"
          data-testid="pending-section-approve"
          onClick={async () => {
            await approveConnectionRequest(me, request);
            toast({ icon: "check", text: "contact added", tone: "success" });
          }}
        />
        <button
          type="button"
          className={tapClass}
          onClick={async () => {
            await dismissConnectionRequest(me, request);
            toast({ icon: "check", text: "request dismissed", tone: "neutral" });
          }}
          data-testid="pending-section-decline"
        >
          <MuteLink>decline</MuteLink>
        </button>
      </div>
    </div>
  );
}
