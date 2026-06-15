import { useIncomingConnectionRequests } from "@/jazz/use-incoming-connection-requests";
import { approveConnectionRequest, dismissConnectionRequest } from "@/jazz/invitations";
import { Button } from "@/components/ui/button";
import { ModalShell, ModalFooter } from "@/components/modal-shell";
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
  return <Body me={me as any} request={top.request} />;
}

function Body({ me, request }: { me: any; request: any }) {
  const r = request as any;
  const shared = useSharedGroups(r.requesterAccountID);
  const toast = useToast();

  const onApprove = async () => {
    await approveConnectionRequest(me, request);
    toast({ icon: "check", text: "contact added", tone: "success" });
  };
  const onDismiss = async () => {
    await dismissConnectionRequest(me, request);
  };

  return (
    <ModalShell
      open
      onClose={onDismiss}
      title={`${r.requesterDisplayName} wants to connect`}
      dataTestId="incoming-connection-prompt"
      footer={
        <ModalFooter>
          <Button variant="outline" className="flex-1" onClick={onDismiss} data-testid="dismiss">
            dismiss
          </Button>
          <Button variant="primary" className="flex-1" onClick={onApprove} data-testid="approve">
            approve
          </Button>
        </ModalFooter>
      }
    >
      <p className="text-sm text-text-2">Scanned your code in person.</p>
      {shared.length > 0 && (
        <p className="text-xs text-arcan-accent">
          You're both in: {shared.map((s: any) => s.title).join(" · ")}
        </p>
      )}
      <details className="rounded-r-3 border border-hairline bg-bg p-3">
        <summary className="cursor-pointer text-sm text-text">view security code</summary>
        <div className="mt-3"><SafetyNumber fingerprintHex={r.requesterFingerprint} /></div>
      </details>
    </ModalShell>
  );
}
