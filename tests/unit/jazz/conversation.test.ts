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
  it("creates a new Conversation with kind=dm when contact.linkedConversation is null", async () => {
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

    let linkedConversation: any = null;
    const contactStub = {
      contactAccountID: bob.$jazz.id,
      get linkedConversation() {
        return linkedConversation;
      },
      $jazz: {
        set: (_key: string, value: any) => {
          linkedConversation = value;
        },
      },
    };

    const conversation = await findOrCreate1to1Conversation(alice, contactStub);

    expect(conversation).toBeDefined();
    expect(conversation.kind).toBe("dm");
    expect(conversation.createdBy).toBe(alice.$jazz.id);
    // Contact cache should have been populated
    expect(contactStub.linkedConversation).toBeDefined();
  });

  it("returns the existing Conversation when linkedConversation is already set", async () => {
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

    const conversationGroup = Group.create({ owner: alice });
    const existingConversation = Conversation.create(
      {
        kind: "dm",
        createdAt: new Date(),
        createdBy: alice.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );

    const contactStub = {
      contactAccountID: bob.$jazz.id,
      linkedConversation: existingConversation,
      $jazz: {
        set: () => {},
      },
    };

    const result = await findOrCreate1to1Conversation(alice, contactStub);
    expect(result.$jazz.id).toBe(existingConversation.$jazz.id);
  });
});
