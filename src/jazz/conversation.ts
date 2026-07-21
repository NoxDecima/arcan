import { useEffect, useRef } from "react";
import { Group, Account, co, InboxSender } from "jazz-tools";
import { z } from "jazz-tools";
import { useAccount } from "jazz-tools/react";
import { Conversation } from "@/jazz/schema/Conversation";
import { Message } from "@/jazz/schema/Message";
import { SystemEvent } from "@/jazz/schema/SystemEvent";
import { PendingNotification } from "./schema/PendingNotification";
import { ArcanAccount } from "./schema/ArcanAccount";
import {
  sendConnectionRequest,
  withTimeout,
  REQUEST_ACK_TIMEOUT_MS,
  type SendConnectionRequestResult,
} from "./handshake";
import { getForeignAccountPubkeyHex } from "@/auth/pubkey";

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
    kind: "added" | "removed" | "left" | "promoted" | "renamed" | "icon";
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
function isOneToOneWith(
  myAccountID: string,
  conversation: any,
  otherID: string,
): boolean {
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

/**
 * Find the live 1:1 conversation with `otherAccountID` in
 * me.root.knownConversations, or null. Synchronous find-only variant of
 * findOrCreate1to1Conversation — extracted (2026-07-09) so the profile
 * danger zone can decide whether to offer "delete conversation" without
 * creating one as a side effect.
 */
export function find1to1Conversation(
  me: Account,
  otherAccountID: string,
): any | null {
  const myAccountID = (me as any).$jazz?.id as string;
  if (!myAccountID) return null;
  const known = (me as any).root?.knownConversations;
  for (const c of iterateKnown(known)) {
    if (c && isOneToOneWith(myAccountID, c, otherAccountID)) return c;
  }
  return null;
}

export async function findOrCreate1to1Conversation(
  me: Account,
  contact: any,
): Promise<any> {
  const otherAccountID = contact.contactAccountID as string;

  // Search knownConversations for an existing 1:1 with this contact
  const existing = find1to1Conversation(me, otherAccountID);
  if (existing) return existing;

  // Defensive wait against the duplicate-creation race: if the other party
  // just created the conversation, our Inbox subscription may still be
  // processing the notification. Brief wait + recheck.
  await new Promise((r) => setTimeout(r, 300));
  const afterWait = find1to1Conversation(me, otherAccountID);
  if (afterWait) return afterWait;

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
  void sendConversationNotification(me, conversation, otherAccountID, "conversation");

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

  // Notify each participant via Inbox (background, durable retry state)
  for (const accountID of participantAccountIDs) {
    void sendConversationNotification(me, conversation, accountID, "conversation");
  }

  return conversation;
}

/**
 * Group-channel: request a connection from a co-member of a conversation.
 * Routes through handshake.sendConnectionRequest — the single creation path —
 * so the durable outgoingRequests entry exists and the approval watcher can
 * write the contact on BOTH sides (FM4: previously the requester never got
 * the approver as a contact).
 */
export async function requestConnectionFromGroupMember(
  me: Account,
  targetAccountID: string,
): Promise<SendConnectionRequestResult> {
  const target = await loadAccountByID(me, targetAccountID);
  if (!target) {
    throw new Error(`Cannot load account ${targetAccountID}`);
  }
  let fingerprint = "";
  try {
    // MUST be the foreign-account helper: getAccountPubkeyHex is node-derived
    // and would snapshot MY fingerprint as the counterpart's TOFU pin (C1).
    fingerprint = getForeignAccountPubkeyHex(target as any);
  } catch {
    // fall through to the guard below
  }
  if (!fingerprint) {
    throw new Error(
      `Cannot derive fingerprint for ${targetAccountID} — refusing unpinned request`,
    );
  }
  const displayName =
    (target as any).profile?.displayName ??
    (target as any).profile?.name ??
    "Unknown";
  return sendConnectionRequest(
    me,
    { accountID: targetAccountID, fingerprint, displayName },
    { channel: "group", requestChannel: "group" },
  );
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
): Promise<"added" | "already-member"> {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }

  // Membership pre-check (spec §4): a concurrent admin add must not
  // double-log "added" — and a silent role overwrite (addMember on an
  // existing member re-assigns the role) is surfaced instead of swallowed.
  const existingRole = conversationGroup.getRoleOf(newAccountID as any);
  if (existingRole) return "already-member";

  const newAccount = await loadAccountByID(me, newAccountID);
  if (!newAccount) {
    throw new Error(`Cannot load account ${newAccountID}`);
  }

  writeSystemEvent(me, conversation, {
    kind: "added",
    targetAccountID: newAccountID,
  });

  conversationGroup.addMember(newAccount, role);

  void sendConversationNotification(me, conversation, newAccountID, "member-add");
  return "added";
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
 *
 * Feedback round 2: picture changes land in the sidecar log like renames.
 */
export async function updateConversationIcon(
  me: Account,
  conversation: any,
  icon: any | null,
): Promise<void> {
  conversation.$jazz.set("icon", icon ?? undefined);

  // Feedback round 2: picture changes land in the sidecar log like renames.
  writeSystemEvent(me, conversation, { kind: "icon" });
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

// ----- public dedup helpers -----

/**
 * Render-time belt: given an array of conversation CoValues (which may contain
 * nullish entries), return a new array keeping only the FIRST occurrence of
 * each `$jazz.id`. Filters nullish entries along the way.
 *
 * This is a pure transformation over already-resolved proxy values — it does
 * not touch the CoList itself, so it is safe to call on every render.
 *
 * Exported so it can be unit-tested directly without mounting hooks.
 */
export function dedupeConversationsByID(conversations: any[]): any[] {
  const seen = new Set<string>();
  const result: any[] = [];
  for (const c of conversations) {
    if (c == null) continue;
    const id: string | undefined = c?.$jazz?.id;
    if (!id) {
      // No ID available (unusual edge-case); include it to be safe
      result.push(c);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(c);
  }
  return result;
}

/**
 * Startup self-heal: walk `me.root.knownConversations`, find entries whose
 * CoValue ID has already been seen at an earlier index, and remove them by
 * index. Uses `.$jazz.refs[i].id` (typed access from the CoListJazzApi) to
 * read IDs without triggering proxy resolution.
 *
 * Idempotent and safe to call on every mount — has no effect when the list is
 * already clean. Removes backward so index shifts don't affect earlier items.
 * Silent: no logging, no errors thrown.
 */
export function selfHealKnownConversations(me: any): void {
  const known = me?.root?.knownConversations;
  if (!known || typeof known.$jazz?.remove !== "function") return;

  const refs = known.$jazz?.refs;
  if (!refs || typeof refs.length !== "number") return;

  const seen = new Set<string>();
  const indicesToRemove: number[] = [];

  for (let i = 0; i < refs.length; i++) {
    const id: string | undefined = refs[i]?.id;
    if (!id) continue;
    if (seen.has(id)) {
      indicesToRemove.push(i);
    } else {
      seen.add(id);
    }
  }

  if (indicesToRemove.length === 0) return;

  // Remove in reverse order so earlier indices remain valid after each removal
  for (let j = indicesToRemove.length - 1; j >= 0; j--) {
    known.$jazz.remove(indicesToRemove[j]);
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
 * Send a conversation/member-add inbox notification with durable retry
 * state (contact-robustness spec §4). The pendingNotifications entry is
 * written BEFORE the network attempt and deleted only on the Inbox
 * end-to-end ack; useNotificationRetry re-sends survivors on
 * launch/reconnect. Re-delivery is safe: the receive side is the hardened
 * three-layer knownConversations drain (raw-ID dedup).
 */
export async function sendConversationNotification(
  me: Account,
  conversation: any,
  targetAccountID: string,
  kind: "conversation" | "member-add",
): Promise<void> {
  const conversationID = conversation.$jazz.id as string;
  const pending = (me as any).root?.pendingNotifications;
  const key = `${conversationID}:${targetAccountID}`;
  if (pending && typeof pending.$jazz?.set === "function" && !pending[key]) {
    pending.$jazz.set(
      key,
      PendingNotification.create(
        {
          conversation,
          targetAccountID,
          kind,
          createdAt: new Date(),
          attempts: 0,
        },
        { owner: me },
      ),
    );
  }
  await attemptNotificationDelivery(me, conversationID, targetAccountID);
}

/**
 * One delivery attempt for a pending notification. Ack → entry deleted;
 * failure/timeout → entry survives with bumped attempt bookkeeping.
 */
export async function attemptNotificationDelivery(
  me: Account,
  conversationID: string,
  targetAccountID: string,
): Promise<void> {
  const pending = (me as any).root?.pendingNotifications;
  const key = `${conversationID}:${targetAccountID}`;
  const entry = pending?.[key];
  try {
    if (entry && typeof entry.$jazz?.set === "function") {
      entry.$jazz.set("attempts", (entry.attempts ?? 0) + 1);
      entry.$jazz.set("lastAttemptAt", new Date());
    }
    // Fresh notification group — the target has no prior role here, so
    // InboxSender's add-as-writer call won't conflict with their role on
    // the conversation group itself.
    const notificationGroup = Group.create({ owner: me });
    const notification = ConversationNotification.create(
      { conversationID },
      { owner: notificationGroup },
    );
    const sender = await InboxSender.load<typeof notification>(
      targetAccountID as any,
      me,
    );
    await withTimeout(sender.sendMessage(notification), REQUEST_ACK_TIMEOUT_MS);
    // Post-await ack consumption is delete-by-key on the re-readable record —
    // idempotent under a concurrent successful attempt (the key is simply
    // already gone; no terminal state exists to clobber).
    if (pending && typeof pending.$jazz?.delete === "function") {
      pending.$jazz.delete(key);
    }
  } catch (e) {
    console.warn(
      `[inbox] notification to ${targetAccountID} failed (will retry):`,
      e,
    );
  }
}

/**
 * App-level retry for unacked conversation/member-add notifications —
 * mounted once in App.tsx beside the other drains. Once per launch + on
 * browser reconnect (same policy as the outgoing-request watcher).
 */
export function useNotificationRetry(): void {
  // $onError: "catch" at the $each level (Task 6 review amendment): one
  // unavailable/unauthorized entry CoValue must not stall me.$isLoaded for
  // ALL pending notifications. Caught entries resolve to null — the
  // `!entry?.targetAccountID` guard below skips them.
  const me = useAccount(ArcanAccount, {
    resolve: { root: { pendingNotifications: { $each: { $onError: "catch" } } } },
  });
  const retriedThisLaunch = useRef(false);

  useEffect(() => {
    if (!me.$isLoaded) return;

    const retry = () => {
      const pending = (me as any).root?.pendingNotifications;
      if (!pending) return;
      for (const [key, entry] of Object.entries(
        pending as Record<string, any>,
      )) {
        if (!entry?.targetAccountID) continue;
        const conversationID = key.split(":")[0];
        void attemptNotificationDelivery(
          me as any,
          conversationID,
          entry.targetAccountID,
        );
      }
    };

    if (!retriedThisLaunch.current) {
      retriedThisLaunch.current = true;
      retry();
    }
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.$isLoaded]);
}

/**
 * Conversation-notification drain handler: load the Conversation named by an
 * inbox payload's `conversationID` and push it to me.root.knownConversations
 * for sidebar auto-discovery.
 *
 * Routed to by useInboxDispatcher (src/jazz/use-inbox-dispatcher.ts) — the
 * single app-wide inbox subscription. This used to be the callback body of a
 * dedicated useConversationInboxSubscription hook; owning a second
 * `inbox.subscribe` was the shared-processed-feed hazard (all subscriptions
 * share ONE processed feed, so this drain could consume-and-mark-processed a
 * ConnectionRequest during the other drain's mount gap — permanent loss).
 *
 * The inbox is a persistent CoStream — messages that arrived before the
 * current session are replayed on subscribe, so Bob discovers conversations
 * even if he was offline when Alice created one. All conversation kinds
 * (1:1 and group) use this same knownConversations path.
 */
export async function handleConversationNotification(
  me: any,
  conversationID: string,
): Promise<void> {
  try {
    const conversation = await Conversation.load(conversationID as any, {
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

    // Dedup by raw CoValue ID — reads cojson list entries directly,
    // bypassing the Jazz proxy/subscription-scope machinery. This
    // avoids any edge-case where proxy resolution in a non-reactive
    // context (inbox callback is outside React) could yield an
    // unexpected result. The raw list stores CoValue ID strings
    // directly; `raw.get(i)` returns the ID or undefined for each
    // index, which is safe to compare against conversationID.
    const rawLen = (known as any).$jazz.raw.length() as number;
    let alreadyKnown = false;
    for (let i = 0; i < rawLen; i++) {
      if ((known as any).$jazz.raw.get(i) === conversationID) {
        alreadyKnown = true;
        break;
      }
    }
    if (alreadyKnown) return;

    (known as any).$jazz.push(conversation);
  } catch (e) {
    console.warn("[inbox] Failed to push conversation to knownConversations:", e);
  }
}
