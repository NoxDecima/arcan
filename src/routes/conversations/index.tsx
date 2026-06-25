import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Sidebar } from "@/components/sidebar";
import { EmptyPane } from "@/components/empty-pane";
import { useSidebarTab } from "@/components/sidebar-tab";

/**
 * The home screen at `/`.
 *
 * Desktop: <AppShell> provides the persistent sidebar; this route renders
 * only the cosmic EmptyPane reading-pane (oversized Lattice watermark,
 * scattered cosmic dots, centered hint) in the outlet column.
 *
 * Mobile: the shell hides its sidebar (it's `hidden md:flex`), so the
 * full-screen conversation/contacts list lives here as a mobile-only
 * <Sidebar /> (`md:hidden`). The bottom tab bar (App.tsx) toggles the
 * shared chats/contacts tab. This is the same list that backs the desktop
 * sidebar — the mobile home screen would be blank without it (Unit 9-2).
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
  const { tab, setTab } = useSidebarTab();

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

  const isContacts = tab === "contacts";
  const title = isContacts ? "select a contact" : "select a conversation";
  const description = isContacts
    ? "or add a new one — end-to-end encrypted"
    : "or start a new one — end-to-end encrypted";

  return (
    <>
      {/* Mobile: the full-screen list (shell's sidebar is hidden on mobile). */}
      <div className="md:hidden flex-1 min-h-0">
        <Sidebar />
      </div>
      {/* Desktop: the empty reading-pane beside the shell's sidebar. */}
      <main className="hidden md:flex flex-1" data-testid="home-main">
        <div data-testid="conversations-main" className="h-full w-full">
          <EmptyPane
            variant="reading-pane"
            title={title}
            description={description}
          />
        </div>
      </main>
    </>
  );
}
