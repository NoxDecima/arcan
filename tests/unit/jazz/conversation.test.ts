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
      kind: "dm",
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
  it("creates a new Conversation with kind=dm and pushes to knownConversations", async () => {
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
    expect(conversation.kind).toBe("dm");
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
        kind: "dm",
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
    expect(conversation.kind).toBe("group");
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
