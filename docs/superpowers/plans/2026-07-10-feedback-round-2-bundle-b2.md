# Feedback Round 2 — Bundle B Wave 2 (UI structure) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the structural UI items of Bundle B: tab-aware FAB icon, pending-requests badge, new-conversation screen polish (width cap, empty state, member-based default group name, direct group-image pick), own-profile fixes (settings row dropped, remove-avatar icon button, avatar auto-crop), and media improvements (lightbox download, aspect-true attachment bubbles).

**Architecture:** Kit primitives gain OPTIONAL props that default to today's rendering, so parity cells that omit them are pixel-unchanged; only the own-profile settings-row removal changes a proto cell, and that proto cell is patched in the same commit (intent-fix). Containers own all data/behavior additions.

**Tech Stack:** React 19 + TS strict, Vitest, parity harness.

**Conventions:** lowercase copy; keep every existing data-testid; new kit props optional-with-old-default; run from worktree root.

---

### Task 1: tab-aware FAB icon

**Files:**
- Modify: `src/ui/kit/fab.tsx`
- Modify: `src/ui/screens/nav-column.tsx:164-170`
- Modify: `src/ui/screens/chats-screen.tsx:78` area
- Modify: `src/ui/screens/contacts-screen.tsx:85` area

- [ ] **Step 1: Kit — optional `variant` prop**

In `src/ui/kit/fab.tsx`, add a `variant` prop and replace the single icon line:
```tsx
export function Fab({
  onClick,
  "aria-label": ariaLabel,
  "data-testid": testId,
  size = 52,
  iconSize = 24,
  variant,
}: {
  onClick?: () => void;
  "aria-label"?: string;
  "data-testid"?: string;
  size?: number;
  iconSize?: number;
  /** intent-fix (feedback round 2): tab-aware icon — "chats" renders a
   * chat bubble + small plus, "contacts" a person + small plus. Default
   * (undefined) keeps the proto's plain plus; parity cells omit it. */
  variant?: "chats" | "contacts";
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid={testId}
      className={`${tapClass} absolute right-4 bottom-4 rounded-pill bg-arcan-accent-fill justify-center shadow-fab z-[4]`}
      style={{ width: size, height: size }}
    >
      {variant ? (
        <span className="relative flex">
          <Icon
            d={variant === "chats" ? "chat" : "people"}
            size={iconSize - 4}
            sw={2.2}
            className="text-on-accent"
          />
          <Icon
            d="plus"
            size={11}
            sw={3}
            className="text-on-accent absolute -right-1.5 -top-1"
          />
        </span>
      ) : (
        <Icon d="plus" size={iconSize} sw={2.2} className="text-on-accent" />
      )}
    </button>
  );
}
```

- [ ] **Step 2: Pass the variant at all three render sites**

- `nav-column.tsx` Fab call: add `variant={tab}` (tab is already `"chats" | "contacts"`).
- `chats-screen.tsx` Fab call: add `variant="chats"`.
- `contacts-screen.tsx` Fab call: add `variant="contacts"`.
Do not touch aria-labels or testids.

- [ ] **Step 3: Verify parity unchanged for the default cell**

