// src/components/message-attachments.tsx — container-side attachment renderer.
// Extracted from message-bubble.tsx (Task 3, Unit 10 Wave B) so attachment
// content can be passed as attSlot into ChatScreen's ChatTimelineItem.msg.
// The lightbox (item #29) receives the message's full image list + the
// clicked index and navigates within it (arrows / arrow keys / swipe); blob
// URLs are resolved inside ImageLightbox via useAttachmentImageUrl.
//
// Multi-image layout (user report R1, 2026-07-20): a message with 2+ image
// attachments renders a tight cover-cropped grid that fills the bubble's
// attachment width exactly (WhatsApp/Signal style) — 2: side-by-side squares;
// 3: one wide 2:1 on top + two squares; 4: 2×2; 5+: 2×2 with a "+N" scrim on
// the last cell (N = count − 4 hidden). Clicking the "+N" scrim EXPANDS the
// grid to show ALL images (2-column rows; odd remainder gets a full-width 2:1
// cell). When expanded every cell opens the lightbox at its own image.
// Messages with 0–1 images keep the flex-wrap tile path; a LONE image
// additionally caps its wrapper at min(280, gridWidth) so the bubble hugs the
// image instead of showing a dead veil strip on desktop (item #28, 2026-07-21
// — see the comment on the wrapper). The round-4 img sizing itself
// (attachment-tile.tsx) is untouched.
import { useState } from "react";
import {
  AttachmentTile,
  isImageAttachment,
  useAttachmentImageUrl,
} from "@/components/attachment-tile";
import { imageAspect, gridUnitAspect, heroAspect } from "@/components/attachment-grid";
import { ImageLightbox } from "@/components/image-lightbox";

interface MessageAttachmentsProps {
  message: any;
  isMine: boolean;
  me: any;
  /** Bubble attachment content width (bubbleWidth − 2·6px padding). The
   * multi-image grid is sized to exactly this, so no bubble background shows
   * around it. A lone image caps its wrapper at min(280, gridWidth) so the
   * bubble hugs the image (item #28). File-only rendering ignores it. */
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

/** Cell class for the expanded grid (2-column layout, all images visible).
 * For an odd total, the last image gets a full-width 2:1 cell matching the
 * 3-image hero aesthetic. */
function expandedCellClass(totalCount: number, index: number): string {
  if (totalCount % 2 === 1 && index === totalCount - 1)
    return "col-span-2 aspect-[2/1]";
  return "aspect-square";
}

export function MessageAttachments({ message, isMine, me, gridWidth }: MessageAttachmentsProps) {
  // Lightbox (item #29): index into `images` to open at, or null when closed.
  // The lightbox resolves blob URLs itself and navigates within `images`.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Per-message expanded state: reset on unmount (fine per spec).
  const [expanded, setExpanded] = useState(false);

  const attachments = Array.from((message as any).attachments ?? []);
  if (attachments.length === 0) return null;

  const images = attachments.filter((att: any) =>
    isImageAttachment(att?.mimeType ?? ""),
  );

  const lightbox =
    lightboxIndex != null ? (
      <ImageLightbox
        images={images}
        startIndex={lightboxIndex}
        loadAs={me}
        onClose={() => setLightboxIndex(null)}
      />
    ) : null;

  // Multi-image path: 2+ images → tight grid; non-image attachments (if any)
  // keep their file tiles in a row below the grid.
  if (images.length >= 2) {
    const files = attachments.filter(
      (att: any) => !isImageAttachment(att?.mimeType ?? ""),
    );

    // Collapsed: show 4 cells with "+N" scrim on the last when 5+ images.
    // Expanded: show all images in 2-column rows.
    const hasHidden = images.length > 4;
    const visible = expanded ? images : images.slice(0, 4);
    const hidden = images.length - 4; // always the total hidden count for the scrim

    // Dimension-aware sizing: one clamped aspect shared by square-ish cells
    // (rows stay aligned); the full-width hero/odd cell gets ~2× that. If any
    // visible image lacks stored dims, unit is null → fall back to the fixed
    // aspect classes (legacy behavior, unchanged).
    const unit = gridUnitAspect(visible.map((att: any) => imageAspect(att)));
    const hero = unit == null ? null : heroAspect(unit);

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
            {visible.map((att: any, i: number) => {
              const isScrimCell =
                !expanded && hasHidden && i === visible.length - 1;
              const legacyClass = expanded
                ? expandedCellClass(images.length, i)
                : gridCellClass(visible.length, i);
              const spanFull = legacyClass.startsWith("col-span-2");
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
        {lightbox}
      </>
    );
  }

  // Lone image (no files): cap the wrapper at min(280, gridWidth) with
  // DEFINITE pixels so the shrink-to-fit bubble hugs the image (item #28).
  // The round-4 img cap min(280px, 100%) contains a percentage, and
  // percentage-bearing caps are discarded during intrinsic (max-content)
  // sizing — a large photo's natural width ballooned the bubble to full
  // width while the img laid out at ≤280px, leaving a dead veil strip on
  // desktop. The definite wrapper cap bounds the intrinsic contribution;
  // the img's own 100% belt (attachment-tile.tsx, round 4 — sacred) still
  // shrinks it at layout time when the real bubble content box is narrower
  // than gridWidth (mobile / border-box arithmetic), so no overflow.
  const loneImage = attachments.length === 1 && images.length === 1;

  return (
    <>
      <div
        className={`mt-1 flex flex-wrap gap-2 ${isMine ? "justify-end" : "justify-start"}`}
        style={loneImage ? { maxWidth: Math.min(280, gridWidth) } : undefined}
        data-testid="message-attachments"
      >
        {attachments.map((att: any, i: number) => (
          <AttachmentTile
            key={(att as any)?.$jazz?.id ?? i}
            attachment={att}
            mode="sent"
            loadAs={me}
            // ≤1 image in this path, so an image tile is always images[0].
            onImageClick={() => setLightboxIndex(0)}
          />
        ))}
      </div>
      {lightbox}
    </>
  );
}
