# arcan — project memory for Claude Code

This file is loaded into Claude Code's context for every session in this repo. Keep it tight and high-signal.

## What this project is

A local-first, end-to-end-encrypted messenger built on Jazz/CoJSON. Vision X: small trust circles (≤50-person groups), hard-block strangers, web-first PWA, self-hosted sync server.

Authoritative design: `docs/superpowers/specs/2026-05-15-jazz-messanger-design.md`.
Threat model: `docs/security/threat-model.md`.
Jazz API surface in use: `docs/jazz-api-notes.md` (verified against jazz-tools 0.20.18; re-run the survey if the version changes).

## Status

- Slice 1 (foundation + account creation) — merged, tag `slice-1-complete`.
- Slice 2 (QR pairing + contact invitations) — merged, tag `slice-2-complete`.
- Slice 3a (1:1 conversations + messaging) — merged, tag `slice-3a-complete`.
- Slice 3b (group conversations + member management) — merged, tag `slice-3b-complete`.
- Slice 3c (post-3b polish) — merged, tag `slice-3c-complete`.
- Slice 4 (conversation lifecycle: archive + system events) — merged, tag `slice-4-complete`.
- Slice 5 (inline media + profile avatars) — merged, tag `slice-5-complete`.
- Slice 6 (Caddy + TLS Docker Compose deploy) — merged, tag `slice-6-complete`.
- Slice 7 (zero-knowledge email + password auth) — merged, tag `slice-7-complete`.
- Slice 8 (in-app notifications) — merged, tag `slice-8-complete`.

### UI rework (Units) — breakdown in `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md`

Units are merged as `--no-ff` merge commits (no per-unit tags; `slice-N` tags belong to the
original feature slices above, a separate track).

- Unit 5 (rebrand jazz-messanger → Arcan) — merged.
- Unit 7 (design-system foundation: tokens, fonts, Lattice, theme + accent, toasts, skeletons) — merged.
- Unit 1 (connection subsystem rework) — merged.
- Unit 2 (device-pairing approval gate) — merged.
- Unit 3 follow-up (feedback → Linear) — merged.
- Unit 4 (conversation display) — merged.
- Unit 8 (final UI alignment sweep: AuthSurface, EmptyPane, ModalShell, mobile chrome, toast/skeleton/typography) — merged + 2 polish passes. Audit method (screenshot diffing) missed IA/interaction/feel issues — see Unit 9.
- Unit 9 (IA & interaction-fidelity pass) — merged (sub-units 9-0…9-7 as `--no-ff` merges, incl. the 9-0 connection-request delivery fix). Spec: `docs/superpowers/specs/2026-06-23-unit-9-ia-interaction-design.md`.
- Unit 10 (kit architecture + phase 4 cleanup) — merged through Phase 4. Full kit+screens presenter layer in `src/ui/`; legacy components deleted; tokens pruned; purity guard passing.
- Feedback round 2 (2026-07-10 walkthrough) — implemented + merged (bundles A, C, B waves 1–3, E, D as `--no-ff` merges). Spec: `docs/superpowers/specs/2026-07-10-feedback-round-2-design.md`; per-bundle plans in `docs/superpowers/plans/2026-07-10-*`. The duplicate-conversation spike hardened the knownConversations dedup (raw-ID access) but did NOT reproduce the user's duplicate — root cause still open. Pending separate brainstorms: the 1:1-vs-group conversation model ("Bundle F") and the identity-code rename/shortening. Deferred features: Linear NOX-42…48.
- Feedback round 3 (2026-07-15 walkthrough) — implemented + merged (`--no-ff`). QR scan straight to the native camera + inline paste field; feedback→Linear deploy wiring + honest 404 client message (VPS `LINEAR_API_TOKEN` still to be set by operator); hierarchical up-navigation via `src/nav/parents.ts` (never `navigate(-1)` in headers); invite-links quiet row on add-contact. Spec: `docs/superpowers/specs/2026-07-15-feedback-round-3-design.md`.
- Feedback round 4 (2026-07-16 walkthrough) — implemented + merged (`--no-ff`). Timestamps as captions below bubbles ("HH:MM · edited"); image overflow + edit-width fixes for mobile bubbles; anchored per-message menu popover (⋮ / long-press / right-click; focusout close — a fixed backdrop breaks inside the scrolling timeline). Repaired the messaging-1to1 e2e (stale native-dialog expectations from round 2); parity harness back to 142/142 (earlier "environmental" failures were transient). Spec: `docs/superpowers/specs/2026-07-17-feedback-round-4-design.md`.
- CI VPS deploy (2026-07-18) — merged. `v*` tags are the general release convention: `android.yml` builds+publishes the signed APK AND `deploy.yml` deploys the VPS over SSH (git checkout tag + `docker compose up -d --build`, pinned host key, health check, failure forensics). `android-v*` stays as an APK-only alias. VPS `.env` remains manual. Setup: deploy/README.md § Automated deploys (CI); spec: `docs/superpowers/specs/2026-07-18-ci-vps-deploy-design.md`.
- UI motion (2026-07-18) — implemented + merged (`--no-ff`). Color-only
  hover/press feedback (kit + shadcn + own bubbles + hover-revealed ⋮);
  View-Transitions directional pane slides keyed to `src/nav/parents.ts`
  hierarchy (`src/nav/transitions.ts`, `arcan-pane` snapshot); message
  rise-in (closes AUDIT-011) + badge pop. `check-tokens` now rejects raw
  `duration-[...]` literals. Note: `animate-arcan-rise/pop` use `backwards`
  fill (a held identity transform from `both` breaks popover hit-testing).
  Spec: `docs/superpowers/specs/2026-07-18-ui-motion-design.md`.
