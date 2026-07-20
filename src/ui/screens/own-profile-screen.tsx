// src/ui/screens/own-profile-screen.tsx — own profile presenter.
// Node-for-node port of design/proto.jsx:241–256 (OwnProfileScreen).
//
// patched copy: design/proto.jsx:238–259 — '@' prefix dropped (rule 4);
// toast handlers replaced with onEditName / onEditAvatar callbacks.
//
// User decisions (2026-07-05 walkthrough):
//   1. Content column capped at 600px (mx-auto).
//   7. Account-id line removed (proto:250's "co_z1a8…4f2" sub-text dropped).
//      idTestId prop removed accordingly. Proto-cells.jsx patched to match.
// Pure: no Jazz, no router — enforced by scripts/check-ui-purity.sh.

import type { ReactNode, JSX } from "react";
import { PHeader, Body, HAv, PButton, PCard, Icon, tapClass } from "../kit";
import type { OwnProfileScreenVM } from "./profile-types";

export function OwnProfileScreen({
  vm,
  onBack,
  onEditName,
  onEditAvatar,
  onAddContact,
  onRemoveAvatar,
  safetyOpen,
  onToggleSafety,
  safetySlot,
  nameEditSlot,
  extraSections,
  avatarInput,
  rootTestId,
  backTestId,
  avatarTestId,
  avatarChangeTestId,
  nameTestId,
  editNameTestId,
  addContactTestId,
  safetyToggleTestId,
}: {
  vm: OwnProfileScreenVM;
  onBack: () => void;
  onEditName: () => void;               // pencil (proto: toast; app: inline edit)
  onEditAvatar: () => void;             // camera badge
  onAddContact: () => void;             // primary "add a contact"
  /** intent-fix (feedback round 2): remove-avatar icon button next to the
   * avatar (confirmation handled by the container). Omitted in parity cells. */
  onRemoveAvatar?: () => void;
  /** In-card "view security code" expander — user decision 2026-07-05; absent in parity cells. */
  safetyOpen?: boolean;
  onToggleSafety?: () => void;
  safetySlot?: ReactNode;               // SafetyNumber + hint (supplied by container)
  nameEditSlot?: ReactNode;             // Rung-4: inline name <input> when editing
  extraSections?: ReactNode;            // Rung-4: your-conversations list (app-only)
  avatarInput?: ReactNode;              // Rung-4: hidden <input type=file> (container owns)
  // testid carries
  rootTestId?: string;                  // "profile-view"
  backTestId?: string;                  // "profile-back"
  avatarTestId?: string;                // "profile-avatar"
  avatarChangeTestId?: string;          // "profile-avatar-change"
  nameTestId?: string;                  // "profile-display-name"
  editNameTestId?: string;              // "profile-edit-name"
  // idTestId removed — account-id line dropped (user decision 2026-07-05 walkthrough)
  addContactTestId?: string;            // "profile-add-contact"
  safetyToggleTestId?: string;          // "profile-safety-toggle"
}): JSX.Element {
  return (
    <div
      className="flex flex-col flex-1 min-h-0"
      {...(rootTestId ? { "data-testid": rootTestId } : {})}
    >
      <PHeader
        title="your profile"
        onBack={onBack}
        backTestId={backTestId}
      />
      <Body pad={"24px 20px"}>
        {/* 600px content cap — full-viewport desktop (user decision 2026-07-05) */}
        <div className="w-full max-w-[600px] mx-auto">
        <div className="flex flex-col items-center gap-[13px]">
          {/* Avatar + camera badge — proto:245–248 */}
          <div className="relative">
            <HAv
              txt={vm.initials}
              src={vm.avatarSrc}
              size={80}
              testId={avatarTestId}
            />
            {/* Camera badge — proto:247: absolute right:-2 bottom:-2 w:28 h:28 rounded-pill accentFill 2px solid bg */}
            <button
              className={`${tapClass} absolute -right-0.5 -bottom-0.5 w-7 h-7 rounded-pill bg-arcan-accent-fill border-2 border-bg justify-center hover:opacity-90 active:opacity-80`}
              onClick={onEditAvatar}
              aria-label="change avatar"
              {...(avatarChangeTestId
                ? { "data-testid": avatarChangeTestId }
                : {})}
            >
              <Icon d="camera" size={14} className="text-on-accent" />
            </button>
            {onRemoveAvatar && (
              <button
                className={`${tapClass} absolute -left-0.5 -bottom-0.5 w-7 h-7 rounded-pill bg-panel border-2 border-bg justify-center hover:bg-panel-2 active:bg-hairline`}
                onClick={onRemoveAvatar}
                aria-label="remove profile picture"
                data-testid="profile-avatar-remove"
              >
                <Icon d="close" size={13} className="text-red" />
              </button>
            )}
            {/* Rung-4: hidden file input owned by the container */}
            {avatarInput}
          </div>

          {/* Name + pencil or inline edit slot — proto:249 */}
          {nameEditSlot ?? (
            <button
              className={`${tapClass} group gap-2 rounded-r-2 hover:bg-panel-2 active:bg-hairline`}
              onClick={onEditName}
              {...(editNameTestId ? { "data-testid": editNameTestId } : {})}
            >
              <span
                className="font-mono font-bold text-ui-name text-text"
                {...(nameTestId ? { "data-testid": nameTestId } : {})}
              >
                {vm.name}
              </span>
              <Icon d="pencil" size={15} className="text-dim group-hover:text-text group-active:text-text transition-colors duration-fast ease-out" />
            </button>
          )}

          {/* Account-id line removed (user decision, 2026-07-05 walkthrough):
              proto:250's "co_z1a8…4f2" sub-text dropped per user feedback. */}

          {/* Primary CTA — proto:251: maxWidth:320 */}
          <div className="w-full max-w-[320px]">
            <PButton
              primary
              full
              icon="plus"
              label="add a contact"
              onClick={onAddContact}
              data-testid={addContactTestId}
            />
          </div>

          {/* Settings row dropped (feedback round 2): the home-header gear is
              the settings entry; the profile card now holds only the
              security-code expander. Proto cell patched to match. */}
          {onToggleSafety && (
            <PCard className="w-full max-w-[320px]">
              <div data-testid="profile-safety-section">
                <button
                  className={`${tapClass} w-full text-left flex items-center gap-[11px] px-[14px] py-[12px] hover:bg-panel-2 active:bg-hairline`}
                  onClick={onToggleSafety}
                  {...(safetyToggleTestId ? { "data-testid": safetyToggleTestId } : {})}
                >
                  <Icon d="check" size={16} className="text-arcan-accent" />
                  <span className="flex-1 font-body font-medium text-ui-toast leading-none text-text">
                    view security code
                  </span>
                  <span className="font-mono font-semibold text-ui-btn text-dim">
                    {safetyOpen ? "▾" : "▸"}
                  </span>
                </button>
                {safetyOpen && (
                  <div
                    className="border-t border-hairline"
                    style={{ padding: "0 14px 14px" }}
                  >
                    {safetySlot}
                  </div>
                )}
              </div>
            </PCard>
          )}

          {/* Rung-4: app-only sections (safety, your-conversations, remove-avatar)
              Section order (user decision, 2026-07-05 walkthrough):
              safety moved directly below the action-buttons block. */}
          {extraSections}
        </div>
        </div>{/* end max-w-[600px] cap */}
      </Body>
    </div>
  );
}
