import { describe, it, expect } from "vitest";
import { createJazzTestAccount, linkAccounts } from "jazz-tools/testing";
import { Group, co } from "jazz-tools";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { Message } from "@/jazz/schema/Message";
import { FileBlob } from "@/jazz/schema/FileBlob";
import { Conversation } from "@/jazz/schema/Conversation";
import { SystemEvent } from "@/jazz/schema/SystemEvent";
import {
  getAuthorAccountIDFromMessage,
  isWellFormedWriteGroup,
  directWriterMembers,
  directAdminMembers,
  sendMessage,
} from "@/jazz/messages";
import { uploadAttachment } from "@/jazz/attachments";

/**
 * Build a proper per-author WriteGroup:
 * - owner = me (alice), who stays as admin (owner's role is "admin" in Jazz)
 * - conversationGroup added as parent with role "reader"
 * - No explicit addMember(alice, "writer") — alice is already admin which
 *   grants write access in the Jazz permission system
 */
function makeWriteGroup(owner: any, conversationGroup: Group): Group {
  const wg = Group.create({ owner });
  wg.addMember(conversationGroup, "reader");
  // Do NOT add owner as "writer" — owner is already "admin" which includes write
  return wg;
}

describe("getAuthorAccountIDFromMessage", () => {
  it("returns the create-transaction signer accountID for a message", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });

    const conversationGroup = Group.create({ owner: alice });
    const writeGroup = makeWriteGroup(alice, conversationGroup);

    const message = Message.create(
      {
        sentAt: new Date(),
        body: "hello",
        attachments: co.list(FileBlob).create([], { owner: writeGroup }),
      },
      { owner: writeGroup },
    );

    const author = getAuthorAccountIDFromMessage(message);
    expect(author).toBe(alice.$jazz.id);
  });

  it("returns null for a null/undefined message", () => {
    expect(getAuthorAccountIDFromMessage(null)).toBeNull();
    expect(getAuthorAccountIDFromMessage(undefined)).toBeNull();
  });
});

describe("directWriterMembers", () => {
  it("returns direct writer members with role=writer", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const conversationGroup = Group.create({ owner: alice });
    const writeGroup = Group.create({ owner: alice });
    writeGroup.addMember(conversationGroup, "reader");
    // Alice starts as admin; no explicit writer added
    // directWriterMembers should return 0 (alice is admin, not writer)
    const writers = directWriterMembers(writeGroup);
    expect(writers.length).toBe(0);
  });
});

describe("directAdminMembers", () => {
  it("returns the owner as admin", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    // Group.create sets the owner as admin automatically
    const writeGroup = Group.create({ owner: alice });

    const admins = directAdminMembers(writeGroup);
    // Alice is admin as the owner
    expect(admins.length).toBe(1);
    expect(admins[0].id).toBe(alice.$jazz.id);
  });
});

describe("isWellFormedWriteGroup", () => {
  it("returns true for a properly-shaped WriteGroup (owner = admin, parent = reader)", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const conversationGroup = Group.create({ owner: alice });
    const writeGroup = makeWriteGroup(alice, conversationGroup);

    expect(isWellFormedWriteGroup(writeGroup, conversationGroup)).toBe(true);
  });

  it("returns false when the parent mapping is wrong (extend instead of reader)", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const conversationGroup = Group.create({ owner: alice });
    const wg = Group.create({ owner: alice });
    // Using "extend" instead of "reader" — wrong mapping
    wg.addMember(conversationGroup, "extend");

    expect(isWellFormedWriteGroup(wg, conversationGroup)).toBe(false);
  });

  it("returns false when the conversationGroup is not a parent at all", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const conversationGroup = Group.create({ owner: alice });
    const wg = Group.create({ owner: alice });
    // No parent added — wg is a standalone group

    expect(isWellFormedWriteGroup(wg, conversationGroup)).toBe(false);
  });

  it("returns false when there are multiple direct admins (additional admin granted)", async () => {
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
    // Link so alice's node knows bob's key material
    await linkAccounts(alice, bob);

    const conversationGroup = Group.create({ owner: alice });
    const wg = Group.create({ owner: alice });
    wg.addMember(conversationGroup, "reader");
    // Add bob as admin — now there are two direct admins: alice + bob
    wg.addMember(bob, "admin");

    expect(isWellFormedWriteGroup(wg, conversationGroup)).toBe(false);
  });
});

describe("sendMessage with attachments", () => {
  it("attaches a FileBlob to the new Message", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(alice, bob);

    const conversationGroup = Group.create({ owner: alice });
    conversationGroup.addMember(bob, "admin");
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

    // Author's WriteGroup is created by ensureMyWriteGroup on first send.
    // For the test, we upload directly via a fresh WriteGroup to mimic the flow:
    const writeGroup = Group.create({ owner: alice });
    writeGroup.addMember(conversationGroup, "reader");
    const file = new File([new Uint8Array([1, 2, 3])], "hi.png", { type: "image/png" });
    const attachment = await uploadAttachment(writeGroup, file);

    const message = await sendMessage(alice as any, conversation, "look", [attachment]);

    expect((message as any).body).toBe("look");
    expect(Array.from((message as any).attachments).length).toBe(1);
    expect(((message as any).attachments[0] as any).filename).toBe("hi.png");
  });

  it("accepts an empty attachments array (backward compatible)", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const conversationGroup = Group.create({ owner: alice });
    const conversation = Conversation.create(
      {
        createdAt: new Date(),
        createdBy: alice.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
        systemEvents: co.list(SystemEvent).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );
    (alice as any).root.knownConversations.$jazz.push(conversation);

    const message = await sendMessage(alice as any, conversation, "no files");

    expect((message as any).body).toBe("no files");
    expect(Array.from((message as any).attachments).length).toBe(0);
  });
});
