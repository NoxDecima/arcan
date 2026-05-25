// src/components/avatar.tsx
import { useEffect, useState } from "react";
import { co } from "jazz-tools";

interface AvatarProps {
  /**
   * Loaded FileBlob (e.g. me.profile.avatar). When null/undefined the avatar
   * falls back to rendering the initials over a tinted background.
   */
  src?: any | null;
  /** 1-2 letter fallback when src is absent or still loading. */
  initials: string;
  /** "sm" = 32px (sidebar), "md" = 40px (members/contacts), "lg" = 96px (settings). */
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Optional aria-label override; defaults to "<initials> avatar". */
  ariaLabel?: string;
  /** When this account loads files, used by FileStream.loadAsBlob. Pass `me`. */
  loadAs?: any;
  "data-testid"?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-24 h-24 text-2xl",
};

export function Avatar({
  src,
  initials,
  size = "md",
  className,
  ariaLabel,
  loadAs,
  "data-testid": testId,
}: AvatarProps) {
  const [url, setUrl] = useState<string | null>(null);

  // Load the avatar's FileStream as a Blob → object URL. Re-runs whenever
  // the underlying FileStream ID changes (e.g. user uploads a new avatar).
  const streamID = src?.data?.$jazz?.id ?? null;

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
        // Silent — falls back to initials
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [streamID, loadAs]);

  const label = (initials || "?").slice(0, 2).toUpperCase();
  const sizeClasses = SIZE_CLASSES[size];

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? `${label} avatar`}
      data-testid={testId}
      className={`rounded-full bg-primary/10 flex items-center justify-center font-medium text-primary flex-shrink-0 overflow-hidden ${sizeClasses} ${className ?? ""}`}
    >
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span>{label}</span>
      )}
    </div>
  );
}
