# Markdown-formatted messages — design

Date: 2026-07-30
Status: approved (brainstorm — decisions locked via AskUserQuestion)

## Problem

Messages render as plain text. The user wants to write markdown (headings,
bullet + numbered lists, task lists, bold/italic, links, code, quotes) and have
it render formatted in the **sent** bubble.

## Decisions (brainstorm)

- **Authoring: type raw markdown.** The composer stays a plain textbox; the user
  types `# Heading`, `- item`, `- [ ] todo`, `**bold**`. No formatting toolbar.
- **Task lists: display-only for v1.** `- [ ]` / `- [x]` render as checkbox
  glyphs but are NOT tappable (no message mutation). Editing the message changes
  them.
- **Scope: GitHub-flavored common set** — headings, bold/italic/strikethrough,
  bullet + numbered lists, task lists, links, inline code + fenced code blocks,
  blockquotes. **Sanitized** (no raw HTML).

## Architecture

The message body renders in the **kit** bubble (`src/ui/kit/bubble.tsx`, pure +
mapping-table-bound), which today renders `{m.text}` in a span. To keep the kit
pure (no markdown lib in `src/ui/`) and parity unaffected, markdown rendering
lives in a **container** component and is passed into the bubble via a new
optional slot that replaces ONLY the text span (the timestamp caption is kept).

### New kit slot

`bubble.tsx` `MessageRow`/`Bubble` gain `richBody?: ReactNode`. When provided it
renders in place of the `{m.text}` span; the time caption row is unchanged.
Parity cells never pass it (default `undefined`) → galleries unaffected, 142/142
holds. (Distinct from the existing `bodyOverride`, which replaces body+time and
is used by the inline edit textarea.)

### New container component

`src/components/message-markdown.tsx` → `<MessageMarkdown source={string}
mine={boolean} />`:

- **Renderer: `react-markdown`** (no `dangerouslySetInnerHTML`) with
  **`remark-gfm`** (task lists, strikethrough, autolinks, tables→omitted via
  schema) and **`remark-breaks`** (single newline → `<br>`, matching chat
  expectations). **`rehype-sanitize`** with a strict allow-list schema:
  - Allowed elements: p, br, h1–h6, strong, em, del, ul, ol, li, input
    (type=checkbox, disabled — for task items), a, code, pre, blockquote, hr.
  - Allowed `a` attributes: href only; **URL schemes limited to http/https/
    mailto** (drop `javascript:`, `data:`); force `target="_blank"
    rel="noopener noreferrer nofollow"` via a rehype step.
  - Strip everything else (no raw HTML, no img/script/style/iframe/on* attrs,
    no class/style from source).
- **Token styling** (component mapping, all Arcan tokens — no raw colors, passes
  check-tokens): headings → `font-body font-semibold` sized down (chat context,
  h1≈text-ui-heading); lists → proper indent + markers; task checkboxes → a
  styled disabled checkbox; `code`/`pre` → `font-mono bg-panel-2 rounded`;
  blockquote → left `border-hairline` + `text-text-2`; links →
  `text-arcan-accent underline`. Own-bubble vs theirs: inherit `text-text`
  (links may need a mine variant if contrast is poor — spot-check).
- Reuses the app's existing prose scale; compact spacing suited to bubbles.

### Wiring (container)

`detail.tsx`: for a normal (non-deleted, non-editing) message, build
`richBody = <MessageMarkdown source={message.body} mine={isMine} />` and pass it
to the row alongside the existing plain `text` (kept as the accessible/desktop
fallback + for the parity/edit paths). Editing still uses `bodyOverride` (the
textarea) seeded with the **raw** `message.body`. Deleted/malformed keep their
plain shells.

### Backward compatibility

Plain-text messages are valid markdown → render unchanged (aside from
paragraph/линk autolinking). Existing messages need no migration. The context
menu (`onContext`, long-press/right-click) and text selection must still work
over the rendered body — the markdown node sits in the same bubble body region;
verify long-press still opens the menu.

## Security

Messages are E2EE user content rendered as rich text — sanitization is
**mandatory**. `rehype-sanitize` with the strict schema above prevents HTML/JS
injection; no `dangerouslySetInnerHTML` anywhere. URL scheme allow-list blocks
`javascript:`/`data:` links. A unit test asserts a malicious message
(`<img onerror>`, `[x](javascript:alert(1))`, raw `<script>`) renders inert.

## Testing

- Unit (`message-markdown.test.tsx`): renders headings/lists/bold/code/links/
  task-list/blockquote to the expected elements; **security** cases render inert
  (no script, `javascript:` href dropped, raw HTML escaped); plain text renders
  as plain paragraph; task checkboxes are `disabled`.
- Unit: bubble `richBody` slot replaces the text span but keeps the time.
- E2e (`message-markdown.spec.ts`): send `# Hi\n- a\n- [ ] todo\n**b**`; assert
  the sent bubble contains a heading element, list items, a checkbox, and strong
  text; assert a `javascript:` link is not rendered as a clickable nav.
- Gates: typecheck, check-tokens (markdown element classes are all tokens),
  check-ui-purity (markdown lib imported in `src/components/`, NOT `src/ui/`),
  parity 142/142 (kit `richBody` default undefined).

## Bundle note

`react-markdown` + `remark-gfm` + `rehype-sanitize` add ~100–150 KB gz to the
bundle. Acceptable for now; **lazy-loading** the markdown renderer (dynamic
import, render plain text until loaded) is a noted follow-up if initial-load
size becomes a concern.

## Out of scope

- Formatting toolbar; live preview in the composer.
- Interactive (tappable) task checkboxes — deferred; display-only for v1.
- Tables, images, HTML passthrough, footnotes, math.
- Markdown in system events, contact names, or group titles (messages only).

## Decisions log

- Raw-markdown authoring over toolbar/both.
- Display-only task checkboxes over interactive (v1).
- GFM common set (sanitized) over minimal.
- `react-markdown` + `rehype-sanitize` (no innerHTML) over `marked`+`dompurify`
  — safer for E2EE content; bundle cost accepted, lazy-load is a follow-up.
