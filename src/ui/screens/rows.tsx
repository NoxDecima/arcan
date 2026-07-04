// src/ui/screens/rows.tsx — shared row components for ChatsScreen, ContactsScreen,
// and NavColumn (desktop). Pure: imports only from ../kit and ./home-types.
//
// ConvoRow: node-for-node port of design/proto.jsx:95–107 (mobile) / :744–757
// (desktop, adds `active`).
// ContactRow: node-for-node port of design/proto.jsx:134–143.
//
// Presence dots are omitted (NOX-31): the proto's `status={d.online ? 'online' : undefined}`
// was dropped in the parity-cell patched copies and is absent here too.
// See mapping table entries: convo/contact list container, convo row, contact row,
// unread pill.

import { HAv, Icon, tapClass } from "../kit";
import type { ConvoItem, ContactItem } from "./home-types";
import type { JSX } from "react";

export function ConvoRow({
  item,
  active,
  onClick,
  testScope,
  index = 0,
}: {
  item: ConvoItem;
  active?: boolean;
  onClick: () => void;
  testScope?: string;
  index?: number;
}): JSX.Element {
  const tid = (name: string) =>
    testScope ? `${testScope}-${name}` : name;

  return (
    <button
      type="button"
      data-testid={tid(`conversation-row-${index}`)}
      onClick={onClick}
      className={`${tapClass} w-full text-left gap-[11px] px-2.5 py-[9px] rounded-r-4${active ? " bg-accent-soft" : ""}`}
    >
      {/* NOX-31: presence dropped — no status prop */}
      <div data-testid={tid(`conversation-avatar-${index}`)}>
        <HAv
          txt={item.initials}
          src={item.avatarSrc}
          size={38}
          group={item.group}
          ring={active ? "var(--color-accent-soft)" : "var(--color-bg)"}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span
            data-testid={tid(`conversation-name-${index}`)}
            className={`flex-1 font-body text-ui-row truncate text-text ${item.unread ? "font-bold" : "font-semibold"}`}
          >
            {item.name}
          </span>
          <span
            data-testid={tid(`conversation-time-${index}`)}
            className="font-mono font-medium text-ui-tab text-dim"
          >
            {item.time}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            data-testid={tid(`conversation-preview-${index}`)}
            className={`flex-1 font-body text-ui-preview truncate ${item.unread ? "font-medium text-text-2" : "text-dim"}`}
          >
            {item.preview}
          </span>
          {item.unread > 0 && (
            <span
              data-testid={tid(`unread-badge-${index}`)}
              className="min-w-[17px] h-[17px] px-[5px] rounded-pill bg-arcan-accent-fill text-on-accent text-center font-mono font-bold text-ui-tab"
              style={{ lineHeight: "17px" }}
            >
              {item.unread > 99 ? "99+" : item.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function ContactRow({
  item,
  onClick,
  "data-testid": testId,
}: {
  item: ContactItem;
  onClick: () => void;
  "data-testid"?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`${tapClass} w-full text-left gap-3 px-3 py-2.5 rounded-r-4`}
    >
      <HAv txt={item.initials} src={item.avatarSrc} size={38} />
      <span className="flex-1 font-body font-semibold text-ui-contact text-text">
        {item.name}
      </span>
      <Icon d="chev" size={16} className="text-dim" />
    </button>
  );
}
