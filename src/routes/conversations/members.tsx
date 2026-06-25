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

import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { useParams, useNavigate, Link, Navigate } from "react-router-dom";
import { useAccount, useCoState } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Conversation } from "@/jazz/schema/Conversation";
import { ContactPicker } from "@/components/contact-picker";
import { RolePill } from "@/components/role-pill";
import { LeaveWithPromoteDialog } from "@/components/leave-with-promote-dialog";
import { Button } from "@/components/ui/button";
import { ChatHeaderSkeleton, NavListSkeleton } from "@/components/skeleton";
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
import { ConversationAvatar } from "@/components/conversation-avatar";
import { resolveAvatarFileBlob, useRemoteAvatar } from "@/jazz/avatarResolver";
import { useToast } from "@/components/toast";
import { setConversationIcon } from "@/jazz/avatar";
import {
  AttachmentTooLargeError,
  MAX_ATTACHMENT_BYTES,
} from "@/jazz/attachments";

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
    <div
      className="relative flex items-center gap-3 px-[10px] py-[9px] rounded-r-3"
      data-testid={`member-row-${member.accountID}`}
    >
      {/* avatar + name → the member's profile (proto: tap name/picture → profile) */}
      <Link
        to={`/profile/${member.accountID}`}
        data-testid={`member-profile-link-${member.accountID}`}
        className="flex flex-1 min-w-0 items-center gap-3 hover:opacity-90"
      >
        <Avatar
          src={avatar}
          initials={member.displayName[0] ?? "?"}
          size="md"
          loadAs={me}
          data-testid={`member-avatar-${member.accountID}`}
        />
        <span className="flex-1 text-[12.5px] font-semibold text-text truncate">
          {member.displayName}
          {isMe && <span className="ml-1 font-normal text-dim">· you</span>}
        </span>
      </Link>

      <RolePill role={member.role} />

      {!isMe && !isAlreadyContact && (
        <Button
          size="sm"
          variant="outline"
          className="text-xs flex-shrink-0"
          onClick={onRequestConnection}
          disabled={actionInProgress}
          data-testid={`request-connection-${member.accountID}`}
        >
          request connection
        </Button>
      )}

      {iAmAdmin && !isMe && member.role === "writer" && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="text-xs"
            onClick={onPromote}
            disabled={actionInProgress}
            data-testid={`promote-${member.accountID}`}
          >
            promote
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-red hover:bg-red/10"
            onClick={onRemove}
            disabled={actionInProgress}
            data-testid={`remove-${member.accountID}`}
          >
            remove
          </Button>
        </div>
      )}
    </div>
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
  const [iconUploading, setIconUploading] = useState(false);
  const toast = useToast();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

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
      <main
        className="flex-1 flex flex-col min-w-0"
        data-testid="members-route-loading"
      >
        <ChatHeaderSkeleton />
        <NavListSkeleton rows={4} />
      </main>
    );
  }

  if (conversation === null) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-red-600">Conversation not found.</p>
      </main>
    );
  }

  if (!conversation) {
    return (
      <main
        className="flex-1 flex flex-col min-w-0"
        data-testid="members-route-loading-late"
      >
        <ChatHeaderSkeleton />
        <NavListSkeleton rows={4} />
      </main>
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

  // 1:1 conversations have no standalone settings screen — redirect to the
  // other participant's profile. A DM is exactly two direct admin/writer
  // members (me + one other); mirrors isOneToOneWith() in jazz/conversation.ts
  // and the `contact` derivation in detail.tsx. Spec 9-6 §3.4(a).
  const participants = rawMembers.filter(
    (m) => m.role === "admin" || m.role === "writer",
  );
  if (participants.length === 2) {
    const other = participants.find((m) => m.accountID !== myAccountID);
    if (other) {
      return <Navigate to={`/profile/${other.accountID}`} replace />;
    }
  }

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
      toast({ icon: "check", text: "title updated", tone: "success" });
    } catch {
      toast({ icon: "alert", text: "couldn't update title", tone: "error" });
    } finally {
      setActionInProgress(false);
      setTitleEditing(false);
    }
  }

  function cancelTitleEdit() {
    setTitleEditing(false);
    setTitleDraft("");
  }

  // ---- icon upload handlers (Phase 8) ----

  async function handleIconChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the value so picking the same file twice still fires onChange
    e.target.value = "";
    if (!file) return;
    if (!iAmAdmin) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast({
        icon: "alert",
        text: `${(file.size / 1_000_000).toFixed(1)} MB — too large`,
        tone: "error",
      });
      return;
    }
    setIconUploading(true);
    try {
      await setConversationIcon(me as any, conversation, file);
      toast({ icon: "check", text: "icon updated", tone: "accent" });
    } catch (err) {
      if (err instanceof AttachmentTooLargeError) {
        toast({ icon: "alert", text: err.message, tone: "error" });
      } else {
        toast({ icon: "alert", text: "upload failed", tone: "error" });
      }
    } finally {
      setIconUploading(false);
    }
  }

  // ---- render ----

  return (
    <main
      className="flex-1 flex flex-col min-w-0"
      data-testid="members-route"
    >
      {/* Slim header bar — mobile-only back arrow (desktop uses the sidebar).
          proto ConvoSettingsScreen PHeader title="conversation settings". */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline bg-panel">
        <Link
          to={`/conversations/${id}`}
          aria-label="Back to conversation"
          data-testid="back-btn"
          className="md:hidden -ml-1 text-text-2 hover:text-text"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="flex-1 font-semibold text-text">conversation settings</h1>
      </div>

      {/* Group card — centered picture + editable name (group only; 1:1 redirects
          before reaching here). proto ConvoSettingsScreen ~L334-341. */}
      <div className="flex flex-col items-center gap-2 px-[18px] pt-6 pb-[18px] border-b border-hairline">
        <div className="relative">
          <ConversationAvatar
            conversationId={(conversation as any)?.$jazz?.id ?? ""}
            title={conversationTitle}
            icon={(conversation as any)?.icon}
            size={70}
            loadAs={me}
            data-testid="members-header-avatar"
          />
          {iAmAdmin && (
            <>
              <input
                ref={iconInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleIconChange}
                data-testid="conversation-icon-input"
              />
              <button
                type="button"
                onClick={() => iconInputRef.current?.click()}
                disabled={iconUploading || actionInProgress}
                aria-label="Change group picture"
                data-testid="conversation-icon-upload"
                className="absolute -bottom-0.5 -right-0.5 w-[26px] h-[26px] rounded-pill bg-arcan-accent text-on-accent border-2 border-bg flex items-center justify-center"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </button>
            </>
          )}
        </div>

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
              className="border border-hairline rounded-r-2 bg-panel px-2 py-1 text-lg font-semibold text-text outline-none focus:border-arcan-accent"
              data-testid="group-title-edit-input"
            />
            <Button size="sm" onClick={() => void saveTitleEdit()} disabled={!titleDraft.trim() || actionInProgress} data-testid="group-title-save-btn">
              save
            </Button>
            <Button size="sm" variant="outline" onClick={cancelTitleEdit} disabled={actionInProgress} data-testid="group-title-cancel-btn">
              cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2" data-testid="group-title-display">
            <button
              type="button"
              onClick={iAmAdmin ? startTitleEdit : undefined}
              disabled={!iAmAdmin}
              className="text-lg font-semibold text-text disabled:cursor-default"
            >
              {conversationTitle}
            </button>
            {iAmAdmin && (
              <button
                type="button"
                onClick={startTitleEdit}
                aria-label="Edit group name"
                data-testid="group-title-edit-btn"
                className="text-dim hover:text-text"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </button>
            )}
          </div>
        )}

        <span className="text-[11px] text-dim font-mono" data-testid="members-count">
          {rawMembers.length} {rawMembers.length === 1 ? "member" : "members"}
        </span>
      </div>

        {/* Member list — split into admins + members (proto ConvoSettingsScreen L342-349) */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {/* admins */}
          <div className="flex items-center gap-2 px-2 pt-1 pb-2">
            <span className="flex-1 text-[9px] uppercase tracking-widest font-mono font-semibold text-dim">
              admins
            </span>
            {iAmAdmin && (
              <Button
                size="sm"
                variant="primary"
                className="h-7 px-3 text-[11px]"
                onClick={() => setAddPickerOpen(true)}
                disabled={actionInProgress}
                data-testid="add-member-btn"
              >
                + add people
              </Button>
            )}
          </div>
          <div data-testid="members-section-admins">
            {rawMembers
              .filter((m) => m.role === "admin")
              .map((member) => (
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
          </div>

          {/* members (writers) */}
          <div className="px-2 pt-3.5 pb-2">
            <span className="text-[9px] uppercase tracking-widest font-mono font-semibold text-dim">
              members
            </span>
          </div>
          <div data-testid="members-section-writers">
            {rawMembers
              .filter((m) => m.role === "writer")
              .map((member) => (
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
          </div>

          {rawMembers.length === 0 && (
            <p className="text-sm text-dim text-center py-8">no members found.</p>
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
            {actionInProgress ? "working…" : "leave conversation"}
          </Button>
        </div>
      {/* Dialogs (portal-based overlays; position in the tree is irrelevant) */}
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
    </main>
  );
}
