import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useTheme, type Theme } from "@/styles/use-theme";
import { useAccent, ACCENT_KEYS, type Accent } from "@/styles/use-accent";
import { useToast } from "@/components/toast";
import { Skel } from "@/components/skeleton";
import { Card, SectionLabel, Icon } from "./settings-kit";

const ACCENT_SWATCH: Record<Accent, string> = {
  tokyo:  "#7aa2f7",
  violet: "#bb9af7",
  teal:   "#73daca",
  lime:   "#9ece6a",
  amber:  "#e0af68",
  rose:   "#f7768e",
};

// Relative luminance (sRGB) — matches design/proto.jsx window.lum. The kit
// (9-5a) does not export accentCheckColor, so we define the contrast-aware
// foreground locally (proto formula: lum(col) > 0.55 ? "#0b0d14" : "#fff").
function lum(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function accentCheckColor(hex: string): string {
  return lum(hex) > 0.55 ? "#0b0d14" : "#fff";
}

/**
 * AccentSwatches: the six colored swatch buttons. Pure presentation so it can
 * be unit-tested without the Jazz account. The selected swatch renders a
 * contrast-aware check-mark (proto.jsx SettingsScreen line 294).
 *
 * The kit Icon strokes with currentColor and does not accept a colour prop, so
 * the contrast colour is applied via inline `style` on a wrapping span (which
 * also carries the per-swatch test id). Inline style colours are token-neutral
 * data, not Tailwind classes, so check-tokens ignores them.
 */
export function AccentSwatches({
  accent,
  onPick,
}: {
  accent: Accent;
  onPick: (a: Accent) => void;
}) {
  return (
    <div className="mt-3.5 flex gap-3 pl-7" data-testid="appearance-accent-picker">
      {ACCENT_KEYS.map((k) => {
        const col = ACCENT_SWATCH[k];
        const on = accent === k;
        return (
          <button
            key={k}
            data-testid={`accent-${k}`}
            aria-label={k}
            title={k}
            onClick={() => onPick(k)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill"
            style={{
              background: col,
              border: on ? "2px solid var(--color-text)" : "2px solid transparent",
              boxShadow: on ? "0 0 0 2px var(--color-panel)" : "none",
            }}
          >
            {on && (
              <span
                data-testid={`accent-check-${k}`}
                className="flex items-center justify-center"
                style={{ color: accentCheckColor(col) }}
              >
                <Icon d="check" size={14} sw={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function AppearanceSection() {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { settings: { appearance: true } } },
  });
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();
  const toast = useToast();

  if (!me.$isLoaded) {
    return (
      <div data-testid="appearance-section-loading">
        <SectionLabel>appearance</SectionLabel>
        <Card>
          <div className="flex flex-col gap-4 px-3.5 py-3">
            <div className="flex items-center gap-3">
              <Skel w="40%" h={14} />
              <Skel w={80} h={24} r={999} />
            </div>
            <div className="flex flex-col gap-2">
              <Skel w="40%" h={14} />
              <div className="flex gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skel key={i} w={28} h={28} r={999} />
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const apply = (next: { theme?: Theme; accent?: Accent }) => {
    const appearance = me.root.settings?.appearance;
    if (!appearance) return;
    if (next.theme) {
      setTheme(next.theme);
      (appearance as any).$jazz.set("theme", next.theme);
    }
    if (next.accent) {
      setAccent(next.accent);
      (appearance as any).$jazz.set("accent", next.accent);
    }
    toast({ icon: "check", text: "appearance updated", tone: "success" });
  };

  return (
    <div>
      <SectionLabel>appearance</SectionLabel>
      <Card>
        {/* theme — row icon is moon/sun (proto line 281) */}
        <div className="flex items-center gap-3 border-b border-hairline px-3.5 py-3">
          <span className="text-text-2">
            <Icon d={theme === "dark" ? "moon" : "sun"} size={17} />
          </span>
          <span className="flex-1 text-sm text-text">theme</span>
          <div
            className="flex gap-0.5 rounded-pill border border-hairline bg-panel-2 p-0.5"
            data-testid="appearance-theme-toggle"
          >
            {(["light", "dark"] as Theme[]).map((t) => {
              const on = theme === t;
              return (
                <button
                  key={t}
                  data-testid={`theme-${t}`}
                  className={`rounded-pill px-3 py-1 text-xs font-semibold ${on ? "bg-arcan-accent text-on-accent" : "text-text-2"}`}
                  onClick={() => apply({ theme: t })}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* accent — row icon is sparkle (proto line 289) */}
        <div className="px-3.5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-text-2">
              <Icon d="sparkle" size={17} />
            </span>
            <span className="flex-1 text-sm text-text">accent color</span>
            <span className="text-xs text-arcan-accent">{accent}</span>
          </div>
          <AccentSwatches accent={accent} onPick={(a) => apply({ accent: a })} />
        </div>
      </Card>
    </div>
  );
}
