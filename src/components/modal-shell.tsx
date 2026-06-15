import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Closes when the scrim is clicked. Default true. */
  dismissOnBackdrop?: boolean;
  /** Closes on Escape. Default true. */
  dismissOnEscape?: boolean;
  /** Adds a data-testid on the Card wrapper for e2e/unit tests. */
  dataTestId?: string;
  /** Extra classes for the Card. */
  className?: string;
  /** When true, render the cosmic-gradient backdrop instead of bg-black/60. */
  cosmic?: boolean;
}

/**
 * Canonical centered-Card modal. Backdrop scrim (bg-black/60 or cosmic
 * gradient) with a 200ms fade + a hairline-bordered Card with a header
 * (title + close-X), padded body, and optional action footer.
 *
 * Portals to document.body. Locks page scroll while open. Traps focus
 * inside the Card. Closes on Esc and (by default) on backdrop click.
 *
 * For mobile-first sheets, use <MobileBottomSheet> instead.
 */
export function ModalShell({
  open,
  onClose,
  title,
  children,
  footer,
  dismissOnBackdrop = true,
  dismissOnEscape = true,
  dataTestId,
  className,
  cosmic = false,
}: ModalShellProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Esc + scroll lock + focus management
  useModalA11y({ open, onClose, dismissOnEscape, containerRef: cardRef, restoreRef: previouslyFocused });

  if (!open) return null;

  return createPortal(
    <div
      data-testid="modal-shell-backdrop"
      onClick={() => { if (dismissOnBackdrop) onClose(); }}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        "animate-arcan-fade-in",
        cosmic ? "bg-[var(--color-bg-stage)]/85" : "bg-black/60",
      )}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={dataTestId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab(cardRef)}
        className={cn(
          "w-full max-w-[480px] rounded-r-3 border border-hairline bg-panel",
          "flex flex-col max-h-[90vh] overflow-hidden",
          "animate-arcan-modal-in",
          className,
        )}
      >
        <ModalHeader id={titleId} onClose={onClose}>{title}</ModalHeader>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">{children}</div>
        {footer}
      </div>
    </div>,
    document.body,
  );
}

interface MobileBottomSheetProps extends Omit<ModalShellProps, "className"> {
  className?: string;
}

/**
 * Bottom-anchored sheet variant. On mobile (<sm) the Card snaps to the
 * bottom of the viewport, slides up from below, and caps at 75vh. On sm+
 * it falls back to a centered Card identical to <ModalShell>.
 *
 * Use this when the calling context is mobile-first (contact picker,
 * group create, leave-with-promote, settings modals on phone).
 */
export function MobileBottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  dismissOnBackdrop = true,
  dismissOnEscape = true,
  dataTestId,
  className,
  cosmic = false,
}: MobileBottomSheetProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useModalA11y({ open, onClose, dismissOnEscape, containerRef: cardRef, restoreRef: previouslyFocused });

  if (!open) return null;

  return createPortal(
    <div
      data-testid="modal-shell-backdrop"
      onClick={() => { if (dismissOnBackdrop) onClose(); }}
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4",
        "animate-arcan-fade-in",
        cosmic ? "bg-[var(--color-bg-stage)]/85" : "bg-black/60",
      )}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={dataTestId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab(cardRef)}
        style={{
          borderTopLeftRadius: "var(--r-3)",
          borderTopRightRadius: "var(--r-3)",
        }}
        className={cn(
          "w-full sm:max-w-[480px]",
          "rounded-t-r-3 sm:rounded-r-3",
          "border-t border-x border-hairline sm:border",
          "bg-panel flex flex-col max-h-[75vh] sm:max-h-[90vh] overflow-hidden",
          "animate-arcan-sheet-in sm:animate-arcan-modal-in",
          className,
        )}
      >
        <ModalHeader id={titleId} onClose={onClose}>{title}</ModalHeader>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">{children}</div>
        {footer}
      </div>
    </div>,
    document.body,
  );
}

interface ModalHeaderProps {
  id: string;
  onClose: () => void;
  children: ReactNode;
}

function ModalHeader({ id, onClose, children }: ModalHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
      <h2 id={id} className="text-base font-semibold text-text">{children}</h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="rounded-r-3 p-1 text-text-2 hover:bg-panel-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </header>
  );
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <footer className={cn("flex justify-end gap-2 border-t border-hairline px-4 py-3", className)}>
      {children}
    </footer>
  );
}

// ---------- internals: a11y hook + focus trap ----------

interface UseModalA11yArgs {
  open: boolean;
  onClose: () => void;
  dismissOnEscape: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  restoreRef: React.MutableRefObject<HTMLElement | null>;
}

export function useModalA11y({ open, onClose, dismissOnEscape, containerRef, restoreRef }: UseModalA11yArgs) {
  // Scroll lock + Esc handler + initial focus + restore focus on unmount
  useEffect(() => {
    if (!open) return;

    restoreRef.current = (document.activeElement as HTMLElement) ?? null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the dialog on next paint.
    const id = window.requestAnimationFrame(() => {
      const target = firstFocusable(containerRef.current) ?? containerRef.current;
      target?.focus({ preventScroll: true });
    });

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && dismissOnEscape) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.({ preventScroll: true });
      restoreRef.current = null;
    };
  }, [open, onClose, dismissOnEscape, containerRef, restoreRef]);
}

function firstFocusable(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  const sel = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  const list = Array.from(root.querySelectorAll<HTMLElement>(sel));
  return list[0] ?? null;
}

function trapTab(containerRef: React.RefObject<HTMLElement | null>) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const root = containerRef.current;
    if (!root) return;
    const list = Array.from(
      root.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    );
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
}
