// src/ui/screens/approve-device-screen.tsx — ApproveDeviceCard + ApproveDeviceScreen.
// ApproveDeviceCard: shared inner card; node-for-node port of
//   design/hf-flows.jsx:214-223 (card body from ScApproveDevice).
//   Consumed by ApproveDeviceScreen (initiator awaiting-approval phase)
//   AND by the trusted-device overlay restyle (T6).
// ApproveDeviceScreen: full-screen presenter, hf-flows.jsx:209-228.
//
// Rung 2 (ApproveDeviceScreen) / Rung 4 (trusted-device overlay; no parity cell).
// Pure: no Jazz, no router — enforced by scripts/check-ui-purity.sh.

import type { JSX } from "react";
import { AuthSurface, ArcanMark, AuthTitle, Icon, PButton } from "@/ui/kit";
import type { ApproveDeviceVM } from "./auth-types";

// ── ApproveDeviceCard ────────────────────────────────────────────────────────
// Shared card body used by both the full-screen presenter and the overlay.
// Does NOT include approve/deny buttons — those live in the consumer
// (ApproveDeviceScreen adds them outside the card; overlay adds them inside ModalShell).
//
// testids:
//   labelTestId       → row 0 value  (e.g. "approval-label")
//   fingerprintTestId → last row value (e.g. "approval-fingerprint")
//   rootTestId        → card root   (e.g. "device-approval-card")
export function ApproveDeviceCard({
  vm,
  labelTestId,
  fingerprintTestId,
  rootTestId,
}: {
  vm: ApproveDeviceVM;
  /** data-testid on the first row's value span; "approval-label". */
  labelTestId?: string;
  /** data-testid on the last row's value span; "approval-fingerprint". */
  fingerprintTestId?: string;
  /** data-testid on the card root div; "device-approval-card". */
  rootTestId?: string;
}): JSX.Element {
  const lastIdx = vm.rows.length - 1;
  return (
    // auth card cluster — hf-flows:214; p=20 gap=12 (hf gap:12 → gap-3 = 12px)
    <div
      data-testid={rootTestId}
      className="flex flex-col items-center rounded-r-4 border border-hairline bg-panel"
      style={{ padding: 20, gap: 12 }}
    >
      {/* 52px device icon tile — hf-flows:215; radius=s.radius+2=14px */}
      <div className="w-[52px] h-[52px] rounded-[14px] bg-accent-soft flex items-center justify-center">
        <Icon d="device" size={24} className="text-arcan-accent" />
      </div>

      {/* title — hf-flows:216; AuthTitle = 700 19px/1.25 mono -.01em */}
      <AuthTitle>approve new device?</AuthTitle>

      {/* sub — hf-flows:217; Sub with marginTop:0 override (card gap owns spacing) */}
      <div className="text-center text-text-2 font-body text-ui-empty-sub leading-normal">
        a device wants to link to your account
      </div>

      {/* info rows — hf-flows:218-223; px=12 py=10 → px-3 py-2.5; gap=6 → gap-1.5 */}
      <div className="w-full rounded-r-4 bg-bg border border-hairline px-3 py-2.5 flex flex-col gap-1.5">
        {vm.rows.map((row, i) => (
          <div key={row.label} className="flex justify-between items-center">
            {/* caps label — 600 9px/1 mono .12em → tracking-caps-12 */}
            <span className="font-mono font-semibold text-ui-caps tracking-caps-12 uppercase text-dim">
              {row.label}
            </span>
            {/* value — 400 10.5px/1 mono → text-ui-sub text-text-2 */}
            <span
              className="font-mono text-ui-sub leading-none text-text-2"
              data-testid={
                i === 0
                  ? labelTestId
                  : i === lastIdx
                  ? fingerprintTestId
                  : undefined
              }
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ApproveDeviceScreen ──────────────────────────────────────────────────────
// Full-screen presenter for the initiator's "awaiting-approval" phase.
// node-for-node port of design/hf-flows.jsx:209-228 (ScApproveDevice).
//
// Data divergence (documented in manifest): live app feeds device/first-seen/fingerprint rows;
// hf still shows device/location/time (app has no geo-location). The presenter is
// data-driven (vm.rows); the parity fixture supplies the hf rows to match pixels.
//
// testids:
//   promptTestId → AuthSurface root ("pair-approval-prompt")
//   cardTestId   → ApproveDeviceCard root ("device-approval-card")
//   approveTestId → approve button ("approve-device")
//   denyTestId    → deny button ("deny-device")
export function ApproveDeviceScreen({
  vm,
  onApprove,
  onDeny,
  approving,
  approveDisabled,
  approveTestId,
  denyTestId,
  cardTestId,
  promptTestId,
}: {
  vm: ApproveDeviceVM;
  onApprove: () => void;
  onDeny: () => void;
  /** When true, the approve button shows "approving…" and is disabled. */
  approving: boolean;
  /** Additional disable flag (e.g. can't approve from a non-initiator device). */
  approveDisabled?: boolean;
  /** data-testid for the approve button; "approve-device". */
  approveTestId?: string;
  /** data-testid for the deny button; "deny-device". */
  denyTestId?: string;
  /** data-testid for the ApproveDeviceCard root; "device-approval-card". */
  cardTestId?: string;
  /** data-testid on the AuthSurface root; "pair-approval-prompt". */
  promptTestId?: string;
}): JSX.Element {
  return (
    // AuthSurface w=320 (hf-flows:212); testId on root for pair-approval-prompt
    <AuthSurface w={320} testId={promptTestId}>
      {/* hf-flows:213 — Wordmark size=20 → ArcanMark×2.1 = stacked size 42 */}
      <div className="flex justify-center">
        <ArcanMark stacked size={42} />
      </div>

      {/* hf-flows:214-223 — ApproveDeviceCard */}
      <ApproveDeviceCard
        vm={vm}
        rootTestId={cardTestId}
        labelTestId="approval-label"
        fingerprintTestId="approval-fingerprint"
      />

      {/* hf-flows:224 — approve (primary) */}
      <PButton
        primary
        full
        label={approving ? "approving…" : "approve device"}
        onClick={onApprove}
        disabled={approveDisabled || approving}
        data-testid={approveTestId}
      />

      {/* hf-flows:225 — deny (danger) */}
      <PButton
        danger
        full
        label="deny"
        onClick={onDeny}
        disabled={approving}
        data-testid={denyTestId}
      />
    </AuthSurface>
  );
}
