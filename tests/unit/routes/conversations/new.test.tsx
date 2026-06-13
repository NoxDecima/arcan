import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * Phase 6 contract: selecting one contact dispatches to
 * findOrCreate1to1Conversation, selecting two or more dispatches to
 * createGroupConversation. Both factories are spied here so the test stays
 * a pure routing check — it doesn't need a real Jazz node.
 */
const ME = { $jazz: { id: "co_zMe" }, root: { contactBook: [] } };

const {
  findOrCreate1to1ConversationMock,
  createGroupConversationMock,
  navigateMock,
} = vi.hoisted(() => ({
  findOrCreate1to1ConversationMock: vi.fn(async () => ({
    $jazz: { id: "co_zConvA" },
  })),
  createGroupConversationMock: vi.fn(async () => ({
    $jazz: { id: "co_zConvB" },
  })),
  navigateMock: vi.fn(),
}));

vi.mock("@/jazz/conversation", () => ({
  findOrCreate1to1Conversation: findOrCreate1to1ConversationMock,
  createGroupConversation: createGroupConversationMock,
}));

vi.mock("@/jazz/avatarResolver", () => ({
  resolveAvatarFileBlob: () => undefined,
  useRemoteAvatar: () => undefined,
}));

const CONTACTS = [
  { contactAccountID: "co_zAlice", displayNameLocal: "Alice" },
  { contactAccountID: "co_zBob", displayNameLocal: "Bob" },
  { contactAccountID: "co_zCarol", displayNameLocal: "Carol" },
];

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    $jazz: ME.$jazz,
    profile: { displayName: "Me" },
    root: { contactBook: CONTACTS, knownConversations: [] },
  }),
}));

// Avoid the navigate side-effect under MemoryRouter — we only care about
// the factory dispatch, so silence the navigation.
vi.mock("react-router-dom", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import { NewConversationRoute } from "@/routes/conversations/new";

function Wrap({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe("NewConversationRoute", () => {
  beforeEach(() => {
    findOrCreate1to1ConversationMock.mockClear();
    createGroupConversationMock.mockClear();
    navigateMock.mockClear();
  });

  test("selecting a single contact dispatches findOrCreate1to1Conversation", async () => {
    const { getByTestId } = render(
      <Wrap>
        <NewConversationRoute />
      </Wrap>,
    );

    fireEvent.click(getByTestId("new-convo-contact-co_zAlice"));
    fireEvent.click(getByTestId("new-convo-submit"));

    await waitFor(() => {
      expect(findOrCreate1to1ConversationMock).toHaveBeenCalledTimes(1);
    });
    expect(createGroupConversationMock).not.toHaveBeenCalled();
    const arg = findOrCreate1to1ConversationMock.mock.calls[0]![1] as any;
    expect(arg.contactAccountID).toBe("co_zAlice");
  });

  test("selecting two contacts dispatches createGroupConversation", async () => {
    const { getByTestId } = render(
      <Wrap>
        <NewConversationRoute />
      </Wrap>,
    );

    fireEvent.click(getByTestId("new-convo-contact-co_zAlice"));
    fireEvent.click(getByTestId("new-convo-contact-co_zBob"));
    fireEvent.click(getByTestId("new-convo-submit"));

    await waitFor(() => {
      expect(createGroupConversationMock).toHaveBeenCalledTimes(1);
    });
    expect(findOrCreate1to1ConversationMock).not.toHaveBeenCalled();
    const [, ids] = createGroupConversationMock.mock.calls[0]!;
    expect(ids).toEqual(expect.arrayContaining(["co_zAlice", "co_zBob"]));
    expect((ids as string[]).length).toBe(2);
  });

  test("group-name input only appears when 2+ are selected", () => {
    const { getByTestId, queryByTestId } = render(
      <Wrap>
        <NewConversationRoute />
      </Wrap>,
    );

    expect(queryByTestId("new-convo-group-name")).toBeNull();
    fireEvent.click(getByTestId("new-convo-contact-co_zAlice"));
    expect(queryByTestId("new-convo-group-name")).toBeNull();
    fireEvent.click(getByTestId("new-convo-contact-co_zBob"));
    expect(getByTestId("new-convo-group-name")).toBeInTheDocument();
  });

  test("custom group name flows through to createGroupConversation", async () => {
    const { getByTestId } = render(
      <Wrap>
        <NewConversationRoute />
      </Wrap>,
    );

    fireEvent.click(getByTestId("new-convo-contact-co_zAlice"));
    fireEvent.click(getByTestId("new-convo-contact-co_zBob"));
    fireEvent.click(getByTestId("new-convo-contact-co_zCarol"));
    fireEvent.change(getByTestId("new-convo-group-name"), {
      target: { value: "Trip planning" },
    });
    fireEvent.click(getByTestId("new-convo-submit"));

    await waitFor(() => {
      expect(createGroupConversationMock).toHaveBeenCalledTimes(1);
    });
    const [, , title] = createGroupConversationMock.mock.calls[0]!;
    expect(title).toBe("Trip planning");
  });
});
