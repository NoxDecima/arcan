// src/ui/screens/chats-screen.tsx — mobile chats home presenter.
// Pure: props in, JSX out. Imports only from ../kit, ./home-types, ./rows.
// Node-for-node port of design/proto.jsx:86–114 (ChatsScreen).
//
// patched copy: design/proto.jsx:86–114 — presence dropped (NOX-31), see manifest.
//
// Header is assembled from kit primitives (tapClass, HAv, Icon) rather than PHeader
// to allow testids on the profile button and display-name element — the visual output
// is identical to PHeader's onAvatar layout.

import { HAv, Body, Fab, Icon, tapClass } from "../kit";
import type { HomeProfile, ConvoItem } from "./home-types";
import { ConvoRow } from "./rows";

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
