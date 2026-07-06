// src/ui/screens/invite-status-screen.tsx — Rung-4 status / loading presenter.
// Used for the invite non-confirm phases (loading / signin-required / sending / sent /
// approved / expired / error) and pairing status phases.
// No hf proto twin — kit-composed from the auth surface.
// No parity cell (Rung-4 manifest row only).
// Pure presenter: props in / JSX out; no Jazz, no router.

import type { ReactNode, JSX } from "react";
import { AuthSurface, AuthTitle, AuthSub, PButton, ArcanMark } from "@/ui/kit";

export function InviteStatusScreen({
  markSize = 48,
  title,
  sub,
  bodySlot,
  primary,
  outline,
  rootTestId,
  primaryTestId,
  outlineTestId,
}: {
  /** ArcanMark stacked size (default 48). */
  markSize?: number;
  title?: string;
  sub?: string;
  /** Extra content (e.g. Lattice for mono states, sign-in CTA button cluster). */
  bodySlot?: ReactNode;
  /** Primary button spec. */
  primary?: { label: string; onClick: () => void };
  /** Outline button spec. */
  outline?: { label: string; onClick: () => void };
  /**
   * Phase testid — identifies the invite/pairing phase to e2e selectors.
   * E.g. "invite-loading", "invite-sending", "pair-approved".
   * Rendered as an sr-only marker (position:absolute → layout-neutral).
   */
  rootTestId?: string;
  /** data-testid for the primary button (e.g. "pair-init-home-btn"). */
  primaryTestId?: string;
  /** data-testid for the outline button. */
  outlineTestId?: string;
}): JSX.Element {
  return (
    <AuthSurface w={360}>
      {/* sr-only phase marker — layout-neutral; findable by Playwright */}
      {rootTestId && (
        <span data-testid={rootTestId} className="sr-only" />
      )}
      {/* mark */}
      <div className="flex justify-center">
        <ArcanMark stacked size={markSize} />
      </div>
      {title && <AuthTitle>{title}</AuthTitle>}
      {sub && <AuthSub>{sub}</AuthSub>}
      {bodySlot}
      {primary && (
        <PButton primary full label={primary.label} onClick={primary.onClick} data-testid={primaryTestId} />
      )}
      {outline && (
        <PButton full label={outline.label} onClick={outline.onClick} data-testid={outlineTestId} />
      )}
    </AuthSurface>
  );
}
