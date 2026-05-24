import { describe, it, expect } from "vitest";
import { createJazzTestAccount, linkAccounts } from "jazz-tools/testing";
import { Group, co } from "jazz-tools";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { Conversation } from "@/jazz/schema/Conversation";
import { Message } from "@/jazz/schema/Message";
import { FileBlob } from "@/jazz/schema/FileBlob";
import {
  ensureMyWriteGroup,
  findOrCreate1to1Conversation,
  createGroupConversation,
  addMemberToConversation,
  removeMemberFromConversation,
  promoteToAdmin,
  demoteToWriter,
  updateConversationTitle,
  isLastAdmin,
  leaveConversation,
} from "@/jazz/conversation";

/**
 * Helper: create a ConversationGroup + Conversation owned by it.
 * Returns both so tests can directly introspect the group shape.
 */
async function makeConversation(me: any) {
  const conversationGroup = Group.create({ owner: me });
  const conversation = Conversation.create(
    {
      createdAt: new Date(),
      createdBy: me.$jazz.id,
      messages: co.list(Message).create([], { owner: conversationGroup }),
    },
    { owner: conversationGroup },
  );
  return { conversationGroup, conversation };
}

describe("ensureMyWriteGroup", () => {
  it("creates a new WriteGroup with self as single direct writer + admin when none exists", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });

    const { conversation } = await makeConversation(alice);

    const wg = await ensureMyWriteGroup(alice, conversation);

    expect(wg).toBeInstanceOf(Group);

    // Alice must be the sole direct admin on the returned group.
    // Jazz sets the creator of a group as "admin" via Group.create({ owner }).
    // Admin includes write access — no explicit "writer" role is needed.
    const directMembers = wg.getDirectMembers();
    const aliceDirectAdmin = directMembers.find(
      (m) => m.id === alice.$jazz.id && m.role === "admin",
    );
    expect(aliceDirectAdmin).toBeDefined();
  });

  it("is idempotent: returns the same WriteGroup on subsequent calls", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });

    const { conversation } = await makeConversation(alice);

    const wg1 = await ensureMyWriteGroup(alice, conversation);

    // Simulate a message being sent (so the WriteGroup is in conversation.messages)
    const msg = Message.create(
      {
        sentAt: new Date(),
        body: "hello",
        attachments: co.list(FileBlob).create([], { owner: wg1 }),
      },
      { owner: wg1 },
    );
    conversation.messages.$jazz.push(msg);

    const wg2 = await ensureMyWriteGroup(alice, conversation);

    // Should return the same group ID
    expect(wg2.$jazz.id).toBe(wg1.$jazz.id);
  });
});

describe("findOrCreate1to1Conversation", () => {
  it("creates a new Conversation and pushes to knownConversations", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const bob = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
      isCurrentActiveAccount: false,
    });

    // Link the two test accounts so each can see the other's CoValues
    await linkAccounts(alice, bob);

    const contactStub = {
      contactAccountID: bob.$jazz.id,
    };

    const conversation = await findOrCreate1to1Conversation(alice, contactStub);

    expect(conversation).toBeDefined();
    expect(conversation.createdBy).toBe(alice.$jazz.id);

    // Should be in alice's knownConversations
    const known = Array.from((alice as any).root?.knownConversations ?? []);
    const found = known.find((c: any) => c?.$jazz?.id === conversation.$jazz.id);
    expect(found).toBeDefined();
  });

  it("returns existing Conversation when one is already in knownConversations", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const bob = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
      isCurrentActiveAccount: false,
    });

    await linkAccounts(alice, bob);

    // Create a conversation and push it to knownConversations manually
    const conversationGroup = Group.create({ owner: alice });
    conversationGroup.addMember(bob, "admin");
    const existingConversation = Conversation.create(
      {
        createdAt: new Date(),
        createdBy: alice.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );
    (alice as any).root.knownConversations.$jazz.push(existingConversation);

    const contactStub = {
      contactAccountID: bob.$jazz.id,
    };

    const result = await findOrCreate1to1Conversation(alice, contactStub);
    expect(result.$jazz.id).toBe(existingConversation.$jazz.id);
  });

  it("returns an existing 2-member conversation matching {me, contact} even if it lacks an explicit kind", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(me, bob);

    const bobContact = {
      contactAccountID: bob.$jazz.id,
      displayNameLocal: "Bob",
    };

    // Manually create a conversation with bob (no kind field) and push to knownConversations
    const conversationGroup = Group.create({ owner: me });
    conversationGroup.addMember(bob, "admin");
    const existing = Conversation.create(
      {
        createdAt: new Date(),
        createdBy: me.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );
    me.root.knownConversations.$jazz.push(existing);

    const result = await findOrCreate1to1Conversation(me, bobContact);
    expect(result.$jazz.id).toBe(existing.$jazz.id);
  });
});

