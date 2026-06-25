import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarTabProvider } from "@/components/sidebar-tab";

// Mock useAccount so Sidebar renders without a real Jazz context.
vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "decima", avatar: null },
    root: {
      contactBook: [],
      knownConversations: [],
      lastReadAt: {},
    },
    $jazz: { id: "co_me" },
  }),
}));

async function renderSidebar() {
  const { Sidebar } = await import("@/components/sidebar");
  return render(
    <MemoryRouter>
      <SidebarTabProvider>
        <Sidebar />
      </SidebarTabProvider>
    </MemoryRouter>,
  );
}

describe("Sidebar IA — header chrome (items 2-B, 2-C)", () => {
  it("does NOT render the Lattice brand mark in the header", async () => {
    const { getByTestId } = await renderSidebar();
    // Item 2-B removes the brand mark from the *header chrome*. The mark
    // still lives in the empty-pane watermark (a separate brand surface),
    // so scope the assertion to the header — the block that holds the
    // profile button + the settings gear. Lattice renders an
    // <svg role="img" aria-label="Arcan">.
    const header = getByTestId("sidebar-header-profile").parentElement!;
    expect(header.querySelector('svg[aria-label="Arcan"]')).toBeNull();
    // Sanity: the gear lives in this same header block.
    expect(
      header.querySelector('[data-testid="sidebar-settings-gear"]'),
    ).not.toBeNull();
  });

  it("does NOT render a header '+' new-chat button", async () => {
    const { queryByTestId } = await renderSidebar();
    expect(queryByTestId("new-chat-btn")).toBeNull();
  });

  it("renders a gear settings link pointing to /settings", async () => {
    const { getByTestId } = await renderSidebar();
    const gear = getByTestId("sidebar-settings-gear");
    expect(gear.getAttribute("href")).toBe("/settings");
    expect(gear.querySelector('svg[data-icon="gear"]')).not.toBeNull();
  });

  it("still renders the avatar + display name", async () => {
    const { getByTestId } = await renderSidebar();
    expect(getByTestId("sidebar-avatar")).not.toBeNull();
    expect(getByTestId("sidebar-display-name").textContent).toBe("decima");
  });
});
