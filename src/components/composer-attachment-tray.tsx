// src/components/composer-attachment-tray.tsx
import { useEffect, useState } from "react";

export interface PendingAttachment {
  tempId: string;
  file: File;
}

interface ComposerAttachmentTrayProps {
  pending: PendingAttachment[];
  onRemove: (tempId: string) => void;
}

// TEMP diagnostic for #79 (intermittent first-photo-not-showing on the Android
// WebView). Release Tauri builds don't forward console.* to logcat, so this
// paints the evidence ON-SCREEN: a per-tile badge (detected MIME type + image
// load/error state) and a tray count chip. Between "no tray", "n=X", and the
// badge state, a failing add localizes to ingest-state vs render vs decode.
// REMOVE before the next stable release (v0.1.8). Tracked as a follow-up.
const ATTACH_DEBUG = true;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function PendingPreview({ file }: { file: File }) {
  const isImage = file.type.startsWith("image/");
  // Create the object URL during the FIRST render (lazy useState initializer)
  // so the <img> is present on the first commit — no dependence on a later
  // render. A post-mount effect left the image hidden until an unrelated
  // re-render (e.g. adding a second attachment) flushed the pending URL.
  const [url] = useState<string | null>(() =>
    isImage ? URL.createObjectURL(file) : null,
  );
  const [imgState, setImgState] = useState<"pending" | "loaded" | "error">(
    "pending",
  );
  useEffect(() => {
    // feedback round 6/7 (#79): logcat trace (works only where console forwards)
    // — the on-screen badge below is the reliable evidence on release builds.
    console.log(
      "[composer] preview mount name=" +
        file.name +
        " type=" +
        (file.type || "(none)") +
        " isImage=" +
        isImage +
        " url=" +
        (url ? "yes" : "no"),
    );
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  // TEMP (#79): on-screen readout. `type` + one of: ✓ loaded / ✗ decode error /
  // … never loaded / "file" (not treated as an image → fell to the file tile).
  const debugBadge = ATTACH_DEBUG ? (
    <span
      data-testid="attach-debug-badge"
      className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs leading-tight px-1 truncate"
    >
      {(file.type || "no-type").replace("image/", "")}{" "}
      {isImage
        ? imgState === "loaded"
          ? "✓"
          : imgState === "error"
            ? "✗"
            : "…"
        : "file"}
    </span>
  ) : null;

  if (isImage && url) {
    // feedback round 6 (#79): the object URL is already synchronous (round 5),
    // but the Android WebView could still defer decoding the first blob until a
    // later relayout (e.g. adding a second attachment), leaving the first
    // preview blank. eager+sync forces the decode on the first paint.
    return (
      <>
        <img
          src={url}
          alt={file.name}
          loading="eager"
          decoding="sync"
          className="w-full h-full object-cover"
          onLoad={() => {
            setImgState("loaded");
            console.log("[composer] img LOADED " + file.name);
          }}
          onError={() => {
            setImgState("error");
            console.warn("[composer] img ERROR " + file.name);
          }}
        />
        {debugBadge}
      </>
    );
  }
  return (
    <>
      <div className="w-full h-full flex flex-col items-center justify-center text-xs">
        <span aria-hidden className="text-lg">📄</span>
        <span className="text-muted-foreground">{formatSize(file.size)}</span>
      </div>
      {debugBadge}
    </>
  );
}

export function ComposerAttachmentTray({
  pending,
  onRemove,
}: ComposerAttachmentTrayProps) {
  if (pending.length === 0) return null;

  return (
    <div
      className="relative flex gap-2 px-3 py-2 border-t border-border overflow-x-auto"
      data-testid="composer-attachment-tray"
    >
      {/* TEMP (#79): tray count — if a photo was added but no tile shows, this
          still reads n=1 (render bug); n>tiles means a tile failed to paint. */}
      {ATTACH_DEBUG && (
        <span
          data-testid="attach-debug-count"
          className="absolute top-0 left-0 bg-black/70 text-white text-xs px-1 rounded-br"
        >
          n={pending.length}
        </span>
      )}
      {pending.map((p) => (
        <div
          key={p.tempId}
          className="relative w-20 h-20 rounded border border-border overflow-hidden bg-muted"
          data-testid="composer-attachment-tray-item"
        >
          <PendingPreview file={p.file} />
          <button
            type="button"
            onClick={() => onRemove(p.tempId)}
            aria-label={`Remove ${p.file.name}`}
            data-testid="composer-attachment-tray-remove"
            className="absolute top-0 right-0 bg-black/60 text-white text-xs w-5 h-5 flex items-center justify-center rounded-bl"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
