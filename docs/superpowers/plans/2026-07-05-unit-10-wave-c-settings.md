# Unit 10 Phase 2 Wave C — Settings Cluster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the nine prototype "settings cluster" screens become pure kit presenters fed by the existing container logic. In app terms: `/settings` (+ feedback sub-route), `/conversations/:id/members` (ConvoSettings), `/profile/:accountID` (own + contact), `/contacts/add`, `/conversations/new` swap their hand-rolled markup for node-for-node ports of `proto.jsx:205–536`, with all data logic **moved** (not rewritten) into the container half. `LinkDevice` and `AddPeople` presenters are also built for coverage completeness (their live wiring is deferred — see task notes).

**Method:** identical to Waves A/B. Pure presenters in `src/ui/screens/` (props in, JSX out; no Jazz/router — enforced by `scripts/check-ui-purity.sh`), parity-gated against **patched proto-local copies**; container logic MOVED not rewritten; testids carried verbatim; sanctioned deviations only (spec §8). Read the Ground rules of `docs/superpowers/plans/2026-07-04-unit-10-wave-a-home.md` and `docs/superpowers/plans/2026-07-05-unit-10-wave-b-chat.md` — **they all apply and are not repeated here**. This wave inherits every binding rule from B.

**Binding inherited rules (do not relitigate):**
1. **Route roots fill the pane, never the viewport.** Content-height roots (settings, feedback, members, profile-view, contacts/add, contacts/detail, conversations/new) use `flex-1 min-h-0` AND own their scroll (`overflow-y-auto`, normally via the kit `Body`) when content can exceed the pane. The pane itself never scrolls. (Wave A merge-review already fixed settings + 3 sub-routes + conversations/new; this wave fixes the rest as it restyles them.)
2. **No DesktopWindow / window-on-stage** (USER DECISION 2026-07-05) — nav column + pane fill the viewport; these screens render in the AppShell pane on desktop, MobileShell on mobile.
3. **No presence / typing / verified / delivery visuals** (NOX-31/32/33) — omitted at the tree level. (Few of the nine screens carry any; the LinkDevice "waiting for device" pulse is a loading affordance, NOT a typing indicator — it is kept, §T3.)
4. **No `@` title prefixes** (walkthrough 2026-07-05) — the proto renders `'@' + name` on 1:1 chat titles AND profile display names (`proto.jsx:216`); drop the `@` everywhere. Plain name.
5. **testids carried verbatim** onto kit-rendered markup via sanctioned optional testid props (spec §8c).
6. **a11y additions sanctioned** (spec §8b) — aria/role/sr-only/focus-visible; pixel-neutral.
7. **Real-data states the proto doesn't show** (loading/error/empty + app-only affordances) are built from the kit, flagged Rung-4, logged in the coverage manifest, and kept OUT of parity fixtures (parity cells render the proto placeholder states).

**Prototype source:** `design/proto.jsx` — ProfileScreen (205–236), OwnProfileScreen (238–259), SettingsScreen (261–317), ConvoSettingsScreen (319–355), NewConvoScreen (357–396), AddContactScreen (398–431), AddPeopleScreen (433–457), LinkDeviceScreen (459–477), FeedbackScreen (479–534). `design/hf-extra.jsx` (NewConvo + AddContact hi-fi variants) and `design/hf-settings.jsx` / `design/hf-convo-settings.jsx` are **reference only — `proto.jsx` wins every conflict**.

**Law:** `docs/superpowers/specs/2026-07-03-unit-10-style-token-map.md`. Every inline style maps through it; an unmapped style is a **stop-the-line** event (extend the table + tokens, never approximate). Rem base is fixed 16px on `html` — cluster strings apply as written.

**Branch:** `unit-10/wave-c-settings` off current `main`; merges `--no-ff`. Verify base is current `main` before starting (`git reset --hard main` if stale). Plan-writing agents write files only, never touch git.

**Environment:** run every command inside `nix-shell` (Node 22 + Playwright browsers + system deps; parity and e2e need the bundled Chromium). Exact gate commands: `npm run typecheck` (= `tsc -b`; NOT `tsc --noEmit`), `npm run check-tokens`, `npm run check-ui-purity`, `npm run test` (vitest, `tests/unit/` only), `npm run parity -- --only <cells>` (or bare `npm run parity` for all), `npm run test:e2e` (Playwright chromium), `npm run build`.

**Container-integration scope (T5):** `src/routes/settings/*` (index + sections + feedback-route), `src/routes/conversations/members.tsx`, `src/components/profile-view.tsx`, `src/routes/contacts/detail.tsx`, `src/routes/contacts/add.tsx`, `src/routes/conversations/new.tsx`. `settings-kit.tsx` **stops rendering** (its Icon/Toggle/Card/SRow/SectionLabel — the Unit 9-5a predecessors — are replaced by kit `Icon`/`PToggle`/`PCard`/`PRow`/`PSectionLabel`); the file stays until Phase 4. Change-password / recovery-code routes are **Rung 3 (out of Wave C)** — navigation targets preserved, visuals left for the Rung-3 pass.

**Folded-in tracked followups (due now — Wave C touches their surfaces):**
- **(a) kit a11y items** → T1: `PToggle` gains `role="switch"` + `aria-checked`; `PHeader` back button gains an `aria-label` (default `"back"`, overridable). Both pixel-neutral.
- **(b) "1:1 conversation names on profile pages show untitled"** → T5: `profile-view`'s shared-conversations list derives 1:1 names via the `contactBook` counterpart lookup (the same derivation as `detail.tsx:357–392`), instead of `useSharedGroups`' raw `conv.title ?? "Untitled"`.

---

### Task 1: Kit + token gaps for the settings cluster

**Files:** `src/ui/kit/body.tsx`, `src/ui/kit/ptoggle.tsx`, `src/ui/kit/pheader.tsx`, `src/styles/tokens.css`, `tailwind.config.ts`, and the mapping table (`…unit-10-style-token-map.md`).

Survey performed against `proto.jsx:205–536` (all font shorthands, letterSpacing, radius, and `Body pad` usages enumerated). The gaps below are the complete set found; the executing agent re-verifies each against the live v5 skin and adds any it missed (**stop-the-line** rule).

