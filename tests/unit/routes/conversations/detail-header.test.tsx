import { describe, test, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// jsdom doesn't implement scrollIntoView; the route's auto-scroll effect calls
// it on mount. Stub it so the component can render under test.
Element.prototype.scrollIntoView = vi.fn();

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
}));
vi.mock("@/jazz/conversation", () => ({
  isArchived: () => false,
  ensureMyWriteGroup: vi.fn(),
}));

import { ConversationDetailRoute } from "@/routes/conversations/detail";

describe("ConversationDetailRoute header", () => {
  beforeEach(() => vi.clearAllMocks());

  function renderRoute() {
    return render(
      <MemoryRouter initialEntries={["/conversations/co_zConv"]}>
        <ConversationDetailRoute />
      </MemoryRouter>,
    );
  }

  test("header row is a single link to the members route", () => {
    const { getByTestId } = renderRoute();
    const headerLink = getByTestId("conversation-header-link");
    expect(headerLink.getAttribute("href")).toBe(
      "/conversations/co_zConv/members",
    );
  });

  test("no standalone Members button remains", () => {
    const { queryByTestId } = renderRoute();
    expect(queryByTestId("members-link")).toBeNull();
  });

  test("renders a mobile-only back arrow link to /conversations", () => {
    const { getByTestId } = renderRoute();
    const back = getByTestId("chat-back-arrow");
    expect(back.getAttribute("href")).toBe("/conversations");
    // mobile-only: hidden on md+ screens
    expect(back.className).toContain("md:hidden");
  });
});
