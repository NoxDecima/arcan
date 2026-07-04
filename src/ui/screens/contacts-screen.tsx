// src/ui/screens/contacts-screen.tsx — mobile contacts home presenter.
// Pure: props in, JSX out. Imports only from ../kit, ./home-types, ./rows, react.
// Node-for-node port of design/proto.jsx:116–132 (ContactsScreen).
//
// patched copy: design/proto.jsx:116–143 — presence dropped (NOX-31), see manifest.
//
// pendingSlot (Rung 4): rendered between the header and the contacts list when provided.
// No proto reference — kept out of the parity fixture (Rung 4 only).

import type { ReactNode } from "react";
import { Body, Fab } from "../kit";
import type { HomeProfile, ContactItem } from "./home-types";
import { ContactRow } from "./rows";
import { HomeScreenHeader } from "./home-screen-header";

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
      <HomeScreenHeader
        profile={profile}
        onOwnProfile={onOwnProfile}
        onSettings={onSettings}
        testScope={testScope}
      />

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
                data-testid={tid(`sidebar-contact-row-${i}`)}
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
