import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useIsAuthenticated, useAccount } from "jazz-tools/react";
import { OnboardingRoute } from "./routes/onboarding";
import { SettingsRoute } from "./routes/settings";
import { PairRoute } from "./routes/pair";
import { ContactsRoute } from "./routes/contacts";
import { ContactAddRoute } from "./routes/contacts/add";
import { ContactDetailRoute } from "./routes/contacts/detail";
import { InviteRoute } from "./routes/invite";
import { ConversationsRoute } from "./routes/conversations";
import { ConversationDetailRoute } from "./routes/conversations/detail";
import { MembersRoute } from "./routes/conversations/members";
import { LoginRoute } from "./routes/auth/login";
import { RecoveryRoute } from "./routes/auth/recovery";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { useConversationInboxSubscription } from "@/jazz/conversation";
import { NotificationManager } from "@/components/notification-manager";

/**
 * App: top-level route shell.
 *
 * Switches between the auth / onboarding flow and the main application
 * based on whether the user has a signed-in Jazz account.
 *
 * Special cases before the auth gate:
 * - /pair → PairRoute (auth-optional; responders become authenticated here)
 * - /invite → InviteRoute (auth-optional; component stashes fragment + redirects)
 *
 * - Not authenticated → /auth/login by default; /auth/recovery and
 *   /onboarding also reachable.
 * - Authenticated → main app routes plus /auth/recovery for the recovery
 *   stage-2 "set new password" flow after a 24-word recovery sign-in.
 *
 * The component is always rendered inside <MessangerProvider> (see main.tsx),
 * so `useIsAuthenticated` has access to the Jazz context.
 */
function App() {
  const isAuthenticated = useIsAuthenticated();
  const location = useLocation();

  // Load me with enough depth for the inbox subscription to find contacts
  // and push arriving conversations to knownConversations.
  // profile: true is required so Inbox.load(me) can read me.profile.inbox.
  // knownConversations: true is required so the inbox callback can call
  // $jazz.push on the list (NotLoaded proxies don't have push).
  // Called unconditionally (hook rules) but the subscription itself is
  // guarded on me.$isLoaded so it's a no-op when not authenticated.
  // Slice 8: deepen the resolve so the NotificationManager can iterate
  // knownConversations with their messages, and read lastReadAt +
  // notificationPrefs without separate hooks. $each on knownConversations
  // keeps the kicked-from-group case safe via $onError: "catch".
  const me = useAccount(JazzMessangerAccount, {
    resolve: {
      profile: true,
      root: {
        contactBook: { $each: true },
        knownConversations: { $each: { messages: true, $onError: "catch" } },
        lastReadAt: true,
        notificationPrefs: true,
      },
    },
  });
  useConversationInboxSubscription(me);

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
    // Routing inversion (Slice 7): the unauthenticated default is the
    // /auth/login route, not the onboarding flow. /onboarding remains
    // reachable via the "Create new account" link on the login screen.
    return (
      <Routes>
        <Route path="/onboarding" element={<OnboardingRoute />} />
        <Route path="/auth/login" element={<LoginRoute />} />
        <Route path="/auth/recovery" element={<RecoveryRoute />} />
        <Route path="*" element={<Navigate to="/auth/login" replace />} />
      </Routes>
    );
  }

  return (
    <>
      {/* Slice 8: in-app notification manager — drives tab title badge,
          sound, and browser-notification fanout. Mounted only when me is
          loaded so its accessors on me.root never NPE. */}
      {me.$isLoaded && <NotificationManager me={me} />}
      <Routes>
        <Route path="/" element={<ConversationsRoute />} />
        <Route path="/conversations" element={<ConversationsRoute />} />
        <Route path="/conversations/:id" element={<ConversationDetailRoute />} />
        <Route path="/conversations/:id/members" element={<MembersRoute />} />
        <Route path="/settings/*" element={<SettingsRoute />} />
        <Route path="/contacts" element={<ContactsRoute />} />
        <Route path="/contacts/add" element={<ContactAddRoute />} />
        <Route path="/contacts/:contactID" element={<ContactDetailRoute />} />
        {/* /auth/recovery is reachable while authenticated so a user who
            signed in via 24-word recovery code can complete stage 2 (set a
            fresh password). The recovery route itself navigates to "/" on
            completion or skip. */}
        <Route path="/auth/recovery" element={<RecoveryRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
