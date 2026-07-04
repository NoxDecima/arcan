// src/ui/kit/hav.tsx — port of design/hf-kit.jsx lines 103–114.
// Avatar tile: token bg/fg, fixed rounded-avatar (10px), size-scaled font + dot.
// `s` prop dropped — theme-reactive via CSS tokens; size-scaled metrics stay
// computed inline per the transliteration rules (Ground rule 5).
// Rung-4 data-driven deviation (Unit 10 Wave A): `src` prop enables image mode —
// real avatar images replace initials when resolved; initials remain the fallback.
// No proto reference (HAv in the proto always uses initials).

export function HAv({
  txt,
  src,
  size = 34,
  group,
  status,
  ring,
  className,
}: {
  txt: string;
  src?: string;
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
          src
            ? "overflow-hidden"
            : [
                "font-mono font-semibold tracking-avatar",
                group
                  ? "bg-avatar-group text-avatar-group-fg"
                  : "bg-accent-soft text-arcan-accent",
              ].join(" "),
        ].join(" ")}
        style={
          src
            ? { width: size, height: size }
            : { width: size, height: size, fontSize: Math.round(size * 0.34), lineHeight: 1 }
        }
      >
        {src ? (
          <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />
        ) : (
          txt
        )}
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