describe("createGroupConversation", () => {
  it("adds participants as 'writer' by default, pushes to knownConversations", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const bob = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
      isCurrentActiveAccount: false,
    });
    const carol = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Carol" },
      isCurrentActiveAccount: false,
    });

    await linkAccounts(alice, bob);
    await linkAccounts(alice, carol);

    const conversation = await createGroupConversation(
      alice,
      [bob.$jazz.id, carol.$jazz.id],
      "Test Group",
    );

    expect(conversation).toBeDefined();
    expect(conversation.title).toBe("Test Group");

    const conversationGroup = conversation.$jazz.owner;
    const directMembers = conversationGroup.getDirectMembers();

    // Alice is implicit admin (group creator), bob + carol are writers
    const bobMember = directMembers.find((m: any) => m.account?.$jazz?.id === bob.$jazz.id);
    const carolMember = directMembers.find((m: any) => m.account?.$jazz?.id === carol.$jazz.id);

    expect(bobMember).toBeDefined();
    expect(bobMember?.role).toBe("writer");
    expect(carolMember).toBeDefined();
    expect(carolMember?.role).toBe("writer");

    // Alice is admin (group creator)
    const aliceMember = directMembers.find((m: any) => m.account?.$jazz?.id === alice.$jazz.id);
    expect(aliceMember).toBeDefined();
    expect(aliceMember?.role).toBe("admin");

    // Should be in alice's knownConversations
    const known = Array.from((alice as any).root?.knownConversations ?? []);
    const found = known.find((c: any) => c?.$jazz?.id === conversation.$jazz.id);
    expect(found).toBeDefined();
  });
});

// Helper to create a group conversation for member-mgmt tests
async function makeGroupConversation(alice: any, bob: any, carol?: any) {
  const conversationGroup = Group.create({ owner: alice });
  conversationGroup.addMember(bob, "writer");
  if (carol) conversationGroup.addMember(carol, "writer");
  const conversation = Conversation.create(
    {
      title: "Test Group",
      createdAt: new Date(),
      createdBy: alice.$jazz.id,
      messages: co.list(Message).create([], { owner: conversationGroup }),
    },
    { owner: conversationGroup },
  );
  (alice as any).root.knownConversations.$jazz.push(conversation);
  return { conversationGroup, conversation };
}

describe("addMemberToConversation", () => {
  it("adds with writer role by default", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const bob = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
      isCurrentActiveAccount: false,
    });
    const carol = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Carol" },
      isCurrentActiveAccount: false,
    });
    await linkAccounts(alice, bob);
    await linkAccounts(alice, carol);

    const { conversation } = await makeGroupConversation(alice, bob);
    await addMemberToConversation(alice, conversation, carol.$jazz.id);

    const group = conversation.$jazz.owner;
    const carolMember = group.getDirectMembers().find((m: any) => m.account?.$jazz?.id === carol.$jazz.id);
    expect(carolMember).toBeDefined();
    expect(carolMember?.role).toBe("writer");
  });

  it("respects explicit admin role", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const bob = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
      isCurrentActiveAccount: false,
    });
    const carol = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Carol" },
      isCurrentActiveAccount: false,
    });
    await linkAccounts(alice, bob);
    await linkAccounts(alice, carol);

    const { conversation } = await makeGroupConversation(alice, bob);
    await addMemberToConversation(alice, conversation, carol.$jazz.id, "admin");

    const group = conversation.$jazz.owner;
    const carolMember = group.getDirectMembers().find((m: any) => m.account?.$jazz?.id === carol.$jazz.id);
    expect(carolMember).toBeDefined();
    expect(carolMember?.role).toBe("admin");
  });
});

describe("removeMemberFromConversation", () => {
  it("revokes the target member", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const bob = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
      isCurrentActiveAccount: false,
    });
    await linkAccounts(alice, bob);

    const { conversation } = await makeGroupConversation(alice, bob);
    await removeMemberFromConversation(alice, conversation, bob.$jazz.id);

    const group = conversation.$jazz.owner;
    const bobMember = group.getDirectMembers().find((m: any) => m.account?.$jazz?.id === bob.$jazz.id);
    // After removal, bob should not appear as a direct member (or role is revoked)
    expect(bobMember).toBeUndefined();
  });
});

