// src/ui/kit/auth-surface.tsx — port of design/hf-flows.jsx:12-29.
// The 4-star cosmic auth surface. Distinct from AuthShell (the 2-dot proto surface).
// AuthShell = proto Welcome/SignIn backdrop; AuthSurface = hf onboarding/pairing/invite.

import type { ReactNode } from "react";
import type { JSX } from "react";
import { latticePaths } from "./lattice-paths";

export function AuthSurface({
  w = 320,
  tall = false,
  testId,
  children,
}: {
  w?: number;
  tall?: boolean;
  /** Optional data-testid on the root div (e.g. "pair-approval-prompt" for ApproveDeviceScreen). */
  testId?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      data-testid={testId}
      className={[
        "flex-1 min-h-0 relative flex justify-center bg-bg",
        tall ? "overflow-y-auto" : "items-center overflow-hidden",
      ].join(" ")}
    >
      {/* cosmic watermark — hf 360×360 at right:-84 bottom:-96 (hf-flows:18-20) */}
      <svg
        width="360"
        height="360"
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="absolute text-text select-none pointer-events-none"
        style={{ right: -84, bottom: -96, opacity: "var(--opacity-watermark)" }}
        dangerouslySetInnerHTML={{ __html: latticePaths.full("currentColor") }}
      />
      {/* star 1 — accent fill 4px glow, left 22% top 20% (hf-flows:22) */}
      <div
        className="absolute w-[4px] h-[4px] rounded-pill bg-arcan-accent-fill shadow-dot"
        style={{ left: "22%", top: "20%" }}
      />
      {/* star 2 — violet cosmic-dot 3px glow, left 72% top 26% (hf-flows:23)
          intent-fix: glow uses the star's own color (#bb9af7), not the accent-dot token
          (which changes per accent); proto uses alpha('#bb9af7', .6) = fixed violet glow. */}
      <div
        className="absolute w-[3px] h-[3px] rounded-pill bg-cosmic-dot"
        style={{ left: "72%", top: "26%", boxShadow: "0 0 10px rgba(187,154,247,0.6)" }}
      />
      {/* star 3 — #7dcfff cosmic-dot-2 3px glow, left 30% top 74% (hf-flows:24)
          intent-fix: glow uses the star's own color (#7dcfff), not the accent-dot token;
          proto uses alpha('#7dcfff', .6) = fixed cyan glow. */}
      <div
        className="absolute w-[3px] h-[3px] rounded-pill bg-cosmic-dot-2"
        style={{ left: "30%", top: "74%", boxShadow: "0 0 10px rgba(125,207,255,0.6)" }}
      />
      {/* star 4 — accent fill 2px no-glow, left 80% top 66% (hf-flows:25) */}
      <div
        className="absolute w-[2px] h-[2px] rounded-pill bg-arcan-accent-fill"
        style={{ left: "80%", top: "66%" }}
      />
      {/* content column — width/maxWidth/gap/padding are structural literals (hf-flows:26) */}
      {/* user-decision patch (2026-07-06): center-when-fits — my-auto on tall column gives flex
          auto-margin centering when there is free space; collapses to 0 when content overflows
          so the container scrolls from the top (unlike justify-center which clips the top). */}
      <div
        className={tall ? "relative flex flex-col my-auto" : "relative flex flex-col"}
        style={{
          width: w,
          maxWidth: "88%",
          gap: tall ? 11 : 15,
          padding: tall ? "20px 18px" : 18,
        }}
      >
        {children}
      </div>
    </div>
  );
}
