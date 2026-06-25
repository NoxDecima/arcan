import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const navigateSpy = vi.fn();

// A reusable mock factory so each test can swap the group's members.
let directMembers: Array<{ account: { $jazz: { id: string } }; role: string; id: string }> = [];

const GROUP = {
  getDirectMembers: () => directMembers,
  getRoleOf: (id: string) => directMembers.find((m) => m.account.$jazz.id === id)?.role,
};
const CONVERSATION = {
  $isLoaded: true,
  $jazz: { id: "co_zConv", owner: GROUP },
  title: "retrieval-squad",
  messages: [],
  icon: undefined,
};

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    $jazz: { id: "co_zMe" },
    profile: { displayName: "decima" },
    root: { contactBook: [], knownConversations: [] },
  }),
  useCoState: () => CONVERSATION,
}));
vi.mock("@/jazz/avatarResolver", () => ({
  resolveAvatarFileBlob: () => undefined,
  useRemoteAvatar: () => undefined,
}));
vi.mock("@/jazz/displayName", () => ({ resolveDisplayName: () => "bob" }));
vi.mock("@/jazz/conversation", () => ({
  isArchived: () => false,
  addMemberToConversation: vi.fn(),
  removeMemberFromConversation: vi.fn(),
  promoteToAdmin: vi.fn(),
  leaveConversation: vi.fn(),
  isLastAdmin: () => false,
  updateConversationTitle: vi.fn(),
  requestConnectionFromGroupMember: vi.fn(),
}));
vi.mock("@/jazz/avatar", () => ({ setConversationIcon: vi.fn() }));
vi.mock("@/components/toast", () => ({ useToast: () => vi.fn() }));

import { MembersRoute } from "@/routes/conversations/members";

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/conversations/co_zConv/members"]}>
      <Routes>
        <Route path="/conversations/:id/members" element={<MembersRoute />} />
        <Route
          path="/profile/:accountID"
          element={<div data-testid="profile-stub" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MembersRoute 1:1 redirect", () => {
  beforeEach(() => {
    navigateSpy.mockClear();
  });

  test("a 2-person DM redirects to the other user's profile", () => {
    directMembers = [
      { account: { $jazz: { id: "co_zMe" } }, role: "admin", id: "co_zMe" },
      { account: { $jazz: { id: "co_zBob" } }, role: "admin", id: "co_zBob" },
    ];
    const { getByTestId, queryByTestId } = renderAt();
    expect(getByTestId("profile-stub")).toBeTruthy();
    expect(queryByTestId("members-route")).toBeNull();
  });

  test("a 3-person group renders the settings screen (no redirect)", () => {
    directMembers = [
      { account: { $jazz: { id: "co_zMe" } }, role: "admin", id: "co_zMe" },
      { account: { $jazz: { id: "co_zBob" } }, role: "writer", id: "co_zBob" },
      { account: { $jazz: { id: "co_zCarol" } }, role: "writer", id: "co_zCarol" },
    ];
    const { getByTestId, queryByTestId } = renderAt();
    expect(getByTestId("members-route")).toBeTruthy();
    expect(queryByTestId("profile-stub")).toBeNull();
  });
});

describe("MembersRoute group sections + member links", () => {
  beforeEach(() => {
    directMembers = [
      { account: { $jazz: { id: "co_zMe" } }, role: "admin", id: "co_zMe" },
      { account: { $jazz: { id: "co_zBob" } }, role: "writer", id: "co_zBob" },
      { account: { $jazz: { id: "co_zCarol" } }, role: "writer", id: "co_zCarol" },
    ];
  });

  test("renders an admins section and a members section", () => {
    const { getByTestId } = renderAt();
    expect(getByTestId("members-section-admins")).toBeTruthy();
    expect(getByTestId("members-section-writers")).toBeTruthy();
  });

  test("a member's name links to their profile", () => {
    const { getByTestId } = renderAt();
    const link = getByTestId("member-profile-link-co_zBob");
    expect(link.getAttribute("href")).toBe("/profile/co_zBob");
  });

  test("a member row exposes a kebab that toggles an actions menu", () => {
    const { getByTestId, queryByTestId } = renderAt();
    expect(queryByTestId("member-menu-co_zBob")).toBeNull();
    fireEvent.click(getByTestId("member-kebab-co_zBob"));
    const menu = getByTestId("member-menu-co_zBob");
    expect(menu).toBeTruthy();
    // promote + remove actions inside the menu
    expect(getByTestId("promote-co_zBob")).toBeTruthy();
    expect(getByTestId("remove-co_zBob")).toBeTruthy();
  });
});
