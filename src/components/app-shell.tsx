import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useIsDesktop } from "@/components/use-is-desktop";
import { useHomeLists } from "@/components/use-home-lists";
import { useSidebarTab } from "@/components/sidebar-tab";
import { MobileShell, PTabBar } from "@/ui/kit";
import { NavColumn } from "@/ui/screens";
import { PendingRequestsSection } from "@/components/pending-requests-section";
import { NavListSkeleton } from "@/components/skeleton";

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
 * The file stays on disk until Phase 4.
 */
export function AppShell() {
  const isDesktop = useIsDesktop();
  // Called unconditionally (hook rules). Desktop NavColumn consumes it;
  // mobile ConversationsRoute calls its own separate useHomeLists instance.
  const shell = useHomeLists();
  const { tab, setTab } = useSidebarTab();
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
            />
          )}
        {/* Routed pane — Outlet fills this flex column. */}
        <div className="flex-1 min-w-0 relative flex flex-col bg-bg">
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
            />
          ) : undefined
        }
      >
        <Outlet />
      </MobileShell>
    </div>
  );
}
