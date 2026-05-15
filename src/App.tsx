import { useState } from "react";
import { useIsAuthenticated } from "jazz-tools/react";
import { OnboardingRoute } from "./routes/onboarding";
import { HomeRoute } from "./routes/home";

/**
 * Navigation strategy: Option A (state machine).
 *
 * App holds `view` state switching between "home" and "settings". No
 * react-router-dom is installed; refreshing always returns to "home". This is
 * intentional for Slice 1 — a single deep route (/settings) doesn't justify
 * the extra dependency.
 *
 * SettingsRoute is lazily imported below (in the settings task) to keep this
 * file from bloating before Task 26 is wired up.
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

  // Settings: rendered lazily — placeholder until Task 26 wires it in.
  // This branch will be replaced by <SettingsRoute> in Task 26.
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <p className="text-gray-500 mb-4">Settings (coming in Task 26)</p>
        <button
          className="text-sm text-blue-600 hover:underline"
          onClick={() => setView("home")}
        >
          ← Home
        </button>
      </div>
    </div>
  );
}

export default App;
