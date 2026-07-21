import { Link, useNavigate } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useIncomingConnectionRequests } from "@/jazz/use-incoming-connection-requests";
import {
  approveConnectionRequest,
  denyConnectionRequest,
} from "@/jazz/invitations";
import { useAccountAvatars } from "@/components/use-account-avatars";
import { HAv, PSectionLabel, Icon, tapClass } from "@/ui/kit";
import { useToast } from "@/components/toast";

/**
 * Pending connection-request section for the sidebar contacts tab (Unit 9-7,
 * §2-I). Surfaces incoming requests as single-line rows (user decision,
 * 2026-07-08 walkthrough): the row body opens the requester's profile page;
 * inline ✓ approves, ✗ denies — no buttons row below.
 *
 * Reads the durable, read-only `useIncomingConnectionRequests()` hook (Unit
 * 9-0) — it does NOT open an inbox subscription (that lives once in App.tsx via
 * useInboxDispatcher). Approve/deny call the shared helpers in
 * src/jazz/invitations.ts so this surface and the full /connections/pending
 * route never diverge.
 *
 * Renders nothing when there are no pending requests.
 */
export function PendingRequestsSection() {
  const me = useAccount(ArcanAccount, { resolve: { profile: true } });
  const pending = useIncomingConnectionRequests();
  const avatars = useAccountAvatars(
    me,
    pending
      .map(({ request }) => (request as any).requesterAccountID as string)
      .filter(Boolean),
  );

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
        <PendingRow
          key={(request as any).$jazz.id}
          me={me as any}
          request={request}
          avatarSrc={avatars.get((request as any).requesterAccountID)}
        />
      ))}
    </section>
  );
}

function PendingRow({
  me,
  request,
  avatarSrc,
}: {
  me: any;
  request: any;
  avatarSrc?: string;
}) {
  const r = request as any;
  const toast = useToast();
  const navigate = useNavigate();

  return (
    <div
      data-testid="pending-section-row"
      data-request-id={r.$jazz.id}
      className="flex items-center gap-2 px-1 py-2"
    >
      <button
        type="button"
        className={`${tapClass} flex-1 min-w-0 gap-2.5 text-left`}
        onClick={() => navigate(`/profile/${r.requesterAccountID}`)}
        data-testid="pending-section-open-profile"
      >
        <HAv
          txt={r.requesterDisplayName?.[0] ?? "?"}
          src={avatarSrc}
          size={32}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-body font-semibold text-ui-contact text-text">
            {r.requesterDisplayName}
          </div>
          <div className="font-body text-ui-sub text-dim">wants to connect</div>
        </div>
      </button>
      <button
        type="button"
        aria-label="approve request"
        className={`${tapClass} w-8 h-8 shrink-0 justify-center rounded-r-3 border border-hairline text-arcan-accent`}
        onClick={async () => {
          await approveConnectionRequest(me, request);
          toast({ icon: "check", text: "contact added", tone: "success" });
        }}
        data-testid="pending-section-approve"
      >
        <Icon d="check" size={15} />
      </button>
      <button
        type="button"
        aria-label="deny request"
        className={`${tapClass} w-8 h-8 shrink-0 justify-center rounded-r-3 border border-hairline text-red`}
        onClick={async () => {
          await denyConnectionRequest(me, request);
          toast({ icon: "check", text: "request denied", tone: "neutral" });
        }}
        data-testid="pending-section-decline"
      >
        <Icon d="close" size={15} />
      </button>
    </div>
  );
}
