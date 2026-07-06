import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useIncomingConnectionRequests } from "@/jazz/use-incoming-connection-requests";
import { approveConnectionRequest, dismissConnectionRequest } from "@/jazz/invitations";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import { SafetyNumber } from "@/components/safety-number";
import { HAv, PCard, PButton, PSectionLabel } from "@/ui/kit";
import { useToast } from "@/components/toast";

export function PendingConnectionsRoute() {
  const me = useAccount(ArcanAccount, { resolve: { profile: true } });
  const pending = useIncomingConnectionRequests();
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
            />
          ))
        )}
      </div>
    </div>
  );
}

function PendingCard({ me, request }: { me: any; request: any }) {
  const r = request as any;
  const shared = useSharedGroups(r.requesterAccountID);
  const toast = useToast();
  return (
    <div
      data-testid={`pending-${r.$jazz.id}`}
      data-pending-request-row="true"
    >
      {/* Stable, id-independent selector for e2e (full pending UI is Unit 9-7). */}
      <span data-testid="pending-request-row" className="sr-only" />
      <PCard>
        <div className="p-3 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <HAv txt={r.requesterDisplayName?.[0] ?? "?"} size={38} />
            <div className="min-w-0 flex-1">
              <div className="font-body font-semibold text-ui-contact text-text">
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
          <details className="rounded-r-3 border border-hairline p-3 bg-bg">
            <summary className="cursor-pointer font-body text-ui-sub text-dim">
              view security code
            </summary>
            <div className="mt-3">
              <SafetyNumber fingerprintHex={r.requesterFingerprint} />
            </div>
          </details>
          <div className="flex gap-2">
            <PButton
              primary
              label="approve"
              className="flex-1"
              onClick={async () => {
                await approveConnectionRequest(me, request);
                toast({ icon: "check", text: "contact added", tone: "success" });
              }}
              data-testid="approve"
            />
            <PButton
              label="dismiss"
              className="flex-1"
              onClick={async () => {
                await dismissConnectionRequest(me, request);
                toast({ icon: "check", text: "request dismissed", tone: "neutral" });
              }}
              data-testid="dismiss"
            />
          </div>
        </div>
      </PCard>
    </div>
  );
}
