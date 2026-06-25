# Unit 9 — IA & interaction-fidelity pass — Design Spec

**Goal.** Bring the implemented app into structural + interaction fidelity with the design —
specifically the **prototype** (`design/proto.jsx`), which is the canonical reference where it
differs from the hi-fi stills. Unit 8 aligned tokens + primitives + per-screen styling; Unit 9
fixes what a static screenshot audit couldn't catch: navigation model, layout shell, IA
decisions, interaction flows, and aesthetic calibration.

**Requirements source.** `docs/superpowers/specs/2026-06-23-unit-9-feedback-log.md` — captured
live during the user's manual walkthrough (2026-06-21→23) and grounded against `design/`. Every
sub-unit below cites the feedback-log item IDs it closes.

**Reference.** `design/proto.jsx` (prototype, canonical) + `design/hf-*.jsx` (hi-fi) +
`design/hf-kit.jsx` (the `v5` skin). Follow the prototype where they diverge.

---

## Locked decisions (from the brainstorm)

1. **Modals → routes.** Convert modal flows (change-password, recovery-code, group-create,
   contact-picker, feedback) to dedicated routes/screens. Keep a thin overlay layer ONLY for
   true interrupts: incoming connection-request pop-up, image lightbox, trusted-device prompt.
   The prototype has no modals — it is a screen-stack navigator.
2. **Canonical skin = `v5` soft.** `radius: 12`, `soft: true` → pill buttons (`borderRadius:
   999`), inputs `radius 12`, cards `radius+2`, **rounded-rect avatars** (`avatarRadius: 10`;
   profile ≈ `radius+6`). NOT the sharp 6px we shipped, NOT fully-round avatars.
3. **Persistent desktop sidebar** on every authenticated screen (`HiDesktop` = NavColumn +
   pane, always both). Mobile keeps the full-screen-stack behavior.
4. **Follow the prototype**, not the hi-fi stills, where they differ.

---

## Architecture

Three dependency tiers. Tier 0 + Tier 1 land first; Tier 2's five surface sub-units
parallelize (with care on shared files — `sidebar.tsx`, `App.tsx`).

```
Tier 0:  9-0 connection-delivery fix        (logic; parallel to Tier 1)
Tier 1:  9-1 foundation primitives          ──┐  (everything visual depends on these)
         9-2 app shell (sidebar + routes)   ──┤
Tier 2:  9-3 sidebar & nav IA               ◄─┤
         9-4 onboarding restructure         ◄─┘ (9-1 only)
         9-5 settings rebuild               ◄─── 9-1 + 9-2
         9-6 chat + conversation settings   ◄─── 9-1 + 9-2
         9-7 connection-request surfacing   ◄─── 9-0 + 9-1 + 9-2
```

---

## Sub-units

### 9-0 · Connection-request delivery fix  *(prerequisite spike + fix)*

**Why first:** unblocks real validation of 9-7 (pending surfacing, QR pop-up, invite-accept)
and §3 real messaging. Currently a sent connection request appears not to arrive in the
recipient's pending list (the inbox subscription seemingly doesn't pick it up — observed but
not root-caused).

- **Step 1 — diagnosis spike.** Reproduce the two-sided handshake (two real accounts/contexts
  on the same sync server). Instrument the inbox send + subscription path
  (`src/jazz/invitations.ts`, the inbox subscription in `src/App.tsx` /
  `useConversationInboxSubscription`, and the connection-request CoValue load). Determine the
  actual cause: stale inbox CoValue, migration race, subscription resolve depth, or
  permission/group issue. **Do not guess a fix — confirm the cause first.**
- **Step 2 — fix** the confirmed cause; add a regression test (unit or e2e) proving a sent
  request lands in the recipient's pending list.

