# Unit 9-6 — Chat Surfaces + Conversation Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the chat-detail header, message bubbles, composer, and conversation-settings (members) route to the canonical `proto.jsx` prototype — tappable header → settings, mobile-only back arrow, accent-filled own-bubbles with inline 8.5px timestamps, redesigned composer, and a members screen that redirects 1:1s to the other user's profile while giving groups an editable name + picture, admins/members split, and a per-member context menu.

**Architecture:** Three foundation files already render only their main panel into the `<AppShell>` outlet (the persistent sidebar is the shell's, mobile is full-screen via `md:hidden`). This unit restyles the existing `ConversationDetailRoute` header inline, rewrites the `MessageBubble` bubble/timestamp markup, restyles the standalone `Composer` component, and substantially reworks `MembersRoute` — adding a 1:1→profile redirect (mirroring `isOneToOneWith` from `src/jazz/conversation.ts`), an admins/members section split, a portal-free per-member context menu, and name/picture→profile links. The add-member picker stays an overlay (`ContactPicker` via `MobileBottomSheet`) — see Task 9 rationale. No schema changes; no new Jazz helpers.

**Tech Stack:** React 18 + TypeScript (strict), React Router v6, Tailwind v3 (token utilities only — `bg-panel`, `text-text`, `bg-arcan-accent`, `text-on-accent`, `rounded-avatar`, `rounded-pill`, `border-hairline`, `font-mono`), jazz-tools 0.20.18 (`.getDirectMembers()`, `$jazz.set`), Vitest + Testing Library for unit tests.

---

## Canonical design values (cite these in code comments)

From `design/proto.jsx` (`ChatScreen` ~L154, `ConvoSettingsScreen` ~L319, `Bubble`/`ownPaintP` ~L33-52) and `design/hf-chat.jsx` (`ChatHeader` ~L64, `Composer` ~L80, `Bubble` ~L120) / `design/hf-convo-settings.jsx`:

- **Header height:** 52-56px (`hf-chat.jsx` ChatHeader `height: 52`; proto `PHeader`). We use `px-4 py-3` (existing) which yields ~56px — keep.
- **Header avatar:** 34px in proto chat header (`size={34}`), rounded-rect (`rounded-avatar` = 10px radius). Keep `size={36}` already used by members; use `32` for chat header per existing detail.tsx — bump to **34** to match proto.
- **Back arrow:** `Icon d="back"`, `size={20}`, color `c.text2`, rendered ONLY when `mobile` (`hf-chat.jsx` L68: `{mobile && <Icon d="back" .../>}`). Small single chevron-left, NOT "← Back" text.
- **Own bubble paint (`ownPaintP`):** `bg = accentFill` (solid) → token `bg-arcan-accent`; `fg = onAccent` → `text-on-accent`; timestamp color `alpha(onAccent, .6)`. v5 skin uses `ownStyle: 'solid'` (accent fill). Gradient is an alternate; we ship **solid accent fill** (matches v5 locked direction).
- **Other bubble:** `bg = panel` → `bg-panel`; `fg = text` → `text-text`; border none (soft skin); timestamp color `dim` → `text-dim`.
- **Bubble radius:** `s.bubbleRadius` = **14px** in v5. Mine: bottom-right corner tightened to `max(2, 14-12)=2px`. Other: bottom-left tightened to 2px. → `rounded-[14px]` + corner override.
- **Timestamp:** inline at the END of the bubble, baseline-aligned (`alignItems: 'flex-end'`), font `500 8.5px/1` mono, `marginBottom: 1`. → `text-[8.5px] font-mono` inline at bubble end.
- **Bubble text:** `400 12.5px/1.45` body → `text-[12.5px] leading-[1.45]`.
- **New divider (`Row` who==='new'):** flex, accent hairlines + uppercase 9px mono "new" — already implemented as `NewMark` in detail.tsx; verify-only.
- **Composer:** border-top hairline, padding 10-11px, gap 9; attach icon left; pill input (`rounded-pill` since soft) height 38 with hairline border + bg-bg; send button 38x38 `rounded-pill`, `bg-arcan-accent` when text present else `bg-panel-2`.
- **ConvoSettings group card (`ConvoSettingsScreen` L334-341):** centered column, picture 70px (`rounded-avatar-lg`-ish; proto uses `radius+4`), camera overlay bottom-right 26px `rounded-pill` `bg-arcan-accent`; editable name (pencil) `700 18px`; subtitle `400 11px` dim "N members".
- **Section labels:** `600 9px` mono, `letter-spacing .16em`, uppercase, `text-dim` → `text-[9px] uppercase tracking-widest font-mono font-semibold text-dim`.
- **Member row (proto L322-329):** avatar 36 rounded-rect, name `600 12.5px` + "· you" dim, RolePill, kebab (`Icon d="dots"`) when not me.
- **Add people button (proto L345):** pill, `bg-arcan-accent`, plus icon + "add people" `600 11px`.
- **Leave button:** danger pill, full-width, "leave conversation" (lowercase).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/routes/conversations/detail.tsx` | Chat header → whole row taps to `/members`; mobile-only small back arrow; remove standalone Members button; avatar `size={34}` | Modify (header block L318-352) |
| `src/components/message-bubble.tsx` | Own = accent fill + on-accent text; other = panel; bubble radius 14 + tightened corner; inline 8.5px timestamp | Modify (render block) |
| `src/components/composer.tsx` | Pill input, attach icon, 38x38 accent send button | Modify (render block) |
| `src/routes/conversations/members.tsx` | 1:1 → `<Navigate to={/profile/<otherID>}>`; group card (editable name + 70px picture); admins/members split; per-member context menu; name/picture → profile; lowercase labels | Modify (substantial) |
| `tests/unit/routes/conversations/members-redirect.test.tsx` | 1:1 redirect + group-renders-settings behavior | Create |
| `tests/unit/components/message-bubble.test.tsx` | Own vs other bubble classes + inline timestamp position | Create |
| `tests/unit/routes/conversations/detail-header.test.tsx` | Header is a single link to members; no standalone Members button; back arrow present | Create |

`group-create-dialog.tsx` is OUT of scope (9-3-adjacent). `contact-picker.tsx` stays an overlay (Task 9).

---

## Conventions for every task

- Run unit tests inside the nix shell: `nix-shell --run "npx vitest run <path>"`.
- After each task: `nix-shell --run "npm run check-tokens"` must pass (no ad-hoc color/typography classes), then commit.
- Type-check with `nix-shell --run "npx tsc -b --noEmit"` before the final commit of each task that changes `.tsx`.
- Lowercase typography on all button/section labels per the v5/prototype tone (the spec's "Critical" note: members had sentence-case "Promote"/"Remove" — lowercase them).
- `git add` only the files the task names.

---

## Task 1: Chat header becomes a single tap-target to settings

**Files:**
- Modify: `src/routes/conversations/detail.tsx` (header block, lines ~318-352)
- Test: `tests/unit/routes/conversations/detail-header.test.tsx` (create)

The whole top row (minus the back arrow) links to `/conversations/:id/members`. Remove the standalone "👥 Members" button. Back arrow is mobile-only (`md:hidden`), a small single left-chevron icon (not "← Back" text). Avatar bumps to `size={34}` (proto). DISREGARD presence/verified chips.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routes/conversations/detail-header.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock Jazz so the route renders without a real node.
const GROUP = {
  getDirectMembers: () => [
    { account: { $jazz: { id: "co_zMe" } }, role: "admin" },
    { account: { $jazz: { id: "co_zBob" } }, role: "admin" },
  ],
  getRoleOf: () => "admin",
};
const CONVERSATION = {
  $isLoaded: true,
  $jazz: { id: "co_zConv", owner: GROUP },
  title: "retrieval-squad",
  messages: [],
  systemEvents: [],
  icon: undefined,
};

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    $jazz: { id: "co_zMe" },
    profile: { displayName: "decima" },
    root: { contactBook: [], knownConversations: [], lastReadAt: {} },
  }),
  useCoState: () => CONVERSATION,
}));
vi.mock("@/jazz/avatarResolver", () => ({
  resolveAvatarFileBlob: () => undefined,
  useRemoteAvatar: () => undefined,
}));
vi.mock("@/jazz/messages", () => ({
  sendMessage: vi.fn(),
  getAuthorAccountIDFromMessage: () => null,
}));
vi.mock("@/jazz/conversation", () => ({
  isArchived: () => false,
  ensureMyWriteGroup: vi.fn(),
}));

import { ConversationDetailRoute } from "@/routes/conversations/detail";

describe("ConversationDetailRoute header", () => {
  beforeEach(() => vi.clearAllMocks());

  function renderRoute() {
    return render(
      <MemoryRouter initialEntries={["/conversations/co_zConv"]}>
        <ConversationDetailRoute />
      </MemoryRouter>,
    );
  }

  test("header row is a single link to the members route", () => {
    const { getByTestId } = renderRoute();
    const headerLink = getByTestId("conversation-header-link");
    expect(headerLink.getAttribute("href")).toBe(
      "/conversations/co_zConv/members",
    );
  });

  test("no standalone Members button remains", () => {
    const { queryByTestId } = renderRoute();
    expect(queryByTestId("members-link")).toBeNull();
  });

  test("renders a mobile-only back arrow link to /conversations", () => {
    const { getByTestId } = renderRoute();
    const back = getByTestId("chat-back-arrow");
    expect(back.getAttribute("href")).toBe("/conversations");
    // mobile-only: hidden on md+ screens
    expect(back.className).toContain("md:hidden");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run "npx vitest run tests/unit/routes/conversations/detail-header.test.tsx"`
Expected: FAIL — `getByTestId("conversation-header-link")` not found (current header uses separate `members-link` button + `← Back` text link).

- [ ] **Step 3: Replace the header block**

In `src/routes/conversations/detail.tsx`, the `useParams` already gives `id`. The `ConversationAvatar` import stays. Replace the entire header `<div className="flex items-center gap-3 ...">…</div>` (lines ~318-352) with:

```tsx
      {/* Header — the whole row (minus the back arrow) taps to conversation
          settings (proto.jsx ChatScreen onTitle → convoset / profile, ~L179).
          Back arrow is mobile-only (desktop has the persistent sidebar) and a
          small single chevron (hf-chat.jsx L68: {mobile && <Icon d="back" …/>}).
          Presence/verified chips intentionally dropped. */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline bg-panel">
        <Link
          to="/conversations"
          aria-label="Back to conversations"
          data-testid="chat-back-arrow"
          className="md:hidden -ml-1 text-text-2 hover:text-text"
        >
          {/* small single left-chevron, 20px (proto back icon size) */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>

        <Link
          to={`/conversations/${id}/members`}
          data-testid="conversation-header-link"
          className="flex flex-1 min-w-0 items-center gap-3 hover:opacity-90"
          title="Conversation settings"
        >
          <ConversationAvatar
            conversationId={(conversation as any)?.$jazz?.id ?? ""}
            title={conversationTitle}
            icon={(conversation as any)?.icon}
            size={34}
            loadAs={me}
            data-testid="conversation-header-avatar"
          />
          <h1
            className="flex-1 min-w-0 font-semibold text-text truncate"
            data-testid="conversation-title"
          >
            {conversationTitle}
          </h1>
        </Link>
      </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nix-shell --run "npx vitest run tests/unit/routes/conversations/detail-header.test.tsx"`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify tokens + types**

Run: `nix-shell --run "npm run check-tokens"`
Expected: `✓ no ad-hoc Tailwind color/typography classes detected`

Run: `nix-shell --run "npx tsc -b --noEmit"`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/conversations/detail.tsx tests/unit/routes/conversations/detail-header.test.tsx
git commit -m "ui(unit-9-6): chat header is a single tap-target to settings; mobile-only back arrow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Ggzizsaz4VoafGc5HLkHu"
```

---

## Task 2: Restyle message bubbles — accent fill + inline 8.5px timestamp

**Files:**
- Modify: `src/components/message-bubble.tsx` (render block, lines ~130-212)
- Test: `tests/unit/components/message-bubble.test.tsx` (create)

Align to `proto.jsx` `Bubble` + `ownPaintP` (~L33-52): own = `bg-arcan-accent` + `text-on-accent`, other = `bg-panel` + `text-text`. Bubble radius 14 with the tail corner tightened to 2px (mine: bottom-right; other: bottom-left). Timestamp moves INLINE to the end of the bubble at 8.5px mono.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/message-bubble.test.tsx`:

```tsx
import { describe, test, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/jazz/avatarResolver", () => ({
  resolveAvatarFileBlob: () => undefined,
  useRemoteAvatar: () => undefined,
}));

import { MessageBubble } from "@/components/message-bubble";

const ME = { $jazz: { id: "co_zMe" } };
const baseMsg = (over: Record<string, unknown> = {}) => ({
  body: "hello there",
  sentAt: new Date("2026-06-23T09:10:00"),
  deleted: false,
  edited: false,
  attachments: [],
  ...over,
});

describe("MessageBubble styling", () => {
  test("own bubble uses accent fill + on-accent text", () => {
    const { getByTestId } = render(
      <MessageBubble
        message={baseMsg()}
        authorAccountID="co_zMe"
        authorDisplayName="decima"
        isMine
        me={ME}
      />,
    );
    const bubble = getByTestId("bubble-body");
    expect(bubble.className).toContain("bg-arcan-accent");
    expect(bubble.className).toContain("text-on-accent");
  });

  test("other bubble uses panel + text", () => {
    const { getByTestId } = render(
      <MessageBubble
        message={baseMsg()}
        authorAccountID="co_zBob"
        authorDisplayName="bob"
        isMine={false}
        me={ME}
      />,
    );
    const bubble = getByTestId("bubble-body");
    expect(bubble.className).toContain("bg-panel");
    expect(bubble.className).toContain("text-text");
    expect(bubble.className).not.toContain("bg-arcan-accent");
  });

  test("timestamp renders inline inside the bubble at 8.5px mono", () => {
    const { getByTestId } = render(
      <MessageBubble
        message={baseMsg()}
        authorAccountID="co_zMe"
        authorDisplayName="decima"
        isMine
        me={ME}
      />,
    );
    const time = getByTestId("bubble-time");
    expect(time.className).toContain("text-[8.5px]");
    expect(time.className).toContain("font-mono");
    // inline: the timestamp is a descendant of the bubble body element
    expect(getByTestId("bubble-body").contains(time)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run "npx vitest run tests/unit/components/message-bubble.test.tsx"`
Expected: FAIL — `getByTestId("bubble-body")` not found (current bubble uses `bg-primary`/`bg-muted` with no `bubble-body` testid; timestamp is a separate header row above the bubble).

- [ ] **Step 3: Rewrite the non-edit / non-deleted render branch**

In `src/components/message-bubble.tsx`, the `formattedTime` derivation stays. Replace the author/timestamp header `<div className="text-xs text-muted-foreground mb-1">…</div>` and the message-body `<div className="inline-block max-w-md rounded-lg …">` so the timestamp lives INSIDE the bubble. The new structure for the content column (`<div className="flex-1 min-w-0 …">`):

```tsx
      <div className={`flex-1 min-w-0 flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
        {/* author name above the bubble for OTHER messages only (proto Row
            ~L65-66: own messages omit the name) */}
        {!isMine && (
          <span className="text-[9.5px] font-semibold text-text-2 ml-1">
            {authorDisplayName}
          </span>
        )}

        {editing ? (
          <div className="inline-flex flex-col gap-1 items-end">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={2}
              className="rounded-r-2 border border-hairline bg-panel p-2 text-sm w-64"
              data-testid="message-edit-input"
            />
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                cancel
              </Button>
              <Button size="sm" onClick={handleSaveEdit} data-testid="message-edit-save">
                save
              </Button>
            </div>
          </div>
        ) : (
          <>
            {(message.body || attachments.length === 0) && (
              <div
                data-testid="bubble-body"
                className={`max-w-md px-[11px] py-2 rounded-[14px] ${
                  isMine
                    ? "bg-arcan-accent text-on-accent rounded-br-[2px]"
                    : "bg-panel text-text rounded-bl-[2px]"
                }`}
              >
                {/* bubble text + inline timestamp, baseline-aligned (proto Bubble
                    ~L46-49: flex items-end gap 8; time = 500 8.5px mono) */}
                <div className="flex items-end gap-2">
                  <span className="flex-1 text-[12.5px] leading-[1.45] whitespace-pre-wrap break-words">
                    {message.body}
                  </span>
                  <span
                    data-testid="bubble-time"
                    className={`shrink-0 mb-px text-[8.5px] leading-none font-mono ${
                      isMine ? "text-on-accent/60" : "text-dim"
                    }`}
                  >
                    {formattedTime}
                  </span>
                </div>
                {message.edited && (
                  <span className="block text-[8.5px] font-mono opacity-70 mt-0.5">
                    (edited)
                  </span>
                )}
              </div>
            )}
            {attachments.length > 0 && (
              <div
                className={`mt-1 flex flex-wrap gap-2 ${isMine ? "justify-end" : "justify-start"}`}
                data-testid="message-attachments"
              >
                {attachments.map((att: any, i: number) => (
                  <AttachmentTile
                    key={(att as any)?.$jazz?.id ?? i}
                    attachment={att}
                    mode="sent"
                    loadAs={me}
                    onImageClick={() => void openLightbox(att)}
                  />
                ))}
              </div>
            )}
            {/* hover ⋮ menu trigger for own messages (kept; relocated below bubble) */}
            {isMine && (
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="opacity-0 group-hover:opacity-100 text-dim text-xs mt-0.5"
                data-testid="message-menu-btn"
                aria-label="Message actions"
              >
                ⋮
              </button>
            )}
          </>
        )}

        {menuOpen && isMine && !editing && (
          <div className="mt-1 flex justify-end gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMenuOpen(false);
                setEditing(true);
              }}
              data-testid="message-edit-btn"
            >
              edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMenuOpen(false);
                void handleDelete();
              }}
              data-testid="message-delete-btn"
            >
              delete
            </Button>
          </div>
        )}
      </div>
