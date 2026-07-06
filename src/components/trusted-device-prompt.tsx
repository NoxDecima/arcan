import { useState } from "react";
import { useAccount, useJazzContextValue, useAuthSecretStorage } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { usePendingPairings } from "@/jazz/use-pending-pairings";
import { ApproveDeviceCard } from "@/ui/screens/approve-device-screen";
import { ModalShell } from "@/components/modal-shell";
import { PButton } from "@/ui/kit";
import { approvePairing, rejectPairing } from "@/jazz/pairing";
import { useToast } from "@/components/toast";
import {
  deriveDeviceLabel,
  deriveDeviceOS,
  relativeTime,
} from "@/lib/device-info";
import type { ApproveDeviceVM } from "@/ui/screens/auth-types";

/**
 * Renders a modal whenever a pending pairing is detected. Mounted once at the App root.
 *
 * Overlay stays an overlay (Unit-9 sanctioned decision). Restyled from
 * the legacy DeviceApprovalCard to the kit ApproveDeviceCard (device tile
 * + caps info rows), with PButton primary/danger outside the card body.
 *
 * For v1: full approve only works on the device that started the pair (the eph private key
 * is in this device's sessionStorage). Other already-logged-in trusted devices on the same
 * account see the card with Approve disabled and Reject enabled.
 *
 * Testids kept verbatim: trusted-device-prompt, device-approval-card,
 * approve-device, deny-device, approval-label, approval-fingerprint.
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

  // Build ApproveDeviceVM from responder metadata
  const ua: string = v.responderUserAgent ?? "";
  const deviceLabel = ua ? `${deriveDeviceLabel(ua)} · ${deriveDeviceOS(ua)}` : "—";
  const firstSeen = relativeTime(v.responderFirstSeenAt);
  const fp: string = v.responderFingerprint ?? "—";
  const vm: ApproveDeviceVM = {
    rows: [
      { label: "device", value: deviceLabel },
      { label: "first-seen", value: firstSeen },
      { label: "fingerprint", value: fp },
    ],
  };

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
    <ModalShell
      open
      onClose={() => setDismissed((s) => new Set(s).add(v.$jazz.id))}
      title=""
      dataTestId="trusted-device-prompt"
      className="max-w-[420px]"
    >
      <ApproveDeviceCard
        vm={vm}
        rootTestId="device-approval-card"
        labelTestId="approval-label"
        fingerprintTestId="approval-fingerprint"
      />
      <PButton
        primary
        full
        label={working ? "approving…" : "approve device"}
        onClick={onApprove}
        disabled={!canFullyApprove || working}
        data-testid="approve-device"
      />
      <PButton
        danger
        full
        label="deny"
        onClick={onDeny}
        disabled={working}
        data-testid="deny-device"
      />
      {!canFullyApprove && (
        <p className="font-body text-ui-sub leading-none text-dim text-center">
          To approve, open this prompt on the device you started the pairing on.
          Reject works from any device.
        </p>
      )}
    </ModalShell>
  );
}
