import { useState } from "react";
import { useIsAuthenticated } from "jazz-tools/react";
import { OnboardingRoute } from "./routes/onboarding";
import { HomeRoute } from "./routes/home";
import { SettingsRoute } from "./routes/settings";

/**
 * Navigation strategy: Option A (state machine).
 *
 * App holds `view` state switching between "home" and "settings". No
 * react-router-dom is installed; refreshing always returns to "home". This is
 * intentional for Slice 1 — a single deep route (/settings) doesn't justify
 * the extra dependency.
 */
type AppView = "home" | "settings";

/**
 * App: top-level route shell.
 *
 * Switches between the onboarding flow and the main application based on
 * whether the user has a signed-in Jazz account.
 *
 * - Not authenticated → <OnboardingRoute /> (passphrase creation / restore)
 * - Authenticated → HomeRoute or SettingsRoute, depending on `view` state
 *
 * The component is always rendered inside <MessangerProvider> (see main.tsx),
 * so `useIsAuthenticated` has access to the Jazz context.
 */
function App() {
  const isAuthenticated = useIsAuthenticated();
  const [view, setView] = useState<AppView>("home");

  if (!isAuthenticated) {
    return <OnboardingRoute />;
  }

  if (view === "home") {
    return <HomeRoute onNavigateToSettings={() => setView("settings")} />;
  }

  return <SettingsRoute onNavigateToHome={() => setView("home")} />;
}

export default App;
