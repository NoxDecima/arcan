// src/components/conversation-avatar.tsx
import { useEffect, useState } from "react";
import { co } from "jazz-tools";

interface ConversationAvatarProps {
  /** The conversation's CoValue ID. Used as a deterministic hue seed. */
  conversationId: string;
  /** Sidebar label / title. Used to derive the monogram fallback. */
  title: string;
  /** Loaded FileBlob (`conversation.icon`) when the conversation has a custom icon. */
  icon?: any | null;
  /** Pixel size of the avatar (square). Defaults to 36. */
  size?: number;
  /** Optional className for additional styling (e.g. flex-shrink). */
  className?: string;
  /** When this account loads files, used by FileStream.loadAsBlob. Pass `me`. */
  loadAs?: any;
  "data-testid"?: string;
}

/**
 * Deterministic hue from a CoValue ID. Stable across reloads / devices so
 * two clients showing the same conversation share the same monogram color.
 */
export function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

/**
 * Derive 1–2 letter monogram initials from a conversation title.
 * Whitespace-separated words; first two non-empty initials uppercased.
 * Falls back to "?" when the title is empty or unrecognizable.
 */
export function initialsFromTitle(title: string): string {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).slice(0, 2);
  const letters = parts
    .map((w) => (w[0] ?? "").toUpperCase())
    .filter(Boolean)
    .join("");
  return letters || "?";
}

/**
 * ConversationAvatar: renders the conversation's FileBlob icon when set,
 * otherwise a deterministic monogram over an HSL background hue derived
 * from the conversation ID.
 *
 * The icon FileBlob's underlying FileStream is loaded imperatively (same
 * pattern as the Avatar primitive) — we read `icon.data.$jazz.id` and
 * call FileStream.loadAsBlob to materialize an object URL.
 */
export function ConversationAvatar({
  conversationId,
  title,
  icon,
  size = 36,
  className,
  loadAs,
  "data-testid": testId,
}: ConversationAvatarProps) {
  const [url, setUrl] = useState<string | null>(null);

  const streamID = icon?.data?.$jazz?.id ?? null;

  useEffect(() => {
    if (!streamID || !loadAs) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;

    void (async () => {
      try {
        const blob = await co.fileStream().loadAsBlob(streamID, { loadAs });
        if (cancelled || !blob) return;
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
      } catch {
        // Silent — falls back to monogram
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [streamID, loadAs]);

  const initials = initialsFromTitle(title);
  const hue = hueFromId(conversationId || "");

  return (
    <div
      role="img"
      aria-label={`${initials} conversation avatar`}
      data-testid={testId ?? "conversation-avatar"}
      className={`rounded-avatar flex items-center justify-center font-semibold text-text font-mono flex-shrink-0 overflow-hidden ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        backgroundColor: url ? undefined : `hsl(${hue}, 30%, 24%)`,
        fontSize: Math.round(size * 0.36),
      }}
    >
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
