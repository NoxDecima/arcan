// src/components/message-attachments.tsx — container-side attachment renderer.
// Extracted from message-bubble.tsx (Task 3, Unit 10 Wave B) so attachment
// content can be passed as attSlot into ChatScreen's ChatTimelineItem.msg.
// Preserves blob-URL resolution + lightbox behavior from the original.
//
// Multi-image layout (user report R1, 2026-07-20): a message with 2+ image
// attachments renders a tight cover-cropped grid that fills the bubble's
// attachment width exactly (WhatsApp/Signal style) — 2: side-by-side squares;
// 3: one wide 2:1 on top + two squares; 4: 2×2; 5+: 2×2 with a "+N" scrim on
// the last cell (N = count − 4 hidden). Tapping a cell opens the existing
// lightbox at that image. Messages with 0–1 images keep the original
// flex-wrap tile path untouched (round-4 single-image sizing preserved).
import { useEffect, useState } from "react";
import { co } from "jazz-tools";
import {
  AttachmentTile,
  isImageAttachment,
  useAttachmentImageUrl,
} from "@/components/attachment-tile";
import { ImageLightbox } from "@/components/image-lightbox";

interface MessageAttachmentsProps {
  message: any;
  isMine: boolean;
  me: any;
  /** Bubble attachment content width (bubbleWidth − 2·6px padding). The
   * multi-image grid is sized to exactly this, so no bubble background shows
   * around it. Single-image/file rendering ignores it. */
  gridWidth: number;
}

/** Grid template: cell class per index for the visible (≤4) cells. */
function gridCellClass(visibleCount: number, index: number): string {
  // 3 images: full-width 2:1 hero on top, two squares below — the only
  // count where equal squares can't tile 2 columns without a hole.
  if (visibleCount === 3 && index === 0) return "col-span-2 aspect-[2/1]";
  return "aspect-square";
}

function GridCell({
  attachment,
  loadAs,
  cellClass,
  overlayCount,
  onOpen,
}: {
  attachment: any;
  loadAs: any;
  cellClass: string;
  /** When set, renders the "+N" scrim (5+ images, last visible cell). */
  overlayCount?: number;
  onOpen: () => void;
}) {
  const url = useAttachmentImageUrl(attachment, loadAs);
  const filename = attachment?.filename ?? "image";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative block overflow-hidden bg-panel-2 ${cellClass}`}
      data-testid="attachment-grid-cell"
      aria-label={
        overlayCount != null
          ? `Open ${filename} (+${overlayCount} more)`
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
        // bg-black/N scrim — theme-agnostic overlay, sanctioned by check-tokens.
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

export function MessageAttachments({ message, isMine, me, gridWidth }: MessageAttachmentsProps) {
  const [lightbox, setLightbox] = useState<{ src: string; filename?: string } | null>(null);

  // Revoke the lightbox blob URL on unmount and whenever it changes.
  useEffect(() => {
    return () => {
      if (lightbox) URL.revokeObjectURL(lightbox.src);
    };
  }, [lightbox]);

  const attachments = Array.from((message as any).attachments ?? []);
  if (attachments.length === 0) return null;

  async function openLightbox(att: any) {
    const id = att?.data?.$jazz?.id;
    if (!id) return;
    const blob = await co.fileStream().loadAsBlob(id, { loadAs: me });
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setLightbox({ src: url, filename: att?.filename });
  }

  function closeLightbox() {
    setLightbox(null);
  }

  const images = attachments.filter((att: any) =>
    isImageAttachment(att?.mimeType ?? ""),
  );

  // Multi-image path: 2+ images → tight grid; non-image attachments (if any)
  // keep their file tiles in a row below the grid.
  if (images.length >= 2) {
    const files = attachments.filter(
      (att: any) => !isImageAttachment(att?.mimeType ?? ""),
    );
    const visible = images.slice(0, 4);
    const hidden = images.length - visible.length;
    return (
      <>
        <div
          className="flex flex-col gap-1"
          // maxWidth 100% lets the grid shrink with the bubble when the pane
          // is narrower than the nominal bubble width (same guard as the
          // round-4 single-image fix).
          style={{ width: gridWidth, maxWidth: "100%" }}
          data-testid="message-attachments"
        >
          <div
            data-testid="attachment-image-grid"
            // radius 8 = the bubble's inner attachment radius
            // (max(3, bubbleRadius 14 − pad 6), see kit/bubble.tsx).
            className="grid grid-cols-2 gap-[2px] rounded-[8px] overflow-hidden"
          >
            {visible.map((att: any, i: number) => (
              <GridCell
                key={(att as any)?.$jazz?.id ?? i}
                attachment={att}
                loadAs={me}
                cellClass={gridCellClass(visible.length, i)}
                overlayCount={
                  i === visible.length - 1 && hidden > 0 ? hidden : undefined
                }
                onOpen={() => void openLightbox(att)}
              />
            ))}
          </div>
          {files.length > 0 && (
            <div
              className={`flex flex-wrap gap-2 ${isMine ? "justify-end" : "justify-start"}`}
            >
              {files.map((att: any, i: number) => (
                <AttachmentTile
                  key={(att as any)?.$jazz?.id ?? i}
                  attachment={att}
                  mode="sent"
                  loadAs={me}
                />
              ))}
            </div>
          )}
        </div>
        {lightbox && (
          <ImageLightbox src={lightbox.src} filename={lightbox.filename} onClose={closeLightbox} />
        )}
      </>
    );
  }

  return (
    <>
      <div
        className={`mt-1 flex flex-wrap gap-2 ${isMine ? "justify-end" : "justify-start"}`}
        data-testid="message-attachments"
      >
        {attachments.map((att: any, i: number) => (
          <AttachmentTile
            key={(att as any)?.$jazz?.id ?? i}
            attachment={att}
            mode="sent"
            loadAs={me}
            onImageClick={() => void openLightbox(att)}
          />
        ))}
      </div>
      {lightbox && (
        <ImageLightbox src={lightbox.src} filename={lightbox.filename} onClose={closeLightbox} />
      )}
    </>
  );
}
