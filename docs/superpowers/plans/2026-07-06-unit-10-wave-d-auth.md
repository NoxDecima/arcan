# Unit 10 Phase 2 Wave D — Auth + Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the prototype's auth + flow surfaces become pure kit presenters fed by the existing container logic. In app terms: `/auth/login`, `/auth/recovery`, the `/onboarding` step machine (welcome / credentials / backup-display / backup-confirm / profile / restore), `/pair` (initiator + responder + approve), and `/invite` (all phases) swap their hand-rolled markup for node-for-node ports of the design references, with all data logic **moved** (not rewritten) into the container half. Welcome + SignIn are **Rung 1** (`design/proto.jsx:537-566` + kit `AuthShell`). Credentials, backup-display, backup-confirm, profile, restore, ApproveDevice, and ContactRequest (`/invite` accept) are **Rung 2** (`design/hf-flows.jsx` hi-fi stills). The `/auth/recovery` reset flow, the invite non-confirm phases, the responder pairing states, and the trusted-device overlay are **Rung 4** (kit inference — restyled, no proto twin).

**Method:** identical to Waves A/B/C. Pure presenters in `src/ui/screens/` (props in, JSX out; no Jazz/router — enforced by `scripts/check-ui-purity.sh`), parity-gated against **patched proto-local copies**; container logic MOVED not rewritten; testids carried verbatim; sanctioned deviations only (spec §8). Read the Ground rules of `docs/superpowers/plans/2026-07-04-unit-10-wave-a-home.md`, `…-wave-b-chat.md`, and `…-wave-c-settings.md` — **they all apply and are not repeated here**. This wave inherits every binding rule from A/B/C.

**Binding inherited rules (do not relitigate):**
1. **Route roots fill their box, never the viewport.** Auth routes render OUTSIDE AppShell (no bounded-height parent — confirmed in `src/App.tsx`: `/onboarding`, `/auth/login`, `/auth/recovery`, `/pair`, `/invite` mount directly). **NEW WAVE-D RULE (from Wave C exit review):** each wired auth route container wraps the presenter in an `h-screen w-screen flex flex-col` scaffold; the presenter root is `flex-1 min-h-0 flex flex-col` (the kit `AuthShell` / `AuthSurface` supply this). `tall` surfaces own their scroll (`overflow-y-auto`).
2. **No DesktopWindow / window-on-stage** (USER DECISION 2026-07-05). Auth surfaces are full-bleed; they never rendered inside a window and don't now.
3. **No presence / typing / verified / delivery visuals** (NOX-31/32/33). The pairing "waiting for your other device…" pulsing dot is a *loading* affordance (kept — same ruling as Wave C LinkDevice), NOT a typing indicator.
4. **No `@` title prefixes**, **lowercase-terse copy** (walkthrough 2026-07-05). All auth/flow display names render plain.
5. **testids carried verbatim** onto kit-rendered markup via sanctioned optional testid props (spec §8c). Auth flows are the most-e2e-tested surfaces in the app — every testid below is load-bearing.
6. **a11y additions sanctioned** (spec §8b) — aria/role/sr-only/focus-visible; pixel-neutral. Auth inputs keep `focus:border-arcan-accent`.
7. **Real-data states the proto doesn't show** (loading/error/empty/multi-phase) are built from the kit, flagged Rung-4, logged in the coverage manifest, and kept OUT of parity fixtures (parity cells render the proto placeholder state).

**Prototype sources:**
- **Rung 1** — `design/proto.jsx`: `WelcomeScreen` (537–548), `SignInScreen` (550–565), `AuthShell` (567–579).
- **Rung 2** — `design/hf-flows.jsx` (read COMPLETELY): local helpers `AuthSurface` (12–29), `Steps` (31–34), `Title` (35–37), `Sub` (38–40), `Field` (41–51), `Btn` (52–60), `MuteLink` (61–63), `Wordmark` (7–9), `QRBox` (183–191); screens `ScCredentials` (92–105), `ScRecovery` (106–126 = onboarding **backup-display**), `ScConfirm` (127–140 = **backup-confirm**), `ScProfile` (141–159 = **profile-setup**), `ScRestore` (160–180), `ScApproveDevice` (209–228), `ScContactRequest` (229–257). `ScLinkDevice` (193–208) is superseded by the Wave-C `LinkDeviceScreen` presenter (proto wins — see T5). `ScWelcome`/`ScSignIn` are superseded by their proto Rung-1 twins.
- **hf-flows reachability (verified):** its tail `Object.assign(window, {…})` exports `HiWelcome…HiContactRequest, AuthSurface, Wordmark, AuthField(=Field), AuthBtn(=Btn), AuthTitle(=Title), AuthSub(=Sub), QRBox`. The `Sc*` screens **and `Steps` + `MuteLink` are file-local (NOT on window)**. The `Hi*` wrappers render both HiDesktop+HiPhone frames in a HiStage — unusable in a fixed-size parity cell. Consequence for T3/T4 parity: **add `design/hf-flows.jsx` to `build-proto.mjs`'s transform list** (exposes the helpers on `window`) AND **verbatim-copy `Steps`, `MuteLink`, and each needed `Sc*` screen into `proto-cells.jsx`** with patched-copy labels.

**Law:** `docs/superpowers/specs/2026-07-03-unit-10-style-token-map.md`. Every inline style maps through it; an unmapped style is a **stop-the-line** event (extend the table + tokens, never approximate). Rem base is fixed 16px on `html`. **Verified radius fact:** `--r-4 = 12px = v5 s.radius`; the hf `Field`/`Btn`/warn-callout radius is `s.radius` → `rounded-r-4`. The current app auth inputs use `rounded-r-3` (6px) — a latent deviation this wave **corrects to `rounded-r-4`**.

**Branch:** `unit-10/wave-d-auth` off current `main`; merges `--no-ff`. Verify base is current `main` before starting (`git reset --hard main` if stale). Plan-writing agents write files only, never touch git.

**Environment:** run every command inside `nix-shell` (Node 22 + Playwright browsers). Exact gate commands: `npm run typecheck` (= `tsc -b`; NOT `tsc --noEmit`), `npm run check-tokens`, `npm run check-ui-purity`, `npm run test` (vitest, `tests/unit/` only), `npm run parity -- --only <cells>` (or bare `npm run parity`), `npm run test:e2e` (Playwright chromium), `npm run build`.

**Container-integration scope (T6):** `src/routes/auth/login.tsx`, `src/routes/auth/recovery.tsx`, `src/routes/onboarding/*` (index + all six step files), `src/routes/pair/*` (index + initiator-step + responder-step), `src/routes/invite/index.tsx`, `src/components/trusted-device-prompt.tsx` (overlay restyle), `src/components/device-approval-card.tsx` (overlay card restyle). `src/components/auth-surface.tsx` (`AuthSurface`/`Wordmark`/`Steps`/`AuthTitle`/`AuthSub`) **stops rendering** for these routes (its consumers move to the kit); the file stays until Phase 4 but must reach **zero importers in `src/`**. `src/components/passphrase-grid.tsx` is **restyled in place** (to hf metrics) — kept (shared with the Rung-3 recovery-code modal), testids + logic preserved.

