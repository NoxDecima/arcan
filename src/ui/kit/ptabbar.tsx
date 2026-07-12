// src/ui/kit/ptabbar.tsx — port of design/proto-ui.jsx lines 45-61.
// Bottom tab bar: chats + contacts tabs.

import { Icon } from "./icon";
import { tapClass } from "./tap";
import type { JSX } from "react";

export function PTabBar({
  active,
  onTab,
  contactsBadge,
}: {
  active: "chats" | "contacts";
  onTab: (t: "chats" | "contacts") => void;
  /** intent-fix (feedback round 2): pending-connection-requests count pill
   * on the contacts tab. Default (undefined/0) renders nothing — parity
   * cells omit it. */
  contactsBadge?: number;
}): JSX.Element {
  const tab = (
    key: "chats" | "contacts",
    icon: "chat" | "people",
    label: string,
  ) => {
    const on = active === key;
    return (
      <button
        key={key}
        onClick={() => onTab(key)}
        className={`${tapClass} flex-1 flex-col justify-center gap-[3px] py-[7px]`}
      >
        <span className="relative flex">
          <Icon d={icon} size={20} className={on ? "text-arcan-accent" : "text-dim"} />
          {key === "contacts" && !!contactsBadge && (
            <span
              data-testid="tab-pending-badge"
              className="absolute -top-1 -right-2.5 min-w-[15px] h-[15px] px-1 rounded-pill bg-arcan-accent-fill text-on-accent text-center font-mono font-bold text-ui-tab"
              style={{ lineHeight: "15px" }}
            >
              {contactsBadge > 99 ? "99+" : contactsBadge}
            </span>
          )}
        </span>
        <span
          className={[
            "font-mono text-ui-tab tracking-tab",
            on ? "text-arcan-accent font-semibold" : "text-dim font-medium",
          ].join(" ")}
        >
          {label}
        </span>
      </button>
    );
  };

  return (
    <div className="h-[54px] shrink-0 flex items-stretch border-t border-hairline bg-bg">
      {tab("chats", "chat", "chats")}
      {tab("contacts", "people", "contacts")}
    </div>
  );
}
