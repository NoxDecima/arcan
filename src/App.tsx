import { Routes, Route, Navigate } from "react-router-dom";
import { useIsAuthenticated } from "jazz-tools/react";
import { OnboardingRoute } from "./routes/onboarding";
import { HomeRoute } from "./routes/home";
import { SettingsRoute } from "./routes/settings";

/**
 * App: top-level route shell.
 *
 * Switches between the onboarding flow and the main application based on
 * whether the user has a signed-in Jazz account.
 *
 * - Not authenticated → <OnboardingRoute /> (passphrase creation / restore)
 * - Authenticated → react-router-dom <Routes> with "/" and "/settings/*"
 *
 * The component is always rendered inside <MessangerProvider> (see main.tsx),
 * so `useIsAuthenticated` has access to the Jazz context.
 */
function App() {
  const isAuthenticated = useIsAuthenticated();

  if (!isAuthenticated) {
    return <OnboardingRoute />;
  }

  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/settings/*" element={<SettingsRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
