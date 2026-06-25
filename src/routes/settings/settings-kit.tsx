import type { ReactNode } from "react";

/**
 * Settings kit — presentational primitives shared by 9-5a (account, sign-out)
 * and 9-5b (appearance, notifications, devices, feedback). Pure + token-driven;
 * no Jazz or router imports so they're trivially testable and reusable.
 *
 * Mirrors design/hf-settings.jsx (Card/SectionLabel/SRow/Toggle/Chev) and the
 * design/hf-kit.jsx IPATHS icon map. Icons stroke with currentColor so colour
 * comes from a Tailwind text-* class (token-compliant — no inline colour).
 */

// ---- Icon ----
// Path data copied verbatim from design/hf-kit.jsx:115-142. Only the glyphs
// the settings surface uses are included.
const IPATHS = {
  key: "M19 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2zM8 11V7a4 4 0 0 1 8 0v4",
  shield: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z",
  message:
    "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  at: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1",
  device:
    "M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2",
  plus: "M12 5v14M5 12h14",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  sparkle: "M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z",
  chev: "M9 6l6 6-6 6",
  check: "M20 6L9 17l-5-5",
} as const;

export type IconName = keyof typeof IPATHS;

export function Icon({
  d,
  size = 18,
  sw = 1.6,
  className,
}: {
  d: IconName;
  size?: number;
  sw?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
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

// ---- Chev (trailing chevron, dim, 15px) ----
export function Chev() {
  return <Icon d="chev" size={15} className="text-dim flex-shrink-0" />;
}

// ---- Toggle (36×21 pill, 15px knob; design/hf-settings.jsx:28-35) ----
// Presentational only — caller owns state + onClick. Knob slides 2→17px.
export function Toggle({
  on,
  onClick,
  "aria-label": ariaLabel,
}: {
  on: boolean;
  onClick?: () => void;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`relative h-[21px] w-9 flex-shrink-0 rounded-pill border transition-colors ${
        on
          ? "bg-arcan-accent border-transparent"
          : "bg-panel-2 border-hairline"
      }`}
    >
      <span
        className={`absolute top-0.5 h-[15px] w-[15px] rounded-pill transition-[left] ${
          on ? "left-[17px] bg-on-accent" : "left-0.5 bg-text-2"
        }`}
      />
    </button>
  );
}

// ---- Card (connected container; design/hf-settings.jsx:10-13) ----
export function Card({
  children,
  "data-testid": testId,
}: {
  children: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="overflow-hidden rounded-r-5 border border-hairline bg-panel"
    >
      {children}
    </div>
  );
}

// ---- SectionLabel (uppercase tracked label ABOVE a card) ----
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-1 pb-2 pt-0.5">
      <span className="text-[9px] font-semibold uppercase leading-none tracking-[0.16em] text-dim">
        {children}
      </span>
    </div>
  );
}

// ---- SRow (icon + label + optional sub + optional value/control; chevron) ----
export function SRow({
  icon,
  label,
  sub,
  value,
  control,
  danger,
  last,
  onClick,
  "data-testid": testId,
}: {
  icon?: IconName;
  label: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  control?: ReactNode;
  danger?: boolean;
  last?: boolean;
  onClick?: () => void;
  "data-testid"?: string;
}) {
  const border = last ? "" : "border-b border-hairline";
  const inner = (
    <>
      {icon && (
        <span data-icon-wrap className={danger ? "text-red" : "text-text-2"}>
          <Icon d={icon} size={17} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div
          className={`text-[12.5px] font-medium leading-tight ${
            danger ? "text-red" : "text-text"
          }`}
        >
          {label}
        </div>
        {sub && (
          <div className="mt-0.5 text-[10.5px] leading-tight text-dim">
            {sub}
          </div>
        )}
      </div>
      {value && <span className="text-[11px] text-dim">{value}</span>}
      {control}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-panel-2 ${border}`}
      >
        {inner}
      </button>
    );
  }
  return (
    <div
      data-testid={testId}
      className={`flex items-center gap-3 px-3.5 py-3 ${border}`}
    >
      {inner}
    </div>
  );
}

export type { ReactNode };
