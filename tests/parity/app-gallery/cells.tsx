import type { ReactNode } from "react";
import { Icon, HAv, PButton, PCard, PSectionLabel, PRow, PField, PToggle, PQR, PHeader, PTabBar, tapClass, Bubble, MessageRow, Fab, KitToast, ArcanMark, AuthShell, DesktopEmpty, DesktopWindow, MobileShell, Body, type IconName } from "@/ui/kit";
import { Lattice } from "@/components/lattice";
import { ChatsScreen, ContactsScreen, NavColumn, ChatScreen, ChatComposer, ProfileScreen, OwnProfileScreen, type ConvoItem, type ContactItem } from "@/ui/screens";
import { HF_CONVOS, HF_CONTACTS, HF_CHAT_ITEMS, PROFILE_FIXTURE, OWN_PROFILE_FIXTURE } from "./fixtures";

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

  // hf-kit.jsx:195–241 (ArcanMark)
  "arcanmark-tiers": () => (
    <div className="flex items-center gap-6">
      <ArcanMark size={58} stacked />
      <ArcanMark size={24} showWord />
      <span className="text-text"><ArcanMark size={12} showWord={false} mono /></span>
    </div>
  ),

  "arcanmark-accents": () => <ArcanMark size={24} showWord />,

  // advisory: existing Lattice vs proto ArcanMark glyph
  "lattice-verdict": () => <Lattice size={58} />,

  // proto.jsx:567–579 (AuthShell)
  "auth-shell": () => (
    <div className="flex flex-col h-full">
      <AuthShell>
        <PField label="email" ph="you@domain.dev" />
        <PButton primary full label="sign in" />
      </AuthShell>
    </div>
  ),

  // proto.jsx:658–673 (DesktopEmpty)
  "desktop-empty": () => (
    <div className="flex flex-col h-full">
      <DesktopEmpty tab="chats" />
    </div>
  ),

  // proto.jsx:676–691 (DesktopWindow, narrow with DesktopEmpty child)
  "desktop-window": () => (
    <DesktopWindow narrow>
      <DesktopEmpty tab="chats" />
    </DesktopWindow>
  ),

  // mobile-shell: MobileShell with Body + PTabBar + KitToast
  "mobile-shell": () => (
    <div className="flex flex-col h-full">
      <MobileShell
        tabBar={<PTabBar active="chats" onTab={() => {}} />}
        toast={<KitToast tone="neutral" icon="bell" text="saved" />}
      >
        <Body pad={16}>
          <PCard>
            <PRow icon="key" label="recovery code" sub="view or rotate" onClick={() => {}} last />
          </PCard>
        </Body>
      </MobileShell>
    </div>
  ),

  // proto.jsx:86–114 (ChatsScreen) — patched: presence dropped (NOX-31)
  "chats-screen": () => (
    <div className="flex flex-col h-full">
      <ChatsScreen
        profile={{ name: "decima", initials: "me" }}
        convos={HF_CONVOS}
        onOpenConvo={() => {}}
        onOwnProfile={() => {}}
        onSettings={() => {}}
        onNewConvo={() => {}}
      />
    </div>
  ),

  // proto.jsx:116–143 (ContactsScreen + ContactRow) — patched: presence dropped (NOX-31)
  "contacts-screen": () => (
    <div className="flex flex-col h-full">
      <ContactsScreen
        profile={{ name: "decima", initials: "me" }}
        contacts={HF_CONTACTS}
        onOpenContact={() => {}}
        onOwnProfile={() => {}}
        onSettings={() => {}}
        onAddContact={() => {}}
      />
    </div>
  ),

  // proto.jsx:731–780 (DesktopApp left column) — patched: presence dropped (NOX-31)
  "nav-column": () => (
    <NavColumn
      profile={{ name: "decima", initials: "me" }}
      tab="chats"
      onTab={() => {}}
      convos={HF_CONVOS}
      contacts={HF_CONTACTS}
      activeConvoId="c1"
      onOpenConvo={() => {}}
      onOpenContact={() => {}}
      onOwnProfile={() => {}}
      onSettings={() => {}}
      onFab={() => {}}
    />
  ),

  "nav-column-contacts": () => (
    <NavColumn
      profile={{ name: "decima", initials: "me" }}
      tab="contacts"
      onTab={() => {}}
      convos={HF_CONVOS}
      contacts={HF_CONTACTS}
      onOpenConvo={() => {}}
      onOpenContact={() => {}}
      onOwnProfile={() => {}}
      onSettings={() => {}}
      onFab={() => {}}
    />
  ),

  // proto.jsx:154–203 (ChatScreen) — patched: typing + presence/verified dropped (NOX-31/33)
  // Seed: SEED['ada · keyring'] === HF_MSGS; proto renders day-marker + msgs.map(Row).
  "chat-screen": () => (
    <div className="flex flex-col h-full">
      <ChatScreen
        header={{ title: "@ada · keyring", initials: "AK" }}
        items={HF_CHAT_ITEMS}
        bubbleWidth={190}
        onBack={() => {}}
        onOpenInfo={() => {}}
        composer={
          <ChatComposer
            value=""
            onChange={() => {}}
            onSend={() => {}}
            placeholder="message ada"
          />
        }
      />
    </div>
  ),

  // proto.jsx:154–203 (ChatScreen desktop) — same seed, w=460, no back button.
  "chat-screen-desktop": () => (
    <div className="flex flex-col h-full">
      <ChatScreen
        header={{ title: "@ada · keyring", initials: "AK" }}
        items={HF_CHAT_ITEMS}
        bubbleWidth={460}
        onOpenInfo={() => {}}
        composer={
          <ChatComposer
            value=""
            onChange={() => {}}
            onSend={() => {}}
            placeholder="message ada"
          />
        }
      />
    </div>
  ),

  // proto.jsx:189–200 (ChatScreen composer bar) — two bars: empty + "on it" armed.
  "chat-composer-states": () => (
    <div className="flex flex-col bg-bg">
      <ChatComposer
        value=""
        onChange={() => {}}
        onSend={() => {}}
        placeholder="message ada"
      />
      <ChatComposer
        value="on it"
        onChange={() => {}}
        onSend={() => {}}
        placeholder="message ada"
      />
    </div>
  ),

  // proto.jsx:205–236 (ProfileScreen) — patched: '@' dropped, safety collapsed, shared=soon.
  "profile-screen": () => (
    <div className="flex flex-col h-full">
      <ProfileScreen
        vm={PROFILE_FIXTURE}
        onBack={() => {}}
        onMenu={() => {}}
        onMessage={() => {}}
        safetyOpen={false}
        onToggleSafety={() => {}}
      />
    </div>
  ),

  // proto.jsx:238–259 (OwnProfileScreen) — patched: '@' dropped, no inline edit, no extra sections.
  "own-profile-screen": () => (
    <div className="flex flex-col h-full">
      <OwnProfileScreen
        vm={OWN_PROFILE_FIXTURE}
        onBack={() => {}}
        onEditName={() => {}}
        onEditAvatar={() => {}}
        onAddContact={() => {}}
        onSettings={() => {}}
      />
    </div>
  ),
};
