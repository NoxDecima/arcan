import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Sidebar } from "@/components/sidebar";
import { EmptyState } from "@/components/empty-state";
import { useSidebarTab } from "@/components/sidebar-tab";

/**
 * The "select a conversation" view shown at /conversations when no specific
 * conversation is selected. Renders the sidebar + an empty main area.
 *
 * Unit 8d: also handles the `?tab=contacts` query param that the deprecated
 * standalone /contacts route redirects to. We seed the SidebarTab context
 * on mount and then strip the query param so the URL stays clean and the
 * back-button doesn't loop the user into a redirect cycle.
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
          <EmptyState
            title="Select a conversation"
            description="Choose a conversation from the sidebar, or start a new one with the + button."
          />
        </div>
      </main>
    </div>
  );
}
