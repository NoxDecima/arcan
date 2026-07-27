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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function PendingPreview({ file }: { file: File }) {
  const isImage = file.type.startsWith("image/");
  // Object URL created during the first render (lazy useState initializer) so
  // the <img> is present on the first commit — no dependence on a later render.
  const [url] = useState<string | null>(() =>
    isImage ? URL.createObjectURL(file) : null,
  );
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  if (isImage && url) {
    return (
      <img
        src={url}
        alt={file.name}
        loading="eager"
        className="w-full h-full object-cover"
      />
    );
  }
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-xs">
      <span aria-hidden className="text-lg">📄</span>
      <span className="text-muted-foreground">{formatSize(file.size)}</span>
    </div>
  );
}

export function ComposerAttachmentTray({
  pending,
  onRemove,
}: ComposerAttachmentTrayProps) {
  if (pending.length === 0) return null;

  return (
    <div
      className="flex gap-2 px-3 py-2 border-t border-border overflow-x-auto"
      data-testid="composer-attachment-tray"
    >
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
