import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export const ACCENT_KEYS = ["tokyo", "violet", "teal", "lime", "amber", "rose"] as const;
export type Accent = (typeof ACCENT_KEYS)[number];

interface AccentContextValue {
  accent: Accent;
  setAccent: (a: Accent) => void;
}

const AccentContext = createContext<AccentContextValue | null>(null);

function readInitialAccent(): Accent {
  if (typeof document === "undefined") return "tokyo";
  const attr = document.documentElement.getAttribute("data-accent");
  return ACCENT_KEYS.includes(attr as Accent) ? (attr as Accent) : "tokyo";
}

export function AccentProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<Accent>(readInitialAccent);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
  }, [accent]);

  const setAccent = useCallback((a: Accent) => {
    if (!ACCENT_KEYS.includes(a)) {
      throw new Error(`unknown accent: ${a}`);
    }
    setAccentState(a);
  }, []);

  return <AccentContext.Provider value={{ accent, setAccent }}>{children}</AccentContext.Provider>;
}

export function useAccent(): AccentContextValue {
  const ctx = useContext(AccentContext);
  if (!ctx) {
    throw new Error("useAccent must be used inside <AccentProvider>");
  }
  return ctx;
}
