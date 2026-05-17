import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useIsAuthenticated } from "jazz-tools/react";
import { OnboardingRoute } from "./routes/onboarding";
import { HomeRoute } from "./routes/home";
import { SettingsRoute } from "./routes/settings";
import { PairRoute } from "./routes/pair";
import { ContactsRoute } from "./routes/contacts";
import { ContactAddRoute } from "./routes/contacts/add";
import { ContactDetailRoute } from "./routes/contacts/detail";
import { InviteRoute } from "./routes/invite";

/**
 * App: top-level route shell.
 *
 * Switches between the onboarding flow and the main application based on
 * whether the user has a signed-in Jazz account.
 *
 * Special cases before the auth gate:
 * - /pair → PairRoute (auth-optional; responders become authenticated here)
 *
 * - Not authenticated → <OnboardingRoute /> (passphrase creation / restore)
 * - Authenticated → react-router-dom <Routes> with "/" and "/settings/*"
 *
 * The component is always rendered inside <MessangerProvider> (see main.tsx),
 * so `useIsAuthenticated` has access to the Jazz context.
 */
function App() {
  const isAuthenticated = useIsAuthenticated();
  const location = useLocation();

  // Allow /pair regardless of auth state — the responder starts unauthenticated
  if (location.pathname === "/pair") {
    return (
      <Routes>
        <Route path="/pair" element={<PairRoute />} />
      </Routes>
    );
  }

  // Allow /invite regardless of auth state — the component handles the auth check
  // internally (stashes fragment in sessionStorage and redirects to "/" if not authed).
  if (location.pathname === "/invite") {
    return (
      <Routes>
        <Route path="/invite" element={<InviteRoute />} />
      </Routes>
    );
  }

  if (!isAuthenticated) {
    return <OnboardingRoute />;
  }

  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/settings/*" element={<SettingsRoute />} />
      <Route path="/contacts" element={<ContactsRoute />} />
      <Route path="/contacts/add" element={<ContactAddRoute />} />
      <Route path="/contacts/:contactID" element={<ContactDetailRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
