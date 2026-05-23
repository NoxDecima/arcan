import { useEffect } from "react";
import { Group, Account, co, InboxSender, Inbox } from "jazz-tools";
import { z } from "jazz-tools";
import { Conversation } from "@/jazz/schema/Conversation";
import { Message } from "@/jazz/schema/Message";

/**
 * Thin notification wrapper sent through the Inbox.
 *
 * We cannot send the Conversation directly because `createInboxMessage`
 * calls `conversationGroup.addMember(bob, "writer")` — and if Bob is
 * already "admin" in the conversationGroup, cojson throws "Failed to set
 * role writer to <bobID> (role of current account is admin)".
 *
 * Solution: wrap just the conversation's CoValue ID in a new CoMap owned
 * by a FRESH group where Bob has no prior membership. `createInboxMessage`
 * adds Bob as "writer" to that fresh group, which succeeds. The inbox
 * callback then loads the actual Conversation by ID.
 */
const ConversationNotification = co.map({
  conversationID: z.string(),
});

/**
 * Find or create a 1:1 conversation between `me` and the account referenced
 * by `contact`. The contact is a Contact CoValue from `me.root.contactBook`.
 *
 * Steps:
 *   1. Search me.root.knownConversations for an existing kind="dm" with this contact.
 *   2. Defensive wait + recheck (300ms) — handles Inbox delivery race.
 *   3. If still not found, create a new ConversationGroup + Conversation.
 *   4. Push the new conversation to me.root.knownConversations.
 *   5. Fire-and-forget Inbox notification to the other party.
 *
 * Returns the Conversation CoValue.
 */
export async function findOrCreate1to1Conversation(
  me: Account,
  contact: any,
): Promise<any> {
  const otherAccountID = contact.contactAccountID as string;

  // Search knownConversations for an existing 1:1 with this contact
  const known = (me as any).root?.knownConversations ?? [];
  for (const c of Array.from(known)) {
    if (!c) continue;
    const cAny = c as any;
    if (cAny.kind !== "dm") continue;
    const group = cAny.$jazz?.owner;
    if (!group) continue;
    const otherMember = group
      .getDirectMembers()
      .find((m: any) => m.account?.$jazz?.id === otherAccountID);
    if (otherMember) {
      return cAny;
    }
  }

  // Defensive wait against the duplicate-creation race: if the other party
  // just created the conversation, our Inbox subscription may still be
  // processing the notification. Brief wait + recheck.
  //
  // 300ms is unnoticeable in the worst case (legitimately new chat with
  // someone who never created one) and prevents the race in the common case
  // (Inbox propagation is near-instant when online).
  await new Promise((r) => setTimeout(r, 300));
  const knownAfterWait = (me as any).root?.knownConversations ?? [];
  for (const c of Array.from(knownAfterWait)) {
    if (!c) continue;
    const cAny = c as any;
    if (cAny.kind !== "dm") continue;
    const group = cAny.$jazz?.owner;
    if (!group) continue;
    const otherMember = group
      .getDirectMembers()
      .find((m: any) => m.account?.$jazz?.id === otherAccountID);
    if (otherMember) {
      return cAny;
    }
  }

  // Load the other account so we can add them as a member
  const otherAccount = await loadAccountByID(me, otherAccountID);
  if (!otherAccount) {
    throw new Error(
      `Cannot load account ${otherAccountID} — contact not reachable`,
    );
  }

  // Create new ConversationGroup with both participants as admin (1:1: both admin)
  const conversationGroup = Group.create({ owner: me });
  conversationGroup.addMember(otherAccount, "admin");

  const conversation = Conversation.create(
    {
      kind: "dm",
      createdAt: new Date(),
      createdBy: (me as any).$jazz.id,
      messages: co.list(Message).create([], { owner: conversationGroup }),
    },
    { owner: conversationGroup },
  );

  // Push to my own knownConversations
  (me as any).root.knownConversations.$jazz.push(conversation);

  // Notify the other party via their inbox so their sidebar can auto-discover
  // the conversation without requiring them to navigate to an explicit URL.
  //
  // We send a thin ConversationNotification wrapper (not the Conversation
  // itself) because `createInboxMessage` tries to add the inbox owner as
  // "writer" to the payload's owning group. Since Bob is already "admin"
  // in the conversationGroup, that addMember call would throw. The
  // notification CoMap is owned by a fresh Group where Bob has no prior
  // membership, so the "writer" grant succeeds.
  //
  // Fire-and-forget: we do NOT await this — sendMessage resolves only after
  // the recipient's inbox subscription processes the message (marks it
  // processed: true). Awaiting would block findOrCreate1to1Conversation
  // until Bob is online and his subscription fires.
  //
  // If the other account doesn't have an inbox yet, the catch handles it
  // gracefully — the conversation is still usable.
  const conversationID = (conversation as any).$jazz.id as string;
  void (async () => {
    try {
      // Create a fresh group for the notification — Bob has no prior role here
      const notificationGroup = Group.create({ owner: me });
      const notification = ConversationNotification.create(
        { conversationID },
        { owner: notificationGroup },
      );
      const sender = await InboxSender.load<typeof notification>(otherAccountID as any, me);
      await sender.sendMessage(notification);
    } catch (e) {
      console.warn("[inbox] Failed to deliver conversation to other party's inbox:", e);
    }
  })();

  return conversation;
}

