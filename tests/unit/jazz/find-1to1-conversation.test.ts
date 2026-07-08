import { describe, test, expect } from "vitest";
import { find1to1Conversation } from "@/jazz/conversation";

function makeConversation(memberSpecs: Array<{ id: string; role: string }>) {
  return {
    $jazz: {
      owner: {
        getDirectMembers: () =>
          memberSpecs.map(({ id, role }) => ({
            role,
            account: { $jazz: { id } },
          })),
      },
    },
  };
}

function makeMe(myID: string, known: unknown) {
  return { $jazz: { id: myID }, root: { knownConversations: known } };
}

describe("find1to1Conversation", () => {
  test("finds the conversation whose members are exactly {me, other}", () => {
    const target = makeConversation([
      { id: "alice", role: "admin" },
      { id: "bob", role: "admin" },
    ]);
    const group = makeConversation([
      { id: "alice", role: "admin" },
      { id: "bob", role: "writer" },
      { id: "carol", role: "writer" },
    ]);
    const me = makeMe("alice", [group, target]);
    expect(find1to1Conversation(me as any, "bob")).toBe(target);
  });

  test("returns null when the counterpart has been revoked (1-member set)", () => {
    // After Bob leaves/deletes, his role is undefined — the old thread no
    // longer counts as "the 1:1 with Bob".
    const abandoned = makeConversation([{ id: "alice", role: "admin" }]);
    const me = makeMe("alice", [abandoned]);
    expect(find1to1Conversation(me as any, "bob")).toBeNull();
  });

  test("returns null when no conversation matches", () => {
    const withCarol = makeConversation([
      { id: "alice", role: "admin" },
      { id: "carol", role: "admin" },
    ]);
    const me = makeMe("alice", [withCarol]);
    expect(find1to1Conversation(me as any, "bob")).toBeNull();
  });

  test("tolerates a NotLoaded (non-iterable) knownConversations", () => {
    const me = makeMe("alice", { $isLoaded: false });
    expect(find1to1Conversation(me as any, "bob")).toBeNull();
  });
});
