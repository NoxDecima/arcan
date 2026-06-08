import type { CSSProperties } from "react";

export interface SkelProps {
  w?: number | string;
  h?: number | string;
  r?: number | string;
  style?: CSSProperties;
  className?: string;
}

/** Generic shimmer rectangle. */
export function Skel({ w = "100%", h = 12, r = 4, style, className }: SkelProps) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: "block",
        width: w,
        height: h,
        borderRadius: r,
        background:
          "linear-gradient(90deg, var(--color-panel-2) 0%, var(--color-panel) 50%, var(--color-panel-2) 100%)",
        backgroundSize: "200% 100%",
        animation: "arcan-shimmer 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

export function NavListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", padding: "var(--sp-2) var(--sp-2)" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", padding: "var(--sp-2) var(--sp-3)" }}>
          <Skel w={36} h={36} r={18} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <Skel w="60%" h={12} />
            <Skel w="40%" h={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChatHeaderSkeleton() {
  return (
    <div
      style={{
        height: 52,
        display: "flex",
        alignItems: "center",
        gap: "var(--sp-3)",
        padding: "0 var(--sp-4)",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-bg)",
      }}
    >
      <Skel w={34} h={34} r={17} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <Skel w={120} h={12} />
        <Skel w={60} h={9} />
      </div>
    </div>
  );
}

export function ChatMessagesSkeleton() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--sp-3)", padding: "var(--sp-4)", background: "var(--color-bg)" }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const mine = i % 2 === 1;
        const widths = [160, 100, 200, 130, 180];
        return (
          <div key={i} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
            <Skel w={widths[i]} h={32} r={14} />
          </div>
        );
      })}
    </div>
  );
}
