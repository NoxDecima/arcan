import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// jsdom doesn't implement scrollIntoView; the route's auto-scroll effect calls
// it on mount. Stub it so the component can render under test.
Element.prototype.scrollIntoView = vi.fn();

// useIsDesktop → false (mobile) so the back button is rendered.
vi.mock("@/components/use-is-desktop", () => ({
  useIsDesktop: () => false,
}));

// Mock Jazz so the route renders without a real node.
const GROUP = {
  getDirectMembers: () => [
    { account: { $jazz: { id: "co_zMe" } }, role: "admin" },
    { account: { $jazz: { id: "co_zBob" } }, role: "admin" },
  ],
  getRoleOf: () => "admin",
};
const CONVERSATION = {
  $isLoaded: true,
  $jazz: { id: "co_zConv", owner: GROUP },
  title: "retrieval-squad",
  messages: [],
  systemEvents: [],
  icon: undefined,
};

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    $jazz: { id: "co_zMe" },
    profile: { displayName: "decima" },
    root: { contactBook: [], knownConversations: [], lastReadAt: {} },
  }),
  useCoState: () => CONVERSATION,
  // ConnectionBanner (rendered by the route) reads sync status; treat as online.
  useSyncConnectionStatus: () => true,
}));
vi.mock("@/jazz/avatarResolver", () => ({
  resolveAvatarFileBlob: () => undefined,
  useRemoteAvatar: () => undefined,
}));
vi.mock("@/jazz/messages", () => ({
  sendMessage: vi.fn(),
  getAuthorAccountIDFromMessage: () => null,
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
}));
vi.mock("@/jazz/conversation", () => ({
  isArchived: () => false,
  ensureMyWriteGroup: vi.fn(),
}));
vi.mock("@/jazz/displayName", () => ({ resolveDisplayName: () => "bob" }));

// Capture navigate calls; MemoryRouter provides a real navigate but we
// spy on useNavigate to assert the header-link target.
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

import { ConversationDetailRoute } from "@/routes/conversations/detail";

describe("ConversationDetailRoute header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  function renderRoute() {
    return render(
      <MemoryRouter initialEntries={["/conversations/co_zConv"]}>
        <ConversationDetailRoute />
      </MemoryRouter>,
    );
  }

  test("header link navigates to the members route on click", () => {
    const { getByTestId } = renderRoute();
    const headerLink = getByTestId("conversation-header-link");
    // The link is now a <button> rendered by PHeader (not an <a>).
    expect(headerLink.tagName.toLowerCase()).toBe("button");
    fireEvent.click(headerLink);
    expect(mockNavigate).toHaveBeenCalledWith(
      "/conversations/co_zConv/members",
    );
  });

  test("no standalone Members button remains", () => {
    const { queryByTestId } = renderRoute();
    expect(queryByTestId("members-link")).toBeNull();
  });

  test("renders a mobile-only back button (mobile branch: useIsDesktop = false)", () => {
    const { getByTestId } = renderRoute();
    // chat-back-arrow is present because useIsDesktop is mocked to false.
    const back = getByTestId("chat-back-arrow");
    expect(back.tagName.toLowerCase()).toBe("button");
    // Clicking the back button should navigate to /conversations.
    fireEvent.click(back);
    expect(mockNavigate).toHaveBeenCalledWith("/conversations");
  });
});
