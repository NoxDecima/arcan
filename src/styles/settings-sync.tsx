import { useEffect } from "react";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useTheme } from "./use-theme";
import { useAccent } from "./use-accent";

/**
 * Reads me.root.settings.appearance and hydrates ThemeProvider + AccentProvider
 * with the persisted values on sign-in.
 */
export function SettingsSync() {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { settings: { appearance: true } } },
  });
  const { setTheme } = useTheme();
  const { setAccent } = useAccent();

  useEffect(() => {
    if (!me.$isLoaded) return;
    const ap = me.root.settings?.appearance;
    if (!ap) return;
    if (ap.theme === "light" || ap.theme === "dark") setTheme(ap.theme);
    if (typeof ap.accent === "string") {
      try {
        setAccent(ap.accent as any);
      } catch {
        // unknown accent — ignore
      }
    }
  }, [
    me.$isLoaded,
    (me as any).root?.settings?.appearance?.theme,
    (me as any).root?.settings?.appearance?.accent,
    setTheme,
    setAccent,
  ]);

  return null;
}
