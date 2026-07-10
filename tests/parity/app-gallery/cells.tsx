import type { ReactNode } from "react";
import { Icon, HAv, PButton, PCard, PSectionLabel, PRow, PField, PToggle, PQR, PHeader, PTabBar, tapClass, Bubble, MessageRow, Fab, KitToast, ArcanMark, AuthShell, DesktopEmpty, DesktopWindow, MobileShell, Body, type IconName } from "@/ui/kit";
import { Lattice } from "@/components/lattice";
import { PassphraseGrid } from "@/components/passphrase-grid";
import {
  ChatsScreen, ContactsScreen, NavColumn, ChatScreen, ChatComposer,
  ProfileScreen, OwnProfileScreen, type ConvoItem, type ContactItem,
  SettingsScreen, FeedbackScreen, LinkDeviceScreen, type ThemeName,
  ConvoSettingsScreen, NewConvoScreen, AddPeopleScreen, AddContactScreen,
  WelcomeScreen, SignInScreen,
  CredentialsScreen, BackupDisplayScreen, BackupConfirmScreen, ProfileSetupScreen,
  RestoreScreen, ContactRequestScreen,
  ApproveDeviceScreen,
} from "@/ui/screens";
import {
  HF_CONVOS, HF_CONTACTS, HF_CHAT_ITEMS, PROFILE_FIXTURE, OWN_PROFILE_FIXTURE,
  SETTINGS_ACCOUNT_FIXTURE, ACCENT_KEYS_FIXTURE, ACCENT_SOLID,
  SETTINGS_NOTIF_FIXTURE, SETTINGS_DEVICES_FIXTURE,
  CONVO_MEMBERS_ADMINS, CONVO_MEMBERS_WRITERS,
  ADD_PEOPLE_POOL, ADD_CONTACT_TTL_OPTIONS,
  CONTACT_REQUEST_FIXTURE,
  APPROVE_DEVICE_FIXTURE,
} from "./fixtures";

const ICON_NAMES: IconName[] = [
  "search", "plus", "gear", "back", "chev", "send", "plusc", "image",
  "paperclip", "chat", "people", "pencil", "copy", "share", "camera",
  "check", "dots", "bell", "at", "device", "key", "shield", "logout",
  "sun", "moon", "sparkle", "alert", "refresh", "close", "message",
];

