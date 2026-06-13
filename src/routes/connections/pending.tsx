import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useIncomingConnectionRequests } from "@/jazz/use-incoming-connection-requests";
import { approveConnectionRequest, dismissConnectionRequest } from "@/jazz/invitations";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import { SafetyNumber } from "@/components/safety-number";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";

export function PendingConnectionsRoute() {
  const me = useAccount(ArcanAccount, { resolve: { profile: true } });
  const pending = useIncomingConnectionRequests();
  if (!me.$isLoaded) return null;
  return (
    <div className="p-6 max-w-md mx-auto flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-text">pending connections</h1>
      {pending.length === 0 ? (
        <p className="text-sm text-text-2">No pending requests.</p>
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
  );
}

function PendingCard({ me, request }: { me: any; request: any }) {
  const r = request as any;
  const shared = useSharedGroups(r.requesterAccountID);
  const toast = useToast();
  return (
    <section
      className="rounded-r-3 border border-hairline bg-panel p-4 flex flex-col gap-3"
      data-testid={`pending-${r.$jazz.id}`}
    >
      <h3 className="text-base font-semibold text-text">{r.requesterDisplayName}</h3>
      <p className="text-sm text-text-2">wants to connect</p>
      {shared.length > 0 && (
        <p className="text-xs text-arcan-accent">
          You're both in: {shared.map((s: any) => s.title).join(" · ")}
        </p>
      )}
      <details className="rounded-r-3 border border-hairline p-3 bg-bg">
        <summary className="cursor-pointer text-sm text-text">view security code</summary>
        <div className="mt-3"><SafetyNumber fingerprintHex={r.requesterFingerprint} /></div>
      </details>
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          onClick={async () => {
            await approveConnectionRequest(me, request);
            toast({ icon: "check", text: "contact added", tone: "success" });
          }}
          data-testid="approve"
        >approve</Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={async () => {
            await dismissConnectionRequest(me, request);
          }}
          data-testid="dismiss"
        >dismiss</Button>
      </div>
    </section>
  );
}
