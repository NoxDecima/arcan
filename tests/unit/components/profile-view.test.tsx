import { describe, test, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * The component reaches into Jazz hooks, the avatar resolver, the pubkey
 * helper, and the conversation factory. Mock all of those at module scope —
 * the test only cares about which branch (own vs. other) renders.
 */
const MY_ID = "co_zMe";
const OTHER_ID = "co_zOther";

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    $jazz: { id: MY_ID },
    profile: { displayName: "Me", avatar: null, $jazz: { set: vi.fn() } },
    root: { contactBook: [] },
  }),
  useCoState: () => null,
}));

vi.mock("@/hooks/use-shared-groups", () => ({
  useSharedGroups: () => [],
}));

vi.mock("@/jazz/avatarResolver", () => ({
  resolveAvatarFileBlob: () => undefined,
  useRemoteAvatar: () => undefined,
}));

vi.mock("@/jazz/avatar", () => ({
  setProfileAvatar: vi.fn(),
  clearProfileAvatar: vi.fn(),
}));

vi.mock("@/auth/pubkey", () => ({
  getAccountPubkeyHex: () => "a".repeat(64),
}));

vi.mock("@/jazz/conversation", () => ({
  findOrCreate1to1Conversation: vi.fn(),
}));

// Avatar.tsx's useEffect bails when streamID or loadAs is falsy, so with
// profile.avatar = null and contactBook empty we never hit jazz-tools' real
// loadAsBlob path. No need to mock jazz-tools.

import { ProfileView } from "@/components/profile-view";

function Wrap({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe("ProfileView", () => {
  test("renders the 'add a contact' CTA when viewing your own profile", () => {
    const { getByTestId, queryByTestId } = render(
      <Wrap>
        <ProfileView accountID={MY_ID} />
      </Wrap>,
    );
    expect(getByTestId("profile-view").getAttribute("data-profile-mode")).toBe(
      "own",
    );
    expect(getByTestId("profile-add-contact")).toBeInTheDocument();
    expect(queryByTestId("profile-message")).toBeNull();
  });

  test("renders the 'message' CTA when viewing someone else's profile", () => {
    const { getByTestId, queryByTestId } = render(
      <Wrap>
        <ProfileView accountID={OTHER_ID} />
      </Wrap>,
    );
    expect(getByTestId("profile-view").getAttribute("data-profile-mode")).toBe(
      "other",
    );
    expect(getByTestId("profile-message")).toBeInTheDocument();
    expect(queryByTestId("profile-add-contact")).toBeNull();
  });
});
