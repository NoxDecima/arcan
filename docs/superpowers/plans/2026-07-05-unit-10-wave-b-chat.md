# Unit 10 Phase 2 Wave B — Chat Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/conversations/:id` becomes the prototype's ChatScreen — header, timeline (bubbles, sys rows, new-divider, day markers), composer — fed by the existing container logic in `detail.tsx`, with the app-only chat features (edit/delete, attachments, banner, deleted/malformed states) restyled through the kit as flagged Rung-4 surfaces.

**Method:** identical to Wave A (pure presenters in `src/ui/screens/`, parity-gated with patched proto copies; container logic MOVED not rewritten; testids carried verbatim). Read `docs/superpowers/plans/2026-07-04-unit-10-wave-a-home.md` Ground rules — they all apply. Wave A lessons that are now BINDING RULES: route roots fill the pane (`flex-1 min-h-0`), never the viewport; single mount per feature (no CSS dual-mounts); presence/verified visuals omitted (NOX-31/33 — the proto ChatScreen's 1:1 online-dot sub and header `status`/`verified` text are dropped, per the user's earlier walkthrough ruling).

**Prototype source:** `design/proto.jsx` lines 154–203 (ChatScreen). Bubble/Row/sys/new-divider already exist in the kit (Phase 1 Task 10).

**Branch:** `unit-10/wave-b-chat` off current `main`; merges `--no-ff`.

---

### Task 1: Kit + token gaps for the chat surface

**Files:** `src/ui/kit/bubble.tsx`, `src/styles/tokens.css` (only if needed), `tailwind.config.ts`, mapping table.

- [ ] `Bubble`: add `attSlot?: ReactNode` — when set (and `m.att`), the attachment placeholder box's CONTENT is replaced by the slot (real `<img>` thumbnails etc.); the box shell (width w−12, h-[84px] → becomes `min-h-[84px] h-auto` when slot present, rounded-[8px], veil/rail bg, mb-[5px]) stays. Prototype placeholder mode unchanged (existing `bubble-att` cell must still pass). Rung 4, manifest row.
- [ ] tailwind fontSize: `'ui-chatsub': ['var(--fs-ui-sys)', { lineHeight: '1' }]` (header sub `400 10px/1`, proto:177).
- [ ] Mapping-table additions (type ramp + clusters):

```markdown
| `400 10px/1` (chat header sub) | `font-body text-ui-chatsub` (mono when headMono context: `font-mono`) |
| `500 9px/1` mono `.14em` caps (day marker) | `font-mono font-medium text-ui-caps tracking-caps-sm uppercase text-dim self-center` |
| `600 13px/1` mono (composer prompt ›) | `font-mono font-semibold text-ui-btn text-arcan-accent` |
| `400 12.5px/1` body (composer input) | `font-body text-ui-row leading-none text-text` + inline `caretColor: var(--color-accent-fill)` |
| Timeline body | `flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5 p-3 bg-bg` |
| Composer bar | `shrink-0 border-t border-hairline p-2.5 flex items-center gap-[9px] bg-bg` |
| Composer input pill | `flex-1 h-[38px] rounded-pill border border-hairline bg-bg flex items-center gap-2 px-3` |
| Composer send button | tap + `w-[38px] h-[38px] rounded-pill justify-center transition-colors duration-[150ms]`; armed `bg-arcan-accent-fill` icon `text-on-accent`, empty `bg-panel-2` icon `text-dim`; Icon send 16 fill |
| Composer attach button | tap + Icon plusc 22 `text-text-2` (v5 soft) |
```

- [ ] Gates: existing parity cells re-run green (`--only bubble-own,bubble-theirs,bubble-att,bubble-sys,bubble-new`); tsc; check-tokens; vitest.
- [ ] Commit: `feat(kit): Bubble attSlot + chat-surface ramp/cluster tokens`

---

### Task 2: ChatScreen + ChatComposer presenters + parity

**Files:** Create `src/ui/screens/chat-types.ts`, `src/ui/screens/chat-composer.tsx`, `src/ui/screens/chat-screen.tsx`; export from index; parity files.

View model (`chat-types.ts`):