**Closes:** the "possible real bug" in the feedback log. **Out of scope:** the UI of where
requests surface (that's 9-7).

### 9-1 · Foundation primitives  *(cross-cutting; lands first)*

Re-calibrate the shared visual primitives to the `v5` soft skin so every surface inherits the
correct look.

- **DEC-1 roundedness:** retune the radius scale → pill buttons, `radius 12` inputs/cards.
  Touch `src/components/ui/button.tsx`, `text-field.tsx`, the token scale, and the raw
  `rounded-r-*` usages in `auth-surface.tsx` etc.
- **DEC-4 avatar shape:** `Avatar` + `ConversationAvatar` → rounded-rect (radius ~10; profile
  ~18), not `rounded-pill`.
- **DEC-3 theme-aware QR:** new shared QR rendering — modules `c.text`, background `c.panel`,
  theme-reactive; replaces `qrcode.react` defaults. Larger default size. Used by 9-4 pairing +
  9-7 add-contact.
- **DEC-2 centering:** `AuthSurface` `tall` mode centers vertically (consistent with login).

**Closes:** DEC-1, DEC-2, DEC-3, DEC-4, 1-A, 1.2-A (centering), 1.3/1.4/1.5-B (centering).

### 9-2 · App shell  *(structural; after 9-1)*

- **2-F persistent desktop sidebar:** lift the sidebar into a layout shell so it renders on
  every authenticated route on desktop (settings, add-contact, profile, conversation,
  members, new-conversation, connections). Mobile retains full-screen behavior.
- **Modals → routes:** remove `ModalShell`/`MobileBottomSheet` usage for change-password,
  recovery-code, group-create, contact-picker, feedback. Add their routes. Keep the overlay
  layer ONLY for: incoming connection-request pop-up, image lightbox, trusted-device prompt.
  (The `ModalShell` primitive may stay in-tree for those three; the rest of Unit 8c's modal
  call-sites are deleted.)

**Closes:** 2-F, the §5 modal-architecture decision.

### 9-3 · Sidebar & navigation IA  *(after 9-1, 9-2)*

Reference `design/hf-list.jsx` (NavColumn, MobChatsList, MobTabBar) + `proto.jsx` ChatsScreen.

- **2-C add-button = bottom-right FAB** (pill, accent fill, shadow); floats above the mobile
  tab bar.
- **2-A tab icons:** chat-bubble + people icons next to "chats"/"contacts".
- **2-B header chrome:** remove the Arcan mark left of avatar+name; **add gear → settings**.
- **2-D** remove the bottom "settings" link from the sidebar footer.
- **2-E mobile tabs bottom-only** (remove the duplicated top tabs on mobile).
- **3.1 chat rows:** rounded-rect avatars (9-1), **last-message preview** line, **timestamp**
  top-right, **unread pill badge** + bold-on-unread.

**Closes:** 2-A, 2-B, 2-C, 2-D, 2-E, 3.1-A..D.

### 9-4 · Onboarding restructure  *(after 9-1)*

Reference `proto.jsx` WelcomeScreen / SignInScreen + `hf-flows.jsx`.

- **1.2+1.5 unify** welcome + sign-in-choice into a single screen (mark + create-account +
  restore + inline sign-in).
- **1.5-A remove** the redundant restore-choice intermediate screen
  (`restore-choice-step.tsx`).
- **1.4-A profile-picture upload at the display-name step** (camera-overlay affordance →
  becomes the profile picture immediately).
- **1.1-A / 1.2-A / 1.6-C larger Arcan logo + wordmark** on auth/onboarding/pairing (hero
  size).
- **1.3/1.4/1.5-A** recovery-code display step: more breathing room.

**Closes:** 1.1-A, 1.2-A, 1.2+1.5 unify, 1.3/1.4/1.5-A, 1.4-A, 1.5-A, 1.6-C.

### 9-5 · Settings rebuild  *(after 9-1, 9-2)*

Reference `proto.jsx` SettingsScreen + `hf-settings.jsx`. Re-derive the whole surface.

- **4-B card sectioning:** connected `Card` container per category (panel bg, hairline border,
  hairline-divided rows), uppercase section label above each. Fix the inverted bg/category
  colors.
- **4-C row icons** on every row.
- **4-D account section first:** `name + avatar + "view your profile"` row → profile route;
  **change password** + **recovery code** rows (now routes per 9-2); **safety number** as an
  expandable/dropdown row.
- **4-E appearance:** add check-mark on the selected accent swatch. (Theme + accent behavior
  already works — keep, restyle container.)
- **4-F feedback** → single row → dedicated **feedback route** matching prototype
  `FeedbackScreen`; positioned account → feedback → appearance → notifications → devices →
  sign-out.
- **4-G notifications = toggle sliders** (design `Toggle`); browser-notification toggle
  triggers the permission request on flip and reflects the real permission state (denied →
  stays off).
- **4-H devices:** restyle to prototype; "link a device" row at the **bottom** of the devices
  card.
- **4-I sign out:** standalone card at the very bottom, **danger red**.
- **5-A** the converted change-password/recovery routes: consistent red destructive styling +
  subtle onboarding-tone helper text.

**Closes:** 4-A (via 9-2), 4-B..4-J, 5-A.

### 9-6 · Chat + conversation settings  *(after 9-1, 9-2)*

Reference `proto.jsx` ChatScreen + ConvoSettingsScreen + `Bubble`/`ownPaintP`.

- **3.2 chat header:** the **entire top row is the link to conversation settings** (remove the
  standalone Members button); **back arrow mobile-only + small single arrow**; rounded-rect
  avatar; correct text positioning. **Disregard** the prototype's online/verified chips
  (presence/verification were dropped earlier).
- **3.3 message list + composer:** bubble color/accent/shape + timestamp position per
  prototype (own = accent fill/grad + onAccent, other = panel); restyle composer; verify the
  **new-messages divider** renders + matches.
- **3.4 conversation settings:** **1:1 → redirect to the other user's profile** (no standalone
  DM settings screen); group → **editable name** + **large editable picture** (group only;
  contact picture not editable); **member list split into admins + members**; per-member
  **context menu**; member **name/picture → their profile**.

