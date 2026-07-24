# Feedback Round 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the eight items from the 2026-07-24 walkthrough of `nightly-2026-07-24`: darken the dark ladder to "Night", lock mobile zoom, capture image dimensions to un-squash grids and stop the timeline drifting off-bottom, add a jump-to-latest button (with an auto-scroll behavior fix), multi-line message edit, dialog-free Android Downloads saving, and fix the attachment-tray first-photo race.

**Architecture:** One `--no-ff` slice on branch `worktree-feedback-round-5` (already created off main tip `fc66e9b`). Surface change is token-only + parity/manifest follow-through. Two new optional schema fields (`FileBlob.width/height`) feed a pure aspect-clamp module that both the grid and the single-tile placeholder consume. Scroll work adds a scroll-state foundation in `detail.tsx` (an `isNearBottom` signal + a "user has scrolled" latch) that powers both the ResizeObserver re-anchoring and the jump button. Android Downloads uses a raw-path `$HOME/Download/` write with the save dialog demoted to fallback. The tray bug is root-caused with systematic-debugging and pinned by a regression test.

**Tech Stack:** React 19, TypeScript (strict), Tailwind v3, jazz-tools 0.20.18, Tauri 2 (`@tauri-apps/plugin-fs`), Vitest, Playwright. All commands run through `nix-shell --run '<cmd>'` from the worktree root.

**Spec:** `docs/superpowers/specs/2026-07-24-feedback-round-5-design.md`

**Conventions:**
- Every command: `nix-shell --run '<cmd>'`.
- Authoritative type gate: `nix-shell --run 'npm run typecheck'`.
- Token guard: `nix-shell --run 'npm run check-tokens'` (rejects raw color/duration/font literals — inline `style={{ aspectRatio }}` and `bg-black/N` scrims are fine).
- UI purity: `nix-shell --run 'npm run check-ui-purity'` (`src/ui/` must not import Jazz/router/`@/components`).
- Platform purity: `nix-shell --run 'npm run check-platform-purity'` (`@tauri-apps/*` only under `src/platform/`).
- Parity: `nix-shell --run 'npm run parity'` — target 142/142.
- Commit after each task with the shown message. Do NOT tag or merge until Task 11.

---

## Task 1: Night ladder — token remap + parity + manifest follow-through

Darken every dark rung one step. Light mode, text tokens, and accent blocks are untouched. Follow through to the parity `ladderSkin()` hexes and the installed-app chrome colors so nothing drifts.

**Files:**
- Modify: `src/styles/tokens.css` (dark `:root` block, lines ~14–23)
- Modify: `tests/parity/proto-cells.jsx` (`LADDER.dark`, line ~28)
- Modify: `index.html` (`theme-color` meta, line 8)
- Modify: `public/manifest.webmanifest` (`background_color`, `theme_color`)

- [ ] **Step 1: Remap the dark surface tokens**

In `src/styles/tokens.css`, the dark block currently reads:

```css
  --color-bg: #1f2335;
  --color-bg-stage: #16161e;
  --color-panel: #292e42;
  --color-panel-2: #414868;
  --color-rail: #16161e;
  --color-chrome: #1a1b26;
  --color-border: #3b4261;
```

Replace those seven lines with the Night values:

```css
  --color-bg: #1a1b26;
  --color-bg-stage: #101014;
  --color-panel: #24283b;
  --color-panel-2: #343a55;
  --color-rail: #101014;
  --color-chrome: #16161e;
  --color-border: #2f3549;
```

Leave `--color-text*`, `--color-dim`, and every `data-accent` block exactly as they are.

- [ ] **Step 2: Mirror the remap in the parity skin**

In `tests/parity/proto-cells.jsx`, the `LADDER.dark` line currently reads:

```js
  dark:  { stage: '#16161e', rail: '#16161e', bg: '#1f2335', panel: '#292e42', panel2: '#414868', border: '#3b4261', chrome: '#1a1b26' },
```

Replace with:

```js
  dark:  { stage: '#101014', rail: '#101014', bg: '#1a1b26', panel: '#24283b', panel2: '#343a55', border: '#2f3549', chrome: '#16161e' },
```

Leave `LADDER.light` unchanged.

- [ ] **Step 3: Update installed-app chrome colors**

In `index.html` line 8:

```html
    <meta name="theme-color" content="#1a1b26" />
```

