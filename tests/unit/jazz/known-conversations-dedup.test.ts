/**
 * Regression test for: "On being added to a group I got two conversations in my list"
 *
 * Root-cause investigation (see git commit message for confirmed cause):
 *
 * The inbox drain callback in useConversationInboxSubscription is:
 *
 *   const conversation = await Conversation.load(conversationID, { loadAs: me, resolve: {} });
 *   if (!conversation) return;
 *   const known = me?.root?.knownConversations;
 *   if (!known || typeof known.$jazz?.push !== "function") return;
 *   const alreadyKnown = Array.from(known).some(c => c?.$jazz?.id === conversationID);
 *   if (alreadyKnown) return;
 *   known.$jazz.push(conversation);
 *
 * Three mechanisms were investigated:
 *
 * (A) Proxy-based dedup failure when items are unresolved (spec's primary suspicion):
 *     DISPROVED — c?.$jazz?.id correctly returns the raw CoValue ID even for unloaded
 *     stubs (createUnloadedCoValue sets id = childId = the raw CoValue ID from the list).
 *
 * (B) Concurrent-drain race between two inbox callbacks for the same conversationID:
 *     DISPROVED in sync-in-memory test environment — JS single-thread guarantees
 *     that after each await resolves, the sync check-and-push runs atomically.
 *
 * (C) Two actual inbox messages sent for the same conversation:
 *     CONFIRMED PLAUSIBLE — createGroupConversation + addMemberToConversation can
 *     both fire for the same (conversation, recipient) pair if the UI or a race
 *     allows it. This is the most actionable root cause.
 *
 * The fix: switch the dedup check to read raw CoValue IDs directly from the
 * underlying cojson list, bypassing the proxy/subscription-scope machinery
 * entirely. This is more robust and eliminates any future uncertainty about
 * proxy resolution in non-reactive contexts.
 *
 *   // Before (proxy-based, subject to subscription scope edge cases):
 *   const alreadyKnown = Array.from(known).some(c => c?.$jazz?.id === conversationID);
 *
 *   // After (raw-ID, subscription-scope-free):
 *   const rawLength = (known as any).$jazz.raw.length();
 *   let alreadyKnown = false;
 *   for (let i = 0; i < rawLength; i++) {
 *     if ((known as any).$jazz.raw.get(i) === conversationID) {
 *       alreadyKnown = true; break;
 *     }
 *   }
 */
import { describe, it, expect } from "vitest";
import { createJazzTestAccount, linkAccounts } from "jazz-tools/testing";
import { Group, co } from "jazz-tools";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Conversation } from "@/jazz/schema/Conversation";
import { Message } from "@/jazz/schema/Message";
import { dedupeConversationsByID, selfHealKnownConversations } from "@/jazz/conversation";

// ---------------------------------------------------------------------------
// Drain logic replicated verbatim from useConversationInboxSubscription
// (PRE-FIX version — proxy-based dedup, under test)
// ---------------------------------------------------------------------------
async function drainConversationNotification_OLD(
  me: any,
  conversationID: string,
): Promise<void> {
  const conversation = await Conversation.load(conversationID as any, {
    loadAs: me,
    resolve: {},
  });
  if (!conversation) return;

  const known = me?.root?.knownConversations;
  if (!known || typeof (known as any).$jazz?.push !== "function") return;
  const alreadyKnown = Array.from(known as Iterable<any>).some(
    (c: any) => c?.$jazz?.id === conversationID,
  );
  if (alreadyKnown) return;

  (known as any).$jazz.push(conversation);
}

// ---------------------------------------------------------------------------
// Drain logic with the FIX applied — raw-ID dedup, subscription-scope-free
// ---------------------------------------------------------------------------
async function drainConversationNotification_FIXED(
  me: any,
  conversationID: string,
): Promise<void> {
  const conversation = await Conversation.load(conversationID as any, {
    loadAs: me,
    resolve: {},
  });
  if (!conversation) return;

  const known = me?.root?.knownConversations;
  if (!known || typeof (known as any).$jazz?.push !== "function") return;

  // Dedup by raw ID — reads cojson list entries directly, bypassing proxy.
  const rawLength = (known as any).$jazz.raw.length();
  let alreadyKnown = false;
  for (let i = 0; i < rawLength; i++) {
    if ((known as any).$jazz.raw.get(i) === conversationID) {
      alreadyKnown = true;
      break;
    }
  }
  if (alreadyKnown) return;

  (known as any).$jazz.push(conversation);
}