**Closes:** 3.2-A..E, 3.3-A..C, 3.4-A..G.

### 9-7 · Connection-request surfacing  *(after 9-0, 9-1, 9-2)*

Reference `proto.jsx` AddContactScreen + the connection-subsystem design.

- **2-I pending requests** surface as a **pending section in the contacts tab**.
- **2-I QR-channel live pop-up:** while on your own share-QR screen, an incoming request
  raises a live pop-up (one of the kept overlay interrupts).
- **2-H invite-accept screen:** richer — inviter's **name + icon shown distinctly**, more
  context, centered (dedicated screen, not bare).
- **2-J add-contact button:** single adaptive button — mobile opens the native share sheet,
  desktop copies the link. (Confirm exact behavior during planning.)

**Closes:** 2-G, 2-H, 2-I, 2-J. **Depends on 9-0** for end-to-end validation.

---

## Execution model

- **Tier 0/1 first.** 9-0 (logic) can run in parallel with 9-1/9-2. 9-1 before 9-2.
- **Tier 2 parallelizes** — but 9-3, 9-5, 9-6 all touch `sidebar.tsx` / `App.tsx`. Per the
  Unit 8 lesson (parallel worktrees raced on shared files), either serialize those three or
  merge their worktrees carefully one at a time. 9-4 and 9-7 are more isolated.
- Each sub-unit ships as a `--no-ff` merge to `main`, mirroring prior units.
- Re-validate against the live app per sub-unit (the dev-seed helper covers layout; 9-0 makes
  real validation possible for 9-7).

## Out of scope

- New features beyond the feedback log.
- The trust-circle data-layer hardening (task #8 — still its own future unit).
- §6/§7 of the walkthrough (not yet walked) — fold into a Unit 9 follow-up if they surface
  anything once §3 is validatable.
- Presence / verification / typing / delivery indicators (dropped earlier; do not re-add even
  though the prototype shows them).

## Deliverables

- `src/...` the transitions per sub-unit.
- 9-0 regression test for connection-request delivery.
- Revert of the dev-only seed helper (`src/jazz/dev-seed.tsx` + `<DevSeed/>` mount in
  `src/App.tsx`) before any commit that isn't explicitly the seed.
- Per-sub-unit `--no-ff` merges; optional `slice-9-complete` tag at the end.

## Pre-work cleanup

- The dev-only seed helper is currently uncommitted in the working tree (`src/jazz/dev-seed.tsx`
  + `<DevSeed/>` mount). It must be reverted before Unit 9 implementation commits begin —
  unless we choose to keep it (uncommitted) through Unit 9 to aid validation, then revert at
  the end. Decide at plan time.
- Unit 8 Phase D (revert `playwright.visual.config.ts` + `tests/visual/` + `test:visual`
  scripts; optional `slice-8-complete` tag) is still pending — can fold into Unit 9 pre-work.
