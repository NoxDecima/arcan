import { Sidebar } from "@/components/sidebar";
import { EmptyState } from "@/components/empty-state";

/**
 * The "select a conversation" view shown at /conversations when no specific
 * conversation is selected. Renders the sidebar + an empty main area.
 */
export function ConversationsRoute() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1" data-testid="conversations-main">
        <EmptyState
          title="Select a conversation"
          description="Choose a conversation from the sidebar, or start a new one with the + button."
        />
      </main>
    </div>
  );
}