**Cross-rung decisions folded in (see Self-review — controller must confirm):**
- **(A) Auth buttons unify on kit `PButton` (h-44).** proto-ui `PButton` (h-44) is canonical over hf-flows' local `Btn` (h-40/gap-7/12.5px). All auth buttons (Rung 1 + Rung 2) use `PButton`; Rung-2 proto-local copies patch hf `Btn` → a `PButton`-equivalent local helper so parity compares against the shipped button. Removes the h-44/h-40 jump between Welcome and the following steps. **No `AuthBtn` primitive is built.**
- **(B) Auth surfaces become theme-reactive** — `forceDark` is dropped from the auth routes (matches Wave C's profile-view). Presenters are theme-reactive by construction (token-only); parity must pass dark **and** light. The container decision to stop pinning `data-theme="dark"` is a T6 flag.

---

### Task 1: Auth kit + token gaps

**Files:** create `src/ui/kit/auth-surface.tsx` (the 4-star surface), `src/ui/kit/auth-parts.tsx` (`Steps`, `AuthTitle`, `AuthSub`, `MuteLink`, `AuthField`); export from `src/ui/kit/index.ts`; edit `src/styles/tokens.css`, `tailwind.config.ts`, and the mapping table (`…unit-10-style-token-map.md`). Restyle `src/components/passphrase-grid.tsx`.

The kit already has `AuthShell` (proto 2-dot, `flex-1 min-h-0`), `ArcanMark`, `PButton`, `PQR`, `PHeader`, `Body`, `Icon`. The gaps below are the complete set surveyed against `hf-flows.jsx` helpers + the Rung-2 screens; the executing agent re-verifies each and adds any it missed (**stop-the-line** rule).

**Kit primitives (ports of hf-flows helpers):**

- [ ] **`AuthSurface`** (`auth-surface.tsx`) — port of `hf-flows.jsx:12–29` (the 4-star cosmic surface; the reference impl is the legacy `src/components/auth-surface.tsx`, ported pure + tokenized). Distinct from `AuthShell` (proto 2-dot). Signature:
  ```typescript
  export function AuthSurface({ w = 320, tall = false, children }: {
    w?: number; tall?: boolean; children: ReactNode;
  }): JSX.Element;
  ```
  Composition: root `flex-1 min-h-0 relative flex justify-center bg-bg` + `items-start overflow-y-auto` when `tall` else `items-center overflow-hidden`. Watermark: reuse the `AuthShell` pattern — `latticePaths.full("currentColor")` via `dangerouslySetInnerHTML` on an `svg` `absolute text-text select-none pointer-events-none` sized `360×360` at `style={{ right: -84, bottom: -96, opacity: "var(--opacity-watermark)" }}` (hf uses 360 / -84 / -96; AuthShell uses 320 / -74 / -86). Four stars (`hf-flows:22–25`): `bg-arcan-accent-fill shadow-dot` @ 4px (22%,20%); `bg-cosmic-dot shadow-dot` @ 3px (72%,26%); `bg-cosmic-dot-2 shadow-dot` @ 3px (30%,74%); `bg-arcan-accent-fill` @ 2px no-glow (80%,66%). Content column: `relative flex flex-col` + `style={{ width: w, maxWidth: "88%", gap: tall ? 11 : 15, padding: tall ? "20px 18px" : 18 }}`. (Star positions / watermark offsets / column width+gap+padding are structural inline literals — allowed, per `auth-shell.tsx` precedent.)
- [ ] **`Steps`** (`auth-parts.tsx`) — port of `hf-flows.jsx:31–34`. `{ n, of = 4 }` → `flex justify-center gap-[5px] mb-0.5`, then `of` dashes `h-1 w-[22px] rounded-r-1`, `bg-arcan-accent` when `i < n` else `bg-panel-2`, each `aria-hidden`.
- [ ] **`AuthTitle`** (`auth-parts.tsx`) — port of `hf-flows.jsx:35–37` (`700 19px/1.25 mono, -.01em`). `text-center text-text font-mono font-bold text-ui-name leading-tight tracking-[-0.01em]`. (`leading-tight` = 1.25; `text-ui-name` = 19px. The proto SignIn inline title is `/1.2` — the 0.05 delta is 0px on a single line; SignIn reuses `AuthTitle`.)
- [ ] **`AuthSub`** (`auth-parts.tsx`) — port of `hf-flows.jsx:38–40` (`400 11.5px/1.5 body, marginTop:-8`). `text-center text-text-2 -mt-2 font-body text-ui-empty-sub leading-normal`.
- [ ] **`MuteLink`** (`auth-parts.tsx`) — port of `hf-flows.jsx:61–63` (`400 10.5px/1 body`). `{ accent?, children }` → `<span>` `font-body text-ui-sub leading-none` + `text-arcan-accent` when `accent` else `text-dim`. Interactive wrapping (`<button className={tapClass}>`) is the presenter's job.
- [ ] **`AuthField`** (`auth-parts.tsx`) — the **interactive** field (hf `Field` is display-only; the app needs real inputs). Signature:
  ```typescript
  export function AuthField(props: {
    label?: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: "text" | "email" | "password";
    mono?: boolean;                 // mono input font (recovery/word inputs)
    as?: "input" | "textarea";      // default "input"
    rows?: number;                  // textarea only
    autoComplete?: string;
    autoFocus?: boolean;
    required?: boolean;
    minLength?: number;
    spellCheck?: boolean;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    id?: string;
    inputTestId?: string;
  }): JSX.Element;
  ```
  Composition: `<label className="flex flex-col gap-1.5">` → label span (`font-mono font-semibold text-ui-caps tracking-caps-sm uppercase text-dim`, `hf-flows:45`) → input **`h-[38px] rounded-r-4 border border-hairline bg-panel px-3 text-ui-toast leading-none text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent`** + `font-mono`/`font-body` per `mono`. Textarea variant: `w-full rounded-r-4 border border-hairline bg-panel px-3 py-2 font-mono text-ui-toast text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent`. **Parity note:** the empty input renders its placeholder (dim, 12px) in a 38px bordered box, matching hf `Field`'s placeholder span — same class of AA residual as the composer-input intent-fix (Wave B); characterize a per-cell `maxDiffRatio` override only if the diff exceeds 0.2%. Preflight already resets input `margin/padding`.

**Passphrase-grid restyle (`src/components/passphrase-grid.tsx`):**

- [ ] Restyle to `hf-flows.jsx:119–120` (ScRecovery grid) metrics: **3-column** (drop `compact`-default divergence — onboarding uses 3-col to match hf; the `compact` prop stays for the Rung-3 modal, now aliasing the same 3-col), container `rounded-[14px] border border-hairline bg-panel p-[13px] grid grid-cols-3 gap-x-[10px] gap-y-1.5`; word `font-mono font-medium text-ui-sub leading-[1.3] text-text` (10.5px), index `font-mono font-medium text-ui-caps leading-[1.3] text-dim w-[13px]` (9px). Keep `passphrase-grid` + `passphrase-word-{i}` testids + `words.split` logic verbatim.
- [ ] Restyle the `withCopyButton` branch: render a **full-width `PButton`** (`label="copy code" icon="copy"`, non-primary outline) instead of the shadcn `Button`, matching hf's separate copy `Btn` (`hf-flows:122`). Keep `passphrase-copy-btn` testid + the `handleCopy`/copy-state logic (`Copied`/`Copy failed`). (This drops the `@/components/ui/button` import from this file.)

**New tokens** (`tokens.css` + `tailwind.config.ts`):

- [ ] `--color-cosmic-dot-2: #7dcfff` (both themes; the third scattered star, `hf-flows:24`) → tailwind color `cosmic-dot-2`.
- [ ] Warn-callout palette (`ScRecovery`, `hf-flows:108–110` — the app currently mis-uses `amber/*` for both themes; light theme needs the hf values):
  - dark: `--color-warn-bg: rgba(224,175,104,.12)`, `--color-warn-border: rgba(224,175,104,.4)`, `--color-warn-text: #e0af68`, `--color-warn-icon: #e0af68`.
  - light: `--color-warn-bg: #fcf3e0`, `--color-warn-border: #eccf94`, `--color-warn-text: #8a5a0a`, `--color-warn-icon: #c2871a`.
  - tailwind: `backgroundColor.warn`, `borderColor.warn`, `textColor.warn`, `textColor['warn-icon']`.
- [ ] `--fs-ui-req: 17px` (ContactRequest name `700 17px/1.2`, `hf-flows:238`) → tailwind fontSize `'ui-req': ['var(--fs-ui-req)', { lineHeight: 'var(--lh-ui)' }]`. (Confirm no existing 17px token first.)
- [ ] Confirm `--fs-ui-chatsub: 10px` exists (Wave B/C — ContactRequest id line `400 10px/1`, `hf-flows:240`); if absent, add `--fs-ui-chatsub: 10px` → `text-ui-chatsub`.

**Mapping-table additions** (append to the "Type ramp" and "Recurring clusters" sections; copy verbatim in T2–T5):

```markdown
| `700 19px/1.25` mono `-.01em` (AuthTitle) | `font-mono font-bold text-ui-name leading-tight tracking-[-0.01em]` |
| `700 17px/1.2` mono `-.01em` (ContactRequest name) | `font-mono font-bold text-ui-req tracking-[-0.01em]` |
| `600 9px/1` mono `.14em` (AuthField label) | `font-mono font-semibold text-ui-caps tracking-caps-sm uppercase text-dim` |
| `400 12px/1` mono\|body (AuthField placeholder/value) | `font-mono\|font-body text-ui-toast leading-none` (placeholder `text-dim`, value `text-text`) |
| `400 10.5px/1` body (MuteLink) | `font-body text-ui-sub leading-none` (dim\|accent) |
| `500 10.5px/1.4` body (warn text) | `font-body font-medium text-ui-sub leading-[1.4] text-warn` |
| `600 12px/1.3` mono (warn ⚠ icon) | `font-mono font-semibold text-ui-toast leading-snug text-warn-icon` |
| `500 10.5px/1.3` mono (passphrase word) | `font-mono font-medium text-ui-sub leading-[1.3] text-text` |
| `500 9px/1.3` mono (passphrase index) | `font-mono font-medium text-ui-caps leading-[1.3] text-dim` |
| `400 11.5px/1.4` body (ContactRequest "wants to connect") | `font-body text-ui-empty-sub leading-[1.4] text-text-2` |
| `400 10px/1` mono (ContactRequest id) | `font-mono text-ui-chatsub leading-none text-dim` |
| `500 11.5px/1` body (security-code toggle row) | `font-body font-medium text-ui-empty-sub leading-none text-text` |
| `500 12px/1` mono (safety-number digits) | `font-mono font-medium text-ui-toast leading-none text-text` |
| `400 9.5px/1.4` body (compare-in-person hint) | `font-body text-ui-tab leading-[1.4] text-dim` |
| `400 10.5px/1` mono (ApproveDevice info value) | `font-mono text-ui-sub leading-none text-text-2` |
```

```markdown
| Cosmic auth surface (4-star) | kit `AuthSurface` — `flex-1 min-h-0 relative flex justify-center bg-bg` (+ `items-start overflow-y-auto` tall / `items-center overflow-hidden`); watermark `latticePaths.full` 360² @ right:-84 bottom:-96 `opacity:var(--opacity-watermark)`; 4 stars accent-fill/cosmic-dot/cosmic-dot-2/accent-fill; column `w={w} max-w-[88%] gap-{15|11} p-{18|'20px 18px'}` |
| Steps indicator | `flex justify-center gap-[5px] mb-0.5`; dash `h-1 w-[22px] rounded-r-1`, filled `bg-arcan-accent` else `bg-panel-2` |
| Warn callout | `flex items-start gap-2 rounded-r-4 border border-warn bg-warn px-3 py-[9px]`; ⚠ `text-warn-icon`; body `text-warn` (see ramp) |
| Auth card (ContactRequest/ApproveDevice) | `flex flex-col items-center rounded-r-4 border border-hairline bg-panel` + inline `gap`/`padding` per screen (20/22, gap 12/13) |
| Device icon tile (ApproveDevice) | `w-[52px] h-[52px] rounded-[14px] bg-accent-soft flex items-center justify-center` + `Icon d="device" size={24} text-arcan-accent` |
| Auth avatar tile w/ camera badge (profile-setup 78 / ContactRequest 64) | `rounded-avatar-lg`(78,radius+6=18) \| `rounded-[16px]`(64,radius+4) `bg-accent-soft border border-hairline flex items-center justify-center` + inline size/fontSize (26/22); camera badge `absolute -right-0.5 -bottom-0.5 w-7 h-7 rounded-pill bg-arcan-accent-fill text-on-accent border-2 border-bg justify-center` |
| Expandable security code | outer `w-full rounded-r-4 border border-hairline bg-bg overflow-hidden`; header `flex items-center gap-[9px] px-3 py-2.5` (shield accent + label + caret); body `px-3 pb-3 border-t border-hairline` (SN 3-col grid + compare hint) |
```

- [ ] Gates: existing parity cells re-run green (`npm run parity -- --only auth-shell,pbutton-full,pbutton-variants,pfield,pqr`); `npm run typecheck`; `npm run check-tokens`; `npm run check-ui-purity`; `npm run test` (passphrase-grid test may need retarget — see T6).
- [ ] Commit: `feat(kit): auth surface + parts (Steps/AuthTitle/AuthSub/MuteLink/AuthField) + warn/cosmic tokens; passphrase-grid hf restyle`

---

### Task 2: Welcome + SignIn presenters + parity (Rung 1)

**Files:** create `src/ui/screens/auth-types.ts`, `src/ui/screens/welcome-screen.tsx`, `src/ui/screens/sign-in-screen.tsx`; export from `src/ui/screens/index.ts`; add parity cells to `tests/parity/app-gallery/cells.tsx` + proto-local copies to `tests/parity/proto-cells.jsx` + rows to `tests/parity/cells.json` + fixtures to `tests/parity/app-gallery/fixtures.ts`.

`auth-types.ts` (shared VMs used across T2–T5):
```typescript
import type { ReactNode } from "react";
export interface ContactRequestVM {           // hf ScContactRequest
  name: string; initials: string; avatarSrc?: string; idShort: string;
}
export interface ApproveDeviceVM {             // hf ScApproveDevice
  rows: { label: string; value: string }[];    // app: device/first-seen/fingerprint; hf fixture: device/location/time
}
```

`welcome-screen.tsx` — node-for-node `proto.jsx:537–548` (uses `AuthShell`, the 2-dot proto surface):
```typescript
export function WelcomeScreen(props: {
  onCreateAccount: () => void;      // primary "create account"
  onRestore: () => void;            // outline "restore from recovery code"
  onSignIn: () => void;             // "sign in" MuteLink
  createTestId?: string;            // "create-account-btn"
  restoreTestId?: string;           // "restore-account-btn"
  signInTestId?: string;            // "signin-existing-btn"
}): JSX.Element;
```
Composition: `AuthShell` → `ArcanMark stacked size={64}` (proto:541) → tagline `font-body text-ui-empty-sub leading-normal text-text-2 text-center -mt-1` = `// local-first · end-to-end encrypted` (proto:542 renders `s.sysComment ? '// …' : '…'`; v5 `sysComment=true` → keep `// `) → `h-2` spacer → `PButton primary full icon-less label="create account"` (carry `create-account-btn`) → `PButton full label="restore from recovery code"` (carry `restore-account-btn`) → centered row `text-center mt-0.5`: `<MuteLink>already on a device? </MuteLink>` + `<button className={tapClass}><MuteLink accent>sign in</MuteLink></button>` (carry `signin-existing-btn`).

`sign-in-screen.tsx` — node-for-node `proto.jsx:550–565`:
```typescript
export function SignInScreen(props: {
  onBack?: () => void;              // proto has PHeader back → welcome; container wires navigate(-1)/"/onboarding"
  email: string; onEmail: (v: string) => void;
  password: string; onPassword: (v: string) => void;
  onSubmit: () => void;             // primary "sign in"
  submitting: boolean;              // label "signing in…" | "sign in"
  errorSlot?: ReactNode;            // Rung-4: login-error line
  onForgot: () => void; onCreate: () => void;
  emailTestId?: string;             // "login-email"
  passwordTestId?: string;          // "login-password"
  submitTestId?: string;            // "login-submit"
}): JSX.Element;
```
Composition: optional `PHeader title="" onBack` (proto:554) → `AuthShell` → `ArcanMark stacked size={56}` → `AuthTitle` `sign in` → `AuthField label="email" type="email"` (carry `login-email`, `autoComplete="email"`) → `AuthField label="password" type="password"` (carry `login-password`, `autoComplete="current-password"`) → `errorSlot` → `h-1` spacer (proto:560 `h:4`) → `PButton primary full label={submitting ? "signing in…" : "sign in"}` (carry `login-submit`) → footer `flex justify-between`: `<button><MuteLink>forgot password?</MuteLink></button>` + `<button><MuteLink accent>create account</MuteLink></button>`. **Wrap the two AuthFields + submit in a `<form onSubmit>`** (container passes `onSubmit`) so Enter submits.

**Parity cells** (proto-local patched copies of `proto.jsx:537–548 / 550–565`, marked `/* patched copy: proto.jsx:537–565 — buttons via PButton (decision A); AuthField=empty input */`):
```json
{ "id": "welcome-screen", "width": 360, "height": 480, "pad": 0, "accents": ["tokyo", "rose"] },
{ "id": "sign-in-screen", "width": 360, "height": 520, "pad": 0 }
```
- `welcome-screen`: proto WelcomeScreen (`AuthShell` local copy already in proto-cells) with stubbed `nav`. App cell feeds `WelcomeScreen` no-op handlers. accents exercise the accent star + primary button.
- `sign-in-screen`: proto SignInScreen with the empty `PHeader` back arrow (proto:554) and empty AuthFields. App cell feeds `onBack` (renders the back arrow → matches), `email/password=""`, `submitting=false`, `errorSlot` omitted.
- Patched-copy rules: proto `Btn` → `PButton` (decision A); `PField` display twin → app `AuthField` empty input (placeholder-only, matches).
- All PASS ≤0.2% dark+light (characterize a `maxDiffRatio` override only if AuthField placeholder AA exceeds it — see T1).

- [ ] Purity guard passes. Gates (typecheck, check-tokens, check-ui-purity, vitest, `parity --only welcome-screen,sign-in-screen`). Commit: `feat(screens): Welcome + SignIn presenters + parity (Rung 1)`

---

### Task 3: Onboarding presenters + parity (Rung 2)

**Files:** create `src/ui/screens/onboarding-types.ts`, `src/ui/screens/credentials-screen.tsx`, `src/ui/screens/backup-display-screen.tsx`, `src/ui/screens/backup-confirm-screen.tsx`, `src/ui/screens/profile-setup-screen.tsx`; export from index; parity files as in T2. **Add `design/hf-flows.jsx` to `tests/parity/build-proto.mjs` transform list + `<script src="…/out/hf-flows.js">` to `tests/parity/proto-gallery.html`** (between `proto-ui.js` and `proto-cells.js`); verbatim-copy `Steps` + `MuteLink` into `proto-cells.jsx`.

**Shared onboarding-step footer pattern.** hf onboarding screens render a **single full-width primary** button + a `step N of 4` MuteLink, with **no back button**. The live app adds a `back` button (two-button row) for step navigation. Encode this in every onboarding presenter as: `onBack?: () => void` — when absent, render the single full-width `PButton primary` (hf-faithful, used by parity); when present, render a `back` (`PButton full`) + primary two-button row (`flex gap-3`, each `flex-1`) — Rung-4 app affordance, used live. **Parity cells omit `onBack`** (single button, matches the hf still); the live containers pass `onBack`. This deviation is a manifest Rung-4 note.

`onboarding-types.ts`:
```typescript
import type { ReactNode } from "react";
export interface WordChallengeField {          // backup-confirm
  label: string; value: string; onChange: (v: string) => void; placeholder: string; testId: string;
}
```

`credentials-screen.tsx` — node-for-node `hf-flows.jsx:92–105` (ScCredentials):
```typescript
export function CredentialsScreen(props: {
  email: string; onEmail: (v: string) => void;
  password: string; onPassword: (v: string) => void;
  confirm: string; onConfirm: (v: string) => void;
  onContinue: () => void; onBack?: () => void;    // onBack present live (two-button); omitted in parity
  errorSlot?: ReactNode;                          // Rung-4: credentials-error
  formTestId?: string;                            // "credentials-form"
  emailTestId?: string; passwordTestId?: string; confirmTestId?: string; continueTestId?: string;
}): JSX.Element;
```
Composition: `AuthSurface` (w=320) → `Steps n={1}` → `AuthTitle` `create your account` → `<form onSubmit>` (carry `credentials-form`) with 3 `AuthField`s (email `you@domain.dev`/`autoComplete="email"`; password `choose a strong password`/`new-password`/`minLength={12}`; confirm `••••••••`/`new-password`) → `errorSlot` → `h-0.5` spacer → footer (single/two-button per `onBack`; primary `continue →`, carry `credentials-continue`) → `MuteLink` `step 1 of 4` centered. Carry `credentials-email/-password/-confirm`.

`backup-display-screen.tsx` — node-for-node `hf-flows.jsx:106–126` (ScRecovery = "save your recovery code"):
```typescript
export function BackupDisplayScreen(props: {
  gridSlot: ReactNode;                 // <PassphraseGrid phrase compact withCopyButton> (real 24-word grid + copy)
  ackSlot?: ReactNode;                 // Rung-4: container-owned acknowledge checkbox row (omitted in parity)
  continueDisabled?: boolean;          // gated by the container's acknowledged state
  onContinue: () => void; onBack?: () => void;
  continueTestId?: string;             // "passphrase-display-continue"
}): JSX.Element;
```
Composition: `AuthSurface tall w={368}` → `Steps n={2}` → `AuthTitle` `save your recovery code` → warn callout (cluster, `hf-flows:115–118`): `⚠` + `this 24-word code is the only way to recover your account. nox cannot reset it.` → `gridSlot` (the real `<PassphraseGrid>` — its restyle + copy button live in T1; `passphrase-word-N`/`passphrase-grid`/`passphrase-copy-btn` testids preserved) → `ackSlot` (Rung-4) → footer (primary `i've saved it →`, `disabled={continueDisabled}`, carry `passphrase-display-continue`) → `MuteLink` `step 2 of 4`. **Divergence:** hf has copy + "i've saved it" (two stacked buttons, no checkbox); the app keeps its acknowledge-gate. The container (T6) owns the `acknowledged` state and passes `ackSlot` = the checkbox row (`flex items-start gap-3`, `accent-[var(--color-accent)]` checkbox + `text-ui-value text-text-2 leading-relaxed` label; carry `passphrase-saved-checkbox`) + `continueDisabled={!acknowledged}`. **Parity omits `ackSlot` and `onBack`** (single "i've saved it →" button, hf-faithful).

`backup-confirm-screen.tsx` — node-for-node `hf-flows.jsx:127–140` (ScConfirm):
```typescript
export function BackupConfirmScreen(props: {
  sub: string;                         // "type the words shown to prove you saved it" (app) | hf "enter two words…"
  fields: WordChallengeField[];        // app: 3 fields; parity fixture: 2 (matches hf)
  onContinue: () => void; onBack?: () => void;
  continueTestId?: string;             // "confirm-passphrase-btn"
}): JSX.Element;
```
Composition: `AuthSurface` (w=320) → `Steps n={3}` → `AuthTitle` `confirm your code` → `AuthSub sub` → `flex flex-col gap-3` mapping `fields` → `AuthField label mono value onChange placeholder` (carry each field's `testId` = `confirm-word-{slot}`) → footer (primary `continue →`, `disabled` when parent says, carry `confirm-passphrase-btn`) → `MuteLink` `step 3 of 4`. **Genuine divergence (document per-cell):** hf renders **2** word fields (`word #07`, `#19`); the live app challenges **3** words. The presenter is data-driven (`fields[]`); the **parity fixture supplies 2 fields** (matches hf), live supplies 3.

`profile-setup-screen.tsx` — node-for-node `hf-flows.jsx:141–159` (ScProfile):
```typescript
export function ProfileSetupScreen(props: {
  avatarPreview?: string | null;       // objectURL; null → "?" placeholder
  onPickAvatar: () => void;            // camera badge
  avatarInput?: ReactNode;             // hidden <input type=file> (container owns)
  displayName: string; onDisplayName: (v: string) => void;
  onFinish: () => void; onBack?: () => void;
  submitting: boolean;                 // "creating account…" | "enter arcan →"
  errorSlot?: ReactNode;               // Rung-4: profile-error
  nameTestId?: string;                 // "display-name-input"
  finishTestId?: string;               // "finish-onboarding-btn"
  avatarChangeTestId?: string;         // "onboarding-avatar-change"
  avatarPreviewTestId?: string;        // "onboarding-avatar-preview"
}): JSX.Element;
```
Composition: `AuthSurface` (w=320) → `Steps n={4}` → `AuthTitle` `set up your profile` → centered avatar tile (`relative`; 78px `rounded-avatar-lg bg-accent-soft border border-hairline flex items-center justify-center` + inline `fontSize:26` `font-mono font-semibold text-arcan-accent` "?" OR `<img>` when `avatarPreview`, carry `onboarding-avatar-preview`; camera badge cluster, carry `onboarding-avatar-change`) → `avatarInput` (hidden) → `AuthField label="display name" placeholder="how others see you"` (carry `display-name-input`, `autoFocus`, `onKeyDown` Enter→finish) → `errorSlot` → footer (primary `enter arcan →`/`creating account…`, carry `finish-onboarding-btn`) → `MuteLink` `step 4 of 4`.

**Parity cells** (proto-local patched copies in `proto-cells.jsx`, composing the window helpers + verbatim `Steps`; the `R_WORDS` list is copied local for the grid):
```json
{ "id": "credentials-screen", "width": 380, "height": 560, "pad": 0, "accents": ["tokyo", "rose"] },
{ "id": "backup-display-screen", "width": 420, "height": 720, "pad": 0 },
{ "id": "backup-confirm-screen", "width": 380, "height": 540, "pad": 0 },
{ "id": "profile-setup-screen", "width": 380, "height": 580, "pad": 0, "accents": ["tokyo", "rose"] }
```
- `credentials-screen`: proto `ScCredentials` (single full-width `continue →` via `PButton`, empty fields). App cell omits `onBack` (single button), empty email/password/confirm, `errorSlot` omitted.
- `backup-display-screen`: proto `ScRecovery` (warn + 3-col `R_WORDS` grid + copy `PButton` + single "i've saved it →"; **no checkbox / no back**). App cell feeds `gridSlot=<PassphraseGrid phrase={R_WORDS.join(" ")} compact withCopyButton>`, omits `ackSlot` and `onBack`, `continueDisabled=false` (single "i've saved it →" — matches hf).
- `backup-confirm-screen`: proto `ScConfirm` (2 fields `word #07`/`#19`, `sub="enter two words to prove you saved it"`). App cell feeds 2 `WordChallengeField`s + hf sub.
- `profile-setup-screen`: proto `ScProfile` (empty name, "?" avatar). App cell: `avatarPreview=null`, empty name, `avatarInput`/`errorSlot` omitted, no `onBack`.
- Patched-copy rules: `Btn`→`PButton` (decision A); `Field`→app `AuthField` empty; single-button footer (no `onBack`); local `R_WORDS`; checkbox/back are Rung-4 (omitted).
- All PASS ≤0.2% dark+light (per-cell override only if AuthField AA needs it).

- [ ] Purity guard passes. Gates (typecheck, check-tokens, check-ui-purity, vitest, `parity --only credentials-screen,backup-display-screen,backup-confirm-screen,profile-setup-screen`). Commit: `feat(screens): onboarding presenters (credentials/backup/confirm/profile) + parity (Rung 2)`

---

### Task 4: Restore + Recovery + Invite (ContactRequest) presenters + parity (Rung 2 / Rung 4)

**Files:** create `src/ui/screens/restore-screen.tsx`, `src/ui/screens/contact-request-screen.tsx`, `src/ui/screens/invite-status-screen.tsx`; export from index; parity files.

`restore-screen.tsx` — `hf-flows.jsx:160–180` (ScRestore) chrome, **app IA kept** (textarea, not 24-slot grid):
```typescript
export function RestoreScreen(props: {
  code: string; onCode: (v: string) => void;      // <textarea> paste-the-code
  onRestore: () => void; onBack?: () => void;
  restoring: boolean;                              // "restoring…" | "restore →"
  errorSlot?: ReactNode;                           // restore-error
  codeTestId?: string;                             // "restore-passphrase-input"
  restoreTestId?: string;                          // "restore-btn"
}): JSX.Element;
```
Composition: `AuthSurface tall w={376}` → `ArcanMark stacked size={42}` (hf Wordmark size 20 → ×2.1; `hf-flows:164`) → `AuthTitle` `restore your account` → `AuthSub` `paste your 24-word code, or type each word` → `AuthField as="textarea" rows={4} label="recovery code" mono placeholder="word1 word2 … word24"` (carry `restore-passphrase-input`, `autoFocus`, `spellCheck={false}`) → `errorSlot` → footer (primary `restore →`/`restoring…`, carry `restore-btn`; `onBack` optional two-button live) → `MuteLink` `keys live on your device — no server reset` centered. **Structural divergence (documented):** hf shows a 24-slot per-word grid + "paste code" button; the app keeps its single textarea (restore logic depends on it; the 24-slot grid would rearchitect the flow — out of scope). Parity is **advisory** (side-by-side still, never gated) — see cell.

`contact-request-screen.tsx` — node-for-node `hf-flows.jsx:229–257` (ScContactRequest) — the `/invite` **confirm** phase:
```typescript
export function ContactRequestScreen(props: {
  vm: ContactRequestVM;                    // name/initials/avatarSrc/idShort
  avatarSlot?: ReactNode;                  // Rung-4: real <Avatar> (container owns loadAs); parity = bespoke tile
  sharedSlot?: ReactNode;                  // Rung-4 app-only: "you're both in: …" line
  securityOpen: boolean; onToggleSecurity: () => void;   // expandable "view security code"
  safetySlot?: ReactNode;                  // Rung-4: <SafetyNumber> (expanded body)
  onAccept: () => void; onDecline: () => void;
  acceptLabel?: string;                    // default "accept & add contact"
  declineLabel?: string;                   // default "decline"
  rootTestId?: string;                     // "invite-confirm"
  nameTestId?: string;                     // "invite-inviter-name"
  avatarTestId?: string;                   // "invite-inviter-avatar"
  acceptTestId?: string;                   // "invite-accept-btn"
  declineTestId?: string;                  // "invite-decline-btn"
}): JSX.Element;
```
Composition: `AuthSurface w={320}` → `ArcanMark stacked size={42}` → auth card (cluster, `p-[22px] gap-[13px]`, carry `invite-confirm`): 64px avatar (`avatarSlot` else bespoke `rounded-[16px] bg-accent-soft` + `fontSize:22` initials, carry `invite-inviter-avatar`) → name block (`text-ui-req tracking-[-0.01em] text-text` name, carry `invite-inviter-name`; `wants to connect with you` `text-ui-empty-sub leading-[1.4] text-text-2 mt-1.5`; id `text-ui-chatsub text-dim mt-1.5`) → `sharedSlot` (Rung-4) → expandable security code (cluster; header shield + `view security code` + caret `onToggleSecurity`; when `securityOpen`, body = `safetySlot` + compare-in-person hint) → `PButton primary full label={acceptLabel}` (carry `invite-accept-btn`) → `PButton danger full label={declineLabel}` (carry `invite-decline-btn`). Parity renders `securityOpen=false` (collapsed; SN is Rung-4, out of parity — same as Wave C profile safety).

`invite-status-screen.tsx` — **Rung-4** presenter for the invite non-confirm phases (loading / signin-required / sending / sent / approved / expired / error) + the pairing status screens (reused in T5). Small, kit-composed:
```typescript
export function InviteStatusScreen(props: {
  markSize?: number;                       // ArcanMark stacked size (default 48)
  title?: string; sub?: string;
  bodySlot?: ReactNode;                    // extra content (e.g. Lattice for mono states, sign-in CTA)
  primary?: { label: string; onClick: () => void };
  outline?: { label: string; onClick: () => void };
  rootTestId?: string;
}): JSX.Element;
```
Composition: `AuthSurface w={360}` → `ArcanMark stacked size={markSize}` → optional `AuthTitle title` / `AuthSub sub` → `bodySlot` → optional `PButton primary` / `PButton` outline. (Replaces the invite route's raw `Lattice` + shadcn `Button` phase markup; keeps all `invite-*` phase testids on the root.)

**Recovery route (`/auth/recovery`) — Rung 4 (no hf twin).** Built in the container (T6) from the auth kit; **no dedicated presenter file** unless the container gets unwieldy (then `recovery-screen.tsx`). Stage-1 (enter 24-word code) reuses the `RestoreScreen` chrome shape (textarea). Stage-2 (set new password) = `AuthSurface` + `ArcanMark` + `AuthTitle` `set a new password` + `AuthSub` + two password `AuthField`s + `PButton` (skip / save-password two-button row). Keep `recovery-code-input`, `recovery-error`, `recovery-submit`, `recovery-new-password`, `recovery-new-password-confirm`, `recovery-set-password` testids. No parity cell (Rung-4 manifest row).

**Parity cells:**
```json
{ "id": "restore-screen", "width": 430, "height": 720, "pad": 0, "advisory": true },
{ "id": "contact-request-screen", "width": 380, "height": 640, "pad": 0, "accents": ["tokyo", "rose"] }
```
- `restore-screen` (**advisory**): proto `ScRestore` (24-slot grid + "paste code") | app `RestoreScreen` (textarea). Structural divergence — renders both for visual review, never fails the run (like `lattice-verdict`). Manifest Rung-2 side-by-side note.
- `contact-request-screen`: proto `ScContactRequest` (fixture name `rana` ini `RA`, id `co_9f2…b41`, security collapsed). App cell feeds `ContactRequestVM`, `securityOpen=false`, `avatarSlot`/`sharedSlot`/`safetySlot` omitted, default labels. accents exercise accent avatar tint + accent primary + accent star.
- Patched-copy rules: `Btn`→`PButton` (decision A); security-code collapsed; SN body Rung-4; bespoke avatar tile.
- `contact-request-screen` PASS ≤0.2% dark+light.

**Fixtures (`fixtures.ts`):** `CONTACT_REQUEST_FIXTURE: ContactRequestVM = { name: "rana", initials: "RA", idShort: "co_9f2…b41" }`; `RESTORE_*` not needed (advisory).

- [ ] Purity guard passes. Gates (typecheck, check-tokens, check-ui-purity, vitest, `parity --only restore-screen,contact-request-screen`). Commit: `feat(screens): Restore + ContactRequest + invite-status presenters + parity`

---

### Task 5: Pairing presenters (LinkDevice wiring + ApproveDevice + responder) + overlay restyle

**Files:** modify `src/ui/screens/link-device-screen.tsx` (add `hiddenUrlSlot`); create `src/ui/screens/approve-device-screen.tsx`; export from index; parity files. (The responder + overlay restyles are container/component edits — but their kit-composed markup is built here.)

`link-device-screen.tsx` — **extend** the existing Wave-C presenter with an sr-only URL hook (the pairing e2e extracts `qr-url-text`):
- [ ] Add prop `hiddenUrlSlot?: ReactNode;` rendered after the URL+copy pill (an `sr-only` span the container fills with `qr-url-text`). No other change; the existing `link-device-screen` parity cell stays green (slot omitted in parity).

`approve-device-screen.tsx` — node-for-node `hf-flows.jsx:209–228` (ScApproveDevice). Factor a shared inner `ApproveDeviceCard` (consumed by this presenter AND the overlay restyle):
```typescript
export function ApproveDeviceCard(props: {
  vm: ApproveDeviceVM;                     // rows [{label,value}]
  labelTestId?: string;                    // "approval-label" (row 0 value)
  fingerprintTestId?: string;              // "approval-fingerprint" (fingerprint row value)
  rootTestId?: string;                     // "device-approval-card"
}): JSX.Element;                           // 52px device tile + "approve new device?" + sub + info rows

export function ApproveDeviceScreen(props: {
  vm: ApproveDeviceVM;
  onApprove: () => void; onDeny: () => void;
  approving: boolean;                      // "approving…" | "approve device"
  approveDisabled?: boolean;
  approveTestId?: string;                  // "approve-device"
  denyTestId?: string;                     // "deny-device"
  cardTestId?: string;                     // "device-approval-card"
  promptTestId?: string;                   // "pair-approval-prompt" (root)
}): JSX.Element;
```
`ApproveDeviceScreen` composition: `AuthSurface w={320}` (root carries `pair-approval-prompt`) → `ArcanMark stacked size={42}` → `ApproveDeviceCard` (cluster: `p-[20px] gap-3` card → 52px device tile → `AuthTitle` `approve new device?` → `AuthSub` `a device wants to link to your account` → info-rows box (`w-full rounded-r-4 bg-bg border border-hairline px-3 py-2.5 flex flex-col gap-1.5`; each row `flex justify-between items-center` — caps label `text-ui-caps tracking-caps-12 uppercase text-dim` + value `text-ui-sub text-text-2`)) → `PButton primary full label={approving ? "approving…" : "approve device"}` (carry `approve-device`) → `PButton danger full label="deny"` (carry `deny-device`). **Data-driven rows:** live app feeds `device` (label·os), `first-seen` (relativeTime), `fingerprint`; the hf still shows `device`/`location`/`time` (the app has no geo-location). The parity fixture feeds the **hf rows** (device/location/time) so pixels match; the live app substitutes first-seen/fingerprint — documented divergence. Carry `approval-label` (row 0 value), `approval-fingerprint` (fingerprint row value).

**Container wiring built in this task's markup (applied in T6):**
- **Initiator route** (`initiator-step.tsx`) — phase → presenter map:
  - `waiting` → the Wave-C `LinkDeviceScreen` (proto `link a device`, PHeader+Body+PQR+URL/copy pill+waiting dot), fed `qrSlot=<QRDisplay url size={150} showText={false}>`, `linkUrl=invitation.url` (elided display via existing truncation), `onCopy=handleCopyUrl` (keep `copyFeedback`), `hiddenUrlSlot=<span data-testid="qr-url-text" className="sr-only">{invitation.url}</span>`, `onBack` → `/settings` (or `history.back`). Carry `pair-waiting` (on the QR wrapper), `pair-copy-url-btn`.
  - `awaiting-approval` → `ApproveDeviceScreen` (root `pair-approval-prompt`), rows from `deriveDeviceLabel/OS` + `relativeTime` + fingerprint, `onApprove=handleApprove`, `onDeny=handleReject`.
  - `loading` / `approved` / `complete` / `error` → `InviteStatusScreen` (Rung-4): titles `preparing link` / `linking device` / `new device linked` / `something went wrong`; keep `pair-approved`, `pair-init-complete`, `pair-init-home-btn` (primary `back to home`→`/`), `pair-init-error` + retry outline. **Chrome note:** `waiting` uses the proto PHeader+Body LinkDevice surface while the status phases use the cosmic `AuthSurface` — faithful to the two design refs; flag to controller.
- **Responder route** (`responder-step.tsx`) — **Rung 4** (no hf twin). Restyle every phase with the auth kit (`AuthSurface` + `ArcanMark` + `AuthTitle`/`AuthSub`), keeping `QRScanner` (real) and the fingerprint display (restyle to `text-ui-caps` caps label + mono value box). Keep phases/logic verbatim + all testids: `pair-resp-waiting`, `responder-fingerprint`, `pair-resp-rejected`, `pair-resp-timed-out`, `pair-resp-claiming`, `pair-resp-complete`, `pair-resp-error`. The `scanning` phase reuses `AuthSurface` + `AuthTitle` `scan to join` + `QRScanner`.
- **Trusted-device overlay** (`trusted-device-prompt.tsx` + `device-approval-card.tsx`) — **sanctioned overlay STAYS an overlay** (Unit-9 decision). Restyle `DeviceApprovalCard` to the `ApproveDeviceCard` visual language (device tile + caps info rows) via kit tokens; keep it inside `ModalShell`, buttons **inside** the card (`PButton primary`/`danger`). Reuse `ApproveDeviceCard` for the card body; the overlay adds the buttons + the "open this prompt on the device you started pairing on" caveat. Rung-4, **no parity cell** (overlays aren't parity-gated). Keep `trusted-device-prompt`, `device-approval-card`, `approve-device`, `deny-device`, `approval-label`, `approval-fingerprint` testids.

**Parity cell:**
```json
{ "id": "approve-device-screen", "width": 380, "height": 600, "pad": 0, "accents": ["tokyo", "rose"] }
```
- `approve-device-screen`: proto `ScApproveDevice` (rows device/location/time fixture). App cell feeds `ApproveDeviceVM` with the same 3 rows, `approving=false`. accents exercise the device-tile `accent-soft` + accent primary. `link-device-screen` cell is unchanged (Wave C).
- Patched-copy rules: `Btn`→`PButton` (decision A); hf fixture rows.
- PASS ≤0.2% dark+light.

**Fixtures:** `APPROVE_DEVICE_FIXTURE: ApproveDeviceVM = { rows: [ { label: "device", value: "firefox · macos" }, { label: "location", value: "prague · cz" }, { label: "time", value: "23:42 CET" } ] }`.

- [ ] Purity guard passes. Gates (typecheck, check-tokens, check-ui-purity, vitest, `parity --only approve-device-screen,link-device-screen`). Commit: `feat(screens): ApproveDevice presenter + LinkDevice url-slot; pairing/overlay markup`

---

### Task 6: Container integration — routes render the presenters

**Files:** modify `src/routes/auth/login.tsx`, `src/routes/auth/recovery.tsx`, `src/routes/onboarding/index.tsx` + all six step files, `src/routes/pair/initiator-step.tsx`, `src/routes/pair/responder-step.tsx`, `src/routes/invite/index.tsx`, `src/components/trusted-device-prompt.tsx`, `src/components/device-approval-card.tsx`; retarget unit tests. **All data logic is MOVED, not rewritten** — flows, effects, polling, state machines, and the invite sessionStorage stash keep their exact behavior; only the render tree swaps to presenters.

- [ ] **Every wired auth route wraps its presenter in the h-screen scaffold:** `<div className="h-screen w-screen flex flex-col">{presenter}</div>` (rule 1). The presenters' `flex-1 min-h-0` roots then fill it.
- [ ] **Login** (`login.tsx`): render `<SignInScreen>`. Move in verbatim: `email`/`password`/`error`/`isLoading` state, `signIn` flow, the **`pending-invite-fragment` replay** (verbatim), navigate `/`. `errorSlot` = the `login-error` line (restyled: `rounded-r-4 bg-red/10 px-3 py-2 text-ui-toast text-red`). Wire `onBack` → `navigate("/onboarding")` (matches proto's back-to-welcome; keeps parity's back arrow). `onForgot` → `/auth/recovery`; `onCreate` → `/onboarding`. Carry `login-email/-password/-submit/-error`. **Drop `AuthSurface`/`Wordmark`/`AuthTitle` imports from `@/components/auth-surface`.**
- [ ] **Recovery** (`recovery.tsx`): render the two Rung-4 stages from the auth kit (see T4). Move in verbatim: the `Stage` union, `recoverWithCode`/`setPasswordAfterRecovery`/`decodeRecoveryCode`, the pw-length/match validation, skip-for-now, navigate. Carry all six recovery testids. Drop the legacy `AuthSurface`/`Wordmark`/`AuthTitle`/`AuthSub` imports.
- [ ] **Onboarding** (`onboarding/index.tsx` + steps): the step machine (`OnboardingStep` union, `generateRecoveryCode` on the credentials→backup transition, all `onBack`/`onContinue` wiring, the invite-fragment replay in profile-step) is **untouched**. Each step file becomes a thin container rendering its presenter:
  - `welcome-step.tsx` → `<WelcomeScreen>` (Rung-1; carry `create-account-btn`/`restore-account-btn`/`signin-existing-btn`).
  - `credentials-step.tsx` → `<CredentialsScreen>` (move `EMAIL_RE`/`MIN_PASSWORD_LEN` validate; pass `onBack`).
  - `backup-display-step.tsx` → `<BackupDisplayScreen>` with `gridSlot=<PassphraseGrid phrase compact withCopyButton>` and `ackSlot` = the acknowledge checkbox (move the `acknowledged` state here); pass `onBack`.
  - `backup-confirm-step.tsx` → `<BackupConfirmScreen>` (move the `challengeIndices`/`inputs`/`allCorrect` logic; build `fields[]` — **3** words live; carry `confirm-word-0/1/2`, `confirm-passphrase-btn`).
  - `profile-step.tsx` → `<ProfileSetupScreen>` (move avatar pick/preview/`MAX_ATTACHMENT_BYTES`, `signUp` flow, `avatarInput`=hidden file input, invite replay; carry `display-name-input`/`finish-onboarding-btn`/`onboarding-avatar-*`).
- [ ] **Pair** (`initiator-step.tsx`, `responder-step.tsx`): render per the T5 phase→presenter map. All state machines, `createPairingInvite`/`approvePairing`/`rejectPairing`/`tombstonePairing`, the `creationStartedRef` StrictMode guard, both poll effects, `getAuthContext`, `respondToPairing`/`claimAccountFromPairing`/`nextPairingPhase` — **untouched**. `QRDisplay` (initiator) + `QRScanner` (responder) stay (real; fed as slots). Carry every `pair-*`/`qr-url-text`/`responder-fingerprint` testid. `PairRoute` (`index.tsx`) selector (reads `?role=`) is untouched; both steps wrap in the h-screen scaffold. Drop `@/components/auth-surface` imports.
- [ ] **Invite** (`invite/index.tsx`): confirm phase → `<ContactRequestScreen>` (`avatarSlot`=`<Avatar src={inviterAvatar} loadAs={me}>`, `sharedSlot`=the `you're both in: …` line when `shared.length`, `safetySlot`=`<SafetyNumber fingerprintHex>`, `onAccept`=`onConnect`, `onDecline`=`window.history.back`). Non-confirm phases → `<InviteStatusScreen>` (loading/signin-required/sending/sent/approved/expired/error). **ALL phase logic + the `pending-invite-fragment` sessionStorage stash + `openedChannel` capture + the approval poll + `writeInviterAsContact` are kept verbatim.** Carry `invite-loading`, `invite-signin-required`, `invite-sending`, `invite-sent`, `invite-approved`, `invite-expired`, `invite-error`, `invite-confirm`, `invite-inviter-name`, `invite-inviter-avatar`, `invite-accept-btn`, `invite-decline-btn`. The route already mounts outside AppShell; wrap in the h-screen scaffold.
- [ ] **`auth-surface.tsx` reaches zero `src/` importers.** After the moves, confirm `grep -rl "components/auth-surface" src/` → empty. Leave the file (Phase 4 deletion); the legacy `AuthSurface`/`Wordmark`/`Steps`/`AuthTitle`/`AuthSub` stop rendering.
- [ ] **Unit tests:** retarget `tests/unit/routes/onboarding/{welcome-step,backup-display-step,profile-step,restore-routing}.test.tsx`, `tests/unit/routes/pair/responder-states.test.tsx`, `tests/unit/routes/invite-confirm.test.tsx`, `tests/unit/components/{auth-surface,passphrase-grid}.test.tsx` onto the presenters or the containers; behavioral assertions stay. Remove/retarget `auth-surface.test.tsx` if it only exercised the retired legacy component.
- [ ] Gates: `npm run typecheck`, `npm run check-tokens`, `npm run check-ui-purity`, `npm run test`, FULL parity (`npm run parity`), `npm run build`.
- [ ] Commit: `feat(auth): route containers render Wave-D presenters; auth-surface retired from render`

---

### Task 7: Wave exit

- [ ] Full battery: `npm run typecheck`, `npm run check-tokens`, `npm run check-ui-purity`, `npm run test`, `npm run parity` (all cells), `npm run build`.
- [ ] **Full chromium e2e run** (`npm run test:e2e`). Baseline: 44 green (or the current `main` count) + any pre-existing fixme. **This wave touches the most-tested flows in the app.** The specs exercising this wave's surfaces: `account-creation`, `account-persistence`, `signup-email-password`, `login-email-password`, `invalid-credentials`, `recovery-with-code`, `device-pairing`, `device-pairing-repeat`, `contact-invitation`, `invite-before-signin`, `connection-request-delivery`. **Investigate every failure before classifying.** Fix trivial selector/copy drift (≤ ~15 lines, helpers preferred); record structural failures in the manifest for Phase 4 — do NOT mask real regressions. Likely drift sources to check first: the `rounded-r-3`→`rounded-r-4` input radius, the single-vs-two-button onboarding footer, button label casing (`sign in`/`continue →`/`i've saved it →`), the invite accept/decline labels (`accept & add contact`/`decline` vs old `connect`/`cancel`), and the fingerprint display restyle.
- [ ] Coverage-manifest rows (append a "Wave D coverage rows" table): Welcome, SignIn, Credentials, BackupDisplay, BackupConfirm, ProfileSetup, Restore, ContactRequest, ApproveDevice — each with route, rung, reference lines, parity status. Plus **Rung-4 rows:** `/auth/recovery` two-stage reset (kit inference); invite non-confirm phases (`InviteStatusScreen`); responder pairing states; trusted-device overlay (restyle, no parity). Plus **manifest notes:** decision A (auth buttons unified on `PButton`, Rung-2 proto copies patched); decision B (auth theme-reactive, `forceDark` dropped); onboarding back-button (Rung-4 two-button footer; parity uses hf single button); backup-confirm 2-vs-3 word fields (data-driven, parity=2); restore textarea vs 24-slot grid (structural divergence, advisory cell); ApproveDevice rows device/first-seen/fingerprint vs hf device/location/time; input radius `r-3`→`r-4` correction; passphrase-grid restyled to hf 3-col; ContactRequest id line kept (Wave C dropped id from *profiles* — controller confirm consistency); mixed chrome in the initiator flow (proto LinkDevice waiting vs cosmic status phases).
- [ ] Merge `--no-ff`: `Unit 10 Wave D: auth + flows (prototype kit)`.

---

## Self-review notes (controller attention)

- **Every listed surface has a home:** Welcome (T2), SignIn (T2), Credentials (T3), BackupDisplay (T3), BackupConfirm (T3), ProfileSetup (T3), Restore (T4), Recovery `/auth/recovery` (T4/T6, Rung-4), ContactRequest `/invite` confirm (T4), invite non-confirm phases (T4/T6, Rung-4), LinkDevice wiring (T5), ApproveDevice screen + overlay (T5), responder states (T5/T6, Rung-4), trusted-device overlay (T5/T6). Each names its files, carried testids, and patched-copy rules.
- **DECISION A — auth buttons unify on `PButton` (h-44).** proto-ui `PButton` is canonical over hf-flows' one-off `Btn` (h-40/gap-7/12.5px); v5 makes both pill, so only height/gap/font differ. Unifying removes the h-44→h-40 jump between Welcome (proto) and the following onboarding steps (hf). Rung-2 proto-local copies patch `Btn`→`PButton` (labeled). **If the controller wants the hf h-40 button faithfully instead, T1 grows an `AuthBtn` primitive and the proto copies stay unpatched.**
- **DECISION B — auth surfaces go theme-reactive** (`forceDark` dropped from all auth routes; matches Wave C's profile-view). Presenters are theme-reactive by construction, so parity must pass dark+light — the warn-callout light-theme tokens (T1) exist for this. Visible change: pre-auth screens follow the ambient/persisted theme instead of always-dark. **Confirm.**
- **Two auth backdrops coexist (per-rung faithful):** Welcome/SignIn use the proto 2-dot `AuthShell`; onboarding/recovery/pair/invite use the hf 4-star `AuthSurface`. This is a cross-rung design-reference divergence (proto vs hf), surfaced verbatim rather than reconciled. If the controller wants one backdrop across the whole flow, that's a fast-follow unification (out of scope for faithful transliteration).
- **Genuine data-model divergences kept, exposed as props (not "fixed" to proto):** backup-confirm challenges 3 words (parity fixture uses hf's 2); the onboarding footer adds a back button (parity uses hf's single button); ApproveDevice shows device/first-seen/fingerprint (parity uses hf device/location/time — the app has no geo-location); restore uses a paste-textarea (hf shows a 24-slot per-word grid — **advisory** parity cell, structural divergence). Each is a manifest row.
- **`restore-screen` parity is advisory** (renders proto-grid | app-textarea | diff for visual review, never fails). Rebuilding restore as 24 per-word inputs would rearchitect the working paste-the-code flow — deliberately out of scope.
- **Invite + pairing logic is load-bearing and untouched:** the sessionStorage `pending-invite-fragment` stash (login/onboarding/restore replay), the `openedChannel` qr/link capture, both pairing state machines + poll effects + StrictMode guard, `writeInviterAsContact`. Only render trees swap. The e2e suite (T7) is the correctness net for these — hence the mandatory full run + investigate-before-classify.
- **Overlays stay overlays** (Unit-9 sanctioned): the trusted-device prompt is restyled *inside* `ModalShell` via the shared `ApproveDeviceCard`; the full-screen `ApproveDeviceScreen` serves the initiator route's `awaiting-approval` phase only.
- **T1 token surface is small and honest:** one new star color (`#7dcfff`), the warn-callout palette (needed for light-theme parity), one 17px size (ContactRequest name), a possible 10px `chatsub` confirm. Everything else reuses Wave B/C tokens. The `AuthField`/`AuthSurface`/`Steps`/`AuthTitle`/`AuthSub`/`MuteLink` kit ports are the real T1 work. Stop-the-line still applies to any unmapped literal (esp. the `restore` 8.5px slot index if that screen is ever gated).
- **ContactRequest keeps the account-id line** (`co_9f2…b41`, hf-faithful) even though Wave C decision #7 dropped ids from *profile* screens. Flagged for consistency — the controller may want it dropped here too.
- **USER DECISION 2026-07-06 (walkthrough) — no top back arrows in auth flow.** The wave-D plan wired `onBack` → `navigate("/onboarding")` on `SignInScreen` (rendered as a PHeader back arrow above AuthShell) and kept `onBack` required on `LinkDeviceScreen` (also a PHeader back arrow). Both are removed:
  - `SignInScreen`: `onBack?` prop removed entirely; `PHeader` import dropped from `sign-in-screen.tsx`. `LoginRoute` no longer passes `onBack`.
  - `LinkDeviceScreen`: `onBack` made optional (`onBack?: () => void`); `InitiatorStep` no longer passes it. PHeader title "link a device" is retained; the back arrow is simply absent when `onBack` is undefined.
  - No bottom MuteLink replacement added in either case — the pre-Wave-D originals (commit `0c8c0ff`) had no back navigation on these screens at all, so there is nothing to preserve.
  - Parity patched: `sign-in-screen` and `link-device-screen` app cells updated (onBack omitted); proto copies patched to match (USER DECISION labels added; PHeader back arrow removed from both proto copies).
- **USER DECISION 2026-07-06 (walkthrough) — non-tall auth surfaces must center, not top-pin.** Two surfaces had `tall` when their content fits within a standard viewport:
  - `RestoreScreen` (`src/ui/screens/restore-screen.tsx`): `<AuthSurface tall w={376}>` → `<AuthSurface w={376}>`. Content: ArcanMark + title + sub + 4-row textarea + 2 buttons + mute footer — fits without scroll. `tall` caused top-pinning and an unwanted scrollbar on the restore-from-code screen.
  - `RecoveryRoute` StageCode (`src/routes/auth/recovery.tsx`): same fix (`<AuthSurface w={376}>`). Audit finding — identical content shape, same symptom.
  - `BackupDisplayScreen` (`src/ui/screens/backup-display-screen.tsx`) retains `tall w={368}` — its 24-word passphrase grid is genuinely tall and requires scroll on small viewports.
- **Sequential tasks:** T2–T5 all touch the shared parity files (`cells.json`, `proto-cells.jsx`, `app-gallery/cells.tsx`, `fixtures.ts`) and `src/ui/screens/index.ts`; run them in order, not in parallel. T3 adds `hf-flows.jsx` to the parity build (one-time infra edit) — verify the gallery loads without console errors afterward (hf-flows references `HiDesktop/HiPhone/HiStage/shade` only inside unexecuted component bodies, so load is safe; if a load-time `ReferenceError` appears, fall back to verbatim-copying the `AuthSurface`/`Wordmark`/`Field`/`Btn`/`Title`/`Sub`/`QRBox` helpers into `proto-cells.jsx` too).