/**
 * Generic group conversation creation, ready for Slice 3b. Not exposed via
 * UI in Slice 3a — only the 1:1 entry point is wired.
 */
export async function createGroupConversation(
  me: Account,
  participantAccountIDs: string[],
  title?: string,
): Promise<any> {
  const conversationGroup = Group.create({ owner: me });

  for (const accountID of participantAccountIDs) {
    const acc = await loadAccountByID(me, accountID);
    if (acc) {
      conversationGroup.addMember(acc, "admin");
    }
  }

  const conversation = Conversation.create(
    {
      title,
      kind: "group",
      createdAt: new Date(),
      createdBy: (me as any).$jazz.id,
      messages: co.list(Message).create([], { owner: conversationGroup }),
    },
    { owner: conversationGroup },
  );

  return conversation;
}

/**
 * Module-level cache: conversationID → my WriteGroup for that conversation.
 *
 * Avoids the O(n messages) scan on every send by remembering the WriteGroup
 * we found/created the first time. Cache is per-session; cleared on reload
 * or logout, which is fine — we just rebuild via one scan on first use.
 *
 * Keyed only by conversationID because `me` doesn't change within a session.
 */
const writeGroupCache = new Map<string, Group>();

/**
 * Ensure I have a WriteGroup in this conversation. Creates one (parent =
 * conversationGroup mapped reader, self as direct writer) if none exists.
 *
 * Idempotent. Safe to call before every send. O(1) after the first call per
 * conversation thanks to the module-level cache.
 */
export async function ensureMyWriteGroup(
  me: Account,
  conversation: any,
): Promise<Group> {
  const conversationID = conversation.$jazz?.id as string | undefined;
  if (conversationID) {
    const cached = writeGroupCache.get(conversationID);
    if (cached) return cached;
  }

  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }

  // Scan existing messages to find one whose owner Group has me as direct writer
  let wg: Group | undefined;
  const messages = conversation.messages ?? [];
  for (const message of messages) {
    if (!message) continue;
    const owningGroup = (message as any).$jazz?.owner;
    if (owningGroup instanceof Group && isMyDirectWriteGroup(owningGroup, me)) {
      wg = owningGroup;
      break;
    }
  }

  if (!wg) {
    // None found — create a new WriteGroup.
    // Owner (me) is automatically assigned "admin" role by Jazz when the group
    // is created via Group.create({ owner: me }). Admin includes write access,
    // so no explicit addMember(me, "writer") is needed. The parent group is
    // added with "reader" role so all ConversationGroup members can read
    // messages owned by this WriteGroup (cap at reader — see spec §6.1).
    wg = Group.create({ owner: me });
    wg.addMember(conversationGroup, "reader");
  }

  if (conversationID) {
    writeGroupCache.set(conversationID, wg);
  }
  return wg;
}

/**
 * Leave a conversation by revoking self from the ConversationGroup. Jazz
 * rotates the readKey; future messages from remaining members are encrypted
 * under the new key I no longer have access to.
 *
 * Clears any linkedConversation cache in the contact book pointing here.
 */
