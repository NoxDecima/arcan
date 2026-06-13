import { useEffect } from "react";
import { Group, Account, co, InboxSender, Inbox } from "jazz-tools";
import { z } from "jazz-tools";
import { Conversation } from "@/jazz/schema/Conversation";
import { Message } from "@/jazz/schema/Message";
import { SystemEvent } from "@/jazz/schema/SystemEvent";
import { createConnectionRequest, GROUP_REQUEST_TTL_MS } from "@/jazz/invitations";

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
 * Append a SystemEvent to the conversation's sidecar log.
 *
 * Caller MUST have write access to the conversation's owning group. For
 * leaveConversation specifically, this MUST be called BEFORE self-revoke —
 * once the leaver's role is revoked, $jazz.push will be rejected by cojson.
 *
 * Defensive: if `conversation.systemEvents` is undefined (pre-Slice-4
 * conversation created without the field), the push will fail. We accept
 * this — existing conversations get no events; new ones do. The render
 * path uses `?? []` to handle the missing-field case.
 */
function writeSystemEvent(
  me: Account,
  conversation: any,
  payload: {
    kind: "added" | "removed" | "left" | "promoted" | "renamed";
    targetAccountID?: string;
    newTitle?: string;
  },
): void {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) return;
  const events = conversation.systemEvents;
  if (!events || typeof events.$jazz?.push !== "function") return;
  const event = SystemEvent.create(
    {
      kind: payload.kind,
      actorAccountID: (me as any).$jazz.id as string,
      targetAccountID: payload.targetAccountID,
      newTitle: payload.newTitle,
      occurredAt: new Date(),
    },
    { owner: conversationGroup },
  );
  events.$jazz.push(event);
}

