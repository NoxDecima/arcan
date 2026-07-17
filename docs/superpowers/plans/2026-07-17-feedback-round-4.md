# Feedback Round 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move message timestamps below the bubbles, stop images and the edit UI from overflowing mobile bubbles, and turn the per-message edit/delete controls into an anchored popover with working long-press and right-click triggers.

**Architecture:** All four changes live in the message timeline: the `Bubble`/`MessageRow` kit pair (`src/ui/kit/bubble.tsx`, parity-locked to `tests/parity/proto-cells.jsx`), the attachment tile, and the conversation container (`src/routes/conversations/detail.tsx`) which owns edit state and the menu. The long-press/right-click plumbing (`onContext`) already exists end-to-end from feedback round 2 — this round fixes its move-cancel guard (any 1px jitter currently cancels the timer) and replaces the inline gutter menu with the header-menu popover pattern.

**Tech Stack:** React 19 + TypeScript strict, Tailwind v3 tokens (check-tokens gate), kit purity (check-ui-purity), Vitest (`tests/unit/`), Playwright (`tests/e2e/`), parity harness (baseline-only in this environment — compare percentages, not pass counts).

**Spec:** `docs/superpowers/specs/2026-07-17-feedback-round-4-design.md`

**Environment notes:**
- Worktree: `/home/nox/Documents/Projects/Nox/arcan/.claude/worktrees/feedback-round-4`, branch `worktree-feedback-round-4`. Do NOT cd elsewhere.
- Run node commands via `nix-shell --run "..."` if node is missing from PATH.
- Unit tests: `npx vitest run <path>`; full: `npm test`. Typecheck: `npm run typecheck`.
- Parity in THIS environment fails environmentally at baseline (41/142; e.g. bubble-own ~2.19%). It is usable only as a no-regression diff: record the three bubble-cell percentages before and after and confirm they stay in the same ballpark (both the app and the proto copy change identically, so the diff should not move materially).

---

### Task 1: Timestamp caption below the bubble (kit + parity + unit test)

**Files:**
- Modify: `src/ui/kit/bubble.tsx`
- Modify: `tests/parity/proto-cells.jsx:44-78` (patched proto copy)
- Test (new): `tests/unit/ui/bubble-caption.test.tsx`

- [ ] **Step 0: Record the parity baseline for the bubble cells**

Run: `nix-shell --run "npm run parity" 2>&1 | grep -E "bubble-(own|theirs|att)|parity:"`
Note the exact percentages (expected at baseline: bubble-own ~2.194% FAIL dark/tokyo etc.). You will compare after the change.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ui/bubble-caption.test.tsx`:

```tsx
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageRow } from "@/ui/kit/bubble";