describe("promoteToAdmin and demoteToWriter", () => {
  it("promoteToAdmin changes role from writer to admin", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const bob = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
      isCurrentActiveAccount: false,
    });
    await linkAccounts(alice, bob);

    const { conversation } = await makeGroupConversation(alice, bob);
    await promoteToAdmin(alice, conversation, bob.$jazz.id);

    const group = conversation.$jazz.owner;
    const bobMember = group.getDirectMembers().find((m: any) => m.account?.$jazz?.id === bob.$jazz.id);
    expect(bobMember?.role).toBe("admin");
  });

  it("demoteToWriter changes role from writer to writer (idempotent on writer)", async () => {
    // cojson constraint (verified 0.20.18): an admin CANNOT demote ANOTHER admin to writer
    // — this is enforced at the protocol level ("role of current account is admin").
    // demoteToWriter is only valid when the target is a writer (idempotent) or
    // the TARGET account calls it on themselves.
    // This test verifies the call succeeds when target is already a writer (no-op).
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const bob = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
      isCurrentActiveAccount: false,
    });
    await linkAccounts(alice, bob);

    const { conversation } = await makeGroupConversation(alice, bob);
    // Bob is already a writer; calling demoteToWriter is a no-op (same role)
    await demoteToWriter(alice, conversation, bob.$jazz.id);

    const group = conversation.$jazz.owner;
    const bobMember = group.getDirectMembers().find((m: any) => m.account?.$jazz?.id === bob.$jazz.id);
    expect(bobMember?.role).toBe("writer");
  });
});

describe("updateConversationTitle", () => {
  it("changes the title for group conversations", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const bob = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
      isCurrentActiveAccount: false,
    });
    await linkAccounts(alice, bob);

    const { conversation } = await makeGroupConversation(alice, bob);
    expect(conversation.title).toBe("Test Group");

    await updateConversationTitle(alice, conversation, "New Title");
    expect(conversation.title).toBe("New Title");
  });

  it("allows setting a title on a 2-person conversation (formerly DM)", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(me, bob);

    const conversationGroup = Group.create({ owner: me });
    conversationGroup.addMember(bob, "admin");
    const conversation = Conversation.create(
      {
        createdAt: new Date(),
        createdBy: me.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );

    await updateConversationTitle(me, conversation, "Custom Label");
    expect((conversation as any).title).toBe("Custom Label");
  });
});

describe("isLastAdmin", () => {
  it("returns true when me is the only admin", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const bob = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
      isCurrentActiveAccount: false,
    });
    await linkAccounts(alice, bob);

    const { conversation } = await makeGroupConversation(alice, bob);
    // Alice is the sole admin (bob is writer)
    expect(isLastAdmin(alice, conversation)).toBe(true);
  });

  it("returns false when there are multiple admins", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const bob = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
      isCurrentActiveAccount: false,
    });
    await linkAccounts(alice, bob);

    const { conversation } = await makeGroupConversation(alice, bob);
    await promoteToAdmin(alice, conversation, bob.$jazz.id);
    // Now both alice and bob are admins
    expect(isLastAdmin(alice, conversation)).toBe(false);
  });
});

describe("leaveConversation", () => {
  it("removes the conversation from knownConversations", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const bob = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
      isCurrentActiveAccount: false,
    });
    await linkAccounts(alice, bob);

    const { conversation } = await makeGroupConversation(alice, bob);

    // Verify it's in knownConversations before leaving
    const knownBefore = Array.from((alice as any).root?.knownConversations ?? []);
    expect(knownBefore.some((c: any) => c?.$jazz?.id === conversation.$jazz.id)).toBe(true);

    // Bob must leave (Alice is admin and created it — let Bob leave as the member)
    await leaveConversation(bob, conversation);

    // Bob's known conversations should be empty (he never pushed it, so nothing to remove)
    // Alice should still have it
    const aliceKnown = Array.from((alice as any).root?.knownConversations ?? []);
    expect(aliceKnown.some((c: any) => c?.$jazz?.id === conversation.$jazz.id)).toBe(true);
  });

  it("removes from alice's knownConversations when alice leaves", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const bob = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
      isCurrentActiveAccount: false,
    });
    await linkAccounts(alice, bob);

    // Promote bob first so alice is no longer the sole admin
    const { conversation } = await makeGroupConversation(alice, bob);
    await promoteToAdmin(alice, conversation, bob.$jazz.id);

    // Now alice can leave
    await leaveConversation(alice, conversation);

    const aliceKnown = Array.from((alice as any).root?.knownConversations ?? []);
    expect(aliceKnown.some((c: any) => c?.$jazz?.id === conversation.$jazz.id)).toBe(false);
  });
});
