import { Button } from "@/components/ui/button";
import { deriveDeviceLabel, deriveDeviceOS, relativeTime } from "@/lib/device-info";

interface DeviceApprovalCardProps {
  userAgent?: string;
  firstSeenAt?: Date;
  fingerprint?: string;
  onApprove: () => void;
  onDeny: () => void;
  pending?: boolean;
}

export function DeviceApprovalCard({
  userAgent,
  firstSeenAt,
  fingerprint,
  onApprove,
  onDeny,
  pending,
}: DeviceApprovalCardProps) {
  const label = userAgent ? deriveDeviceLabel(userAgent) : "—";
  const os = userAgent ? deriveDeviceOS(userAgent) : "—";
  return (
    <div className="rounded-r-3 border border-hairline bg-panel p-4 flex flex-col gap-3 max-w-sm" data-testid="device-approval-card">
      <h3 className="text-base font-semibold text-text">Approve new device?</h3>
      <p className="text-sm text-text-2">A device wants to link to your account.</p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-dim uppercase tracking-widest font-semibold">Device</dt>
        <dd className="text-text-2 font-mono" data-testid="approval-label">{label} · {os}</dd>
        <dt className="text-dim uppercase tracking-widest font-semibold">First-seen</dt>
        <dd className="text-text-2 font-mono">{relativeTime(firstSeenAt)}</dd>
        <dt className="text-dim uppercase tracking-widest font-semibold">Fingerprint</dt>
        <dd className="text-text font-mono font-semibold tracking-widest" data-testid="approval-fingerprint">
          {fingerprint ?? "—"}
        </dd>
      </dl>
      <p className="text-[11px] text-dim leading-relaxed">
        Match the fingerprint with what the other device shows. Then approve.
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={onApprove} disabled={pending} className="flex-1" data-testid="approve-device">
          {pending ? "approving…" : "Approve"}
        </Button>
        <Button variant="outline" onClick={onDeny} disabled={pending} className="flex-1" data-testid="deny-device">
          Deny
        </Button>
      </div>
    </div>
  );
}