Run: `nix-shell --run "npm run parity -- --only fab,nav-column,nav-column-contacts,chats-screen,contacts-screen"`
Expected: `fab` PASSES (cell omits variant). The screen cells contain the FAB with variant now — if any screen cell FAILS, patch the corresponding proto cell's Fab usage in `tests/parity/proto-cells.jsx` to render the same base-icon+plus-badge composition with an intent-fix comment (same geometry: base icon at `iconSize-4`, plus at 11/sw3 offset -right-1.5 -top-1), and re-run until the listed cells pass.

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck` — exit 0.
```bash
git add src/ui/kit/fab.tsx src/ui/screens/nav-column.tsx src/ui/screens/chats-screen.tsx src/ui/screens/contacts-screen.tsx tests/parity/proto-cells.jsx
git commit -m "feat(nav): tab-aware FAB icon (chat+plus / person+plus)"
```
(Include proto-cells.jsx only if Step 3 required patching.)

---

### Task 2: pending-requests badge on the contacts tab

**Files:**
- Modify: `src/ui/kit/ptabbar.tsx`
- Modify: `src/ui/screens/nav-column.tsx` (tabs row, ~lines 82-105)
- Modify: `src/components/app-shell.tsx`

- [ ] **Step 1: PTabBar — optional `contactsBadge`**

In `src/ui/kit/ptabbar.tsx`, add the prop and render an overlay pill on the contacts icon:
```tsx
export function PTabBar({
  active,
  onTab,
  contactsBadge,
}: {
  active: "chats" | "contacts";
  onTab: (t: "chats" | "contacts") => void;
  /** intent-fix (feedback round 2): pending-connection-requests count pill
   * on the contacts tab. Default (undefined/0) renders nothing — parity
   * cells omit it. */
  contactsBadge?: number;
}): JSX.Element {
```
and inside the `tab(...)` helper, wrap the icon:
```tsx
        <span className="relative flex">
          <Icon d={icon} size={20} className={on ? "text-arcan-accent" : "text-dim"} />
          {key === "contacts" && !!contactsBadge && (
            <span
              data-testid="tab-pending-badge"
              className="absolute -top-1 -right-2.5 min-w-[15px] h-[15px] px-1 rounded-pill bg-arcan-accent-fill text-on-accent text-center font-mono font-bold text-ui-tab"
              style={{ lineHeight: "15px" }}
            >
              {contactsBadge > 99 ? "99+" : contactsBadge}
            </span>
          )}
        </span>
```
(The pill classes mirror the unread badge in `rows.tsx:72-80`.)

- [ ] **Step 2: NavColumn — same badge on the desktop contacts tab**

`src/ui/screens/nav-column.tsx`: add `contactsBadge?: number` to the props type, and inside the tabs row's contacts button (after the label span):
```tsx
              {key === "contacts" && !!contactsBadge && (
                <span
                  data-testid="nav-pending-badge"
                  className="min-w-[17px] h-[17px] px-[5px] rounded-pill bg-arcan-accent-fill text-on-accent text-center font-mono font-bold text-ui-tab"
                  style={{ lineHeight: "17px" }}
                >
                  {contactsBadge > 99 ? "99+" : contactsBadge}
                </span>
              )}
```

- [ ] **Step 3: app-shell wires the count**

In `src/components/app-shell.tsx`: import and call the hook —
```tsx
import { useIncomingConnectionRequests } from "@/jazz/use-incoming-connection-requests";
```
```tsx
  const pendingCount = useIncomingConnectionRequests().length;
```
and pass `contactsBadge={pendingCount}` to BOTH the `<NavColumn ...>` and the `<PTabBar ...>` render sites.

- [ ] **Step 4: Verify + commit**

Run: `nix-shell --run "npm run parity -- --only ptabbar,ptabbar-contacts,nav-column,nav-column-contacts"` — all PASS (cells omit the prop).
Run: `npm run typecheck` — exit 0. Run `npx vitest run` — PASS.
```bash
git add src/ui/kit/ptabbar.tsx src/ui/screens/nav-column.tsx src/components/app-shell.tsx
git commit -m "feat(contacts): pending-request badge on the contacts tab"
```

---

### Task 3: new-conversation screen — width cap, empty state, default group name, group image

**Files:**
- Modify: `src/ui/screens/new-convo-screen.tsx`
- Modify: `src/routes/conversations/new.tsx`

- [ ] **Step 1: Presenter — 600px content cap**

In `new-convo-screen.tsx`, wrap everything BELOW `<PHeader …/>` (the group-name row, the caps/hint row, `<Body>…`, and the footer) in:
```tsx
      <div className="w-full max-w-[600px] mx-auto flex flex-col flex-1 min-h-0">
        …existing children…
      </div>
```
with a comment: `{/* intent-fix (feedback round 2): 600px content cap on desktop — same pattern as own-profile-screen (2026-07-05 decision #1). Parity cells render at 300px and are unaffected. */}`

- [ ] **Step 2: Presenter — clickable group image with preview**

Add two optional props:
```tsx
  /** intent-fix (feedback round 2): direct image pick from the group bubble.
   * When provided the placeholder becomes a button; parity cells omit it. */
  onGroupImagePick?: () => void;
  groupImageUrl?: string | null;
```
Replace the bespoke 42px placeholder `<div>` with:
```tsx
          {onGroupImagePick ? (
            <button
              type="button"
              onClick={onGroupImagePick}
              aria-label="choose a group picture"
              data-testid="new-convo-group-image"
              className={`${tapClass} bg-avatar-group text-avatar-group-fg border border-hairline flex items-center justify-center shrink-0 overflow-hidden`}
              style={{ width: 42, height: 42, borderRadius: 14, fontSize: 14, fontFamily: "var(--font-mono)", fontWeight: 600, lineHeight: 1 }}
            >
              {groupImageUrl ? (
                <img src={groupImageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <Icon d="camera" size={16} />
              )}
            </button>
          ) : (
            <div
              className="bg-avatar-group text-avatar-group-fg border border-hairline flex items-center justify-center shrink-0"
              style={{ width: 42, height: 42, borderRadius: 14, fontSize: 14, fontFamily: "var(--font-mono)", fontWeight: 600, lineHeight: 1 }}
            >
              ?
            </div>
          )}
```

- [ ] **Step 3: Container — default group name, image pick, empty state**

In `src/routes/conversations/new.tsx`:

(a) imports + state:
```tsx
import { useEffect, useRef, useState } from "react";
import { setConversationIcon } from "@/jazz/avatar";
import { Icon, PButton } from "@/ui/kit";
```
```tsx
  const [groupImageFile, setGroupImageFile] = useState<File | null>(null);
  const [groupImageUrl, setGroupImageUrl] = useState<string | null>(null);
  const groupImageInputRef = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (groupImageUrl) URL.revokeObjectURL(groupImageUrl);
    },
    [groupImageUrl],
  );
