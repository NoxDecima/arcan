# Feedback Round 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Android attachment-source tray (Photos + File) plus four round-5 corrections: fix the UI-scale zoom so it refits the viewport, relabel the jump-to-latest button, swap the settings gear icon, and re-investigate the composer tray first-photo bug on Android.

**Architecture:** One `--no-ff` slice on branch `worktree-feedback-round-6` (already created off main tip `7318d09`). The tray is a UI-layer reroute on the Android shell built on the existing `MobileBottomSheet`. The zoom fix counter-scales the app's full-viewport containers by a new `--ui-zoom` CSS variable. The gear swap mirrors the kit icon into the parity proto source to keep parity green. The tray bug is a systematic-debugging task with an honest on-device verification caveat.

**Tech Stack:** React 19, TypeScript (strict), Tailwind v3, Tauri 2 Android, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-25-attachment-source-tray-design.md`

**Conventions:**
- Every command via `nix-shell --run '<cmd>'` from the worktree root.
- Type gate: `nix-shell --run 'npm run typecheck'`. Token guard: `npm run check-tokens`. UI purity: `npm run check-ui-purity` (`src/ui/` must not import Jazz/router/`@/components`). Platform purity: `npm run check-platform-purity`. Parity: `npm run parity` (target 142/142).
- Commit after each task. Do NOT merge/tag until Task 6.

**Order rationale:** quick, low-risk changes first (jump label, gear), then the zoom fix, then the tray feature, then the uncertain on-device tray bug, then the sweep + nightly.

---

## Task 1: Jump-to-latest — text label instead of count (#80)

Replace the numeric unread-count badge on the jump-to-latest button with a fixed "jump to latest" text label.

**Files:**
- Modify: `src/ui/screens/chat-screen.tsx` (jump-to-latest slot ~lines 231–256, and the `jumpToLatest` prop type)
- Modify: `src/routes/conversations/detail.tsx` (the `jumpToLatest={{ ... }}` prop passed to `<ChatScreen>`, and the now-unused `unseenCount` state)
- Modify: `tests/e2e/jump-to-latest.spec.ts`

- [ ] **Step 1: Change the presenter slot to a text label**

In `src/ui/screens/chat-screen.tsx`, the jump-to-latest block currently renders a chevron plus a conditional `jump-to-latest-count` span. Replace the whole `{jumpToLatest?.visible && ( ... )}` block with:

```tsx
      {/* Jump-to-latest — zero-height context; button floats above composer */}
      {jumpToLatest?.visible && (
        <div className="relative z-10 h-0">
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <button
              type="button"
              data-testid="jump-to-latest"
              onClick={jumpToLatest.onClick}
              aria-label="Jump to latest messages"
              className="pointer-events-auto flex items-center gap-1.5 rounded-pill border border-hairline bg-panel px-3 py-[6px] shadow-level-1 transition-tint duration-fast ease-out hover:bg-panel-2 active:bg-hairline animate-arcan-rise"
            >
              <Icon d="chev" size={16} className="text-text-2 rotate-90" />
              <span className="font-mono font-medium text-ui-caps tracking-caps-sm uppercase text-text-2">
                jump to latest
              </span>
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 2: Drop `count` from the `jumpToLatest` prop type**

In the same file, the `jumpToLatest` prop type currently is `{ visible: boolean; count: number; onClick: () => void }`. Change it to:

```tsx
  /** Floating "jump to latest" control (feedback round 5, relabelled round 6).
   * Rendered in a zero-height context above the composer; visible only when
   * the user has scrolled away from the bottom. */
  jumpToLatest?: {
    visible: boolean;
    onClick: () => void;
  };
```

- [ ] **Step 3: Update the container — remove `unseenCount` plumbing**

In `src/routes/conversations/detail.tsx`:
- Find `const [unseenCount, setUnseenCount] = useState(0);` and delete it.
- Delete every `setUnseenCount(...)` call (in the positioning effect's new-message branch, the scroll `onScroll` near-bottom reset, the ResizeObserver callback, the conversation-change reset, and `handleJumpToLatest`).
- In the positioning effect's already-positioned branch, the `else { setUnseenCount((n) => n + 1); }` becomes just an empty else (or drop the else): keep the `if (isNearBottom) { ...auto-scroll... }` and remove the else entirely.
- Change the prop passed to `<ChatScreen>` from `jumpToLatest={{ visible: !isNearBottom, count: unseenCount, onClick: handleJumpToLatest }}` to:

```tsx
        jumpToLatest={{
          visible: !isNearBottom,
          onClick: handleJumpToLatest,
        }}
```

Verify no remaining references to `unseenCount` / `setUnseenCount`:

```bash
nix-shell --run "grep -n 'unseenCount' src/routes/conversations/detail.tsx || echo 'CLEAN'"
```

Expected: `CLEAN`.

- [ ] **Step 4: Update the e2e**

In `tests/e2e/jump-to-latest.spec.ts`, the test asserts a numeric `jump-to-latest-count`. Replace the count assertions. Find the block asserting visibility + count and change it to assert the label:

```ts
    await expect(a.getByTestId("jump-to-latest")).toBeVisible();
    await expect(a.getByTestId("jump-to-latest")).toContainText("jump to latest");
    await a.getByTestId("jump-to-latest").click();
    await expect(a.getByTestId("jump-to-latest")).toBeHidden();
```

Remove any line referencing `jump-to-latest-count`.

- [ ] **Step 5: Verify**

```bash
nix-shell --run 'npm run typecheck && npm run check-tokens && npm run check-ui-purity'
nix-shell --run 'npx playwright test tests/e2e/jump-to-latest.spec.ts --project=chromium --workers=2'
```

Expected: clean; spec passes. (If Playwright can't reach the dev server, the config auto-starts it; retry once.)

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/chat-screen.tsx src/routes/conversations/detail.tsx tests/e2e/jump-to-latest.spec.ts
git commit -m "feat(chat): jump-to-latest shows 'jump to latest' label instead of unread count"
```

---

## Task 2: UI-scale zoom refit (#78)

Root cause (confirmed): the app's full-viewport containers use `h-screen w-screen` (`100vh`/`100vw`). Under `zoom: Z` on `<html>`, `100vh` renders at `viewport × Z`, so 130% overflows (scrollbars) and 90% underfills (empty margin). Fix: counter-scale those containers by a `--ui-zoom` CSS variable so they render at exactly the physical viewport at any scale.

**Files:**
- Modify: `src/styles/ui-scale.ts` (`applyUiScale`)
- Modify: `tailwind.config.ts` (extend height/width/minHeight with `app`)
- Modify (12 callsites): `src/components/app-shell.tsx` (×2), `src/routes/auth/login.tsx`, `src/routes/auth/recovery.tsx`, `src/routes/invite/index.tsx`, `src/routes/onboarding/{welcome-step,profile-step,credentials-step,backup-display-step,backup-confirm-step,restore-with-code-step}.tsx`, `src/routes/pair/{initiator-step,responder-step}.tsx`
- Modify: `tests/e2e/ui-scale.spec.ts` (add an overflow assertion)

- [ ] **Step 1: Set the `--ui-zoom` variable alongside the zoom**

In `src/styles/ui-scale.ts`, replace `applyUiScale`:

```ts
export function applyUiScale(scale: UiScaleStep): void {
  // 100% clears the property entirely — a held `zoom: 1` is inert but would
  // make "is scaling active" checks ambiguous.
  const root = document.documentElement;
  root.style.zoom = scale === 100 ? "" : String(scale / 100);
  // Counter-scale token consumed by the full-viewport shells (`h-app`/`w-app`):
  // under CSS `zoom: Z`, `100vh` renders at viewport×Z, so shells sized
  // `calc(100vh / var(--ui-zoom))` render at exactly the physical viewport at
  // any scale (fixes the round-5 over/underflow — feedback round 6).
  root.style.setProperty("--ui-zoom", String(scale / 100));
}
```

(At 100% this sets `--ui-zoom: 1`, so `calc(100vh / 1) = 100vh` — identical to today.)

- [ ] **Step 2: Add the counter-scaled utilities to Tailwind**

In `tailwind.config.ts`, inside `theme.extend`, add:

```ts
      height: {
        // Full physical viewport under CSS zoom (feedback round 6): counter-
        // scales 100vh by --ui-zoom (default 1) so the app shell refits the
        // screen at every UI-scale step instead of over/underflowing.
        app: "calc(100vh / var(--ui-zoom, 1))",
      },
      width: {
        app: "calc(100vw / var(--ui-zoom, 1))",
      },
      minHeight: {
        app: "calc(100vh / var(--ui-zoom, 1))",
      },
```

(If `theme.extend` already has `height`/`width`/`minHeight` keys, merge these entries in rather than duplicating the key.)

- [ ] **Step 3: Swap the full-viewport containers**

Replace `h-screen w-screen` with `h-app w-app` at all 12 callsites. Run this to see them:

```bash
nix-shell --run "grep -rn 'h-screen w-screen' src/"
```

Edit each occurrence: `className="h-screen w-screen flex ..."` → `className="h-app w-app flex ..."`. The files and their line anchors:
- `src/components/app-shell.tsx` — two occurrences (the desktop shell `h-screen w-screen flex bg-bg overflow-hidden` and the mobile shell `h-screen w-screen flex flex-col`).
- `src/routes/auth/login.tsx`, `src/routes/auth/recovery.tsx`, `src/routes/invite/index.tsx`, `src/routes/onboarding/welcome-step.tsx`, `src/routes/onboarding/profile-step.tsx`, `src/routes/onboarding/credentials-step.tsx`, `src/routes/onboarding/backup-display-step.tsx`, `src/routes/onboarding/backup-confirm-step.tsx`, `src/routes/onboarding/restore-with-code-step.tsx`, `src/routes/pair/initiator-step.tsx`, `src/routes/pair/responder-step.tsx` — one each (`h-screen w-screen flex flex-col`).

Also handle `src/routes/diag.tsx` (`min-h-screen`): change `min-h-screen` → `min-h-app`.

Verify none remain:

```bash
nix-shell --run "grep -rn 'h-screen w-screen\|min-h-screen' src/ || echo 'CLEAN'"
```

Expected: `CLEAN`.

- [ ] **Step 4: Add an overflow assertion to the ui-scale e2e**

In `tests/e2e/ui-scale.spec.ts`, add a test that at 130% the document does not overflow the viewport (the round-5 bug produced page scrollbars). Append inside the existing `describe`:

```ts
  test("at 130% the app refits the viewport (no page overflow)", async ({ page }) => {
    await page.goto("/");
    // set scale to 130 via the same localStorage key the app reads pre-paint
    await page.evaluate(() => localStorage.setItem("arcan-ui-scale", "130"));
    await page.reload();
    // Allow the shell to mount.
    await page.waitForSelector('[data-testid="message-timeline"], [data-testid="home-main"], body', { timeout: 20_000 });
    const overflow = await page.evaluate(() => {
      const de = document.documentElement;
      return {
        scrollW: de.scrollWidth,
        clientW: de.clientWidth,
        scrollH: de.scrollHeight,
        clientH: de.clientHeight,
      };
    });
    // Counter-scaled shell must not exceed the viewport box (small rounding ok).
    expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW + 2);
    expect(overflow.scrollH).toBeLessThanOrEqual(overflow.clientH + 2);
  });
```

If the existing spec's setup differs (e.g. a helper that creates an account), mirror its setup; the key assertion is the `scrollWidth ≤ clientWidth` / `scrollHeight ≤ clientHeight` check after setting scale 130 and reloading.

- [ ] **Step 5: Verify (browser reproduces the WebView zoom behavior)**

```bash
nix-shell --run 'npm run typecheck && npm run check-tokens && npm run parity'
nix-shell --run 'npx playwright test tests/e2e/ui-scale.spec.ts --project=chromium --workers=2'
```

Expected: typecheck/tokens clean; parity 142/142 (parity harness pins scale 100, unaffected); ui-scale spec passes including the new overflow assertion. Chromium's CSS `zoom` matches the Android WebView, so a green browser assertion is strong evidence the device is fixed.

- [ ] **Step 6: Commit**

```bash
git add src/styles/ui-scale.ts tailwind.config.ts src/components/app-shell.tsx src/routes tests/e2e/ui-scale.spec.ts
git commit -m "fix(ui-scale): counter-scale full-viewport shells so zoom refits the screen (no over/underflow)"
```

---

## Task 3: Settings gear icon (#81)

Swap the `gear` glyph for a crisper, well-defined gear. The gear is a kit icon under the parity mapping-table law — the same glyph is baked into the proto parity source, so change BOTH sides identically (an intent-fix) to keep parity 142/142.

**Files:**
- Modify: `src/ui/kit/icon.tsx` (`gear` path in `IPATHS`)
- Modify: `tests/parity/out/hf-kit.js` (line ~193, the proto kit's `gear` path)
- Verify: `tests/parity/proto-cells.jsx` / `tests/parity/app-gallery/cells.tsx` render `Icon d="gear"` (no change needed — they reference the path)

- [ ] **Step 1: Replace the gear path in the app kit**

In `src/ui/kit/icon.tsx`, replace the `gear:` entry in `IPATHS` with a cleaner cog (distinct round hub + eight square teeth; stroke-friendly, single path). Add an intent-fix note above the `IPATHS` object's `gear` line:

```ts
  // intent-fix (feedback round 6): the ported ArcanUI gear read muddy at
  // 19–20px; swapped for a crisper cog. Mirrored in tests/parity/out/hf-kit.js
  // so the parity mapping-table law holds (both galleries render identically).
  gear:      'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 12a7.4 7.4 0 0 0-.07-1l1.86-1.45-1.9-3.3-2.2.88a7.3 7.3 0 0 0-1.73-1l-.33-2.33h-3.8l-.33 2.33a7.3 7.3 0 0 0-1.73 1l-2.2-.88-1.9 3.3L6.67 11a7.4 7.4 0 0 0 0 2l-1.86 1.45 1.9 3.3 2.2-.88a7.3 7.3 0 0 0 1.73 1l.33 2.33h3.8l.33-2.33a7.3 7.3 0 0 0 1.73-1l2.2.88 1.9-3.3L19.33 13a7.4 7.4 0 0 0 .07-1z',
```

- [ ] **Step 2: Mirror the exact same path in the proto kit**

In `tests/parity/out/hf-kit.js`, find the `gear:` entry (~line 193) and replace its value with the **identical** string used in Step 1 (same characters). This keeps the app-side and proto-side glyphs byte-identical so the galleries render the same.

- [ ] **Step 3: Verify parity + eyeball**

```bash
nix-shell --run 'npm run typecheck && npm run parity'
```

Expected: typecheck clean; parity 142/142. If parity shows a `gear`-bearing cell diffing (icon-modes / headers / nav-column), the two paths differ — re-copy Step 1's string verbatim into Step 2.

Then eyeball at real size: start the dev server (`nix-shell --run 'npm run dev'` in the background) and confirm the gear in the nav column / home header reads cleanly at 19–20px. If it still looks off, refine the path — but change BOTH `src/ui/kit/icon.tsx` and `tests/parity/out/hf-kit.js` to the same new string and re-run parity.

- [ ] **Step 4: Commit**

```bash
git add src/ui/kit/icon.tsx tests/parity/out/hf-kit.js
git commit -m "fix(icon): crisper settings gear (kit + proto parity source, intent-fix)"
```

---

## Task 4: Attachment-source tray (Android) — Photos + File

Build the bottom-sheet source picker and reroute the Android attach tap through it. Gallery + File reuse the existing `pickFilesNative`; camera is out of scope (commented insertion point left).

**Files:**
- Create: `src/components/composer-attachment-sheet.tsx`
- Create: `tests/unit/components/composer-attachment-sheet.test.tsx`
- Modify: `src/routes/conversations/detail.tsx` (attach handler + sheet state + render)

- [ ] **Step 1: Write the failing component test**

Create `tests/unit/components/composer-attachment-sheet.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ComposerAttachmentSheet } from "@/components/composer-attachment-sheet";

describe("ComposerAttachmentSheet", () => {
  it("renders Photos and File rows when open", () => {
    render(
      <ComposerAttachmentSheet open onClose={() => {}} onPick={() => {}} />,
    );
    expect(screen.getByTestId("attach-source-photos")).toBeInTheDocument();
    expect(screen.getByTestId("attach-source-file")).toBeInTheDocument();
  });

  it("calls onPick('photos') then closes when Photos is tapped", () => {
    const onPick = vi.fn();
    render(
      <ComposerAttachmentSheet open onClose={() => {}} onPick={onPick} />,
    );
    fireEvent.click(screen.getByTestId("attach-source-photos"));
    expect(onPick).toHaveBeenCalledWith("photos");
  });

  it("calls onPick('file') when File is tapped", () => {
    const onPick = vi.fn();
    render(
      <ComposerAttachmentSheet open onClose={() => {}} onPick={onPick} />,
    );
    fireEvent.click(screen.getByTestId("attach-source-file"));
    expect(onPick).toHaveBeenCalledWith("file");
  });

  it("renders nothing when closed", () => {
    render(
      <ComposerAttachmentSheet open={false} onClose={() => {}} onPick={() => {}} />,
    );
    expect(screen.queryByTestId("attach-source-photos")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

```bash
nix-shell --run 'npx vitest run tests/unit/components/composer-attachment-sheet.test.tsx'
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement the sheet**

First read `src/components/modal-shell.tsx` to confirm `MobileBottomSheet`'s exact prop names (it takes `open`, `onClose`, a title, and children — match the real signature; the code below assumes `open`, `onClose`, `title`). Create `src/components/composer-attachment-sheet.tsx`:

```tsx
// src/components/composer-attachment-sheet.tsx
// Android attachment-source tray (feedback round 6). Tapping the composer
// attach button on the Android shell opens this sheet; picking a source closes
// it and opens the matching native picker. Camera is deferred (see the marker).
import { MobileBottomSheet } from "@/components/modal-shell";
import { Icon } from "@/ui/kit/icon";
import { tapClass } from "@/ui/kit/tap";

export type AttachSource = "photos" | "file";

interface ComposerAttachmentSheetProps {
  open: boolean;
  onClose: () => void;
  onPick: (source: AttachSource) => void;
}

function SourceRow({
  testId,
  icon,
  label,
  onClick,
}: {
  testId: string;
  icon: "image" | "paperclip";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`${tapClass} flex w-full items-center gap-3 rounded-r-4 px-3 py-3 text-left hover:bg-panel-2`}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-panel-2">
        <Icon d={icon} size={20} className="text-text-2" />
      </span>
      <span className="font-body text-ui-row text-text">{label}</span>
    </button>
  );
}

export function ComposerAttachmentSheet({
  open,
  onClose,
  onPick,
}: ComposerAttachmentSheetProps) {
  return (
    <MobileBottomSheet open={open} onClose={onClose} title="Add attachment">
      <div className="flex flex-col gap-1 pb-2">
        <SourceRow
          testId="attach-source-photos"
          icon="image"
          label="Photos"
          onClick={() => onPick("photos")}
        />
        <SourceRow
          testId="attach-source-file"
          icon="paperclip"
          label="File"
          onClick={() => onPick("file")}
        />
        {/* Camera row — future (needs CAMERA permission + native capture). */}
      </div>
    </MobileBottomSheet>
  );
}
```

If `MobileBottomSheet`'s real props differ (e.g. it renders nothing when `open` is false vs. always mounting), adapt: the test requires that with `open={false}` the rows are NOT in the DOM. If `MobileBottomSheet` always renders children, guard with `if (!open) return null;` at the top of `ComposerAttachmentSheet` before the return. Confirm `tapClass` is exported from `src/ui/kit/tap.ts` (it is used across screens); if the import path differs, match the real one.

- [ ] **Step 4: Run the test — verify it passes**

```bash
nix-shell --run 'npx vitest run tests/unit/components/composer-attachment-sheet.test.tsx && npm run typecheck'
```

Expected: 4 tests pass; typecheck clean. If the closed-state test fails because `MobileBottomSheet` always mounts, add the `if (!open) return null;` guard and re-run.

- [ ] **Step 5: Reroute the Android attach tap through the sheet**

In `src/routes/conversations/detail.tsx`:

Add the import near the other component imports:

```tsx
import { ComposerAttachmentSheet, type AttachSource } from "@/components/composer-attachment-sheet";
import { isTauriAndroid } from "@/platform/is-tauri";
```

(Confirm `isTauriAndroid` is exported from `@/platform/is-tauri` — it is used in `main.tsx`.)

Add sheet state near the other composer state (e.g. beside `pending`):

```tsx
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
```

Change the attach entry point. The `ChatComposer`'s `onAttach` currently calls `handlePickClick`. Introduce a router that opens the sheet on Android and keeps the direct path elsewhere. Add:

```tsx
  function handleAttachClick() {
    if (isTauriAndroid()) {
      setAttachSheetOpen(true);
      return;
    }
    void handlePickClick();
  }

  async function handlePickSource(source: AttachSource) {
    setAttachSheetOpen(false);
    try {
      const native = await pickFilesNative({
        imagesOnly: source === "photos",
        multiple: true,
        maxBytes: MAX_ATTACHMENT_BYTES,
      });
      if (native !== null && native.length > 0) ingestFiles(native);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "pick failed — try again.";
      showComposerError(msg);
      toast({ tone: "error", icon: "alert", text: msg });
    }
  }
```

Wire the composer's attach handler to `handleAttachClick` (find where `onAttach={handlePickClick}` — or equivalent — is passed to `<ChatComposer>` and change it to `onAttach={handleAttachClick}`). Leave `handlePickClick`, `handleFileInputChange`, and the hidden `<input>` untouched (still used on web/desktop).

Render the sheet next to the composer element (near where `composerElement` / `<ChatScreen>` is returned — anywhere inside the component's JSX root works since it portals):

```tsx
      <ComposerAttachmentSheet
        open={attachSheetOpen}
        onClose={() => setAttachSheetOpen(false)}
        onPick={handlePickSource}
      />
```

- [ ] **Step 6: Verify**

```bash
nix-shell --run 'npm run typecheck && npm run check-tokens && npm run check-ui-purity && npm run check-platform-purity'
nix-shell --run 'npx vitest run tests/unit/components/composer-attachment-sheet.test.tsx'
```

Expected: all clean (note: `isTauriAndroid` is imported in the route layer, not `src/ui/` — platform purity unaffected). Web/desktop attach path is unchanged, so existing attachment e2e stays green (verified in Task 6).

- [ ] **Step 7: Commit**

```bash
git add src/components/composer-attachment-sheet.tsx tests/unit/components/composer-attachment-sheet.test.tsx src/routes/conversations/detail.tsx
git commit -m "feat(composer): Android attachment-source tray (Photos + File)"
```

---

## Task 5: Composer tray first-photo bug on Android (#79) — investigate

REQUIRED SUB-SKILL: `superpowers:systematic-debugging`. The round-5 fix (synchronous `PendingPreview` URL, `b1f235c`) did NOT resolve it on-device. This task investigates and fixes with an honest constraint: **the bug is Android-WebView-specific and cannot be reproduced in CI here** — the fix is verified on-device by the user in the next nightly, not marked "verified" by us.

**Files:**
- Investigate: `src/components/composer-attachment-tray.tsx`, `src/routes/conversations/detail.tsx` (ingest → `pending` → `attachSlot`), `src/ui/screens/chat-composer.tsx`
- Likely-modify: `src/components/composer-attachment-tray.tsx`
- Test: `tests/e2e/attachment-image.spec.ts` (or a new spec) for a real-browser visibility check

- [ ] **Step 1: Phase 1 — establish what is NOT the cause (already known)**

Confirmed from code (do not re-litigate): `ChatComposer` is a plain function (not memoized), so `setPending` re-renders it with a fresh `attachSlot`; `ingestFiles` calls `setPending((prev) => [...prev, ...accepted])` (new array); `PendingPreview` already creates the object URL synchronously in a lazy `useState` initializer. So the React state→render path is sound. The remaining plausible causes are **WebView-paint-specific**: (a) a `blob:` URL from a `File` built out of `@tauri-apps/plugin-fs` bytes decodes/paints late in the Android WebView so the first item's `<img>` has no painted content until a later relayout (adding a 2nd item); (b) the tray container has zero/!visible height on first paint on the WebView.

- [ ] **Step 2: Phase 1 — reproduce in a real browser (catches the paint/visibility hypothesis)**

Write a real-browser e2e that adds ONE image via the web `<input>` and asserts the preview image is actually visible (not just in the DOM). Add to `tests/e2e/attachment-image.spec.ts` (mirror its existing account/conversation setup) a test:

```ts
  test("a single added image shows its preview immediately", async ({ page }) => {
    // ...existing setup: account + open a conversation...
    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: "one.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
    const item = page.getByTestId("composer-attachment-tray-item");
    await expect(item).toHaveCount(1);
    await expect(item.locator("img")).toBeVisible();
  });
```

Run it:

```bash
nix-shell --run 'npx playwright test tests/e2e/attachment-image.spec.ts --project=chromium --workers=2'
```

- [ ] **Step 3: Phase 2/3 — branch on the result**

- If the test FAILS (img not visible on first add in a real browser): you reproduced it — the paint/visibility hypothesis holds. Investigate the tray container's layout (`ComposerAttachmentTray` root + `PendingPreview` sizing). Likely fix candidates, apply the smallest that makes the test pass: give the preview `<img>` explicit dimensions so it lays out before decode (it already has `w-full h-full object-cover` inside a `w-20 h-20` cell — verify the cell has non-zero size on first paint), or force a decode via `decoding="sync"` / an `onLoad` state. Add the fix, re-run the test to green.
- If the test PASSES in chromium (likely — the bug may be WebView-only): the paint hypothesis doesn't repro in a standards browser. Apply the **most likely WebView-robust hardening** and ship it for on-device verification: on the `PendingPreview` `<img>`, add `decoding="async"` is default — instead force layout independence by ensuring the image cell renders at a fixed size regardless of decode (it does: `w-20 h-20`). The concrete robustness change: add an explicit `key` on each tray item tied to `tempId` (already present) AND add `loading="eager"` + `decoding="sync"` to the preview `<img>` so the WebView decodes it on the first paint rather than lazily. Edit `src/components/composer-attachment-tray.tsx` `PendingPreview`'s `<img>`:

```tsx
    return (
      <img
        src={url}
        alt={file.name}
        loading="eager"
        decoding="sync"
        className="w-full h-full object-cover"
      />
    );
```

- [ ] **Step 4: Add an on-device diagnostic (so the next nightly gives evidence if still broken)**

In `ingestFiles` (detail.tsx), after `setPending`, add a debug line guarded so it only logs in the shell (keep it lightweight, mirrors the existing `console.warn` diagnostics style):

```tsx
    if (accepted.length > 0) {
      setPending((prev) => [...prev, ...accepted]);
      // feedback round 6 (#79): on-device trace — if the first preview is
      // still missing on Android, this confirms ingest fired with N files.
      console.debug("[composer] ingested", accepted.length, "pending now grows");
    }
```

- [ ] **Step 5: Verify (what CAN be verified here)**

```bash
nix-shell --run 'npm run typecheck && npm run check-tokens'
nix-shell --run 'npx playwright test tests/e2e/attachment-image.spec.ts --project=chromium --workers=2'
```

Expected: typecheck/tokens clean; the attachment-image spec (incl. the new single-image visibility test) passes on chromium. **Honest status:** this proves the web path is correct and the preview is robust; the Android-WebView behavior must be confirmed by the user on the next nightly. Report this as DONE_WITH_CONCERNS noting the on-device verification is pending.

- [ ] **Step 6: Commit**

```bash
git add src/components/composer-attachment-tray.tsx src/routes/conversations/detail.tsx tests/e2e/attachment-image.spec.ts
git commit -m "fix(composer): harden first-attachment preview paint (eager decode) + on-device trace (#79)"
```

---

## Task 6: Full sweep, docs, merge, nightly

**Files:**
- Modify: `CLAUDE.md` (status entry)
- Modify: `docs/testing/android-device-checklist.md`

- [ ] **Step 1: Full gate sweep**

```bash
nix-shell --run 'npm run typecheck && npm run check-tokens && npm run check-ui-purity && npm run check-platform-purity && npx vitest run && npm run parity'
```

Expected: all green; vitest all pass (incl. new `composer-attachment-sheet`); parity 142/142.

- [ ] **Step 2: E2e both projects, halved (per the long-run convention)**

```bash
nix-shell --run 'npx playwright test tests/e2e --project=chromium --shard=1/2 --workers=2'
nix-shell --run 'npx playwright test tests/e2e --project=chromium --shard=2/2 --workers=2'
```

Then firefox (both shards). Note from round 5: firefox can mass-fail on account-creation (WASM `createContext`) in this sandbox — that is environmental, not a regression (chromium is the authoritative gate; re-run round-6 firefox specs in isolation with `--workers=1 --retries=2` to confirm). See `reference_firefox_e2e_wasm_flake` memory.

- [ ] **Step 3: Update the Android device checklist**

Add to `docs/testing/android-device-checklist.md` a "Feedback round 6" section:

```markdown
## Feedback round 6 (2026-07-25)

- [ ] UI scale: at 90% the app still fills the screen edge-to-edge (no empty
      margin); at 130% it fills without horizontal/vertical page scrolling.
      Every step (90/100/115/130) refits.
- [ ] Jump-to-latest button reads "jump to latest" (text), not a number.
- [ ] Settings gear icon looks like a clean, well-defined gear at nav sizes.
- [ ] Attach → a bottom sheet appears with "Photos" and "File"; "Photos" opens
      the image picker, "File" opens the all-files picker; both attach + send.
- [ ] (#79) Adding a single photo shows it in the tray immediately — no need to
      add a second. If still broken, note whether the console shows
      "[composer] ingested 1 pending now grows".
```

- [ ] **Step 4: Update CLAUDE.md status**

Add a bullet under the UI-rework section:

```markdown
- Feedback round 6 (2026-07-25) — implemented + merged (`--no-ff`). Android
  attachment-source tray (Photos + File on `MobileBottomSheet`; camera deferred
  — NOX follow-up); UI-scale zoom refit (counter-scale `h-app`/`w-app` shells by
  a `--ui-zoom` var — fixes 90% underfill / 130% overflow from CSS zoom on
  `h-screen`); jump-to-latest relabelled to text; crisper settings gear (kit +
  proto parity mirror, intent-fix); composer first-photo preview hardened
  (eager decode) + on-device trace for the reopened Android bug (#79, pending
  device confirmation). Push notifications brainstormed then deferred — notes in
  `docs/superpowers/notes/2026-07-25-push-notifications-deliberation.md`. Specs:
  `docs/superpowers/specs/2026-07-25-attachment-source-tray-design.md`.
```

- [ ] **Step 5: Commit docs**

```bash
git add CLAUDE.md docs/testing/android-device-checklist.md
git commit -m "docs: feedback round 6 status + device checklist"
```

- [ ] **Step 6: Merge to main (`--no-ff`) + push**

```bash
git -C /home/nox/Documents/Projects/Nox/arcan merge --no-ff worktree-feedback-round-6 -m "merge: feedback round 6 — attachment tray, zoom refit, jump-latest label, gear, tray-bug hardening"
nix-shell --run 'npm run typecheck'
git -C /home/nox/Documents/Projects/Nox/arcan push origin main
```

- [ ] **Step 7: Cut a nightly (user-authorized channel; never deploys prod)**

Use a distinct tag; `nightly-2026-07-24` and `-24b` exist, so use `nightly-2026-07-25`:

```bash
git -C /home/nox/Documents/Projects/Nox/arcan tag nightly-2026-07-25 <merged-main-sha>
git -C /home/nox/Documents/Projects/Nox/arcan push origin nightly-2026-07-25
```

- [ ] **Step 8: Verify the nightly published + prod untouched**

Confirm the android workflow ran and published `Nightly nightly-2026-07-25` as a **pre-release**; `deploy.yml` did NOT fire; the previous stable remains "Latest". (`gh` lives at the nix store path; resolve via `command -v gh` or the store path used in round 5.)

---

## Coverage

Spec (attachment tray) → Task 4. #80 jump label → Task 1. #78 zoom refit → Task 2. #81 gear → Task 3. #79 tray bug → Task 5. Verification + nightly → Task 6. Camera (deferred) → out of scope, tracked as follow-up #83.