```typescript
import type { ReactNode } from "react";
export type ChatTimelineItem =
  | { kind: "day"; label: string; key: string }              // "today" etc.
  | { kind: "new"; key: string }                              // new-messages divider
  | { kind: "sys"; text: string; key: string; testId?: string }
  | { kind: "msg"; key: string; mine: boolean; text: string; time: string;
      authorName?: string; authorInitials?: string; authorAvatarSrc?: string;
      att?: boolean; attSlot?: ReactNode;                     // real attachments via slot
      deleted?: boolean; malformed?: boolean;                 // Rung-4 states
      menuSlot?: ReactNode;                                   // Rung-4 edit/delete affordance
    };
export interface ChatHeaderVM {
  title: string;            // 1:1 → "@name" (mono headMono rule, proto:175), group → name
  sub?: string;             // group → "// N members"; 1:1 → undefined (presence dropped)
  initials: string; avatarSrc?: string; group?: boolean;
}
```

`chat-screen.tsx`:

```typescript
export function ChatScreen(props: {
  header: ChatHeaderVM;
  items: ChatTimelineItem[];
  bubbleWidth: number;                 // container: desktop 460 / mobile 190 (proto:186)
  onBack?: () => void;                 // mobile only (proto: desktop ? undefined : pop)
  onOpenInfo: () => void;              // header tap → members/profile (container decides)
  composer: ReactNode;                 // ChatComposer (or legacy container-wrapped variant)
  banner?: ReactNode;                  // Rung 4: ConnectionBanner slot above timeline
  emptyText?: string;                  // Rung 4: "No messages yet. Say hello!"
  bottomRef?: React.Ref<HTMLDivElement>; // container's autoscroll anchor
}): JSX.Element;
```

Composition node-for-node from proto:180–201: kit `PHeader` (title/sub/onBack/avatar HAv 34 group NO status/onTitle) — sub renders as `font-mono text-ui-chatsub text-text-2` with `// ` prefix when present; timeline div per cluster (testid `message-timeline`) mapping items: day → day-marker cluster; new → kit new-divider (testid `new-messages-divider`); sys → kit sys row (carry testId); msg → kit `MessageRow`/`Bubble` with `w={bubbleWidth}`, attSlot/menuSlot/deleted/malformed handled as Rung-4 branches (deleted: italic `text-dim text-ui-bubble` "message deleted" inside a plain bubble shell, testid `message-deleted`; malformed likewise, `message-malformed`; menuSlot renders after the bubble — carry `message-mine`/`message-other`/`bubble-body`/`bubble-time` testids INTO the kit-rendered markup via new optional testid props on Bubble/MessageRow if needed — sanctioned); `bottomRef` div at the end.

`chat-composer.tsx` (pure; the container owns file-upload/error state):

```typescript
export function ChatComposer(props: {
  value: string; onChange: (v: string) => void; onSend: () => void;
  placeholder: string;                  // "message ada" / "message group" (proto:194)
  disabled?: boolean;                   // composerDisabled (Rung 4: renders dimmed, input disabled)
  onAttach?: () => void;                // triggers container's file input
  attachSlot?: ReactNode;               // Rung 4: pending-attachment chips row above the bar
  errorSlot?: ReactNode;                // Rung 4: composer-error line
}): JSX.Element;
```

Node-for-node proto:189–200: bar cluster; attach button (plusc 22, testid `composer-attach-btn`); input pill with prompt `›` + `<input>` (testid `composer-input`, `onKeyDown` Enter → onSend, caretColor inline); send button cluster with armed/empty states (testid `composer-send-btn`, disabled when `disabled || !value.trim()`).

**Parity cells** (patched proto copy of ChatScreen from proto.jsx:154–203: drop TypingRow + typing state, drop the 1:1 online-dot/`online · verified` sub ENTIRELY for the 1:1 cell, drop header avatar `status`, stub toast/nav; label `/* patched copy … presence+typing dropped (NOX-31/33) */`):

```json
{ "id": "chat-screen", "width": 300, "height": 560, "pad": 0 },
{ "id": "chat-screen-desktop", "width": 640, "height": 560, "pad": 0 },
{ "id": "chat-composer-states", "width": 300, "height": 200, "pad": 0 }
```

- `chat-screen`: 1:1 with ada (`@ada · keyring` title, no sub), seeded with the proto's `SEED`/HF_MSGS message list (sys + them/me msgs + att + new divider + "today" day marker at top), w=190, composer empty state.
- `chat-screen-desktop`: same but w=460, no back button (desktop), width 640.
- `chat-composer-states`: two composer bars stacked (empty vs text "on it" → armed send).
- App side: presenters with fixtures mirroring the proto data verbatim; attSlot/menuSlot/banner/error/deleted OUT of parity fixtures (Rung 4).
- All PASS ≤0.2% dark+light; full suite green.

