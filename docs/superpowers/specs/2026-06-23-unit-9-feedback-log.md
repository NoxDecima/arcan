# Unit 9 — manual walkthrough feedback log

Captured live during the user's manual visual walkthrough over Tailscale (2026-06-21 → 23),
against `main` post-Unit-8 (`cbe2150`). This is a **raw feedback log**, not a spec — it feeds
the Unit 9 brainstorm. The recurring theme: the Phase A–C screenshot audit validated tokens +
primitives but was structurally blind to vertical centering, logo sizing, roundedness
calibration, interaction flows, and IA decisions. Most items below are **specified in the
design files** (esp. `design/proto.jsx` prototype + `design/hf-*.jsx`) — Unit 8 just didn't
implement them. Reference the **prototype first** per the user.

§3 partially captured via the dev-seed (layout only); real send/receive validation still
deferred until the connection flow works. §6/§7 not yet walked.

---

## Cross-cutting design decisions (apply everywhere)

- **DEC-1 · Roundedness.** Live ships `rounded-r-3` = 6px (sharp). The canonical app skin in
  the design is `v5` (`design/hf-kit.jsx`): `radius: 12`, `soft: true` → buttons fully pill
  (`borderRadius: 999`), avatars round, cards `radius+2`. Pin the canonical radius scale to
  the soft skin. Affects every button, input, card, chip.
- **DEC-2 · Vertical centering.** AuthSurface `tall` mode top-aligns (`align-items:
  flex-start`); login centers but onboarding/recovery/pair top-align. Design centers all auth
  surfaces. Make centering consistent.
- **DEC-3 · QR style (app-wide).** Live QR = qrcode.react default (black-on-white). Design
  (`hf-flows.jsx`) renders QR on `c.panel` bg with `c.text`-colored modules → theme-aware
  (dark mode = dark bg + light dots; light mode = inverse). Make a shared theme-aware QR the
  standard everywhere. Also: larger.
- **DEC-4 · Avatar shape (app-wide).** Live ships fully-round avatars (`rounded-pill`). Design
  v5 skin uses `avatarRadius: 10` → **rounded-rectangle** for conversation/contact/message
  avatars; profile-page avatar = `radius+6` ≈ 18 (still rounded-rect, not a circle). Switch
  the Avatar/ConversationAvatar primitives to rounded-rect. Applies to sidebar rows, chat
  header, message gutter, members, profiles.

---

## §1 · Auth / onboarding / pairing

- **1-A** Buttons + inputs too rectangular → DEC-1.
- **1.1-A** `/auth/login` Wordmark + app name too small; increase notably (hero size).
- **1.2-A** Onboarding welcome: same too-small logo; **top-aligned, should be centered** (DEC-2);
  overall layout + inputs feel off vs design.