```

(b) default group name from member first names — replace
```tsx
        const title =
          groupName.trim() || `Group with ${selectedCount} people`;
```
with
```tsx
        const title = groupName.trim() || defaultGroupTitle;
```
and compute above the `return` (after `contacts` is built):
```tsx
  // Feedback round 2: default group name is the first members' first names.
  const selectedFirstNames = Array.from(selected).map(
    (id) =>
      (rawContacts.find((c: any) => c?.contactAccountID === id) as any)
        ?.displayNameLocal?.trim()
        .split(/\s+/)[0] ?? "someone",
  );
  const defaultGroupTitle =
    selectedFirstNames.slice(0, 3).join(", ") +
    (selectedFirstNames.length > 3 ? ` +${selectedFirstNames.length - 3}` : "");
```
Also change the group-name input's placeholder from `"group name (optional)"` to `` {defaultGroupTitle || "group name (optional)"} `` so the default is visible.

(c) apply the image after creation — in the group branch of `submit()`, after `createGroupConversation(...)` returns `conv` and before `navigate(...)`:
```tsx
        if (groupImageFile) {
          try {
            await setConversationIcon(me as any, conv, groupImageFile);
          } catch {
            // Icon upload failing shouldn't block the conversation.
          }
        }
```

(d) wire the picker — pass to `<NewConvoScreen …>`:
```tsx
      onGroupImagePick={() => groupImageInputRef.current?.click()}
      groupImageUrl={groupImageUrl}
```
and render next to the existing hidden inputs (or adjacent to `<NewConvoScreen/>` in a fragment):
```tsx
      <input
        ref={groupImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="new-convo-group-image-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setGroupImageFile(f);
          setGroupImageUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(f);
          });
        }}
      />
```
(This requires wrapping the return in a fragment `<>…</>` if it isn't already.)

(e) empty state — replace the current bare `emptySlot` content:
```tsx
      emptySlot={
        contacts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Icon d="people" size={28} className="text-dim" />
            <p className="font-body text-ui-sub text-dim">
              no contacts yet — conversations start with a contact.
            </p>
            <div className="w-full max-w-[240px]">
              <PButton
                primary
                full
                icon="plus"
                label="add a contact"
                onClick={() => navigate("/contacts/add")}
                data-testid="new-convo-empty-add"
              />
            </div>
          </div>
        ) : undefined
      }
