import { useIncomingConnectionRequests } from "@/jazz/use-incoming-connection-requests";
import { approveConnectionRequest, dismissConnectionRequest } from "@/jazz/invitations";
import { Button } from "@/components/ui/button";
import { SafetyNumber } from "@/components/safety-number";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useToast } from "@/components/toast";

/**
 * For ConnectionRequests with channel="qr", surface an immediate modal — both
 * parties are physically present waiting on the one tap.
 *
 * For channel="link" or "group", the request lands on the Pending Connections
 * list silently (no modal).
 */
export function IncomingConnectionPrompt() {
  const me = useAccount(ArcanAccount, { resolve: { profile: true } });
  const pending = useIncomingConnectionRequests();
  if (!me.$isLoaded) return null;
  const top = pending.find(({ request }) => (request as any).channel === "qr");
  if (!top) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      data-testid="incoming-connection-prompt"
    >
      <Card me={me as any} request={top.request} />
    </div>
  );
}

function Card({ me, request }: { me: any; request: any }) {
  const r = request as any;
  const shared = useSharedGroups(r.requesterAccountID);
  const toast = useToast();
  return (
    <section className="rounded-r-3 border border-hairline bg-panel p-4 flex flex-col gap-3 max-w-sm">
      <h3 className="text-base font-semibold text-text">{r.requesterDisplayName} wants to connect</h3>
      <p className="text-sm text-text-2">Scanned your code in person.</p>
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
