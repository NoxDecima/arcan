import { useNavigate } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useIncomingConnectionRequests } from "@/jazz/use-incoming-connection-requests";
import { approveConnectionRequest, denyConnectionRequest } from "@/jazz/invitations";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import { useAccountAvatars } from "@/components/use-account-avatars";
import { HAv, PCard, PSectionLabel, Icon, tapClass } from "@/ui/kit";
import { useToast } from "@/components/toast";

/**
 * Pending connections list — compact rows (user decision, 2026-07-08
 * walkthrough): the row body (avatar + name) opens the requester's profile
 * page, where the safety number can be verified; inline ✓ approves and ✗
 * denies on the same line. The former security-code expander and full-width
 * button row were dropped as too verbose.
 */
export function PendingConnectionsRoute() {
  const me = useAccount(ArcanAccount, { resolve: { profile: true } });
  const pending = useIncomingConnectionRequests();
  const avatars = useAccountAvatars(
    me,
    pending
      .map(({ request }) => (request as any).requesterAccountID as string)
      .filter(Boolean),
  );
  if (!me.$isLoaded) return null;
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="w-full max-w-[600px] mx-auto px-4 py-4 flex flex-col gap-4">
        <PSectionLabel>pending connections</PSectionLabel>
        {pending.length === 0 ? (
          <div
            className="px-4 py-8 text-center font-body text-ui-sub text-dim"
            data-testid="pending-empty"
          >
            no pending requests — when someone scans your code or follows your
            invite link, their request will land here.
          </div>
        ) : (
          pending.map(({ request }) => (
            <PendingCard
              key={(request as any).$jazz.id}
              me={me as any}
              request={request}
              avatarSrc={avatars.get((request as any).requesterAccountID)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PendingCard({
  me,
  request,
  avatarSrc,
}: {
  me: any;
  request: any;
  avatarSrc?: string;
}) {
  const r = request as any;
  const shared = useSharedGroups(r.requesterAccountID);
  const toast = useToast();
  const navigate = useNavigate();
  return (
    <div
      data-testid={`pending-${r.$jazz.id}`}
      data-pending-request-row="true"
    >
      {/* Stable, id-independent selector for e2e (full pending UI is Unit 9-7). */}
      <span data-testid="pending-request-row" className="sr-only" />
      <PCard>
        <div className="p-3 flex items-center gap-3">
          <button
            type="button"
            className={`${tapClass} flex-1 min-w-0 gap-3 text-left`}
            onClick={() => navigate(`/profile/${r.requesterAccountID}`)}
            data-testid="pending-open-profile"
          >
            <HAv
              txt={r.requesterDisplayName?.[0] ?? "?"}
              src={avatarSrc}
              size={38}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate font-body font-semibold text-ui-contact text-text">
                {r.requesterDisplayName}
              </div>
              <div className="font-body text-ui-sub text-dim">wants to connect</div>
              {shared.length > 0 && (
                <div className="truncate font-body text-ui-sub text-arcan-accent">
                  both in: {shared.map((s: any) => s.title).join(" · ")}
                </div>
              )}
            </div>
          </button>
          <button
            type="button"
            aria-label="approve request"
            className={`${tapClass} w-9 h-9 shrink-0 justify-center rounded-r-3 border border-hairline text-arcan-accent`}
            onClick={async () => {
              const outcome = await approveConnectionRequest(me, request);
              if (outcome === "approved") {
                toast({ icon: "check", text: "contact added", tone: "success" });
              } else if (outcome === "unavailable") {
                // Contacts record not loaded yet — nothing was stamped; the
                // request stays pending. Honest retry toast, never a false
                // "contact added" (approver-side silent-loss fix).
                toast({
                  icon: "alert",
                  text: "couldn't add contact — still syncing, try again",
                  tone: "error",
                });
              } else {
                // "malformed" or any future outcome: never claim success.
                toast({
                  icon: "alert",
                  text: "couldn't approve this request",
                  tone: "error",
                });
              }
            }}
            data-testid="approve"
          >
            <Icon d="check" size={16} />
          </button>
          <button
            type="button"
            aria-label="deny request"
            className={`${tapClass} w-9 h-9 shrink-0 justify-center rounded-r-3 border border-hairline text-red`}
            onClick={async () => {
              await denyConnectionRequest(me, request);
              toast({ icon: "check", text: "request denied", tone: "neutral" });
            }}
            data-testid="deny"
          >
            <Icon d="close" size={16} />
          </button>
        </div>
      </PCard>
    </div>
  );
}