- [ ] **`Body` pad accepts a string.** Three Wave-C screens pass asymmetric padding (`Body pad={'24px 20px'}` ×3, `pad={'22px 20px'}` ×1) that the current `pad?: number` cannot express. Widen to `pad?: number | string` (inline `style={{ padding: pad }}` already handles both). No other change; existing `pad={n}` callers unaffected. This is a structural metric (arbitrary), not a token.
- [ ] **New fontSize tokens** (only two genuine new sizes; everything else reuses an existing `--fs-ui-*` with a weight + `leading-*` override):
  - `--fs-ui-name: 19px` → `tailwind fontSize 'ui-name': ['var(--fs-ui-name)', { lineHeight: 'var(--lh-ui)' }]` — profile display name `700 19px/1.2` (proto:216, 249).
  - `--fs-ui-heading: 18px` → `'ui-heading': ['var(--fs-ui-heading)', { lineHeight: 'var(--lh-ui)' }]` — add-contact heading `700 18px/1.25` (proto:406), convoset group name `700 18px/1.2` (proto:339). The 1.25 vs 1.2 delta (≈0.9px at 18px, single line) is characterized in T4 parity; if it exceeds threshold the add-contact heading takes a `leading-[1.25]` override (line-height literal — allowed by check-tokens).
- [ ] **New letterSpacing tokens** (three caps-tracking values the proto uses that are unmapped): `--tracking-caps-12: .12em`, `--tracking-caps-10: .1em`, `--tracking-caps-08: .08em` → tailwind `letterSpacing` keys `caps-12` / `caps-10` / `caps-08`. Used by: add-contact "add someone" divider (.12em, proto:424), profile "soon" badge (.1em, proto:221), convoset role badge (.08em, proto:326).
- [ ] **PToggle a11y (followup a):** add `role="switch"` + `aria-checked={on}` to the button. Pixel-neutral; existing `ptoggle` parity cell must stay green.
- [ ] **PHeader a11y (followup a):** the back `<button>` gains `aria-label={backLabel ?? "back"}` (new optional `backLabel?: string` prop). Pixel-neutral; `pheader-back` cell stays green.
- [ ] **Mapping-table additions.** Append to the "Type ramp" section (all reuse existing size tokens except the two new ones above):

```markdown
| `700 19px/1.2` + headMono (profile name) | `font-mono font-bold text-ui-name` (no letterSpacing — proto sets none) |
| `700 18px/1.25`\|`700 18px/1.2` + headMono (add-contact heading / group name) | `font-mono font-bold text-ui-heading` (add-contact adds `leading-[1.25]` only if parity needs it) |
| `600 22px/1` mono (convoset 70px group-avatar initials) | `font-mono font-semibold text-avatar-group-fg` + inline `fontSize:22` (bespoke avatar — see T4) |
| `600 14px/1` mono (new-convo 42px group-placeholder "?") | `font-mono font-semibold text-ui-nav leading-none` + inline color `text-avatar-group-fg` |
| `600 12.5px/1.2` body (member / pick-row name) | `font-body font-semibold text-ui-row` |
| `500 12.5px/1` body (settings theme/accent labels) | `font-body font-medium text-ui-row leading-none` |
| `500 12px/1` body (profile "verify safety number" label) | `font-body font-medium text-ui-toast leading-none` |
| `500 13px/1` mono (profile safety-number digits) | `font-mono font-medium text-ui-btn` |
| `500 11.5px/1` body (feedback attachment filename) | `font-body font-medium text-ui-empty-sub` |
| `500 11px/1` body (add-contact "link valid for") | `font-body font-medium text-ui-value` |
| `600 11px/1` mono\|body (add-people btn, linkdevice copy) | `font-mono\|font-body font-semibold text-ui-value` |
| `600 10.5px/1` mono (settings theme light/dark labels) | `font-mono font-semibold text-ui-sub leading-none` |
| `600 10px/1` mono (add-contact TTL segment) | `font-mono font-semibold text-ui-chatsub` |
| `400 12.5px/1.5` body (feedback textarea) | `font-body text-ui-row leading-normal` |
| `400 12px/1` body (new-convo group-name placeholder) | `font-body text-ui-toast leading-none text-dim` |
| `400 11.5px/1.5`\|`/1.4` body (screen descriptions) | `font-body text-ui-empty-sub leading-normal` (`.4` → `leading-[1.4]`) |
| `400 10.5px/1` body ("or paste a link" etc.) | `font-body text-ui-sub leading-none` |
| `400 10px/1` body (add-people sub, new-convo hint) | `font-body text-ui-chatsub` |
| `400 9.5px/1.4` body (profile compare-in-person hint) | `font-body text-ui-tab leading-[1.4]` |
| `600 9px/1` mono `.12em`\|`.1em`\|`.08em` caps | `font-mono font-semibold text-ui-caps tracking-caps-{12,10,08} uppercase` |
```

- [ ] **Mapping-table additions — recurring clusters** (append to the "Recurring clusters" section; copy verbatim in T2–T4):

```markdown
| Segmented pill toggle (theme / TTL / link-valid-for) | outer `flex gap-0.5 p-0.5 rounded-pill bg-panel-2 border border-hairline`; segment `rounded-pill px-3 py-[5px]`, active `bg-arcan-accent-fill text-on-accent`, idle `text-text-2 bg-transparent` |
| Accent swatch button (settings) | `w-7 h-7 rounded-pill justify-center` + inline `background:<hex>`, border `2px solid var(--color-text)` when selected else transparent, boxShadow `0 0 0 2px var(--color-panel)` when selected; check glyph color inline (contrast-aware) |
| Pick-row (new-convo / add-people) | tap + `w-full text-left flex items-center gap-3 px-3 py-[9px] rounded-r-4` (+ selected `bg-accent-soft`); trailing check box `w-5 h-5 rounded-r-3 border-[1.5px]`, selected `bg-arcan-accent-fill border-transparent` else `border-hairline` |
| Role badge (convoset) | `px-2 py-1 rounded-pill font-mono font-semibold text-ui-caps tracking-caps-08 uppercase`; admin `bg-accent-soft text-arcan-accent border border-accent-border`, writer `bg-panel-2 text-text-2 border border-hairline` |
| Labeled divider ("add someone") | `flex items-center gap-2`; rules `flex-1 h-px bg-hairline`; label `font-mono font-semibold text-ui-caps tracking-caps-12 uppercase text-dim` |
| Group-avatar w/ camera badge (convoset 70 / new-convo 42) | bespoke `bg-avatar-group text-avatar-group-fg border border-hairline flex items-center justify-center` + inline size/`rounded-[radius+n]`/fontSize; camera button `absolute -right-0.5 -bottom-0.5 rounded-pill bg-arcan-accent-fill text-on-accent border-2 border-bg justify-center` |
| Feedback textarea | `min-h-[110px] resize-none rounded-r-4 border border-hairline bg-panel text-text p-[11px_12px] font-body text-ui-row leading-normal outline-none` + inline `caretColor: var(--color-accent-fill)` |
| Feedback category chip | tap + `px-[13px] py-[7px] rounded-pill font-mono font-semibold text-ui-value border`; on `border-accent-border bg-accent-soft text-arcan-accent`, off `border-hairline bg-transparent text-text-2` |
| Feedback dropzone (empty) | tap + `justify-center gap-2 p-3 rounded-r-4 border border-dashed border-hairline bg-transparent` |
```

