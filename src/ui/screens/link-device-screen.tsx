// src/ui/screens/link-device-screen.tsx — link-a-device presenter.
// Node-for-node port of design/proto.jsx:462–475 (LinkDeviceScreen).
//
// patched-copy rules: linkUrl replaces the proto's hardcoded "arcan.app/link#k2f…a81";
// qrSlot accepts real <QRDisplay> (Rung-4); parity uses <PQR size={150}>;
// waiting-pulse is a loading affordance (NOT the dropped typing indicator — rule 3).
// Animation is frozen in parity galleries (animation:none!important global override).
// Pure: no Jazz, no router — enforced by scripts/check-ui-purity.sh.

import type { ReactNode, JSX } from "react";
import { PHeader, Body, PQR, Icon, tapClass } from "../kit";

export function LinkDeviceScreen({
  onBack,
  linkUrl,
  onCopy,
  qrSlot,
  hiddenUrlSlot,
  waitingLabel = "waiting for your other device…",
  copyTestId,
}: {
  // USER DECISION 2026-07-06 (walkthrough): onBack made optional — auth-flow
  // screens have no top back arrows. PHeader back arrow is suppressed when
  // onBack is absent. The header title "link a device" is retained.
  // Pre-Wave-D original had no back nav on this screen either.
  onBack?: () => void;
  linkUrl: string;                      // e.g. "arcan.app/link#k2f…a81"
  onCopy: () => void;
  /** Rung-4: real <QRDisplay>; parity uses <PQR size={150}>. */
  qrSlot?: ReactNode;
  /** Rung-4: sr-only slot for e2e URL extraction (e.g. <span data-testid="qr-url-text" className="sr-only">…</span>). */
  hiddenUrlSlot?: ReactNode;
  /** Default: "waiting for your other device…" */
  waitingLabel?: string;
  /** data-testid for the copy button (e.g. "pair-copy-url-btn"). */
  copyTestId?: string;
}): JSX.Element {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PHeader title="link a device" onBack={onBack} />

      {/* Body pad={'24px 20px'} — proto:464 */}
      <Body pad={"24px 20px"}>
        {/* centered column — proto:465 */}
        <div className="flex flex-col items-center gap-[14px]">

          {/* description — proto:466; 400 11.5px/1.5 body → font-body text-ui-empty-sub leading-normal */}
          <div className="text-center font-body text-ui-empty-sub leading-normal text-text-2">
            open this link on your other device, or scan it
          </div>

          {/* QR — proto:467; qrSlot replaces PQR in live app (Rung-4) */}
          {qrSlot ?? <PQR size={150} />}

          {/* URL + copy pill — proto:468–471 */}
          {/* flex items-stretch: button height matches URL height (stretch) */}
          <div className="flex items-stretch w-full max-w-[320px] border border-hairline rounded-r-4 overflow-hidden">
            {/* URL portion */}
            <div className="flex-1 min-w-0 px-3 flex items-center bg-panel">
              {/* 400 11px/1 mono → font-mono text-ui-value */}
              <span className="font-mono text-ui-value text-text-2 whitespace-nowrap overflow-hidden text-ellipsis">
                {linkUrl}
              </span>
            </div>
            {/* copy button — proto:470 */}
            <button
              onClick={onCopy}
              data-testid={copyTestId}
              className={`${tapClass} px-[13px] py-[10px] border-l border-hairline bg-panel gap-[6px] hover:bg-panel-2 active:bg-hairline`}
            >
              <Icon d="copy" size={13} className="text-arcan-accent" />
              {/* 600 11px/1 body → font-body font-semibold text-ui-value */}
              <span className="font-body font-semibold text-ui-value text-arcan-accent">
                copy
              </span>
            </button>
          </div>

          {/* hiddenUrlSlot — sr-only e2e URL hook; rendered after pill, invisible */}
          {hiddenUrlSlot}

          {/* waiting row — proto:472; gap:8 → gap-2; marginTop:2 → mt-0.5 */}
          <div className="flex items-center gap-2 mt-0.5">
            {/* loading dot — animate-waiting-pulse (frozen in parity; loading affordance not typing indicator) */}
            <span className="w-[7px] h-[7px] rounded-pill bg-arcan-accent-fill animate-waiting-pulse" />
            {/* 400 10.5px/1 body → font-body text-ui-sub leading-none */}
            <span className="font-body text-ui-sub leading-none text-dim">
              {waitingLabel}
            </span>
          </div>

        </div>
      </Body>
    </div>
  );
}
