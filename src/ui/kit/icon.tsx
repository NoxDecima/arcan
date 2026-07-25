// src/ui/kit/icon.tsx — port of design/hf-kit.jsx lines 115–146.
// 30-path icon set; color via className (text-* utility → currentColor).
// Prototype uses a `c` color prop; this kit version is pixel-identical
// because currentColor resolves to the same computed color value.

import type { JSX, CSSProperties } from "react";
export type IconName =
  | "search" | "plus" | "gear" | "back" | "chev" | "send" | "plusc"
  | "image" | "paperclip" | "chat" | "people" | "pencil" | "copy"
  | "share" | "camera" | "check" | "dots" | "bell" | "at" | "device"
  | "key" | "shield" | "logout" | "sun" | "moon" | "sparkle" | "alert"
  | "refresh" | "close" | "message" | "chatplus" | "personplus";

// hf-kit.jsx lines 115–143 — byte-for-byte paths.
export const IPATHS: Record<IconName, string> = {
  search:    'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  plus:      'M12 5v14M5 12h14',
  // intent-fix (feedback round 6): the ported ArcanUI gear read muddy at
  // 19–20px; swapped for a crisper cog. Mirrored in tests/parity/out/hf-kit.js
  // so the parity mapping-table law holds (both galleries render identically).
  gear:      'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 12a7.4 7.4 0 0 0-.07-1l1.86-1.45-1.9-3.3-2.2.88a7.3 7.3 0 0 0-1.73-1l-.33-2.33h-3.8l-.33 2.33a7.3 7.3 0 0 0-1.73 1l-2.2-.88-1.9 3.3L6.67 11a7.4 7.4 0 0 0 0 2l-1.86 1.45 1.9 3.3 2.2-.88a7.3 7.3 0 0 0 1.73 1l.33 2.33h3.8l.33-2.33a7.3 7.3 0 0 0 1.73-1l2.2.88 1.9-3.3L19.33 13a7.4 7.4 0 0 0 .07-1z',
  back:      'M15 18l-6-6 6-6',
  chev:      'M9 6l6 6-6 6',
  send:      'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
  plusc:     'M12 8v8M8 12h8',
  image:     'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6',
  paperclip: 'M21 11l-8.5 8.5a4 4 0 0 1-6-6L13 6a2.5 2.5 0 0 1 4 4l-8 8',
  chat:      'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  people:    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M18 3.13a4 4 0 0 1 0 7.75',
  pencil:    'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z',
  copy:      'M9 9h10v10H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  share:     'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13',
  camera:    'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  check:     'M20 6L9 17l-5-5',
  dots:      'M6 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0M13.5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0M21 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0',
  bell:      'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  at:        'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1',
  device:    'M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2',
  key:       'M19 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2zM8 11V7a4 4 0 0 1 8 0v4',
  shield:    'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z',
  logout:    'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sun:       'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon:      'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  sparkle:   'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z',
  alert:     'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  refresh:   'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6',
  close:     'M18 6 6 18M6 6l12 12',
  message:   'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z',
  // feedback round 2 addendum (intent-fix): not in hf-kit.jsx — lucide
  // message-square-plus / user-plus, same source family + stroke style
  // as the ported set. Used by the tab-aware FAB.
  chatplus:   'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM12 7v6M9 10h6',
  personplus: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6',
};

// hf-kit.jsx lines 144–146 — node-for-node port.
// Prototype's `c` color prop replaced by `className` (text-* → currentColor);
// visually identical.
export function Icon({
  d,
  className,
  size = 18,
  sw = 1.6,
  fill,
  style,
}: {
  d: IconName;
  className?: string;
  size?: number;
  sw?: number;
  fill?: boolean;
  /** Optional inline style passthrough (e.g. optical-centering nudges).
   * Default undefined — parity cells unaffected. */
  style?: CSSProperties;
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      style={style}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={IPATHS[d]} />
    </svg>
  );
}