```
(The wrapper testid `new-convo-empty` is already carried by the presenter.)

- [ ] **Step 4: Verify + commit**

Run: `npx vitest run tests/unit/routes/conversations/new.test.tsx` — PASS (it clicks by testids; if it asserts the old default title "Group with N people", update the assertion to the new member-name default).
Run: `nix-shell --run "npm run parity -- --only new-convo-screen"` — PASS (cell omits the new props; 600px cap invisible at 300px width).
Run: `npm run typecheck` — exit 0.
```bash
git add src/ui/screens/new-convo-screen.tsx src/routes/conversations/new.tsx tests/unit/routes/conversations/new.test.tsx
git commit -m "feat(conversations): new-convo polish — width cap, empty state, member-name default, group image pick"
```
(Include the test file only if it needed the assertion update.)

---

### Task 4: own profile — drop settings row, remove-avatar icon button, avatar auto-crop

**Files:**
- Modify: `src/ui/screens/own-profile-screen.tsx`
- Modify: `src/components/profile-view.tsx`
- Modify: `tests/parity/proto-cells.jsx` (POwnProfileScreen settings-row card)
- Modify: `tests/parity/app-gallery/cells.tsx` (own-profile cell drops onSettings)

- [ ] **Step 1: Presenter — remove the "account & settings" row; add remove-avatar badge**

In `own-profile-screen.tsx`:
(a) Delete the `onSettings` and `settingsTestId` props (type + destructuring + doc comments).
(b) The `<PCard>` block currently holds the settings `<PRow>` + optional safety expander. Change it so the card only renders when the safety expander exists, and the row is gone:
```tsx
          {/* Settings row dropped (feedback round 2): the home-header gear is
              the settings entry; the profile card now holds only the
              security-code expander. Proto cell patched to match. */}
          {onToggleSafety && (
            <PCard className="w-full max-w-[320px]">
              <div data-testid="profile-safety-section">
                …existing expander button + safetyOpen block, unchanged…
              </div>
            </PCard>
          )}
```
(c) Add an optional remove-avatar badge, mirroring the camera badge on the opposite corner — new props:
```tsx
  /** intent-fix (feedback round 2): remove-avatar icon button next to the
   * avatar (confirmation handled by the container). Omitted in parity cells. */
  onRemoveAvatar?: () => void;
```
and inside the avatar `<div className="relative">`, after the camera button:
```tsx
            {onRemoveAvatar && (
              <button
                className={`${tapClass} absolute -left-0.5 -bottom-0.5 w-7 h-7 rounded-pill bg-panel border-2 border-bg justify-center`}
                onClick={onRemoveAvatar}
                aria-label="remove profile picture"
                data-testid="profile-avatar-remove"
              >
                <Icon d="close" size={13} className="text-red" />
              </button>
            )}
```

- [ ] **Step 2: Patch the proto + app-gallery cells**

- `tests/parity/proto-cells.jsx` — in `POwnProfileScreen` (~lines 368-391), delete the settings-row card block (the PCard/PRow with the gear + "account & settings") and leave: `{/* intent-fix (feedback round 2): settings row dropped from own profile */}`.
- `tests/parity/app-gallery/cells.tsx` — the `"own-profile-screen"` cell: remove the `onSettings={() => {}}` prop.

- [ ] **Step 3: Container — rewire profile-view**

In `src/components/profile-view.tsx`:
(a) Remove the `onSettings={...}` and `settingsTestId="profile-settings-link"` props from the `<OwnProfileScreen …>` call.
(b) Delete the old remove-avatar text link (the `<button data-testid="profile-avatar-remove">remove profile picture</button>` block, ~lines 366-374) from `ownExtraSections`.
(c) Pass the new badge handler on the `<OwnProfileScreen …>` call:
```tsx
      onRemoveAvatar={ownAvatarUrl ? () => void handleAvatarRemove() : undefined}
```
(d) Avatar auto-crop — in `handleAvatarChange`, before `setProfileAvatar`:
```tsx
      const resized = await resizeImageToSquare(file, 256);
      await setProfileAvatar(me as any, resized);
