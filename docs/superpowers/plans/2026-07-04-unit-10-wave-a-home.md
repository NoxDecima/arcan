# Unit 10 Phase 2 Wave A — Shell Integration + Home Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app's home surfaces become the prototype: mobile ChatsScreen/ContactsScreen presenters + the desktop NavColumn inside DesktopWindow-on-stage, fed by real Jazz data through containers, with the legacy Sidebar/MobileTabBar/EmptyPane retired from these surfaces.

**Architecture:** Pure presenters in `src/ui/screens/` (parity-gated against verbatim proto copies with documented presence-omission patches); containers move — not rewrite — the existing Sidebar data logic (`useHomeLists` hook); AppShell adopts the kit shells. Old components stay on disk until Phase 4 but stop rendering on home surfaces.

**Tech Stack:** unchanged (React 19, kit from Phase 1, parity harness).

**Spec:** Unit 10 spec §7, §9 (Rung 1: home lists + shells), §10 Wave A.
**Law:** the mapping table. **Manifest:** update as findings land.

**Branch:** `unit-10/wave-a-home` off current `main`; merges `--no-ff`.

## Ground rules

1. Presenters are PURE (guard-enforced): props in, JSX out; navigation via callback props. Containers keep every existing Jazz pattern — resolve specs, `isArchived`, `resolveDisplayName`, `getUnreadCount`, `getLastMessagePreview`, avatar resolution — moved, not rewritten.
2. **Presence dots are omitted** (NOX-31): the proto's seeded rows show online dots; the verbatim proto copies for parity cells get a documented patch removing `status`/`online` usage (same mechanism as the bubble veil intent-fix — label the copy "patched copy" and note why).
3. **Existing `data-testid`s carry over verbatim** onto the new presenters (sidebar-*, conversation-*, unread-badge-*, plus the `testScope` prefix mechanism for the mobile mount) — minimizes the Phase 4 e2e retarget.
4. Real avatar images are a data-driven deviation (spec §8.5d): `HAv` gains a `src` mode; initials remain the fallback. Manifest row.
5. Every command in nix-shell. Branch discipline as before.

---

### Task 1: Kit extensions + tokens for Wave A

**Files:** `src/ui/kit/hav.tsx`, `src/ui/kit/fab.tsx`, `src/styles/tokens.css`, `tailwind.config.ts`, mapping table, `tests/parity/…` (re-run only).

- [ ] `HAv`: add `src?: string` — when set, render `<img src alt="" className="w-full h-full object-cover" draggable={false} />` inside the same rounded-avatar box (border/radius unchanged, no initials). No proto reference (Rung 4) — no parity cell; existing HAv cells must still pass unchanged.
- [ ] `Fab`: add `size?: number` (default 52) and `iconSize?: number` (default 24) — the desktop NavColumn uses the proto's 50/23 variant (proto.jsx:777-779). Existing `fab` cell (52/24 defaults) must still pass.
- [ ] tokens.css: add `--fs-ui-nav: 14px;` (NavColumn header name, proto:767 `700 14px/1.2`) next to the other appended Phase-1 sizes with provenance comment.
- [ ] tailwind.config.ts fontSize additions:

```typescript
        'ui-nav': ['var(--fs-ui-nav)', { lineHeight: 'var(--lh-ui)' }],
        'ui-preview': ['var(--fs-ui-value)', { lineHeight: '1.3' }],   // row preview 11px/1.3 (proto:752)
        'ui-contact': ['var(--fs-ui-btn)', { lineHeight: 'var(--lh-ui)' }], // ContactRow name 13px/1.2 (proto:139)
```

- [ ] Mapping-table rows (append to type ramp):

```markdown
| `700 14px/1.2` mono (nav header name) | `font-mono font-bold text-ui-nav` |
| `500|600 11.5px/1` mono `.04em` (desktop nav tabs) | `font-mono font-medium|font-semibold text-ui-empty-sub tracking-tab` (size reuse) |
| `400|500 11px/1.3` body (row preview) | `font-body text-ui-preview` (+`font-medium` when unread) |
| `600 13px/1.2` body (contact row name) | `font-body font-semibold text-ui-contact` |
| `700 9.5px/17px` mono (unread pill) | `font-mono font-bold text-ui-tab` + inline `lineHeight: "17px"` |
```

