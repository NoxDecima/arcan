import type { ReactNode } from "react";
import { Icon, HAv, PButton, PCard, PSectionLabel, PRow, PField, PToggle, PQR, PHeader, PTabBar, tapClass, Bubble, MessageRow, Fab, KitToast, type IconName } from "@/ui/kit";

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

  // proto-ui.jsx lines 87–99
  "pbutton-variants": () => (
    <div className="flex flex-col gap-2.5">
      <PButton label="connect" primary />
      <PButton label="cancel" />
      <PButton label="sign out" danger />
      <PButton label="skip" ghost />
    </div>
  ),

  "pbutton-full": () => (
    <div className="flex flex-col gap-2.5">
      <PButton label="sign in" primary full />
      <PButton label="send message" primary full icon="send" />
    </div>
  ),

  // proto-ui.jsx lines 63–86
  "pcard-rows": () => (
    <div>
      <PSectionLabel>security</PSectionLabel>
      <PCard>
        <PRow icon="key" label="recovery code" sub="view or rotate" onClick={() => {}} />
        <PRow label="link valid for" value="24h" />
        <PRow icon="shield" label="verified devices" onClick={() => {}} />
        <PRow icon="logout" label="sign out" danger last />
      </PCard>
    </div>
  ),

  // proto-ui.jsx lines 108–118
  "pfield": () => (
    <div className="flex flex-col gap-3">
      <PField label="email" ph="you@domain.dev" />
      <PField label="display name" value="ada" />
      <PField label="recovery code" value="A1B2-C3D4-E5F6" mono />
    </div>
  ),

  // proto-ui.jsx lines 100–107
  "ptoggle": () => (
    <div className="flex gap-3">
      <PToggle on={true} />
      <PToggle on={false} />
    </div>
  ),

  // proto-ui.jsx lines 121–130
  "pqr": () => <PQR size={128} />,

  // proto-ui.jsx lines 17-41 (PHeader) + 45-61 (PTabBar)
  "pheader-plain": () => (
    <PHeader
      title="decima"
      avatar={<HAv txt="me" size={30} />}
      onAvatar={() => {}}
      right={
        <button className={tapClass} onClick={() => {}}>
          <Icon d="gear" size={20} className="text-text-2" />
        </button>
      }
    />
  ),

  "pheader-back": () => (
    <PHeader
      onBack={() => {}}
      title="settings"
      sub={<span className="text-ui-sub text-dim">manage your account</span>}
    />
  ),

  "pheader-ontitle": () => (
    <PHeader
      avatar={<HAv txt="AK" size={30} />}
      title="ada · keyring"
      onTitle={() => {}}
      right={
        <button className={tapClass} onClick={() => {}}>
          <Icon d="dots" size={20} className="text-text-2" />
        </button>
      }
    />
  ),

  "ptabbar": () => <PTabBar active="chats" onTab={() => {}} />,

  "ptabbar-contacts": () => <PTabBar active="contacts" onTab={() => {}} />,

  // proto.jsx:33–71 (Bubble + MessageRow)
  "bubble-own": () => (
    <MessageRow m={{ who: "me", text: "nice. shipping it tonight.", time: "9:22" }} w={220} />
  ),

  "bubble-theirs": () => (
    <MessageRow m={{ who: "them", name: "ada", ini: "AK", text: "schema diff looks good — merging now", time: "9:18" }} w={220} />
  ),

  "bubble-att": () => (
    <MessageRow m={{ who: "me", att: true, text: "sow-042.png", time: "9:22" }} w={220} />
  ),

  // sys/new need flex-col wrapper so self-center resolves correctly
  "bubble-sys": () => (
    <div className="flex flex-col">
      <MessageRow m={{ who: "sys", text: "conversation created · end-to-end encrypted" }} w={300} />
    </div>
  ),

  "bubble-new": () => (
    <div className="flex flex-col">
      <MessageRow m={{ who: "new" }} w={300} />
    </div>
  ),

  // proto.jsx:145–152 (Fab)
  "fab": () => <Fab aria-label="add" />,

  // proto.jsx:590–600 (Toast)
  "toast-tones": () => (
    <div className="flex flex-col">
      <div className="relative h-[64px]"><KitToast tone="neutral" icon="bell" text="saved" /></div>
      <div className="relative h-[64px]"><KitToast tone="success" icon="check" text="invite link copied" /></div>
      <div className="relative h-[64px]"><KitToast tone="error" icon="alert" text="couldn't load invite" /></div>
      <div className="relative h-[64px]"><KitToast tone="accent" icon="copy" text="code copied" /></div>
    </div>
  ),
};
