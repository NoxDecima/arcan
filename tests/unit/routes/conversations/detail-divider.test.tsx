import { describe, test, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/toast";

// jsdom doesn't implement scrollIntoView; the route's auto-scroll effect (and
// the divider auto-scroll effect) call it. Stub so the component can render.
Element.prototype.scrollIntoView = vi.fn();

// useIsDesktop → false (mobile branch) so the component renders without
// window.matchMedia issues in jsdom.
vi.mock("@/components/use-is-desktop", () => ({
  useIsDesktop: () => false,
}));

const GROUP = {
  getDirectMembers: () => [
    { account: { $jazz: { id: "co_zMe" } }, role: "admin" },
    { account: { $jazz: { id: "co_zBob" } }, role: "admin" },
  ],
  getRoleOf: () => "admin",
};

// One incoming message (authored by co_zBob, not me) with no lastReadAt entry,
// so the anchor is 0 → the message is unread → the new-mark divider renders.
const INCOMING = {
  $jazz: { id: "co_zMsg1" },
  body: "hey — got a minute?",
  sentAt: new Date("2026-06-23T09:30:00"),
  deleted: false,
  edited: false,
  attachments: [],
};
const CONVERSATION = {
  $isLoaded: true,
  $jazz: { id: "co_zConv", owner: GROUP },
  title: "retrieval-squad",
  messages: [INCOMING],
  systemEvents: [],
  icon: undefined,
};

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    $jazz: { id: "co_zMe" },
    profile: { displayName: "decima" },
    // no lastReadAt entry for co_zConv → anchor 0 → message is unread
    root: { contactBook: [], knownConversations: [], lastReadAt: {} },
  }),
  useCoState: () => CONVERSATION,
  useSyncConnectionStatus: () => true,
}));
vi.mock("@/jazz/avatarResolver", () => ({
  resolveAvatarFileBlob: () => undefined,
  useRemoteAvatar: () => undefined,
}));
vi.mock("@/jazz/messages", () => ({
  sendMessage: vi.fn(),
  getAuthorAccountIDFromMessage: () => "co_zBob", // incoming (not me)
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
}));
vi.mock("@/jazz/conversation", () => ({
  isArchived: () => false,
  ensureMyWriteGroup: vi.fn(),
  isLastAdmin: () => false,
  leaveConversation: vi.fn(),
}));
vi.mock("@/jazz/displayName", () => ({ resolveDisplayName: () => "bob" }));
// ArcanAccount.subscribe is called by useAccountAvatars (message-row author avatars).
// Stub with a no-op in unit tests — no Jazz sync context available here.
vi.mock("@/jazz/schema/ArcanAccount", () => ({
  ArcanAccount: { subscribe: () => () => {} },
}));

import { ConversationDetailRoute } from "@/routes/conversations/detail";

describe("NewMark divider", () => {
  test("renders the new-messages divider for an unread incoming message", async () => {
    const { findByTestId } = render(
      <ToastProvider>
      <MemoryRouter initialEntries={["/conversations/co_zConv"]}>
        <ConversationDetailRoute />
      </MemoryRouter>
      </ToastProvider>,
    );
    const divider = await findByTestId("new-messages-divider");
    // The kit's new-divider has bg-arcan-accent hairlines and text-arcan-accent label.
    expect(divider.outerHTML).toContain("arcan-accent");
    expect(divider.textContent?.toLowerCase()).toContain("new");
  });
});
