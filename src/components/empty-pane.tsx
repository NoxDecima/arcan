import type { ReactNode } from "react";
import { Lattice } from "@/components/lattice";

/**
 * EmptyPane: the canonical "nothing selected / nothing to show" placeholder.
 *
 * Two variants:
 *   - "reading-pane" — fills the desktop reading-pane on `/` when no
 *     conversation is selected. Oversized Lattice watermark bleeds off the
 *     bottom-right corner; three scattered cosmic dots; centered medium
 *     Lattice mark above the title + description.
 *   - "compact" — smaller centered stack for empty list states (contacts,
 *     connections/pending, connections/live-invites). Small Lattice +
 *     title + description + optional CTA.
 *
 * Design reference: `design/hf-list.jsx` lines 5–24 (canonical render shape).
 * Audit rows closed: AUDIT-007, 008, 019, 020, 029, 030, 031, 032.
 */

type CommonProps = {
  title: string;
  description: string;
  /** Optional passthrough for e2e / unit test hooks. */
  "data-testid"?: string;
};

type ReadingPaneProps = CommonProps & {
  variant: "reading-pane";
};

type CompactProps = CommonProps & {
  variant: "compact";
  /**
   * Optional CTA rendered below the description. Pass any React node — most
   * call-sites pass a `<Button>` or `<Link>` wrapped Button.
   */
  cta?: ReactNode;
};

export type EmptyPaneProps = ReadingPaneProps | CompactProps;

export function EmptyPane(props: EmptyPaneProps) {
  if (props.variant === "reading-pane") {
    return <ReadingPaneVariant {...props} />;
  }
  return <CompactVariant {...props} />;
}

function ReadingPaneVariant({
  title,
  description,
  "data-testid": testid,
}: ReadingPaneProps) {
  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center gap-[18px] overflow-hidden bg-bg bg-gradient-cosmic"
      data-testid={testid}
    >
      {/* Oversized Lattice watermark, bleeding off the bottom-right corner.
          Pale opacity per design. Wrapped in an aria-hidden span so screen
          readers don't double-announce the brand mark (the centered Lattice
          below carries its own aria-label="Arcan"). */}
      <span
        data-empty-pane-watermark
        aria-hidden="true"
        className="pointer-events-none absolute select-none text-text opacity-[0.05]"
        style={{ right: -84, bottom: -96 }}
      >
        <Lattice size={360} mono />
      </span>

      {/* Cosmic dots — Nox motif. Positioned per design/hf-list.jsx. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-1 w-1 rounded-pill bg-arcan-accent"
        style={{
          right: "22%",
          top: "24%",
          boxShadow: "0 0 10px var(--color-accent-soft)",
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-[3px] w-[3px] rounded-pill opacity-70"
        style={{
          left: "24%",
          bottom: "28%",
          background: "var(--color-accent-grad-1)",
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-[2px] w-[2px] rounded-pill bg-dim"
        style={{ left: "40%", top: "30%" }}
      />

      {/* Centered medium Lattice mark. Default (non-mono) so it picks up the
          user's accent gradient. */}
      <Lattice size={58} />

      <div className="relative text-center">
        <h2 className="text-base font-semibold text-text">{title}</h2>
        <p className="mt-1.5 text-xs text-text-2">{description}</p>
      </div>
    </div>
  );
}

function CompactVariant({
  title,
  description,
  cta,
  "data-testid": testid,
}: CompactProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center"
      data-testid={testid}
    >
      <Lattice size={48} />
      <div>
        <h2 className="text-base font-semibold text-text">{title}</h2>
        <p className="mt-1.5 max-w-xs text-xs text-text-2">{description}</p>
      </div>
      {cta && <div data-empty-pane-cta className="mt-2">{cta}</div>}
    </div>
  );
}
