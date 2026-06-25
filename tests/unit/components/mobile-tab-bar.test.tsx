import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { SidebarTabProvider } from "@/components/sidebar-tab";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarTabProvider>
        <MobileTabBar />
      </SidebarTabProvider>
    </MemoryRouter>,
  );
}

describe("MobileTabBar", () => {
  it("renders on the root path", () => {
    const { queryByTestId } = renderAt("/");
    expect(queryByTestId("mobile-tab-bar")).not.toBeNull();
  });

  it("renders on /conversations", () => {
    const { queryByTestId } = renderAt("/conversations");
    expect(queryByTestId("mobile-tab-bar")).not.toBeNull();
  });

  it("returns null on chat-detail routes (full-screen view on mobile)", () => {
    const { queryByTestId } = renderAt("/conversations/abc123");
    expect(queryByTestId("mobile-tab-bar")).toBeNull();
  });

  it("returns null on /settings", () => {
    const { queryByTestId } = renderAt("/settings");
    expect(queryByTestId("mobile-tab-bar")).toBeNull();
  });

  it("carries safe-area-inset-bottom padding via inline style", () => {
    const { getByTestId } = renderAt("/");
    const bar = getByTestId("mobile-tab-bar");
    // jsdom's CSSOM rejects unknown env() values from the parsed style map,
    // so we read the raw `style` attribute as serialized by React. This
    // pins the inline declaration without relying on CSSOM env() support.
    const styleAttr = bar.getAttribute("style") ?? "";
    expect(styleAttr).toMatch(
      /padding-bottom:\s*calc\(env\(safe-area-inset-bottom\)\)/,
    );
    expect(styleAttr).toMatch(
      /height:\s*calc\(56px \+ env\(safe-area-inset-bottom\)\)/,
    );
  });

  it("renders a leading chat icon on the chats tab", () => {
    const { getByTestId } = renderAt("/");
    expect(
      getByTestId("mobile-tab-chats").querySelector('svg[data-icon="chat"]'),
    ).not.toBeNull();
  });

  it("renders a leading people icon on the contacts tab", () => {
    const { getByTestId } = renderAt("/");
    expect(
      getByTestId("mobile-tab-contacts").querySelector(
        'svg[data-icon="people"]',
      ),
    ).not.toBeNull();
  });
});