- [ ] Gates: existing parity cells re-run green (`npm run parity -- --only ptoggle,pheader-back,pheader-plain,pheader-ontitle,pcard-rows,pfield`); `npm run typecheck`; `npm run check-tokens`; `npm run check-ui-purity`; `npm run test`.
- [ ] Commit: `feat(kit): settings-cluster ramp/cluster tokens + Body string pad + PToggle/PHeader a11y`

---

### Task 2: Profile pair — ProfileScreen + OwnProfileScreen presenters + parity

**Files:** create `src/ui/screens/profile-types.ts`, `src/ui/screens/profile-screen.tsx`, `src/ui/screens/own-profile-screen.tsx`; export from `src/ui/screens/index.ts`; add parity cells to `tests/parity/app-gallery/cells.tsx` + proto-local copies to `tests/parity/proto-cells.jsx` + rows to `tests/parity/cells.json` + fixtures to `tests/parity/app-gallery/fixtures.ts`.

The app has a **polymorphic** `ProfileView`; the proto has **two** screens. Port both, tree-exact; the T5 container branches on `isOwn`.

View model (`profile-types.ts`):

```typescript
import type { ReactNode } from "react";

export interface ProfileScreenVM {         // contact / "other" (proto:205–236)
  name: string;                            // plain, no "@" (rule 4)
  initials: string;
  avatarSrc?: string;
  idShort: string;                         // "co_z1a8…4f2"
  /** Rung-4 real data. undefined → render proto "soon" placeholder row. */
  sharedConversations?: { id: string; title: string }[];
}
export interface OwnProfileScreenVM {       // own (proto:238–259)
  name: string; initials: string; avatarSrc?: string; idShort: string;
}
```

`profile-screen.tsx` (contact) — node-for-node proto:210–234:
```typescript
export function ProfileScreen(props: {
  vm: ProfileScreenVM;
  onBack: () => void;
  onMenu?: () => void;                 // header-right dots (proto:211)
  onMessage: () => void;               // primary "message" PButton
  onOpenConversation?: (id: string) => void; // Rung-4 real shared list
  safetyOpen: boolean;                 // expandable "verify safety number"
  onToggleSafety: () => void;
  safetySlot?: ReactNode;              // Rung-4: container's <SafetyNumber> (expanded body)
  // testid carries
  rootTestId?: string;                 // "profile-view"
  backTestId?: string;                 // "profile-back"
  avatarTestId?: string;               // "profile-avatar"
  nameTestId?: string;                 // "profile-display-name"
  idTestId?: string;                   // "profile-account-id"
  messageTestId?: string;              // "profile-message"
  safetyToggleTestId?: string;         // "profile-safety-toggle"
}): JSX.Element;
```
Composition: `PHeader title="profile" onBack right={dots button}`; `Body pad={'24px 20px'}` → centered column gap 13 → `HAv size={80}` → name block (`text-ui-name`, id `text-ui-value text-dim`) → primary `PButton primary full icon="chat" label="message"` (maxWidth 320) → `PCard` containing: **shared conversations** — if `vm.sharedConversations` is undefined render the proto `PRow icon="chat" label="shared conversations" right={<span "soon" badge>}`; if defined render the real list (Rung-4, `onOpenConversation`); then the **verify-safety** expandable button (proto:222–230: check icon + label `text-ui-toast leading-none` + caret; expanded `safetySlot` + compare hint). Carry `profile-view`/`profile-back`/`profile-avatar`/`profile-display-name`/`profile-account-id`/`profile-message`/`profile-safety-toggle`.

`own-profile-screen.tsx` — node-for-node proto:241–256:
```typescript
export function OwnProfileScreen(props: {
  vm: OwnProfileScreenVM;
  onBack: () => void;
  onEditName: () => void;              // pencil (proto: toast; app: inline edit)
  onEditAvatar: () => void;            // camera badge
  onAddContact: () => void;            // primary "add a contact"
  onSettings: () => void;              // "account & settings" row
  nameEditSlot?: ReactNode;            // Rung-4: inline name <input> when editing
  extraSections?: ReactNode;           // Rung-4: your-conversations list + safety + remove-avatar (app-only)
  avatarInput?: ReactNode;             // Rung-4: hidden <input type=file> (container owns)
  ...testid carries: profile-view, profile-back, profile-avatar, profile-avatar-change,
  profile-display-name, profile-edit-name, profile-account-id, profile-add-contact, profile-settings-link
}): JSX.Element;
```
Composition: `PHeader title="your profile" onBack`; `Body pad={'24px 20px'}` → centered column → avatar with camera badge overlay (`relative`, `HAv size={80}`, camera button `absolute -right-0.5 -bottom-0.5 …`) → name+pencil button (or `nameEditSlot`) → id → `PButton primary full icon="plus" label="add a contact"` → `PCard` with single `PRow icon="gear" label="account & settings" onClick last` → `extraSections` (Rung-4 app-only). `avatarInput` rendered (hidden) for the container's file picker.

**Parity cells** (proto-local patched copies of proto:205–236 / 238–259 in `proto-cells.jsx`, marked `/* patched copy: proto.jsx:205–236 — '@' prefix dropped (rule 4); safety collapsed; shared=soon */`):

```json
{ "id": "profile-screen", "width": 300, "height": 560, "pad": 0 },
{ "id": "own-profile-screen", "width": 300, "height": 560, "pad": 0 }
```

- `profile-screen`: proto ProfileScreen with a fixture name (`ada · keyring`, ini `AK`), **no `@`**, `safetyOpen=false` (collapsed — safety grid is Rung-4, out of parity), `sharedConversations` undefined (proto "soon" row). App cell feeds `ProfileScreen` the same fixture.
- `own-profile-screen`: proto OwnProfileScreen (`decima`, ini `me`), no inline edit, no extra sections. App cell feeds `OwnProfileScreen` the matching fixture; `nameEditSlot`/`extraSections`/`avatarInput` omitted.
- Patched-copy rules: replace `'@' + params.name` → `params.name`; the proto `toast(...)` handlers on pencil/camera become no-op stubs; safety expander rendered collapsed.
- All PASS ≤0.2% dark+light; full suite green.