- Contact & connection robustness (2026-07-20) — implemented + merged (`--no-ff`). Jazz-canon
  alignment: duplicate-sensitive root state moved to keyed co.records under NEW field names
  (`contacts` / `incomingConnectionRequests` / `outgoingRequests` / `dismissedRequests` /
  `pendingNotifications`) with a TOFU-aware migration backfill — in-place list→record is
  unsafe in jazz-tools 0.20.18, so the legacy CoList fields remain in the schema
  write-frozen (removal is a follow-up slice). Single send path `sendConnectionRequest`
  (durable-intent-first, acked, both channels) + app-level `useOutgoingRequestWatcher`
  replaced the /invite 3-second poll; notification sends carry durable retry records;
  invitations mint lazily; repair is a visible add-to-contacts affordance (never silent
  re-TOFU). Spec: `docs/superpowers/specs/2026-07-20-contact-robustness-design.md`.
- Appearance iteration (2026-07-23) — implemented + merged (`--no-ff`). Tokyo Night
  surface ladder both themes: new `--color-chrome` rung + surface remap in tokens.css;
  8-callsite chrome/raised split (headers, tab bar, composer bar, nav column/sidebar,
  new-convo footer, DesktopWindow title bar — structural chrome was `bg-bg`, NOT
  `bg-panel` as the spec guessed); parity proto side follows via the committed
  `ladderSkin()` intent-fix in proto-cells.jsx (proto consumes skin() hexes, not CSS
  vars) — 142/142. Per-device UI scale 90/100/115/130% as CSS zoom on <html>
  (`src/styles/ui-scale.ts`, localStorage `arcan-ui-scale`, Android shell defaults
  115%), applied pre-paint in main.tsx; fixed-portal coords (message menu, divider
  scroll) divide by `getUiZoom()`. Android device checklist scale+ladder section is a
  post-merge pass. Spec: `docs/superpowers/specs/2026-07-23-appearance-iteration-design.md`.
