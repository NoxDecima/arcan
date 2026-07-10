// src/components/attachment-tile.tsx
import { useEffect, useState } from "react";
import { co } from "jazz-tools";

interface AttachmentTileProps {
  attachment: any;          // FileBlob (loaded)
  mode: "pending" | "sent";
  loadAs?: any;             // pass me; required to load the FileStream as a Blob
  onRemove?: () => void;    // only for "pending"
  onImageClick?: () => void; // only for "sent" + image mimeType; opens lightbox
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function AttachmentTile({
  attachment,
  mode,
  loadAs,
  onRemove,
  onImageClick,
}: AttachmentTileProps) {
  const mimeType = attachment?.mimeType ?? "";
  const filename = attachment?.filename ?? "file";
  const size = attachment?.size ?? 0;
  const streamID = attachment?.data?.$jazz?.id ?? null;

  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!streamID || !loadAs || !isImage(mimeType)) {
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
        // ignored
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [streamID, loadAs, mimeType]);

  // Image tile
  if (isImage(mimeType)) {
    if (mode === "pending") {
      return (
        <div
          className="relative w-20 h-20 rounded border border-hairline overflow-hidden bg-panel-2"
          data-testid="attachment-tile-pending-image"
        >
          {url ? (
            <img src={url} alt={filename} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-dim">
              …
            </div>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${filename}`}
              data-testid="attachment-tile-remove"
              className="absolute top-0 right-0 bg-black/60 text-white text-xs w-5 h-5 flex items-center justify-center rounded-bl"
            >
              ×
            </button>
          )}
        </div>
      );
    }
    // sent
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
            style={{ maxWidth: 280, maxHeight: 280 }}
          />
        ) : (
          <div className="w-48 h-32 flex items-center justify-center bg-panel-2 text-xs text-dim rounded">
            Loading image…
          </div>
        )}
      </button>
    );
  }

  // File tile
  if (mode === "pending") {
    return (
      <div
        className="flex items-center gap-2 px-2 py-1 border border-hairline rounded bg-panel-2/30 text-xs"
        data-testid="attachment-tile-pending-file"
      >
        <span aria-hidden>📄</span>
        <span className="truncate max-w-[140px]">{filename}</span>
        <span className="text-dim">{formatSize(size)}</span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${filename}`}
            data-testid="attachment-tile-remove"
            className="text-dim hover:text-text"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  // sent file → download via a hidden <a>
  async function handleDownload() {
    if (!streamID || !loadAs) return;
    const blob = await co.fileStream().loadAsBlob(streamID, { loadAs });
    if (!blob) return;
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(dlUrl);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex items-center gap-2 px-3 py-2 rounded border border-hairline bg-panel-2/30 text-sm hover:bg-panel-2"
      data-testid="attachment-tile-sent-file"
      aria-label={`Download ${filename}`}
    >
      <span aria-hidden className="text-lg">📄</span>
      <span className="flex flex-col text-left">
        <span className="truncate max-w-[180px]">{filename}</span>
        <span className="text-xs text-dim">{formatSize(size)}</span>
      </span>
    </button>
  );
}