And to clusters:

```markdown
| Convo/contact list container | `px-2 py-1.5 flex flex-col gap-px` (proto `6px 8px`, gap 1) |
| Convo row | tap + `w-full text-left flex items-center gap-[11px] px-2.5 py-[9px] rounded-r-4` (+ active: `bg-accent-soft`, HAv ring = accent-soft) |
| Contact row | tap + `w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-r-4` |
| Unread pill | `min-w-[17px] h-[17px] px-[5px] rounded-pill bg-arcan-accent-fill text-on-accent text-center` |
| Desktop nav tab | tap + `flex-1 justify-center gap-[7px] py-[11px] -mb-px border-b-2` (active `border-arcan-accent-fill`, else `border-transparent`); icon 15 |
| Nav header | `flex items-center gap-2.5 pt-[13px] px-3.5 pb-2.5`; avatar 32; gear 19 |
```

- [ ] Gates: `nix-shell --run 'npm run parity -- --only hav-sizes,hav-group,hav-status,fab'` all PASS; tsc; check-tokens; vitest.
- [ ] Commit: `feat(kit): HAv image mode, Fab size variant, Wave A ramp/cluster tokens`

---

### Task 2: Mobile home presenters + parity

**Files:** Create `src/ui/screens/home-types.ts`, `src/ui/screens/rows.tsx`, `src/ui/screens/chats-screen.tsx`, `src/ui/screens/contacts-screen.tsx`, `src/ui/screens/index.ts`; parity files.

View models (`home-types.ts`):

```typescript
export interface ConvoItem {
  id: string;
  name: string;
  initials: string;
  avatarSrc?: string;
  group?: boolean;
  preview: string;
  time: string;
  unread: number;
}
export interface ContactItem {
  id: string;
  name: string;
  initials: string;
  avatarSrc?: string;
}
export interface HomeProfile { name: string; initials: string; avatarSrc?: string }
```

`rows.tsx` — shared between mobile screens and NavColumn:

```typescript
export function ConvoRow(props: { item: ConvoItem; active?: boolean; onClick: () => void; testScope?: string; index?: number }): JSX.Element;
export function ContactRow(props: { item: ContactItem; onClick: () => void; "data-testid"?: string }): JSX.Element;
```

ConvoRow = node-for-node proto.jsx:95-107 (== desktop convoRow :744-757 which adds `active`): tap + list-row cluster; HAv 38 (group flag, NO status, ring = active ? accent-soft : bg); name `font-body text-ui-row truncate` `font-bold` when unread else `font-semibold`; time `font-mono font-medium text-ui-tab text-dim`; preview `font-body text-ui-preview truncate` (`font-medium text-text-2` when unread else `text-dim`); unread pill per cluster. ContactRow = proto.jsx:134-143: HAv 38, name `flex-1 font-body font-semibold text-ui-contact text-text`, chev 16 dim.

Screens (proto.jsx:86-114 / 116-132):

```typescript
export function ChatsScreen(props: {
  profile: HomeProfile; convos: ConvoItem[];
  onOpenConvo: (id: string) => void; onOwnProfile: () => void; onSettings: () => void; onNewConvo: () => void;
  emptyText?: string; testScope?: string;
}): JSX.Element;
export function ContactsScreen(props: {
  profile: HomeProfile; contacts: ContactItem[];
  onOpenContact: (id: string) => void; onOwnProfile: () => void; onSettings: () => void; onAddContact: () => void;
  pendingSlot?: ReactNode; // Rung 4: PendingRequestsSection above the list (container passes it)
  emptyText?: string; testScope?: string;
}): JSX.Element;
```