export async function leaveConversation(
  me: Account,
  conversation: any,
): Promise<void> {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }

  conversationGroup.removeMember(me);

  // Clear any contact cache referencing this conversation.
  // We compare by the conversation's jazz ID (a string like "co_z...").
  // Both direct property assignment and $jazz.set are tried for compatibility.
  const conversationId = conversation.$jazz?.id as string | undefined;
  const contactBook = (me as any).root?.contactBook;
  if (contactBook && conversationId) {
    for (const contact of contactBook) {
      const linkedId = contact?.linkedConversation?.$jazz?.id as string | undefined;
      // Also try the raw ID accessor for unresolved CoValue refs
      const linkedIdAlt = (contact as any)?.linkedConversation?.id as string | undefined;
      if (linkedId === conversationId || linkedIdAlt === conversationId) {
        try {
          // Jazz requires `undefined` (not null) to unset an optional CoValue ref.
          // Proxy set handler throws for direct assignment; use $jazz.set.
          contact.$jazz.set("linkedConversation", undefined as any);
        } catch {
          // ignore — sidebar will handle inaccessible conversations
        }
      }
    }
  }
}

// ----- private helpers -----

/**
 * Load an Account by ID, using `me`'s node as the context.
 *
 * Uses the static `Account.load()` method (verified against jazz-tools 0.20.18
 * — see docs/jazz-api-notes.md §6). The `loadAs` option pins the loading node
 * to ensure we don't try to load from an unknown context.
 */
async function loadAccountByID(me: Account, accountID: string): Promise<Account | null> {
  try {
    const result = await Account.load(accountID as any, {
      loadAs: me,
    });
    // Account.load returns Settled<Resolved<A, R>> — may be null if not found
    return result ?? null;
  } catch {
    return null;
  }
}

/**
 * Check whether `me` is the sole direct admin on a Group (owner-pattern
 * WriteGroup). Since Group.create({ owner: me }) assigns the creator as
 * "admin" (not "writer"), we check for admin role, not writer.
 * Uses `group.getDirectMembers()` which returns only non-inherited members.
 */
function isMyDirectWriteGroup(group: Group, me: Account): boolean {
  const directAdmins = group
    .getDirectMembers()
    .filter((m) => m.role === "admin");
  return (
    directAdmins.length === 1 &&
    directAdmins[0].id === (me as any).$jazz.id
  );
}

/**
 * React hook: subscribe to the current user's inbox and populate
 * Contact.linkedConversation when an incoming Conversation matches a
 * known contact.
 *
 * Call this once in the authenticated branch of App.tsx. The inbox is
 * a persistent CoStream — messages that arrived before the current session
 * are replayed on subscribe, so Bob will discover conversations even if he
 * was offline when Alice created one.
 *
 * The effect re-runs only when `me.$isLoaded` or `me.$jazz.id` changes
 * (i.e. on sign-in / account switch), not on every render.
 */
export function useConversationInboxSubscription(me: any) {
  useEffect(() => {
    if (!me?.$isLoaded) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const inbox = await Inbox.load(me);
        if (cancelled) return;
        unsubscribe = inbox.subscribe(
          ConversationNotification,
          async (notification: any, senderAccountID: any) => {
            const contactBook = me?.root?.contactBook;
            if (!contactBook) return;
            // Find the contact whose accountID matches the sender
            const contact = Array.from(contactBook as Iterable<any>).find(
              (c: any) => c?.contactAccountID === senderAccountID,
            );
            if (!contact) return;
            if (contact.linkedConversation) return; // already set — idempotent
            // Load the actual Conversation by ID from the notification payload
            const conversationID = notification?.conversationID;
            if (!conversationID) return;
            try {
              const conversation = await Conversation.load(conversationID, {
                loadAs: me,
                resolve: {},
              });
              if (!conversation) return;
              contact.$jazz.set("linkedConversation", conversation);
            } catch (e) {
              console.warn("[inbox] Failed to set linkedConversation:", e);
            }
          },
        );
      } catch (e) {
        console.warn("[inbox] Failed to subscribe to inbox:", e);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.$isLoaded, (me as any)?.$jazz?.id]);
}
