import { test, expect, vi, describe } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { SidebarTabProvider } from "@/components/sidebar-tab";
import { AppShell } from "@/components/app-shell";

// useIsDesktop → false for all tests in this file (mobile branch).
// Desktop NavColumn integration is covered by the parity suite (nav-column cell).
vi.mock("@/components/use-is-desktop", () => ({
  useIsDesktop: () => false,
}));
// useHomeLists: stub so AppShell renders without a real Jazz context.
vi.mock("@/components/use-home-lists", () => ({
  useHomeLists: () => ({
    loading: false,
    profile: { name: "decima", initials: "d" },
    accountId: "co_me",
    convos: [],
    contacts: [],
  }),
}));
vi.mock("@/components/pending-requests-section", () => ({
  PendingRequestsSection: () => null,
}));
vi.mock("@/jazz/use-incoming-connection-requests", () => ({
  useIncomingConnectionRequests: () => [],
}));

function renderShell(path = "/x") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarTabProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/x" element={<div>child</div>} />
            <Route path="/" element={<div>home</div>} />
            <Route path="/conversations" element={<div>convos</div>} />
          </Route>
        </Routes>
      </SidebarTabProvider>
    </MemoryRouter>,
  );
}

describe("AppShell (mobile branch — useIsDesktop = false)", () => {
  test("renders outlet content", () => {
    const { getByText } = renderShell("/x");
    expect(getByText("child")).toBeTruthy();
  });

  test("shows the kit PTabBar (chats + contacts) on the root path '/'", () => {
    const { container } = renderShell("/");
    expect(container.textContent).toContain("chats");
    expect(container.textContent).toContain("contacts");
  });

  test("hides the PTabBar on non-root paths — no h-[54px] tab-bar div", () => {
    const { container } = renderShell("/x");
    // PTabBar renders a div with h-[54px]; it must be absent at non-root paths.
    expect(container.querySelector('[class*="h-\\[54px\\]"]')).toBeNull();
  });
});
