import { Sidebar } from "@/components/sidebar";
import { EmptyPane } from "@/components/empty-pane";

/**
 * The desktop reading-pane shown at `/` when no conversation is selected.
 * Renders the sidebar + the cosmic EmptyPane (oversized Lattice watermark,
 * scattered cosmic dots, centered hint). Hidden on mobile — mobile shows
 * the conversation list full-width with the bottom tab bar.
 *
 * Audit rows closed: AUDIT-007, AUDIT-008.
 */
export function ConversationsRoute() {
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
