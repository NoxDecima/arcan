// src/ui/screens/home-screen-header.tsx — shared header for ChatsScreen + ContactsScreen.
// Module-private to screens/; intentionally NOT re-exported from ./index.ts.
//
// Why this exists instead of PHeader:
//   PHeader doesn't expose testids on its internal avatar div or display-name element.
//   ChatsScreen and ContactsScreen need `data-testid` on sidebar-avatar,
//   sidebar-header-profile, sidebar-display-name, and sidebar-settings-gear so that
//   Playwright selectors (and parity fixtures) can target those exact nodes.
//   The visual output is byte-identical to PHeader's onAvatar layout — same classes,
//   same HAv size={30} + src, same aria-labels — but the internal node shape is ours
//   to control.

import { HAv, Icon, tapClass } from "../kit";
import type { HomeProfile } from "./home-types";
import type { JSX } from "react";

// Header mirrors PHeader's onAvatar layout for visual parity.
export function HomeScreenHeader({
  profile,
  onOwnProfile,
  onSettings,
  testScope,
}: {
  profile: HomeProfile;
  onOwnProfile: () => void;
  onSettings: () => void;
  testScope?: string;
}): JSX.Element {
  const tid = (name: string) =>
    testScope ? `${testScope}-${name}` : name;

  return (
    <div className="min-h-[52px] shrink-0 flex items-center gap-[11px] px-3 border-b border-hairline bg-chrome">
      <button
        type="button"
        data-testid={tid("sidebar-header-profile")}
        aria-label="your profile"
        onClick={onOwnProfile}
        className={`${tapClass} rounded-r-3 hover:bg-panel-2 active:bg-hairline`}
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
        className={`${tapClass} group w-8 h-8 justify-center rounded-r-3 hover:bg-panel-2 active:bg-hairline`}
      >
        <Icon d="gear" size={20} className="text-text-2 group-hover:text-text group-active:text-text transition-colors duration-fast ease-out" />
      </button>
    </div>
  );
}
