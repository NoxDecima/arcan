// src/ui/kit/desktop-empty.tsx — port of design/proto.jsx:658-673.
// Desktop right-pane empty state: watermark + ArcanMark + e2e tagline.

import { ArcanMark } from "./arcan-mark";
import { latticePaths } from "./lattice-paths";

export function DesktopEmpty({ tab }: { tab: "chats" | "contacts" }): JSX.Element {
  return (
    <div className="flex-1 relative flex flex-col items-center justify-center gap-[18px] bg-bg overflow-hidden">
      {/* watermark lattice (proto:660) */}
      <svg
        width="360"
        height="360"
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="absolute text-text select-none pointer-events-none"
        style={{ right: -84, bottom: -96, opacity: "var(--opacity-watermark)" }}
        dangerouslySetInnerHTML={{ __html: latticePaths.full("currentColor") }}
      />
      {/* accent dot — 4px fill + glow (proto:664) */}
      <div
        className="absolute w-[4px] h-[4px] rounded-pill bg-arcan-accent-fill shadow-dot"
        style={{ left: "30%", top: "28%" }}
      />
      {/* cosmic dot — 3px fixed violet (proto:665) */}
      <div
        className="absolute w-[3px] h-[3px] rounded-pill bg-cosmic-dot"
        style={{ right: "32%", top: "34%" }}
      />
      <ArcanMark size={58} stacked />
      <div className="text-center relative">
        <div className="font-mono font-semibold text-ui-empty text-text-2">
          {tab === "contacts" ? "select a contact" : "select a conversation"}
        </div>
        <div className="mt-1.5 font-body text-ui-empty-sub text-dim">
          {"// end-to-end encrypted"}
        </div>
      </div>
    </div>
  );
}
