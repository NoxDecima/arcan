import { useEffect } from "react";
import { Group, Account, co, InboxSender, Inbox } from "jazz-tools";
import { Conversation } from "@/jazz/schema/Conversation";
import { Message } from "@/jazz/schema/Message";

/**
 * Find or create a 1:1 conversation between `me` and the account referenced
 * by `contact`. The contact is a Contact CoValue from `me.root.contactBook`.
 *
 * Steps:
 *   1. If contact.linkedConversation is set, return it.
 *   2. Otherwise create a new ConversationGroup + Conversation, set the cache.
 *
 * Returns the Conversation CoValue.
 *
 * Note: The defensive scan step (iterate my ConversationGroups to find one
 * with the contact as the other member) is deferred — it requires Jazz's
 * group-membership graph traversal API which is not yet documented. The
 * linkedConversation cache is the primary lookup mechanism; both sides
 * converge because when Alice creates the conversation she also sets
 * contact.linkedConversation, and Bob's side populates on first "Start chat".
 */
export async function findOrCreate1to1Conversation(
  me: Account,
  contact: any,
): Promise<any> {
  if (contact.linkedConversation) {
    return contact.linkedConversation;
  }

  // Load the other account so we can add them as a member
  const otherAccountID = contact.contactAccountID as string;
  const otherAccount = await loadAccountByID(me, otherAccountID);
  if (!otherAccount) {
    throw new Error(
      `Cannot load account ${otherAccountID} — contact not reachable`,
    );
  }

  // Create new ConversationGroup with both participants as admin
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

  contact.$jazz.set("linkedConversation", conversation);

  // Notify the other party via their inbox so their sidebar can auto-discover
  // the conversation without requiring them to navigate to an explicit URL.
  // If the other account doesn't have an inbox yet (legacy account before
  // Change 1's migration ran), the catch handles it gracefully — the
  // conversation is still usable, they just won't auto-discover until
  // their account is upgraded.
  try {
    const sender = await InboxSender.load<typeof conversation>(otherAccountID as any, me);
    await sender.sendMessage(conversation);
  } catch (e) {
    console.warn("[inbox] Failed to deliver conversation to other party's inbox:", e);
  }

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
 * Ensure I have a WriteGroup in this conversation. Creates one (parent =
 * conversationGroup mapped reader, self as direct writer) if none exists.
 *
 * Idempotent. Safe to call before every send.
 *
 * Scan: iterates conversation.messages to find a message whose owning Group
 * has `me` as a direct writer. This is O(n messages) but fine for v1 — a
 * future optimization could cache the participant→WriteGroup mapping.
 */
export async function ensureMyWriteGroup(
  me: Account,
  conversation: any,
): Promise<Group> {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }

  // Scan existing messages to find one whose owner Group has me as direct writer
  const messages = conversation.messages ?? [];
  for (const message of messages) {
    if (!message) continue;
    const owningGroup = (message as any).$jazz?.owner;
    if (owningGroup instanceof Group && isMyDirectWriteGroup(owningGroup, me)) {
      return owningGroup;
    }
  }

  // None found — create a new WriteGroup.
  // Owner (me) is automatically assigned "admin" role by Jazz when the group is
  // created via Group.create({ owner: me }). Admin includes write access, so no
  // explicit addMember(me, "writer") is needed. The parent group is added with
  // "reader" role so all ConversationGroup members can read messages owned by
  // this WriteGroup (cap at reader — see spec §6.1).
  const wg = Group.create({ owner: me });
  wg.addMember(conversationGroup, "reader");
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
          Conversation,
          async (conversation: any, senderAccountID: any) => {
            const contactBook = me?.root?.contactBook;
            if (!contactBook) return;
            // Find the contact whose accountID matches the sender
            const contact = Array.from(contactBook as Iterable<any>).find(
              (c: any) => c?.contactAccountID === senderAccountID,
            );
            if (!contact) return;
            if (contact.linkedConversation) return; // already set — idempotent
            try {
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