describe("MessageRow timestamp caption (feedback round 4)", () => {
  test("time renders below the bubble, not inside the body row", () => {
    render(
      <MessageRow
        m={{ who: "me", text: "shipping it tonight", time: "9:22" }}
        w={220}
        bodyTestId="bubble-body"
        timeTestId="bubble-time"
      />,
    );
    const caption = screen.getByTestId("bubble-time");
    expect(caption.textContent).toBe("9:22");
    // The caption is a sibling of the bubble inside the column, not a child
    // of the body span's parent bubble div.
    const body = screen.getByTestId("bubble-body");
    expect(body.parentElement!.contains(caption)).toBe(false);
  });

  test("edited messages append the marker to the caption", () => {
    render(
      <MessageRow
        m={{ who: "me", text: "hi", time: "9:22", edited: true }}
        w={220}
        timeTestId="bubble-time"
      />,
    );
    expect(screen.getByTestId("bubble-time").textContent).toBe("9:22 · edited");
  });

  test("their messages keep a left-aligned caption; own are right-aligned", () => {
    const { rerender } = render(
      <MessageRow
        m={{ who: "them", ini: "AK", text: "hello", time: "9:18" }}
        w={220}
        timeTestId="bubble-time"
      />,
    );
    expect(screen.getByTestId("bubble-time").className).toContain("text-left");
    rerender(
      <MessageRow
        m={{ who: "me", text: "hello", time: "9:18" }}
        w={220}
        timeTestId="bubble-time"
      />,
    );
    expect(screen.getByTestId("bubble-time").className).toContain("text-right");
  });

  test("no caption renders when the message has no time and is not edited", () => {
    render(
      <MessageRow m={{ who: "me", text: "hi" }} w={220} timeTestId="bubble-time" />,
    );
    expect(screen.queryByTestId("bubble-time")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ui/bubble-caption.test.tsx`
Expected: FAIL — today the time renders inside the bubble body row, so the sibling assertion and the `· edited` text both fail.

- [ ] **Step 3: Implement in `src/ui/kit/bubble.tsx`**

(a) In `Bubble` — remove the `timeTestId` prop entirely (from the destructuring and the type literal), and replace the body/edited block (currently lines 85–119, the `{bodyOverride ?? (<>...</>)}` expression) with:

```tsx
      {bodyOverride ?? (
        <span
          className="font-body text-ui-bubble"
          {...(bodyTestId ? { "data-testid": bodyTestId } : {})}
        >
          {m.text}
        </span>
      )}
```

Also update the `BubbleMsg.edited` JSDoc (line 22) to:

```tsx
  /** Message was edited — MessageRow appends "· edited" to the caption below the bubble (feedback round 4). */
```

(b) In `MessageRow` — keep its `timeTestId` prop, but stop forwarding it to `Bubble` (line 235), and render the caption after `<Bubble …/>` inside the column div (after line 235, still inside the `flex flex-col` div):

```tsx
        <Bubble m={m} w={w} attSlot={attSlot} bodyTestId={bodyTestId} bodyOverride={bodyOverride} />
        {/* intent-fix (feedback round 4): timestamp moved OUT of the bubble
            to a caption below it — user direction, 2026-07-16 walkthrough.
            The in-bubble "(edited)" line merges into the caption too. */}
        {(m.time || m.edited) && (
          <span
            className={`font-mono font-medium text-ui-time text-dim ${
              mine ? "text-right" : "text-left"
            }`}
            {...(timeTestId ? { "data-testid": timeTestId } : {})}
          >
            {m.time}
            {m.edited ? (m.time ? " · edited" : "· edited") : ""}
          </span>
        )}
```

Update MessageRow's `timeTestId` JSDoc comment to say "testid on the caption below the bubble".

- [ ] **Step 4: Patch the proto parity copy `tests/parity/proto-cells.jsx`**

In the patched copy (lines 44–78):

(a) In `function Bubble` — replace the body row (lines 51–56, the `<div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>…</div>` block including both time spans) with just the body span:

```jsx
      <span style={{ font: `400 12.5px/1.45 ${s.body}` }}>{m.text}</span>
```

(b) In `function Row` — add the caption below `<Bubble …/>` (after line 74, inside the column div):

```jsx
        {/* intent-fix (feedback round 4): timestamp caption below the bubble */}
        {m.time && <span style={{ font: `500 8.5px/1 ${s.font}`, color: c.dim, textAlign: mine ? 'right' : 'left' }}>{m.time}</span>}
```

(c) Extend the patch-note header comment (line 36) with:
`feedback round 4: time moved out of the bubble to a caption below (both sides patched identically).`

- [ ] **Step 5: Run tests + gates + parity no-regression**

Run: `npx vitest run tests/unit/ui/ tests/unit/routes/ && npm run typecheck && npm run check-tokens && npm run check-ui-purity`
Expected: all PASS (`tsc` will catch any leftover `timeTestId` forwarding to `Bubble` — chat-screen passes it to `MessageRow`, which is unchanged and fine).

Run: `nix-shell --run "npm run parity" 2>&1 | grep -E "bubble-(own|theirs|att)|parity:"`
Expected: the three bubble-cell percentages in the same ballpark as Step 0 (both sides changed identically; small drift from font rendering is fine, a jump of several points is not). Overall count still ~41/142.

- [ ] **Step 6: Commit**

```bash
git add src/ui/kit/bubble.tsx tests/parity/proto-cells.jsx tests/unit/ui/bubble-caption.test.tsx
git commit -m "feat(chat): timestamp caption below the bubble; merge edited marker into it"
```

---

### Task 2: Image overflow fix

**Files:**
- Modify: `src/components/attachment-tile.tsx:104`
- Test (new): `tests/unit/components/attachment-tile-size.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/attachment-tile-size.test.tsx`. `AttachmentTile` (src/components/attachment-tile.tsx) takes plain props (`attachment`, `mode`, `loadAs`, `onImageClick`) but async-loads the image URL via `co.fileStream().loadAsBlob` and `URL.createObjectURL` (absent in jsdom) — stub both:

```tsx
import { describe, test, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AttachmentTile } from "@/components/attachment-tile";

vi.mock("jazz-tools", () => ({
  co: {
    fileStream: () => ({
      loadAsBlob: async () => new Blob(["x"], { type: "image/png" }),
    }),
  },
}));

vi.mock("@/platform/files", () => ({
  saveBlobNative: vi.fn(async () => null),
}));

describe("sent image tile sizing (feedback round 4)", () => {
  test("image can never exceed its container: min(280px, 100%)", async () => {
    vi.stubGlobal("URL", Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    }));
    render(
      <AttachmentTile
        attachment={{
          mimeType: "image/png",
          filename: "photo.png",
          size: 1234,
          data: { $jazz: { id: "co_zstream" } },
        }}
        mode="sent"
        loadAs={{}}
        onImageClick={() => {}}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("attachment-tile-sent-image").querySelector("img"),
      ).toBeTruthy();
    });
    const img = screen
      .getByTestId("attachment-tile-sent-image")
      .querySelector("img")!;
    expect(img.style.maxWidth).toBe("min(280px, 100%)");
    expect(img.style.maxHeight).toBe("280px");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/attachment-tile-size.test.tsx`
Expected: FAIL — current inline style is `maxWidth: 280` → `img.style.maxWidth === "280px"`.

- [ ] **Step 3: Implement**

In `src/components/attachment-tile.tsx` line 104, replace:

```tsx
            style={{ maxWidth: 280, maxHeight: 280 }}
```

with:

```tsx
            // Inline style overrides the max-w-full class, so cap against the
            // container too — a 280px image must not escape a ~190px mobile
            // bubble (feedback round 4).
            style={{ maxWidth: "min(280px, 100%)", maxHeight: 280 }}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/attachment-tile-size.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/attachment-tile.tsx tests/unit/components/attachment-tile-size.test.tsx
git commit -m "fix(chat): sent images can no longer overflow the bubble on narrow screens"
```

---

### Task 3: Edit-mode width fix

**Files:**
- Create: `src/lib/edit-box-width.ts`
- Modify: `src/routes/conversations/detail.tsx:852`
- Test (new): `tests/unit/lib/edit-box-width.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/lib/edit-box-width.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { editBoxWidth } from "@/lib/edit-box-width";

describe("editBoxWidth (feedback round 4)", () => {
  test("mobile bubble (190) → fits inside with padding", () => {
    expect(editBoxWidth(190)).toBe(166);
  });
  test("desktop bubble (460) → keeps the historical 220px", () => {
    expect(editBoxWidth(460)).toBe(220);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/lib/edit-box-width.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/edit-box-width.ts`:

```ts
/**
 * Width of the inline message-edit container. The historical fixed 220px
 * overflowed the 190px mobile bubble (feedback round 4); cap it to the
 * bubble's max width minus its horizontal padding.
 */
export function editBoxWidth(bubbleWidth: number): number {
  return Math.min(220, bubbleWidth - 24);
}
```

In `src/routes/conversations/detail.tsx`:

- Add the import near the other `@/` imports: `import { editBoxWidth } from "@/lib/edit-box-width";`
- Line 852: replace

```tsx
          <div className="flex items-center rounded-pill border border-hairline bg-bg px-3 h-[38px] w-[220px]">
```

with

```tsx
          <div
            className="flex items-center rounded-pill border border-hairline bg-bg px-3 h-[38px]"
            style={{ width: editBoxWidth(bubbleWidth) }}
          >
```

(`bubbleWidth` is in scope — declared at line ~699 in the same component.)

- [ ] **Step 4: Run tests + gates**

Run: `npx vitest run tests/unit/lib/ tests/unit/routes/ && npm run typecheck && npm run check-tokens`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/edit-box-width.ts src/routes/conversations/detail.tsx tests/unit/lib/edit-box-width.test.ts
git commit -m "fix(chat): inline edit box fits inside the mobile bubble"
```

---

### Task 4: Anchored popover menu + long-press guard fix + e2e updates

**Files:**
- Modify: `src/routes/conversations/detail.tsx:885-927` (menuSlot)
- Modify: `src/ui/kit/bubble.tsx:200-207` (long-press guard)
- Modify: `tests/e2e/messaging-1to1.spec.ts` (caption assertion + delete-confirm repair)

- [ ] **Step 1: Rewrite `menuSlot` as an anchored popover**

In `src/routes/conversations/detail.tsx`, replace the whole `menuSlot` expression (lines 887–927) with:

```tsx
      const menuSlot =
        isMine && !isDeleted && !malformed && !isEditing ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpenId(isMenuOpen ? null : msgId)}
              className="text-dim font-body text-ui-sub mt-0.5"
              data-testid="message-menu-btn"
              aria-label="Message actions"
            >
              ⋮
            </button>
            {isMenuOpen && (
              <>
                {/* tap-away backdrop — same pattern as the header menu below */}
                <button
                  type="button"
                  aria-hidden
                  tabIndex={-1}
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setMenuOpenId(null)}
                />
                {/* Opens UPWARD (bottom-full): recent messages sit at the
                    bottom of the scroll container, and an absolute child of an
                    overflow-y-auto ancestor gets clipped below it. right-0
                    keeps it inside the row (kebab sits in the gutter on the
                    bubble's free side; own rows are flex-row-reverse). */}
                <div
                  data-testid="message-menu"
                  className="absolute right-0 bottom-full mb-1 z-20 min-w-[120px] flex flex-col rounded-r-4 border border-hairline bg-panel shadow-bubble overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpenId(null);
                      setEditingMessageId(msgId);
                      setEditText(message?.body ?? "");
                    }}
                    data-testid="message-edit-btn"
                    className={`${tapClass} w-full px-3 py-2.5 text-left font-body text-ui-sub text-text`}
                  >
                    edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpenId(null);
                      void handleDeleteMessage(message);
                    }}
                    data-testid="message-delete-btn"
                    className={`${tapClass} w-full px-3 py-2.5 text-left font-body text-ui-sub text-red border-t border-hairline`}
                  >
                    delete
                  </button>
                </div>
              </>
            )}
          </div>
        ) : undefined;
```

(`tapClass` is already imported in detail.tsx for the header menu; verify and add the import if not.)

- [ ] **Step 2: Fix the long-press guard in `src/ui/kit/bubble.tsx`**

Replace the `onPointerDown` handler (lines 200–207) with:

```tsx
            onPointerDown: (e: ReactPointerEvent) => {
              if (e.pointerType === "mouse") return;
              // intent-fix (feedback round 4): the old guard cancelled on the
              // FIRST pointermove — real fingers always jitter, so long-press
              // effectively never fired. Cancel only beyond a 10px slop, and
              // clean every listener on fire/cancel. Scrolling emits
              // pointercancel, which also cancels.
              const el = e.currentTarget;
              const startX = e.clientX;
              const startY = e.clientY;
              let timer = 0;
              const onMove = (ev: Event) => {
                const p = ev as PointerEvent;
                if (Math.hypot(p.clientX - startX, p.clientY - startY) > 10) {
                  cancel();
                }
              };
              const cancel = () => {
                window.clearTimeout(timer);
                el.removeEventListener("pointerup", cancel);
                el.removeEventListener("pointercancel", cancel);
                el.removeEventListener("pointerleave", cancel);
                el.removeEventListener("pointermove", onMove);
              };
              timer = window.setTimeout(() => {
                cancel();
                onContext();
              }, 500);
              el.addEventListener("pointerup", cancel);
              el.addEventListener("pointercancel", cancel);
              el.addEventListener("pointerleave", cancel);
              el.addEventListener("pointermove", onMove);
            },
```

Leave the `onContextMenu` branch (right-click) exactly as it is — it already matches the spec.

- [ ] **Step 3: Update `tests/e2e/messaging-1to1.spec.ts`**

(a) The edited indicator moved out of the bubble and reads `· edited` — the old in-bubble literal `(edited)` no longer exists as an indicator. The current assertion at ~line 102 (`toContainText("(edited)")`) would still pass vacuously because the message BODY text also contains the literal "(edited)" — replace it with a caption-anchored assertion:

```ts
    // The edited marker lives in the caption below the bubble now.
    await expect(
      pageA.locator('[data-testid="bubble-time"]', { hasText: "edited" }).first(),
    ).toBeVisible({ timeout: 10_000 });
```

Apply the same replacement wherever the spec asserts the indicator (NOT the body text — assertions on "Hey Bob! (edited)" are about the message body and stay).

(b) Repair the delete step (SCOPED EXCEPTION — this spec currently fails pre-existing because feedback round 2 replaced the native `confirm()` with a custom modal, and the spec still uses `page.once("dialog")`; it must be repaired here because it is the e2e coverage for the menu this task changes; do NOT touch the other broken specs). `handleDeleteMessage` awaits `confirmDialog(…)` (detail.tsx:648-649), whose modal renders confirm/cancel buttons with testids `confirm-dialog-confirm` / `confirm-dialog-cancel` (src/components/confirm-dialog.tsx:90,98). Replace the `page.once("dialog", …)` mechanism around lines ~131–138 with:

```ts
    await pageA.getByTestId("message-menu-btn").first().click();
    await pageA.getByTestId("message-delete-btn").click();
    await pageA.getByTestId("confirm-dialog-confirm").click();
```

- [ ] **Step 4: Run the spec + gates**

Run: `nix-shell --run "npx playwright test tests/e2e/messaging-1to1.spec.ts --project=chromium"`
Expected: PASS end-to-end now (the popover keeps the `message-menu-btn → message-edit-btn/message-delete-btn` click sequence, the caption assertion matches the new DOM, and the delete-confirm repair unblocks step 8). If the menu popover is clipped or unclickable, debug the positioning — do not weaken assertions.

Run: `npx vitest run tests/unit/ && npm run typecheck && npm run check-tokens && npm run check-ui-purity`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/conversations/detail.tsx src/ui/kit/bubble.tsx tests/e2e/messaging-1to1.spec.ts
git commit -m "feat(chat): anchored message menu popover; reliable long-press; repair delete e2e"
```

---

### Task 5: Device checklist + full gate run

**Files:**
- Modify: `docs/testing/android-device-checklist.md` (append)

- [ ] **Step 1: Extend the device checklist**

Append to the end of `docs/testing/android-device-checklist.md`:

```markdown

## Feedback round 4 (2026-07-17)
- [ ] Timestamps render below bubbles (right-aligned own, left-aligned theirs);
      edited messages show "HH:MM · edited"
- [ ] A wide image stays inside its bubble on the phone screen
- [ ] Editing a message: the input fits inside the bubble, save/cancel reachable
- [ ] Long-press (~0.5s) on an own message opens the edit/delete popover
- [ ] Scrolling the timeline with a finger over an own message does NOT open it
- [ ] Tap-away closes the popover; edit and delete both work from it
- [ ] Desktop web: right-click on an own message opens the same popover;
      right-click elsewhere keeps the browser's native context menu
```

- [ ] **Step 2: Full gate run**

Run each, confirm green:

```bash
npm run typecheck
npm run check-tokens
npm run check-ui-purity
npm run check-platform-purity
npm test
nix-shell --run "npx playwright test tests/e2e/messaging-1to1.spec.ts tests/e2e/attachment-image.spec.ts tests/e2e/back-navigation.spec.ts tests/e2e/add-contact-paste.spec.ts"
```

(The full Playwright suite still has 10 known pre-existing failures unrelated to this branch — the four specs above are the affected + neighbouring coverage. Parity: re-run the bubble-cell grep from Task 1 Step 5 and confirm unchanged from that run.)

- [ ] **Step 3: Commit**

```bash
git add docs/testing/android-device-checklist.md
git commit -m "docs(testing): device checklist items for feedback round 4"
```

---

## Out of scope (do not implement)

- Repairing the other 10 pre-existing failing e2e specs (only messaging-1to1's delete step, which covers this round's menu).
- Timestamp grouping, bottom-sheet menus, actions on others' messages (all declined in the spec).
- Any change to system/deleted/malformed message rows.
