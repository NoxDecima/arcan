import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarTabProvider } from "@/components/sidebar-tab";

// We import the Sidebar lazily inside the test so the file's top-level
// jazz-tools side effects don't trip vitest's environment setup. The
// SidebarSeparationMarker assertion below is structural: we look for the
// `[data-testid="sidebar-tabs"]` container and check its className for
// the chosen divider treatment (option A — `border-b border-hairline`).
//
// Mock useAccount so the component renders without a real Jazz context.
vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "Test", avatar: null },
    root: {
      contactBook: [],
      knownConversations: [],
      lastReadAt: {},
    },
    $jazz: { id: "co_test" },
  }),
}));

describe("Sidebar separation (Option A · hairline under tabs)", () => {
  it("the tab row container carries `border-b border-hairline`", async () => {
    const { Sidebar } = await import("@/components/sidebar");
    const { getByTestId } = render(
      <MemoryRouter>
        <SidebarTabProvider>
          <Sidebar />
        </SidebarTabProvider>
      </MemoryRouter>,
    );

    const tabRow = getByTestId("sidebar-tabs");
    const cls = tabRow.className;
    expect(cls).toMatch(/\bborder-b\b/);
    expect(cls).toMatch(/\bborder-hairline\b/);
  });

  it("does NOT carry a section-label header (rules out options B / C)", async () => {
    const { Sidebar } = await import("@/components/sidebar");
    const { queryByText } = render(
      <MemoryRouter>
        <SidebarTabProvider>
          <Sidebar />
        </SidebarTabProvider>
      </MemoryRouter>,
    );

    // Design's options B and C render a `recent` (or `// recent`) label
    // between the tab row and the list. Option A omits it.
    expect(queryByText(/^\s*(\/\/\s*)?recent\s*$/i)).toBeNull();
  });
});
