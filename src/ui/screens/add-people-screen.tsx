// src/ui/screens/add-people-screen.tsx — "add people to group" picker presenter.
// Node-for-node port of design/proto.jsx:439–455 (AddPeopleScreen).
//
// patched-copy notes (proto-cells.jsx patched copy):
//   - local pool fixture defined (proto-module-local)
//   - sel=[0,1] → EL+NX selected; groupName="retrieval-squad"
//   - toast/nav stubbed
//
// WIRING NOTE: AddPeopleScreen is built for coverage completeness (Rung-1) but
// NOT wired in Wave C — members.tsx retains the ContactPicker overlay (9-6 decision).
// Pure: no Jazz, no router — enforced by scripts/check-ui-purity.sh.

import type { JSX } from "react";
import { PHeader, Body, HAv, PButton, PSectionLabel, Icon, tapClass } from "../kit";
import type { PickItem } from "./picker-types";

export function AddPeopleScreen({
  onBack,
  groupName,
  pool,
  selected,
  onToggle,
  onAdd,
  addDisabled,
}: {
  onBack: () => void;
  groupName: string;                   // header sub "to {groupName}"
  pool: PickItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onAdd: () => void;                   // "add N people"
  addDisabled: boolean;
}): JSX.Element {
  const n = selected.size;
  const addLabel = `add ${n} ${n === 1 ? "person" : "people"}`;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PHeader
        title="add people"
        sub={
          /* proto:440: 400 10px/1 body → font-body text-ui-chatsub text-text-2 */
          /* inline fontSize: CSS-class var() resolves differently in Chrome; inline override matches proto rendering */
          <span className="font-body text-ui-chatsub text-text-2" style={{ fontSize: "var(--fs-ui-sys)" }}>
            to {groupName}
          </span>
        }
        onBack={onBack}
      />

      {/* Body: scrollable pick-rows — proto:441–451 */}
      <Body>
        <div className="pt-2.5 px-2">
          <PSectionLabel>contacts not in this group</PSectionLabel>
        </div>
        <div className="px-2 flex flex-col gap-px">
          {pool.map((d) => {
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

      {/* Footer — proto:452–454 */}
      <div className="shrink-0 p-3 border-t border-hairline">
        <PButton
          primary
          full
          label={addLabel}
          onClick={onAdd}
          className={addDisabled ? "opacity-50" : undefined}
          disabled={addDisabled}
        />
      </div>
    </div>
  );
}
