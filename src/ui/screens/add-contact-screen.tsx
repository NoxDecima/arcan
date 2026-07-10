// src/ui/screens/add-contact-screen.tsx — add-a-contact (share + scan) presenter.
// Node-for-node port of design/proto.jsx:401–429 (AddContactScreen).
//
// patched-copy notes (proto-cells.jsx patched copy):
//   - Two-button copy/share → ONE adaptive action per Unit 9-7 §2-J decision.
//     Proto shows `copy link` + `share`; app ships a single adaptive `primaryLabel`
//     (navigator.share → "share invite", else "copy link"). The proto-local parity
//     copy is patched to render the single button so parity compares shipped IA.
//     Patch note: /* patched copy: two-button copy/share → one adaptive action per 9-7 §2-J */
//   - TTL options from container (app: 1h/24h/7d vs proto: 1d/7d/30d/∞); parity
//     fixtures align to app options; deviation noted in manifest.
//   - QR: parity = <PQR size={128}>; live = <QRDisplay> (Rung-4 via qrSlot).
//   - hiddenUrlSlot: sr-only spans — no pixels; omitted in parity.
// Pure: no Jazz, no router — enforced by scripts/check-ui-purity.sh.

import type { ReactNode, JSX } from "react";
import { PHeader, Body, PCard, PButton, PQR, tapClass } from "../kit";

