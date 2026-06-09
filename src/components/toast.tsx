import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

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
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "var(--sp-4)",
        right: "var(--sp-4)",
        bottom: "var(--sp-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-2)",
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
  return (
    <div
      data-toast-tone={tone}
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        gap: "var(--sp-3)",
        padding: "11px 14px",
        borderRadius: "var(--r-3)",
        background: "var(--color-panel)",
        border: "1px solid var(--color-border)",
        color: "var(--color-text)",
        font: `500 12px/1.3 var(--font-body)`,
        boxShadow: "var(--shadow-2)",
        animation: "arcan-toast-in 250ms var(--ease-out) both",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: toneBg(tone),
          color: toneFg(tone),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 13,
        }}
      >
        ●
      </span>
      <span>{item.text}</span>
    </div>
  );
}

function toneBg(t: ToastTone): string {
  switch (t) {
    case "success": return "rgba(158, 206, 106, 0.18)";
    case "accent":  return "var(--color-accent-soft)";
    case "error":   return "rgba(247, 118, 142, 0.18)";
    default:        return "rgba(138, 147, 178, 0.18)";
  }
}
function toneFg(t: ToastTone): string {
  switch (t) {
    case "success": return "var(--color-green)";
    case "accent":  return "var(--color-accent)";
    case "error":   return "var(--color-red)";
    default:        return "var(--color-text-2)";
  }
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
