import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useTheme, type Theme } from "@/styles/use-theme";
import { useAccent, ACCENT_KEYS, type Accent } from "@/styles/use-accent";

const ACCENT_SWATCH: Record<Accent, string> = {
  tokyo:  "#7aa2f7",
  violet: "#bb9af7",
  teal:   "#73daca",
  lime:   "#9ece6a",
  amber:  "#e0af68",
  rose:   "#f7768e",
};

export function AppearanceSection() {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { settings: { appearance: true } } },
  });
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();

  if (!me.$isLoaded) {
    return (
      <section>
        <h2 className="text-base font-semibold text-text mb-2">Appearance</h2>
        <p className="text-sm text-dim">Loading…</p>
      </section>
    );
  }

  const apply = (next: { theme?: Theme; accent?: Accent }) => {
    if (next.theme) {
      setTheme(next.theme);
      (me.root.settings.appearance as any).$jazz.set("theme", next.theme);
    }
    if (next.accent) {
      setAccent(next.accent);
      (me.root.settings.appearance as any).$jazz.set("accent", next.accent);
    }
  };

  return (
    <section>
      <h2 className="text-base font-semibold text-text mb-2">Appearance</h2>
      <div className="bg-panel rounded-r-3 border border-hairline px-4 py-3 flex flex-col gap-4">
        {/* Theme toggle */}
        <div className="flex items-center gap-3">
          <span className="flex-1 text-sm text-text">Theme</span>
          <div
            className="flex gap-0.5 p-0.5 rounded-pill bg-panel-2 border border-hairline"
            data-testid="appearance-theme-toggle"
          >
            {(["light", "dark"] as Theme[]).map((t) => {
              const on = theme === t;
              return (
                <button
                  key={t}
                  data-testid={`theme-${t}`}
                  className={`px-3 py-1 rounded-pill text-xs font-semibold ${on ? "bg-arcan-accent text-on-accent" : "text-text-2"}`}
                  onClick={() => apply({ theme: t })}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent picker */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center">
            <span className="flex-1 text-sm text-text">Accent color</span>
            <span className="text-xs text-arcan-accent">{accent}</span>
          </div>
          <div className="flex gap-3" data-testid="appearance-accent-picker">
            {ACCENT_KEYS.map((k) => {
              const on = accent === k;
              return (
                <button
                  key={k}
                  data-testid={`accent-${k}`}
                  aria-label={k}
                  className="w-7 h-7 rounded-pill"
                  onClick={() => apply({ accent: k })}
                  style={{
                    background: ACCENT_SWATCH[k],
                    border: on ? "2px solid var(--color-text)" : "2px solid transparent",
                    boxShadow: on ? `0 0 0 2px var(--color-panel)` : "none",
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
