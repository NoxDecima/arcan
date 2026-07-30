# Markdown Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render markdown (GitHub-flavored, sanitized) in sent message bubbles — headings, bold/italic/strikethrough, bullet+numbered lists, display-only task checkboxes, links, inline+fenced code, blockquotes — while the composer stays plain text.

**Architecture:** A new `MessageMarkdown` container component (`react-markdown` + `remark-gfm` + `remark-breaks` + `rehype-sanitize`, no `dangerouslySetInnerHTML`) renders the body; it reaches the pure kit bubble through a new optional `richBody` slot that replaces only the text span (timestamp is outside the bubble, so it's preserved). Editing still uses the raw-markdown textarea (`bodyOverride`). Parity stays 142/142 (slot defaults to `undefined`).

**Tech Stack:** React 19, TypeScript strict, Tailwind v3, `react-markdown` v9, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-30-markdown-messages-design.md`

**Branch:** `worktree-camera-markdown` (already checked out; camera is a later round on the same branch or a new one). All commands via `nix-shell --run '<cmd>'`.

---

## Task 1: Add markdown dependencies

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

```bash
nix-shell --run 'npm install react-markdown remark-gfm remark-breaks rehype-sanitize'
```

- [ ] **Step 2: Verify install + typecheck**

```bash
nix-shell --run 'npm run typecheck'
```

Expected: clean. Note the installed `react-markdown` major version (expected 9.x) — its `components` prop signature and `rehype-sanitize` export (`defaultSchema`) are used below; verify against the installed version's types.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add react-markdown + remark-gfm + remark-breaks + rehype-sanitize"
```

---

## Task 2: `richBody` slot in the kit bubble (pure, parity-safe)

Add an optional `richBody` ReactNode slot to the bubble that replaces the plain text span. Container-built node passed through; kit imports nothing new.

**Files:**
- Modify: `src/ui/kit/bubble.tsx`
- Modify: `src/ui/screens/chat-types.ts` (the `ChatTimelineItem` msg variant)
- Modify: `src/ui/screens/chat-screen.tsx` (forward the slot to `MessageRow`)

- [ ] **Step 1: Bubble slot**

In `src/ui/kit/bubble.tsx`, add `richBody?: ReactNode` to the `Bubble` props (beside `bodyOverride`), with a doc comment:

```tsx
  /** Markdown-rendered body (feedback round 11). Replaces the plain text span
   * when no bodyOverride (edit) is active; the timestamp caption lives in
   * MessageRow, so it's preserved. Parity unaffected (default undefined). */
  richBody?: ReactNode;
```

Change the body render (currently `{bodyOverride ?? (<span>…{m.text}</span>)}`) to prioritize edit > markdown > plain:

```tsx
      {bodyOverride ??
        richBody ?? (
          <span
            className="block font-body text-ui-bubble"
            {...(bodyTestId ? { "data-testid": bodyTestId } : {})}
          >
            {m.text}
          </span>
        )}
```

Add `richBody` to `MessageRow` props (beside `bodyOverride`) and forward it to `<Bubble ... richBody={richBody} />`. Mirror the doc comment.

- [ ] **Step 2: Thread through the presenter**

In `src/ui/screens/chat-types.ts`, add `richBody?: ReactNode;` to the `ChatTimelineItem` `msg` variant (beside `bodyOverride`/`attSlot`). Import `ReactNode` if not already.

In `src/ui/screens/chat-screen.tsx`, the `case "msg"` renders `<MessageRow ... bodyOverride={item.bodyOverride} ... />`. Add `richBody={item.richBody}`.

- [ ] **Step 3: Verify (no behavior change yet)**

```bash
nix-shell --run 'npm run typecheck && npm run check-ui-purity && npm run parity'
```

Expected: clean; parity 142/142 (slot unused by galleries; `src/ui` still pure — `richBody` is a ReactNode prop, no new imports).

- [ ] **Step 4: Commit**

```bash
git add src/ui/kit/bubble.tsx src/ui/screens/chat-types.ts src/ui/screens/chat-screen.tsx
git commit -m "feat(kit): richBody bubble slot for markdown-rendered message bodies"
```

---

## Task 3: `MessageMarkdown` component (TDD — rendering + security)

The core. Renders sanitized GFM markdown with token styling. REQUIRED: `superpowers:test-driven-development`.

**Files:**
- Create: `src/components/message-markdown.tsx`
- Test: `tests/unit/components/message-markdown.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/message-markdown.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageMarkdown } from "@/components/message-markdown";

function md(source: string) {
  return render(<MessageMarkdown source={source} mine={false} />);
}

describe("MessageMarkdown rendering", () => {
  it("renders a heading, bold, and a list", () => {
    md("# Title\n\n**bold** text\n\n- one\n- two");
    expect(screen.getByText("Title").tagName).toMatch(/^H[1-6]$/);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders a display-only task list with disabled checkboxes", () => {
    md("- [ ] todo\n- [x] done");
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes[0].disabled).toBe(true);
    expect(boxes[1].checked).toBe(true);
  });

  it("renders inline code and fenced code", () => {
    md("`inline`\n\n```\nblock\n```");
    expect(screen.getByText("inline").tagName).toBe("CODE");
    expect(screen.getByText("block").closest("pre")).toBeTruthy();
  });

  it("renders a safe link with target+rel", () => {
    md("[site](https://example.com)");
    const a = screen.getByRole("link") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("https://example.com/");
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(a.getAttribute("target")).toBe("_blank");
  });

  it("renders plain text as a paragraph unchanged", () => {
    md("just plain text");
    expect(screen.getByText("just plain text").tagName).toBe("P");
  });
});

describe("MessageMarkdown security", () => {
  it("does NOT execute or render raw <script>", () => {
    const { container } = md("hi <script>window.__x=1</script> there");
    expect(container.querySelector("script")).toBeNull();
    expect((window as any).__x).toBeUndefined();
  });

  it("drops javascript: link hrefs", () => {
    md("[x](javascript:alert(1))");
    const a = screen.queryByRole("link") as HTMLAnchorElement | null;
    // Either no anchor, or an anchor whose href is not a javascript: URL.
    if (a) expect(a.getAttribute("href") || "").not.toMatch(/^javascript:/i);
  });

  it("does not render an <img onerror> injection", () => {
    const { container } = md('![x](x" onerror="window.__y=1)');
    // img may render (alt text) but must carry no onerror handler.
    const img = container.querySelector("img");
    if (img) expect(img.getAttribute("onerror")).toBeNull();
    expect((window as any).__y).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

```bash
nix-shell --run 'npx vitest run tests/unit/components/message-markdown.test.tsx'
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `MessageMarkdown`**

Create `src/components/message-markdown.tsx`. Verify the exact `react-markdown` v9 API against the installed types as you go (the `components` override signatures and the `rehype-sanitize` `defaultSchema` shape). Requirements the implementation MUST satisfy:

- Uses `react-markdown` with `remarkPlugins={[remarkGfm, remarkBreaks]}` and `rehypePlugins={[[rehypeSanitize, schema]]}` where `schema` extends `defaultSchema` from `rehype-sanitize` (GitHub-aligned: allows `input[type,checked,disabled]` for task lists, restricts `a` href to safe protocols). No `rehype-raw`. No `dangerouslySetInnerHTML`.
- Wrap output in `<div className="font-body text-ui-bubble arcan-md">` so paragraphs inherit the bubble text style.
- `components` overrides map every rendered element to **token-only** classes (must pass `check-tokens` — no raw colors, no arbitrary font sizes):
  - `h1..h6` → `<h3>`-ish weight: `font-body font-semibold text-ui-bubble` (compact; chat context — do not use giant heading sizes). Slightly larger for h1/h2 is fine using existing text tokens (`text-ui-heading`), smaller ones `text-ui-bubble`.
  - `p` → `className="mb-1 last:mb-0"` (spacing only; inherits text).
  - `ul` → `list-disc ml-4 mb-1`, `ol` → `list-decimal ml-4 mb-1`, `li` → `mb-0.5`.
  - `strong`/`em`/`del` → default (`font-semibold` / italic / line-through via `strong`/`em`/`del` tags — add `line-through` class on `del`).
  - `a` → `className="text-arcan-accent underline"` plus `target="_blank" rel="noopener noreferrer nofollow"`.
  - inline `code` → `font-mono bg-panel-2 rounded px-1`; fenced `pre>code` → `<pre className="font-mono bg-panel-2 rounded p-2 overflow-x-auto text-ui-sub">`.
  - `blockquote` → `border-l-2 border-hairline pl-2 text-text-2`.
  - `input` (task checkbox) → `disabled` forced, `className="mr-1.5 align-middle"` (native disabled checkbox; display-only).
  - `hr` → `border-hairline my-1`.
- Props: `{ source: string; mine: boolean }`. `mine` reserved for any own-bubble contrast tweak (e.g. link color) — apply only if needed; otherwise unused is fine.

Example skeleton (adapt to the installed API):

```tsx
// src/components/message-markdown.tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { ComponentPropsWithoutRef } from "react";

// GitHub-aligned schema; defaultSchema already allows task-list inputs and
// restricts anchor protocols to http/https/mailto (drops javascript:/data:).
const schema = defaultSchema;

export function MessageMarkdown({ source, mine }: { source: string; mine: boolean }) {
  void mine;
  return (
    <div className="font-body text-ui-bubble arcan-md" data-testid="message-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          a: ({ node, ...p }: ComponentPropsWithoutRef<"a"> & { node?: unknown }) => (
            <a className="text-arcan-accent underline" target="_blank" rel="noopener noreferrer nofollow" {...p} />
          ),
          ul: ({ node, ...p }) => <ul className="list-disc ml-4 mb-1" {...p} />,
          ol: ({ node, ...p }) => <ol className="list-decimal ml-4 mb-1" {...p} />,
          li: ({ node, ...p }) => <li className="mb-0.5" {...p} />,
          p: ({ node, ...p }) => <p className="mb-1 last:mb-0" {...p} />,
          h1: ({ node, ...p }) => <h1 className="font-body font-semibold text-ui-heading mb-0.5" {...p} />,
          h2: ({ node, ...p }) => <h2 className="font-body font-semibold text-ui-heading mb-0.5" {...p} />,
          h3: ({ node, ...p }) => <h3 className="font-body font-semibold text-ui-bubble mb-0.5" {...p} />,
          h4: ({ node, ...p }) => <h4 className="font-body font-semibold text-ui-bubble mb-0.5" {...p} />,
          h5: ({ node, ...p }) => <h5 className="font-body font-semibold text-ui-bubble mb-0.5" {...p} />,
          h6: ({ node, ...p }) => <h6 className="font-body font-semibold text-ui-bubble mb-0.5" {...p} />,
          del: ({ node, ...p }) => <del className="line-through" {...p} />,
          blockquote: ({ node, ...p }) => <blockquote className="border-l-2 border-hairline pl-2 text-text-2" {...p} />,
          code: ({ node, className, ...p }: ComponentPropsWithoutRef<"code"> & { node?: unknown }) => {
            const fenced = /language-/.test(className || "");
            return fenced ? (
              <code className={`font-mono ${className ?? ""}`} {...p} />
            ) : (
              <code className="font-mono bg-panel-2 rounded px-1" {...p} />
            );
          },
          pre: ({ node, ...p }) => (
            <pre className="font-mono bg-panel-2 rounded p-2 overflow-x-auto text-ui-sub" {...p} />
          ),
          input: ({ node, ...p }: ComponentPropsWithoutRef<"input"> & { node?: unknown }) => (
            <input {...p} disabled className="mr-1.5 align-middle" />
          ),
          hr: ({ node, ...p }) => <hr className="border-hairline my-1" {...p} />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
```

If the installed `react-markdown` version's `components` typing rejects the `node` destructure or the `code` `inline` flag differs, adapt to the real types — the REQUIREMENTS (sanitized, token-styled, target+rel links, disabled checkboxes) are what matter, not this exact skeleton.

- [ ] **Step 4: Run tests — green**

```bash
nix-shell --run 'npx vitest run tests/unit/components/message-markdown.test.tsx'
```

Expected: all pass (rendering + security). If a security case fails (e.g. a `javascript:` href survives), harden the schema / `urlTransform` until inert — do NOT relax the assertion.

- [ ] **Step 5: Gates + commit**

```bash
nix-shell --run 'npm run typecheck && npm run check-tokens && npm run check-ui-purity'
git add src/components/message-markdown.tsx tests/unit/components/message-markdown.test.tsx
git commit -m "feat(messages): sanitized GFM MessageMarkdown renderer (TDD, security-tested)"
```

Note: `check-ui-purity` covers `src/ui` only — `MessageMarkdown` lives in `src/components` and may import the markdown libs freely. If `check-tokens` flags any class, replace it with a token/standard utility (no raw colors, no arbitrary font sizes).

---

## Task 4: Wire markdown into the conversation

Build `richBody` for normal messages and pass it through. Keep plain `text` as the fallback and for edit/deleted paths.

**Files:**
- Modify: `src/routes/conversations/detail.tsx`

- [ ] **Step 1: Build `richBody` for normal messages**

In `detail.tsx`, import the component:

```tsx
import { MessageMarkdown } from "@/components/message-markdown";
```

Find the message item construction (~line 1387, where `text: message?.body ?? ""` and `bodyOverride` are set). For a message that is NOT deleted, NOT malformed, and NOT currently editing, build:

```tsx
      const bodyText = message?.body ?? "";
      const richBody =
        !isDeleted && !malformed && !isEditing && bodyText
          ? <MessageMarkdown source={bodyText} mine={isMine} />
          : undefined;
```

Add `richBody` to the item object passed to the timeline (beside `text`, `attSlot`, `bodyOverride`):

```tsx
        text: bodyText,
        richBody,
        ...
```

(Keep `text` — it's the accessible fallback and is what `bodyOverride`/edit and non-markdown paths use. When editing, `richBody` is undefined so the textarea `bodyOverride` shows.)

- [ ] **Step 2: Verify menu + typecheck**

```bash
nix-shell --run 'npm run typecheck && npm run check-tokens && npm run check-ui-purity && npm run parity'
```

Expected: all clean; parity 142/142. Manually reason: the long-press/right-click `onContext` handler is on the row wrapper (outside the body), so markdown content inside doesn't block it; text selection still works. (Device-checklist verifies long-press on a markdown message still opens the menu.)

- [ ] **Step 3: Commit**

```bash
git add src/routes/conversations/detail.tsx
git commit -m "feat(chat): render sent message bodies as markdown"
```

---

## Task 5: E2e — markdown renders end-to-end

**Files:**
- Create: `tests/e2e/message-markdown.spec.ts`

- [ ] **Step 1: Write the e2e**

Mirror the single-account send flow used by existing specs (read `tests/e2e/messaging-1to1.spec.ts` for the real `createAccount`/`establishContact`/`openDirectChat` + composer send helpers/testids). Send a markdown message and assert the rendered bubble:

```ts
import { test, expect } from "@playwright/test";
// Reuse the two-account harness from tests/e2e/messaging-1to1.spec.ts.

test("a sent markdown message renders formatted", async ({ browser }) => {
  // ...harness setup: Alice + Bob paired, conversation open on Alice...
  const composer = /* the composer input locator from the existing specs */;
  await composer.fill("# Head\n\n- one\n- [ ] todo\n\n**bold** and `code`");
  await /* the send action */;
  const md = page.getByTestId("message-markdown").last();
  await expect(md.locator("h1")).toHaveText("Head");
  await expect(md.locator("li")).toHaveCount(2);
  await expect(md.locator('input[type="checkbox"]')).toHaveCount(1);
  await expect(md.locator("strong")).toHaveText("bold");
  await expect(md.locator("code")).toHaveText("code");
});
```

Fill the harness/composer specifics from the existing spec (do not invent testids). Use `--project=chromium`.

- [ ] **Step 2: Run**

```bash
nix-shell --run 'npx playwright test tests/e2e/message-markdown.spec.ts --project=chromium --workers=2'
```

Expected: pass. Stabilize with explicit waits on the message appearing; no arbitrary sleeps.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/message-markdown.spec.ts
git commit -m "test(e2e): sent markdown message renders formatted"
```

---

## Task 6: Full sweep, docs, merge, nightly

**Files:** `CLAUDE.md`, `docs/testing/android-device-checklist.md`

- [ ] **Step 1: Full gate sweep**

```bash
nix-shell --run 'npm run typecheck && npm run check-tokens && npm run check-ui-purity && npm run check-platform-purity && npx vitest run && npm run parity'
```

Expected: all green; new markdown unit suite passes; parity 142/142.

- [ ] **Step 2: E2e both projects, halved**

```bash
nix-shell --run 'npx playwright test tests/e2e --project=chromium --shard=1/2 --workers=2'
nix-shell --run 'npx playwright test tests/e2e --project=chromium --shard=2/2 --workers=2'
```

Then firefox (both shards). Per the `reference_firefox_e2e_wasm_flake` memory, firefox account-creation mass-failures are environmental — chromium is authoritative; re-run any round-11 firefox specs in isolation with `--workers=1 --retries=2` to confirm.

- [ ] **Step 3: Docs**

`CLAUDE.md`: add a status bullet under the UI-rework section — markdown messages (GFM subset, sanitized via rehype-sanitize, display-only task lists, `richBody` kit slot, `MessageMarkdown` in src/components; raw-markdown authoring). Spec path.

`docs/testing/android-device-checklist.md`: add a "Markdown messages" line — send `# H`, bullets, `- [ ] todo`, `**bold**`, a link, `code`; confirm they render formatted, links open in the browser, long-press still opens the message menu, editing shows the raw markdown.

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md docs/testing/android-device-checklist.md
git commit -m "docs: markdown messages status + device checklist"
```

- [ ] **Step 5: Merge to main (`--no-ff`) + push**

```bash
git -C /home/nox/Documents/Projects/Nox/arcan merge --no-ff worktree-camera-markdown -m "merge: markdown-formatted messages (GFM subset, sanitized)"
nix-shell --run 'npm run typecheck'
git -C /home/nox/Documents/Projects/Nox/arcan push origin main
```

- [ ] **Step 6: Nightly (user-authorized channel; never deploys prod)**

Cut a fresh `nightly-YYYY-MM-DD` on the merged main tip; confirm the android workflow publishes a PRE-release, deploy.yml does NOT fire, and the last stable stays "Latest".

---

## Coverage

Spec §deps → Task 1; §richBody slot → Task 2; §MessageMarkdown + security → Task 3; §wiring/backward-compat → Task 4; §e2e → Task 5; verification + nightly → Task 6. Camera is a separate round (spec `2026-07-30-camera-capture-design.md`).