- Feedback round 5 (2026-07-24) — implemented + merged (`--no-ff`). Dark ladder
  darkened one rung to "Night" (canvas `#1a1b26`; stage/rail `#101014`, chrome
  `#16161e`, raised `#24283b`, raised-2 `#343a55`, border `#2f3549` — light mode +
  text + accents untouched) with parity `ladderSkin` + PWA manifest + `theme-color`
  follow-through (142/142). Viewport zoom lock (`maximum-scale=1,user-scalable=no`)
  kills pinch/double-tap. Optional `FileBlob.width/height` captured at upload
  (`readImageDimensions` via `createImageBitmap`) feed a dimension-aware image grid
  (pure `attachment-grid.ts`: cells clamped 3:4–4:3, hero ~2× clamped 1.5–2.5; any
  member lacking dims → legacy fixed squares) and exact single-image placeholder
  reservation. Timeline `ResizeObserver` re-anchoring (fixes open-mid-history) with a
  first-user-scroll latch + programmatic-scroll guard; auto-scroll-on-new demoted to
  near-bottom-only + a jump-to-latest presenter slot (count badge). Multi-line message
  edit (auto-grow textarea, Enter saves / Shift+Enter newline). Android download
  writes straight to public `$HOME/Download/**` (no dialog, `mobile.json` capability;
  `DownloadOutcome` return → "Saved to Downloads" toast; dialog demoted to fallback).
  Composer tray first-photo race fixed (synchronous preview URL via lazy `useState`).
  Note: the re-anchor effect needs a `ResizeObserver` stub in `tests/setup.ts` (jsdom
  gap); `AttachmentTile`/`ImageLightbox` now require a `ToastProvider` in their tests.
  Spec: `docs/superpowers/specs/2026-07-24-feedback-round-5-design.md`.
