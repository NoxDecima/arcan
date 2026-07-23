// src/ui/screens/new-convo-screen.tsx — new conversation picker presenter.
// Node-for-node port of design/proto.jsx:368–394 (NewConvoScreen).
//
// patched-copy notes (proto-cells.jsx patched copy):
//   - sel=[0,3] (AK+RA → isGroup=true; groupNameSlot = static placeholder pill)
//   - toast/nav stubbed; HF_CONTACTS from window
// Bespoke 42px group-placeholder avatar: rounded-[14px] (s.radius+2), NOT HAv.
// Pure: no Jazz, no router — enforced by scripts/check-ui-purity.sh.

import type { ReactNode, JSX } from "react";
import { PHeader, Body, HAv, PButton, Icon, tapClass } from "../kit";
import type { PickItem } from "./picker-types";

export function NewConvoScreen({
  onBack,
  contacts,
  selected,
  onToggle,
  groupNameSlot,
  emptySlot,
  errorSlot,
  submitLabel,
  submitDisabled,
  onSubmit,
  onGroupImagePick,
  groupImageUrl,
  // testid carries
  backTestId,
  emptyTestId,
  errorTestId,
  submitTestId,
}: {
  onBack: () => void;                    // "new-convo-back"
  contacts: PickItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  /** Rung-4: real <input> when isGroup (bound in container). */
  groupNameSlot?: ReactNode;
  /** Rung-4: "no contacts yet" block — carry new-convo-empty. */
  emptySlot?: ReactNode;
  /** Rung-4: create error — carry new-convo-error. */
  errorSlot?: ReactNode;
  submitLabel: string;
  submitDisabled: boolean;
  onSubmit: () => void;                  // "new-convo-submit"
  /** intent-fix (feedback round 2): direct image pick from the group bubble.
   * When provided the placeholder becomes a button; parity cells omit it. */
  onGroupImagePick?: () => void;
  groupImageUrl?: string | null;
  // testid carries
  backTestId?: string;    // "new-convo-back"
  emptyTestId?: string;   // "new-convo-empty"
  errorTestId?: string;   // "new-convo-error"
  submitTestId?: string;  // "new-convo-submit"
  // per-contact: "new-convo-contact-<id>" applied in the row
}): JSX.Element {
  const isGroup = selected.size >= 2;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PHeader
        title="new conversation"
        onBack={onBack}
        backTestId={backTestId}
      />

      {/* intent-fix (feedback round 2): 600px content cap on desktop — same pattern as own-profile-screen (2026-07-05 decision #1). Parity cells render at 300px and are unaffected. */}
      <div className="w-full max-w-[600px] mx-auto flex flex-col flex-1 min-h-0">

        {/* Group-name row — shown when isGroup; proto:370–375 */}
        {isGroup && (
          <div className="shrink-0 flex items-center gap-3 px-[14px] py-[13px] border-b border-hairline">
            {/* Bespoke 42px group-placeholder avatar: rounded-[14px] (s.radius+2), NOT HAv */}
            {onGroupImagePick ? (
              <button
                type="button"
                onClick={onGroupImagePick}
                aria-label="choose a group picture"
                data-testid="new-convo-group-image"
                className={`${tapClass} bg-avatar-group text-avatar-group-fg border border-hairline flex items-center justify-center shrink-0 overflow-hidden hover:opacity-90 active:opacity-80`}
                style={{ width: 42, height: 42, borderRadius: 14, fontSize: 14, fontFamily: "var(--font-mono)", fontWeight: 600, lineHeight: 1 }}
              >
                {groupImageUrl ? (
                  <img src={groupImageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Icon d="camera" size={16} />
                )}
              </button>
            ) : (
              <div
                className="bg-avatar-group text-avatar-group-fg border border-hairline flex items-center justify-center shrink-0"
                style={{ width: 42, height: 42, borderRadius: 14, fontSize: 14, fontFamily: "var(--font-mono)", fontWeight: 600, lineHeight: 1 }}
              >
                ?
              </div>
            )}

            {/* Group name input slot (Rung-4: real <input>) or placeholder pill */}
            {groupNameSlot ?? (
              /* Static placeholder pill — proto:373; rendered when groupNameSlot is omitted */
              <div className="flex-1 h-9 rounded-r-4 border border-hairline bg-panel flex items-center px-3">
                {/* 400 12px/1 body placeholder → font-body text-ui-toast leading-none text-dim */}
                <span className="font-body text-ui-toast leading-none text-dim">
                  group name (optional)
                </span>
              </div>
            )}
          </div>
        )}

        {/* Contacts caps + hint row — proto:376–379 */}
        <div className="shrink-0 flex items-center px-4 pt-3 pb-1.5">
          {/* "// contacts" — 600 9px/1 mono .16em caps */}
          <span className="flex-1 font-mono font-semibold text-ui-caps tracking-caps uppercase text-dim">
            {"// contacts"}
          </span>
          {/* "one · two+ = group" hint — 400 10px/1 body */}
          {/* inline fontSize: CSS-class var() resolves differently than inline in Chrome; override forces matching rendering */}
          <span className="font-body text-ui-chatsub text-dim" style={{ fontSize: "var(--fs-ui-sys)" }}>
            one · two+ = group
          </span>
        </div>

        {/* Body: scrollable pick-rows — proto:380–390 */}
        <Body>
          {emptySlot && (
            <div {...(emptyTestId ? { "data-testid": emptyTestId } : {})}>
              {emptySlot}
            </div>
          )}
          <div className="px-2 flex flex-col gap-px">
            {contacts.map((d) => {
              const on = selected.has(d.id);
              return (
                <button
                  key={d.id}
                  onClick={() => onToggle(d.id)}
                  aria-pressed={on}
                  className={[
                    tapClass,
                    "w-full text-left flex items-center gap-3 px-3 py-[9px] rounded-r-4",
                    on ? "bg-accent-soft" : "bg-transparent",
                  ].join(" ")}
                  data-testid={`new-convo-contact-${d.id}`}
                >
                  <HAv txt={d.initials} src={d.avatarSrc} size={36} />
                  {/* 600 12.5px/1.2 body → font-body font-semibold text-ui-row */}
                  <span className="flex-1 font-body font-semibold text-ui-row text-text">
                    {d.name}
                  </span>
                  {/* Checkbox — pick-row cluster: rounded-avatar (10px) = s.radius-2 */}
                  <span
                    className={[
                      "w-5 h-5 rounded-avatar border-[1.5px] flex items-center justify-center shrink-0",
                      on
                        ? "bg-arcan-accent-fill border-transparent"
                        : "border-hairline",
                    ].join(" ")}
                  >
                    {on && (
                      <Icon d="check" size={12} sw={3} className="text-on-accent" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </Body>

        {/* Footer — proto:391–393 */}
        <div className="shrink-0 p-3 border-t border-hairline bg-chrome">
          {errorSlot && (
            <div
              className="mb-2"
              {...(errorTestId ? { "data-testid": errorTestId } : {})}
            >
              {errorSlot}
            </div>
          )}
          <PButton
            primary
            full
            label={submitLabel}
            onClick={onSubmit}
            disabled={submitDisabled}
            data-testid={submitTestId}
          />
        </div>

      </div>
    </div>
  );
}
