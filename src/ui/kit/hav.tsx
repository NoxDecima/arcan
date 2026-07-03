// src/ui/kit/hav.tsx — port of design/hf-kit.jsx lines 103–114.
// Avatar tile: token bg/fg, fixed rounded-avatar (10px), size-scaled font + dot.
// `s` prop dropped — theme-reactive via CSS tokens; size-scaled metrics stay
// computed inline per the transliteration rules (Ground rule 5).

export function HAv({
  txt,
  size = 34,
  group,
  status,
  ring,
  className,
}: {
  txt: string;
  size?: number;
  group?: boolean;
  status?: "online" | "offline";
  ring?: string;
  className?: string;
}): JSX.Element {
  const dot = Math.max(8, Math.round(size * 0.28));
  return (
    <div
      className={`relative shrink-0${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size }}
    >
      <div
        className={[
          "rounded-avatar border border-hairline flex items-center justify-center",
          "font-mono font-semibold tracking-avatar",
          group
            ? "bg-avatar-group text-avatar-group-fg"
            : "bg-accent-soft text-arcan-accent",
        ].join(" ")}
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.34),
          lineHeight: 1,
        }}
      >
        {txt}
      </div>
      {status && (
        <div
          className={`absolute ${status === "online" ? "bg-green" : "bg-dim"}`}
          style={{
            right: -1,
            bottom: -1,
            width: dot,
            height: dot,
            borderRadius: dot,
            border: `2px solid ${ring ?? "var(--color-bg)"}`,
          }}
        />
      )}
    </div>
  );
}
