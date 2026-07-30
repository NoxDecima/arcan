import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

/**
 * Sanitized GitHub-flavored-markdown renderer for E2EE message bodies.
 *
 * Security posture:
 * - No `rehype-raw`, so raw HTML in the source is never parsed into elements
 *   (a literal `<script>` becomes inert text).
 * - `rehype-sanitize` with the GitHub-aligned `defaultSchema` strips any
 *   attributes/tags outside the allow-list (e.g. an injected `onerror`).
 * - react-markdown's default `urlTransform` plus the schema's `protocols`
 *   allow-list drop `javascript:` / `data:` hrefs.
 * - No `dangerouslySetInnerHTML` anywhere.
 *
 * `mine` is reserved for own-bubble link contrast tuning; currently unused.
 */

// Extend the GitHub-aligned default schema minimally: task-list checkboxes
// render with a `checked` attribute, which the default schema does not include.
// `disabled` + `type` are already allowed on `input` by the default schema, and
// we additionally force `disabled` in the `input` component override so the list
// is display-only regardless of source.
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    input: [...(defaultSchema.attributes?.input ?? []), "checked"],
  },
};

/**
 * Canonicalize an already-sanitized href. Only http/https URLs that parse
 * cleanly are normalized (this yields the browser-canonical form, e.g. a
 * trailing slash on a bare host). Anything else is passed through untouched —
 * we never re-derive or resurrect a URL the sanitizer chose to drop.
 */
function normalizeHref(href: string | undefined): string | undefined {
  if (!href) return href;
  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    // Not an absolute URL (relative/anchor/etc.) — leave as authored.
  }
  return href;
}

const components: Components = {
  a: ({ node: _node, href, ...props }) => (
    <a
      {...props}
      href={normalizeHref(href)}
      className="text-arcan-accent underline"
      target="_blank"
      rel="noopener noreferrer nofollow"
    />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul {...props} className="list-disc ml-4 mb-1" />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol {...props} className="list-decimal ml-4 mb-1" />
  ),
  li: ({ node: _node, ...props }) => <li {...props} className="mb-0.5" />,
  p: ({ node: _node, ...props }) => <p {...props} className="mb-1 last:mb-0" />,
  h1: ({ node: _node, ...props }) => (
    <h1 {...props} className="font-body font-semibold text-ui-heading mb-0.5" />
  ),
  h2: ({ node: _node, ...props }) => (
    <h2 {...props} className="font-body font-semibold text-ui-heading mb-0.5" />
  ),
  h3: ({ node: _node, ...props }) => (
    <h3 {...props} className="font-body font-semibold text-ui-bubble mb-0.5" />
  ),
  h4: ({ node: _node, ...props }) => (
    <h4 {...props} className="font-body font-semibold text-ui-bubble mb-0.5" />
  ),
  h5: ({ node: _node, ...props }) => (
    <h5 {...props} className="font-body font-semibold text-ui-bubble mb-0.5" />
  ),
  h6: ({ node: _node, ...props }) => (
    <h6 {...props} className="font-body font-semibold text-ui-bubble mb-0.5" />
  ),
  del: ({ node: _node, ...props }) => (
    <del {...props} className="line-through" />
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote
      {...props}
      className="border-l-2 border-hairline pl-2 text-text-2"
    />
  ),
  code: ({ node: _node, className, ...props }) => {
    const isFenced =
      typeof className === "string" && /\blanguage-/.test(className);
    // Fenced code: bare <code> so the styled <pre> wrapper owns the background
    // (avoids double-backgrounding). Inline code: style directly.
    if (isFenced) {
      return <code {...props} className="font-mono" />;
    }
    return (
      <code {...props} className="font-mono bg-panel-2 rounded px-1" />
    );
  },
  pre: ({ node: _node, ...props }) => (
    <pre
      {...props}
      className="font-mono bg-panel-2 rounded p-2 overflow-x-auto text-ui-sub"
    />
  ),
  input: ({ node: _node, ...props }) => (
    <input {...props} disabled className="mr-1.5 align-middle" />
  ),
  hr: ({ node: _node, ...props }) => (
    <hr {...props} className="border-hairline my-1" />
  ),
};

export function MessageMarkdown({
  source,
  mine,
}: {
  source: string;
  mine: boolean;
}) {
  void mine;
  return (
    <div
      className="font-body text-ui-bubble arcan-md"
      data-testid="message-markdown"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