// ---------------------------------------------------------------------------
// Helper: create a group conversation visible to bob
// ---------------------------------------------------------------------------
async function makeGroupConversation(alice: any, bob: any) {
  const conversationGroup = Group.create({ owner: alice });
  conversationGroup.addMember(bob, "writer");
  const conversation = Conversation.create(
    {
      title: "Test Group",
      createdAt: new Date(),
      createdBy: alice.$jazz.id,
      messages: co.list(Message).create([], { owner: conversationGroup }),
    },
    { owner: conversationGroup },
  );
  return conversation;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("knownConversations dedup — raw-ID guard (regression for group duplicate)", () => {
  it(
    "raw-ID dedup: two sequential drain calls produce EXACTLY ONE entry",
    async () => {
      const alice = await createJazzTestAccount({
        AccountSchema: ArcanAccount,
        creationProps: { name: "Alice" },
        isCurrentActiveAccount: true,
      });
      const bob = await createJazzTestAccount({
        AccountSchema: ArcanAccount,
        creationProps: { name: "Bob" },
        isCurrentActiveAccount: false,
      });
      await linkAccounts(alice, bob);

      const conversation = await makeGroupConversation(alice, bob);
      const conversationID = (conversation as any).$jazz.id as string;

      expect(Array.from(bob.root.knownConversations).length).toBe(0);

      // Simulate two sequential inbox notifications for the same conversation.
      // (e.g. createGroupConversation fired notification #1, addMemberToConversation
      // fired notification #2 for the same recipient on the same conversation.)
      await drainConversationNotification_FIXED(bob, conversationID);
      await drainConversationNotification_FIXED(bob, conversationID);

      const entries = Array.from(bob.root.knownConversations);
      expect(entries).toHaveLength(1);
      expect((entries[0] as any)?.$jazz?.id).toBe(conversationID);
    },
  );

  it(
    "raw-ID dedup: two concurrent drain calls produce EXACTLY ONE entry",
    async () => {
      const alice = await createJazzTestAccount({
        AccountSchema: ArcanAccount,
        creationProps: { name: "Alice" },
        isCurrentActiveAccount: true,
      });
      const bob = await createJazzTestAccount({
        AccountSchema: ArcanAccount,
        creationProps: { name: "Bob" },
        isCurrentActiveAccount: false,
      });
      await linkAccounts(alice, bob);

      const conversation = await makeGroupConversation(alice, bob);
      const conversationID = (conversation as any).$jazz.id as string;

      expect(Array.from(bob.root.knownConversations).length).toBe(0);

      await Promise.all([
        drainConversationNotification_FIXED(bob, conversationID),
        drainConversationNotification_FIXED(bob, conversationID),
      ]);

      const entries = Array.from(bob.root.knownConversations);
      expect(entries).toHaveLength(1);
      expect((entries[0] as any)?.$jazz?.id).toBe(conversationID);
    },
  );

  it(
    "proxy-based dedup (OLD): sequential drain calls also produce EXACTLY ONE entry (sanity)",
    async () => {
      // Confirms that even the old proxy-based check works correctly in the
      // test environment for sequential calls. The fix is a robustness
      // improvement, not a workaround for a detected proxy failure.
      const alice = await createJazzTestAccount({
        AccountSchema: ArcanAccount,
        creationProps: { name: "Alice" },
        isCurrentActiveAccount: true,
      });
      const bob = await createJazzTestAccount({
        AccountSchema: ArcanAccount,
        creationProps: { name: "Bob" },
        isCurrentActiveAccount: false,
      });
      await linkAccounts(alice, bob);

      const conversation = await makeGroupConversation(alice, bob);
      const conversationID = (conversation as any).$jazz.id as string;

      expect(Array.from(bob.root.knownConversations).length).toBe(0);

      await drainConversationNotification_OLD(bob, conversationID);
      await drainConversationNotification_OLD(bob, conversationID);

      const entries = Array.from(bob.root.knownConversations);
      expect(entries).toHaveLength(1);
    },
  );

  it(
    "verifies raw.$jazz.raw.get(i) returns the correct conversation ID for existing entries",
    async () => {
      // Directly verifies the raw-ID access pattern used in the fix.
      const alice = await createJazzTestAccount({
        AccountSchema: ArcanAccount,
        creationProps: { name: "Alice" },
        isCurrentActiveAccount: true,
      });
      const bob = await createJazzTestAccount({
        AccountSchema: ArcanAccount,
        creationProps: { name: "Bob" },
        isCurrentActiveAccount: false,
      });
      await linkAccounts(alice, bob);

      const conversation = await makeGroupConversation(alice, bob);
      const conversationID = (conversation as any).$jazz.id as string;

      // Manually push to verify the raw-ID access pattern
      bob.root.knownConversations.$jazz.push(conversation);

      const known = bob.root.knownConversations;
      const rawLength = (known as any).$jazz.raw.length();
      expect(rawLength).toBe(1);

      const rawID = (known as any).$jazz.raw.get(0);
      expect(rawID).toBe(conversationID);
    },
  );
});

// ---------------------------------------------------------------------------
// NEW: render-time dedup helper + startup self-heal
// ---------------------------------------------------------------------------

describe("dedupeConversationsByID — render-time belt", () => {
  it(
    "returns a single row when the same conversation appears twice in the list",
    async () => {
      const alice = await createJazzTestAccount({
        AccountSchema: ArcanAccount,
        creationProps: { name: "Alice" },
        isCurrentActiveAccount: true,
      });
      const bob = await createJazzTestAccount({
        AccountSchema: ArcanAccount,
        creationProps: { name: "Bob" },
        isCurrentActiveAccount: false,
      });
      await linkAccounts(alice, bob);

      const conversation = await makeGroupConversation(alice, bob);

      // Simulate the CRDT-merge duplicate: same CoValue reference twice
      const duplicatedList = [conversation, conversation];

      const deduped = dedupeConversationsByID(duplicatedList);

      expect(deduped).toHaveLength(1);
      expect((deduped[0] as any)?.$jazz?.id).toBe(
        (conversation as any).$jazz.id,
      );
    },
  );

  it("passes through a clean list unchanged", async () => {
    const alice = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });
    const bob = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Bob" },
      isCurrentActiveAccount: false,
    });
    const charlie = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Charlie" },
      isCurrentActiveAccount: false,
    });
    await linkAccounts(alice, bob);
    await linkAccounts(alice, charlie);

    const conv1 = await makeGroupConversation(alice, bob);
    const conv2 = await makeGroupConversation(alice, charlie);

    const deduped = dedupeConversationsByID([conv1, conv2]);

    expect(deduped).toHaveLength(2);
  });

  it("filters nullish entries", () => {
    const deduped = dedupeConversationsByID([null, undefined, null]);
    expect(deduped).toHaveLength(0);
  });
});