- **1.2 + 1.5 unify** Welcome screen and the sign-in-choice screen should be **one screen**.
  (Prototype `WelcomeScreen` = mark + "create account" + "restore from recovery code" + "sign
  in" inline — single surface.)
- **1.3/1.4/1.5-A** Recovery-code display step too compressed — needs breathing room.
- **1.3/1.4/1.5-B** Onboarding pages top-aligned; center them (DEC-2).
- **1.4-A** Display-name step: shows the missing-avatar placeholder but **no way to upload a
  picture there.** Should allow direct image upload at this step → becomes profile picture
  immediately. (Prototype/hf profile step has the camera-overlay affordance.)
- **1.5-A · Remove restore-choice screen.** Restoring an account → back button →
  "restore your account" intermediate screen (`restore-choice-step.tsx`) offering sign-in OR
  recovery-code. Redundant; delete it.
- **1.6/1.7-A** Pairing QR: larger + theme-aware (DEC-3).
- **1.6/1.7-B** Post-connection handshake/approval display doesn't match design: buttons
  should be **stacked** (not side-by-side); the connected-device detail area is inconsistent
  with the design's device-card. See `hf-flows.jsx` responder/approval scenes (lines ~205-245).
- **1.6/1.7-C** Arcan icon on the pairing screens too small → 1.1-A.

---

## §2 · Main screen (sidebar / IA)

Reference: `design/hf-list.jsx` (NavColumn, MobChatsList, MobTabBar) — all design-specified.

- **2-A · Tab icons.** Chats/contacts tabs need icons (chat-bubble + people) next to labels.
  Design: `MobTab` renders `<Icon d="chat">` / `<Icon d="people">`. Missing in live.
- **2-B · Sidebar header chrome.** Remove the Arcan mark to the LEFT of avatar+name (design
  header = avatar + name + **gear icon** only; the Arcan mark lives in the empty-pane
  watermark + auth screens, not list chrome). ADD the gear→settings icon (currently missing).
- **2-C · Add button placement.** The "+" must move OFF the header. Design = **bottom-right
  floating FAB** (`hf-list.jsx:57` + `hf-contacts.jsx:39`: `position:absolute; right:14;
  bottom:14`, pill, accent fill, drop shadow). On mobile it floats above the bottom tab bar.
- **2-D · Remove bottom "settings" link** from the sidebar footer (new design has no footer
  settings link; settings reached via the header gear).
- **2-E · Mobile tabs bottom-only.** Currently tabs render BOTH top (sidebar) and bottom
  (MobileTabBar) on mobile; should be bottom-only.
- **2-F · Persistent desktop sidebar.** Add-contact, settings, and all sub-screens currently
  HIDE the sidebar on desktop. Design (`HiDesktop` = NavColumn + pane, always both) keeps the
  sidebar present on every desktop screen. This is a layout-shell change.
- **2-G · Add-contact screen** mostly good; wants more centered alignment + persistent sidebar
  (2-F).
- **2-H · Invite-accept screen too bare.** The screen a recipient sees when opening an invite
  link needs: more info, the inviter's name + icon shown distinctly/separated, proper
  centering. (Prototype-style dedicated screen.)
- **2-I · Connection-request surfacing (where do pending requests go?).** Per design + earlier
  brainstorm: pending connection requests should surface in the **contacts tab** (a pending
  section). AND per spec: if you're sitting on your own share-QR screen and someone issues a
  request, you should get a **live pop-up** with the request right there. Currently there's no
  visible place a request lands. (NOTE: separate from a possible real delivery bug — the
  request may not even arrive; needs investigation.)
- **2-J · Add-contact share/copy buttons.** Aside from the QR coloring (DEC-3): the
  copy-link + share two-button pair only makes sense on mobile (copy = clipboard, share =
  native share sheet). On desktop there's no share sheet, so the share button is meaningless.
  Resolve to a **single adaptive button**: on mobile it opens the native share sheet (which
  itself offers copy); on desktop it just copies the link. (User leaning this way, not 100%
  settled — confirm in brainstorm.)

---

## §4 · Settings

Reference: prototype `SettingsScreen` (`design/proto.jsx:261`) + `design/hf-settings.jsx`.

- **4-A · Persistent desktop sidebar** on settings (→ 2-F).
- **4-B · Card sectioning + colors inverted.** Categories should be **connected containers per
  category** (a `Card` with `panel` bg + hairline border, rows divided by hairlines, a small
  uppercase section label ABOVE each card). Live has the bg/category colors inverted vs the
  design. Re-derive the whole page against the prototype.
- **4-C · Icons on every row.** Design gives each settings row a leading icon (key, shield,
  message, bell, at, device, plus, logout, moon/sun, sparkle). Add them.
- **4-D · Profile/account section restructure.** First row = **name + avatar + "view your
  profile" subtitle**, the whole row links to the profile page (prototype `MeRow` / `PRow`
  with `right={<HAv>}` → `nav.push('ownprofile')`). Then **change password** + **recovery
  code** rows (icon + chevron). The **safety number** should be a **dropdown/expandable** row
  in this section.
- **4-E · Appearance** mostly good; ADD a **check mark on the selected accent** swatch
  (design: `{on && <Icon d="check" …>}`). Icons (4-C) still wanted.
- **4-F · Feedback = single row → dedicated page.** Collapse the inline feedback form to a
  single card row ("give feedback" / "report a bug or share an idea" + chevron) that
  **navigates to a separate feedback page**. Build that page to match the prototype's
  `FeedbackScreen` exactly (`proto.jsx:479` / `hf-settings.jsx` `FeedbackBody`). Position the
  feedback row **directly below account, above appearance** (matches prototype order:
  account → feedback → appearance → notifications → devices → sign out).
- **4-G · Notifications = toggle sliders.** Replace the current checkbox/button UI with
  **slider toggles** (design `Toggle`/`PToggle`: 36×21 pill, knob slides). Options stay
  (sound on new messages + browser notifications enabled). For the browser-notification
  toggle: **moving the slider triggers the browser permission request**; if denied → slider
  stays OFF; if granted → slider ON. Visual state must mirror actual permission state.
- **4-H · Devices section** restyle to prototype; **"link a device" / "link new device" row
  goes at the BOTTOM** below the device list (prototype: `link a device` is the last row in
  the devices card).
- **4-I · Sign out** = its own card at the very bottom, **danger red** (`danger` flag → red
  text + red logout icon), since the other account actions moved into the account section.
- **4-J** General: re-derive the entire settings surface against the **prototype** (the
  reference). Theme toggle + accent flip already work well — keep behavior, restyle container.

---

## §5 · Modals — ARCHITECTURAL

**Finding:** the design has **no modals.** The prototype (`design/proto.jsx`) is a
screen-stack navigator; every flow Unit 8c turned into a modal is a **full screen / dedicated
route** in the design:

| Unit 8c modal | Prototype equivalent |
|---|---|
| change-password-modal | row → screen push (account section) |
| view-recovery-code-modal | row → screen push |
| group-create-dialog | `NewConvoScreen` (full screen) |
| contact-picker | `AddPeopleScreen` (full screen) |
| (feedback was inline) | `FeedbackScreen` (full screen) |
| link-device | `LinkDeviceScreen` (full screen) |

The only overlay patterns in the design are in `wf-missing.jsx` (wireframe password-gate) and
`design-canvas.jsx` (the design TOOL's own UI). **Unit 8c's ModalShell + MobileBottomSheet
system is contrary to the design's intent.**

**DECIDED (2026-06-23):** convert the modal flows to dedicated **routes/screens** matching the
prototype; keep a **thin overlay layer ONLY for true interrupts** — incoming connection-request
pop-up, image lightbox, trusted-device prompt. Most of Unit 8c's ModalShell goes away.

- **5-A** Modal *content* is fine to carry over. When converting to routes: (a) make styling
  consistent app-wide including the **destructive/red** treatment for destructive actions, and
  (b) add **very subtle brief context/helper text** on these screens, in the same understated
  tone the onboarding screens use.

---

## §3 · Conversation surfaces (layout via dev-seed; prototype is reference)

### 3.1 Sidebar chat rows (`design/proto.jsx` ChatsScreen)
- **3.1-A** Avatars fully round → rounded-rect (DEC-4).
- **3.1-B** No last-message preview shown/styled. Design: second line = last-message text
  (`text2` if unread, `dim` if read), truncated.
- **3.1-C** No last-message timestamp. Design: time top-right of the row (`9.5px dim`).
- **3.1-D** No unread badge. Design: pill badge (accent fill, `onAccent` count) at end of the
  preview line; name + preview go bold/`text2` when unread. (May be partly a seed limitation —
  synthetic msgs aren't "unread" — but the row structure must support it.)

### 3.2 Chat detail — header (`ChatScreen`)
- **3.2-A** Back button shows on desktop too → **mobile-only**. Desktop keeps the persistent
  sidebar so back is unnecessary.
- **3.2-B** Back button too prominent → small single arrow (less in-your-face), per design.
- **3.2-C** Header avatar wrong shape (→ DEC-4) + text not positioned per design.
- **3.2-D** No separate "Members" button. In the prototype the **entire top row** (minus the
  back arrow) is the tap target → opens conversation settings. Remove the standalone Members
  link; make the header row the link.
- **3.2-E** Prototype shows online + verified indicators in the header — **disregard those**
  (we dropped presence/verification per earlier decisions). Don't add them.

### 3.3 Chat detail — message list + composer
- **3.3-A** Whole chat surface not aligned with design: bubble **coloring + accent**, bubble
  **shape**, **timestamp position**. Re-derive against prototype `Bubble`/`ownPaintP`
  (own = accent fill/grad + `onAccent`; other = `panel`; time inline `8.5px`).
- **3.3-B** "new" divider not visible in the seeded version — verify it renders + matches
  design.
- **3.3-C** Composer (text-submission bubble + input) not per design — restyle to prototype.

### 3.4 Conversation settings / members route (`ConvoSettingsScreen`)
- **3.4-A** Not aligned with prototype. Should lead with the **group name + large picture**.
- **3.4-B** Group → picture **editable**; 1:1/contact → picture **not** editable (it's theirs).
- **3.4-C** Editable conversation **name** field (like prototype).
- **3.4-D** Member list **split into admins + members** sections (prototype does this).
- **3.4-E** Per-member **context menu** for actions → align to prototype.
- **3.4-F** **1:1 conversation settings should just redirect to the other user's profile**
  (no standalone settings screen for DMs).
- **3.4-G** In group settings, clicking a member's **name or picture → their profile**.

### 3.5 New-conversation multi-select (`NewConvoScreen`)
- **3.5-A** Functionally fine; visually not as smooth as the prototype — restyle to match.

### 3.6 Profile pages
- **3.6-A** Mostly okay; some minor style-detail gaps (buttons, bubbles not quite in the
  appropriate style).
- **3.6-B** Shared-conversations section shows nothing — **likely a seed artifact** (synthetic
  Bob isn't a real group member); re-verify once the connection flow works.
- **3.6-C** **Hide the co-value (truncated account ID)** — no need to display it on the profile.

---

## §6 / §7 — not yet walked.

---

## Possible real bug (not UI)

- **Connection-request delivery.** When driving the two-sided handshake earlier, Bob's pending
  list never received Alice's request (inbox subscription didn't pick it up). May be why "I
  have no idea where the request shows up" — it might genuinely never arrive. Investigate as
  its own task, separate from the IA work that decides where it *should* surface.
