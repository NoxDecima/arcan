/**
 * Minimal inline-SVG icon set for the navigation IA (Unit 9-3).
 *
 * The codebase has no icon library; SVGs are authored inline (cf. Lattice).
 * The prototype (design/proto.jsx) references icons by a short key —
 * `Icon d="chat|people|gear|plus"`. This is the typed React equivalent for
 * the four glyphs the sidebar / tab-bar / FAB need.
 *
 * Color: stroke is `currentColor`, so callers set color with a token
 * text-class (e.g. `text-dim`, `text-on-accent`). Never hard-code a color.
 */
export type IconName = "chat" | "people" | "gear" | "plus";

interface IconProps {
  name: IconName;
  /** Pixel size (square). Default 20. */
  size?: number;
  /** Stroke width. Default 1.8. */
  strokeWidth?: number;
  className?: string;
  "data-testid"?: string;
}

// 24x24 viewBox paths. `chat` = speech bubble, `people` = two figures,
// `gear` = settings cog, `plus` = add.
const PATHS: Record<IconName, JSX.Element> = {
  chat: (
    <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9.5 9.5 0 0 1-3.9-.8L3 21l1.9-4.1A8.38 8.38 0 0 1 4 12.5 8.5 8.5 0 0 1 12.5 4 8.38 8.38 0 0 1 21 11.5Z" />
  ),
  people: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </>
  ),
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
  className,
  "data-testid": testId,
}: IconProps) {
  return (
    <svg
      data-icon={name}
      data-testid={testId}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{ display: "block", flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
