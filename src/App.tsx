import { useIsAuthenticated } from "jazz-tools/react";
import { OnboardingRoute } from "./routes/onboarding";

/**
 * App: top-level route shell.
 *
 * Switches between the onboarding flow and the main application based on
 * whether the user has a signed-in Jazz account.
 *
 * - Not authenticated → <OnboardingRoute /> (passphrase creation / restore)
 * - Authenticated → main UI placeholder (home + settings implemented in C3)
 *
 * The component is always rendered inside <MessangerProvider> (see main.tsx),
 * so `useIsAuthenticated` has access to the Jazz context.
 */
function App() {
  const isAuthenticated = useIsAuthenticated();

  if (!isAuthenticated) {
    return <OnboardingRoute />;
  }

  // Authenticated: placeholder for Phase C3 (home + settings UI)
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "sans-serif",
      }}
    >
      <h1>Jazz Messanger</h1>
    </div>
  );
}

export default App;