export function AddContactScreen({
  onBack,
  idShort,
  qrSlot,
  ttl,
  ttlOptions,
  onTtl,
  primaryLabel,
  onPrimary,
  onScan,
  onPaste,
  hiddenUrlSlot,
  // testid carries
  waitingCardTestId,
  ttlPickerTestId,
  shareBtnTestId,
  scanBtnTestId,
  pasteBtnTestId,
}: {
  onBack: () => void;
  idShort: string;                       // "co_z1a8…4f2"
  /** Rung-4: real <QRDisplay>; parity = <PQR size={128}>. */
  qrSlot?: ReactNode;
  ttl: string;                           // currently selected TTL value
  ttlOptions: string[];                  // e.g. ["1h", "24h", "7d"]
  onTtl: (t: string) => void;
  /** Adaptive: "share invite" | "copy link" per navigator.share availability. */
  primaryLabel: string;
  onPrimary: () => void;                 // share or copy — "add-contact-share-btn"
  onScan: () => void;                    // "scan their QR code" — "scan-their-code"
  onPaste: () => void;                   // "or paste a link" — "add-contact-cancel-btn"
  /** Rung-4: sr-only qr-url-text / copy-url-text spans (e2e hooks; no pixels). */
  hiddenUrlSlot?: ReactNode;
  // testid carries
  waitingCardTestId?: string;  // "add-contact-waiting"
  ttlPickerTestId?: string;    // "ttl-picker"
  shareBtnTestId?: string;     // "add-contact-share-btn"
  scanBtnTestId?: string;      // "scan-their-code"
  pasteBtnTestId?: string;     // "add-contact-cancel-btn"
  // per-ttl: "ttl-<t>" applied on each segment
}): JSX.Element {
  // Infer primary icon from label — "share invite" uses "share", else "copy"
  const primaryIcon = primaryLabel.toLowerCase().includes("share") ? "share" : "copy";

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PHeader title="add contact" onBack={onBack} />

      {/* Body pad='22px 20px' — proto:403 */}
      <Body pad={"22px 20px"}>
        <div className="flex flex-col items-center gap-[14px]">

          {/* Heading + sub — proto:405–408 */}
          <div className="text-center">
            {/* 700 18px/1.25 headMono → font-mono font-bold text-ui-heading + leading-[1.25] (parity override if needed) */}
            <div className="font-mono font-bold text-ui-heading leading-[1.25] text-text">
              add a contact
            </div>
            {/* 400 11.5px/1.4 body → font-body text-ui-empty-sub leading-[1.4] */}
            <div className="mt-[6px] font-body text-ui-empty-sub leading-[1.4] text-text-2">
              share your code so people can add you
            </div>
          </div>

          {/* Your-code card — proto:409–423 */}
          <PCard
            className="w-full max-w-[300px] p-4 flex flex-col items-center gap-[11px]"
            {...(waitingCardTestId ? { "data-testid": waitingCardTestId } : {})}
          >
            {/* "// your code" caps — 600 9px/1 mono .16em */}
            {/* inline fontSize: CSS-class var() resolves differently than inline in Chrome; override forces matching rendering */}
            <span className="font-mono font-semibold text-ui-caps tracking-caps uppercase text-dim" style={{ fontSize: "var(--fs-ui-caps)" }}>
              {"// your code"}
            </span>

            {/* QR code — Rung-4: real <QRDisplay> via qrSlot; parity = <PQR size={128}> */}
            {qrSlot ?? <PQR size={128} />}

            {/* Account ID — 400 11px/1 mono → font-mono text-ui-value text-dim */}
            {/* inline fontSize: CSS-class var() resolves differently than inline in Chrome; override forces matching rendering */}
            <span className="font-mono text-ui-value leading-none text-dim" style={{ fontSize: "var(--fs-ui-value)" }}>
              {idShort}
            </span>

            {/* Adaptive primary button (copy link / share invite) — proto:414–415 patched */}
            {/* patched copy: two-button copy/share → one adaptive action per 9-7 §2-J */}
            <PButton
              full
              icon={primaryIcon}
              label={primaryLabel}
              onClick={onPrimary}
              data-testid={shareBtnTestId}
            />

            {/* Rung-4: sr-only url spans (e2e hooks; no pixels in parity) */}
            {hiddenUrlSlot}

            {/* "link valid for" segmented — proto:417–421 (cluster) */}
            <div className="w-full border-t border-hairline pt-3 flex items-center gap-2">
              {/* "link valid for" label — 500 11px/1 body → font-body font-medium text-ui-value */}
              {/* inline fontSize: CSS-class var() resolves differently than inline in Chrome; override forces matching rendering */}
              <span className="flex-1 font-body font-medium text-ui-value leading-none text-text-2" style={{ fontSize: "var(--fs-ui-value)" }}>
                link valid for
              </span>

              {/* Segmented pill toggle — proto:419 uses c.bg (not panel2) as pill container bg */}
              <div
                className="flex gap-0.5 p-0.5 rounded-pill bg-bg border border-hairline"
                {...(ttlPickerTestId ? { "data-testid": ttlPickerTestId } : {})}
              >
                {ttlOptions.map((o) => {
                  const on = o === ttl;
                  return (
                    /* inline fontSize: CSS-class var() resolves differently in Chrome; inline override matches proto rendering */
                    <button
                      key={o}
                      onClick={() => onTtl(o)}
                      className={[
                        tapClass,
                        "rounded-pill px-[9px] py-1",
                        "font-mono font-semibold text-ui-chatsub leading-none",
                        on
                          ? "bg-arcan-accent-fill text-on-accent"
                          : "bg-transparent text-text-2",
                      ].join(" ")}
                      style={{ fontSize: "var(--fs-ui-sys)" }}
                      data-testid={`ttl-${o}`}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>
          </PCard>

          {/* "add someone" labeled divider — proto:424 (cluster) */}
          <div className="flex items-center gap-2 w-full max-w-[300px]">
            <div className="flex-1 h-px bg-hairline" />
            {/* 600 9px/1 mono .12em caps → font-mono font-semibold text-ui-caps tracking-caps-12 uppercase */}
            {/* inline fontSize: CSS-class var() resolves differently than inline in Chrome; override forces matching rendering */}
            <span className="font-mono font-semibold text-ui-caps tracking-caps-12 uppercase text-dim" style={{ fontSize: "var(--fs-ui-caps)" }}>
              add someone
            </span>
            <div className="flex-1 h-px bg-hairline" />
          </div>

          {/* "scan their QR code" primary button — proto:425 (intent-fix, feedback round 2: spell out QR) */}
          <div className="w-full max-w-[300px]">
            <PButton
              primary
              full
              icon="search"
              label="scan their QR code"
              onClick={onScan}
              data-testid={scanBtnTestId}
            />
          </div>

          {/* "or paste a link" ghost — proto:426 */}
          <button
            className={tapClass}
            onClick={onPaste}
            {...(pasteBtnTestId ? { "data-testid": pasteBtnTestId } : {})}
          >
            {/* 400 10.5px/1 body → font-body text-ui-sub leading-none; color accent */}
            <span className="font-body text-ui-sub leading-none text-arcan-accent">
              or paste a link
            </span>
          </button>
        </div>
      </Body>
    </div>
  );
}
