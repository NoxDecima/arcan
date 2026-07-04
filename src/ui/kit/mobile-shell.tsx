// src/ui/kit/mobile-shell.tsx — port of design/proto.jsx:642-649 inner chrome,
// excluding the phone bezel, status bar, and home-indicator strip (stage dressing).
// tabBar and toast are explicit slots; positioning of the toast overlay comes
// from KitToast itself (absolute within MobileShell's relative root).

import type { ReactNode } from "react";

export function MobileShell({
  children,
  tabBar,
  toast,
}: {
  children: ReactNode;
  tabBar?: ReactNode;
  toast?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden bg-bg">
      {/* screen area — flex col so Body (flex-1) fills correctly */}
      <div className="flex-1 min-h-0 relative flex flex-col">
        {children}
      </div>
      {tabBar}
      {toast}
    </div>
  );
}
