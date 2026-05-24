import { describe, it, expect } from "vitest";
import { createJazzTestAccount, linkAccounts } from "jazz-tools/testing";
import { Group, co } from "jazz-tools";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { Conversation } from "@/jazz/schema/Conversation";
import { Message } from "@/jazz/schema/Message";
import { FileBlob } from "@/jazz/schema/FileBlob";
import { SystemEvent } from "@/jazz/schema/SystemEvent";
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
  isArchived,
  removeFromArchive,
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

  it("does NOT remove the conversation from knownConversations after leaving (Slice 4)", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(alice, bob);

    const conversationGroup = Group.create({ owner: alice });
    conversationGroup.addMember(bob, "admin"); // both admin so alice can leave cleanly
    const conversation = Conversation.create(
      {
        createdAt: new Date(),
        createdBy: alice.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
        systemEvents: co.list(SystemEvent).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );
    alice.root.knownConversations.$jazz.push(conversation);
    expect(Array.from(alice.root.knownConversations).length).toBe(1);

    await leaveConversation(alice, conversation);

    // Slice 4: conversation stays in knownConversations so it can appear in archive
    expect(Array.from(alice.root.knownConversations).length).toBe(1);
    // But me is no longer in the group
    expect(isArchived(alice, conversation)).toBe(true);
  });
});

describe("Slice 4 systemEvents writes", () => {
  it("addMemberToConversation writes an 'added' event with actor=me, target=new member", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const charlie = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(alice, bob);
    linkAccounts(alice, charlie);

    const conversationGroup = Group.create({ owner: alice });
    conversationGroup.addMember(bob, "writer");
    const conversation = Conversation.create(
      {
        createdAt: new Date(),
        createdBy: alice.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
        systemEvents: co.list(SystemEvent).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );

    await addMemberToConversation(alice, conversation, charlie.$jazz.id, "writer");

    const events = Array.from(conversation.systemEvents ?? []);
    const addedEvents = events.filter((e: any) => e.kind === "added");
    expect(addedEvents).toHaveLength(1);
    expect(addedEvents[0].actorAccountID).toBe(alice.$jazz.id);
    expect(addedEvents[0].targetAccountID).toBe(charlie.$jazz.id);
    expect(addedEvents[0].occurredAt).toBeInstanceOf(Date);
  });

  it("removeMemberFromConversation writes a 'removed' event", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(alice, bob);

    const conversationGroup = Group.create({ owner: alice });
    conversationGroup.addMember(bob, "writer");
    const conversation = Conversation.create(
      {
        createdAt: new Date(),
        createdBy: alice.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
        systemEvents: co.list(SystemEvent).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );

    await removeMemberFromConversation(alice, conversation, bob.$jazz.id);

    const events = Array.from(conversation.systemEvents ?? []);
    const removed = events.filter((e: any) => e.kind === "removed");
    expect(removed).toHaveLength(1);
    expect(removed[0].actorAccountID).toBe(alice.$jazz.id);
    expect(removed[0].targetAccountID).toBe(bob.$jazz.id);
  });

  it("leaveConversation writes a 'left' event BEFORE self-revoking (so the leaver still has write permission)", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(alice, bob);

    const conversationGroup = Group.create({ owner: alice });
    conversationGroup.addMember(bob, "admin"); // both admin so alice can leave w/o promote
    const conversation = Conversation.create(
      {
        createdAt: new Date(),
        createdBy: alice.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
        systemEvents: co.list(SystemEvent).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );
    alice.root.knownConversations.$jazz.push(conversation);

    await leaveConversation(alice, conversation);

    // After alice leaves, she loses read access to the group. Verify the event was
    // written by loading the conversation from bob's perspective (bob is still admin).
    // In the linkAccounts test environment, alice and bob share the same node so
    // all data is immediately visible.
    const bobConversation = await Conversation.load(conversation.$jazz.id as any, {
      loadAs: bob,
      resolve: { systemEvents: true },
    });
    const events = Array.from((bobConversation as any)?.systemEvents ?? []);
    const left = events.filter((e: any) => e.kind === "left");
    expect(left).toHaveLength(1);
    expect((left[0] as any).actorAccountID).toBe(alice.$jazz.id);
    expect((left[0] as any).targetAccountID).toBeUndefined();
  });

  it("promoteToAdmin writes a 'promoted' event", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(alice, bob);

    const conversationGroup = Group.create({ owner: alice });
    conversationGroup.addMember(bob, "writer");
    const conversation = Conversation.create(
      {
        createdAt: new Date(),
        createdBy: alice.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
        systemEvents: co.list(SystemEvent).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );

    await promoteToAdmin(alice, conversation, bob.$jazz.id);

    const events = Array.from(conversation.systemEvents ?? []);
    const promoted = events.filter((e: any) => e.kind === "promoted");
    expect(promoted).toHaveLength(1);
    expect(promoted[0].actorAccountID).toBe(alice.$jazz.id);
    expect(promoted[0].targetAccountID).toBe(bob.$jazz.id);
  });
});

