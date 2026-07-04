import { useState, useEffect } from "react";

const QUERY = "(min-width: 768px)";

/**
 * Returns true when the viewport width is ≥ 768px (Tailwind's `md` breakpoint).
 *
 * Initialises from matchMedia().matches so the first render uses the correct
 * branch; subscribes to `change` events for subsequent resizes.
 *
 * CRITICAL DESIGN CONSTRAINT — single <Outlet />:
 * AppShell renders exactly ONE <Outlet /> at any time. A CSS dual-mount of
 * both desktop and mobile branches in the DOM simultaneously would mount every
 * route twice — doubling Jazz subscriptions and effects such as mark-as-read.
 * This hook switches branches in JS instead: crossing the md breakpoint
 * unmounts the current branch and remounts the other, which is a one-time
 * cost accepted in exchange for correct single-subscription semantics.
 * See: src/components/app-shell.tsx
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(QUERY);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isDesktop;
}
