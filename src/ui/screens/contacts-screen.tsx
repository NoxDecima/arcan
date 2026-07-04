// src/ui/screens/contacts-screen.tsx — mobile contacts home presenter.
// Pure: props in, JSX out. Imports only from ../kit, ./home-types, ./rows, react.
// Node-for-node port of design/proto.jsx:116–132 (ContactsScreen).
//
// patched copy: design/proto.jsx:116–143 — presence dropped (NOX-31), see manifest.
//
// Header is assembled from kit primitives (tapClass, HAv, Icon) rather than PHeader
// to allow testids — the visual output is identical to PHeader's onAvatar layout.
//
// pendingSlot (Rung 4): rendered between the header and the contacts list when provided.
// No proto reference — kept out of the parity fixture (Rung 4 only).

import type { ReactNode } from "react";
import { HAv, Body, Fab, Icon, tapClass } from "../kit";
import type { HomeProfile, ContactItem } from "./home-types";
import { ContactRow } from "./rows";

// Default copy sourced from the legacy sidebar.tsx contacts empty-state title.
const DEFAULT_CONTACTS_EMPTY = "no contacts yet";

export function ContactsScreen({
  profile,
  contacts,
  onOpenContact,
  onOwnProfile,
  onSettings,
  onAddContact,
  pendingSlot,
  emptyText = DEFAULT_CONTACTS_EMPTY,
  testScope,
}: {
  profile: HomeProfile;
  contacts: ContactItem[];
  onOpenContact: (id: string) => void;
  onOwnProfile: () => void;
  onSettings: () => void;
  onAddContact: () => void;
  pendingSlot?: ReactNode;
  emptyText?: string;
  testScope?: string;
}): JSX.Element {
  const tid = (name: string) =>
    testScope ? `${testScope}-${name}` : name;

  return (
    <>
      {/* Header — mirrors PHeader's onAvatar layout for visual parity */}
      <div className="min-h-[52px] shrink-0 flex items-center gap-[11px] px-3 border-b border-hairline bg-bg">
        <button
          type="button"
          data-testid={tid("sidebar-header-profile")}
          aria-label="your profile"
          onClick={onOwnProfile}
          className={tapClass}
        >
          <div data-testid={tid("sidebar-avatar")}>
            <HAv txt={profile.initials} src={profile.avatarSrc} size={30} />
          </div>
        </button>
        <div
          data-testid={tid("sidebar-display-name")}
          className="flex-1 min-w-0 font-mono font-bold text-ui-title tracking-title truncate text-text"
        >
          {profile.name}
        </div>
        <button
          type="button"
          data-testid={tid("sidebar-settings-gear")}
          aria-label="settings"
          onClick={onSettings}
          className={tapClass}
        >
          <Icon d="gear" size={20} className="text-text-2" />
        </button>
      </div>

      <Body>
        {/* Rung 4: pending requests slot (container passes PendingRequestsSection here) */}
        {pendingSlot}

        {/* Contact list container cluster: px-2 py-1.5 flex flex-col gap-px */}
        <nav
          data-testid={tid("sidebar-contacts-list")}
          className="px-2 py-1.5 flex flex-col gap-px"
        >
          {contacts.length === 0 ? (
            // Rung 4: empty state — simple text div per Wave A spec.
            // Manifest note: full EmptyPane (title + cta) is a Rung 4 polish item.
            <div
              data-testid={tid("sidebar-contacts-empty")}
              className="px-4 py-8 text-center font-body text-ui-sub text-dim"
            >
              {emptyText}
            </div>
          ) : (
            contacts.map((item, i) => (
              <ContactRow
                key={item.id}
                item={item}
                onClick={() => onOpenContact(item.id)}
                data-testid={tid(`contact-row-${i}`)}
              />
            ))
          )}
        </nav>
      </Body>

      {/* Fab keeps the legacy testid ("fab" or scoped) — src/components/fab.tsx default = "fab" */}
      <Fab
        onClick={onAddContact}
        aria-label="add contact"
        data-testid={tid("fab")}
      />
    </>
  );
}
