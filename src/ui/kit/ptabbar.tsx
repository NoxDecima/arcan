// src/ui/kit/ptabbar.tsx — port of design/proto-ui.jsx lines 45-61.
// Bottom tab bar: chats + contacts tabs.

import { Icon } from "./icon";
import { tapClass } from "./tap";

export function PTabBar({
  active,
  onTab,
}: {
  active: "chats" | "contacts";
  onTab: (t: "chats" | "contacts") => void;
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
        <Icon d={icon} size={20} className={on ? "text-arcan-accent" : "text-dim"} />
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
