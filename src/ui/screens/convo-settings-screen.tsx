// src/ui/screens/convo-settings-screen.tsx — group conversation settings presenter.
// Node-for-node port of design/proto.jsx:331–353 (ConvoSettingsScreen).
//
// patched-copy notes (proto-cells.jsx patched copy):
//   - toast/nav stubbed (no-op)
//   - local MEMBERS fixture defined (proto-module-local)
//   - dots kebab button dropped in BOTH proto copy and app cell (renderMemberEnd=undefined → match)
// Bespoke group avatar: 70px, rounded-[16px] (s.radius+4), NOT HAv (radius/fontSize differ).
// Pure: no Jazz, no router — enforced by scripts/check-ui-purity.sh.

import type { ReactNode, JSX } from "react";
import { PHeader, Body, HAv, PButton, Icon, tapClass } from "../kit";
import type { ConvoMemberVM } from "./picker-types";

export function ConvoSettingsScreen({
  onBack,
  title,
  initials,
  avatarSlot,
  sub,
  onEditAvatar,
  onEditTitle,
  titleEditSlot,
  admins,
  writers,
  iAmAdmin,
  onAddPeople,
  renderMemberEnd,
  onOpenMember,
  onLeave,
  // testid carries
  backTestId,
  avatarTestId,
  avatarEditTestId,
  titleTestId,
  editTitleTestId,
  membersCountTestId,
  addMemberTestId,
  adminsSectionTestId,
  writersSectionTestId,
  leaveTestId,
}: {
  onBack?: () => void;                          // mobile only ("back-btn")
  title: string;                                // group name, plain
  initials: string;                             // bespoke avatar initials (when no avatarSlot)
  avatarSlot?: ReactNode;                       // Rung-4: <ConversationAvatar>; parity = bespoke
  sub: string;                                  // e.g. "5 members" — "// " prepended in presenter
  onEditAvatar?: () => void;                    // camera badge (admin)
  onEditTitle?: () => void;                     // pencil (admin)
  titleEditSlot?: ReactNode;                    // Rung-4: inline title <input> + save/cancel
  admins: ConvoMemberVM[];
  writers: ConvoMemberVM[];
  iAmAdmin: boolean;
  onAddPeople: () => void;                      // "add people" pill — "add-member-btn"
  renderMemberEnd?: (m: ConvoMemberVM) => ReactNode; // Rung-4: kebab menu
  onOpenMember?: (accountID: string) => void;  // avatar/name → profile
  onLeave: () => void;                          // danger "leave conversation" — "leave-conversation-btn"
  // testid carries
  backTestId?: string;           // "back-btn"
  avatarTestId?: string;         // "members-header-avatar"
  avatarEditTestId?: string;     // "conversation-icon-upload"
  titleTestId?: string;          // "group-title-*"
  editTitleTestId?: string;      // "group-title-edit"
  membersCountTestId?: string;   // "members-count"
  addMemberTestId?: string;      // "add-member-btn"
  adminsSectionTestId?: string;  // "members-section-admins"
  writersSectionTestId?: string; // "members-section-writers"
  leaveTestId?: string;          // "leave-conversation-btn"
}): JSX.Element {

  const memberRow = (m: ConvoMemberVM) => (
    <div
      key={m.accountID}
      className="flex items-center gap-3 py-[9px] px-[10px]"
      data-testid={`member-row-${m.accountID}`}
    >
      {/* Avatar + name — tappable → onOpenMember (Rung-4) */}
      <button
        className={`${tapClass} flex items-center gap-3 flex-1 min-w-0`}
        onClick={onOpenMember ? () => onOpenMember(m.accountID) : undefined}
        data-testid={`member-profile-link-${m.accountID}`}
      >
        <HAv
          txt={m.initials}
          src={m.avatarSrc}
          size={36}
          testId={`member-avatar-${m.accountID}`}
        />
        {/* 600 12.5px/1.2 body → font-body font-semibold text-ui-row */}
        <span className="flex-1 min-w-0 font-body font-semibold text-ui-row text-text text-left">
          {m.name}
          {m.you && (
            <span className="text-dim font-normal"> · you</span>
          )}
        </span>
      </button>

      {/* Role badge — 600 9px/1 mono .08em caps pill (cluster) */}
      <span
        className={[
          "font-mono font-semibold text-ui-caps tracking-caps-08 uppercase",
          "px-2 py-1 rounded-pill",
          m.role === "admin"
            ? "bg-accent-soft text-arcan-accent border border-accent-border"
            : "bg-panel-2 text-text-2 border border-hairline",
        ].join(" ")}
      >
        {m.role}
      </span>

      {/* Rung-4: kebab menu via renderMemberEnd — omitted in parity */}
      {renderMemberEnd ? renderMemberEnd(m) : null}
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* PHeader — mobile only (proto always shows it; desktop nav col replaces back) */}
      {onBack && (
        <PHeader
          title="conversation settings"
          onBack={onBack}
          backTestId={backTestId}
        />
      )}

      {/* Body: no pad (proto:334 Body with no pad prop) */}
      <Body>
        {/* ── Group card ──────────────────────────────────────────────────── */}
        {/* proto:334–340: flex-col items-center gap:9 px:18 pt:24 pb:18 border-b */}
        <div className="flex flex-col items-center gap-[9px] px-[18px] pt-6 pb-[18px] border-b border-hairline">

          {/* Bespoke 70px group avatar + camera badge (cluster) */}
          <div className="relative">
            {avatarSlot ?? (
              /* Bespoke: 70px, radius 16 (s.radius+4), NOT HAv */
              <div
                className="bg-avatar-group text-avatar-group-fg border border-hairline flex items-center justify-center"
                style={{ width: 70, height: 70, borderRadius: 16, fontSize: 22, fontFamily: "var(--font-mono)", fontWeight: 600, lineHeight: 1 }}
                {...(avatarTestId ? { "data-testid": avatarTestId } : {})}
              >
                {initials}
              </div>
            )}

            {/* Camera badge — proto:337: absolute right:-2 bottom:-2 w:26 h:26 pill accentFill 2px bg */}
            {(onEditAvatar || iAmAdmin) && (
              <button
                className={`${tapClass} absolute -right-0.5 -bottom-0.5 w-[26px] h-[26px] rounded-pill bg-arcan-accent-fill border-2 border-bg justify-center`}
                onClick={onEditAvatar}
                aria-label="edit group photo"
                {...(avatarEditTestId ? { "data-testid": avatarEditTestId } : {})}
              >
                <Icon d="camera" size={13} className="text-on-accent" />
              </button>
            )}
          </div>

          {/* Title + pencil (or inline edit slot) — proto:339 */}
          {titleEditSlot ?? (
            <button
              className={`${tapClass} gap-2`}
              onClick={onEditTitle}
              {...(editTitleTestId ? { "data-testid": editTitleTestId } : {})}
            >
              {/* 700 18px/1.2 headMono → font-mono font-bold text-ui-heading */}
              {/* All font properties inline: CSS-class font-size/line-height var() paths render differently in Chrome */}
              <span
                className="font-mono font-bold text-ui-heading text-text"
                style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "var(--fs-ui-heading)", lineHeight: 1.2 }}
                {...(titleTestId ? { "data-testid": titleTestId } : {})}
              >
                {title}
              </span>
              <Icon d="pencil" size={14} className="text-dim" />
            </button>
          )}

          {/* Sub: "// {sub}" — proto:340: 400 11px/1 headMono → font-mono text-ui-value leading-none */}
          {/* CSS class path matches proto inline for this token; no override needed */}
          <span
            className="font-mono text-ui-value leading-none text-dim"
            {...(membersCountTestId ? { "data-testid": membersCountTestId } : {})}
          >
            {"// "}{sub}
          </span>
        </div>

        {/* ── Member list ─────────────────────────────────────────────────── */}
        {/* proto:342–351: padding '10px 12px' */}
        <div className="px-3 py-2.5">

          {/* Admins header row + "add people" pill — proto:343–345 */}
          <div
            className="flex items-center py-1 px-2 pb-2"
            {...(adminsSectionTestId ? { "data-testid": adminsSectionTestId } : {})}
          >
            {/* "// admins" caps — 600 9px/1 mono .16em uppercase */}
            <span className="flex-1 font-mono font-semibold text-ui-caps tracking-caps uppercase text-dim">
              {"// admins"}
            </span>

            {/* "add people" pill — proto:345 */}
            <button
              className={`${tapClass} gap-[6px] px-[11px] py-[5px] rounded-pill bg-arcan-accent-fill`}
              onClick={onAddPeople}
              {...(addMemberTestId ? { "data-testid": addMemberTestId } : {})}
            >
              <Icon d="plus" size={13} sw={2.4} className="text-on-accent" />
              {/* 600 11px/1 headMono → font-mono font-semibold text-ui-value */}
              <span className="font-mono font-semibold text-ui-value leading-none text-on-accent">
                add people
              </span>
            </button>
          </div>

          {/* Admin rows — proto:347 */}
          {admins.map(memberRow)}

          {/* "// members" header — proto:348 */}
          {/* Strut pin: block div; inline-style pins the proto's ambient context (16px/1.125)
              so the implicit line-box matches. Same convention as PSectionLabel — see
              src/ui/kit/psection-label.tsx header comment (Task 7 Phase 1). */}
          <div
            className="pt-[14px] px-2 pb-2"
            style={{ fontSize: 16, lineHeight: "1.125" }}
            {...(writersSectionTestId ? { "data-testid": writersSectionTestId } : {})}
          >
            <span className="font-mono font-semibold text-ui-caps tracking-caps uppercase text-dim">
              {"// members"}
            </span>
          </div>

          {/* Writer rows — proto:349 */}
          {writers.map(memberRow)}

          {/* Leave conversation button — proto:350 */}
          <div className="mt-[18px]">
            <PButton
              danger
              full
              label="leave conversation"
              onClick={onLeave}
              data-testid={leaveTestId}
            />
          </div>
        </div>
      </Body>
    </div>
  );
}
