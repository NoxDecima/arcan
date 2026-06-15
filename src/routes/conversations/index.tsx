import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Sidebar } from "@/components/sidebar";
import { EmptyPane } from "@/components/empty-pane";
import { useSidebarTab } from "@/components/sidebar-tab";

/**
 * The desktop reading-pane shown at `/` when no conversation is selected.
 * Renders the sidebar + the cosmic EmptyPane (oversized Lattice watermark,
 * scattered cosmic dots, centered hint). Hidden on mobile — mobile shows
 * the conversation list full-width with the bottom tab bar.
 *
 * Unit 8d: also handles the `?tab=contacts` query param that the deprecated
 * standalone /contacts route redirects to. We seed the SidebarTab context
 * on mount and then strip the query param so the URL stays clean and the
 * back-button doesn't loop the user into a redirect cycle.
 *
 * Audit rows closed: AUDIT-007, AUDIT-008.
 */
export function ConversationsRoute() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setTab } = useSidebarTab();

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

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="hidden md:flex flex-1" data-testid="home-main">
        <div data-testid="conversations-main" className="h-full w-full">
          <EmptyPane
            variant="reading-pane"
            title="select a conversation"
            description="or start a new one — end-to-end encrypted"
          />
        </div>
      </main>
    </div>
  );
}
