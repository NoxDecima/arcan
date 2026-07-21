import { useEffect } from "react";
import type { ReactElement } from "react";
import { Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { useIsAuthenticated, useAccount } from "jazz-tools/react";
import { OnboardingRoute } from "./routes/onboarding";
import { SettingsRoute } from "./routes/settings";
import { PairRoute } from "./routes/pair";
import { AddContactRoute as ContactAddRoute } from "./routes/contacts/add";
import { ScanInviteRoute } from "./routes/contacts/scan";
import { ContactDetailRoute } from "./routes/contacts/detail";
import { InviteRoute } from "./routes/invite";
import { ConversationsRoute } from "./routes/conversations";
import { ConversationDetailRoute } from "./routes/conversations/detail";
import { MembersRoute } from "./routes/conversations/members";
import { NewConversationRoute } from "./routes/conversations/new";
import { LoginRoute } from "./routes/auth/login";
import { RecoveryRoute } from "./routes/auth/recovery";
import { PendingConnectionsRoute } from "@/routes/connections/pending";
import { LiveInvitesRoute } from "@/routes/connections/live-invites";
import { IncomingConnectionPrompt } from "@/components/incoming-connection-prompt";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import {
  useConversationInboxSubscription,
  useNotificationRetry,
} from "@/jazz/conversation";
import { useIncomingConnectionRequestInbox } from "@/jazz/use-incoming-connection-requests";
import { useOutgoingRequestWatcher } from "@/jazz/handshake";
import { NotificationManager } from "@/components/notification-manager";
import { DeepLinkBridge } from "@/components/deep-link-bridge";
import { TrustedDevicePrompt } from "@/components/trusted-device-prompt";
import { ThemeProvider } from "@/styles/use-theme";
import { AccentProvider } from "@/styles/use-accent";
import { SettingsSync } from "@/styles/settings-sync";
import { ToastProvider } from "@/components/toast";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { SidebarTabProvider } from "@/components/sidebar-tab";
import { ProfileView } from "@/components/profile-view";
import { AppShell } from "@/components/app-shell";
import { useTransitionedLocation } from "@/nav/transitions";
import { initNotificationChannel } from "@/platform/notifications";

/**
 * Wrapper that reads the :accountID route param and forwards it to ProfileView.
 * Lives in App.tsx because the polymorphic profile route is a single route
 * shared between own and other-profile views (Unit 4 Phase 5).
 */
function ProfileRoute(): ReactElement {
  const { accountID } = useParams<{ accountID: string }>();
  if (!accountID) return <Navigate to="/" replace />;
  return <ProfileView accountID={accountID} />;
}

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

  // UI motion spec (2026-07-18): the route tables render displayedLocation,
  // which lags `location` by exactly one startViewTransition. Must be called
  // before the /pair and /invite early returns (hook order).
  const displayedLocation = useTransitionedLocation(location);

  // Android: create the notification channel once at startup (idempotent).
  // No-op on web and non-Android Tauri; never throws into startup.
  useEffect(() => {
    void initNotificationChannel();
  }, []);

  // Load me with enough depth for the inbox subscription to find contacts
  // and push arriving conversations to knownConversations.
  // profile: true is required so Inbox.load(me) can read me.profile.inbox.
  // knownConversations: true is required so the inbox callback can call
  // $jazz.push on the list (NotLoaded proxies don't have push).
  // Called unconditionally (hook rules) but the subscription itself is
  // guarded on me.$isLoaded so it's a no-op when not authenticated.
  // Keep this resolve shallow. The deeper graph the NotificationManager
  // needs (knownConversations messages, lastReadAt, settings.notifications) is
  // pulled inside NotificationManager itself via its own useAccount.
  // Lifting it here was observed to remount /auth/recovery after the
  // post-recovery auth-state flip — the RecoveryRoute's `stage` useState
  // would reset back to "enter-code" mid-flow.
  // incomingConnectionRequests is resolved here so the single app-level
  // connection-request inbox subscription (useIncomingConnectionRequestInbox)
  // can $jazz.set on the loaded record. profile: true is required so
  // Inbox.load(me) can read me.profile.inbox.
  const me = useAccount(ArcanAccount, {
    resolve: {
      profile: true,
      root: {
        // $onError: "catch" (Task 7 review, precedent use-home-lists.ts):
        // one unavailable contact child must not keep the whole app shell's
        // `me` unloaded — that would also unmount both inbox drains.
        contacts: { $each: { $onError: "catch" } },
        knownConversations: true,
        incomingConnectionRequests: true,
      },
    },
  });
  useConversationInboxSubscription(me);
  // Unit 9-0: drain the connection-request inbox into the durable
  // me.root.incomingConnectionRequests record exactly once, app-wide. The prompt + pending
  // route read from that record (via useIncomingConnectionRequests) and must NOT
  // each open their own destructive inbox subscription.
  useIncomingConnectionRequestInbox(me);

  // Contact-robustness slice: durable outgoing-request watcher (approval,
  // denial, expiry, failed-send retry). Owns the requester-side contact
  // write for BOTH channels — the /invite screen is now a pure view of this
  // hook's state. Uses its own deep useAccount internally (App resolve stays
  // shallow by convention).
  useOutgoingRequestWatcher();

  // Contact-robustness slice: re-send unacked conversation/member-add
  // notifications (durable pendingNotifications entries) on launch/reconnect.
  useNotificationRetry();

  // Allow /pair regardless of auth state — the responder starts unauthenticated
  if (location.pathname === "/pair") {
    return (
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <Routes>
              <Route path="/pair" element={<PairRoute />} />
            </Routes>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>
    );
  }

  // Allow /invite regardless of auth state — the component handles the auth check
  // internally (stashes fragment in sessionStorage and redirects to "/" if not authed).
  if (location.pathname === "/invite") {
    return (
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <Routes>
              <Route path="/invite" element={<InviteRoute />} />
            </Routes>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>
    );
  }

  // Render the route table inline so the JSX shape ({fragment} +
  // {NotificationManager?} + <Routes>) stays identical between the
  // unauthenticated and authenticated branches. React's reconciliation
  // matches sibling element types by position; if the unauthenticated
  // branch returned a bare <Routes> while the authenticated branch
  // returned <>{NotificationManager}{Routes}</>, React would treat the
  // post-recovery auth flip as a parent-type swap and remount the entire
  // route subtree — which would reset RecoveryRoute's stage-2 useState.
  let routeTable: ReactElement;
  if (!isAuthenticated) {
    // Routing inversion (Slice 7): the unauthenticated default is the
    // /auth/login route, not the onboarding flow. /onboarding remains
    // reachable via the "Create new account" link on the login screen.
    routeTable = (
      <Routes location={displayedLocation}>
        <Route path="/onboarding" element={<OnboardingRoute />} />
        <Route path="/auth/login" element={<LoginRoute />} />
        <Route path="/auth/recovery" element={<RecoveryRoute />} />
        {/* Renders displayedLocation — a transiently unmatched displayed path lands here; keep this redirect query-free (it would drop params). */}
        <Route path="*" element={<Navigate to="/auth/login" replace />} />
      </Routes>
    );
  } else {
    routeTable = (
      <Routes location={displayedLocation}>
        {/* Unit 9-2 / 2-F: the authenticated app screens live inside the
            AppShell layout route, which renders the persistent desktop
            sidebar + the routed pane via <Outlet />. Mobile hides the
            sidebar (shell uses md:flex) so content is full-screen and the
            bottom tab bar provides nav. */}
        <Route element={<AppShell />}>
          <Route path="/" element={<ConversationsRoute />} />
          <Route path="/conversations" element={<ConversationsRoute />} />
          <Route path="/conversations/new" element={<NewConversationRoute />} />
          <Route path="/conversations/:id" element={<ConversationDetailRoute />} />
          <Route path="/conversations/:id/members" element={<MembersRoute />} />
          <Route path="/settings/*" element={<SettingsRoute />} />
          {/*
            Unit 8d: deprecate the standalone /contacts list page in favor of
            the sidebar `contacts` tab. The list visually diverged from the
            tab (back-link + page title) and there was no spec justification
            for two separate surfaces. /contacts/add and /contacts/:contactID
            keep their dedicated routes — only the list page redirects.
          */}
          <Route path="/contacts" element={<Navigate to="/?tab=contacts" replace />} />
          <Route path="/contacts/add" element={<ContactAddRoute />} />
          <Route path="/contacts/scan" element={<ScanInviteRoute />} />
          <Route path="/contacts/:contactID" element={<ContactDetailRoute />} />
          <Route path="/profile/:accountID" element={<ProfileRoute />} />
          <Route path="/connections/pending" element={<PendingConnectionsRoute />} />
          <Route path="/connections/live-invites" element={<LiveInvitesRoute />} />
        </Route>
        {/* /auth/recovery stays OUTSIDE the AppShell — it's an auth-flow
            stage (post-24-word-code "set a fresh password"), not an app
            screen, so it renders chromeless (no sidebar). Reachable while
            authenticated; navigates to "/" on completion or skip. */}
        <Route path="/auth/recovery" element={<RecoveryRoute />} />
        {/* Renders displayedLocation — a transiently unmatched displayed path lands here; keep this redirect query-free (it would drop params). */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Mount the NotificationManager only when authenticated AND not in the
  // post-recovery /auth/recovery stage-2 flow. RecoveryRoute holds its
  // current stage in local useState; mounting NotificationManager's own
  // useAccount with a deep resolve at the same time as the
  // useIsAuthenticated flip causes the entire route subtree to remount,
  // resetting that state back to Stage 1.
  const showNotificationManager =
    isAuthenticated && location.pathname !== "/auth/recovery";

  return (
    <ThemeProvider>
      <AccentProvider>
        <ToastProvider>
          <ConfirmProvider>
            <SidebarTabProvider>
              {/* Unit 7: sync persisted appearance settings (theme + accent) into
                  ThemeProvider + AccentProvider on sign-in. Authenticated only —
                  SettingsSync depends on a logged-in Jazz account. */}
              {isAuthenticated && <SettingsSync />}
              {/* Slice 8: in-app notification manager — drives tab title badge,
                  sound, and browser-notification fanout. Reads `me` via its own
                  useAccount call so App.tsx's resolve stays shallow. */}
              {showNotificationManager && <NotificationManager />}
              {/* Task 12: App Link routing + cross-instance switch prompt.
                  Mounts unconditionally — self-gates on isTauri(); unauthenticated
                  arrivals must work so the invite/pair flow can start from a cold tap. */}
              <DeepLinkBridge />
              {/* Unit 2: app-wide trusted-device approval prompt. Fixed overlay;
                  only renders when a pending pairing is detected. Authenticated only. */}
              {isAuthenticated && <TrustedDevicePrompt />}
              {/* Unit 1 Phase 11: QR channel — surface an immediate modal when
                  an in-person ConnectionRequest arrives (channel="qr"). Other
                  channels land silently on the Pending Connections list. */}
              {isAuthenticated && <IncomingConnectionPrompt />}
              {routeTable}
              {/* Unit 10: the kit PTabBar lives in AppShell's MobileShell
                  tabBar slot (legacy MobileTabBar deleted in Phase 4). */}
            </SidebarTabProvider>
          </ConfirmProvider>
        </ToastProvider>
      </AccentProvider>
    </ThemeProvider>
  );
}

export default App;
