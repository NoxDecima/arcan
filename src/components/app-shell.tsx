import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/sidebar";

/**
 * Authenticated layout shell. Desktop: persistent sidebar + routed pane
 * (the design's HiDesktop = NavColumn + pane, always both). Mobile: the
 * sidebar is hidden (md:flex) so the routed content is full-screen, and
 * the bottom tab bar (mounted in App.tsx) provides nav.
 *
 * Replaces the prior per-route `<Sidebar />` mounts (Unit 9-2 / 2-F).
 */
export function AppShell() {
  return (
    <div className="flex h-screen">
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </div>
    </div>
  );
}
