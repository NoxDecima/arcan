// src/ui/screens/profile-screen.tsx — contact profile presenter.
// Node-for-node port of design/proto.jsx:210–234 (ProfileScreen).
//
// patched copy: design/proto.jsx:205–236 — '@' prefix dropped (rule 4);
// safety collapsed (safetyOpen prop); shared=soon when sharedConversations=undefined.
//
// User decisions (2026-07-05 walkthrough):
//   1. Content column capped at 600px (mx-auto).
//   7. Account-id line removed (proto:217's "co_z1a8…4f2" sub-text dropped).
//   8. "Verify safety number" moves directly below the action-buttons block;
//      shared-conversations list moves below it. Proto had shared-convos first.
//      Both items in same PCard, reordered. Proto-cells.jsx patched to match.
// Pure: no Jazz, no router — enforced by scripts/check-ui-purity.sh.

import type { ReactNode, JSX } from "react";
import { PHeader, Body, HAv, PButton, PCard, PRow, Icon, tapClass } from "../kit";
import type { ProfileScreenVM } from "./profile-types";

export function ProfileScreen({
  vm,
  onBack,
  onMenu,
  onAvatar,
  onMessage,
  onOpenConversation,
  safetyOpen,
  onToggleSafety,
  safetySlot,
  secondarySlot,
  dangerZone,
  rootTestId,
  backTestId,
  avatarTestId,
  nameTestId,
  messageTestId,
  safetyToggleTestId,
}: {
  vm: ProfileScreenVM;
  onBack: () => void;
  onMenu?: () => void;                  // header-right dots (proto:211)
  /** Intent-fix (non-visual, 2026-07-08 walkthrough): opens the avatar in a
      lightbox. Optional — when absent the avatar renders exactly as proto. */
  onAvatar?: () => void;
  onMessage: () => void;                // primary "create conversation" PButton
  onOpenConversation?: (id: string) => void; // Rung-4 real shared list
  safetyOpen: boolean;                  // expandable "verify safety number"
  onToggleSafety: () => void;
  safetySlot?: ReactNode;               // Rung-4: container's <SafetyNumber> (expanded body)
  // intent-fix: contact-robustness repair affordance (2026-07-20 spec §5) —
  // no proto reference; renders container-provided secondary action under
  // the message button.
  secondarySlot?: ReactNode;
  /** Rung-4: app-only danger zone below the card (e.g. "remove contact" button). */
  dangerZone?: ReactNode;
  // testid carries
  rootTestId?: string;                  // "profile-view"
  backTestId?: string;                  // "profile-back"
  avatarTestId?: string;                // "profile-avatar"
  nameTestId?: string;                  // "profile-display-name"
  // idTestId removed — account-id line dropped (user decision 2026-07-05 walkthrough)
  messageTestId?: string;               // "profile-message"
  safetyToggleTestId?: string;          // "profile-safety-toggle"
}): JSX.Element {
  return (
    <div
      className="flex flex-col flex-1 min-h-0"
      {...(rootTestId ? { "data-testid": rootTestId } : {})}
    >
      <PHeader
        title="profile"
        onBack={onBack}
        backTestId={backTestId}
        right={
          onMenu ? (
            <button className={`${tapClass} group w-8 h-8 justify-center rounded-r-3 hover:bg-panel-2 active:bg-hairline`} onClick={onMenu} aria-label="profile actions">
              <Icon d="dots" size={18} fill className="text-text-2 group-hover:text-text group-active:text-text transition-colors duration-fast ease-out" />
            </button>
          ) : undefined
        }
      />
      <Body pad={"24px 20px"}>
        {/* 600px content cap — full-viewport desktop (user decision 2026-07-05) */}
        <div className="w-full max-w-[600px] mx-auto">
        <div className="flex flex-col items-center gap-[13px]">
          {/* Intent-fix (2026-07-08): tapClass wrapper is pixel-neutral
              (preflight zeroes button padding/border); HAv unchanged. */}
          {onAvatar ? (
            <button
              type="button"
              className={`${tapClass} hover:opacity-90 active:opacity-80`}
              onClick={onAvatar}
              aria-label="view profile picture"
              data-testid="profile-avatar-open"
            >
              <HAv
                txt={vm.initials}
                src={vm.avatarSrc}
                size={80}
                testId={avatarTestId}
              />
            </button>
          ) : (
            <HAv
              txt={vm.initials}
              src={vm.avatarSrc}
              size={80}
              testId={avatarTestId}
            />
          )}
          <div className="text-center">
            <div
              className="font-mono font-bold text-ui-name text-text"
              {...(nameTestId ? { "data-testid": nameTestId } : {})}
            >
              {vm.name}
            </div>
            {/* account-id line removed (user decision, 2026-07-05 walkthrough):
                proto:217's "co_z1a8…4f2" sub-text dropped per user feedback. */}
          </div>

          {/* primary CTA — maxWidth:320 mirrors proto:219 */}
          <div className="w-full max-w-[320px]">
            <PButton
              primary
              full
              icon="chat"
              label="create conversation"
              onClick={onMessage}
              data-testid={messageTestId}
            />
          </div>
          {secondarySlot && (
            <div className="w-full max-w-[320px] mt-2">{secondarySlot}</div>
          )}

          <PCard className="w-full max-w-[320px]">
            {/* Section order (user decision, 2026-07-05 walkthrough):
                "verify safety number" moved directly below the action-buttons block;
                shared-conversations list moves below it.
                Proto:221–230 had shared convos first, then safety. */}

            {/* Verify safety number expander — proto:222–230 (moved up) */}
            <button
              className={`${tapClass} w-full text-left flex items-center gap-[11px] px-[14px] py-[12px] hover:bg-panel-2 active:bg-hairline`}
              onClick={onToggleSafety}
              {...(safetyToggleTestId
                ? { "data-testid": safetyToggleTestId }
                : {})}
            >
              <Icon d="check" size={16} className="text-arcan-accent" />
              {/* 500 12px/1 body — mapped to font-body font-medium text-ui-toast leading-none */}
              <span className="flex-1 font-body font-medium text-ui-toast leading-none text-text">
                verify safety number
              </span>
              {/* caret — 600 13px/1 mono; ▾/▸ */}
              <span className="font-mono font-semibold text-ui-btn text-dim">
                {safetyOpen ? "▾" : "▸"}
              </span>
            </button>

            {/* Expanded safety area — proto:225–230 */}
            {safetyOpen && (
              <div
                className="border-t border-hairline"
                style={{ padding: "0 14px 14px" }}
              >
                {/* Rung-4: safetySlot = container's <SafetyNumber> (SN digits grid) */}
                {safetySlot}
                {/* compare hint — 400 9.5px/1.4 body; marginTop:11 is structural */}
                <div
                  className="font-body text-ui-tab leading-[1.4] text-dim text-center"
                  style={{ marginTop: 11 }}
                >
                  compare in person to confirm it&apos;s really them
                </div>
              </div>
            )}

            {/* Shared conversations row — proto:221 (moved below safety) */}
            {vm.sharedConversations === undefined ? (
              <PRow
                icon="chat"
                label="shared conversations"
                last
                right={
                  /* "soon" badge — 600 9px/1 .1em caps */
                  <span className="font-mono font-semibold text-ui-caps tracking-caps-10 uppercase text-dim">
                    soon
                  </span>
                }
              />
            ) : (
              vm.sharedConversations.map((conv, i) => (
                <PRow
                  key={conv.id}
                  icon="chat"
                  label={conv.title}
                  last={i === (vm.sharedConversations?.length ?? 0) - 1}
                  onClick={
                    onOpenConversation
                      ? () => onOpenConversation(conv.id)
                      : undefined
                  }
                />
              ))
            )}
          </PCard>
          {/* Rung-4: danger zone below the card (e.g. remove contact) */}
          {dangerZone && <div className="w-full max-w-[320px] mt-2">{dangerZone}</div>}
        </div>
        </div>{/* end max-w-[600px] cap */}
      </Body>
    </div>
  );
}