- [ ] Purity guard passes. Gates. Commit: `feat(screens): ChatScreen + ChatComposer presenters + parity`

---

### Task 3: Container integration — detail.tsx renders the presenters

**Files:** Modify `src/routes/conversations/detail.tsx`, `src/components/composer.tsx` (container half), possibly `src/components/message-bubble.tsx` retirement from this route; unit tests.

- [ ] `detail.tsx` KEEPS every effect/derivation verbatim (mark-read trio, divider index via `findNewMarkIndex`, archived redirect, contact/title derivation, composerDisabled, write-group handshake `handleGetWriteGroup`, ConnectionBanner condition, skeletons, autoscroll bottomRef + divider scroll) and maps to the view model:
  - timeline items: existing messages+systemEvents merge/sort → `ChatTimelineItem[]`; insert `new` at `dividerBeforeIndex`; insert `day` markers at date boundaries — label "today"/"yesterday"/`d MMM` (proto shows only "today"; older-day format is an inference — manifest note, Rung 4); sys text via existing `formatSystemEventMessage` (carry `system-event-<kind>` testids).
  - msg mapping: mine via `getAuthorAccountIDFromMessage === myAccountID`; author name/initials via existing `resolveDisplayName` path (group chats show names, proto shows author name on `them` rows); time via the app's existing bubble time format; deleted/malformed flags from the message state exactly as `message-bubble.tsx` derives them (read its lines 60–90); real attachments → `attSlot` built from the existing attachment rendering (move the img/blob-URL logic out of message-bubble into a small container-side `MessageAttachments` component — keep `message-attachments` testid + lightbox behavior if present); edit/delete → `menuSlot` from the existing menu markup restyled with kit tokens (keep `message-menu-btn`/`message-edit-btn`/`message-delete-btn`/edit-input/edit-save testids + handlers). Message EDITING state: keep the current editing UX (input + save) rendered in place of the bubble body — restyle minimally with kit tokens (PField-style input), Rung 4.
  - header: 1:1 title `@{contactName}` (mono rendering comes from PHeader's headMono port) / group title; sub only for groups: `// {N} members` from the existing member count; onOpenInfo → existing header-link target (`conversation-header-link` testid preserved on the PHeader onTitle button — extend PHeader with optional `data-testid` for the title button if needed, sanctioned); back arrow mobile-only via `useIsDesktop()` (`chat-back-arrow` testid on PHeader's back button — extend similarly).
  - composer: container renders `<ChatComposer>` wiring the existing send path (`handleSend`), attach → existing hidden file input (keep `composer-file-input`), pending-attachment chips + error → slots (restyle with kit tokens; keep `composer`/`composer-error` testids on the container wrapper).
  - `bubbleWidth`: `useIsDesktop() ? 460 : 190`.
- [ ] Old `MessageBubble` + old `Composer` visual markup stop rendering on this route (files stay until Phase 4; anything still importing them elsewhere is untouched).
- [ ] Route root stays pane-filling (it already is — `flex-1 flex flex-col min-w-0`).
- [ ] Unit tests: retarget those that render detail/composer/message-bubble internals; behavioral assertions stay.
- [ ] Gates: tsc, check-tokens, check-ui-purity, vitest, FULL parity, vite build.
- [ ] Commit: `feat(chat): conversation detail renders ChatScreen/ChatComposer presenters`

---

### Task 4: Wave exit

- [ ] Full battery + full chromium e2e run. Baseline: 43 green + 1 fixme. The messaging/media/group specs exercise this surface heavily — fix trivial selector drift (≤ ~15 lines, helpers preferred); structural failures get recorded in the manifest for Phase 4 (do not mask real regressions — investigate every failure before classifying).
- [ ] Manifest rows: chat surface Rung 1 (header/timeline/bubbles/composer/day-today/new-divider) + Rung 4 flags (edit/delete menu, deleted/malformed states, real attachments + lightbox, connection banner, composer error/chips, older-day marker format, group author names formatting if it deviates).
- [ ] Merge `--no-ff`: `Unit 10 Wave B: chat surface (prototype kit)`.

## Self-review notes

- The composer's real upload flow stays container-side; the presenter is visual-only — the file input element never enters src/ui.
- PHeader may need two optional testid props (title button, back button) — sanctioned deviation, keeps e2e stable.
- Bubble gains attSlot only; its proto placeholder mode is untouched and stays parity-locked.
- Day markers generalize a proto element that only shows "today" — flagged as partial inference.