const R_WORDS = ['amber', 'cobalt', 'drift', 'ember', 'fjord', 'glyph', 'harbor', 'ionize', 'jasper', 'kelvin', 'lumen', 'mosaic', 'nimbus', 'onyx', 'prism', 'quartz', 'ripple', 'summit', 'tundra', 'umbra', 'vellum', 'willow', 'xenon', 'zephyr'] as const;

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
      />
    </div>
  ),

  // proto.jsx:261–317 (SettingsScreen) — patched: toast/nav stubbed; theme/accent from
  // data-theme/data-accent DOM attrs (set per-run by the parity harness).
  "settings-screen": () => {
    const theme = (document.documentElement.getAttribute("data-theme") ?? "dark") as ThemeName;
    const accent = document.documentElement.getAttribute("data-accent") ?? "tokyo";
    return (
      <div className="flex flex-col h-full">
        <SettingsScreen
          account={SETTINGS_ACCOUNT_FIXTURE}
          theme={theme}
          accent={accent}
          accentKeys={ACCENT_KEYS_FIXTURE}
          accentSolid={ACCENT_SOLID}
          notifications={SETTINGS_NOTIF_FIXTURE}
          devices={SETTINGS_DEVICES_FIXTURE}
          onOpenProfile={() => {}}
          onChangePassword={() => {}}
          onRecoveryCode={() => {}}
          onFeedback={() => {}}
          onTheme={() => {}}
          onAccent={() => {}}
          onLinkDevice={() => {}}
          onSignOut={() => {}}
          onBack={() => {}}
        />
      </div>
    );
  },

  // proto.jsx:487–531 (FeedbackScreen) — empty state (message='', cat=null).
  // attachmentSlot = proto-matching static dropzone fixture (not attached).
  "feedback-screen": () => (
    <div className="flex flex-col h-full">
      <FeedbackScreen
        onBack={() => {}}
        message=""
        onMessage={() => {}}
        category={null}
        categories={[
          ["bug", "bug"],
          ["idea", "idea"],
          ["question", "question"],
          ["praise", "praise"],
        ]}
        onCategory={() => {}}
        attachmentSlot={
          /* proto-matching dropzone element (pure fixture; not-attached state) */
          <button
            type="button"
            className={`${tapClass} flex w-full justify-center gap-2 p-3 rounded-r-4 border border-dashed border-hairline bg-transparent`}
          >
            <Icon d="paperclip" size={15} className="text-text-2" />
            <span className="font-body font-medium text-ui-empty-sub text-text-2">
              add a screenshot
            </span>
          </button>
        }
        canSubmit={false}
        submitting={false}
        onSubmit={() => {}}
      />
    </div>
  ),

  // proto.jsx:462–475 (LinkDeviceScreen) — qrSlot=<PQR size={150}> (real QR is Rung-4).
  // Waiting-pulse animation is frozen by gallery's animation:none!important.
  // USER DECISION 2026-07-06 (walkthrough): onBack omitted — no top back arrow in auth flow.
  // Proto copy patched to match (PHeader back arrow removed in proto-cells.jsx).
  "link-device-screen": () => (
    <div className="flex flex-col h-full">
      <LinkDeviceScreen
        linkUrl="arcan.app/link#k2f…a81"
        onCopy={() => {}}
        qrSlot={<PQR size={150} />}
      />
    </div>
  ),

  // proto.jsx:331–353 (ConvoSettingsScreen) — MEMBERS fixture (proto-local) defined in fixtures.ts.
  // renderMemberEnd omitted (Rung-4 kebab; dropped in BOTH sides for parity match).
  // accents exercise admin role badge (accent-soft).
  "convo-settings-screen": () => (
    <div className="flex flex-col h-full">
      <ConvoSettingsScreen
        onBack={() => {}}
        title="retrieval-squad"
        initials="RS"
        sub="5 members · created 2026-04-18"
        admins={CONVO_MEMBERS_ADMINS}
        writers={CONVO_MEMBERS_WRITERS}
        iAmAdmin={true}
        onAddPeople={() => {}}
        onLeave={() => {}}
      />
    </div>
  ),

  // proto.jsx:368–394 (NewConvoScreen) — HF_CONTACTS contacts; sel={ct1,ct4} (AK+RA → isGroup=true).
  // groupNameSlot = proto-matching static placeholder pill.
  // accents exercise selected accent-soft pick rows.
  "new-convo-screen": () => (
    <div className="flex flex-col h-full">
      <NewConvoScreen
        onBack={() => {}}
        contacts={HF_CONTACTS}
        selected={new Set(["ct1", "ct4"])}
        onToggle={() => {}}
        groupNameSlot={
          /* proto-matching static placeholder pill — proto:373 */
          <div className="flex-1 h-9 rounded-r-4 border border-hairline bg-panel flex items-center px-3">
            <span className="font-body text-ui-toast leading-none text-dim">
              group name (optional)
            </span>
          </div>
        }
        submitLabel="create group · 2 members"
        submitDisabled={false}
        onSubmit={() => {}}
      />
    </div>
  ),

  // proto.jsx:439–455 (AddPeopleScreen) — pool fixture (proto-local) defined in fixtures.ts.
  // sel={ap0,ap1} → EL+NX selected (indices 0,1); groupName="retrieval-squad".
  // accents exercise selected accent-soft pick rows.
  "add-people-screen": () => (
    <div className="flex flex-col h-full">
      <AddPeopleScreen
        onBack={() => {}}
        groupName="retrieval-squad"
        pool={ADD_PEOPLE_POOL}
        selected={new Set(["ap0", "ap1"])}
        onToggle={() => {}}
        onAdd={() => {}}
        addDisabled={false}
      />
    </div>
  ),

  // proto.jsx:401–429 (AddContactScreen) — patched: one adaptive button (9-7 §2-J);
  // ttlOptions = app presets (1h/24h/7d); ttl="24h"; qrSlot=<PQR size={128}>.
  // hiddenUrlSlot omitted (sr-only, no pixels).
  "add-contact-screen": () => (
    <div className="flex flex-col h-full">
      <AddContactScreen
        onBack={() => {}}
        idShort="co_z1a8…4f2"
        qrSlot={<PQR size={128} />}
        ttl="24h"
        ttlOptions={[...ADD_CONTACT_TTL_OPTIONS]}
        onTtl={() => {}}
        primaryLabel="copy link"
        onPrimary={() => {}}
        onScan={() => {}}
        onPaste={() => {}}
      />
    </div>
  ),

  // proto.jsx:537–548 (WelcomeScreen) — Rung 1 presenter; no-op handlers.
  // accents exercise the accent star + primary button fill.
  "welcome-screen": () => (
    <div className="flex flex-col h-full">
      <WelcomeScreen
        onCreateAccount={() => {}}
        onRestore={() => {}}
        onSignIn={() => {}}
        createTestId="create-account-btn"
        restoreTestId="restore-account-btn"
        signInTestId="signin-existing-btn"
      />
    </div>
  ),

  // proto.jsx:550–565 (SignInScreen) — Rung 1 presenter.
  // USER DECISION 2026-07-06 (walkthrough): onBack omitted — no top back arrow in auth flow.
  // Proto copy patched to match (PHeader back arrow removed in proto-cells.jsx).
  // empty email/password, submitting=false, errorSlot omitted.
  "sign-in-screen": () => (
    <div className="flex flex-col h-full">
      <SignInScreen
        email=""
        onEmail={() => {}}
        password=""
        onPassword={() => {}}
        onSubmit={() => {}}
        submitting={false}
        onForgot={() => {}}
        onCreate={() => {}}
        emailTestId="login-email"
        passwordTestId="login-password"
        submitTestId="login-submit"
      />
    </div>
  ),

  // hf-flows.jsx:92–105 (ScCredentials) — Rung 2 presenter; no onBack (parity single-button).
  // accents exercise accent star + primary button fill.
  "credentials-screen": () => (
    <div className="flex flex-col h-full">
      <CredentialsScreen
        email=""
        onEmail={() => {}}
        password=""
        onPassword={() => {}}
        confirm=""
        onConfirm={() => {}}
        onContinue={() => {}}
        formTestId="credentials-form"
        emailTestId="credentials-email"
        passwordTestId="credentials-password"
        confirmTestId="credentials-confirm"
        continueTestId="credentials-continue"
      />
    </div>
  ),

  // hf-flows.jsx:106–126 (ScRecovery = backup-display) — Rung 2 presenter.
  // gridSlot = real PassphraseGrid with R_WORDS; no ackSlot/onBack (hf-faithful parity).
  "backup-display-screen": () => (
    <div className="flex flex-col h-full">
      <BackupDisplayScreen
        gridSlot={
          <PassphraseGrid phrase={R_WORDS.join(" ")} compact withCopyButton />
        }
        onContinue={() => {}}
        continueDisabled={false}
        continueTestId="passphrase-display-continue"
      />
    </div>
  ),

  // hf-flows.jsx:127–140 (ScConfirm = backup-confirm) — Rung 2 presenter.
  // 2 WordChallengeFields (hf fixture: word #07 + #19); sub = hf sub string.
  // Deviation: live app uses 3 fields; parity uses 2 (hf-faithful).
  "backup-confirm-screen": () => (
    <div className="flex flex-col h-full">
      <BackupConfirmScreen
        sub="enter two words to prove you saved it"
        fields={[
          { label: "word #07", value: "", onChange: () => {}, placeholder: "type word 7", testId: "confirm-word-0" },
          { label: "word #19", value: "", onChange: () => {}, placeholder: "type word 19", testId: "confirm-word-1" },
        ]}
        onContinue={() => {}}
        continueTestId="confirm-passphrase-btn"
      />
    </div>
  ),

  // hf-flows.jsx:141–159 (ScProfile = profile-setup) — Rung 2 presenter.
  // avatarPreview=null → "?" placeholder. accents exercise accent avatar tint + primary.
  "profile-setup-screen": () => (
    <div className="flex flex-col h-full">
      <ProfileSetupScreen
        avatarPreview={null}
        onPickAvatar={() => {}}
        displayName=""
        onDisplayName={() => {}}
        onFinish={() => {}}
        submitting={false}
        nameTestId="display-name-input"
        finishTestId="finish-onboarding-btn"
        avatarChangeTestId="onboarding-avatar-change"
        avatarPreviewTestId="onboarding-avatar-preview"
      />
    </div>
  ),

  // hf-flows.jsx:160–180 (ScRestore) — Rung 2 advisory: app keeps textarea IA.
  // Structural divergence: proto shows 24-slot per-word grid; app uses a single textarea.
  // Advisory cell — renders side-by-side for visual review; never fails the run.
  "restore-screen": () => (
    <div className="flex flex-col h-full">
      <RestoreScreen
        code=""
        onCode={() => {}}
        onRestore={() => {}}
        restoring={false}
        codeTestId="restore-passphrase-input"
        restoreTestId="restore-btn"
      />
    </div>
  ),

  // hf-flows.jsx:229–257 (ScContactRequest) — Rung 2 presenter; /invite confirm phase.
  // securityOpen=false (collapsed); avatarSlot/sharedSlot/safetySlot omitted (Rung-4).
  // accents exercise accent avatar tint + primary button fill.
  // USER DECISION: id line dropped (no raw ids in UI; Wave-C pattern); proto copy patched.
  "contact-request-screen": () => (
    <div className="flex flex-col h-full">
      <ContactRequestScreen
        vm={CONTACT_REQUEST_FIXTURE}
        securityOpen={false}
        onToggleSecurity={() => {}}
        onAccept={() => {}}
        onDecline={() => {}}
        rootTestId="invite-confirm"
        nameTestId="invite-inviter-name"
        avatarTestId="invite-inviter-avatar"
        acceptTestId="invite-accept-btn"
        declineTestId="invite-decline-btn"
      />
    </div>
  ),

  // hf-flows.jsx:209–228 (ScApproveDevice) — Rung 2 presenter; initiator awaiting-approval phase.
  // vm feeds hf fixture rows (device/location/time) to match proto; live app uses
  // device/first-seen/fingerprint (no geo — documented divergence). approving=false (idle state).
  // accents exercise accent-soft device tile + primary button.
  "approve-device-screen": () => (
    <div className="flex flex-col h-full">
      <ApproveDeviceScreen
        vm={APPROVE_DEVICE_FIXTURE}
        onApprove={() => {}}
        onDeny={() => {}}
        approving={false}
        promptTestId="pair-approval-prompt"
        cardTestId="device-approval-card"
        approveTestId="approve-device"
        denyTestId="deny-device"
      />
    </div>
  ),
};
