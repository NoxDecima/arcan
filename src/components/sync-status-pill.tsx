import { useEffect, useRef, useState } from "react";
import { useSyncConnectionStatus } from "jazz-tools/react";

/**
 * SyncStatusPill — the in-conversation "not syncing" indicator (feedback R4).
 *
 * Replaces the old full-width ConnectionBanner: a compact, horizontally
 * centered pill that floats over the top of the timeline (zero-height
 * wrapper rendered between the chat header and the scrolling timeline, so
 * it stays visible at any scroll position without costing layout space).
 * Tapping the pill opens a small anchored popover explaining what
 * "not syncing" means; tapping outside or pressing Escape dismisses it
 * (same dismissal conventions as AnchoredMessageMenu in the chat route).
 *
 * State: Jazz's useSyncConnectionStatus. Per docs/jazz-api-notes.md §3 it
 * returns `true` when connected, `false` when disconnected (~5-second
 * detection delay from missing server pings). Renders nothing while online.
 *
 * Color: the semantic warn tokens (bg-warn / border-warn / text-warn /
 * text-warn-icon — the hf-flows warn-callout set), NOT red (this is a
 * degraded-but-safe state, not an error) and NOT the user accent. The warn
 * wash is translucent in dark theme, so a bg-panel backing keeps the pill
 * legible over scrolling bubbles.
 */
export function SyncStatusPill() {
  const isConnected = useSyncConnectionStatus();
  const offline = isConnected === false;

  const [open, setOpen] = useState(false);
  const [since, setSince] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Record when the disconnect was first observed; clear (and close the
  // popover) once the connection returns.
  useEffect(() => {
    if (offline) {
      setSince((s) => s ?? Date.now());
    } else {
      setSince(null);
      setOpen(false);
    }
  }, [offline]);

  // Dismissal while open: pointerdown outside the pill+popover (capture
  // phase) or Escape — mirrors the chat route's popover conventions. No
  // scroll-close: unlike a message-anchored menu, the pill doesn't move
  // when the timeline scrolls.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (wrapRef.current && t && wrapRef.current.contains(t)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  if (!offline) return null;

  const sinceLabel = since
    ? new Date(since).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    // Zero-height positioning context: children float over the timeline.
    <div ref={wrapRef} className="relative z-10 h-0">
      {/* Pill — centered via a full-width flex row (not translate-x: the
          arcan-rise keyframe owns `transform` and would drop the x-shift
          mid-animation). pointer-events pass through the empty gutters. */}
      <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
        <div className="pointer-events-auto rounded-pill bg-panel shadow-level-1 transition-tint duration-fast ease-out hover:bg-panel-2 animate-arcan-rise">
          <button
            type="button"
            data-testid="sync-pill"
            aria-expanded={open}
            aria-controls="sync-pill-popover"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-pill border border-warn bg-warn px-3 py-[5px]"
          >
            <span
              aria-hidden
              className="font-mono font-semibold text-ui-sub leading-none text-warn-icon"
            >
              ⚠
            </span>
            <span className="font-mono font-medium text-ui-caps tracking-caps-sm uppercase leading-none text-warn">
              not syncing
            </span>
          </button>
        </div>
      </div>

      {/* Explanation popover — anchored below the pill, panel surface. */}
      {open && (
        <div className="pointer-events-none absolute inset-x-0 top-11 flex justify-center px-4">
          <div
            id="sync-pill-popover"
            data-testid="sync-pill-popover"
            className="pointer-events-auto w-[300px] max-w-full rounded-r-4 border border-hairline bg-panel p-3 shadow-toast animate-arcan-modal-in"
          >
            <div className="flex items-start gap-2">
              <span
                aria-hidden
                className="font-mono font-semibold text-ui-toast leading-snug text-warn-icon"
              >
                ⚠
              </span>
              <div className="flex flex-col gap-1.5">
                <span className="font-mono font-medium text-ui-caps tracking-caps-sm uppercase text-text">
                  not syncing
                </span>
                <span className="font-body text-ui-sub leading-[1.4] text-text-2">
                  You&apos;re offline. Messages you send are saved on this
                  device and will sync to everyone as soon as the connection
                  returns.
                </span>
                {sinceLabel && (
                  <span className="font-mono text-ui-caps tracking-caps-sm uppercase text-dim">
                    offline since {sinceLabel} · reconnecting
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
