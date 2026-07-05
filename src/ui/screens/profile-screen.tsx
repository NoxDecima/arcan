// src/ui/screens/profile-screen.tsx — contact profile presenter.
// Node-for-node port of design/proto.jsx:210–234 (ProfileScreen).
//
// patched copy: design/proto.jsx:205–236 — '@' prefix dropped (rule 4);
// safety collapsed (safetyOpen prop); shared=soon when sharedConversations=undefined.
// Pure: no Jazz, no router — enforced by scripts/check-ui-purity.sh.

import type { ReactNode, JSX } from "react";
import { PHeader, Body, HAv, PButton, PCard, PRow, Icon, tapClass } from "../kit";
import type { ProfileScreenVM } from "./profile-types";

export function ProfileScreen({
  vm,
  onBack,
  onMenu,
  onMessage,
  onOpenConversation,
  safetyOpen,
  onToggleSafety,
  safetySlot,
  dangerZone,
  rootTestId,
  backTestId,
  avatarTestId,
  nameTestId,
  idTestId,
  messageTestId,
  safetyToggleTestId,
}: {
  vm: ProfileScreenVM;
  onBack: () => void;
  onMenu?: () => void;                  // header-right dots (proto:211)
  onMessage: () => void;                // primary "message" PButton
  onOpenConversation?: (id: string) => void; // Rung-4 real shared list
  safetyOpen: boolean;                  // expandable "verify safety number"
  onToggleSafety: () => void;
  safetySlot?: ReactNode;               // Rung-4: container's <SafetyNumber> (expanded body)
  /** Rung-4: app-only danger zone below the card (e.g. "remove contact" button). */
  dangerZone?: ReactNode;
  // testid carries
  rootTestId?: string;                  // "profile-view"
  backTestId?: string;                  // "profile-back"
  avatarTestId?: string;                // "profile-avatar"
  nameTestId?: string;                  // "profile-display-name"
  idTestId?: string;                    // "profile-account-id"
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
            <button className={tapClass} onClick={onMenu}>
              <Icon d="dots" size={18} fill className="text-text-2" />
            </button>
          ) : undefined
        }
      />
      <Body pad={"24px 20px"}>
        <div className="flex flex-col items-center gap-[13px]">
          <HAv
            txt={vm.initials}
            src={vm.avatarSrc}
            size={80}
            testId={avatarTestId}
          />
          <div className="text-center">
            <div
              className="font-mono font-bold text-ui-name text-text"
              {...(nameTestId ? { "data-testid": nameTestId } : {})}
            >
              {vm.name}
            </div>
            {/* proto:217 — 400 11px/1 mono; marginTop:5 is structural (5px, not a multiple of 4) */}
            <div
              className="font-mono text-ui-value text-dim"
              style={{ marginTop: 5 }}
              {...(idTestId ? { "data-testid": idTestId } : {})}
            >
              {vm.idShort}
            </div>
          </div>

          {/* primary CTA — maxWidth:320 mirrors proto:219 */}
          <div className="w-full max-w-[320px]">
            <PButton
              primary
              full
              icon="chat"
              label="message"
              onClick={onMessage}
              data-testid={messageTestId}
            />
          </div>

          <PCard className="w-full max-w-[320px]">
            {/* Shared conversations row — proto:221 */}
            {vm.sharedConversations === undefined ? (
              <PRow
                icon="chat"
                label="shared conversations"
                right={
                  /* "soon" badge — 600 9px/1 .1em caps */
                  <span className="font-mono font-semibold text-ui-caps tracking-caps-10 uppercase text-dim">
                    soon
                  </span>
                }
              />
            ) : (
              vm.sharedConversations.map((conv) => (
                <PRow
                  key={conv.id}
                  icon="chat"
                  label={conv.title}
                  onClick={
                    onOpenConversation
                      ? () => onOpenConversation(conv.id)
                      : undefined
                  }
                />
              ))
            )}

            {/* Verify safety number expander — proto:222–230 */}
            <button
              className={`${tapClass} w-full text-left flex items-center gap-[11px] px-[14px] py-[12px]`}
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
          </PCard>
          {/* Rung-4: danger zone below the card (e.g. remove contact) */}
          {dangerZone && <div className="w-full max-w-[320px] mt-2">{dangerZone}</div>}
        </div>
      </Body>
    </div>
  );
}