becomes (chrome rung's new value):

```html
    <meta name="theme-color" content="#16161e" />
```

In `public/manifest.webmanifest`, change:

```json
  "background_color": "#16161e",
  "theme_color": "#1a1b26",
```

to:

```json
  "background_color": "#101014",
  "theme_color": "#16161e",
```

- [ ] **Step 4: Grep-verify no stale dark hexes remain**

Run:

```bash
nix-shell --run "grep -rn --include='*.css' --include='*.json' --include='*.webmanifest' --include='*.html' --include='*.jsx' --include='*.xml' --include='*.kt' -e '#1f2335' -e '#292e42' -e '#414868' -e '#3b4261' src index.html public tests src-tauri || echo 'CLEAN'"
```

Expected: `CLEAN` (the old Storm rung values are fully gone). If `src-tauri/gen/android` surfaces a baked splash/status hex among these, update it to the new equivalent and re-run. `#16161e` and `#1a1b26` legitimately remain — they are now the stage and canvas values.

- [ ] **Step 5: Typecheck, tokens, parity**

Run:

```bash
nix-shell --run 'npm run typecheck && npm run check-tokens && npm run parity'
```

Expected: typecheck clean, tokens clean, parity 142/142 (proto and app both consume the new hexes so galleries re-render identically).

- [ ] **Step 6: Commit**

```bash
git add src/styles/tokens.css tests/parity/proto-cells.jsx index.html public/manifest.webmanifest
git commit -m "feat(theme): darken dark ladder to Night (one rung deeper) + manifest/parity follow-through"
```

---

## Task 2: Mobile zoom lock

Disable pinch-zoom and double-tap zoom app-wide via the viewport meta. This removes the "screen ends up zoomed in when changing scale" failure (double-tapping the scale pill could trigger WebView double-tap zoom on top of the CSS zoom).

**Files:**
- Modify: `index.html` (viewport meta, line 7)
- Test: `tests/e2e/ui-scale.spec.ts` (re-run only — no new assertions)

- [ ] **Step 1: Lock the viewport**

In `index.html` line 7:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

becomes:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```

- [ ] **Step 2: Confirm the UI-scale suite still passes**

The in-app CSS `zoom` is independent of the viewport user-zoom, so nothing should break. Run:

```bash
nix-shell --run 'npx playwright test tests/e2e/ui-scale.spec.ts --project=chromium --workers=2'
```

Expected: all pass. (If Playwright needs the dev server, start it per repo convention: `npm run sync` + `npm run dev` in the background first.)

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(mobile): lock viewport zoom (no pinch / double-tap) — in-app UI scale is the sanctioned zoom"
```

---

## Task 3: FileBlob dimensions — schema + capture at upload (TDD)

Add optional intrinsic dimensions and capture them when an image is attached. Optional forever per Jazz migration doctrine; legacy attachments simply lack them.

**Files:**
- Modify: `src/jazz/schema/FileBlob.ts`
- Create: `src/jazz/image-dimensions.ts`
- Modify: `src/jazz/attachments.ts`
- Test: `tests/unit/image-dimensions.test.ts`

- [ ] **Step 1: Add optional schema fields**

In `src/jazz/schema/FileBlob.ts`, change the map to:

```ts
export const FileBlob = co.map({
  mimeType: z.string(),
  size: z.number(),
  filename: z.string().optional(),
  data: co.fileStream(),
  // Intrinsic pixel dimensions of image attachments, captured at upload
  // (feedback round 5). Optional FOREVER: required-field validation runs
  // before migration backfill visibility, and legacy attachments have none.
  // Consumers (grid aspect, placeholder reservation) treat absence as
  // "unknown" and fall back to fixed layout.
  width: z.number().optional(),
  height: z.number().optional(),
});
```

- [ ] **Step 2: Write the failing test for the dimension helper**

Create `tests/unit/image-dimensions.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { readImageDimensions } from "@/jazz/image-dimensions";

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error test cleanup
  delete (globalThis as any).createImageBitmap;
});

describe("readImageDimensions", () => {
  it("returns null for non-image files without touching the decoder", async () => {
    const spy = vi.fn();
    (globalThis as any).createImageBitmap = spy;
    const file = new File(["x"], "a.txt", { type: "text/plain" });
    expect(await readImageDimensions(file)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns width/height from createImageBitmap for an image file", async () => {
    (globalThis as any).createImageBitmap = vi.fn().mockResolvedValue({
      width: 800,
      height: 1200,
      close: vi.fn(),
    });
    const file = new File([new Uint8Array([1, 2, 3])], "p.jpg", {
      type: "image/jpeg",
    });
    expect(await readImageDimensions(file)).toEqual({ width: 800, height: 1200 });
  });

  it("returns null (never throws) when decoding fails", async () => {
    (globalThis as any).createImageBitmap = vi
      .fn()
      .mockRejectedValue(new Error("bad image"));
    const file = new File([new Uint8Array([1])], "p.jpg", { type: "image/jpeg" });
    expect(await readImageDimensions(file)).toBeNull();
  });
});
```

- [ ] **Step 2b: Run it — verify it fails**

```bash
nix-shell --run 'npx vitest run tests/unit/image-dimensions.test.ts'
```

Expected: FAIL (module `@/jazz/image-dimensions` not found).

- [ ] **Step 3: Implement the helper**

Create `src/jazz/image-dimensions.ts`:

```ts
/**
 * Read an image file's intrinsic pixel dimensions for upload-time capture
 * (feedback round 5). Uses createImageBitmap (available in the app + Android
 * WebView); never throws — decode failure or non-image → null, and callers
 * upload without dimensions (consumers fall back to fixed layout).
 */
export interface ImageDimensions {
  width: number;
  height: number;
}

export async function readImageDimensions(
  file: File,
): Promise<ImageDimensions | null> {
  if (!file.type.startsWith("image/")) return null;
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    bitmap.close?.();
    if (!width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test — verify it passes**

```bash
nix-shell --run 'npx vitest run tests/unit/image-dimensions.test.ts'
```

Expected: PASS (3 tests).

- [ ] **Step 5: Capture dimensions in uploadAttachment**

In `src/jazz/attachments.ts`, add the import at the top:

```ts
import { readImageDimensions } from "@/jazz/image-dimensions";
```

Then in `uploadAttachment`, after the size check and before/around the FileBlob creation, read dimensions and include them:

```ts
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentTooLargeError(file.name, file.size);
  }
  const dims = await readImageDimensions(file);
  const stream = await co.fileStream().createFromBlob(file, { owner });
  const blob = FileBlob.create(
    {
      mimeType: file.type,
      size: file.size,
      filename: file.name,
      data: stream,
      ...(dims ? { width: dims.width, height: dims.height } : {}),
    },
    { owner },
  );
  return blob;
```

- [ ] **Step 6: Typecheck + commit**

```bash
nix-shell --run 'npm run typecheck && npx vitest run tests/unit/image-dimensions.test.ts'
git add src/jazz/schema/FileBlob.ts src/jazz/image-dimensions.ts src/jazz/attachments.ts tests/unit/image-dimensions.test.ts
git commit -m "feat(attachments): capture image width/height at upload (optional FileBlob fields)"
```

---

## Task 4: Aspect-clamp math (TDD, pure module)

A pure, testable module that turns image dimensions into clamped aspect ratios for the grid and the single-tile placeholder. Portrait pairs get taller cells; one extreme panorama can't blow up the layout; any image lacking dimensions makes the grid fall back to today's fixed squares.

**Files:**
- Create: `src/components/attachment-grid.ts`
- Test: `tests/unit/attachment-grid.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/attachment-grid.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  imageAspect,
  gridUnitAspect,
  heroAspect,
  CELL_MIN,
  CELL_MAX,
} from "@/components/attachment-grid";

describe("imageAspect", () => {
  it("returns w/h when both dims are positive numbers", () => {
    expect(imageAspect({ width: 800, height: 400 })).toBe(2);
  });
  it("returns null when a dimension is missing or non-positive", () => {
    expect(imageAspect({ width: 800 })).toBeNull();
    expect(imageAspect({ width: 0, height: 400 })).toBeNull();
    expect(imageAspect({})).toBeNull();
    expect(imageAspect(null)).toBeNull();
  });
});

describe("gridUnitAspect", () => {
  it("returns null if ANY member lacks dimensions (fall back to squares)", () => {
    expect(gridUnitAspect([2, null, 1])).toBeNull();
  });
  it("averages then clamps into [3/4, 4/3]", () => {
    // two tall portraits (0.5 each) → mean 0.5 → clamps up to 3/4
    expect(gridUnitAspect([0.5, 0.5])).toBeCloseTo(CELL_MIN, 5);
    // two wide (3.0 each) → clamps down to 4/3
    expect(gridUnitAspect([3, 3])).toBeCloseTo(CELL_MAX, 5);
    // square-ish stays put
    expect(gridUnitAspect([1, 1])).toBeCloseTo(1, 5);
  });
  it("returns null for an empty list", () => {
    expect(gridUnitAspect([])).toBeNull();
  });
});

