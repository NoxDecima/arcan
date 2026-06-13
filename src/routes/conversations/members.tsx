/**
 * MembersRoute: member-list and role-management view for a group conversation.
 *
 * Route: /conversations/:id/members
 *
 * Per spec §8:
 *   - Ordered list of group members with role badges (RolePill)
 *   - Admin-only: "Add member" button (ContactPicker, excludes current members)
 *   - Admin-only row actions: promote writer → admin, demote admin → writer, remove
 *   - "Leave conversation" button visible to all (destructive, bottom of page)
 *     - If me is last admin AND other members remain → LeaveWithPromoteDialog
 *     - Otherwise → leaveConversation + navigate /conversations
 *   - Back button → /conversations/:id
 */

import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAccount, useCoState } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Conversation } from "@/jazz/schema/Conversation";
import { Sidebar } from "@/components/sidebar";
import { ContactPicker } from "@/components/contact-picker";
import { RolePill } from "@/components/role-pill";
import { LeaveWithPromoteDialog } from "@/components/leave-with-promote-dialog";
import { Button } from "@/components/ui/button";
import {
  addMemberToConversation,
  removeMemberFromConversation,
  promoteToAdmin,
  leaveConversation,
  isLastAdmin,
  updateConversationTitle,
  isArchived,
  requestConnectionFromGroupMember,
} from "@/jazz/conversation";
import { resolveDisplayName } from "@/jazz/displayName";
import { Avatar } from "@/components/avatar";
import { resolveAvatarFileBlob, useRemoteAvatar } from "@/jazz/avatarResolver";
import { useToast } from "@/components/toast";

/**
 * Per-row component so each member row can call its own useRemoteAvatar
 * hook. For SELF, we resolve via the local fast path (me.profile.avatar
 * is already loaded). For OTHER members, the static resolver's group-
 * direct-member branch is unreliable (Jazz doesn't deeply auto-load
 * nested refs from peer-fetched CoValues), so we explicitly subscribe
 * to the remote account's profile.avatar via useRemoteAvatar.
 */