- [ ] Purity guard passes. Gates (typecheck, check-tokens, check-ui-purity, vitest, `parity --only profile-screen,own-profile-screen`). Commit: `feat(screens): ProfileScreen + OwnProfileScreen presenters + parity`

---

### Task 3: Settings + Feedback + LinkDevice presenters + parity

**Files:** create `src/ui/screens/settings-types.ts`, `src/ui/screens/settings-screen.tsx`, `src/ui/screens/feedback-screen.tsx`, `src/ui/screens/link-device-screen.tsx`; export from index; parity files as in T2.

`settings-types.ts`:
```typescript
import type { ReactNode } from "react";
export interface SettingsAccountVM { name: string; initials: string; avatarSrc?: string; }
export interface SettingsToggleRow {
  key: string; label: string; sub?: string; on: boolean;
  onToggle: () => void; ariaLabel: string;
}
export interface SettingsDeviceRow {
  key: string; label: string; sub?: string; value?: string;
  forgetSlot?: ReactNode;              // Rung-4 app-only "forget" button (disabled for current)
}
export type ThemeName = "light" | "dark";
```

`settings-screen.tsx` — node-for-node proto:266–314 (section order: account → feedback → appearance → notifications → devices → sign-out):
```typescript
export function SettingsScreen(props: {
  account: SettingsAccountVM;
  onOpenProfile: () => void;           // MeRow → /profile/<me>
  onChangePassword: () => void;        // → /settings/change-password (Rung-3 route)
  onRecoveryCode: () => void;          // → /settings/recovery-code (Rung-3 route)
  onFeedback: () => void;              // → /settings/feedback
  // appearance — REAL setters (Unit 7 useTheme/useAccent; container persists)
  theme: ThemeName; onTheme: (t: ThemeName) => void;
  accent: string; accentKeys: string[]; onAccent: (a: string) => void;
  accentSolid: Record<string, string>; // hex per accent (pure presentational constant)
  // notifications — data-driven labels/flows (app rows differ from proto)
  notifications: SettingsToggleRow[];
  notifErrorSlot?: ReactNode;          // Rung-4: browser-permission error line
  // devices — real rows + app-only forget buttons
  devices: SettingsDeviceRow[];
  onLinkDevice: () => void;            // → /pair?role=initiator
  devicesNote?: ReactNode;             // Rung-4: NOX-10 soft-revoke caveat
  // sign out
  onSignOut: () => void;
  // chrome — mobile only (desktop uses the persistent sidebar)
  onBack?: () => void;
  ...testid carries (see below)
}): JSX.Element;
```
Composition per proto:266–314: optional `PHeader title="settings" onBack` (rendered only when `onBack` set — mobile); `Body pad={14}` → column gap 16 →
- **account**: `PSectionLabel account` + `PCard` [ MeRow = `PRow label={account.name} sub="view your profile" right={<HAv size={34}>} onClick={onOpenProfile}` (carry `settings-me-row`, avatar `settings-me-avatar`); `PRow icon="key" label="change password" onClick` (`change-password-btn`); `PRow icon="shield" label="recovery code" last onClick` (`view-recovery-code-btn`) ].
- **feedback**: `PCard` [ `PRow icon="message" iconClassName="text-arcan-accent" label="give feedback" sub="report a bug or share an idea" last onClick` ] (`feedback-row`).
- **appearance**: `PSectionLabel appearance` + `PCard` [ theme row (moon/sun icon + "theme" label + segmented `light|dark` pill toggle — cluster; carry `appearance-theme-toggle`, `theme-light`/`theme-dark`); accent row (sparkle icon + "accent color" + value `text-arcan-accent` + swatch grid — cluster; carry `appearance-accent-picker`, `accent-<k>`, `accent-check-<k>`; contrast check color inline via the moved `lum`/`accentCheckColor`) ].
- **notifications**: `PSectionLabel notifications` + `PCard` mapping `props.notifications` → `PRow label sub right={<PToggle on onClick aria-label>}` + `notifErrorSlot`.
- **devices**: `PSectionLabel devices` + `PCard` mapping `props.devices` → `PRow icon="device" label sub value right={forgetSlot}` then `PRow icon="plus" label="link a device" last onClick={onLinkDevice}` (`link-device-row`) + `devicesNote`.
- **sign-out**: `PCard` [ `PRow icon="logout" label="sign out" danger last onClick` ] (`sign-out-btn`).

`feedback-screen.tsx` — node-for-node proto:487–531 (pure; container owns files/submit state):
```typescript
export function FeedbackScreen(props: {
  onBack: () => void;
  message: string; onMessage: (v: string) => void;      // <textarea> (element pure, state in container)
  category: string | null; categories: [string, string][]; onCategory: (k: string) => void;
  attachmentSlot?: ReactNode;          // Rung-4: dropzone / file chips (container owns files)
  email: string; onEmail: (v: string) => void;          // <input> optional
  canSubmit: boolean; submitting: boolean; onSubmit: () => void;
  ...testid carries: feedback-back, feedback-message, feedback-category, feedback-category-<k>,
  feedback-email, feedback-submit
}): JSX.Element;
```
Composition proto:488–530: `PHeader title="give feedback" onBack`; `Body pad={16}` → maxWidth 520 column gap 16 → intro paragraph → "your feedback" caps label + textarea (cluster) → "category · optional" caps label + wrap of category chips (cluster) → "attachment · optional" caps label + `attachmentSlot` (Rung-4) → email `PField`-style label + `<input>` → `PButton primary full icon="send" label="submit feedback"` (opacity via `canSubmit`; label `submitting ? "sending…" : "submit feedback"`).

`link-device-screen.tsx` — node-for-node proto:462–475:
```typescript
export function LinkDeviceScreen(props: {
  onBack: () => void;
  linkUrl: string;                     // "arcan.app/link#…"
  onCopy: () => void;
  qrSlot?: ReactNode;                  // Rung-4: real <QRDisplay>; parity uses <PQR size={150}>
  waitingLabel?: string;               // default "waiting for your other device…"
}): JSX.Element;
```
Composition proto:463–475: `PHeader title="link a device" onBack`; `Body pad={'24px 20px'}` → centered column → description → `PQR size={150}` (or `qrSlot`) → URL+copy pill (`flex items-stretch border rounded-r-4 overflow-hidden`) → waiting row (pulsing dot + label). **Port the `.hf-typing-dot` keyframe** as a token-driven `animate-*` (add a `waiting-pulse` keyframe to `tailwind.config.ts` if not present) — this is a *loading* affordance, NOT the dropped typing indicator (rule 3 does not apply). Dot: `w-[7px] h-[7px] rounded-pill bg-arcan-accent-fill animate-<pulse>`.

