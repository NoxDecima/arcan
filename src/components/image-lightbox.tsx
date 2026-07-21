import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalA11y } from "@/components/modal-shell";
import { useAttachmentImageUrl } from "@/components/attachment-tile";
import { Icon, tapClass } from "@/ui/kit";

interface ImageLightboxProps {
  /** Single-image mode: an already-resolved object URL (avatar call site). */
  src?: string;
  alt?: string;
  onClose: () => void;
  /** intent-fix (feedback round 2): when provided, renders a download button
   * top-left. Optional so the avatar lightbox call site is unaffected. */
  filename?: string;
  /** Nav mode (item #29, 2026-07-21): the opening message's image attachments
   * (FileBlob list). The lightbox resolves each image's blob URL itself (via
   * useAttachmentImageUrl) and navigates within the list: edge arrow buttons,
   * ArrowLeft/ArrowRight, and a basic touch swipe (40px threshold). No
   * wrap-around — prev/next disable at the ends. Nav chrome (arrows +
   * counter) is hidden for a single-image list. */
  images?: any[];
  startIndex?: number;
  /** Required with `images`: the account to load the FileStreams as. */
  loadAs?: any;
}

const SWIPE_THRESHOLD = 40;

export function ImageLightbox({
  src,
  alt,
  onClose,
  filename,
  images,
  startIndex,
  loadAs,
}: ImageLightboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const navMode = Boolean(images && images.length > 0 && loadAs);
  const count = navMode ? images!.length : 0;
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(startIndex ?? 0, 0), Math.max(count - 1, 0)),
  );
  const current = navMode ? images![index] : null;
  // Unconditional hook call; resolves to null in single-src mode.
  const navUrl = useAttachmentImageUrl(current, loadAs);

  const displaySrc = navMode ? navUrl : src;
  const displayName = navMode ? (current?.filename ?? "image") : filename;
  const displayAlt = navMode ? (current?.filename ?? "") : (alt ?? "");

  useModalA11y({
    open: true,
    onClose,
    dismissOnEscape: true,
    containerRef,
    restoreRef,
  });

  // ← / → navigate. Window-level like the modal's Escape handler, so it works
  // regardless of which element inside the dialog holds focus.
  useEffect(() => {
    if (!navMode || count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, count - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navMode, count]);

  // Basic swipe: pointer down→up horizontal delta past the threshold
  // navigates. The suppress flag eats the click that the browser fires right
  // after pointerup, so a swipe doesn't also close the lightbox; it is
  // cleared on a microtask-ish timeout in case the click never arrives
  // (e.g. down/up landed on different elements).
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      data-testid="image-lightbox"
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onClose();
      }}
      onPointerDown={(e) => {
        if (!e.isPrimary) return;
        // Don't treat drags that start on controls as swipes — a pointerup
        // there already means a button/anchor activation.
        if ((e.target as HTMLElement).closest("button, a")) return;
        swipeStart.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        if (!start || !e.isPrimary || !navMode || count < 2) return;
        const dx = e.clientX - start.x;
        if (Math.abs(dx) < SWIPE_THRESHOLD) return;
        if (dx < 0) setIndex((i) => Math.min(i + 1, count - 1));
        else setIndex((i) => Math.max(i - 1, 0));
        suppressClick.current = true;
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      }}
      // touch-none: without it mobile browsers may claim the horizontal drag
      // as a pan attempt and fire pointercancel before our pointerup. The
      // overlay has nothing to scroll or zoom, so this is safe.
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 touch-none animate-arcan-fade-in"
    >
      {displaySrc && (
        <a
          href={displaySrc}
          download={displayName || "image"}
          onClick={(e) => e.stopPropagation()}
          aria-label="download image"
          data-testid="image-lightbox-download"
          className={`${tapClass} absolute top-4 left-4 text-text-2 bg-black/40 rounded-r-3 w-10 h-10 justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft`}
        >
          {/* intent-fix (feedback round 2): "share" is the closest available
              glyph — a dedicated download icon is out of scope. */}
          <Icon d="share" size={18} />
        </a>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image"
        data-testid="image-lightbox-close"
        className={`${tapClass} absolute top-4 right-4 text-text-2 bg-black/40 rounded-r-3 w-10 h-10 justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft`}
      >
        <Icon d="close" size={18} />
      </button>
      {displaySrc ? (
        <img
          src={displaySrc}
          alt={displayAlt}
          onClick={(e) => e.stopPropagation()}
          // draggable false: the native image drag would swallow pointerup
          // (pointercancel instead), breaking the swipe gesture.
          draggable={false}
          className="max-w-[95vw] max-h-[95vh] object-contain"
        />
      ) : (
        // nav mode, blob still resolving
        <span className="font-mono text-ui-tab text-dim">…</span>
      )}
      {navMode && count > 1 && (
        <>
          {/* tapClass carries disabled:pointer-events-none — a click on a
              disabled arrow would fall through to the backdrop and close the
              lightbox. The wrapper spans eat those clicks (and the enabled
              ones, replacing per-button stopPropagation). */}
          <span
            className="absolute left-4 top-1/2 -translate-y-1/2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              disabled={index === 0}
              aria-label="Previous image"
              data-testid="lightbox-prev"
              className={`${tapClass} text-text-2 bg-black/40 rounded-r-3 w-10 h-10 justify-center disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft`}
            >
              <Icon d="back" size={18} />
            </button>
          </span>
          <span
            className="absolute right-4 top-1/2 -translate-y-1/2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(i + 1, count - 1))}
              disabled={index === count - 1}
              aria-label="Next image"
              data-testid="lightbox-next"
              className={`${tapClass} text-text-2 bg-black/40 rounded-r-3 w-10 h-10 justify-center disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft`}
            >
              <Icon d="chev" size={18} />
            </button>
          </span>
          <span
            data-testid="lightbox-counter"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-ui-tab text-dim bg-black/40 rounded-r-3 px-2.5 py-1.5"
          >
            {index + 1} / {count}
          </span>
        </>
      )}
    </div>,
    document.body,
  );
}