function MemberRow(props: {
  member: { accountID: string; displayName: string; role: "writer" | "admin" };
  isMe: boolean;
  me: any;
  group: any;
  iAmAdmin: boolean;
  isAlreadyContact: boolean;
  actionInProgress: boolean;
  onPromote: () => void;
  onRemove: () => void;
  onRequestConnection: () => void;
}) {
  const { member, isMe, me, group, iAmAdmin, isAlreadyContact, actionInProgress, onPromote, onRemove, onRequestConnection } = props;
  const localAvatar = isMe
    ? resolveAvatarFileBlob({ accountID: member.accountID, me, group })
    : undefined;
  const remoteAvatar = useRemoteAvatar(isMe ? null : member.accountID);
  const avatar = localAvatar ?? remoteAvatar;

  return (
    <li
      className="flex items-center gap-3 px-3 py-2 rounded hover:bg-accent"
      data-testid={`member-row-${member.accountID}`}
    >
      <Avatar
        src={avatar}
        initials={member.displayName[0] ?? "?"}
        size="sm"
        loadAs={me}
        data-testid={`member-avatar-${member.accountID}`}
      />

      <span className="flex-1 text-sm font-medium text-text truncate">
        {member.displayName}
        {isMe && (
          <span className="ml-1 text-xs text-muted-foreground">(you)</span>
        )}
      </span>

      <RolePill role={member.role} />

      {!isMe && !isAlreadyContact && (
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7 px-2 flex-shrink-0"
          onClick={onRequestConnection}
          disabled={actionInProgress}
          data-testid={`request-connection-${member.accountID}`}
        >
          request connection
        </Button>
      )}

      {iAmAdmin && !isMe && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {member.role === "writer" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7 px-2"
              onClick={onPromote}
              disabled={actionInProgress}
              data-testid={`promote-${member.accountID}`}
            >
              Promote
            </Button>
          )}
          {member.role === "writer" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7 px-2 text-red-600 hover:bg-red-50"
              onClick={onRemove}
              disabled={actionInProgress}
              data-testid={`remove-${member.accountID}`}
            >
              Remove
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export function MembersRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [leavePromoteOpen, setLeavePromoteOpen] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const toast = useToast();
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (titleEditing) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [titleEditing]);

  const me = useAccount(ArcanAccount, {
    resolve: {
      profile: true,
      root: { contactBook: { $each: true }, knownConversations: true },
    },
  });

  const conversation = useCoState(Conversation, id as any, {
    resolve: { messages: true },
  });

  // Redirect to /conversations when me has been revoked from this conversation.
  // Same rationale as detail.tsx — the data is unreadable, no point rendering.
  const archivedForMe =
    me.$isLoaded && conversation ? isArchived(me, conversation) : false;
  useEffect(() => {
    if (archivedForMe) navigate("/conversations", { replace: true });
  }, [archivedForMe, navigate]);

  // ---- loading / error states ----

  if (!me.$isLoaded) {
    return (
      <div className="flex h-screen">
        <div className="hidden md:contents"><Sidebar /></div>
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

  if (conversation === null) {
    return (
      <div className="flex h-screen">
        <div className="hidden md:contents"><Sidebar /></div>
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-red-600">Conversation not found.</p>
        </main>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex h-screen">
        <div className="hidden md:contents"><Sidebar /></div>
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading members…</p>
        </main>
      </div>
    );
  }

  // ---- derive members from group ----

  const myAccountID = (me as any).$jazz?.id as string | undefined;
  const group = (conversation as any).$jazz?.owner;
  const rawMembers: Array<{
    accountID: string;
    role: "admin" | "writer";
    displayName: string;
  }> = [];

  if (group) {
    try {
      const directMembers = group.getDirectMembers() as Array<{
        account: any;
        role: string;
        id: string;
      }>;
      for (const m of directMembers) {
        const accountID: string = m.account?.$jazz?.id ?? m.id;
        const role = m.role as string;
        if (role !== "admin" && role !== "writer") continue; // skip revoked / inherited
        const displayName = resolveDisplayName({
          accountID,
          me,
          group,
        });
        rawMembers.push({ accountID, role: role as "admin" | "writer", displayName });
      }
    } catch {
      // Group introspection unavailable
    }
  }

  // Sort: admins first, then writers; within each group alphabetically
  rawMembers.sort((a, b) => {
    if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });

  const myRole = rawMembers.find((m) => m.accountID === myAccountID)?.role;
  const iAmAdmin = myRole === "admin";

  const currentMemberAccountIDs = rawMembers.map((m) => m.accountID);

  // Build the set of contact account IDs so we can skip the "request connection"
  // affordance for members who are already in the user's ContactBook.
  const knownContactIDs = new Set(
    Array.from(((me as any).root?.contactBook as Iterable<any>) ?? [])
      .map((c: any) => c?.contactAccountID)
      .filter(Boolean)
  );

  // ---- handlers ----

  async function handleAddMembers(contacts: any[]) {
    setAddPickerOpen(false);
    if (contacts.length === 0) return;
    setActionInProgress(true);
    try {
      for (const contact of contacts) {
        await addMemberToConversation(
          me as any,
          conversation,
          contact.contactAccountID as string,
          "writer",
        );
      }
    } finally {
      setActionInProgress(false);
    }
  }

  async function handlePromote(accountID: string) {
    setActionInProgress(true);
    try {
      await promoteToAdmin(me as any, conversation, accountID);
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleRemove(accountID: string) {
    if (!confirm("Remove this member from the conversation?")) return;
    setActionInProgress(true);
    try {
      await removeMemberFromConversation(me as any, conversation, accountID);
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleLeave() {
    const otherMembers = rawMembers.filter((m) => m.accountID !== myAccountID);
    if (isLastAdmin(me as any, conversation) && otherMembers.length > 0) {
      setLeavePromoteOpen(true);
      return;
    }
    if (!confirm("Leave this conversation? You will lose access to its messages.")) return;
    setActionInProgress(true);
    try {
      await leaveConversation(me as any, conversation);
      navigate("/conversations");
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleLeaveWithPromote(newAdminAccountID: string) {
    setActionInProgress(true);
    try {
      await promoteToAdmin(me as any, conversation, newAdminAccountID);
      await leaveConversation(me as any, conversation);
      setLeavePromoteOpen(false);
      navigate("/conversations");
    } finally {
      setActionInProgress(false);
    }
  }

  const conversationTitle = (conversation as any)?.title ?? "Conversation";

  // ---- title edit handlers ----

  function startTitleEdit() {
    if (!iAmAdmin) return;
    setTitleDraft(conversationTitle);
    setTitleEditing(true);
  }

  async function saveTitleEdit() {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleEditing(false);
      return;
    }
    setActionInProgress(true);
    try {
      await updateConversationTitle(me as any, conversation, trimmed);
    } finally {
      setActionInProgress(false);
      setTitleEditing(false);
    }
  }

  function cancelTitleEdit() {
    setTitleEditing(false);
    setTitleDraft("");
  }

  // ---- render ----

  return (
    <div className="flex h-screen" data-testid="members-route">
      <div className="hidden md:contents"><Sidebar /></div>

      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-panel">
          <Link
            to={`/conversations/${id}`}
            className="text-sm text-muted-foreground hover:text-foreground"
            data-testid="back-btn"
          >
            ← Back
          </Link>

          <div className="flex-1 min-w-0">
            {titleEditing ? (
              <div className="flex items-center gap-2">
                <input
                  ref={titleInputRef}
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value.slice(0, 60))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveTitleEdit();
                    } else if (e.key === "Escape") {
                      cancelTitleEdit();
                    }
                  }}
                  maxLength={60}
                  disabled={actionInProgress}
                  className="flex-1 border rounded px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="group-title-edit-input"
                />
                <Button
                  size="sm"
                  onClick={() => void saveTitleEdit()}
                  disabled={!titleDraft.trim() || actionInProgress}
                  data-testid="group-title-save-btn"
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={cancelTitleEdit}
                  disabled={actionInProgress}
                  data-testid="group-title-cancel-btn"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <h1
                className={`font-semibold text-text truncate ${iAmAdmin ? "cursor-pointer hover:text-primary" : ""}`}
                onClick={iAmAdmin ? startTitleEdit : undefined}
                title={iAmAdmin ? "Click to edit title" : undefined}
                data-testid="group-title-display"
              >
                {conversationTitle}
              </h1>
            )}
          </div>

          {iAmAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddPickerOpen(true)}
              disabled={actionInProgress}
              data-testid="add-member-btn"
            >
              Add member
            </Button>
          )}
        </div>

        {/* Member list */}
        <div className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-1" data-testid="members-list">
            {rawMembers.map((member) => (
              <MemberRow
                key={member.accountID}
                member={member}
                isMe={member.accountID === myAccountID}
                me={me}
                group={group}
                iAmAdmin={iAmAdmin}
                isAlreadyContact={knownContactIDs.has(member.accountID)}
                actionInProgress={actionInProgress}
                onPromote={() => void handlePromote(member.accountID)}
                onRemove={() => void handleRemove(member.accountID)}
                onRequestConnection={async () => {
                  try {
                    await requestConnectionFromGroupMember(me as any, member.accountID);
                    toast({ icon: "check", text: "request sent", tone: "accent" });
                  } catch {
                    toast({ icon: "alert", text: "couldn't send request", tone: "error" });
                  }
                }}
              />
            ))}
          </ul>

          {rawMembers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No members found.
            </p>
          )}
        </div>

        {/* Leave conversation — destructive, bottom */}
        <div className="p-4 border-t border-border">
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => void handleLeave()}
            disabled={actionInProgress}
            data-testid="leave-conversation-btn"
          >
            {actionInProgress ? "Working…" : "Leave conversation"}
          </Button>
        </div>
      </main>

      {/* Dialogs */}
      {addPickerOpen && (
        <ContactPicker
          onSelect={handleAddMembers}
          onClose={() => setAddPickerOpen(false)}
          excludeAccountIDs={currentMemberAccountIDs}
        />
      )}

      {leavePromoteOpen && (
        <LeaveWithPromoteDialog
          candidates={rawMembers
            .filter((m) => m.accountID !== myAccountID)
            .map((m) => ({
              accountID: m.accountID,
              displayName: m.displayName,
              currentRole: m.role,
            }))}
          onLeave={(newAdminAccountID) => void handleLeaveWithPromote(newAdminAccountID)}
          onCancel={() => setLeavePromoteOpen(false)}
        />
      )}
    </div>
  );
}
