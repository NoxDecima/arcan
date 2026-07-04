// src/ui/screens/own-profile-screen.tsx — own profile presenter.
// Node-for-node port of design/proto.jsx:241–256 (OwnProfileScreen).
//
// patched copy: design/proto.jsx:238–259 — '@' prefix dropped (rule 4);
// toast handlers replaced with onEditName / onEditAvatar callbacks.
// Pure: no Jazz, no router — enforced by scripts/check-ui-purity.sh.

import type { ReactNode, JSX } from "react";
import { PHeader, Body, HAv, PButton, PCard, PRow, Icon, tapClass } from "../kit";
import type { OwnProfileScreenVM } from "./profile-types";

export function OwnProfileScreen({
  vm,
  onBack,
  onEditName,
  onEditAvatar,
  onAddContact,
  onSettings,
  nameEditSlot,
  extraSections,
  avatarInput,
  rootTestId,
  backTestId,
  avatarTestId,
  avatarChangeTestId,
  nameTestId,
  editNameTestId,
  idTestId,
  addContactTestId,
  settingsTestId,
}: {
  vm: OwnProfileScreenVM;
  onBack: () => void;
  onEditName: () => void;               // pencil (proto: toast; app: inline edit)
  onEditAvatar: () => void;             // camera badge
  onAddContact: () => void;             // primary "add a contact"
  onSettings: () => void;               // "account & settings" row
  nameEditSlot?: ReactNode;             // Rung-4: inline name <input> when editing
  extraSections?: ReactNode;            // Rung-4: your-conversations list + safety + remove-avatar (app-only)
  avatarInput?: ReactNode;              // Rung-4: hidden <input type=file> (container owns)
  // testid carries
  rootTestId?: string;                  // "profile-view"
  backTestId?: string;                  // "profile-back"
  avatarTestId?: string;                // "profile-avatar"
  avatarChangeTestId?: string;          // "profile-avatar-change"
  nameTestId?: string;                  // "profile-display-name"
  editNameTestId?: string;              // "profile-edit-name"
  idTestId?: string;                    // "profile-account-id"
  addContactTestId?: string;            // "profile-add-contact"
  settingsTestId?: string;              // "profile-settings-link"
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
              className={`${tapClass} absolute -right-0.5 -bottom-0.5 w-7 h-7 rounded-pill bg-arcan-accent-fill border-2 border-bg justify-center`}
              onClick={onEditAvatar}
              aria-label="change avatar"
              {...(avatarChangeTestId
                ? { "data-testid": avatarChangeTestId }
                : {})}
            >
              <Icon d="camera" size={14} className="text-on-accent" />
            </button>
            {/* Rung-4: hidden file input owned by the container */}
            {avatarInput}
          </div>

          {/* Name + pencil or inline edit slot — proto:249 */}
          {nameEditSlot ?? (
            <button
              className={`${tapClass} gap-2`}
              onClick={onEditName}
              {...(editNameTestId ? { "data-testid": editNameTestId } : {})}
            >
              <span
                className="font-mono font-bold text-ui-name text-text"
                {...(nameTestId ? { "data-testid": nameTestId } : {})}
              >
                {vm.name}
              </span>
              <Icon d="pencil" size={15} className="text-dim" />
            </button>
          )}

          {/* Account ID — proto:250: 400 11px/1 mono; marginTop:-8 is structural */}
          <div
            className="font-mono text-ui-value text-dim"
            style={{ marginTop: -8 }}
            {...(idTestId ? { "data-testid": idTestId } : {})}
          >
            {vm.idShort}
          </div>

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

          {/* Settings row card — proto:252–254 */}
          <PCard className="w-full max-w-[320px]">
            <PRow
              icon="gear"
              label="account & settings"
              onClick={onSettings}
              last
              data-testid={settingsTestId}
            />
          </PCard>

          {/* Rung-4: app-only sections (your conversations, safety, remove-avatar) */}
          {extraSections}
        </div>
      </Body>
    </div>
  );
}
