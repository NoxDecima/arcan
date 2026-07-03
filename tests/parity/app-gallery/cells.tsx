import type { ReactNode } from "react";

export const APP_CELLS: Record<string, () => ReactNode> = {
  "probe-swatch": () => (
    <div className="w-[200px] h-[64px] rounded-r-4 border border-hairline bg-panel flex items-center justify-center">
      <span className="font-mono font-medium text-ui-row text-text">probe {"//"} arcan</span>
    </div>
  ),
};
