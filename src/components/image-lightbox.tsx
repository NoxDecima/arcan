import { useRef } from "react";
import { createPortal } from "react-dom";
import { useModalA11y } from "@/components/modal-shell";
import { Icon, tapClass } from "@/ui/kit";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
  /** intent-fix (feedback round 2): when provided, renders a download button
   * top-left. Optional so the avatar lightbox call site is unaffected. */
  filename?: string;
}

export function ImageLightbox({ src, alt, onClose, filename }: ImageLightboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useModalA11y({
    open: true,
    onClose,
    dismissOnEscape: true,
    containerRef,
    restoreRef,
  });

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      data-testid="image-lightbox"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 animate-arcan-fade-in"
    >
      <a
        href={src}
        download={filename || "image"}
        onClick={(e) => e.stopPropagation()}
        aria-label="download image"
        data-testid="image-lightbox-download"
        className={`${tapClass} absolute top-4 left-4 text-text-2 bg-black/40 rounded-r-3 w-10 h-10 justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft`}
      >
        {/* intent-fix (feedback round 2): "share" is the closest available
            glyph — a dedicated download icon is out of scope. */}
        <Icon d="share" size={18} />
      </a>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image"
        data-testid="image-lightbox-close"
        className={`${tapClass} absolute top-4 right-4 text-text-2 bg-black/40 rounded-r-3 w-10 h-10 justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft`}
      >
        <Icon d="close" size={18} />
      </button>
      <img
        src={src}
        alt={alt ?? ""}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[95vw] max-h-[95vh] object-contain"
      />
    </div>,
    document.body,
  );
}
