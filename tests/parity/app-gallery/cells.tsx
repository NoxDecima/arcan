import type { ReactNode } from "react";
import { Icon, HAv, type IconName } from "@/ui/kit";

const ICON_NAMES: IconName[] = [
  "search", "plus", "gear", "back", "chev", "send", "plusc", "image",
  "paperclip", "chat", "people", "pencil", "copy", "share", "camera",
  "check", "dots", "bell", "at", "device", "key", "shield", "logout",
  "sun", "moon", "sparkle", "alert", "refresh", "close", "message",
];

export const APP_CELLS: Record<string, () => ReactNode> = {
  "probe-swatch": () => (
    <div className="w-[200px] h-[64px] rounded-r-4 border border-hairline bg-panel flex items-center justify-center">
      <span className="font-mono font-medium text-ui-row text-text">probe {"//"} arcan</span>
    </div>
  ),

  // hf-kit.jsx lines 115–146
  "icon-grid": () => (
    <div className="flex flex-wrap gap-2">
      {ICON_NAMES.map((n) => (
        <Icon key={n} d={n} className="text-text-2" size={18} />
      ))}
    </div>
  ),

  "icon-modes": () => (
    <div className="flex items-center gap-3">
      <Icon d="send" className="text-text-2" size={16} fill />
      <Icon d="chev" className="text-dim" size={15} />
      <Icon d="gear" className="text-text-2" size={20} />
      <div className="w-[52px] h-[52px] rounded-pill bg-arcan-accent-fill flex items-center justify-center">
        <Icon d="plus" className="text-on-accent" size={24} sw={2.2} />
      </div>
    </div>
  ),

  // hf-kit.jsx lines 103–114
  "hav-sizes": () => (
    <div className="flex items-center gap-2">
      <HAv txt="AB" size={28} />
      <HAv txt="AB" size={34} />
      <HAv txt="AB" size={38} />
    </div>
  ),

  "hav-group": () => (
    <div className="flex items-center gap-2">
      <HAv txt="AB" size={34} group />
      <HAv txt="AB" size={38} group />
    </div>
  ),

  "hav-status": () => (
    <div className="flex items-center gap-2">
      <HAv txt="AB" size={38} status="online" ring="var(--color-bg)" />
      <HAv txt="AB" size={38} status="offline" ring="var(--color-bg)" />
    </div>
  ),
};
