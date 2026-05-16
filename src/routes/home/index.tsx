import { Sidebar } from "@/components/sidebar";
import { EmptyState } from "@/components/empty-state";

/**
 * HomeRoute: two-column layout with sidebar on the left and main content area
 * on the right.
 *
 * Navigation strategy: react-router-dom. No callback props — Sidebar uses
 * <Link to="/settings"> internally.
 */
export function HomeRoute() {
  return (
    <div className="flex h-screen">
      <Sidebar />

      <main
        data-testid="home-main"
        className="flex-1 flex flex-col bg-gray-50"
      >
        <EmptyState
          title="No conversations yet"
          description="Send an invite link to a friend to start your first conversation."
        />
      </main>
    </div>
  );
}
