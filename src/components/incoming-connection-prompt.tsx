import { useIncomingConnectionRequests } from "@/jazz/use-incoming-connection-requests";
import { approveConnectionRequest, dismissConnectionRequest, denyConnectionRequest } from "@/jazz/invitations";
import { ModalShell, ModalFooter } from "@/components/modal-shell";
import { SafetyNumber } from "@/components/safety-number";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import { useAccountAvatars } from "@/components/use-account-avatars";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useToast } from "@/components/toast";
import { HAv, AuthTitle, PButton } from "@/ui/kit";

/**
 * For ConnectionRequests with channel="qr", surface an immediate modal — both
 * parties are physically present waiting on the one tap.
 *
 * For channel="link" or "group", the request lands on the Pending Connections
 * list silently (no modal).
 *
 * Dismissing (button, scrim, or Escape) only mutes this modal — the request
 * stays on the pending surfaces until explicitly approved or declined (user
 * decision, 2026-07-08 walkthrough). Declining is the explicit terminal "no":
 * it calls denyConnectionRequest, which stamps deniedAt on the shared request
 * CoValue so the requester's waiting screen transitions to "declined".
 */
export function IncomingConnectionPrompt() {
  const me = useAccount(ArcanAccount, { resolve: { profile: true } });
  const pending = useIncomingConnectionRequests();
  if (!me.$isLoaded) return null;
  const top = pending.find(
    ({ request, dismissedLocally }) =>
      (request as any).channel === "qr" && !dismissedLocally,
  );
  if (!top) return null;
  return <Body me={me as any} request={top.request} />;
}

function Body({ me, request }: { me: any; request: any }) {
  const r = request as any;
  const shared = useSharedGroups(r.requesterAccountID);
  // Live requester avatar — same resolver as message rows / home lists.
  // Falls back to initials while unresolved (walkthrough fix, 2026-07-08).
  const avatars = useAccountAvatars(me, r.requesterAccountID ? [r.requesterAccountID] : []);
  const toast = useToast();

  const onApprove = async () => {
    await approveConnectionRequest(me, request);
    toast({ icon: "check", text: "contact added", tone: "success" });
  };
  const onDismiss = async () => {
    await dismissConnectionRequest(me, request);
  };
  const onDecline = async () => {
    await denyConnectionRequest(me, request);
    toast({ icon: "check", text: "request declined", tone: "neutral" });
  };

  return (
    <ModalShell
      open
      onClose={onDismiss}
      title="connection request"
      dataTestId="incoming-connection-prompt"
      footer={
        <ModalFooter>
          <PButton
            label="dismiss"
            className="flex-1"
            onClick={onDismiss}
            data-testid="dismiss"
          />
          <PButton
            danger
            label="decline"
            className="flex-1"
            onClick={onDecline}
            data-testid="decline"
          />
          <PButton
            primary
            label="approve"
            className="flex-1"
            onClick={onApprove}
            data-testid="approve"
          />
        </ModalFooter>
      }
    >
      <div className="flex flex-col items-center gap-3">
        <HAv
          txt={r.requesterDisplayName?.[0] ?? "?"}
          src={avatars.get(r.requesterAccountID)}
          size={48}
        />
        <AuthTitle>{r.requesterDisplayName}</AuthTitle>
        <p className="font-body text-ui-empty-sub leading-[1.4] text-text-2 text-center">
          wants to connect
        </p>
        <p className="font-body text-ui-sub text-dim text-center">
          scanned your QR code in person
        </p>
        {shared.length > 0 && (
          <p className="font-body text-ui-sub text-arcan-accent text-center">
            both in: {shared.map((s: any) => s.title).join(" · ")}
          </p>
        )}
      </div>
      <details className="rounded-r-3 border border-hairline bg-bg p-3">
        <summary className="cursor-pointer font-body text-ui-sub text-dim">
          view security code
        </summary>
        <div className="mt-3">
          <SafetyNumber fingerprintHex={r.requesterFingerprint} />
        </div>
      </details>
    </ModalShell>
  );
}
