import { Sidebar } from "@/components/sidebar";
import { EmptyState } from "@/components/empty-state";

/**
 * HomeRoute: two-column layout with sidebar on the left and main content area
 * on the right.
 *
 * Navigation strategy: Option A (state machine). Receives an
 * `onNavigateToSettings` callback from App.tsx; passes it into Sidebar.
 */
interface HomeRouteProps {
  onNavigateToSettings: () => void;
}

export function HomeRoute({ onNavigateToSettings }: HomeRouteProps) {
  return (
    <div className="flex h-screen">
      <Sidebar onNavigateToSettings={onNavigateToSettings} />

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