```

Note: the condition `(message.body || attachments.length === 0)` ensures an attachment-only message still gets a body bubble only when there's no attachment; tweak if your message always has body. Keep `message.body &&` semantics if attachment-only messages should show no empty bubble — use `{message.body && ( … bubble … )}` and drop the `|| attachments.length === 0`. Use `{message.body && (`:

```tsx
            {message.body && (
              <div
                data-testid="bubble-body"
                className={`max-w-md px-[11px] py-2 rounded-[14px] ${
                  isMine
                    ? "bg-arcan-accent text-on-accent rounded-br-[2px]"
                    : "bg-panel text-text rounded-bl-[2px]"
                }`}
              >
```

(Use this `{message.body && (` form — it matches the original guard and keeps attachment-only messages bubble-free.)

- [ ] **Step 4: Run test to verify it passes**

Run: `nix-shell --run "npx vitest run tests/unit/components/message-bubble.test.tsx"`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify tokens + types**

Run: `nix-shell --run "npm run check-tokens"`
Expected: pass (note `bg-primary`/`bg-muted` are removed; `text-on-accent/60` is a token-derived opacity utility, allowed).

Run: `nix-shell --run "npx tsc -b --noEmit"`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/message-bubble.tsx tests/unit/components/message-bubble.test.tsx
git commit -m "ui(unit-9-6): accent-fill own bubbles + inline 8.5px timestamp per prototype

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Ggzizsaz4VoafGc5HLkHu"
```

---

## Task 3: Restyle the composer

**Files:**
- Modify: `src/components/composer.tsx` (render block, lines ~157-216)

Align to `proto.jsx` ChatScreen composer (~L189-200): hairline border-top, attach icon left, a pill text input (height 38), and a 38×38 pill send button that fills with the accent when there's text. Use a single-line `<input>` look but keep the multi-line `<textarea>` for shift+enter behavior — style it as a rounded pill that grows minimally.

- [ ] **Step 1: Replace the composer render block**

In `src/components/composer.tsx`, replace the outer `<div className="border-t border-border" …>` through its end with:

```tsx
  return (
    <div className="border-t border-hairline bg-bg" data-testid="composer">
      <ComposerAttachmentTray pending={pending} onRemove={handleRemove} />
      {error && (
        <div
          className="px-3 py-2 text-xs text-red"
          data-testid="composer-error"
        >
          {error}
        </div>
      )}
      <div
        className="flex items-center gap-2 px-3 pt-3"
        style={{
          // 12px baseline + iOS safe-area on chat-detail (mobile full-screen).
          paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
          data-testid="composer-file-input"
        />
        {/* attach (proto: paperclip/plus icon, text-2) */}
        <button
          type="button"
          onClick={handlePickClick}
          disabled={disabled || sending}
          aria-label="Add attachment"
          data-testid="composer-attach-btn"
          className="shrink-0 text-text-2 hover:text-text disabled:opacity-50"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" />
          </svg>
        </button>

        {/* pill input wrapper (proto: rounded-pill, hairline, bg-bg, height 38) */}
        <div className="flex flex-1 items-center rounded-pill border border-hairline bg-bg px-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            onPaste={handlePaste}
            disabled={disabled || sending}
            placeholder={disabled ? "no one else is in this chat" : placeholder}
            rows={1}
            className="flex-1 resize-none bg-transparent py-2 text-[12.5px] text-text placeholder:text-dim outline-none"
            data-testid="composer-input"
          />
        </div>

        {/* 38x38 pill send button — accent fill when sendable (proto L197-199) */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!sendEnabled}
          aria-label="Send message"
          data-testid="composer-send-btn"
          className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-pill transition-colors ${
            sendEnabled
              ? "bg-arcan-accent text-on-accent"
              : "bg-panel-2 text-dim"
          }`}
        >
          {sending ? (
            <span className="text-[10px] font-mono">…</span>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a1 1 0 0 0-1.39 1.21L4 11l11 1-11 1-1.98 6.19a1 1 0 0 0 1.38 1.21z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
```

Update the default prop placeholder to lowercase to match tone — change `placeholder = "Type a message…"` to `placeholder = "type a message…"` in the function signature.

- [ ] **Step 2: Run the composer-adjacent attachment e2e is NOT run here (it's Playwright). Verify unit suite still green**

Run: `nix-shell --run "npx vitest run tests/unit/components"`
Expected: PASS (no composer unit test exists; this confirms nothing else broke). If a `composer` test surfaces later it must keep `data-testid="composer-send-btn"`, `composer-input`, `composer-attach-btn`, `composer-file-input`, `composer-error` — all preserved above.

- [ ] **Step 3: Verify tokens + types**

Run: `nix-shell --run "npm run check-tokens"`
Expected: pass.

Run: `nix-shell --run "npx tsc -b --noEmit"`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/composer.tsx
git commit -m "ui(unit-9-6): restyle composer — pill input + accent send button per prototype

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Ggzizsaz4VoafGc5HLkHu"
```

---

## Task 4: Verify the new-messages divider renders + matches design

**Files:**
- Modify: `src/routes/conversations/detail.tsx` (`NewMark` component, lines ~58-71) — confirm-and-align only
- Test: `tests/unit/routes/conversations/detail-header.test.tsx` (extend)

The `NewMark` divider already exists (detail.tsx L58-71) and matches `proto.jsx` `Row` who==='new' (L56-59): accent hairlines + uppercase 9px "new". This task confirms it renders when there's an unread incoming message, and that its classes match the design. No behavior change to placement logic (`findNewMarkIndex`).

- [ ] **Step 1: Add a failing assertion to the header test file**

Append to `tests/unit/routes/conversations/detail-header.test.tsx` a new describe block. First adjust the top-level mocks so a message exists and is unread. Replace the `useCoState` + `useAccount` mock objects' messages/lastReadAt to make the divider appear:

```tsx
describe("NewMark divider", () => {
  test("the NewMark divider markup matches the prototype tokens", () => {
    // Render the standalone NewMark by importing it is not exported; instead
    // assert the divider is keyed correctly via the data-testid contract used
    // by the auto-scroll effect.
    // We verify the class contract on a minimal element to lock the design:
    const div = document.createElement("div");
    div.className =
      "flex items-center gap-2 my-2 px-3";
    expect(div.className).toContain("items-center");
  });
});
```

This is a weak test. Replace it with a real render-based assertion: extend the route mock so `useCoState` returns a conversation with one incoming message newer than `lastReadAt`. Update the FILE-LEVEL `CONVERSATION` and `useAccount` mock at the top to:

```tsx
const INCOMING = {
  $jazz: { id: "co_zMsg1" },
  body: "hey — got a minute?",
  sentAt: new Date("2026-06-23T09:30:00"),
  deleted: false,
  edited: false,
  attachments: [],
};
// in CONVERSATION: messages: [INCOMING]
// add to the top-level mocks:
vi.mock("@/jazz/messages", () => ({
  sendMessage: vi.fn(),
  getAuthorAccountIDFromMessage: () => "co_zBob", // incoming (not me)
}));
// in useAccount mock root: lastReadAt: {} (no entry → anchor 0 → message unread)
```

Then the real assertion:

```tsx
  test("renders the new-messages divider for an unread incoming message", async () => {
    const { findByTestId } = render(
      <MemoryRouter initialEntries={["/conversations/co_zConv"]}>
        <ConversationDetailRoute />
      </MemoryRouter>,
    );
    const divider = await findByTestId("new-messages-divider");
    expect(divider.className).toContain("text-arcan-accent");
    expect(divider.textContent?.toLowerCase()).toContain("new");
  });
```

(Remove the weak placeholder test.)

- [ ] **Step 2: Run test to verify it passes (divider already implemented)**

Run: `nix-shell --run "npx vitest run tests/unit/routes/conversations/detail-header.test.tsx"`
Expected: the divider test PASSES because `NewMark` is already implemented. If it FAILS because `getAuthorAccountIDFromMessage` mock conflicts with Task 1's mock (which returned `null`), reconcile: the file's single `vi.mock("@/jazz/messages", …)` must return `"co_zBob"` and Task 1's header tests must still pass (they don't assert author). Update Task 1's mock to `getAuthorAccountIDFromMessage: () => "co_zBob"` and keep messages empty in the header-only tests by overriding per-test if needed.

If reconciliation is awkward, split into a dedicated file `tests/unit/routes/conversations/detail-divider.test.tsx` with its own mocks. Prefer the split if the single-file mock fights you.

- [ ] **Step 3: Align NewMark classes if any drift**

Confirm `NewMark` in detail.tsx reads exactly:

```tsx
function NewMark() {
  return (
    <div
      className="flex items-center gap-2 my-2 px-3"
      data-testid="new-messages-divider"
    >
      <div className="flex-1 h-px bg-arcan-accent opacity-50" />
      <span className="text-[9px] uppercase tracking-widest font-semibold text-arcan-accent font-mono">
        new
      </span>
      <div className="flex-1 h-px bg-arcan-accent opacity-50" />
    </div>
  );
}
```

This already matches the prototype (accent hairlines, uppercase 9px mono). No edit needed unless drift is found.

- [ ] **Step 4: Verify tokens**

Run: `nix-shell --run "npm run check-tokens"`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/routes/conversations/
git commit -m "test(unit-9-6): verify new-messages divider renders + matches prototype tokens

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Ggzizsaz4VoafGc5HLkHu"
```

---

## Task 5: Members route — redirect 1:1 conversations to the other user's profile

**Files:**
- Modify: `src/routes/conversations/members.tsx` (add a 1:1 detection + `<Navigate>` after the loaded guard)
- Test: `tests/unit/routes/conversations/members-redirect.test.tsx` (create)

When the conversation is a 2-person DM (exactly two direct admin/writer members = me + one other), the `/members` route must `<Navigate>` to `/profile/<other-id>` (`replace`). No standalone DM settings screen. Mirror `isOneToOneWith` from `src/jazz/conversation.ts` and the `contact` derivation already in detail.tsx (L199-229).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routes/conversations/members-redirect.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const navigateSpy = vi.fn();

// A reusable mock factory so each test can swap the group's members.
let directMembers: Array<{ account: { $jazz: { id: string } }; role: string; id: string }> = [];

const GROUP = {
  getDirectMembers: () => directMembers,
  getRoleOf: (id: string) => directMembers.find((m) => m.account.$jazz.id === id)?.role,
};
const CONVERSATION = {
  $isLoaded: true,
  $jazz: { id: "co_zConv", owner: GROUP },
  title: "retrieval-squad",
  messages: [],
  icon: undefined,
};

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    $jazz: { id: "co_zMe" },
    profile: { displayName: "decima" },
    root: { contactBook: [], knownConversations: [] },
  }),
  useCoState: () => CONVERSATION,
}));
vi.mock("@/jazz/avatarResolver", () => ({
  resolveAvatarFileBlob: () => undefined,
  useRemoteAvatar: () => undefined,
}));
vi.mock("@/jazz/displayName", () => ({ resolveDisplayName: () => "bob" }));
vi.mock("@/jazz/conversation", () => ({
  isArchived: () => false,
  addMemberToConversation: vi.fn(),
  removeMemberFromConversation: vi.fn(),
  promoteToAdmin: vi.fn(),
  leaveConversation: vi.fn(),
  isLastAdmin: () => false,
  updateConversationTitle: vi.fn(),
  requestConnectionFromGroupMember: vi.fn(),
}));
vi.mock("@/jazz/avatar", () => ({ setConversationIcon: vi.fn() }));
vi.mock("@/components/toast", () => ({ useToast: () => vi.fn() }));

import { MembersRoute } from "@/routes/conversations/members";

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/conversations/co_zConv/members"]}>
      <Routes>
        <Route path="/conversations/:id/members" element={<MembersRoute />} />
        <Route
          path="/profile/:accountID"
          element={<div data-testid="profile-stub" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MembersRoute 1:1 redirect", () => {
  beforeEach(() => {
    navigateSpy.mockClear();
  });

  test("a 2-person DM redirects to the other user's profile", () => {
    directMembers = [
      { account: { $jazz: { id: "co_zMe" } }, role: "admin", id: "co_zMe" },
      { account: { $jazz: { id: "co_zBob" } }, role: "admin", id: "co_zBob" },
    ];
    const { getByTestId, queryByTestId } = renderAt();
    expect(getByTestId("profile-stub")).toBeTruthy();
    expect(queryByTestId("members-route")).toBeNull();
  });

  test("a 3-person group renders the settings screen (no redirect)", () => {
    directMembers = [
      { account: { $jazz: { id: "co_zMe" } }, role: "admin", id: "co_zMe" },
      { account: { $jazz: { id: "co_zBob" } }, role: "writer", id: "co_zBob" },
      { account: { $jazz: { id: "co_zCarol" } }, role: "writer", id: "co_zCarol" },
    ];
    const { getByTestId, queryByTestId } = renderAt();
    expect(getByTestId("members-route")).toBeTruthy();
    expect(queryByTestId("profile-stub")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nix-shell --run "npx vitest run tests/unit/routes/conversations/members-redirect.test.tsx"`
Expected: FAIL — the 1:1 case renders `members-route` instead of redirecting (`profile-stub` not found).

- [ ] **Step 3: Add the 1:1 detection + Navigate**

In `src/routes/conversations/members.tsx`, add `Navigate` to the react-router import:

```tsx
import { useParams, useNavigate, Link, Navigate } from "react-router-dom";
```

After the `// ---- derive members from group ----` block computes `rawMembers` and `myAccountID` (right after `const currentMemberAccountIDs = …`, before `// ---- handlers ----`), insert:

```tsx
  // 1:1 conversations have no standalone settings screen — redirect to the
  // other participant's profile. A DM is exactly two direct admin/writer
  // members (me + one other); mirrors isOneToOneWith() in jazz/conversation.ts
  // and the `contact` derivation in detail.tsx. Spec 9-6 §3.4(a).
  const participants = rawMembers.filter(
    (m) => m.role === "admin" || m.role === "writer",
  );
  if (participants.length === 2) {
    const other = participants.find((m) => m.accountID !== myAccountID);
    if (other) {
      return <Navigate to={`/profile/${other.accountID}`} replace />;
    }
  }
```

Note: `rawMembers` already only contains admin/writer roles (the loop skips others), so `participants` equals `rawMembers` here — the explicit filter documents intent and is robust if the upstream loop changes. This return sits AFTER all hooks (useAccount/useCoState/useEffect are above the loaded guards), so Rules of Hooks hold.

- [ ] **Step 4: Run test to verify it passes**

Run: `nix-shell --run "npx vitest run tests/unit/routes/conversations/members-redirect.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify tokens + types**

Run: `nix-shell --run "npm run check-tokens"` → pass.
Run: `nix-shell --run "npx tsc -b --noEmit"` → no errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/conversations/members.tsx tests/unit/routes/conversations/members-redirect.test.tsx
git commit -m "feat(unit-9-6): 1:1 conversation settings redirect to the other user's profile

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Ggzizsaz4VoafGc5HLkHu"
```

---

## Task 6: Members route — group card (large editable picture + editable name, centered)

**Files:**
- Modify: `src/routes/conversations/members.tsx` (replace the header block + add a centered group card; lines ~400-524)

Replace the cramped inline header (back link + avatar + title + add-member) with the prototype's layout: a small mobile-only back arrow header bar, then a centered group card with a **70px editable picture** (camera overlay, admins only) + **editable group name** (pencil, admins only) + "N members" subtitle. The picture is editable for groups only (1:1 already redirects, so this code path is always a group).

- [ ] **Step 1: Replace the header + insert the group card**

In `members.tsx`, replace the entire header `<div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-panel">…</div>` (which currently contains the back link, avatar+camera, title edit, and add-member button) with TWO pieces:

(a) a slim header bar (mobile-only back arrow + "conversation settings" title):

```tsx
      {/* Slim header bar — mobile-only back arrow (desktop uses the sidebar).
          proto ConvoSettingsScreen PHeader title="conversation settings". */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline bg-panel">
        <Link
          to={`/conversations/${id}`}
          aria-label="Back to conversation"
          data-testid="back-btn"
          className="md:hidden -ml-1 text-text-2 hover:text-text"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="flex-1 font-semibold text-text">conversation settings</h1>
      </div>
```

(b) the centered group card (proto `ConvoSettingsScreen` L334-341). Place it as the FIRST child of the scroll body. The existing `iconInputRef`, `handleIconChange`, `titleEditing`, `titleDraft`, `startTitleEdit`, `saveTitleEdit`, `cancelTitleEdit` handlers are reused unchanged:

```tsx
      {/* Group card — centered picture + editable name (group only; 1:1 redirects
          before reaching here). proto ConvoSettingsScreen ~L334-341. */}
      <div className="flex flex-col items-center gap-2 px-[18px] pt-6 pb-[18px] border-b border-hairline">
        <div className="relative">
          <ConversationAvatar
            conversationId={(conversation as any)?.$jazz?.id ?? ""}
            title={conversationTitle}
            icon={(conversation as any)?.icon}
            size={70}
            loadAs={me}
            data-testid="members-header-avatar"
          />
          {iAmAdmin && (
            <>
              <input
                ref={iconInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleIconChange}
                data-testid="conversation-icon-input"
              />
              <button
                type="button"
                onClick={() => iconInputRef.current?.click()}
                disabled={iconUploading || actionInProgress}
                aria-label="Change group picture"
                data-testid="conversation-icon-upload"
                className="absolute -bottom-0.5 -right-0.5 w-[26px] h-[26px] rounded-pill bg-arcan-accent text-on-accent border-2 border-bg flex items-center justify-center"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </button>
            </>
          )}
        </div>

        {titleEditing ? (
          <div className="flex items-center gap-2">
            <input
              ref={titleInputRef}
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value.slice(0, 60))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveTitleEdit();
                } else if (e.key === "Escape") {
                  cancelTitleEdit();
                }
              }}
              maxLength={60}
              disabled={actionInProgress}
              className="border border-hairline rounded-r-2 bg-panel px-2 py-1 text-lg font-semibold text-text outline-none focus:border-arcan-accent"
              data-testid="group-title-edit-input"
            />
            <Button size="sm" onClick={() => void saveTitleEdit()} disabled={!titleDraft.trim() || actionInProgress} data-testid="group-title-save-btn">
              save
            </Button>
            <Button size="sm" variant="outline" onClick={cancelTitleEdit} disabled={actionInProgress} data-testid="group-title-cancel-btn">
              cancel
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={iAmAdmin ? startTitleEdit : undefined}
            disabled={!iAmAdmin}
            className={`flex items-center gap-2 ${iAmAdmin ? "cursor-pointer" : "cursor-default"}`}
            data-testid="group-title-display"
            title={iAmAdmin ? "Click to edit name" : undefined}
          >
            <span className="text-lg font-semibold text-text">{conversationTitle}</span>
            {iAmAdmin && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-dim" aria-hidden="true" data-testid="group-title-edit-btn">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            )}
          </button>
        )}

        <span className="text-[11px] text-dim font-mono" data-testid="members-count">
          {rawMembers.length} {rawMembers.length === 1 ? "member" : "members"}
        </span>
      </div>
```

Notes:
- `border-bg` requires the `bg` color token exposed as a border utility. Verify `border-bg` resolves; if check-tokens or tailwind doesn't know `border-bg`, use an inline style `style={{ borderColor: "var(--color-bg)" }}` with `className="border-2"` instead. (The camera overlay's 2px ring is `bg` colored per proto.)
- `group-title-edit-btn` is now an inline `<svg>` (the pencil) but the prior tests reference it as a `<button>`. Since the whole name is now a button (`group-title-display`), keep the pencil as a decorative svg with the testid — but if an existing e2e (`group-title-edit.spec.ts`) clicks `group-title-edit-btn` expecting a button, KEEP a real `<button>` for the pencil. Use a nested button instead:

```tsx
            {iAmAdmin && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); startTitleEdit(); }}
                aria-label="Edit group name"
                data-testid="group-title-edit-btn"
                className="text-dim hover:text-text"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </button>
            )}
```

To avoid a button-inside-button HTML violation, make the name `group-title-display` a `<div>` with an inner clickable `<button>` for the text instead of wrapping both in one button:

```tsx
        ) : (
          <div className="flex items-center gap-2" data-testid="group-title-display">
            <button
              type="button"
              onClick={iAmAdmin ? startTitleEdit : undefined}
              disabled={!iAmAdmin}
              className="text-lg font-semibold text-text disabled:cursor-default"
            >
              {conversationTitle}
            </button>
            {iAmAdmin && (
              <button
                type="button"
                onClick={startTitleEdit}
                aria-label="Edit group name"
                data-testid="group-title-edit-btn"
                className="text-dim hover:text-text"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </button>
            )}
          </div>
        )}
```

Use THIS `<div>`-wrapped form (no button-in-button).

- [ ] **Step 2: Run the existing group-title e2e contract is Playwright (not run here). Run the unit suite**

Run: `nix-shell --run "npx vitest run tests/unit/routes/conversations"`
Expected: PASS (members-redirect tests still green; the group case now renders the card).

- [ ] **Step 3: Verify tokens + types**

Run: `nix-shell --run "npm run check-tokens"` → pass.
Run: `nix-shell --run "npx tsc -b --noEmit"` → no errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/conversations/members.tsx
git commit -m "ui(unit-9-6): group settings card — large editable picture + editable name (group only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Ggzizsaz4VoafGc5HLkHu"
```

---

## Task 7: Members route — split list into admins + members sections; lowercase labels; name/picture → profile

**Files:**
- Modify: `src/routes/conversations/members.tsx` (`MemberRow` + the list render block)
- Test: `tests/unit/routes/conversations/members-redirect.test.tsx` (extend with section + link assertions)

Split the flat member list into an "admins" section and a "members" section (proto `ConvoSettingsScreen` L342-349). Clicking a member's name OR picture navigates to `/profile/<id>`. Lowercase the per-member action labels ("promote"/"remove"). Section labels use the 9px uppercase mono tokens.

- [ ] **Step 1: Add failing section + link assertions**

Extend `tests/unit/routes/conversations/members-redirect.test.tsx` with a new describe (uses the 3-person group from Task 5):

```tsx
describe("MembersRoute group sections + member links", () => {
  beforeEach(() => {
    directMembers = [
      { account: { $jazz: { id: "co_zMe" } }, role: "admin", id: "co_zMe" },
      { account: { $jazz: { id: "co_zBob" } }, role: "writer", id: "co_zBob" },
      { account: { $jazz: { id: "co_zCarol" } }, role: "writer", id: "co_zCarol" },
    ];
  });

  test("renders an admins section and a members section", () => {
    const { getByTestId } = renderAt();
    expect(getByTestId("members-section-admins")).toBeTruthy();
    expect(getByTestId("members-section-writers")).toBeTruthy();
  });

  test("a member's name links to their profile", () => {
    const { getByTestId } = renderAt();
    const link = getByTestId("member-profile-link-co_zBob");
    expect(link.getAttribute("href")).toBe("/profile/co_zBob");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `nix-shell --run "npx vitest run tests/unit/routes/conversations/members-redirect.test.tsx"`
Expected: FAIL — `members-section-admins` / `member-profile-link-co_zBob` not found.

- [ ] **Step 3: Rework MemberRow + the list block**

Rewrite the `MemberRow` component so the avatar + name are a `<Link>` to the profile, the action buttons are lowercase, and (for the kebab in Task 8) the row is `relative`. For now, keep inline action buttons (promote/remove); the kebab menu is Task 8. Replace the `MemberRow` function with:

```tsx
function MemberRow(props: {
  member: { accountID: string; displayName: string; role: "writer" | "admin" };
  isMe: boolean;
  me: any;
  group: any;
  iAmAdmin: boolean;
  isAlreadyContact: boolean;
  actionInProgress: boolean;
  onPromote: () => void;
  onRemove: () => void;
  onRequestConnection: () => void;
}) {
  const { member, isMe, me, group, iAmAdmin, isAlreadyContact, actionInProgress, onPromote, onRemove, onRequestConnection } = props;
  const localAvatar = isMe
    ? resolveAvatarFileBlob({ accountID: member.accountID, me, group })
    : undefined;
  const remoteAvatar = useRemoteAvatar(isMe ? null : member.accountID);
  const avatar = localAvatar ?? remoteAvatar;

  return (
    <div
      className="relative flex items-center gap-3 px-[10px] py-[9px] rounded-r-3"
      data-testid={`member-row-${member.accountID}`}
    >
      {/* avatar + name → the member's profile (proto: tap name/picture → profile) */}
      <Link
        to={`/profile/${member.accountID}`}
        data-testid={`member-profile-link-${member.accountID}`}
        className="flex flex-1 min-w-0 items-center gap-3 hover:opacity-90"
      >
        <Avatar
          src={avatar}
          initials={member.displayName[0] ?? "?"}
          size="md"
          loadAs={me}
          data-testid={`member-avatar-${member.accountID}`}
        />
        <span className="flex-1 text-[12.5px] font-semibold text-text truncate">
          {member.displayName}
          {isMe && <span className="ml-1 font-normal text-dim">· you</span>}
        </span>
      </Link>

      <RolePill role={member.role} />

      {!isMe && !isAlreadyContact && (
        <Button
          size="sm"
          variant="outline"
          className="text-xs flex-shrink-0"
          onClick={onRequestConnection}
          disabled={actionInProgress}
          data-testid={`request-connection-${member.accountID}`}
        >
          request connection
        </Button>
      )}

      {iAmAdmin && !isMe && member.role === "writer" && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="text-xs"
            onClick={onPromote}
            disabled={actionInProgress}
            data-testid={`promote-${member.accountID}`}
          >
            promote
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-red hover:bg-red/10"
            onClick={onRemove}
            disabled={actionInProgress}
            data-testid={`remove-${member.accountID}`}
          >
            remove
          </Button>
        </div>
      )}
    </div>
  );
}
```

(Note `<li>` → `<div>`: the parent will no longer be a `<ul>` since we now have two sections; keep semantics simple with `<div>` rows.)

Then replace the flat list block (the `<div className="flex-1 overflow-y-auto p-4">…</div>` containing the single `<ul data-testid="members-list">`) with the two-section body. Compute the split from `rawMembers` (already sorted admins-first):

```tsx
      {/* Member list — split into admins + members (proto ConvoSettingsScreen L342-349) */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {/* admins */}
        <div className="flex items-center gap-2 px-2 pt-1 pb-2">
          <span className="flex-1 text-[9px] uppercase tracking-widest font-mono font-semibold text-dim">
            admins
          </span>
          {iAmAdmin && (
            <Button
              size="sm"
              variant="primary"
              className="h-7 px-3 text-[11px]"
              onClick={() => setAddPickerOpen(true)}
              disabled={actionInProgress}
              data-testid="add-member-btn"
            >
              + add people
            </Button>
          )}
        </div>
        <div data-testid="members-section-admins">
          {rawMembers
            .filter((m) => m.role === "admin")
            .map((member) => (
              <MemberRow
                key={member.accountID}
                member={member}
                isMe={member.accountID === myAccountID}
                me={me}
                group={group}
                iAmAdmin={iAmAdmin}
                isAlreadyContact={knownContactIDs.has(member.accountID)}
                actionInProgress={actionInProgress}
                onPromote={() => void handlePromote(member.accountID)}
                onRemove={() => void handleRemove(member.accountID)}
                onRequestConnection={async () => {
                  try {
                    await requestConnectionFromGroupMember(me as any, member.accountID);
                    toast({ icon: "check", text: "request sent", tone: "accent" });
                  } catch {
                    toast({ icon: "alert", text: "couldn't send request", tone: "error" });
                  }
                }}
              />
            ))}
        </div>

        {/* members (writers) */}
        <div className="px-2 pt-3.5 pb-2">
          <span className="text-[9px] uppercase tracking-widest font-mono font-semibold text-dim">
            members
          </span>
        </div>
        <div data-testid="members-section-writers">
          {rawMembers
            .filter((m) => m.role === "writer")
            .map((member) => (
              <MemberRow
                key={member.accountID}
                member={member}
                isMe={member.accountID === myAccountID}
                me={me}
                group={group}
                iAmAdmin={iAmAdmin}
                isAlreadyContact={knownContactIDs.has(member.accountID)}
                actionInProgress={actionInProgress}
                onPromote={() => void handlePromote(member.accountID)}
                onRemove={() => void handleRemove(member.accountID)}
                onRequestConnection={async () => {
                  try {
                    await requestConnectionFromGroupMember(me as any, member.accountID);
                    toast({ icon: "check", text: "request sent", tone: "accent" });
                  } catch {
                    toast({ icon: "alert", text: "couldn't send request", tone: "error" });
                  }
                }}
              />
            ))}
        </div>

        {rawMembers.length === 0 && (
          <p className="text-sm text-dim text-center py-8">no members found.</p>
        )}
      </div>
```

The `add-member-btn` moves into the admins section header (matches proto's "add people" pill beside the "admins" label). Remove the old admin-only `add member` `<Button>` from the now-deleted top header (already removed in Task 6).

- [ ] **Step 4: Run to verify it passes**

Run: `nix-shell --run "npx vitest run tests/unit/routes/conversations/members-redirect.test.tsx"`
Expected: PASS (all describes: redirect, sections, links).

- [ ] **Step 5: Verify tokens + types**

Run: `nix-shell --run "npm run check-tokens"` → pass.
Run: `nix-shell --run "npx tsc -b --noEmit"` → no errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/conversations/members.tsx tests/unit/routes/conversations/members-redirect.test.tsx
git commit -m "ui(unit-9-6): split members into admins/members sections; name+picture link to profile; lowercase actions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Ggzizsaz4VoafGc5HLkHu"
```

---

## Task 8: Members route — per-member context (kebab) menu for actions

**Files:**
- Modify: `src/routes/conversations/members.tsx` (`MemberRow`: collapse the inline action buttons into a ⋮ kebab menu)
- Test: `tests/unit/routes/conversations/members-redirect.test.tsx` (extend with kebab-toggle assertion)

Per the prototype (`hf-convo-settings.jsx` MemberRow L33-40, proto `ConvoSettingsScreen` L327), member actions collapse into a per-row kebab (⋮) that opens a small dropdown with the available actions (promote to admin / remove / request connection). Mobile-friendly; closes on outside-action. Implemented as a row-local `useState` (no portal — the dropdown is absolutely positioned within the `relative` row).

- [ ] **Step 1: Add a failing kebab assertion**

Append to the `MembersRoute group sections + member links` describe:

```tsx
  test("a member row exposes a kebab that toggles an actions menu", () => {
    const { getByTestId, queryByTestId } = renderAt();
    expect(queryByTestId("member-menu-co_zBob")).toBeNull();
    fireEvent.click(getByTestId("member-kebab-co_zBob"));
    const menu = getByTestId("member-menu-co_zBob");
    expect(menu).toBeTruthy();
    // promote + remove actions inside the menu
    expect(getByTestId("promote-co_zBob")).toBeTruthy();
    expect(getByTestId("remove-co_zBob")).toBeTruthy();
  });
```

Add `fireEvent` to the import at the top of the test file:

```tsx
import { render, fireEvent } from "@testing-library/react";
```

- [ ] **Step 2: Run to verify it fails**

Run: `nix-shell --run "npx vitest run tests/unit/routes/conversations/members-redirect.test.tsx"`
Expected: FAIL — `member-kebab-co_zBob` not found (Task 7 rendered inline buttons, no kebab).

- [ ] **Step 3: Convert MemberRow inline actions to a kebab menu**

In `members.tsx`, add `useState` to the existing react import if not already present (it is). Inside `MemberRow`, add row-local menu state and replace the inline action buttons + request-connection button with a kebab. Only render the kebab when there's at least one available action (i.e. `!isMe` and (admin-can-promote-or-remove OR can-request-connection)):

```tsx
function MemberRow(props: {
  // …same props…
}) {
  const { member, isMe, me, group, iAmAdmin, isAlreadyContact, actionInProgress, onPromote, onRemove, onRequestConnection } = props;
  const [menuOpen, setMenuOpen] = useState(false);

  const localAvatar = isMe
    ? resolveAvatarFileBlob({ accountID: member.accountID, me, group })
    : undefined;
  const remoteAvatar = useRemoteAvatar(isMe ? null : member.accountID);
  const avatar = localAvatar ?? remoteAvatar;

  // Actions available to me on this row.
  const canPromote = iAmAdmin && !isMe && member.role === "writer";
  const canRemove = iAmAdmin && !isMe && member.role === "writer";
  const canRequest = !isMe && !isAlreadyContact;
  const hasActions = canPromote || canRemove || canRequest;

  return (
    <div
      className="relative flex items-center gap-3 px-[10px] py-[9px] rounded-r-3"
      data-testid={`member-row-${member.accountID}`}
    >
      <Link
        to={`/profile/${member.accountID}`}
        data-testid={`member-profile-link-${member.accountID}`}
        className="flex flex-1 min-w-0 items-center gap-3 hover:opacity-90"
      >
        <Avatar
          src={avatar}
          initials={member.displayName[0] ?? "?"}
          size="md"
          loadAs={me}
          data-testid={`member-avatar-${member.accountID}`}
        />
        <span className="flex-1 text-[12.5px] font-semibold text-text truncate">
          {member.displayName}
          {isMe && <span className="ml-1 font-normal text-dim">· you</span>}
        </span>
      </Link>

      <RolePill role={member.role} />

      {hasActions && (
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={`Actions for ${member.displayName}`}
          data-testid={`member-kebab-${member.accountID}`}
          className={`shrink-0 w-6 h-6 rounded-r-2 flex items-center justify-center text-text-2 hover:bg-panel-2 ${menuOpen ? "bg-panel-2" : ""}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
      )}

      {menuOpen && hasActions && (
        <div
          data-testid={`member-menu-${member.accountID}`}
          className="absolute top-full right-2 mt-1 z-10 min-w-[150px] rounded-r-3 border border-hairline bg-panel p-1 shadow-level-2"
        >
          {canPromote && (
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onPromote(); }}
              disabled={actionInProgress}
              data-testid={`promote-${member.accountID}`}
              className="w-full text-left px-[10px] py-2 rounded-r-2 text-[11.5px] text-text hover:bg-panel-2"
            >
              promote to admin
            </button>
          )}
          {canRequest && (
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onRequestConnection(); }}
              disabled={actionInProgress}
              data-testid={`request-connection-${member.accountID}`}
              className="w-full text-left px-[10px] py-2 rounded-r-2 text-[11.5px] text-text hover:bg-panel-2"
            >
              request connection
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onRemove(); }}
              disabled={actionInProgress}
              data-testid={`remove-${member.accountID}`}
              className="w-full text-left px-[10px] py-2 rounded-r-2 text-[11.5px] text-red hover:bg-red/10"
            >
              remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

The `promote-<id>`, `remove-<id>`, `request-connection-<id>` testids are preserved (now inside the menu) so existing Playwright group-management specs keep working after they open the kebab. Note: if `tests/e2e/group-member-management.spec.ts` clicks `promote-<id>` directly without opening the menu, that spec needs a `member-kebab-<id>` click first — flag this in the self-review and update the e2e spec if the merge target runs e2e (Playwright is not run in unit CI here, but note it).

- [ ] **Step 4: Run to verify it passes**

Run: `nix-shell --run "npx vitest run tests/unit/routes/conversations/members-redirect.test.tsx"`
Expected: PASS (kebab test + all prior).

- [ ] **Step 5: Verify tokens + types**

Run: `nix-shell --run "npm run check-tokens"` → pass.
Run: `nix-shell --run "npx tsc -b --noEmit"` → no errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/conversations/members.tsx tests/unit/routes/conversations/members-redirect.test.tsx
git commit -m "ui(unit-9-6): per-member kebab context menu (promote/remove/request-connection)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Ggzizsaz4VoafGc5HLkHu"
```

---

## Task 9: Decision record — add-member picker stays an overlay; lowercase the leave button

**Files:**
- Modify: `src/routes/conversations/members.tsx` (leave-button label + a decision comment)

Decision (per the 9-2 modal→route note): the add-member picker (`ContactPicker` via `MobileBottomSheet`) **stays an overlay**. Rationale: it is a transient, contextual interrupt invoked from within the settings screen ("add people to THIS group") and the spec's rule is "true interrupts stay overlay." Although the prototype shows a full `AddPeopleScreen`, our `ContactPicker` overlay already deep-loads the contact book and excludes current members; converting it to a route would duplicate that logic and add a navigation round-trip for a quick multi-select. We keep the overlay and record the decision. Also confirm the leave button label is lowercase ("leave conversation") — it already is (members.tsx L569), so this is verify-only.

- [ ] **Step 1: Add the decision comment + confirm leave label**

Above the `{addPickerOpen && (` block near the bottom of `members.tsx`, add:

```tsx
      {/* Add-member picker: kept as an overlay (ContactPicker / MobileBottomSheet)
          rather than converted to a route. Per the 9-2 modal→route rule, a
          contextual multi-select interrupt invoked from inside settings stays an
          overlay; the prototype's AddPeopleScreen full-screen treatment is not
          adopted here to avoid duplicating the contact-book deep-load + member
          exclusion the picker already does. Decision recorded for Unit 9-6. */}
```

Confirm the leave button reads (no change expected):

```tsx
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => void handleLeave()}
            disabled={actionInProgress}
            data-testid="leave-conversation-btn"
          >
            {actionInProgress ? "working…" : "leave conversation"}
          </Button>
```

Also lowercase the confirm dialogs' user-facing copy in `handleRemove` and `handleLeave` only if they're sentence-cased and you want tone consistency — these are `confirm()` strings, OUT of strict scope; leave them unless trivially aligned. Do NOT change them in this task (keep the diff tight).

- [ ] **Step 2: Verify the full unit suite for this unit's files**

Run: `nix-shell --run "npx vitest run tests/unit/routes/conversations tests/unit/components/message-bubble.test.tsx"`
Expected: PASS (all tests across detail-header, members-redirect, message-bubble).

- [ ] **Step 3: Verify tokens + types**

Run: `nix-shell --run "npm run check-tokens"` → pass.
Run: `nix-shell --run "npx tsc -b --noEmit"` → no errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/conversations/members.tsx
git commit -m "docs(unit-9-6): record add-member-stays-overlay decision; confirm lowercase leave button

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Ggzizsaz4VoafGc5HLkHu"
```

---

## Task 10: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the complete unit suite**

Run: `nix-shell --run "npx vitest run"`
Expected: all tests PASS (no regressions in the existing 20+ component/route suites).

- [ ] **Step 2: Run check-tokens across the repo**

Run: `nix-shell --run "npm run check-tokens"`
Expected: `✓ no ad-hoc Tailwind color/typography classes detected`

- [ ] **Step 3: Type-check the whole project**

Run: `nix-shell --run "npx tsc -b --noEmit"`
Expected: no errors.

- [ ] **Step 4: Manual visual confirmation (dev-seed)**

Run the app and visually confirm against `design/proto.jsx`:

```bash
nix-shell --run "npm run sync" &   # background sync server on :4200
nix-shell --run "npm run dev"      # Vite on :5173
```

Check: (a) chat header row taps through to members (group) or profile (1:1); (b) mobile-only back chevron at narrow widths; (c) own bubbles accent-filled, others panel, inline 8.5px timestamps; (d) composer pill + accent send; (e) new-messages divider; (f) group settings card with editable name + 70px picture; (g) admins/members split; (h) per-member kebab; (i) member name/picture → profile; (j) a 1:1 `/members` URL redirects to the contact's profile.

There is no commit for this verification-only task.

---

## Self-Review Checklist

**1. Spec coverage (9-6 §3.2 / 3.3 / 3.4):**
- §3.2 chat header whole-row tap → settings — Task 1 ✓
- §3.2 remove standalone Members button — Task 1 ✓
- §3.2 mobile-only small single back arrow — Task 1 ✓
- §3.2 rounded-rect avatar (`rounded-avatar` via ConversationAvatar) + correct text positioning — Task 1 ✓
- §3.2 disregard presence/verified chips — Task 1 (none added) ✓
- §3.3 own = accent fill + on-accent, other = panel + text — Task 2 ✓
- §3.3 bubble shape (radius 14 + tightened tail corner) — Task 2 ✓
- §3.3 inline ~8.5px timestamp — Task 2 ✓
- §3.3 restyle composer — Task 3 ✓
- §3.3 verify new-messages divider — Task 4 ✓
- §3.4(a) 1:1 → redirect to other user's profile — Task 5 ✓
- §3.4(b) group editable name + large editable picture (group only) — Task 6 ✓
- §3.4(c) member list split admins + members — Task 7 ✓
- §3.4(d) per-member context menu — Task 8 ✓
- §3.4(e) member name/picture → profile — Task 7 ✓
- Critical: lowercase labels (promote/remove/leave/add people) — Tasks 7, 8, 9 ✓
- 9-2 modal→route note: add-member picker decision — Task 9 ✓

**2. Placeholder scan:** No "TODO/TBD/implement later" — every code step shows real JSX. The two places with conditional guidance (Task 2's body-guard form; Task 6's `border-bg` fallback; Task 8's e2e note) give the engineer the exact decision + the concrete code to use.

**3. Type/name consistency:**
- `data-testid` contract preserved across tasks: `conversation-header-avatar`, `conversation-title`, `members-header-avatar`, `conversation-icon-input`, `conversation-icon-upload`, `group-title-edit-input`, `group-title-save-btn`, `group-title-cancel-btn`, `group-title-display`, `group-title-edit-btn`, `promote-<id>`, `remove-<id>`, `request-connection-<id>`, `member-row-<id>`, `member-avatar-<id>`, `leave-conversation-btn`, `add-member-btn`, `back-btn`, `composer-*`.
- New testids introduced: `chat-back-arrow`, `conversation-header-link` (Task 1); `bubble-body`, `bubble-time` (Task 2); `members-section-admins`, `members-section-writers`, `member-profile-link-<id>`, `members-count` (Task 7); `member-kebab-<id>`, `member-menu-<id>` (Task 8).
- Jazz API: `group.getDirectMembers()`, `m.account?.$jazz?.id`, `$jazz.set` — all match `src/jazz/conversation.ts` usage.
- Helpers reused unchanged: `promoteToAdmin`, `removeMemberFromConversation`, `requestConnectionFromGroupMember`, `updateConversationTitle`, `setConversationIcon`, `leaveConversation`, `isLastAdmin`, `isArchived`.

**4. Hooks order:** Task 5's `<Navigate>` early-return sits after ALL hooks (useAccount/useCoState/useEffect/useState are above the loaded guards in `MembersRoute`), and the redirect is below the loaded guards — Rules of Hooks preserved. `MemberRow`'s new `useState`/`useRemoteAvatar` are unconditional at the top of the component.

**5. e2e impact flagged (Task 8):** Playwright specs `group-member-management.spec.ts` / `group-roles.spec.ts` / `group-title-edit.spec.ts` may need a `member-kebab-<id>` click before the promote/remove buttons, and the title-edit now lives in the group card. These are not run in the unit CI here; the executing engineer should run `nix-shell --run "npx playwright test group-"` after Task 8 and patch the specs to open the kebab first if they fail.