Composition exactly: `PHeader` (title = profile.name, avatar = HAv 30 [+src], onAvatar, right = tap gear 20 text-text-2) + `Body` (list container cluster; rows; when list empty render `<div className="px-4 py-8 text-center font-body text-ui-sub text-dim">{emptyText}</div>` — Rung 4 state, manifest note) + `Fab` (onNewConvo / onAddContact). Testids: apply the Sidebar's existing names via `tid()` helper (`sidebar-header-profile`, `sidebar-avatar`, `sidebar-display-name`, `sidebar-settings-gear`, `conversation-list`, `conversation-row-{i}`, `conversation-avatar-{i}`, `conversation-name-{i}`, `conversation-time-{i}`, `conversation-preview-{i}`, `unread-badge-{i}`, `sidebar-chats-empty`, `sidebar-contacts-list`, `sidebar-contacts-empty`, contact rows `contact-row-{i}`; Fab keeps the legacy fab testid — read `src/components/fab.tsx` for its name and reuse).

Parity cells: `chats-screen` + `contacts-screen`, `width: 300, height: 560, pad: 0`. Proto side: patched copies of ChatsScreen/ContactsScreen/ContactRow (drop `status={d.online ? … }`; drop nothing else) + stub `nav` + `Fab`/`PHeader`/`Body` from existing gallery globals + HF_CONVOS/HF_CONTACTS from window. App side: presenters with fixtures mirroring HF data exactly (`decima` profile, names/times/unreads/last verbatim; no avatarSrc). Both PASS ≤0.2% dark+light.

- [ ] Purity guard passes (screens import only from `../kit` / local types).
- [ ] Commit: `feat(screens): ChatsScreen/ContactsScreen presenters + rows + parity`

---

### Task 3: NavColumn presenter (desktop) + parity

**Files:** Create `src/ui/screens/nav-column.tsx`; parity files.

```typescript
export function NavColumn(props: {
  profile: HomeProfile;
  tab: "chats" | "contacts";
  onTab: (t: "chats" | "contacts") => void;
  convos: ConvoItem[]; contacts: ContactItem[];
  activeConvoId?: string;
  onOpenConvo: (id: string) => void; onOpenContact: (id: string) => void;
  onOwnProfile: () => void; onSettings: () => void;
  onFab: () => void; // container decides newconvo vs addcontact by tab
  pendingSlot?: ReactNode; // Rung 4: PendingRequestsSection above contacts list
  chatsEmptyText?: string; contactsEmptyText?: string;
}): JSX.Element;
```

Node-for-node proto.jsx:763-780: column `w-[320px] shrink-0 relative border-r border-hairline bg-bg flex flex-col`; nav header cluster (tap profile button: HAv 32 [+src] + name `font-mono font-bold text-ui-nav text-text`; gear tap 19); tabs row `flex border-b border-hairline px-2` with two desktop nav tabs per cluster (icon chat/people 15, label chats/contacts `text-ui-empty-sub tracking-tab`, active: icon+underline `arcan-accent-fill`… careful — proto: icon color `on ? c.accent : c.dim`, label `on ? c.text : c.dim`, underline `c.accentFill`); scroll area `flex-1 min-h-0 overflow-y-auto` + list container cluster; rows = ConvoRow (with `active={item.id === activeConvoId}`) or [pendingSlot, ContactRow…]; Fab `size={50} iconSize={23}`. Empty states as in Task 2. Testids: same sidebar-* family (unprefixed — this is the desktop mount).

Parity cell `nav-column`: `width: 320, height: 560, pad: 0`; proto side = patched extraction of the left column from DesktopApp (copy `tabBtn` + `convoRow` + the column JSX verbatim from proto.jsx:731-780, drop presence, stub nav/state with `tab='chats'`, `selName='ada · keyring'` so ONE row renders active); app side: NavColumn with the HF fixture, `activeConvoId` = ada's row, tab chats. A second cell `nav-column-contacts` (same, tab contacts, no active) covers the contacts branch + tab underline flip. Both ×2 themes PASS.

- [ ] Commit: `feat(screens): NavColumn desktop presenter + parity`

---

### Task 4: Toast re-skin (KitToast inside ToastProvider)

**Files:** Modify `src/components/toast.tsx` (+ its unit tests if they assert markup).

