import { useLocation } from "react-router-dom";
import { useSidebarTab } from "@/components/sidebar-tab";

/**
 * MobileTabBar: fixed bottom tab bar visible only on the small-screen layout
 * AND only on the root screens (sidebar is the primary surface there).
 *
 * Hidden on non-root paths so deep routes (e.g. /conversations/:id) keep the
 * full vertical real estate — `/conversations/:id` is a full-screen view on
 * mobile per the Unit 8 design. Shares tab state with the desktop Sidebar
 * via the SidebarTab context.
 *
 * Safe-area: the bar sits above iOS's home indicator via
 * `env(safe-area-inset-bottom)`. The tappable region stays at 56px; the
 * inset is added *below* it. Requires `viewport-fit=cover` in index.html.
 */
const ROOT_PATHS = ["/", "/conversations"];

export function MobileTabBar() {
  const { pathname } = useLocation();
  const { tab, setTab } = useSidebarTab();
  if (!ROOT_PATHS.includes(pathname)) return null;
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 flex border-t border-hairline bg-rail"
      data-testid="mobile-tab-bar"
      style={{
        // Tappable area stays 56px; safe-area padding sits *below* the
        // tappable region so the bar floats above iOS's home indicator
        // without shrinking the hit targets.
        height: `calc(56px + env(safe-area-inset-bottom))`,
        // Wrapped in calc() so jsdom's CSSOM accepts it during unit tests;
        // semantically identical to `env(safe-area-inset-bottom)`.
        paddingBottom: "calc(env(safe-area-inset-bottom))",
      }}
    >
      <button
        type="button"
        data-testid="mobile-tab-chats"
        className={`flex-1 flex flex-col items-center justify-center gap-1 text-xs ${
          tab === "chats" ? "text-arcan-accent font-semibold" : "text-dim"
        }`}
        onClick={() => setTab("chats")}
      >
        chats
      </button>
      <button
        type="button"
        data-testid="mobile-tab-contacts"
        className={`flex-1 flex flex-col items-center justify-center gap-1 text-xs ${
          tab === "contacts" ? "text-arcan-accent font-semibold" : "text-dim"
        }`}
        onClick={() => setTab("contacts")}
      >
        contacts
      </button>
    </nav>
  );
}
