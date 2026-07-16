import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { parentOf, type UpOptions } from "./parents";

/**
 * Returns a function that navigates to the current screen's structural
 * parent (see parents.ts).
 *
 * IMPORTANT: call it as `onBack={() => goUp()}` — never `onBack={goUp}`.
 * Passed directly as an event handler, the click event would be misread
 * as UpOptions.
 */
export function useUpNavigation(): (opts?: UpOptions) => void {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return useCallback(
    (opts?: UpOptions) => navigate(parentOf(pathname, opts)),
    [navigate, pathname],
  );
}
