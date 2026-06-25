import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarTabProvider } from "@/components/sidebar-tab";

// One unread conversation + one read conversation. Bodies + sentAt drive the
// preview and timestamp; lastReadAt drives the unread badge.
const T0 = new Date("2026-06-20T09:00:00Z").getTime();
const T1 = new Date("2026-06-20T17:02:00Z").getTime();

const convUnread = {
  $jazz: { id: "co_conv_unread", owner: null },
  title: "rana",
  createdAt: new Date(T0).toISOString(),
  messages: [
    {
      body: "p99 down to 40ms",
      sentAt: new Date(T1),
      deleted: false,
      attachments: [],
      $jazz: { createdBy: "co_rana" },
    },
  ],
};
const convRead = {
  $jazz: { id: "co_conv_read", owner: null },
  title: "ada",
  createdAt: new Date(T0).toISOString(),
  messages: [
    {
      body: "ack — looks right",
      sentAt: new Date(T0),
      deleted: false,
      attachments: [],
      $jazz: { createdBy: "co_ada" },
    },
  ],
};

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "decima", avatar: null },
    root: {
      contactBook: [],
      knownConversations: [convUnread, convRead],
      // convRead's only message is at/below its cutoff → read; convUnread has
      // no cutoff entry → unread.
      lastReadAt: { co_conv_read: T0 + 1 },
    },
    $jazz: { id: "co_me" },
  }),
}));

// isArchived reads me.root… and the conversation; with treatNotLoadedAsArchived
// it must NOT treat our seeded convs as archived. Stub it to "never archived".
vi.mock("@/jazz/conversation", () => ({
  isArchived: () => false,
}));

// deriveConversationLabel falls back to the explicit `title` we set, so we do
// not need resolveDisplayName here; but the module imports it — stub it.
vi.mock("@/jazz/displayName", () => ({
  resolveDisplayName: () => "unused",
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

describe("Sidebar chat rows (items 3.1-B/C/D)", () => {
  it("shows the last-message preview text on each row", async () => {
    const { getByTestId } = await renderSidebar();
    // Rows are sorted by last-message time desc → unread (T1) is row 0.
    expect(getByTestId("conversation-preview-0").textContent).toBe(
      "p99 down to 40ms",
    );
    expect(getByTestId("conversation-preview-1").textContent).toBe(
      "ack — looks right",
    );
  });

  it("shows a timestamp on each row", async () => {
    const { getByTestId } = await renderSidebar();
    // Locale-formatted HH:MM — assert it is non-empty and digit-bearing.
    expect(getByTestId("conversation-time-0").textContent).toMatch(/\d/);
  });

  it("shows the unread pill badge only on the unread row", async () => {
    const { getByTestId, queryByTestId } = await renderSidebar();
    expect(getByTestId("unread-badge-0").textContent).toBe("1");
    expect(queryByTestId("unread-badge-1")).toBeNull();
  });

  it("bolds the name on the unread row, not the read row", async () => {
    const { getByTestId } = await renderSidebar();
    expect(getByTestId("conversation-name-0").className).toMatch(
      /\bfont-semibold\b/,
    );
    expect(getByTestId("conversation-name-1").className).not.toMatch(
      /\bfont-semibold\b/,
    );
  });
});
