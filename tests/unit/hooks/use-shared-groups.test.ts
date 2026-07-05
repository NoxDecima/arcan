/**
 * use-shared-groups.test.ts
 *
 * Verifies that useSharedGroups:
 *  1. Derives the conversation title from contactBook.displayNameLocal for
 *     2-member (DM) conversations — NOT falling through to "Untitled".
 *  2. Returns conv.title directly for group conversations (> 2 members).
 */
import { describe, test, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// ── constants ────────────────────────────────────────────────────────────────
const MY_ID = "co_zMe";
const OTHER_ID = "co_zOther";
const CONTACT_NAME = "Alice";

// ── helpers ──────────────────────────────────────────────────────────────────
function makeMember(id: string, role = "admin") {
  return { role, account: { $jazz: { id } } };
}

function makeConv(id: string, members: ReturnType<typeof makeMember>[], title: string | null = null) {
  return {
    $jazz: {
      id,
      owner: { getDirectMembers: () => members },
    },
    title,
  };
}

// 2-member DM: no title (as real DMs carry null/undefined title)
const dmConv = makeConv(
  "conv_dm",
  [makeMember(MY_ID), makeMember(OTHER_ID)],
  null,
);

// Group with explicit title (3 members — not a 1:1)
const groupConv = makeConv(
  "conv_grp",
  [makeMember(MY_ID), makeMember(OTHER_ID), makeMember("co_zThird")],
  "Project Alpha",
);

const contactEntry = {
  contactAccountID: OTHER_ID,
  displayNameLocal: CONTACT_NAME,
};

// ── mocks ────────────────────────────────────────────────────────────────────
vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    $jazz: { id: MY_ID },
    root: {
      knownConversations: [dmConv, groupConv],
      contactBook: [contactEntry],
    },
  }),
}));

// ── tests ────────────────────────────────────────────────────────────────────
import { useSharedGroups } from "@/hooks/use-shared-groups";

describe("useSharedGroups", () => {
  test("1:1 DM title equals contactBook displayNameLocal, not Untitled", () => {
    const { result } = renderHook(() => useSharedGroups(OTHER_ID));
    const dm = result.current.find((g) => g.id === "conv_dm");
    expect(dm).toBeDefined();
    expect(dm!.title).toBe(CONTACT_NAME);
    expect(dm!.title).not.toBe("Untitled");
  });

  test("group conversation (> 2 members) returns conv.title", () => {
    const { result } = renderHook(() => useSharedGroups(OTHER_ID));
    const group = result.current.find((g) => g.id === "conv_grp");
    expect(group).toBeDefined();
    expect(group!.title).toBe("Project Alpha");
  });
});
