import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Sidebar tab state shared between the desktop Sidebar and the mobile bottom
 * tab bar. Per Unit 4 Phase 4: lifted to a Context so both surfaces stay in
 * sync without threading props through every route that mounts the Sidebar.
 *
 * Per-session, not persisted — the hi-fi design doesn't require restoring
 * the last tab across reloads.
 */
export type SidebarTab = "chats" | "contacts";

interface SidebarTabContextValue {
  tab: SidebarTab;
  setTab: (t: SidebarTab) => void;
}

const SidebarTabContext = createContext<SidebarTabContextValue | null>(null);

export function SidebarTabProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<SidebarTab>("chats");
  return (
    <SidebarTabContext.Provider value={{ tab, setTab }}>
      {children}
    </SidebarTabContext.Provider>
  );
}

export function useSidebarTab(): SidebarTabContextValue {
  const ctx = useContext(SidebarTabContext);
  if (!ctx) {
    throw new Error("useSidebarTab must be used inside <SidebarTabProvider>");
  }
  return ctx;
}