- Feedback round 6 (2026-07-25) — implemented + merged (`--no-ff`). Android
  attachment-source tray (`ComposerAttachmentSheet` on `MobileBottomSheet`;
  Photos + File reuse `pickFilesNative`; Android-only via `isTauriAndroid()`;
  camera deferred — follow-up); UI-scale zoom refit (new `--ui-zoom` var +
  `h-app`/`w-app` = `calc(100vh / var(--ui-zoom))` on the 12 full-viewport
  shells — fixes 90% underfill / 130% overflow from CSS `zoom` on `h-screen`);
  jump-to-latest relabelled to a "jump to latest" text (count plumbing removed);
  crisper settings gear (kit swap + a TRACKED patched-`Icon` override in
  `tests/parity/proto-cells.jsx` — the frozen design kit is gitignored, so the
  override keeps parity design-independent, verified 142/142 with design/
  reverted); composer first-photo preview hardened (`loading=eager
  decoding=sync`) + on-device `console.debug` trace for the reopened Android bug
  (#79 — web path proven on chromium, Android confirmation pending nightly).
  Push notifications brainstormed then deferred — analysis in
  `docs/superpowers/notes/2026-07-25-push-notifications-deliberation.md`. Spec:
  `docs/superpowers/specs/2026-07-25-attachment-source-tray-design.md`.
- Markdown messages (2026-07-30) — implemented + merged (`--no-ff`). Sent
  message bodies render GitHub-flavored markdown (headings, bold/italic/strike,
  bullet+numbered lists, display-only task checkboxes, links, inline+fenced
  code, blockquotes) via `MessageMarkdown` (`src/components/message-markdown.tsx`:
  react-markdown 10 + remark-gfm + remark-breaks + `rehype-sanitize` strict
  schema — NO dangerouslySetInnerHTML, `javascript:`/`data:` links dropped,
  raw HTML inert; security unit-tested). Reaches the pure kit bubble through a
  new `richBody` slot (replaces the text span, keeps the timestamp; parity
  142/142). Editing still shows raw markdown (`bodyOverride` textarea). Composer
  upgraded to a multi-line auto-grow `<textarea>` (Enter sends, Shift+Enter
  newline — block markdown needs newlines; proto `PComposerBar` matched to a
  textarea, intent-fix). Follow-up: lazy-load the markdown bundle if initial
  size matters. Spec: `docs/superpowers/specs/2026-07-30-markdown-messages-design.md`.
- Camera capture (attachment tray, 2026-07-30) — implemented + merged
  (`--no-ff`). A **Camera** row on the Android attachment sheet
  (`ComposerAttachmentSheet`). Research revised the mechanism away from a
  hand-rolled Kotlin/Rust plugin: **wry 0.55.1 already fires
  `MediaStore.ACTION_IMAGE_CAPTURE`** when a `<input accept="image/*"
  capture="environment">` is clicked (wry PR #685), and CAMERA permission is
  already merged via the barcode-scanner AAR — so this is native capture with
  **zero Kotlin/Rust/deps/manifest edits**. `detail.tsx` gets a dedicated
  hidden `<input capture>` (`cameraInputRef`); `handlePickSource("camera")`
  clicks it and the photo arrives on its own `onChange` (NOT `pickFilesNative`,
  which the Android attach path otherwise uses and which bypasses the input).
  `handleCameraCapture` runs each shot through `downscaleToFit`
  (`src/jazz/image-downscale.ts`: canvas → JPEG re-encode, lowering
  quality then scale until under the 5 MB cap; passthrough for under-cap /
  non-image; never throws) BEFORE ingest — a raw camera photo routinely
  exceeds the cap and the user can't "pick a smaller one". FileProvider
  hardened proactively with `<external-files-path name="my_capture"
  path="Pictures" />` (wry writes the temp capture under
  `getExternalFilesDir(DIRECTORY_PICTURES)`). Web/desktop unaffected (sheet is
  Android-only). Native path isn't web-e2e drivable → on-device via nightly.
  Spec: `docs/superpowers/specs/2026-07-30-camera-capture-design.md`.
- Camera/tray/newline on-device round 2 (2026-07-30) — implemented + merged
  (`--no-ff`). Three on-device fixes: (1) **Camera opened the gallery, not the
  camera** — root cause was a MISSING `<queries>` element, not the FileProvider:
  wry's `showImageCapturePicker` does `Intent(ACTION_IMAGE_CAPTURE)
  .resolveActivity(pm)` and silently falls back to the gallery when it's null,
  and Android 11+ package-visibility makes that null unless the app declares
  `<queries><intent><action .../></intent></queries>` for IMAGE_CAPTURE (added
  to `AndroidManifest.xml`; VIDEO_CAPTURE too). The CAMERA prompt appearing
  on-device proved the capture branch WAS entered — the failure was downstream.
  (2) Attachment sheet **horizontalized** (`ComposerAttachmentSheet`: row of
  icon-over-label items, Camera/Photos/File — it's in `src/components`, not
  parity-locked). (3) **Mobile newlines**: soft keyboards have no Shift+Enter,
  so "Enter sends" made multi-line markdown impossible on the phone. Added a
  `softEnterNewline` prop to the pure `ChatComposer` (it can't call
  `isTauriAndroid()` itself — purity), set from `isTauriAndroid()` in
  `detail.tsx`; when on, Enter inserts a newline (send is the button only) and
  `enterKeyHint="enter"` hints a return key. Desktop unchanged. Camera fix is
  confirmable only on-device (nightly).
- Unit 6 (hard revocation / NOX-10, Shape 3) — scheduled after the UI rework.
- `design/` holds the extracted `ArcanUI.zip` reference assets (gitignored).

### Native shells

- Android (Tauri 2 bundled shell) — MERGED to main; first signed release
  `android-v0.1.0` on GitHub Releases (2026-07-13). Baked origin
  `https://app.arcan.nox-decima.dev` (VPS deploy pending — see deploy/README.md).
  Spec: `docs/superpowers/specs/2026-07-09-android-tauri-app-design.md`.
  Plan: `docs/superpowers/plans/2026-07-09-android-tauri-app.md`.
  Dev loop: `nix-shell shell.android.nix` → `npm run android:dev:all` (README §Android).
  `src/platform/` is the only layer that may import `@tauri-apps/*`
  (enforced by `npm run check-platform-purity`). Device checklist:
  `docs/testing/android-device-checklist.md` (Phase 0 green on Fairphone 5 5G).
  Follow-ups: background push notifier spec; Windows/Linux desktop shell spec;
  real app icons before circulating the release.

## Issue tracking

Linear: team=Nox project=Arcan

(The `followup-tracking` skill resolves to this destination without prompting per the user's global instructions. URL: <https://linear.app/nox-decima/project/arcan-c718904b5ef5>. The project was renamed from "jazz-messanger" to "Arcan" on 2026-06-05; the app rebrand itself is tracked as Unit 5.)

## Conventions

- TypeScript everywhere; strict; React 19; Tailwind v3 (not v4 — shadcn compat); shadcn/ui primitives in `src/components/ui/`.
- Schema files in `src/jazz/schema/` use PascalCase filenames matching the exported schema name (e.g. `ArcanAccount.ts`).
- Jazz 0.20.18 uses a Zod-based functional API: `co.map({ field: z.string() })`, `co.list(X)`, `co.account({ profile, root })`. The plan documents from Slice 1 use older class-based syntax in places; always cross-check against the API notes.
- Tests: Vitest for unit (`tests/unit/`), Playwright for e2e (`tests/e2e/`). Vitest is scoped to `tests/unit/` only — don't put `.spec.ts` files there expecting them to run via vitest.
- Local dev requires running both `npm run sync` (Jazz sync server on `:4200`) and `npm run dev` (Vite on `:5173`).
- A nix shell at `shell.nix` provides Node 22 + Playwright browsers + system deps; enter with `nix-shell` for reproducible dev/test environment.

## Visual conventions

- All colors, typography, spacing, and motion go through tokens defined in `src/styles/tokens.css`. Use the Tailwind utility names that map to them (`bg-panel`, `text-text`, `text-dim`, `border-hairline`, `font-mono`, etc.) — never raw `bg-white`, `text-gray-*`, `border-gray-*`, or font-family literals.
- Theme is reactive: read via `useTheme()` from `@/styles/use-theme`. Persist via `me.root.settings.appearance.theme`. Light + dark only.
- Accent is six values (tokyo/violet/teal/lime/amber/rose). Read via `useAccent()`; persist via `me.root.settings.appearance.accent`. To track the user-picked accent in a class, use `bg-arcan-accent` / `text-arcan-accent` (NOT `bg-accent` — shadcn still owns that name; we exposed our accent under the `arcan-accent` prefix to avoid the collision).
- For brand surfaces, use `<Lattice size={n} />` from `@/components/lattice`. Tier auto-selected from `size`.
- For success/error/copy confirmations, prefer `useToast({ tone })` over inline status messages.
- For loading states, use the skeleton primitives from `@/components/skeleton` — not `"Loading…"` text.
- The pre-commit guard `scripts/check-tokens.sh` (alias: `npm run check-tokens`) rejects ad-hoc Tailwind color/typography classes. `bg-black/N` overlays for modal scrims are intentionally allowed. Run locally before committing UI work.

## Architecture

- `src/ui/kit/` holds pure presentational primitives (HAv, Icon, PCard, etc.); `src/ui/screens/` holds composed screen presenters. Neither layer may import from `@/components`, Jazz, or the router — enforced by `npm run check-ui-purity`.
- Mapping-table law: every kit primitive maps 1:1 to the proto design reference; deviations are recorded as "intent-fix" comments.
- Type gate: `npm run typecheck` is the authoritative type check (not IDE). Run before every commit.
- Parity harness: `npm run parity` validates the kit against design parity tests.

## Process

- Use the brainstorming → write-plan → subagent-driven-development workflow for each new slice.
- Slice boundaries are tagged (`slice-N-complete`); each slice merges to main as a `--no-ff` merge commit so the slice structure stays visible in git log.
