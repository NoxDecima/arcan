import { Group, co } from "jazz-tools";
import type { Account } from "jazz-tools";
import { Message } from "@/jazz/schema/Message";
import { FileBlob } from "@/jazz/schema/FileBlob";

// Forward import: ensureMyWriteGroup is defined in conversation.ts.
// This placeholder is replaced at module evaluation time (circular-import safe
// because both modules reference each other only at call time, not at import time).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EnsureMyWriteGroupFn = (me: any, conversation: any) => Promise<Group>;
let _ensureMyWriteGroup: EnsureMyWriteGroupFn | null = null;

/**
 * Register the ensureMyWriteGroup function from conversation.ts.
 * Called by conversation.ts on module load to break the circular dependency.
 * @internal
 */
export function _registerEnsureMyWriteGroup(fn: EnsureMyWriteGroupFn): void {
  _ensureMyWriteGroup = fn;
}

/**
 * Send a new message in a conversation.
 *
 * Ensures the sender has a WriteGroup in the conversation (self-create on first
 * send), then creates a Message CoValue owned by that WriteGroup and appends a
 * ref to conversation.messages.
 */
export async function sendMessage(
  me: Account,
  conversation: any,
  body: string,
): Promise<any> {
  if (!_ensureMyWriteGroup) {
    // Lazy import to avoid circular dependency at module load time
    const mod = await import("@/jazz/conversation");
    _ensureMyWriteGroup = mod.ensureMyWriteGroup;
  }
  const myWriteGroup = await _ensureMyWriteGroup(me, conversation);
  const message = Message.create(
    {
      sentAt: new Date(),
      body,
      attachments: co.list(FileBlob).create([], { owner: myWriteGroup }),
    },
    { owner: myWriteGroup },
  );
  conversation.messages.$jazz.push(message);
  return message;
}

/**
 * Edit a message in place. The Jazz validator rejects writes from non-writers,
 * so this only succeeds when called by the message's author.
 */
export async function editMessage(
  _me: Account,
  message: any,
  newBody: string,
): Promise<void> {
  // Use $jazz.set for reliable CoMap mutations that propagate through Jazz sync.
  // Direct property assignment on Jazz CoMap proxies may silently no-op for
  // functional co.map() schemas where getDescriptor returns undefined.
  message.$jazz.set("body", newBody);
  message.$jazz.set("edited", true);
  message.$jazz.set("editedAt", new Date());
}

/**
 * Soft-delete a message. Clears the body and sets the deleted flag. The
 * renderer shows a placeholder; body is no longer the source of truth.
 * Transaction-log retention is a documented threat-model property.
 */
export async function deleteMessage(_me: Account, message: any): Promise<void> {
  message.$jazz.set("body", "");
  message.$jazz.set("deleted", true);
}

/**
 * Derive the accountID of the author by reading the create-transaction signer
 * of the message. Uses the public `$jazz.createdBy` getter on CoValueJazzApi
 * (verified against jazz-tools 0.20.18 — see docs/jazz-api-notes.md §14).
 *
 * This is signed bytes — immutable — not derived from the Group's current
 * shape, which could be manipulated post-hoc (see spec §6.3).
 */
export function getAuthorAccountIDFromMessage(message: any): string | null {
  return message?.$jazz?.createdBy ?? null;
}

/**
 * Read the direct (non-inherited) members with a given role on a Group.
 *
 * Uses `group.getDirectMembers()` which calls `raw.getMemberKeys()` (direct
 * only, no inherited) — verified against jazz-tools 0.20.18.
 */
function directMembersWithRole(
  group: Group,
  role: string,
): Array<{ id: string; role: string; account: any }> {
  return group.getDirectMembers().filter((m) => m.role === role);
}

/**
 * Direct (non-inherited) writer members of a Group.
 */
export function directWriterMembers(
  group: Group,
): Array<{ id: string; role: string; account: any }> {
  return directMembersWithRole(group, "writer");
}

/**
 * Direct (non-inherited) admin members of a Group.
 */
export function directAdminMembers(
  group: Group,
): Array<{ id: string; role: string; account: any }> {
  return directMembersWithRole(group, "admin");
}

/**
 * Validate that a Group is a properly-shaped per-author WriteGroup for the
 * given conversation. A well-formed WriteGroup has:
 *   - parent: the given conversationGroup, with mapping "reader"
 *   - exactly one direct admin member (the WriteGroup owner / author)
 *   - no extra direct admins or writers beyond the owner
 *
 * Note on role semantics: in Jazz, `Group.create({ owner: me })` sets the
 * creator's role to "admin". Admin includes write access, so no separate
 * "writer" role is needed for the author. `isWellFormedWriteGroup` checks
 * "exactly one direct admin" (the author) as the structural invariant.
 *
 * The parent-role check reads the raw group's stored `parent_<id>` key because
 * `getParentGroups()` only returns groups without the role mapping.
 */
export function isWellFormedWriteGroup(
  group: Group,
  conversationGroup: Group,
): boolean {
  if (!(group instanceof Group)) return false;

  // Check the parent role mapping via the raw cojson group.
  // The role is stored as rawGroup.get("parent_<conversationGroupRawId>").
  const rawGroup = (group as any).$jazz?.raw;
  const rawConversationGroup = (conversationGroup as any).$jazz?.raw;
  if (!rawGroup || !rawConversationGroup) return false;

  const parentKey = `parent_${rawConversationGroup.id}`;
  const parentRole = rawGroup.get(parentKey);
  if (parentRole !== "reader") return false;

  // Exactly one direct admin member (the author owns this WriteGroup)
  const admins = directAdminMembers(group);
  if (admins.length !== 1) return false;

  // No extra direct writers beyond admin (admins can write; explicit "writer"
  // members would mean multiple people can write to this WriteGroup)
  const writers = directWriterMembers(group);
  if (writers.length !== 0) return false;

  return true;
}
