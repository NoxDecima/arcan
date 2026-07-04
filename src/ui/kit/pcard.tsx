// src/ui/kit/pcard.tsx — port of design/proto-ui.jsx lines 63–67.
// Rounded card container for settings/profile row lists.
// Cluster from mapping table (verbatim): rounded-r-5 border border-hairline bg-panel overflow-hidden

import type { ReactNode } from "react";

export function PCard({
  children,
  className,
  "data-testid": testId,
}: {
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}): JSX.Element {
  return (
    <div
      data-testid={testId}
      className={[
        "rounded-r-5 border border-hairline bg-panel overflow-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