describe("selfHealKnownConversations — startup data fix", () => {
  it(
    "removes the duplicate entry when knownConversations contains the same ID twice",
    async () => {
      const alice = await createJazzTestAccount({
        AccountSchema: ArcanAccount,
        creationProps: { name: "Alice" },
        isCurrentActiveAccount: true,
      });
      const bob = await createJazzTestAccount({
        AccountSchema: ArcanAccount,
        creationProps: { name: "Bob" },
        isCurrentActiveAccount: false,
      });
      await linkAccounts(alice, bob);

      const conversation = await makeGroupConversation(alice, bob);
      const conversationID = (conversation as any).$jazz.id as string;

      // Inject the duplicate directly — simulating what two-device CRDT merge produces
      bob.root.knownConversations.$jazz.push(conversation);
      bob.root.knownConversations.$jazz.push(conversation);

      expect(bob.root.knownConversations.length).toBe(2);

      selfHealKnownConversations(bob as any);

      expect(bob.root.knownConversations.length).toBe(1);
      // The surviving entry must be the correct conversation
      const surviving = (bob.root.knownConversations as any).$jazz.refs[0];
      expect(surviving.id).toBe(conversationID);
    },
  );

  it(
    "is a no-op when knownConversations has no duplicates",
    async () => {
      const alice = await createJazzTestAccount({
        AccountSchema: ArcanAccount,
        creationProps: { name: "Alice" },
        isCurrentActiveAccount: true,
      });
      const bob = await createJazzTestAccount({
        AccountSchema: ArcanAccount,
        creationProps: { name: "Bob" },
        isCurrentActiveAccount: false,
      });
      await linkAccounts(alice, bob);

      const conversation = await makeGroupConversation(alice, bob);

      bob.root.knownConversations.$jazz.push(conversation);

      expect(bob.root.knownConversations.length).toBe(1);

      selfHealKnownConversations(bob as any);

      // Length unchanged, still exactly 1
      expect(bob.root.knownConversations.length).toBe(1);
    },
  );

  it(
    "is a no-op on an empty list",
    async () => {
      const alice = await createJazzTestAccount({
        AccountSchema: ArcanAccount,
        creationProps: { name: "Alice" },
        isCurrentActiveAccount: true,
      });

      expect(alice.root.knownConversations.length).toBe(0);

      selfHealKnownConversations(alice as any);

      expect(alice.root.knownConversations.length).toBe(0);
    },
  );
});
