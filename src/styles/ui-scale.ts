/**
 * Per-device UI scale (appearance iteration, spec 2026-07-23).
 *
 * Four steps applied as CSS `zoom` on <html> — the Task-1 probe confirmed the
 * message-menu body portal must scale with the content (a #root-scoped zoom
 * leaves document.body portals unscaled), and `zoom` (Chromium incl. Android
 * WebView; Firefox ≥126) scales the codebase's px-exact arbitrary values
 * uniformly where rem-scaling would not.
 *
 * Storage is PER-DEVICE (localStorage, not me.root.settings.appearance):
 * phone and desktop want different scales. The Android Tauri shell defaults
 * to 115%; web/desktop default 100%.
 *
 * Platform-free on purpose: callers pass `androidShell` (from
 * @/platform/is-tauri) so this module stays unit-testable without mocks and
 * importable anywhere.
 */

export const UI_SCALE_STEPS = [90, 100, 115, 130] as const;
export type UiScaleStep = (typeof UI_SCALE_STEPS)[number];
export const UI_SCALE_KEY = "arcan-ui-scale";

export function defaultUiScale(androidShell: boolean): UiScaleStep {
  return androidShell ? 115 : 100;
}

/** Parse a stored raw value; anything off the four-step scale → platform default. */
export function normalizeUiScale(
  raw: string | null,
  androidShell: boolean,
): UiScaleStep {
  const n = raw === null || raw === "" ? NaN : Number(raw);
  return (UI_SCALE_STEPS as readonly number[]).includes(n)
    ? (n as UiScaleStep)
    : defaultUiScale(androidShell);
}

export function readStoredUiScale(androidShell: boolean): UiScaleStep {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(UI_SCALE_KEY);
  } catch {
    // Storage unavailable (private mode edge cases) — fall through to default.
  }
  return normalizeUiScale(raw, androidShell);
}

export function applyUiScale(scale: UiScaleStep): void {
  // 100% clears the property entirely — a held `zoom: 1` is inert but would
  // make "is scaling active" checks ambiguous.
  const root = document.documentElement;
  root.style.zoom = scale === 100 ? "" : String(scale / 100);
  // Counter-scale token consumed by the full-viewport shells (`h-app`/`w-app`):
  // under CSS `zoom: Z`, `100vh` renders at viewport×Z, so shells sized
  // `calc(100vh / var(--ui-zoom))` render at exactly the physical viewport at
  // any scale (fixes the round-5 over/underflow — feedback round 6).
  root.style.setProperty("--ui-zoom", String(scale / 100));
}

/** Boot path: read (or default) and apply. Called before createRoot in main.tsx. */
export function applyStoredUiScale(androidShell: boolean): void {
  applyUiScale(readStoredUiScale(androidShell));
}

/** Settings path: persist and apply immediately. */
export function setUiScale(scale: UiScaleStep): void {
  try {
    window.localStorage.setItem(UI_SCALE_KEY, String(scale));
  } catch {
    // Persisting failed — still apply for this session.
  }
  applyUiScale(scale);
}

/**
 * Effective zoom factor for fixed-portal coordinate math (Task-1 probe:
 * getBoundingClientRect returns UNzoomed-viewport px while fixed left/top
 * inside the zoomed root are multiplied by zoom at render — divide final
 * coords by this). Parses the value WE set rather than Element.currentCSSZoom
 * (Chromium ≥128 only; Firefox lacks it).
 */
export function getUiZoom(): number {
  const n = Number(document.documentElement.style.zoom);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
