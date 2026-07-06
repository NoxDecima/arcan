// src/ui/screens/contact-request-screen.tsx — node-for-node port of design/hf-flows.jsx:229–257 (ScContactRequest).
// Rung 2 presenter: pure props in / JSX out; no Jazz, no router.
// The /invite confirm phase: a contact is requesting to connect.
//
// USER DECISION (2026-07-06): account-id line DROPPED.
//   hf proto shows "co_9f2…b41" (text-ui-chatsub text-dim); Wave-C decision #7 dropped ids
//   from profile screens; extending that pattern here for consistency.
//   Manifest note: proto patched copy also omits the id line; fixture `idShort` field retained
//   on ContactRequestVM for potential future use (e.g. sr-only accessibility text).

import type { ReactNode, JSX } from "react";
import { AuthSurface, PButton, ArcanMark, Icon, tapClass } from "@/ui/kit";
import type { ContactRequestVM } from "./auth-types";

export function ContactRequestScreen({
  vm,
  avatarSlot,
  sharedSlot,
  securityOpen,
  onToggleSecurity,
  safetySlot,
  onAccept,
  onDecline,
  acceptLabel = "accept & add contact",
  declineLabel = "decline",
  rootTestId,
  nameTestId,
  avatarTestId,
  acceptTestId,
  declineTestId,
}: {
  vm: ContactRequestVM;
  /** Rung-4: real <Avatar> from the container; parity uses the bespoke initials tile. */
  avatarSlot?: ReactNode;
  /** Rung-4: "you're both in: …" line — container-owned. */
  sharedSlot?: ReactNode;
  securityOpen: boolean;
  onToggleSecurity: () => void;
  /** Rung-4: <SafetyNumber> digit grid — rendered when securityOpen. */
  safetySlot?: ReactNode;
  onAccept: () => void;
  onDecline: () => void;
  acceptLabel?: string;
  declineLabel?: string;
  /** data-testid for the auth card; "invite-confirm". */
  rootTestId?: string;
  /** data-testid for the name line; "invite-inviter-name". */
  nameTestId?: string;
  /** data-testid on the avatar wrapper; "invite-inviter-avatar". */
  avatarTestId?: string;
  /** data-testid for the accept button; "invite-accept-btn". */
  acceptTestId?: string;
  /** data-testid for the decline button; "invite-decline-btn". */
  declineTestId?: string;
}): JSX.Element {
  return (
    <AuthSurface w={320}>
      {/* hf:234 — Wordmark size=20; Wordmark=ArcanMark×2.1 → stacked size=42 */}
      <div className="flex justify-center">
        <ArcanMark stacked size={42} />
      </div>
      {/* hf:235–253 — auth card: p-[22px] gap-[13px] (hf:234) */}
      <div
        data-testid={rootTestId}
        className="flex flex-col items-center rounded-r-4 border border-hairline bg-panel"
        style={{ padding: 22, gap: 13 }}
      >
        {/* hf:235 — 64px avatar tile; r=radius+4=16 (v5 radius=12) */}
        <div data-testid={avatarTestId}>
          {avatarSlot ?? (
            <div
              className="w-[64px] h-[64px] rounded-[16px] bg-accent-soft border border-hairline flex items-center justify-center font-mono font-semibold text-arcan-accent"
              style={{ fontSize: 22 }}
            >
              {vm.initials}
            </div>
          )}
        </div>
        {/* hf:236–240 — name block (id line dropped — user decision 2026-07-06) */}
        <div className="text-center">
          <div
            data-testid={nameTestId}
            className="font-mono font-bold text-ui-req tracking-[-0.01em] text-text"
          >
            {vm.name}
          </div>
          <div className="mt-1.5 font-body text-ui-empty-sub leading-[1.4] text-text-2">
            wants to connect with you
          </div>
          {/* account-id line dropped — user decision (no raw ids in UI; Wave-C pattern) */}
        </div>
        {/* Rung-4: shared conversations (container-owned) */}
        {sharedSlot}
        {/* hf:242–252 — expandable security code (collapsed in parity) */}
        <div className="w-full rounded-r-4 border border-hairline bg-bg overflow-hidden">
          <button
            type="button"
            onClick={onToggleSecurity}
            className={`${tapClass} flex items-center gap-[9px] px-3 py-2.5 w-full`}
          >
            <Icon d="shield" size={15} className="text-arcan-accent" />
            <span className="flex-1 text-left font-body font-medium text-ui-empty-sub leading-none text-text">
              view security code
            </span>
            <span className="font-mono font-semibold text-ui-toast leading-none text-dim">
              {securityOpen ? "▴" : "▾"}
            </span>
          </button>
          {securityOpen && (
            <div className="px-3 pb-3 border-t border-hairline">
              {/* Rung-4: <SafetyNumber> digit grid injected from container */}
              {safetySlot}
              <div className="mt-[9px] font-body text-ui-tab leading-[1.4] text-dim text-center">
                compare in person to confirm it&apos;s really them
              </div>
            </div>
          )}
        </div>
      </div>
      {/* hf:255 — accept & add contact (primary) */}
      <PButton
        primary
        full
        label={acceptLabel}
        onClick={onAccept}
        data-testid={acceptTestId}
      />
      {/* hf:256 — decline (danger) */}
      <PButton
        danger
        full
        label={declineLabel}
        onClick={onDecline}
        data-testid={declineTestId}
      />
    </AuthSurface>
  );
}