- [ ] Read `src/components/toast.tsx`. Keep: `ToastTone`, `ToastOptions`, `useToast()` API, provider queue/timing/dismiss logic, every testid. Replace the toast ITEM's rendered markup with the kit `KitToast` (import from `@/ui/kit` — legal here; components may import the kit, never the reverse) wrapped in whatever fixed-position container the provider already uses. Tone mapping is 1:1 (`neutral|success|error|accent`). If the provider's container position conflicts with KitToast's `absolute left-3.5 right-3.5 bottom-[18px]`, wrap each toast in a `relative` slot of its own — visual result must match the `toast-tones` parity composition.
- [ ] `nix-shell --run 'npx vitest run'` — update any toast unit tests that asserted old classes/markup (behavioral assertions stay).
- [ ] Commit: `feat(toast): render toasts through KitToast (API + testids unchanged)`

---

### Task 5: Container integration — AppShell + home route

**Files:** Create `src/components/use-home-lists.ts`; modify `src/components/app-shell.tsx`, `src/routes/conversations/index.tsx`, `src/App.tsx`.

- [ ] **`use-home-lists.ts`** — extract Sidebar's data layer VERBATIM into one hook:

```typescript
export function useHomeLists(): {
  loading: boolean;
  profile: HomeProfile;
  convos: ConvoItem[];   // sorted + archived-filtered exactly as Sidebar does today
  contacts: ContactItem[];
}
```

Move (not rewrite) from `src/components/sidebar.tsx`: the `useAccount` resolve spec, `isArchived` filtering, sort order, `deriveConversationLabel`/`resolveDisplayName`, `getUnreadCount`, `getLastMessagePreview`, `formatRowTime`, avatar resolution (own + per-conversation/contact — whatever Sidebar resolves today lands in `avatarSrc`). Preserve every memoization/subscription pattern. If Sidebar's row time format differs from the proto's seed style, KEEP the app's existing format (data-driven formatting was already aligned in Unit 9; note in manifest).

- [ ] **`use-is-desktop.ts`** (create in `src/components/`): a `useIsDesktop()` hook — `matchMedia("(min-width: 768px)")` (Tailwind `md`), initial value from `.matches`, subscribed to `change` events. CRITICAL DESIGN CONSTRAINT: the shell must render **exactly one `<Outlet />`** — a CSS dual-mount of both branches would mount every route twice (doubled Jazz subscriptions, doubled effects like mark-as-read). JS branch switching means crossing the breakpoint remounts the route tree — acceptable and documented in a comment.

- [ ] **`app-shell.tsx`** — desktop becomes the design's window-on-stage; mobile becomes MobileShell. One Outlet, branch chosen by `useIsDesktop()`:

```tsx
export function AppShell() {
  const isDesktop = useIsDesktop();
  const shell = useHomeLists();            // NavColumn container data (desktop only consumes it)
  const { tab, setTab } = useSidebarTab(); // existing shared tab state
  const navigate = useNavigate();
  // Active conversation id: the layout route can't useParams(':id') — derive
  // from useLocation().pathname via /^\/conversations\/([^/]+)$/.
  if (isDesktop) return (
    <div className="h-screen w-screen bg-bg-stage flex items-center justify-center overflow-hidden">
      <DesktopWindow>
        <NavColumn /* profile/convos/contacts from shell; tab/setTab; activeConvoId;
                      onOpenConvo → navigate(`/conversations/${id}`); onOpenContact → navigate(`/contacts/${id}`);
                      onOwnProfile/onSettings/onFab per today's Sidebar paths;
                      pendingSlot={tab === "contacts" ? <PendingRequestsSection /> : undefined} */ />
        <div className="flex-1 min-w-0 relative flex flex-col bg-bg"><Outlet /></div>
      </DesktopWindow>
    </div>
  );
  return (
    <div className="h-screen w-screen flex flex-col">
      <MobileShell tabBar={isRoot ? <PTabBar active={tab} onTab={(t) => { setTab(t); navigate("/"); }} /> : undefined}>
        <Outlet />
      </MobileShell>
    </div>
  );
}
```

(Structural sketch — implementer finalizes against the real files; the behavioral requirements are binding: single Outlet; `isRoot` mirrors `src/components/mobile-tab-bar.tsx`'s root-path logic; stop mounting `MobileTabBar` in App.tsx — the FILE stays until Phase 4; callbacks navigate exactly where today's Sidebar navigates.) The mobile ConversationsRoute (below) no longer needs its own dual-mount either — with JS switching only one branch mounts; KEEP the `testScope="mobile"` prefix on the mobile presenters anyway so existing e2e selectors keep resolving until the Phase 4 retarget.