export async function findOrCreate1to1Conversation(
  me: Account,
  contact: any,
): Promise<any> {
  const otherAccountID = contact.contactAccountID as string;
  const myAccountID = (me as any).$jazz?.id as string;

  /**
   * Safely iterate knownConversations. The list may be a NotLoaded CoValue
   * proxy (truthy but not iterable) if the calling component's resolve query
   * doesn't include knownConversations. Guard with both existence and
   * iterability checks.
   */
  function iterateKnown(list: any): any[] {
    if (!list || typeof list[Symbol.iterator] !== "function") return [];
    try {
      return Array.from(list);
    } catch {
      return [];
    }
  }

  /**
   * A conversation matches "the 1:1 with this contact" iff its direct admin-
   * or-writer members form exactly the set {me, otherAccountID}. This replaces
   * the prior `kind === "dm"` filter — see Slice 3c §2 (drop-the-kind-field).
   * A former 3-member group that decayed to 2 members WILL match; that's
   * intentional: a conversation between exactly me and Bob IS my conversation
   * with Bob, regardless of how it started.
   */
  function isOneToOneWith(conversation: any, otherID: string): boolean {
    const group = conversation?.$jazz?.owner;
    if (!group) return false;
    let members: any[] = [];
    try {
      members = group.getDirectMembers();
    } catch {
      return false;
    }
    const participantIDs = members
      .filter((m: any) => m.role === "admin" || m.role === "writer")
      .map((m: any) => m.account?.$jazz?.id)
      .filter((id: any) => typeof id === "string");
    if (participantIDs.length !== 2) return false;
    return (
      participantIDs.includes(myAccountID) &&
      participantIDs.includes(otherID)
    );
  }

  // Search knownConversations for an existing 1:1 with this contact
  const known = (me as any).root?.knownConversations;
  for (const c of iterateKnown(known)) {
    if (c && isOneToOneWith(c, otherAccountID)) return c;
  }

  // Defensive wait against the duplicate-creation race: if the other party
  // just created the conversation, our Inbox subscription may still be
  // processing the notification. Brief wait + recheck.
  await new Promise((r) => setTimeout(r, 300));
  const knownAfterWait = (me as any).root?.knownConversations;
  for (const c of iterateKnown(knownAfterWait)) {
    if (c && isOneToOneWith(c, otherAccountID)) return c;
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
      createdAt: new Date(),
      createdBy: (me as any).$jazz.id,
      messages: co.list(Message).create([], { owner: conversationGroup }),
      systemEvents: co.list(SystemEvent).create([], { owner: conversationGroup }),
    },
    { owner: conversationGroup },
  );

  // Push to my own knownConversations
  (me as any).root.knownConversations.$jazz.push(conversation);

  // Notify the other party via their inbox so their sidebar can auto-discover
  // the conversation without requiring them to navigate to an explicit URL.
  const conversationID = (conversation as any).$jazz.id as string;
  void (async () => {
    try {
      // Fresh notification group — the other account has no prior role here,
      // so InboxSender's add-as-writer call won't conflict with admin role.
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
 * Create a group conversation with multiple participants.
 *
 * Creator becomes the implicit admin (via Group.create). All participants
 * are added as "writer" by default (admin-only change must go through
 * promoteToAdmin). Pushes to me.root.knownConversations and fires
 * fire-and-forget Inbox notifications to each participant.
 *
 * `title` is required for group conversations.
 */
export async function createGroupConversation(
  me: Account,
  participantAccountIDs: string[],
  title: string,
): Promise<any> {
  const conversationGroup = Group.create({ owner: me });

  for (const accountID of participantAccountIDs) {
    const acc = await loadAccountByID(me, accountID);
    if (acc) {
      conversationGroup.addMember(acc, "writer"); // groups: writer by default (not admin)
    }
  }

  const conversation = Conversation.create(
    {
      title,
      createdAt: new Date(),
      createdBy: (me as any).$jazz.id,
      messages: co.list(Message).create([], { owner: conversationGroup }),
      systemEvents: co.list(SystemEvent).create([], { owner: conversationGroup }),
    },
    { owner: conversationGroup },
  );

  // Push to my own knownConversations
  (me as any).root.knownConversations.$jazz.push(conversation);

  // Notify each participant via Inbox (fire-and-forget, parallel)
  const conversationID = (conversation as any).$jazz.id as string;
  for (const accountID of participantAccountIDs) {
    void (async () => {
      try {
        const notificationGroup = Group.create({ owner: me });
        const notification = ConversationNotification.create(
          { conversationID },
          { owner: notificationGroup },
        );
        const sender = await InboxSender.load<typeof notification>(
          accountID as any,
          me,
        );
        await sender.sendMessage(notification);
      } catch (e) {
        console.warn(
          `[inbox] Failed to deliver group conversation to ${accountID}:`,
          e,
        );
      }
    })();
  }

  return conversation;
}

/**
 * Group-channel: request a connection from a co-member of a conversation. Delivers a
 * ConnectionRequest with channel='group', expiresAt = createdAt + 30d. 1:1 inbox delivery.
 */
export async function requestConnectionFromGroupMember(
  me: Account,
  targetAccountID: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + GROUP_REQUEST_TTL_MS);
  await createConnectionRequest(me as any, targetAccountID, "group", { expiresAt });
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
 * Leave a conversation.
 *
 * Writes a `left` system event for other members to see, self-revokes from
 * the ConversationGroup, and removes the conversation from
 * me.root.knownConversations. Once revoked, Jazz no longer surfaces the
 * conversation's contents to me — so we drop the dangling reference rather
 * than keep an unreadable entry in the user's list.
 *
 * For last-admin leaves, the caller should first call promoteToAdmin on
 * another member (see LeaveWithPromoteDialog) — this function does not
 * handle that flow.
 */
export async function leaveConversation(
  me: Account,
  conversation: any,
): Promise<void> {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }

  // Write the "left" event BEFORE self-revoking — once removeMember(me) lands,
  // me no longer has write permission to the conversation's owning group.
  writeSystemEvent(me, conversation, {
    kind: "left",
    // targetAccountID intentionally omitted — actor IS the target for "left"
  });

  // Yield to the event loop so cojson finishes validating the SystemEvent
  // create + push transactions before we revoke our own admin role. Without
  // this, the revoke can race ahead and retroactively invalidate the event
  // write (cojson rejects transactions from a now-revoked author). Observed
  // as a 1-in-3 unit test flake during Phase B verification.
  await new Promise((resolve) => setTimeout(resolve, 0));

  // Revoke myself from the ConversationGroup; Jazz auto-rotates the readKey
  conversationGroup.removeMember(me);

  // Drop the conversation from my list — Jazz revocation hides its contents
  // from me, so a dangling reference would only show as a broken row.
  await removeFromKnownConversations(me, conversation);
}

// ----- member management primitives -----

/**
 * Add a new member to a group conversation with the given role (default writer).
 * Sends an Inbox notification so the new member's sidebar auto-discovers.
 *
 * Admin-only action; caller should check role before invoking. Jazz validators
 * will reject if `me` doesn't have admin/manager role on the conversationGroup.
 */
export async function addMemberToConversation(
  me: Account,
  conversation: any,
  newAccountID: string,
  role: "admin" | "writer" = "writer",
): Promise<void> {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }

  const newAccount = await loadAccountByID(me, newAccountID);
  if (!newAccount) {
    throw new Error(`Cannot load account ${newAccountID}`);
  }

  writeSystemEvent(me, conversation, {
    kind: "added",
    targetAccountID: newAccountID,
  });

  conversationGroup.addMember(newAccount, role);

  // Notify the new member via their Inbox so their sidebar auto-discovers
  const conversationID = conversation.$jazz.id as string;
  void (async () => {
    try {
      const notificationGroup = Group.create({ owner: me });
      const notification = ConversationNotification.create(
        { conversationID },
        { owner: notificationGroup },
      );
      const sender = await InboxSender.load<typeof notification>(
        newAccountID as any,
        me,
      );
      await sender.sendMessage(notification);
    } catch (e) {
      console.warn(
        `[inbox] Failed to deliver group invite to ${newAccountID}:`,
        e,
      );
    }
  })();
}

/**
 * Remove a member from a group conversation.
 *
 * Admin-only action; caller should check role before invoking. Jazz auto-rotates
 * the readKey when a member is removed.
 */
export async function removeMemberFromConversation(
  me: Account,
  conversation: any,
  targetAccountID: string,
): Promise<void> {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }

  const targetAccount = await loadAccountByID(me, targetAccountID);
  if (!targetAccount) {
    throw new Error(`Cannot load account ${targetAccountID}`);
  }

  writeSystemEvent(me, conversation, {
    kind: "removed",
    targetAccountID,
  });

  conversationGroup.removeMember(targetAccount);
}