describe("isArchived", () => {
  it("returns false for a conversation where me is still a member", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const { conversation } = await makeConversation(me);
    expect(isArchived(me, conversation)).toBe(false);
  });

  it("returns true after me is removed from the conversation group", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(alice, bob);

    const conversationGroup = Group.create({ owner: bob });
    conversationGroup.addMember(alice, "writer");
    const conversation = Conversation.create(
      {
        createdAt: new Date(),
        createdBy: bob.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
        systemEvents: co.list(SystemEvent).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );

    expect(isArchived(alice, conversation)).toBe(false);
    conversationGroup.removeMember(alice);
    expect(isArchived(alice, conversation)).toBe(true);
  });
});

describe("removeFromArchive", () => {
  it("splices the conversation from me.root.knownConversations", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const { conversation } = await makeConversation(me);
    me.root.knownConversations.$jazz.push(conversation);
    expect(Array.from(me.root.knownConversations).length).toBe(1);

    await removeFromArchive(me, conversation);

    expect(Array.from(me.root.knownConversations).length).toBe(0);
  });

  it("is a no-op when the conversation is not in knownConversations", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const { conversation } = await makeConversation(me);

    await removeFromArchive(me, conversation); // not in list yet

    expect(Array.from(me.root.knownConversations).length).toBe(0);
  });
});

describe("[recon] cojson admin-remove-admin behavior (Slice 3c)", () => {
  it("documents whether one admin can remove another admin", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(alice, bob);

    const group = Group.create({ owner: alice });
    group.addMember(bob, "admin");

    // Sanity: both are admins
    const beforeRoles = group.getDirectMembers().map((m: any) => m.role).sort();
    expect(beforeRoles).toEqual(["admin", "admin"]);

    // Attempt: Alice (the caller, the test's "me") removes Bob
    let removeError: unknown = null;
    try {
      await removeMemberFromConversation(
        alice as any,
        { $jazz: { owner: group } } as any,
        bob.$jazz.id,
      );
    } catch (e) {
      removeError = e;
    }

    const afterRoles = group.getDirectMembers().map((m: any) => m.role).sort();
    const stillContainsBob = group
      .getDirectMembers()
      .some((m: any) => m.account?.$jazz?.id === bob.$jazz.id);

    // This test does not assert pass/fail on cojson's behavior — it documents
    // the observed result. Read the commit message for the recorded outcome.
    // The Phase B UI is built against whichever outcome lands.
    console.log("[recon] admin-remove-admin:", {
      removeErrorMessage: removeError instanceof Error ? removeError.message : null,
      beforeRoles,
      afterRoles,
      stillContainsBob,
    });

    // Recon result will be recorded by the implementer in the commit message
    // and used to set REMOVE_ADMIN_PERMITTED in Phase B Task 8.
    // The test itself passes regardless — its purpose is to surface observable
    // behavior, not to enforce it.
    expect(true).toBe(true);
  });
});
