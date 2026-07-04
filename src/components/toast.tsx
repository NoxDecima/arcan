import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { KitToast } from "@/ui/kit";
import type { IconName } from "@/ui/kit";

export type ToastTone = "neutral" | "success" | "accent" | "error";

export interface ToastOptions {
  text: string;
  icon?: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

type ToastFn = (opts: ToastOptions) => void;

const ToastContext = createContext<ToastFn | null>(null);

// Default icon per tone — matches parity cell defaults (toast-tones).
const toneIcon: Record<ToastTone, IconName> = {
  neutral: "bell",
  success: "check",
  error:   "alert",
  accent:  "bell",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback((opts: ToastOptions) => {
    const id = ++counter.current;
    const durationMs = opts.durationMs ?? 2200;
    setItems((cur) => [...cur, { ...opts, id }]);
    setTimeout(() => {
      setItems((cur) => cur.filter((t) => t.id !== id));
    }, durationMs);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastViewport items={items} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ items }: { items: ToastItem[] }) {
  if (items.length === 0) return null;
  return (
    // Fixed container anchored to screen bottom; KitToast's absolute
    // left-3.5 right-3.5 bottom-[18px] resolves against each relative slot.
    // Rung 4 note: multiple stacked toasts each occupy a 64px relative slot
    // (same slot height used in the toast-tones parity cell). No prototype
    // counterpart for multi-toast stacking; behavior preserved, slots provide
    // visual separation without a legacy close button.
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      {items.map((t) => (
        <Toast key={t.id} item={t} />
      ))}
    </div>
  );
}

function Toast({ item }: { item: ToastItem }) {
  const tone = item.tone ?? "neutral";
  // Cast caller-supplied icon string to IconName; fall back to tone default.
  const icon = (item.icon as IconName | undefined) ?? toneIcon[tone];
  return (
    // relative slot: gives KitToast's absolute positioning a local context.
    // data-toast-tone preserved for test assertions and external selectors.
    <div
      data-toast-tone={tone}
      className="relative h-[64px]"
      style={{ pointerEvents: "auto" }}
    >
      <KitToast text={item.text} icon={icon} tone={tone} />
    </div>
  );
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
