import { useEffect } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useIsDesktop } from "@/components/use-is-desktop";
import { useHomeLists } from "@/components/use-home-lists";
import { useSidebarTab } from "@/components/sidebar-tab";
import { MobileShell, PTabBar } from "@/ui/kit";
import { NavColumn } from "@/ui/screens";
import { PendingRequestsSection } from "@/components/pending-requests-section";
import { NavListSkeleton } from "@/components/skeleton";
import { useIncomingConnectionRequests } from "@/jazz/use-incoming-connection-requests";

/**
 * Authenticated layout shell — Unit 10 Wave A.
 *
 * Desktop (≥ 768px, Tailwind `md`):
 *   full-viewport split: NavColumn fed by useHomeLists() on the left and the
 *   routed pane (Outlet) on the right. USER DECISION (2026-07-05 walkthrough):
 *   the prototype's window-on-stage presentation (bg-bg-stage + DesktopWindow
 *   with fake OS chrome) was rejected — the window CONTENT fills the screen.
 *   DesktopWindow stays in the kit (parity-gated) but is not mounted here.
 *   Recorded in the coverage manifest as a user-directed deviation.
 *
 * Mobile (< 768px):
 *   full-screen MobileShell; kit PTabBar appears as the tabBar slot on root
 *   paths ("/", "/conversations"), hidden on deep routes. The routed pane
 *   (ConversationsRoute, ConversationDetailRoute, etc.) fills the screen.
 *
 * CRITICAL — single <Outlet />:
 *   Exactly one <Outlet /> is rendered at any time. A CSS dual-mount of both
 *   branches would mount every route twice, doubling Jazz subscriptions and
 *   effects such as mark-as-read. useIsDesktop() switches branches in JS:
 *   crossing 768px unmounts one branch and mounts the other (one-time cost,
 *   acceptable). See: src/components/use-is-desktop.ts
 *
 * MobileTabBar (src/components/mobile-tab-bar.tsx) is no longer mounted in
 * App.tsx — PTabBar from the kit replaces it on this mobile shell.
 *
 */
export function AppShell() {
  const isDesktop = useIsDesktop();
  // Called unconditionally (hook rules). Desktop NavColumn consumes it;
  // mobile ConversationsRoute calls its own separate useHomeLists instance.
  const shell = useHomeLists();
  const { tab, setTab } = useSidebarTab();
  const pendingCount = useIncomingConnectionRequests().length;
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // React Router 6 merges child-route params into layout-route elements.
  // useParams() sees :id from /conversations/:id and /conversations/:id/members.
  // /conversations/new matches the static route (not :id) → id is undefined,
  // so activeConvoId is correctly undefined (no false active highlight).
  const { id } = useParams<{ id: string }>();
  const activeConvoId = id;

  // isRoot mirrors mobile-tab-bar.tsx's ROOT_PATHS: show tab bar only on the
  // home/list surfaces, not on deep routes (conversation detail, settings, etc.).
  const isRoot = pathname === "/" || pathname === "/conversations";

  // Toast width on desktop (user decision, 2026-07-05 walkthrough): offset
  // the toast viewport by NavColumn's width (320px) so toasts don't underlap
  // the nav. Coupled to NavColumn's w-[320px] — update both if that changes.
  // Auth screens (no AppShell) keep --arcan-toast-left at its default 0px.
  useEffect(() => {
    if (!isDesktop) return;
    document.documentElement.style.setProperty("--arcan-toast-left", "320px");
    return () => {
      document.documentElement.style.removeProperty("--arcan-toast-left");
    };
  }, [isDesktop]);

  if (isDesktop) {
    return (
      <div className="h-screen w-screen flex bg-bg overflow-hidden">
          {/* NavColumn — or loading skeleton while Jazz resolves (sidebar-loading
              testid carried from legacy Sidebar loading state). */}
          {shell.loading ? (
            <div
              className="w-[320px] shrink-0 border-r border-hairline bg-bg flex flex-col"
              data-testid="sidebar-loading"
            >
              <NavListSkeleton rows={6} />
            </div>
          ) : (
            <NavColumn
              profile={shell.profile}
              tab={tab}
              onTab={setTab}
              convos={shell.convos}
              contacts={shell.contacts}
              activeConvoId={activeConvoId}
              onOpenConvo={(id) => navigate(`/conversations/${id}`)}
              onOpenContact={(id) => navigate(`/profile/${id}`)}
              onOwnProfile={() =>
                shell.accountId && navigate(`/profile/${shell.accountId}`)
              }
              onSettings={() => navigate("/settings")}
              onFab={() =>
                navigate(
                  tab === "contacts" ? "/contacts/add" : "/conversations/new",
                )
              }
              pendingSlot={
                tab === "contacts" ? <PendingRequestsSection /> : undefined
              }
              contactsBadge={pendingCount}
            />
          )}
        {/* Routed pane — Outlet fills this flex column. [view-transition-name]
            scopes screen slides to this pane; the NavColumn stays put. */}
        <div className="flex-1 min-w-0 relative flex flex-col bg-bg [view-transition-name:arcan-pane]">
          <Outlet />
        </div>
      </div>
    );
  }

  // Mobile branch — PTabBar is the kit replacement for the legacy MobileTabBar.
  return (
    <div className="h-screen w-screen flex flex-col">
      <MobileShell
        tabBar={
          isRoot ? (
            <PTabBar
              active={tab}
              onTab={(t) => {
                setTab(t);
                navigate("/");
              }}
              contactsBadge={pendingCount}
            />
          ) : undefined
        }
      >
        {/* [view-transition-name] scopes screen slides to the routed pane;
            the tab bar below stays put. */}
        <div className="flex-1 min-h-0 relative flex flex-col [view-transition-name:arcan-pane]">
          <Outlet />
        </div>
      </MobileShell>
    </div>
  );
}