describe("heroAspect", () => {
  it("doubles the unit and clamps into [1.5, 2.5]", () => {
    expect(heroAspect(1)).toBe(2);
    expect(heroAspect(CELL_MIN)).toBe(1.5); // 0.75*2 = 1.5
    expect(heroAspect(CELL_MAX)).toBeCloseTo(2.5, 5); // 1.333*2 = 2.667 → clamp 2.5
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

```bash
nix-shell --run 'npx vitest run tests/unit/attachment-grid.test.ts'
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement the module**

Create `src/components/attachment-grid.ts`:

```ts
/**
 * Aspect-ratio math for the multi-image grid + single-image placeholder
 * (feedback round 5). Pure and unit-tested. "Aspect" is width/height.
 *
 * Cells clamp to a near-square band so portrait sets get visibly taller
 * bubbles while one extreme panorama can't blow the layout up. If ANY visible
 * image lacks stored dimensions, the grid falls back to today's fixed squares
 * (gridUnitAspect → null), so legacy messages are unchanged.
 */
export const CELL_MIN = 3 / 4; // 0.75 — tallest allowed cell
export const CELL_MAX = 4 / 3; // 1.333 — widest allowed square-ish cell
export const HERO_MIN = 1.5;
export const HERO_MAX = 2.5;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** w/h for an attachment with stored dims, else null. */
export function imageAspect(att: any): number | null {
  const w = att?.width;
  const h = att?.height;
  if (typeof w === "number" && typeof h === "number" && w > 0 && h > 0) {
    return w / h;
  }
  return null;
}

/**
 * One shared aspect for the grid's square-ish cells: mean of members' clamped
 * aspects, clamped again. null when any member lacks dims (→ fixed squares).
 */
export function gridUnitAspect(aspects: (number | null)[]): number | null {
  if (aspects.length === 0) return null;
  if (aspects.some((a) => a == null)) return null;
  const clamped = (aspects as number[]).map((a) => clamp(a, CELL_MIN, CELL_MAX));
  const mean = clamped.reduce((s, v) => s + v, 0) / clamped.length;
  return clamp(mean, CELL_MIN, CELL_MAX);
}

/** Full-width hero cell (spans 2 columns): ~2× the unit, clamped wide. */
export function heroAspect(unit: number): number {
  return clamp(unit * 2, HERO_MIN, HERO_MAX);
}
```

- [ ] **Step 4: Run the test — verify it passes**

```bash
nix-shell --run 'npx vitest run tests/unit/attachment-grid.test.ts'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/attachment-grid.ts tests/unit/attachment-grid.test.ts
git commit -m "feat(attachments): pure aspect-clamp math for dimension-aware grid"
```

---

## Task 5: Dimension-aware grid + single-image placeholder reservation

Wire the aspect math into the renderer. Cells stop being forced squares when dimensions exist; the single-image loading placeholder reserves the real box so late-loading blobs cause no layout shift.

**Files:**
- Modify: `src/components/message-attachments.tsx`
- Modify: `src/components/attachment-tile.tsx`

- [ ] **Step 1: Compute the grid unit aspect and pass it to cells**

In `src/components/message-attachments.tsx`, import the math near the top:

```ts
import { imageAspect, gridUnitAspect, heroAspect } from "@/components/attachment-grid";
```

Change `GridCell` to accept an optional `aspectRatio` and a `spanFull` flag instead of baking the aspect into `cellClass`. Replace the `GridCell` signature + wrapper `className`/style:

```tsx
function GridCell({
  attachment,
  loadAs,
  spanFull,
  aspectRatio,
  fallbackAspectClass,
  overlayCount,
  onOpen,
}: {
  attachment: any;
  loadAs: any;
  /** true → col-span-2 (hero / odd remainder cell) */
  spanFull: boolean;
  /** computed clamped aspect, or null to use fallbackAspectClass */
  aspectRatio: number | null;
  /** Tailwind aspect class used when aspectRatio is null (legacy, no dims) */
  fallbackAspectClass: string;
  overlayCount?: number;
  onOpen: () => void;
}) {
  const url = useAttachmentImageUrl(attachment, loadAs);
  const filename = attachment?.filename ?? "image";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative block overflow-hidden bg-panel-2 ${spanFull ? "col-span-2" : ""} ${aspectRatio == null ? fallbackAspectClass : ""}`}
      style={aspectRatio == null ? undefined : { aspectRatio }}
      data-testid="attachment-grid-cell"
      aria-label={
        overlayCount != null
          ? `Show ${overlayCount} more image${overlayCount === 1 ? "" : "s"}`
          : `Open ${filename}`
      }
    >
      {url ? (
        <img
          src={url}
          alt={filename}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-dim">
          …
        </span>
      )}
      {overlayCount != null && (
        <span
          data-testid="attachment-grid-more"
          className="absolute inset-0 bg-black/50 flex items-center justify-center font-mono font-semibold text-ui-heading text-white"
        >
          +{overlayCount}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Drive the cells from the computed aspect**

Inside `MessageAttachments`, in the `images.length >= 2` branch, before the `return`, compute the shared aspect over the VISIBLE images:

```tsx
    const hasHidden = images.length > 4;
    const visible = expanded ? images : images.slice(0, 4);
    const hidden = images.length - 4;

    // Dimension-aware sizing: one clamped aspect shared by square-ish cells
    // (rows stay aligned); the full-width hero/odd cell gets ~2× that. If any
    // visible image lacks stored dims, unit is null → fall back to the fixed
    // aspect classes (legacy behavior, unchanged).
    const unit = gridUnitAspect(visible.map((att: any) => imageAspect(att)));
    const hero = unit == null ? null : heroAspect(unit);
```

Then replace the `<GridCell .../>` call so it passes `spanFull`, `aspectRatio`, and `fallbackAspectClass` derived from the existing helpers. The existing `gridCellClass`/`expandedCellClass` still decide WHICH cells are full-width and the legacy fallback aspect:

```tsx
            {visible.map((att: any, i: number) => {
              const isScrimCell =
                !expanded && hasHidden && i === visible.length - 1;
              const legacyClass = expanded
                ? expandedCellClass(images.length, i)
                : gridCellClass(visible.length, i);
              const spanFull = legacyClass.startsWith("col-span-2");
              // fallback aspect (used only when unit is null)
              const fallbackAspectClass = spanFull
                ? "aspect-[2/1]"
                : "aspect-square";
              const aspectRatio =
                unit == null ? null : spanFull ? hero : unit;
              return (
                <GridCell
                  key={(att as any)?.$jazz?.id ?? i}
                  attachment={att}
                  loadAs={me}
                  spanFull={spanFull}
                  aspectRatio={aspectRatio}
                  fallbackAspectClass={fallbackAspectClass}
                  overlayCount={isScrimCell ? hidden : undefined}
                  onOpen={
                    isScrimCell ? () => setExpanded(true) : () => setLightboxIndex(i)
                  }
                />
              );
            })}
```

(`gridCellClass` and `expandedCellClass` are retained — they still classify full-width cells and provide the legacy fallback aspect.)

- [ ] **Step 3: Reserve the single-image placeholder box**

In `src/components/attachment-tile.tsx`, import the aspect helper:

```ts
import { imageAspect } from "@/components/attachment-grid";
```

In the sent-image branch, compute the aspect once and apply it to BOTH the loaded `<img>` and the loading placeholder so the box is identical before and after load:

```tsx
    // sent
    const aspect = imageAspect(attachment);
    return (
      <button
        type="button"
        onClick={onImageClick}
        className="block max-w-full"
        data-testid="attachment-tile-sent-image"
        aria-label={`Open ${filename}`}
      >
        {url ? (
          <img
            src={url}
            alt={filename}
            className="rounded max-w-full object-contain border border-hairline"
            style={{ maxWidth: "min(280px, 100%)", maxHeight: 280 }}
          />
        ) : aspect != null ? (
          // Reserve the real box so the late blob causes no layout shift.
          <div
            className="bg-panel-2 rounded border border-hairline"
            style={{
              width: "min(280px, 100%)",
              aspectRatio: aspect,
              maxHeight: 280,
            }}
            data-testid="attachment-tile-loading"
          />
        ) : (
          <div className="w-48 h-32 flex items-center justify-center bg-panel-2 text-xs text-dim rounded">
            Loading image…
          </div>
        )}
      </button>
    );
```

- [ ] **Step 4: Typecheck + tokens + parity**

```bash
nix-shell --run 'npm run typecheck && npm run check-tokens && npm run parity'
```

Expected: all clean, parity 142/142 (these components aren't parity cells).

- [ ] **Step 5: Commit**

```bash
git add src/components/message-attachments.tsx src/components/attachment-tile.tsx
git commit -m "feat(attachments): dimension-aware grid cells + single-image placeholder reservation"
```

---

## Task 6: Scroll-state foundation + open-at-bottom re-anchoring

Fix the timeline landing mid-conversation. Two layers: dimension reservation (Task 5, done) removes shift for new attachments; a ResizeObserver re-runs the existing `position()` whenever late content grows the timeline — until the FIRST user-initiated scroll, which hands control to the user. This introduces the `isNearBottom` + "user scrolled" state that Task 7 reuses.

**Files:**
- Modify: `src/routes/conversations/detail.tsx`

- [ ] **Step 1: Add scroll-state refs and a programmatic-scroll guard**

In `detail.tsx`, near the existing `positionedForRef` (line ~518), add:

```ts
  const positionedForRef = useRef<string | null>(null);
  // Scroll-state foundation (feedback round 5). userScrolledRef latches true on
  // the first user-initiated scroll of this conversation visit — after that we
  // stop auto-re-anchoring and defer to the user. programmaticScrollRef marks
  // scrolls WE trigger so the scroll listener doesn't mistake them for user
  // intent. isNearBottom drives auto-scroll-on-new + the jump button (Task 7).
  const userScrolledRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
```

- [ ] **Step 2: Reset the latch when the conversation changes**

Find the `position()` effect (starts line ~519). At the point where it claims a new conversation (`positionedForRef.current = convKey;`), reset the per-visit latch:

```ts
    positionedForRef.current = convKey;
    userScrolledRef.current = false;
    setIsNearBottom(true);
```

- [ ] **Step 3: Wrap programmatic positioning so it doesn't count as user scroll**

Still in that effect, wrap the `position` function body's writes with the programmatic flag. Change the `position` definition so every `el.scrollTop = …` is bracketed:

```ts
    const position = () => {
      const el = timelineRef.current;
      if (!el) return;
      programmaticScrollRef.current = true;
      const divider = el.querySelector(
        '[data-testid="new-messages-divider"]',
      ) as HTMLElement | null;
      if (divider) {
        const target =
          (divider.getBoundingClientRect().top -
            el.getBoundingClientRect().top) /
            getUiZoom() +
          el.scrollTop -
          8;
        el.scrollTop = Math.max(0, target);
      } else {
        el.scrollTop = el.scrollHeight;
      }
      // Clear on the next frame — the scroll event fires asynchronously.
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    };
```

- [ ] **Step 4: Add the scroll listener + ResizeObserver re-anchoring effect**

Add a new effect after the positioning effect (after line ~560). It (a) tracks near-bottom + the user-scroll latch, and (b) re-anchors on content growth until the user scrolls:

```ts
  // Re-anchor on late content growth (images/fonts/avatars) until the user
  // takes over, and keep isNearBottom current (feedback round 5).
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const NEAR_PX = 120;

    const computeNearBottom = () =>
      el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_PX;

    const onScroll = () => {
      if (!programmaticScrollRef.current) userScrolledRef.current = true;
      setIsNearBottom(computeNearBottom());
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    const ro = new ResizeObserver(() => {
      // Only auto-follow growth while the user hasn't scrolled away.
      if (userScrolledRef.current) return;
      programmaticScrollRef.current = true;
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
      setIsNearBottom(true);
    });
    // Observe the content, not the viewport: children growth changes
    // scrollHeight without changing the element's own box.
    for (const child of Array.from(el.children)) ro.observe(child);
    // New rows appended later also need observing; observe the container too
    // (fires on its own resize) and re-scan on mutations.
    const mo = new MutationObserver(() => {
      for (const child of Array.from(el.children)) ro.observe(child);
    });
    mo.observe(el, { childList: true });

    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      mo.disconnect();
    };
  }, [(conversation as any)?.$jazz?.id]);
```

- [ ] **Step 5: Typecheck**

```bash
nix-shell --run 'npm run typecheck'
```

Expected: clean. (`isNearBottom` is currently set but only consumed in Task 7 — that's fine; it's read in the next task. If the linter flags it as unused, proceed; Task 7 consumes it immediately.)

- [ ] **Step 6: Commit**

```bash
git add src/routes/conversations/detail.tsx
git commit -m "feat(chat): re-anchor timeline on late content growth until first user scroll"
```

---

## Task 7: Jump-to-latest button + auto-scroll behavior fix

Stop force-scrolling on every incoming message (the prerequisite). When scrolled up, keep the view put and show a floating jump-to-latest button with a count of messages since. The button is a presenter slot so `src/ui/` purity holds.

**Files:**
- Modify: `src/ui/screens/chat-screen.tsx` (new optional presenter slot)
- Modify: `src/routes/conversations/detail.tsx` (state + wiring)
- Test: `tests/e2e/jump-to-latest.spec.ts`

- [ ] **Step 1: Add the presenter slot**

In `src/ui/screens/chat-screen.tsx`, add a prop to the destructured signature and its type:

```tsx
  overlay,
  jumpToLatest,
  emptyText,
```

Type (add beside `overlay`'s):

```tsx
  /** Floating "jump to latest" control (feedback round 5). Rendered in a
   * zero-height positioning context just above the composer; visible only
   * when the user has scrolled away from the bottom. */
  jumpToLatest?: {
    visible: boolean;
    count: number;
    onClick: () => void;
  };
```

Render it between the timeline `</div>` and the composer slot (after line ~219, before `{composer}`):

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
              {jumpToLatest.count > 0 && (
                <span
                  data-testid="jump-to-latest-count"
                  className="font-mono font-semibold text-ui-caps tracking-caps-sm text-arcan-accent animate-arcan-pop"
                >
                  {jumpToLatest.count}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Composer slot — container renders ChatComposer */}
      {composer}
```

Add the `Icon` import at the top of the file:

```tsx
import { Icon } from "../kit/icon";
```

- [ ] **Step 2: Track "messages since scrolled away" and demote auto-scroll**

In `detail.tsx`, add state for the unseen-since count near the scroll refs from Task 6:

```ts
  const [unseenCount, setUnseenCount] = useState(0);
```

Find the positioning effect's "already positioned → new message arrived" branch (line ~525):

```ts
    if (positionedForRef.current === convKey) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
```

Replace it so auto-scroll only happens when near the bottom; otherwise bump the unseen count:

```ts
    if (positionedForRef.current === convKey) {
      if (isNearBottom) {
        programmaticScrollRef.current = true;
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
      } else {
        setUnseenCount((n) => n + 1);
      }
      return;
    }
```

Add `isNearBottom` to that effect's dependency array (it already lists `messageCount` and the conv id):

```ts
  }, [messageCount, (conversation as any)?.$jazz?.id, anchorReadyFor, isNearBottom]);
```

- [ ] **Step 3: Reset the count when the user returns to the bottom**

In the Task-6 scroll/ResizeObserver effect, when `computeNearBottom()` becomes true, clear the unseen count. Update `onScroll` and the ResizeObserver callback:

```ts
    const onScroll = () => {
      if (!programmaticScrollRef.current) userScrolledRef.current = true;
      const near = computeNearBottom();
      setIsNearBottom(near);
      if (near) setUnseenCount(0);
    };
```

And in the ResizeObserver callback after `setIsNearBottom(true);` add `setUnseenCount(0);`. Also reset it on conversation change (Step 2 of Task 6, alongside `setIsNearBottom(true)`): add `setUnseenCount(0);`.

- [ ] **Step 4: Add the jump handler and pass the slot to ChatScreen**

Add a handler near the other scroll code in `detail.tsx`:

```ts
  const handleJumpToLatest = () => {
    const el = timelineRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
    userScrolledRef.current = false; // returning to bottom re-enables follow
    setIsNearBottom(true);
    setUnseenCount(0);
  };
```

Find the `<ChatScreen ... />` render and add the prop (near where `overlay={<SyncStatusPill />}` is passed):

```tsx
        jumpToLatest={{
          visible: !isNearBottom,
          count: unseenCount,
          onClick: handleJumpToLatest,
        }}
```

- [ ] **Step 5: Write the e2e**

Create `tests/e2e/jump-to-latest.spec.ts`. Model it on the existing two-client conversation e2e (reuse the harness/helpers from `tests/e2e/` — check `messaging-1to1.spec.ts` for the pairing + send helpers and copy its setup):

```ts
import { test, expect } from "@playwright/test";
// Reuse the project's two-account conversation harness. Follow the setup in
// tests/e2e/messaging-1to1.spec.ts (pair two accounts, open the conversation
// on both). The specifics below assume helpers `openConversationBetween` and
// `sendMessage` exist there; if named differently, mirror that spec.

test.describe("jump to latest", () => {
  test("scrolling up suppresses auto-scroll, shows button + count, tap returns", async ({
    browser,
  }) => {
    // 1. Two contexts, paired, in the same conversation (see messaging-1to1).
    // 2. On client A, send ~30 short messages so the timeline overflows.
    // 3. On client A, scroll the timeline to the top.
    // 4. From client B, send a new message.
    // 5. Assert client A's view did NOT jump to bottom (button is visible).
    const a = await browser.newPage();
    // ...harness setup per messaging-1to1.spec.ts...
    const timeline = a.getByTestId("message-timeline");
    await timeline.evaluate((el) => (el.scrollTop = 0));
    // (client B sends here)
    await expect(a.getByTestId("jump-to-latest")).toBeVisible();
    await expect(a.getByTestId("jump-to-latest-count")).toHaveText(/[1-9]/);
    await a.getByTestId("jump-to-latest").click();
    await expect(a.getByTestId("jump-to-latest")).toBeHidden();
  });
});
```

Fill in the harness setup by copying the pairing/setup block from `tests/e2e/messaging-1to1.spec.ts` verbatim (do not invent helper names — use whatever that spec uses).

- [ ] **Step 6: Run typecheck + the new e2e**

```bash
nix-shell --run 'npm run typecheck && npm run check-ui-purity'
nix-shell --run 'npx playwright test tests/e2e/jump-to-latest.spec.ts --project=chromium --workers=2'
```

Expected: typecheck + purity clean; new spec passes. If the spec is flaky on first authoring, stabilize with explicit waits on message count before scrolling — do not add arbitrary sleeps.

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens/chat-screen.tsx src/routes/conversations/detail.tsx tests/e2e/jump-to-latest.spec.ts
git commit -m "feat(chat): jump-to-latest button + auto-scroll only when near bottom"
```

---

## Task 8: Multi-line message edit

Turn the single-line edit `<input>` into an auto-growing `<textarea>`: Enter saves, Shift+Enter inserts a newline, Escape cancels.

**Files:**
- Modify: `src/routes/conversations/detail.tsx` (edit `bodyOverride`, lines ~1129–1165)
- Test: `tests/e2e/message-edit-multiline.spec.ts`

- [ ] **Step 1: Replace the input with an auto-growing textarea**

In `detail.tsx`, the edit `bodyOverride` block (line ~1129) currently wraps a fixed-height `<input>`. Replace the wrapper + input with a textarea that grows to its content up to ~6 lines:

```tsx
      const isEditing = editingMessageId === msgId;
      const bodyOverride = isEditing ? (
        <div className="flex flex-col gap-1">
          <div
            className="rounded-r-4 border border-hairline bg-bg px-3 py-2"
            style={{ width: editBoxWidth(bubbleWidth) }}
          >
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onInput={(e) => {
                // Auto-grow: reset then fit to content, capped by max-h CSS.
                const ta = e.currentTarget;
                ta.style.height = "auto";
                ta.style.height = `${ta.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSaveEdit(message);
                } else if (e.key === "Escape") {
                  setEditingMessageId(null);
                }
              }}
              rows={1}
              className="block w-full resize-none border-none outline-none bg-transparent font-body text-ui-row leading-normal text-text max-h-[8.5rem] overflow-y-auto"
              data-testid="message-edit-input"
              autoFocus
            />
          </div>
          <div className="flex gap-1 justify-end">
            <button
              type="button"
              onClick={() => setEditingMessageId(null)}
              className="px-2 py-0.5 font-body text-ui-sub text-text-2"
            >
              cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSaveEdit(message)}
              data-testid="message-edit-save"
              className="px-2 py-0.5 font-body text-ui-sub text-arcan-accent"
            >
              save
            </button>
          </div>
        </div>
      ) : undefined;
```

Notes: the pill wrapper (`rounded-pill h-[38px]`) becomes a `rounded-r-4` box that can grow; `leading-none` → `leading-normal` (multi-line needs real line height); `max-h-[8.5rem]` ≈ 6 lines then internal scroll. `editBoxWidth(bubbleWidth)` is retained.

- [ ] **Step 2: Seed the textarea height on open**

The `autoFocus` sets focus, but the initial height won't reflect a multi-line existing value until an input event fires. Add a callback ref to size it on mount. Replace `autoFocus` with a ref callback:

```tsx
              ref={(ta) => {
                if (ta) {
                  ta.style.height = "auto";
                  ta.style.height = `${ta.scrollHeight}px`;
                  ta.focus();
                  // caret to end
                  const len = ta.value.length;
                  ta.setSelectionRange(len, len);
                }
              }}
```

(Remove the `autoFocus` attribute — the ref handles focus.)

- [ ] **Step 3: Write the e2e**

Create `tests/e2e/message-edit-multiline.spec.ts`, mirroring the edit-flow setup in the existing messaging spec (send a message, open its menu, click edit):

```ts
import { test, expect } from "@playwright/test";
// Follow the single-account send + message-menu edit flow used in
// tests/e2e/messaging-1to1.spec.ts (or the round-4 edit spec if present).

test("Shift+Enter inserts a newline; Enter saves the multi-line body", async ({
  page,
}) => {
  // ...harness: create account, open a conversation, send "line one"...
  // open the message menu → Edit
  const input = page.getByTestId("message-edit-input");
  await expect(input).toBeVisible();
  await input.press("End");
  await input.press("Shift+Enter");
  await input.type("line two");
  // bare Enter saves
  await input.press("Enter");
  const body = page.getByTestId("bubble-body").last();
  await expect(body).toContainText("line one");
  await expect(body).toContainText("line two");
});
```

Fill the harness block from the existing spec. `handleSaveEdit` already persists `editText`; the rendered bubble should show both lines (the bubble body renders newlines per existing whitespace handling — if it collapses them, that's a pre-existing display concern outside this task's scope; the test asserts both substrings are present).

- [ ] **Step 4: Run typecheck + the new e2e**

```bash
nix-shell --run 'npm run typecheck'
nix-shell --run 'npx playwright test tests/e2e/message-edit-multiline.spec.ts --project=chromium --workers=2'
```

Expected: clean + pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/conversations/detail.tsx tests/e2e/message-edit-multiline.spec.ts
git commit -m "feat(chat): multi-line message edit (Enter saves, Shift+Enter newline)"
```

---

## Task 9: Android — download straight to the Downloads folder

On the Android shell, write directly to the public Downloads collection (no dialog, no permissions on Android 11+). Demote the save dialog to a fallback. Web unchanged. Call sites toast "Saved to Downloads".

**Files:**
- Modify: `src/platform/files.ts`
- Modify: `src/platform/is-tauri.ts` (add an Android check if not present) — verify first
- Modify: `src-tauri/capabilities/mobile.json`
- Modify: `src/components/image-lightbox.tsx` (toast on direct save)
- Modify: `src/components/attachment-tile.tsx` (toast on direct save)
- Test: `tests/unit/downloads-filename.test.ts`

- [ ] **Step 1: Confirm the Android platform check**

Run:

```bash
nix-shell --run "grep -n 'isTauriAndroid\|export function isTauri' src/platform/is-tauri.ts"
```

If `isTauriAndroid` exists (it is used in `main.tsx`), use it. If not, note its actual name and use that. The steps below assume `isTauriAndroid()`.

- [ ] **Step 2: Write the failing test for the collision-safe filename**

Create `tests/unit/downloads-filename.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { downloadCollisionSafeName } from "@/platform/files";

describe("downloadCollisionSafeName", () => {
  it("inserts a numeric suffix before the extension", () => {
    const n = downloadCollisionSafeName("photo.jpg", 1737000000000);
    expect(n).toMatch(/^photo-1737000000000\.jpg$/);
  });
  it("handles names with no extension", () => {
    const n = downloadCollisionSafeName("photo", 42);
    expect(n).toBe("photo-42");
  });
  it("handles names with multiple dots (only the last is the ext)", () => {
    const n = downloadCollisionSafeName("my.file.png", 7);
    expect(n).toBe("my.file-7.png");
  });
});
```

- [ ] **Step 3: Run it — verify it fails**

```bash
nix-shell --run 'npx vitest run tests/unit/downloads-filename.test.ts'
```

Expected: FAIL (`downloadCollisionSafeName` not exported).

- [ ] **Step 4: Implement the direct-to-Downloads path**

In `src/platform/files.ts`, add the import at the top:

```ts
import { isTauri } from "./is-tauri";
import { isTauriAndroid } from "./is-tauri";
```

(If both come from the same module, combine into one import line.)

Add the exported helper and the Android writer, and rework `saveBlobNative`/`downloadBlob` to return an outcome so callers can toast. Replace the `saveBlobNative` + `downloadBlob` section (lines ~155–190) with:

```ts
/**
 * Insert a numeric suffix before the extension so a same-named file in the
 * public Downloads folder (possibly owned by another app and invisible to us)
 * doesn't block the write. Do NOT use exists() — cross-app files are invisible
 * but still collide.
 */
export function downloadCollisionSafeName(filename: string, stamp: number): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return `${filename}-${stamp}`;
  return `${filename.slice(0, dot)}-${stamp}${filename.slice(dot)}`;
}

export type DownloadOutcome = "downloads" | "dialog" | "web";

/**
 * Android: write the blob directly into the PUBLIC Downloads collection via
 * plugin-fs against BaseDirectory.Home ("/storage/emulated/0" → "Download/").
 * No dialog, no permissions on Android 11+. Returns true when it wrote the
 * file; false to let the caller fall back to the save dialog (e.g. Android 10
 * path restrictions).
 */
async function saveToDownloadsAndroid(
  blob: Blob,
  filename: string,
): Promise<boolean> {
  if (!isTauriAndroid()) return false;
  try {
    const { writeFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    // stamp is caller-supplied indirection-free: Date.now via the blob's own
    // timeline is fine here (platform layer, not a workflow script).
    const stamp = Date.now();
    const name = downloadCollisionSafeName(filename, stamp);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(`Download/${name}`, bytes, { baseDir: BaseDirectory.Home });
    return true;
  } catch (err) {
    console.warn("[files] direct Downloads write failed, falling back:", err);
    return false;
  }
}

/** Returns true if the shell handled the save via the dialog. */
export async function saveBlobNative(
  blob: Blob,
  filename: string,
): Promise<boolean> {
  if (!isTauri()) return false;
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  const path = await save({ defaultPath: filename });
  if (!path) return true; // user cancelled — handled, don't anchor-download
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await writeFile(path, bytes);
  return true;
}

/**
 * Download/save a blob with platform dispatch. Android → straight to the
 * public Downloads folder (no dialog); other shells → save dialog; web →
 * anchor download. Returns which path handled it so call sites can toast
 * ("Saved to Downloads" only for the direct Android path).
 */
export async function downloadBlob(
  blob: Blob,
  filename: string,
): Promise<DownloadOutcome> {
  if (await saveToDownloadsAndroid(blob, filename)) return "downloads";
  if (await saveBlobNative(blob, filename)) return "dialog";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return "web";
}
```

- [ ] **Step 5: Run the filename test — verify it passes**

```bash
nix-shell --run 'npx vitest run tests/unit/downloads-filename.test.ts'
```

Expected: PASS.

- [ ] **Step 6: Grant the fs capability for the Downloads path (Android-only)**

In `src-tauri/capabilities/mobile.json`, add scoped write permission to the `permissions` array:

```json
  "permissions": [
    "barcode-scanner:allow-scan",
    "barcode-scanner:allow-cancel",
    "barcode-scanner:allow-check-permissions",
    "barcode-scanner:allow-request-permissions",
    {
      "identifier": "fs:allow-write-file",
      "allow": [{ "path": "$HOME/Download/**" }]
    }
  ]
```

(The `mobile.json` capability already targets `["android", "iOS"]`, so this scope stays off desktop.)

- [ ] **Step 7: Toast on the direct path at both call sites**

In `src/components/image-lightbox.tsx`, find the download handler that calls `downloadBlob` (around line 93) and toast on the `"downloads"` outcome. It already has toast access if the round-4 work wired it; if not, use the existing `useToast` hook pattern from the file. Example shape:

```tsx
      const outcome = await downloadBlob(blob, filename);
      if (outcome === "downloads") toast({ tone: "success", text: "Saved to Downloads" });
```

In `src/components/attachment-tile.tsx`, `handleDownload` (line ~165) currently ignores the return. If the tile has toast access, mirror the above; if it does not currently use `useToast`, add it following the project convention (`import { useToast } from …`). Keep the existing try/catch.

- [ ] **Step 8: Typecheck + tokens + purity + unit**

```bash
nix-shell --run 'npm run typecheck && npm run check-tokens && npm run check-platform-purity && npx vitest run tests/unit/downloads-filename.test.ts'
```

Expected: all clean.

- [ ] **Step 9: Commit**

```bash
git add src/platform/files.ts src-tauri/capabilities/mobile.json src/components/image-lightbox.tsx src/components/attachment-tile.tsx tests/unit/downloads-filename.test.ts
git commit -m "feat(android): download straight to public Downloads folder (no dialog) + toast"
```

---

## Task 10: Attachment-tray first-photo bug (systematic-debugging + regression test)

"Sometimes the first added photo doesn't show in the tray until a second is added." REQUIRED SUB-SKILL for this task: `superpowers:systematic-debugging`. Do NOT guess-patch — reproduce first, then fix root cause, then pin with a test.

**Files:**
- Investigate: `src/routes/conversations/detail.tsx` (ingest + `attachSlot` construction, lines ~782–819, ~1457–1463)
- Investigate: `src/components/composer-attachment-tray.tsx`, `src/ui/screens/chat-composer.tsx`
- Likely-modify: one of the above
- Test: `tests/unit/composer-attachment-tray.test.tsx` (or an e2e if JSDOM can't repro)

- [ ] **Step 1: Reproduce (Phase 1 — root cause)**

Read the ingest path and how `attachSlot` is built and passed. The investigation flagged these candidates (in order): (a) the inline `attachSlot={pending.length > 0 ? <ComposerAttachmentTray … /> : undefined}` JSX identity causing the tray to unmount/remount and `PendingPreview` to lose its object-URL state on the first→first transition; (b) the first render committing with `url===null` and no second paint until the next state change; (c) the native (Tauri picker) ingest path resolving outside React's batching.

Write a failing test FIRST that encodes the expected behavior. Create `tests/unit/composer-attachment-tray.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ComposerAttachmentTray } from "@/components/composer-attachment-tray";

beforeEach(() => {
  // JSDOM lacks createObjectURL — stub it so PendingPreview can render.
  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:mock");
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

describe("ComposerAttachmentTray", () => {
  it("renders exactly one item immediately after the first image is added", () => {
    const file = new File([new Uint8Array([1])], "p.jpg", { type: "image/jpeg" });
    render(
      <ComposerAttachmentTray
        pending={[{ tempId: "t1", file }]}
        onRemove={() => {}}
      />,
    );
    expect(screen.getAllByTestId("composer-attachment-tray-item")).toHaveLength(1);
    // The preview <img> must be present (url resolved), not the fallback.
    expect(screen.getByRole("img")).toBeInTheDocument();
  });
});
```

Run it:

```bash
nix-shell --run 'npx vitest run tests/unit/composer-attachment-tray.test.tsx'
```

- [ ] **Step 2: Interpret the result (Phase 1 → 2)**

- If the test FAILS in JSDOM: you have reproduced it at the component level. The `PendingPreview` effect sets `url` after mount — if the image never appears, the effect/render interaction is the root cause. Proceed to fix `PendingPreview` (e.g. initialize `url` synchronously via a lazy `useState(() => file.type.startsWith("image/") ? URL.createObjectURL(file) : null)` and revoke in an effect cleanup) — this removes the post-mount-flash and any dependence on a second render.
- If the test PASSES in JSDOM: the component render is fine, so the bug lives in the CONTAINER — how `detail.tsx` builds/holds `attachSlot`. The root cause is then candidate (a) or (c): the tray element identity or the native ingest path. Reproduce at that level (add a second test rendering the composer with a single ingest, or write an e2e that adds one file via the file input and asserts one tray item appears without a second add). Fix the identity/batching issue (e.g. `flushSync` on the native path, or stabilizing the `attachSlot` so the tray isn't remounted).

Document which branch occurred in the commit message.

- [ ] **Step 3: Implement the single root-cause fix (Phase 4)**

Apply ONE fix addressing the confirmed root cause. If it is the `PendingPreview` post-mount flash, the synchronous-URL initialization:

```tsx
function PendingPreview({ file }: { file: File }) {
  const isImage = file.type.startsWith("image/");
  const [url] = useState<string | null>(() =>
    isImage ? URL.createObjectURL(file) : null,
  );
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  if (isImage && url) {
    return <img src={url} alt={file.name} className="w-full h-full object-cover" />;
  }
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-xs">
      <span aria-hidden className="text-lg">📄</span>
      <span className="text-muted-foreground">{formatSize(file.size)}</span>
    </div>
  );
}
```

(Lazy `useState` initializer creates the URL during the first render, so the image is present on the very first commit — no dependence on a later render.)

- [ ] **Step 4: Verify the fix (Phase 4)**

```bash
nix-shell --run 'npx vitest run tests/unit/composer-attachment-tray.test.tsx && npm run typecheck'
```

Expected: the regression test passes; typecheck clean. If the root cause was in the container, the corresponding test/e2e passes instead.

- [ ] **Step 5: Commit**

```bash
git add src/components/composer-attachment-tray.tsx tests/unit/composer-attachment-tray.test.tsx
git commit -m "fix(composer): first attachment renders on first commit (root-caused tray race)"
```

(Adjust the staged files to match where the root cause actually lived.)

---

## Task 11: Full verification sweep, docs, device checklist, finish

**Files:**
- Modify: `CLAUDE.md` (status entry)
- Modify: `docs/testing/android-device-checklist.md`

- [ ] **Step 1: Full gate sweep**

```bash
nix-shell --run 'npm run typecheck && npm run check-tokens && npm run check-ui-purity && npm run check-platform-purity && npx vitest run && npm run parity'
```

Expected: all green; parity 142/142; vitest all pass (new suites: image-dimensions, attachment-grid, downloads-filename, composer-attachment-tray).

- [ ] **Step 2: E2e both projects, halved (per the long-run memory)**

Run in halves with `--workers=2` so subagent runs stay under budget. First half:

```bash
nix-shell --run 'npx playwright test tests/e2e --project=chromium --workers=2'
```

Then Firefox:

```bash
nix-shell --run 'npx playwright test tests/e2e --project=firefox --workers=2'
```

Expected: green (the round's new specs plus the existing suites; ui-scale unaffected by the viewport lock). Investigate any failure; do not proceed with reds.

- [ ] **Step 3: Update the Android device checklist**

Add to `docs/testing/android-device-checklist.md` a "Feedback round 5" section:

```markdown
## Feedback round 5 (2026-07-24)

- [ ] Night ladder: dark theme reads noticeably deeper than the previous
      nightly; chrome (headers, sidebar, composer) sits darker than the chat
      canvas; bubbles/cards read as raised. Light theme unchanged.
- [ ] Pinch-zoom and double-tap zoom do NOTHING anywhere in the app.
- [ ] Tapping the UI-scale pill changes size without the page visibly
      zooming/jumping.
- [ ] Lightbox download AND attachment-tile download land the file in the
      device Downloads folder (visible in the Files/Downloads app) with a
      "Saved to Downloads" toast — no save-location dialog.
- [ ] Adding a single photo to the composer shows it in the tray immediately
      (no need to add a second).
- [ ] Opening a conversation with image history lands at the bottom (not
      mid-history), even as images finish loading.
- [ ] Scrolling up while messages arrive shows the jump-to-latest button with
      a count; tapping it returns to the newest message.
- [ ] Editing a long message opens a multi-line box; Shift+Enter adds a line,
      Enter saves.
```

- [ ] **Step 4: Update CLAUDE.md status**

Add a status bullet under the UI-rework section of `CLAUDE.md`:

```markdown
- Feedback round 5 (2026-07-24) — implemented + merged (`--no-ff`). Dark ladder
  darkened one rung to "Night" (canvas `#1a1b26`; parity `ladderSkin` + manifest
  + theme-color follow-through); viewport zoom lock (no pinch/double-tap); optional
  `FileBlob.width/height` captured at upload feeding a dimension-aware image grid
  (cells clamped 3:4–4:3) and exact single-image placeholder reservation;
  ResizeObserver timeline re-anchoring (fixes open-mid-history) with a first-user-
  scroll latch; jump-to-latest button + auto-scroll demoted to near-bottom-only;
  multi-line message edit (Enter saves / Shift+Enter newline); Android download
  straight to public Downloads (no dialog, `$HOME/Download/**` capability); tray
  first-photo race fixed (synchronous preview URL). Spec:
  `docs/superpowers/specs/2026-07-24-feedback-round-5-design.md`.
```

- [ ] **Step 5: Commit docs**

```bash
git add CLAUDE.md docs/testing/android-device-checklist.md
git commit -m "docs: feedback round 5 status + Android device checklist"
```

- [ ] **Step 6: Merge to main (`--no-ff`)**

From the primary checkout (main lives there), merge this branch:

```bash
git -C /home/nox/Documents/Projects/Nox/arcan merge --no-ff worktree-feedback-round-5 -m "merge: feedback round 5 — Night ladder, chat scroll & attachments, zoom lock, Downloads saving"
```

Then verify main builds:

```bash
nix-shell --run 'npm run typecheck'
```

- [ ] **Step 7: Push main**

```bash
git -C /home/nox/Documents/Projects/Nox/arcan push origin main
```

- [ ] **Step 8: Cut a fresh nightly (user-authorized)**

The user asked for a new nightly after implementation. `nightly-*` tags never deploy prod and only publish a pre-release APK. `nightly-2026-07-24` already exists, so use a distinct tag — `nightly-2026-07-24b` (or the next day's date if the calendar has advanced). Cut it on the merged main tip:

```bash
git -C /home/nox/Documents/Projects/Nox/arcan tag nightly-2026-07-24b
git -C /home/nox/Documents/Projects/Nox/arcan push origin nightly-2026-07-24b
```

- [ ] **Step 9: Verify the nightly published correctly**

```bash
gh run list --workflow=android.yml --limit 3
# confirm NO deploy.yml run fired for the tag:
gh run list --workflow=deploy.yml --limit 3
# after the android run completes:
gh release list --limit 5
```

Expected: the android workflow runs and publishes `Nightly nightly-2026-07-24b` as a **pre-release**; deploy.yml did NOT trigger; the previous stable (`v0.1.7`) remains "Latest".

---

## Coverage

Spec §1 Night ladder → Task 1. §2 zoom lock → Task 2. §3 dimensions → Task 3. §4 aspect grid → Tasks 4–5. §5 open-at-bottom → Tasks 5 (reservation) + 6 (re-anchoring). §6 jump-to-latest + auto-scroll fix → Task 7. §7 multi-line edit → Task 8. §8 Downloads saving → Task 9. §9 tray bug → Task 10. Verification + nightly → Task 11.