/**
 * Promote a writer to admin. Admin-only action.
 *
 * Jazz allows re-assigning an existing member's role by calling addMember
 * again with a different role — this overwrites the prior role.
 */
export async function promoteToAdmin(
  me: Account,
  conversation: any,
  targetAccountID: string,
): Promise<void> {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }
  const targetAccount = await loadAccountByID(me, targetAccountID);
  if (!targetAccount) {
    throw new Error(`Cannot load account ${targetAccountID}`);
  }
  writeSystemEvent(me, conversation, {
    kind: "promoted",
    targetAccountID,
  });
  // Re-adding with a different role overwrites the prior role
  conversationGroup.addMember(targetAccount, "admin");
}

/**
 * Demote an admin to writer. Admin-only action.
 *
 * Caller should check `isLastAdmin(me, conversation)` first — if true,
 * the sole admin cannot demote themselves without promoting another first.
 *
 * IMPORTANT cojson constraint (verified 0.20.18): an admin peer CANNOT
 * downgrade another admin to writer — neither via `addMember(target, "writer")`
 * (throws "Failed to set role writer to <id> (role of current account is admin)")
 * nor via `removeMember(target)` (throws "Failed to revoke role to <id>...").
 * Only the target admin themselves can relinquish admin role.
 *
 * In practice, the UI should only offer "Demote" on writers, never on admins.
 * This function attempts the demotion and lets the cojson error surface if the
 * caller violates the constraint — do not catch it silently.
 */
export async function demoteToWriter(
  me: Account,
  conversation: any,
  targetAccountID: string,
): Promise<void> {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }
  const targetAccount = await loadAccountByID(me, targetAccountID);
  if (!targetAccount) {
    throw new Error(`Cannot load account ${targetAccountID}`);
  }
  // Attempt role downgrade — will throw if target is already admin (cojson
  // prevents admin-to-admin demotion at the protocol level).
  conversationGroup.addMember(targetAccount, "writer");
}

/**
 * Update the conversation title on any conversation.
 *
 * Slice 3c removed the kind="group" gate — titles are editable on every
 * conversation regardless of member count. Two-person conversations
 * typically have no title (the sidebar synthesizes a label from the other
 * participant's name); admins may still set one if they want a custom label.
 *
 * The caller is responsible for admin-permission gating in the UI; cojson
 * will reject the underlying $jazz.set at the protocol level if the caller
 * lacks write access to the conversation.
 */
export async function updateConversationTitle(
  me: Account,
  conversation: any,
  newTitle: string,
): Promise<void> {
  const trimmed = newTitle.trim();
  if (!trimmed) throw new Error("title cannot be empty");
  if (trimmed.length > 100) throw new Error("title too long (max 100 chars)");

  conversation.$jazz.set("title", trimmed);

  // Append a 'renamed' SystemEvent to the conversation's sidecar log.
  writeSystemEvent(me, conversation, {
    kind: "renamed",
    newTitle: trimmed,
  });
}

