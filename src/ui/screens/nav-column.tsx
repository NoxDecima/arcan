// src/ui/screens/nav-column.tsx — desktop navigation column presenter.
// Pure: props in, JSX out. Imports only from ../kit, ./home-types, ./rows, react.
// Node-for-node port of design/proto.jsx:763–780 (DesktopApp left column).
//
// patched copy: design/proto.jsx:731–780 — presence dropped (NOX-31), see manifest.

import type { ReactNode } from "react";
import { HAv, Icon, Fab, tapClass } from "../kit";
import type { HomeProfile, ConvoItem, ContactItem } from "./home-types";
import { ConvoRow, ContactRow } from "./rows";

const DEFAULT_CHATS_EMPTY = "no conversations yet";
const DEFAULT_CONTACTS_EMPTY = "no contacts yet";

export function NavColumn(props: {
  profile: HomeProfile;
  tab: "chats" | "contacts";
  onTab: (t: "chats" | "contacts") => void;
  convos: ConvoItem[];
  contacts: ContactItem[];
  activeConvoId?: string;
  onOpenConvo: (id: string) => void;
  onOpenContact: (id: string) => void;
  onOwnProfile: () => void;
  onSettings: () => void;
  onFab: () => void;
  pendingSlot?: ReactNode;
  chatsEmptyText?: string;
  contactsEmptyText?: string;
}): JSX.Element {
  const {
    profile,
    tab,
    onTab,
    convos,
    contacts,
    activeConvoId,
    onOpenConvo,
    onOpenContact,
    onOwnProfile,
    onSettings,
    onFab,
    pendingSlot,
    chatsEmptyText = DEFAULT_CHATS_EMPTY,
    contactsEmptyText = DEFAULT_CONTACTS_EMPTY,
  } = props;

  return (
    <div className="w-[320px] shrink-0 relative border-r border-hairline bg-bg flex flex-col h-full">
      {/* Nav header */}
      <div className="flex items-center gap-2.5 pt-[13px] px-3.5 pb-2.5">
        <button
          type="button"
          data-testid="sidebar-header-profile"
          aria-label="your profile"
          onClick={onOwnProfile}
          className={`${tapClass} gap-2.5 flex-1 min-w-0`}
        >
          <div data-testid="sidebar-avatar">
            <HAv txt={profile.initials} src={profile.avatarSrc} size={32} />
          </div>
          <span
            data-testid="sidebar-display-name"
            className="font-mono font-bold text-ui-nav text-text truncate"
          >
            {profile.name}
          </span>
        </button>
        <button
          type="button"
          data-testid="sidebar-settings-gear"
          aria-label="settings"
          onClick={onSettings}
          className={tapClass}
        >
          <Icon d="gear" size={19} className="text-text-2" />
        </button>
      </div>

      {/* Tabs row */}
      <div className="flex border-b border-hairline px-2">
        {(["chats", "contacts"] as const).map((key) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onTab(key)}
              className={`${tapClass} flex-1 justify-center gap-[7px] py-[11px] -mb-px border-b-2 ${active ? "border-arcan-accent-fill" : "border-transparent"}`}
            >
              <Icon
                d={key === "contacts" ? "people" : "chat"}
                size={15}
                className={active ? "text-arcan-accent" : "text-dim"}
              />
              <span
                className={`font-mono text-ui-empty-sub tracking-tab ${active ? "font-semibold text-text" : "font-medium text-dim"}`}
              >
                {key}
              </span>
            </button>
          );
        })}
      </div>

      {/* Scroll area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "chats" ? (
          <nav
            data-testid="conversation-list"
            className="px-2 py-1.5 flex flex-col gap-px"
          >
            {convos.length === 0 ? (
              <div
                data-testid="sidebar-chats-empty"
                className="px-4 py-8 text-center font-body text-ui-sub text-dim"
              >
                {chatsEmptyText}
              </div>
            ) : (
              convos.map((item, i) => (
                <ConvoRow
                  key={item.id}
                  item={item}
                  active={item.id === activeConvoId}
                  onClick={() => onOpenConvo(item.id)}
                  index={i}
                />
              ))
            )}
          </nav>
        ) : (
          <>
            {/* Rung 4: pending requests slot above the contacts nav — same position as ContactsScreen */}
            {pendingSlot}
            <nav
              data-testid="sidebar-contacts-list"
              className="px-2 py-1.5 flex flex-col gap-px"
            >
              {contacts.length === 0 ? (
                <div
                  data-testid="sidebar-contacts-empty"
                  className="px-4 py-8 text-center font-body text-ui-sub text-dim"
                >
                  {contactsEmptyText}
                </div>
              ) : (
                contacts.map((item, i) => (
                  <ContactRow
                    key={item.id}
                    item={item}
                    onClick={() => onOpenContact(item.id)}
                    data-testid={`sidebar-contact-row-${i}`}
                  />
                ))
              )}
            </nav>
          </>
        )}
      </div>

      {/* Fab */}
      <Fab
        size={50}
        iconSize={23}
        onClick={onFab}
        aria-label={tab === "chats" ? "new conversation" : "add contact"}
        data-testid="fab"
      />
    </div>
  );
}
