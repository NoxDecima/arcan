import { useRef } from "react";
import { createPortal } from "react-dom";
import { useModalA11y } from "@/components/modal-shell";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
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
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image"
        data-testid="image-lightbox-close"
        className="absolute top-4 right-4 text-text-2 text-2xl bg-black/40 rounded-r-3 w-10 h-10 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
      >
        ×
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