- [ ] **`src/routes/conversations/index.tsx`** — replace the Sidebar/EmptyPane pair:
  - Mobile branch: `useHomeLists()` + tab from `useSidebarTab()` → `<ChatsScreen testScope="mobile" …/>` or `<ContactsScreen testScope="mobile" …/>`, callbacks navigating exactly where today's Sidebar rows/gear/profile/Fab navigate (read Sidebar for the exact paths: rows → `/conversations/:id` / `/contacts/:contactID`, gear → `/settings`, profile header → own profile route, Fab → `/conversations/new` / `/contacts/add`). Contacts tab mobile ALSO needs the pending slot — add `pendingSlot?: ReactNode` to ContactsScreen (above the list, Rung 4) and pass `<PendingRequestsSection/>` here.
  - Desktop branch: `<DesktopEmpty tab={tab} />` (kit) replaces EmptyPane — testid `home-main` stays on the wrapper.
  - Keep the `?tab=` query-param seeding effect exactly as-is.
- [ ] **App.tsx**: remove the `MobileTabBar` mount (comment updated); everything else untouched.
- [ ] **Loading state:** while `loading`, containers keep rendering the existing `NavListSkeleton` (import in container files — allowed) inside the kit column/Body so the skeleton convention survives (manifest note, Rung 4).
- [ ] Gates: tsc; check-tokens; check-ui-purity; `npx vitest run` (update unit tests that render Sidebar/ConversationsRoute/AppShell — retarget to the new structure, keep behavioral assertions); FULL parity suite still green.
- [ ] Visual smoke: `nix-shell --run 'npx vite build'` then screenshot `/` at 1400×900 and 390×844 (dark) via the preview + playwright-core one-off script (pattern: `/home/nox/.claude/jobs/dae12460/tmp/smoke-tokens.mjs`) — requires auth… if auth-gated, smoke via dev stack with a seeded account is NOT required for this task; instead attach the parity cells as evidence and leave the live check to the wave-exit walkthrough. Do capture the login page to prove no shell regression on auth surfaces.
- [ ] Commit: `feat(home): AppShell adopts DesktopWindow/MobileShell; home routes render kit presenters`

---

### Task 6: Wave exit

- [ ] Full battery: parity suite, tsc, check-tokens, check-ui-purity, vitest, vite build.
- [ ] e2e baseline-drift measurement: `nix-shell --run 'npx playwright test --project=chromium 2>&1 | tail -5'` — record pass/fail vs the 44/44 baseline in the report. Fix ONLY trivial drift in `tests/e2e/helpers.ts` selectors where a carried-over testid moved mounts (≤ ~10 lines); anything structural waits for Phase 4 (record the failing spec names in the manifest's Phase 2 notes).
- [ ] Manifest rows (coverage manifest "Screens" section — create it): `home/chats (mobile)` Rung 1 proto ChatsScreen PASS; `home/contacts (mobile)` Rung 1 + Rung 4 pending-slot note; `desktop nav column` Rung 1 (DesktopApp extraction) + Rung 4 pending-slot; `desktop empty pane` Rung 1 DesktopEmpty; `desktop window-on-stage shell` Rung 1; `mobile shell + tab bar` Rung 1; Rung 4 notes: avatar image mode, empty states, skeleton loading, presence omitted.
- [ ] Merge: `git checkout main && git merge --no-ff unit-10/wave-a-home -m "Unit 10 Wave A: home screens + shell integration (prototype kit)"`

## Self-review notes

- The desktop active-row state (`activeConvoId`) is the one piece of NavColumn state Sidebar didn't have — derived from the URL in AppShell, not stored.
- ChatsScreen/ContactsScreen and NavColumn share ConvoRow/ContactRow so the mobile/desktop row rendering can't drift apart.
- The old Fab/Icon/EmptyPane/Sidebar/MobileTabBar components remain on disk (Phase 4 deletes) — Wave A only unmounts them from home surfaces.
- e2e is measured, not fixed — per spec §10 Phase 4 owns the single retarget.