```
replacing the direct `await setProfileAvatar(me as any, file);`, and extend the import from `@/jazz/avatar` with `resizeImageToSquare`.

- [ ] **Step 4: Verify + commit**

Run: `npx vitest run tests/unit/components/profile-view.test.tsx` — update any assertion that expected the settings row/link; PASS.
Run: `grep -rn "profile-settings-link" src/ tests/` — no remaining references.
Run: `nix-shell --run "npm run parity -- --only own-profile-screen"` — PASS (kit and proto both dropped the row).
Run: `npm run typecheck` — exit 0.
```bash
git add src/ui/screens/own-profile-screen.tsx src/components/profile-view.tsx tests/parity/proto-cells.jsx tests/parity/app-gallery/cells.tsx
git commit -m "feat(profile): remove-avatar badge + avatar auto-crop; drop settings row"
```
(Add the profile-view test file if it changed.)

---

### Task 5: media — lightbox download button + aspect-true attachment bubbles

**Files:**
- Modify: `src/components/image-lightbox.tsx`
- Modify: `src/components/message-attachments.tsx`
- Modify: `src/components/attachment-tile.tsx`
- Modify: `src/ui/kit/bubble.tsx` (att wrapper sizing)

- [ ] **Step 1: Lightbox — filename prop + download button**

`image-lightbox.tsx`: extend props with `filename?: string;` and add next to the close button (note `download` on an `<a>` with the already-created object URL — no re-fetch needed):
```tsx
      <a
        href={src}
        download={filename || "image"}
        onClick={(e) => e.stopPropagation()}
        aria-label="download image"
        data-testid="image-lightbox-download"
        className={`${tapClass} absolute top-4 left-4 text-text-2 bg-black/40 rounded-r-3 w-10 h-10 justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft`}
      >
        {/* intent-fix (feedback round 2): "share" is the closest available
            glyph — a dedicated download icon is out of scope. */}
        <Icon d="share" size={18} />
      </a>
```

- [ ] **Step 2: Plumb the filename**

`message-attachments.tsx`: change the lightbox state from a string to `{ src: string; filename?: string } | null` (rename `lightboxSrc` → `lightbox`); in `openLightbox`, `setLightbox({ src: url, filename: att?.filename })`; render `{lightbox && <ImageLightbox src={lightbox.src} filename={lightbox.filename} onClose={closeLightbox} />}`. Keep the URL-revoke behavior of `closeLightbox` intact (adjust it to read `lightbox.src`).

- [ ] **Step 3: Aspect-true image tiles**

`attachment-tile.tsx`, sent-image branch: the `<img>` currently mixes `max-h-48` (192px) with `style maxHeight: 200`. Replace with:
```tsx
      <img
        src={url}
        alt={filename}
        className="rounded max-w-full object-contain border border-border"
        style={{ maxWidth: 280, maxHeight: 280 }}
      />
```
(height now follows the image's aspect ratio up to 280px.)

- [ ] **Step 4: Bubble hugs the attachment**

`src/ui/kit/bubble.tsx`, the attachment wrapper currently:
```tsx
          style={{ width: w - 12, ...(attSlot ? {} : { height: 84 }) }}
```
Replace with:
```tsx
          // intent-fix (feedback round 2): with a real attachment the wrapper
          // hugs the image (maxWidth) instead of forcing full bubble width;
          // the parity placeholder branch (no attSlot) keeps fixed metrics.
          style={attSlot ? { maxWidth: w - 12 } : { width: w - 12, height: 84 }}
```

- [ ] **Step 5: Verify + commit**

Run: `npx vitest run` — PASS (fix any attachment-tile test asserting the old classes).
Run: `nix-shell --run "npm run parity -- --only bubble-att"` — PASS (placeholder branch unchanged).
Run: `npm run typecheck` — exit 0. Run `npm run check-tokens` — PASS.
```bash
git add src/components/image-lightbox.tsx src/components/message-attachments.tsx src/components/attachment-tile.tsx src/ui/kit/bubble.tsx
git commit -m "feat(media): lightbox download button; attachment bubbles follow image aspect"
```

---

### Task 6: wave gates

- [ ] **Step 1: Full gates**

```bash
npm run typecheck
npm run check-tokens
npm run check-ui-purity
npx vitest run
nix-shell --run "npm run parity"
```
All must pass (parity 142/142).

- [ ] **Step 2: Commit any gate fixes**

Only if needed:
```bash
git add -A && git commit -m "fix(ui): bundle B wave 2 gate fallout"
```