/**
 * Set or clear the conversation's icon. Admins only (UI gates this;
 * cojson permission gating is a future hardening per the spec).
 *
 * Pass null/undefined to clear (reverts to monogram).
 */
export async function updateConversationIcon(
  _me: Account,
  conversation: any,
  icon: any | null,
): Promise<void> {
  conversation.$jazz.set("icon", icon ?? undefined);
}

/**
 * Returns true when `me` is the only direct admin of the conversation's group.
 * Used to decide whether the leave flow needs to prompt for promotion of another
 * member before the admin can leave.
 */
export function isLastAdmin(me: Account, conversation: any): boolean {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) return false;
  const admins = conversationGroup
    .getDirectMembers()
    .filter((m: any) => m.role === "admin");
  return (
    admins.length === 1 &&
    admins[0]?.account?.$jazz?.id === (me as any).$jazz?.id
  );
}

/**
 * True when `me` is no longer a participant in the conversation.
 *
 * Used by:
 *   - the sidebar, to hide conversations the user has been kicked from
 *     (they would render as broken stubs because Jazz revocation hides their
 *     contents) — passes `{ treatNotLoadedAsArchived: true }` so $each-with-
 *     $onError-catch NotLoaded entries get filtered.
 *   - the detail / members routes, to redirect away when the role is
 *     definitively revoked — uses the default (strict) mode so transient
 *     NotLoaded states during initial sync don't trigger spurious redirects.
 */
export function isArchived(
  me: Account,
  conversation: any,
  opts: { treatNotLoadedAsArchived?: boolean } = {},
): boolean {
  const { treatNotLoadedAsArchived = false } = opts;

  if (conversation?.$isLoaded === false) return treatNotLoadedAsArchived;

  const group = conversation?.$jazz?.owner as Group | undefined;
  if (!group) return false;

  if ((group as any)?.$isLoaded === false) return treatNotLoadedAsArchived;

  const myID = (me as any).$jazz?.id;
  if (!myID) return false;
  return group.getRoleOf(myID) === undefined;
}

/**
 * Remove a conversation reference from me.root.knownConversations.
 *
 * Used by leaveConversation after self-revoke; also serves as the cleanup
 * primitive for kicked entries that we want to permanently drop. No-op when
 * the conversation is not in the list.
 */
async function removeFromKnownConversations(
  me: Account,
  conversation: any,
): Promise<void> {
  const known = (me as any).root?.knownConversations;
  if (!known || typeof known.$jazz?.remove !== "function") return;
  const conversationID = conversation?.$jazz?.id;
  if (!conversationID) return;
  for (let i = 0; i < known.length; i++) {
    const entry = known[i];
    if (entry?.$jazz?.id === conversationID) {
      known.$jazz.remove(i);
      return;
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
    // Account.load returns Settled<Resolved<A, R>> — may be null if not found,
    // or an Inaccessible variant. Callers already treat the return as nullable.
    return (result ?? null) as Account | null;
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
 * React hook: subscribe to the current user's inbox and push incoming
 * Conversations to me.root.knownConversations for sidebar auto-discovery.
 *
 * Call this once in the authenticated branch of App.tsx. The inbox is
 * a persistent CoStream — messages that arrived before the current session
 * are replayed on subscribe, so Bob will discover conversations even if he
 * was offline when Alice created one.
 *
 * Replaces the Slice 3a behavior of setting contact.linkedConversation.
 * All conversation kinds (1:1 and group) use the same knownConversations path.
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
          async (notification: any) => {
            // Load the actual Conversation by ID from the notification payload
            const conversationID = notification?.conversationID;
            if (!conversationID) return;
            try {
              const conversation = await Conversation.load(conversationID, {
                loadAs: me,
                resolve: {},
              });
              if (!conversation) return;

              // Dedup: only push if not already in knownConversations.
              // Guard: known.$jazz.push may not be available if knownConversations
              // is a NotLoaded proxy (not in the resolve query for this account
              // load). Check typeof before calling to avoid runtime errors.
              const known = me?.root?.knownConversations;
              if (!known || typeof (known as any).$jazz?.push !== "function") return;
              const alreadyKnown = Array.from(known as Iterable<any>).some(
                (c: any) => c?.$jazz?.id === conversationID,
              );
              if (alreadyKnown) return;

              (known as any).$jazz.push(conversation);
            } catch (e) {
              console.warn("[inbox] Failed to push conversation to knownConversations:", e);
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
