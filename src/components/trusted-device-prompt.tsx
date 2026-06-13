import { useState } from "react";
import { useAccount, useJazzContextValue, useAuthSecretStorage } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { usePendingPairings } from "@/jazz/use-pending-pairings";
import { DeviceApprovalCard } from "@/components/device-approval-card";
import { approvePairing, rejectPairing } from "@/jazz/pairing";
import { useToast } from "@/components/toast";

/**
 * Renders a modal whenever a pending pairing is detected. Mounted once at the App root.
 *
 * For v1: full approve only works on the device that started the pair (the eph private key
 * is in this device's sessionStorage). Other already-logged-in trusted devices on the same
 * account see the card with Approve disabled and Reject enabled.
 */
export function TrustedDevicePrompt() {
  const me = useAccount(ArcanAccount, { resolve: {} });
  const pending = usePendingPairings();
  const jazzCtx = useJazzContextValue();
  const authSecretStorage = useAuthSecretStorage();
  const toast = useToast();
  const [working, setWorking] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  if (!me.$isLoaded) return null;

  const visible = pending.find((p: any) => !dismissed.has(p?.$jazz?.id));
  if (!visible) return null;

  const v = visible as any;
  const ephHex = typeof sessionStorage !== "undefined"
    ? sessionStorage.getItem(`arcan-pair-eph-${v.$jazz.id}`)
    : null;
  const canFullyApprove = !!ephHex;

  const onApprove = async () => {
    if (!canFullyApprove) return;
    setWorking(true);
    try {
      const authCtx: any = {
        authenticate: () => Promise.resolve(),
        authSecretStorage,
        crypto: (jazzCtx as any)?.node?.crypto,
      };
      await approvePairing(me as any, v, ephHex!, authCtx);
      try { sessionStorage.removeItem(`arcan-pair-eph-${v.$jazz.id}`); } catch {/* noop */}
      toast({ icon: "check", text: "device approved", tone: "success" });
      setDismissed((s) => new Set(s).add(v.$jazz.id));
    } catch (e) {
      console.error("[trusted-prompt] approve failed:", e);
      toast({ icon: "alert", text: "approve failed", tone: "error" });
    } finally {
      setWorking(false);
    }
  };

  const onDeny = async () => {
    setWorking(true);
    try {
      await rejectPairing(v);
      try { sessionStorage.removeItem(`arcan-pair-eph-${v.$jazz.id}`); } catch {/* noop */}
      toast({ icon: "check", text: "request rejected", tone: "neutral" });
      setDismissed((s) => new Set(s).add(v.$jazz.id));
    } catch (e) {
      console.error("[trusted-prompt] reject failed:", e);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      data-testid="trusted-device-prompt"
    >
      <div className="flex flex-col gap-2">
        <DeviceApprovalCard
          userAgent={v.responderUserAgent}
          firstSeenAt={v.responderFirstSeenAt}
          fingerprint={v.responderFingerprint}
          onApprove={onApprove}
          onDeny={onDeny}
          pending={working || !canFullyApprove}
        />
        {!canFullyApprove && (
          <p className="text-[11px] text-dim text-center max-w-sm">
            To approve, open this prompt on the device you started the pairing on.
            Reject works from any device.
          </p>
        )}
      </div>
    </div>
  );
}
