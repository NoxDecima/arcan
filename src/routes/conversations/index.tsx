import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSidebarTab } from "@/components/sidebar-tab";
import { useIsDesktop } from "@/components/use-is-desktop";
import { useHomeLists } from "@/components/use-home-lists";
import { ChatsScreen, ContactsScreen } from "@/ui/screens";
import { DesktopEmpty } from "@/ui/kit";
import { PendingRequestsSection } from "@/components/pending-requests-section";
import { NavListSkeleton } from "@/components/skeleton";

/**
 * The home screen at `/` and `/conversations`.
 *
 * Desktop (≥ 768px): AppShell's NavColumn provides the list; this route
 * renders the kit DesktopEmpty reading-pane (watermark + tagline) inside
 * the outlet pane. testid `home-main` stays on the wrapper so existing e2e
 * selectors keep resolving (Phase 4 retargets them).
 *
 * Mobile (< 768px): renders ChatsScreen or ContactsScreen (kit presenters)
 * fed by useHomeLists() data. The kit PTabBar is provided by AppShell's
 * MobileShell tabBar slot — not mounted here.
 * testScope="mobile" namespaces the presenter testids to avoid Playwright
 * strict-mode collisions with the desktop NavColumn testids until Phase 4.
 *
 * Unit 8d / ?tab= seeding: kept exactly as-is — seeds SidebarTab on mount
 * and strips the query param so the back-button doesn't loop.
 *
 * Audit rows closed: AUDIT-007, AUDIT-008.
 */
export function ConversationsRoute() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { tab, setTab } = useSidebarTab();
  const isDesktop = useIsDesktop();
  // Called unconditionally (hook rules) — data consumed only in mobile branch.
  // Desktop branch uses DesktopEmpty; the NavColumn data comes from AppShell's
  // own useHomeLists instance (two subscriptions on mobile at "/", accepted).
  const { loading, profile, convos, contacts, accountId } = useHomeLists();

  useEffect(() => {
    const requested = searchParams.get("tab");
    if (requested === "contacts" || requested === "chats") {
      setTab(requested);
      // Strip ?tab=… from the URL — `replace` so back-nav skips this entry.
      navigate("/", { replace: true });
    }
    // We intentionally only react to the first mount: subsequent in-app tab
    // switches go through setTab directly, not through the query param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Desktop: NavColumn (in AppShell) shows the list; this pane renders the
  // empty reading state.
  if (isDesktop) {
    return (
      <div className="flex-1 flex" data-testid="home-main">
        <DesktopEmpty tab={tab} />
      </div>
    );
  }

  // Mobile loading state — skeleton while Jazz resolves.
  // testid "mobile-sidebar-loading" mirrors the tid("sidebar-loading") pattern
  // (testScope="mobile") from the legacy Sidebar loading shell.
  if (loading) {
    return (
      <div data-testid="mobile-sidebar-loading">
        <NavListSkeleton />
      </div>
    );
  }

  // Mobile: full-screen kit presenter. testScope="mobile" keeps legacy testids
  // namespaced so existing e2e selectors resolve until Phase 4 retarget.
  if (tab === "chats") {
    return (
      <ChatsScreen
        testScope="mobile"
        profile={profile}
        convos={convos}
        onOpenConvo={(id) => navigate(`/conversations/${id}`)}
        onOwnProfile={() => accountId && navigate(`/profile/${accountId}`)}
        onSettings={() => navigate("/settings")}
        onNewConvo={() => navigate("/conversations/new")}
      />
    );
  }

  return (
    <ContactsScreen
      testScope="mobile"
      profile={profile}
      contacts={contacts}
      onOpenContact={(id) => navigate(`/profile/${id}`)}
      onOwnProfile={() => accountId && navigate(`/profile/${accountId}`)}
      onSettings={() => navigate("/settings")}
      onAddContact={() => navigate("/contacts/add")}
      pendingSlot={<PendingRequestsSection />}
    />
  );
}
