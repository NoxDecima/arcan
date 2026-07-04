// src/ui/screens/chats-screen.tsx — mobile chats home presenter.
// Pure: props in, JSX out. Imports only from ../kit, ./home-types, ./rows.
// Node-for-node port of design/proto.jsx:86–114 (ChatsScreen).
//
// patched copy: design/proto.jsx:86–114 — presence dropped (NOX-31), see manifest.

import { Body, Fab } from "../kit";
import type { HomeProfile, ConvoItem } from "./home-types";
import { ConvoRow } from "./rows";
import { HomeScreenHeader } from "./home-screen-header";
import type { JSX } from "react";

// Rung 4 note: empty state is a simple text div (no EmptyPane) per the Wave A spec.
// Default copy sourced from the legacy sidebar.tsx empty-state title.
const DEFAULT_CHATS_EMPTY = "no conversations yet";

export function ChatsScreen({
  profile,
  convos,
  onOpenConvo,
  onOwnProfile,
  onSettings,
  onNewConvo,
  emptyText = DEFAULT_CHATS_EMPTY,
  testScope,
}: {
  profile: HomeProfile;
  convos: ConvoItem[];
  onOpenConvo: (id: string) => void;
  onOwnProfile: () => void;
  onSettings: () => void;
  onNewConvo: () => void;
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
        {/* Convo list container cluster: px-2 py-1.5 flex flex-col gap-px */}
        <nav
          data-testid={tid("conversation-list")}
          className="px-2 py-1.5 flex flex-col gap-px"
        >
          {convos.length === 0 ? (
            // Rung 4: empty state — simple text div per Wave A spec.
            // Manifest note: full EmptyPane (title + cta) is a Rung 4 polish item.
            <div
              data-testid={tid("sidebar-chats-empty")}
              className="px-4 py-8 text-center font-body text-ui-sub text-dim"
            >
              {emptyText}
            </div>
          ) : (
            convos.map((item, i) => (
              <ConvoRow
                key={item.id}
                item={item}
                onClick={() => onOpenConvo(item.id)}
                testScope={testScope}
                index={i}
              />
            ))
          )}
        </nav>
      </Body>

      {/* Fab keeps the legacy testid ("fab" or scoped) — src/components/fab.tsx default = "fab" */}
      <Fab
        onClick={onNewConvo}
        aria-label="new conversation"
        data-testid={tid("fab")}
      />
    </>
  );
}