**LinkDevice wiring is deferred to Wave D.** The presenter + parity land here (Rung-1 coverage); the live initiator view (`/pair?role=initiator`, `PairRoute`) is a pairing surface handled in Wave D. The settings "link a device" row still navigates to `/pair?role=initiator` (target unchanged). Note in the manifest.

**Parity cells** (proto-local patched copies in `proto-cells.jsx`):

```json
{ "id": "settings-screen", "width": 300, "height": 640, "pad": 0, "accents": ["tokyo", "rose"] },
{ "id": "feedback-screen", "width": 300, "height": 640, "pad": 0 },
{ "id": "link-device-screen", "width": 300, "height": 560, "pad": 0 }
```

- `settings-screen`: proto SettingsScreen with fixed `theme`/`accent` matching the harness cell (accents `tokyo`,`rose` exercise the swatch selected-ring + segmented active). Proto's `MEMBERS`/`ACCENT_KEYS`/`ACCENTS`/`window.lum` are already on `window` via `hf-kit` (verified) — `ACCENT_KEYS`/`ACCENTS`/`lum` exposed; the patched copy stubs `toast`/`nav`, uses the cell's theme/accent as fixed `theme`/`accent` and no-op `setTheme`/`setAccent`. App cell feeds `SettingsScreen` a fixture whose **notifications** = proto's two rows (`new messages` / `mentions only`) and **devices** = proto's two rows (`this device · macbook` value `active now` / `link a device`) so pixels match; `notifErrorSlot`/`forgetSlot`/`devicesNote` omitted (Rung-4). `accentSolid` = the six hexes (from `appearance-section.tsx`' `ACCENT_SWATCH`, moved to a pure constant).
- `feedback-screen`: proto FeedbackScreen empty state (`attached=false` dropzone; `text=''`, `cat=null`). App cell: `attachmentSlot` = the proto-matching dropzone element (pure fixture), `canSubmit=false`, `submitting=false`.
- `link-device-screen`: proto LinkDeviceScreen; app cell uses `<PQR size={150}>` for `qrSlot` (real QR is Rung-4 out of parity). The waiting pulse animation is disabled in parity (static frame — pixelmatch on a mid-animation frame is nondeterministic; render the dot in its rest state).
- Patched-copy rules: stub all `toast`/`nav`; fixed theme/accent from the cell; QR = `PQR`; pulse animation frozen.
- All PASS ≤0.2% dark+light.

- [ ] Purity guard passes. Gates (typecheck, check-tokens, check-ui-purity, vitest, `parity --only settings-screen,feedback-screen,link-device-screen`). Commit: `feat(screens): Settings + Feedback + LinkDevice presenters + parity`

---

### Task 4: ConvoSettings + NewConvo + AddPeople + AddContact presenters + parity

**Files:** create `src/ui/screens/picker-types.ts`, `src/ui/screens/convo-settings-screen.tsx`, `src/ui/screens/new-convo-screen.tsx`, `src/ui/screens/add-people-screen.tsx`, `src/ui/screens/add-contact-screen.tsx`; export from index; parity files.

`picker-types.ts`:
```typescript
import type { ReactNode } from "react";
export interface PickItem { id: string; name: string; initials: string; avatarSrc?: string; }
export interface ConvoMemberVM {
  accountID: string; name: string; initials: string; avatarSrc?: string;
  role: "admin" | "writer"; you?: boolean;
}
```

`convo-settings-screen.tsx` — node-for-node proto:331–353:
```typescript
export function ConvoSettingsScreen(props: {
  onBack?: () => void;                 // mobile only ("back-btn")
  title: string;                       // group name, plain
  initials: string; avatarSlot?: ReactNode; // Rung-4: <ConversationAvatar>; parity = bespoke group avatar
  sub: string;                         // e.g. "5 members" (proto shows "5 members · created …" — fixture only)
  onEditAvatar?: () => void;           // camera badge (admin)
  onEditTitle?: () => void;            // pencil (admin)
  titleEditSlot?: ReactNode;           // Rung-4: inline title <input> + save/cancel
  admins: ConvoMemberVM[]; writers: ConvoMemberVM[];
  iAmAdmin: boolean;
  onAddPeople: () => void;             // "add people" pill
  renderMemberEnd?: (m: ConvoMemberVM) => ReactNode; // Rung-4: kebab menu + actions
  onOpenMember?: (accountID: string) => void;        // avatar/name → profile
  onLeave: () => void;                 // danger "leave conversation"
  ...testid carries (see below)
}): JSX.Element;
```
Composition proto:332–351: optional `PHeader title="conversation settings" onBack` (mobile; carry `back-btn`); `Body` (no pad) → group card (`flex-col items-center gap-[9px] px-[18px] pt-6 pb-[18px] border-b border-hairline`): bespoke 70px group avatar (cluster — `avatarSlot` when supplied, else initials via `bg-avatar-group text-avatar-group-fg rounded-[16px]` + inline fontSize 22) with camera badge; title button + pencil (or `titleEditSlot`); sub `// {sub}` `text-ui-value text-dim` (carry `members-count` on the count text). Member region (`px-3 py-2`): "// admins" caps + "add people" pill (`add-member-btn`), `admins.map(memRow)` (carry `members-section-admins`), "// members" caps, `writers.map(memRow)` (`members-section-writers`); each `memRow` (proto:322–329) = `member-row-<id>` with avatar+name (→ `onOpenMember`, `member-profile-link-<id>`/`member-avatar-<id>`), role badge (cluster), `renderMemberEnd(m)` (kebab, Rung-4). Then danger `PButton danger full label="leave conversation"` (`leave-conversation-btn`).

**Group-avatar bespoke note:** the convoset 70px avatar (and new-convo 42px placeholder) use radius `s.radius+4`=16 / `s.radius+2`=14 and a hand-set fontSize — NOT the standard `HAv` (radius 10, fontSize=0.34·size). Port them as bespoke elements per the cluster row (radius/size are structural literals, allowed by check-tokens). Do **not** shoehorn `HAv`.

`new-convo-screen.tsx` — node-for-node proto:368–394:
```typescript
export function NewConvoScreen(props: {
  onBack: () => void;                  // "new-convo-back"
  contacts: PickItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  groupNameSlot?: ReactNode;           // Rung-4: real <input> when isGroup (bound in container)
  emptySlot?: ReactNode;               // Rung-4: "no contacts yet" (container; carry new-convo-empty)
  errorSlot?: ReactNode;               // Rung-4: create error (new-convo-error)
  submitLabel: string; submitDisabled: boolean; onSubmit: () => void; // new-convo-submit
  ...testid carries: new-convo-contact-<id>
}): JSX.Element;
```
Composition proto:369–393: `PHeader title="new conversation" onBack` (carry `new-convo-back` on back). When `selected.size >= 2` render the group-name row (bespoke 42px "?" avatar + `groupNameSlot`). Then the "// contacts" caps + "one · two+ = group" hint row. `Body` → contacts as **pick-rows** (cluster; each `new-convo-contact-<id>`, `aria-pressed`, checkbox). Footer (`shrink-0 p-3 border-t bg-bg`) → `errorSlot` + `PButton primary full label={submitLabel}` opacity via `submitDisabled`.

`add-people-screen.tsx` — node-for-node proto:439–455:
```typescript
export function AddPeopleScreen(props: {
  onBack: () => void; groupName: string; // header sub "to {groupName}"
  pool: PickItem[]; selected: Set<string>; onToggle: (id: string) => void;
  onAdd: () => void; addDisabled: boolean; // "add N people"
}): JSX.Element;
```
Composition proto:440–453: `PHeader title="add people" sub={<span>to {groupName}</span>} onBack`; `Body` → `PSectionLabel contacts not in this group` + pick-rows (cluster); footer → `PButton primary full label={`add ${n} ${n===1?'person':'people'}`}`.

**AddPeople wiring is NOT adopted in Wave C.** `members.tsx` keeps the `ContactPicker` overlay (recorded 9-6 decision: a contextual multi-select interrupt stays an overlay; the full-screen AddPeople treatment would duplicate the contact-book deep-load + member-exclusion the picker already does). The presenter + parity are built for **coverage completeness** (Rung-1 screen; parity-locked, like DesktopWindow/MobileTabBar are built-but-unmounted). Flag in the manifest.

`add-contact-screen.tsx` — node-for-node proto:401–429 (`proto.jsx` wins over `hf-extra.jsx`):
```typescript
export function AddContactScreen(props: {
  onBack: () => void;
  idShort: string;                     // "co_z1a8…4f2"
  qrSlot?: ReactNode;                  // Rung-4: real <QRDisplay>; parity = <PQR size={128}>
  ttl: string; ttlOptions: string[]; onTtl: (t: string) => void; // link-valid-for segmented
  primaryLabel: string; onPrimary: () => void;   // adaptive share/copy → carry add-contact-share-btn
  onScan: () => void;                  // "scan their code" → carry scan-their-code
  onPaste: () => void;                 // "or paste a link" → carry add-contact-cancel-btn
  hiddenUrlSlot?: ReactNode;           // Rung-4: sr-only qr-url-text / copy-url-text (e2e hooks)
  ...testid carries: add-contact-waiting (card), ttl-picker, ttl-<t>
}): JSX.Element;
```
Composition proto:402–427: `PHeader title="add contact" onBack`; `Body pad={'22px 20px'}` → centered column → heading (`text-ui-heading`) + sub → `PCard` (carry `add-contact-waiting`): "// your code" caps + `PQR size={128}` (or `qrSlot`) + `idShort` + copy/share buttons + `hiddenUrlSlot` + "link valid for" segmented (cluster; `ttl-picker`/`ttl-<t>`) → labeled divider "add someone" (cluster) → `PButton primary full icon="search" label="scan their code"` (`scan-their-code`) → "or paste a link" ghost (`add-contact-cancel-btn`).

> Proto AddContact renders **two** buttons (`copy link` + `share`); the app collapsed these to **one adaptive** action (Unit 9-7 §2-J: `navigator.share` present → "share invite", else "copy link", `add-contact-share-btn`). Data-driven deviation — the presenter takes a single `primaryLabel`/`onPrimary`. The parity proto-local copy is patched to render the single adaptive button (`/* patched copy: two-button copy/share → one adaptive action per 9-7 §2-J */`) so parity compares against the shipped IA, not the proto's two-button row. Flag in manifest.

**Parity cells** (proto-local patched copies in `proto-cells.jsx`; a local `MEMBERS` fixture is defined for the ConvoSettings copy since it is proto-module-local, not on `window`):

```json
{ "id": "convo-settings-screen", "width": 300, "height": 640, "pad": 0, "accents": ["tokyo", "rose"] },
{ "id": "new-convo-screen", "width": 300, "height": 560, "pad": 0, "accents": ["tokyo", "rose"] },
{ "id": "add-people-screen", "width": 300, "height": 560, "pad": 0, "accents": ["tokyo", "rose"] },
{ "id": "add-contact-screen", "width": 300, "height": 640, "pad": 0 }
```

- `convo-settings-screen`: proto ConvoSettings with `MEMBERS` fixture; sub fixture = proto's `"5 members · created 2026-04-18"` (app live passes `"N members"` — deviation, presenter-agnostic). `renderMemberEnd` omitted in the app cell (kebab is Rung-4); the proto-local copy keeps its `dots` button but **stubs** its handler — verify the kebab renders identically or drop it in BOTH (match). accents exercise the admin role badge (`accent-soft`).
- `new-convo-screen`: proto NewConvo with `HF_CONTACTS` fixture, `sel=['AK','RA']` (isGroup → group-name row shown; `groupNameSlot` = proto's placeholder pill fixture). accents exercise selected `accent-soft` pick rows.
- `add-people-screen`: proto AddPeople with the proto `pool` fixture, `sel=[0,1]`, groupName `"retrieval-squad"`.
- `add-contact-screen`: proto AddContact; app cell `qrSlot=<PQR size={128}>`, single adaptive primary button (patched proto copy matches), `hiddenUrlSlot` omitted (sr-only, no pixels).
- Patched-copy rules: stub `toast`/`nav`; QR = `PQR`; single adaptive add-contact button; local `MEMBERS`/`pool` fixtures; group avatars bespoke (radius 16/14).
- All PASS ≤0.2% dark+light.

- [ ] Purity guard passes. Gates (typecheck, check-tokens, check-ui-purity, vitest, `parity --only convo-settings-screen,new-convo-screen,add-people-screen,add-contact-screen`). Commit: `feat(screens): ConvoSettings + NewConvo + AddPeople + AddContact presenters + parity`

---

### Task 5: Container integration — routes render the presenters

**Files:** modify `src/routes/settings/index.tsx` (+ fold `account-section`/`appearance-section`/`notifications-section`/`devices-section`/`feedback-section`/`sign-out-card` logic into the container), `src/routes/settings/feedback-route.tsx`, `src/routes/conversations/members.tsx`, `src/components/profile-view.tsx`, `src/routes/contacts/detail.tsx`, `src/routes/contacts/add.tsx`, `src/routes/conversations/new.tsx`, `src/hooks/use-shared-groups.ts` (followup b); retarget unit tests. **All data logic is MOVED, not rewritten** — effects, resolves, handlers, and flows keep their exact behavior; only the render tree swaps to presenters.

- [ ] **Settings** (`settings/index.tsx`): `SettingsBody` becomes a container that renders `<SettingsScreen>`. Move in verbatim: `AccountSection`' MeRow/change-password/recovery-code (the safety-number expandable is **dropped from settings** — it lives on the profile per proto; flag to controller, see self-review), `AppearanceSection`' `useTheme`/`useAccent` + `apply` persist to `me.root.settings.appearance` + `lum`/`accentCheckColor`/`ACCENT_SWATCH` (→ `accentSolid` pure constant), `NotificationsSection`' full permission flow (sound + browser, `Notification.requestPermission`, `browserEffective`, `browser-error`) → `notifications` VM + `notifErrorSlot`, `DevicesSection`' devices resolve + soft-revoke `handleRevoke` + `getCurrentSessionFingerprint` → `devices` VM + `forgetSlot` (kit-styled button) + `devicesNote`, `FeedbackRow` → the feedback `PRow`, `SignOutCard`' `handleSignOut` → `onSignOut`. Mobile: pass `onBack` (via `useIsDesktop()`); desktop: omit (sidebar persists). Carry ALL testids: `settings-body` (root), `settings-me-row`/`settings-me-avatar`, `change-password-btn`, `view-recovery-code-btn`, `appearance-theme-toggle`/`theme-light`/`theme-dark`, `appearance-accent-picker`/`accent-<k>`/`accent-check-<k>`, notification toggles' aria-labels + `browser-error`, `devices-card`/`device-row-<idx>`/`revoke-device-btn-<idx>`, `link-device-row`, `feedback-row`, `sign-out-btn`. The `SettingsRoute` dispatcher + the two Rung-3 sub-routes (`change-password`, `recovery-code`) are **untouched** (nav targets preserved). Route root: keep `flex-1 min-h-0 overflow-y-auto` (Body provides it).
- [ ] **`settings-kit.tsx` stops rendering.** After the section files fold into the container, they no longer import `settings-kit`. Delete the now-dead section files' bodies **only if** they become unreferenced — otherwise leave `settings-kit.tsx` in place (Phase 4 cleanup) but with **zero importers in `src/`**. Confirm via `grep -rl settings-kit src/` → empty. (`tests/unit/routes/settings/settings-kit.test.tsx` retargets or is removed in this task.)
- [ ] **Feedback** (`feedback-route.tsx`): render `<FeedbackScreen>`. Move in verbatim: `message`/`category`/`files`/`email`/`submitting` state, `MAX_TOTAL_BYTES` cap, multipart POST to `/api/feedback`, success/error toasts + navigate. `attachmentSlot` = the existing dropzone + file-chip list (restyled via the T1 clusters). Carry `feedback-back`, `feedback-message`, `feedback-category`/`feedback-category-<k>`, `feedback-file-input`/`feedback-file-remove-<i>`, `feedback-email`, `feedback-submit`. (Category keys stay `bug/idea/question/note` — app set, not proto's `praise`.)
- [ ] **ConvoSettings** (`members.tsx`): render `<ConvoSettingsScreen>`. Move in verbatim: member derivation (`getDirectMembers`, role split, sort), 1:1 redirect (`participants.length === 2` → `/profile/<other>`), archived redirect, `iAmAdmin`, title edit (`titleEditSlot` = the inline input+save/cancel), icon upload (`avatarSlot` = `<ConversationAvatar>` + camera → `onEditAvatar`), `handleAddMembers`/`handlePromote`/`handleRemove`/`handleLeave`/`handleLeaveWithPromote`, `requestConnectionFromGroupMember`. `renderMemberEnd` = the kebab menu (promote/request-connection/remove) — Rung-4, restyled with kit tokens, all testids kept (`member-kebab-<id>`/`member-menu-<id>`/`promote-<id>`/`request-connection-<id>`/`remove-<id>`). `ContactPicker` + `LeaveWithPromoteDialog` overlays **retained** (portal overlays; AddPeople presenter NOT wired). Carry `members-route`, `back-btn`, `members-header-avatar`, `conversation-icon-input`/`conversation-icon-upload`, `group-title-*`, `members-count`, `add-member-btn`, `members-section-admins`/`-writers`, `member-*`, `leave-conversation-btn`. Route root → `flex-1 min-h-0` with `Body` scroll (apply the latent-clip fix flagged in the manifest).
- [ ] **Profile** (`profile-view.tsx`): branch on `isOwn` → `<OwnProfileScreen>` / `<ProfileScreen>`. **Drop `AuthSurface`** — profile becomes a pane-filling PHeader+Body screen (respects theme; `forceDark` removed). Flag to controller. Move in verbatim: avatar pick/change/remove, inline name edit (`nameEditSlot`), `handleMessage` (find/create 1:1), safety-number (`safetySlot` = `<SafetyNumber>`; expander collapsed by default), shared groups. **Own** `extraSections` = the app-only "your conversations" list + safety + remove-avatar + settings link (Rung-4). Carry every `profile-*` testid. **Followup (b):** the shared-conversations list must show 1:1 names — replace `useSharedGroups`' raw `conv.title ?? "Untitled"` with the `contactBook` counterpart derivation (port `detail.tsx:357–392`: for each shared group with exactly two direct admin/writer members, find the contact whose `contactAccountID` matches the other member → `displayNameLocal`; fall back to `conv.title`). Apply in `use-shared-groups.ts` (it already has `me.root.knownConversations`; add `contactBook: { $each: true }` to its resolve and the derivation). Add/adjust a unit test asserting a 1:1 shared group renders the contact name, not "Untitled".
- [ ] **Contact detail** (`contacts/detail.tsx`): this route has **no dedicated proto twin** (the proto's contact view *is* ProfileScreen). Render `<ProfileScreen>` (contact/other variant) — same shape (avatar/name/id/message/safety) — with the app-only "remove contact" as a Rung-4 danger `PButton` appended (keep `contact-remove-btn`/`start-chat-btn`/`contact-detail-name`/`contact-detail-loading`/`contact-detail-not-found`). It is keyed by `contactID` (contactBook entry), so `onMessage` = `handleStartChat`. Route root → `flex-1 min-h-0` (Body). Rung-4 (structural reuse of ProfileScreen).
- [ ] **Add contact** (`contacts/add.tsx`): render `<AddContactScreen>`. Move in verbatim: invitation creation (`createInvitation`, `TTL_PRESETS`, `withQrChannelMarker`, StrictMode guard), adaptive share/copy (`navigator.share`), scan nav (`/pair?role=responder`), paste prompt. `qrSlot` = `<QRDisplay url={withQrChannelMarker(inviteUrl)} size={128}>`; `hiddenUrlSlot` = the sr-only `qr-url-text`/`copy-url-text` spans. Carry `add-contact-waiting`, `ttl-picker`/`ttl-<t>` (**note:** TTL presets are `1h/24h/7d` in the app vs `1d/7d/30d/∞` in proto — data deviation; `ttlOptions` from the container), `add-contact-share-btn`, `scan-their-code`, `add-contact-cancel-btn`. Route root → `flex-1 min-h-0` (Body).
- [ ] **New conversation** (`conversations/new.tsx`): render `<NewConvoScreen>`. Move in verbatim: contact selection `Set`, `isGroup`, `groupName`, `findOrCreate1to1Conversation`/`createGroupConversation`, submit + error. `groupNameSlot` = the real `<input>` (bound), `emptySlot` = the "no contacts" block (`new-convo-empty`), `errorSlot` = `new-convo-error`. Carry `new-convo-back`, `new-convo-group-name`, `new-convo-contact-<accountID>`, `new-convo-submit`. Root already `flex-1 min-h-0`.
- [ ] Old section markup / `AuthSurface` profile wrapper / hand-rolled route bodies stop rendering (files that become unreferenced can have bodies removed; anything still imported elsewhere is untouched — Phase 4 owns final deletion).
- [ ] Unit tests: retarget `appearance-accent-check.test.tsx`, `feedback-row.test.tsx`, `settings-kit.test.tsx` (and any others rendering the folded sections) onto the presenters or the container; behavioral assertions stay.
- [ ] Gates: `npm run typecheck`, `npm run check-tokens`, `npm run check-ui-purity`, `npm run test`, FULL parity (`npm run parity`), `npm run build`.
- [ ] Commit: `feat(settings): route containers render Wave-C presenters; settings-kit retired from render`

---

### Task 6: Wave exit

- [ ] Full battery: `npm run typecheck`, `npm run check-tokens`, `npm run check-ui-purity`, `npm run test`, `npm run parity` (all cells), `npm run build`.
- [ ] Full chromium e2e run (`npm run test:e2e`). Baseline: 43 green + 1 fixme (`profile-avatar`). The specs exercising this wave's surfaces: `settings-controls`, `notification-permission`, `profile-avatar`, `group-create`/`group-member-management`/`group-roles`/`group-title-edit`, `contact-invitation`, `device-pairing`(+repeat), `account-creation`/`-persistence`. **Investigate every failure before classifying.** Fix trivial selector drift (≤ ~15 lines, helpers preferred); record structural failures in the manifest for Phase 4 — do NOT mask real regressions.
- [ ] Coverage-manifest rows (append a "Wave C coverage rows" table): ProfileScreen (contact), OwnProfileScreen, SettingsScreen, FeedbackScreen, LinkDeviceScreen, ConvoSettingsScreen, NewConvoScreen, AddPeopleScreen, AddContactScreen — each with route, rung, reference proto lines, parity status. Plus Rung-4 flags: shared-conversations real list + 1:1-name fix, safety-number slot, device forget buttons + NOX-10 note, notification permission flow/error, feedback attachments/submit, member kebab menu + overlays, group avatar bespoke, adaptive add-contact button, TTL preset deviation, "created date" sub omission. Plus manifest **notes**: LinkDevice presenter built but wired in Wave D; AddPeople presenter built but not wired (ContactPicker overlay retained); profile-view dropped AuthSurface (now theme-reactive); settings safety-number row dropped (lives on profile — controller confirm).
- [ ] Merge `--no-ff`: `Unit 10 Wave C: settings cluster (prototype kit)`.

---

## Self-review notes (controller attention)

- **Every one of the nine proto screens has a dedicated presenter + parity cell**, each naming its files, carried testids, and patched-copy rules: ProfileScreen (T2), OwnProfileScreen (T2), SettingsScreen (T3), FeedbackScreen (T3), LinkDeviceScreen (T3), ConvoSettingsScreen (T4), NewConvoScreen (T4), AddPeopleScreen (T4), AddContactScreen (T4).
- **Two presenters build without live wiring this wave** (coverage-complete, like the unmounted DesktopWindow/MobileTabBar): **LinkDevice** (initiator pairing is Wave D) and **AddPeople** (ContactPicker overlay retained per the 9-6 decision). Both flagged in the manifest. If the controller wants them wired now, that expands T5.
- **profile-view loses `AuthSurface`** and becomes a pane-filling screen (theme-reactive, drops `forceDark`). This is the correct transliteration (proto ProfileScreen is a full PHeader+Body screen) but is a visible IA change — confirm.
- **Settings account card drops the safety-number expandable** (proto puts safety verification on the profile, not in settings). Functionality is preserved on the profile. Flagged — confirm the drop rather than a silent removal.
- **Data-driven deviations kept, not "fixed" to proto:** real theme/accent setters (Unit 7), app notification labels + browser-permission flow, real device rows + soft-revoke forget buttons, feedback → Linear/`/api/feedback` flow, adaptive single add-contact button (9-7 §2-J), app TTL presets (`1h/24h/7d`), feedback categories (`bug/idea/question/note`). Each is a presenter prop, so the presenter stays proto-faithful while the container feeds real data; parity fixtures mirror proto where a value is cosmetic, and deviations are manifest rows.
- **Bespoke group avatars** (convoset 70 / new-convo 42) are ported as literal-metric elements, NOT `HAv` — their radius (16/14) and fontSize (22/14) differ from `HAv`'s formula. This is the one place the kit's avatar primitive is deliberately bypassed; noted in the mapping table.
- **T1 token surface is small and honest:** only two genuinely new font sizes (19/18px) and three caps-tracking values (.12/.1/.08em); everything else reuses existing `--fs-ui-*` tokens via weight + `leading-*` overrides. The `Body` string-pad widening is the only kit-shape change beyond the two pixel-neutral a11y additions. Stop-the-line still applies if the executing agent finds an unmapped literal.
- **Proto globals for parity:** `ACCENT_KEYS`/`ACCENTS`/`lum` are already on `window` (via `hf-kit`), so the Settings patched copy works; `MEMBERS` (ConvoSettings) and `pool` (AddPeople) are proto-module-local and must be defined as local fixtures in `proto-cells.jsx`.
