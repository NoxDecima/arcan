/**
 * MembersRoute: member-list and role-management view for a group conversation.
 *
 * Route: /conversations/:id/members
 *
 * Wave C (Unit 10): container renders <ConvoSettingsScreen>. All data logic
 * and handlers are moved verbatim from the prior hand-rolled render. Avatar
 * resolution per-member (useRemoteAvatar) is Rung-4; member rows show initials
 * for now. The MemberKebabMenu sub-component is kept for kebab state (menuOpen).
 */

import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { pickFilesNative } from "@/platform/files";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useUpNavigation } from "@/nav/use-up-navigation";
import { useAccount, useCoState } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Conversation } from "@/jazz/schema/Conversation";
import { ContactPicker } from "@/components/contact-picker";
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
import { listContacts } from "@/jazz/handshake";
import { ConversationAvatar } from "@/components/conversation-avatar";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { setConversationIcon } from "@/jazz/avatar";
import {
  AttachmentTooLargeError,
  MAX_ATTACHMENT_BYTES,
} from "@/jazz/attachments";
import { ConvoSettingsScreen } from "@/ui/screens/convo-settings-screen";
import type { ConvoMemberVM } from "@/ui/screens/picker-types";

// ── MemberKebabMenu ────────────────────────────────────────────────────────
// Kept as a sub-component so it can hold its own `menuOpen` state.

function MemberKebabMenu({
  member,
  canPromote,
  canRemove,
  canRequest,
  requestPending,
  actionInProgress,
  onPromote,
  onRemove,
  onRequestConnection,
}: {
  member: ConvoMemberVM;
  canPromote: boolean;
  canRemove: boolean;
  canRequest: boolean;
  requestPending: boolean;
  actionInProgress: boolean;
  onPromote: () => void;
  onRemove: () => void;
  onRequestConnection: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  if (!canPromote && !canRemove && !canRequest) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label={`Actions for ${member.name}`}
        data-testid={`member-kebab-${member.accountID}`}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-r-2 text-text-2 hover:bg-panel-2 ${menuOpen ? "bg-panel-2" : ""}`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      {menuOpen && (
        <div
          data-testid={`member-menu-${member.accountID}`}
          className="absolute right-2 top-full z-10 mt-1 min-w-[150px] rounded-r-3 border border-hairline bg-panel p-1 shadow-level-2"
        >
          {canPromote && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onPromote();
              }}
              disabled={actionInProgress}
              data-testid={`promote-${member.accountID}`}
              className="w-full rounded-r-2 px-[10px] py-2 text-left text-[11.5px] text-text hover:bg-panel-2"
            >
              promote to admin
            </button>
          )}
          {canRequest && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onRequestConnection();
              }}
              disabled={actionInProgress || requestPending}
              data-testid={`request-connection-${member.accountID}`}
              className="w-full rounded-r-2 px-[10px] py-2 text-left text-[11.5px] text-text hover:bg-panel-2 disabled:opacity-50 disabled:cursor-default"
            >
              {requestPending ? "request pending" : "request connection"}
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onRemove();
              }}
              disabled={actionInProgress}
              data-testid={`remove-${member.accountID}`}
              className="w-full rounded-r-2 px-[10px] py-2 text-left text-[11.5px] text-red hover:bg-red/10"
            >
              remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── MembersRoute ──────────────────────────────────────────────────────────

export function MembersRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const goUp = useUpNavigation();

  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [leavePromoteOpen, setLeavePromoteOpen] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [_iconUploading, setIconUploading] = useState(false);
  const toast = useToast();
  const confirmDialog = useConfirm();
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
      root: { contacts: { $each: { $onError: "catch" } }, outgoingRequests: { $each: { $onError: "catch" } }, knownConversations: true },
    },
  });

  const conversation = useCoState(Conversation, id as any, {
    resolve: { messages: true },
  });

  // Redirect to /conversations when me has been revoked from this conversation.
  const archivedForMe =
    me.$isLoaded && conversation ? isArchived(me, conversation) : false;
  useEffect(() => {
    if (archivedForMe) navigate("/conversations", { replace: true });
  }, [archivedForMe, navigate]);

  // ── loading / error states ───────────────────────────────────────────────

  if (!me.$isLoaded) {
    return (
      <main
        className="flex-1 min-h-0 flex flex-col min-w-0"
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
        className="flex-1 min-h-0 flex flex-col min-w-0"
        data-testid="members-route-loading-late"
      >
        <ChatHeaderSkeleton />
        <NavListSkeleton rows={4} />
      </main>
    );
  }

  // ── derive members from group ────────────────────────────────────────────

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
        if (role !== "admin" && role !== "writer") continue;
        const displayName = resolveDisplayName({ accountID, me, group });
        rawMembers.push({
          accountID,
          role: role as "admin" | "writer",
          displayName,
        });
      }
    } catch {
      // Group introspection unavailable.
    }
  }

  // Sort: admins first, then writers; within each group alphabetically.
  rawMembers.sort((a, b) => {
    if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });

  const myRole = rawMembers.find((m) => m.accountID === myAccountID)?.role;
  const iAmAdmin = myRole === "admin";
  const currentMemberAccountIDs = rawMembers.map((m) => m.accountID);

  // 1:1 conversations → redirect to the other participant's profile.
  const participants = rawMembers.filter(
    (m) => m.role === "admin" || m.role === "writer",
  );
  if (participants.length === 2) {
    const other = participants.find((m) => m.accountID !== myAccountID);
    if (other) {
      return <Navigate to={`/profile/${other.accountID}`} replace />;
    }
  }

  // Build the set of contact account IDs for "request connection" affordance.
  const knownContactIDs = new Set(
    listContacts(me)
      .map((c: any) => c?.contactAccountID)
      .filter(Boolean),
  );

  // Contact-robustness: live pending outgoing requests, keyed by counterpart
  // account ID — drives the disabled "request pending" state (spec §6).
  const pendingOutgoingIDs = new Set(
    Object.values(
      ((me as any).root?.outgoingRequests as Record<string, any>) ?? {},
    )
      .filter((e: any) => e && e.status === "pending" && !e.archivedAt)
      .map((e: any) => e.counterpartAccountID as string),
  );

  // ── handlers ─────────────────────────────────────────────────────────────

  async function handleAddMembers(contacts: any[]) {
    setAddPickerOpen(false);
    if (contacts.length === 0) return;
    setActionInProgress(true);
    try {
      for (const contact of contacts) {
        const result = await addMemberToConversation(
          me as any,
          conversation,
          contact.contactAccountID as string,
          "writer",
        );
        if (result === "already-member") {
          toast({
            icon: "check",
            text: `${contact.displayNameLocal ?? "that person"} is already a member`,
            tone: "neutral",
          });
        }
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
    const ok = await confirmDialog({
      title: "remove member",
      body: "they will lose access to this conversation and its messages.",
      confirmLabel: "remove",
      testId: "confirm-remove-member",
    });
    if (!ok) return;
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
    const ok = await confirmDialog({
      title: "leave conversation",
      body: "you lose access to its messages. others keep their copies and will see that you left.",
      confirmLabel: "leave",
      testId: "confirm-leave-conversation",
    });
    if (!ok) return;
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

  async function handleRequestConnection(accountID: string) {
    try {
      const result = await requestConnectionFromGroupMember(me as any, accountID);
      if (result.outcome === "already-pending") {
        toast({ icon: "check", text: "request already pending", tone: "neutral" });
      } else if (result.outcome === "already-contact") {
        toast({ icon: "check", text: "already a contact", tone: "neutral" });
      } else if (result.outcome === "send-failed") {
        toast({ icon: "alert", text: "couldn't send — will retry", tone: "error" });
      } else if (result.outcome === "sent") {
        toast({ icon: "check", text: "request sent", tone: "accent" });
      } else {
        // "unavailable" (root records still syncing) or any future outcome:
        // never claim success we didn't get.
        toast({
          icon: "alert",
          text: "couldn't send — still syncing, try again",
          tone: "error",
        });
      }
    } catch {
      toast({ icon: "alert", text: "couldn't send request", tone: "error" });
    }
  }

  const conversationTitle = (conversation as any)?.title ?? "Conversation";

  // ── title edit handlers ──────────────────────────────────────────────────

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

  // ── icon upload ──────────────────────────────────────────────────────────

  async function ingestIcon(file: File) {
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

  async function handleIconChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await ingestIcon(file);
  }

  // ── view-model ───────────────────────────────────────────────────────────

  const toVM = (m: typeof rawMembers[number]): ConvoMemberVM => ({
    accountID: m.accountID,
    name: m.displayName,
    initials: m.displayName[0]?.toUpperCase() ?? "?",
    role: m.role,
    you: m.accountID === myAccountID,
    // avatarSrc: undefined — Rung-4, avatar resolution via useRemoteAvatar is per-member
  });

  const admins = rawMembers.filter((m) => m.role === "admin").map(toVM);
  const writers = rawMembers.filter((m) => m.role === "writer").map(toVM);

  const memberCount = rawMembers.length;

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <main className="flex-1 min-h-0 flex flex-col min-w-0" data-testid="members-route">
      {/* Hidden file input for group icon (outside presenter) */}
      <input
        ref={iconInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleIconChange}
        data-testid="conversation-icon-input"
      />

      <ConvoSettingsScreen
        onBack={() => goUp()}
        title={conversationTitle}
        initials={conversationTitle[0]?.toUpperCase() ?? "?"}
        avatarSlot={
          <ConversationAvatar
            conversationId={(conversation as any)?.$jazz?.id ?? ""}
            title={conversationTitle}
            icon={(conversation as any)?.icon}
            size={70}
            loadAs={me}
            data-testid="members-header-avatar"
          />
        }
        sub={`${memberCount} ${memberCount === 1 ? "member" : "members"}`}
        onEditAvatar={
          iAmAdmin
            ? () => void (async () => {
                try {
                  const native = await pickFilesNative({ imagesOnly: true, multiple: false, maxBytes: MAX_ATTACHMENT_BYTES });
                  if (native !== null) {
                    if (native.length > 0) await ingestIcon(native[0]);
                    return;
                  }
                } catch (err) {
                  toast({
                    icon: "alert",
                    text: err instanceof Error ? err.message : "pick failed — try again.",
                    tone: "error",
                  });
                  return;
                }
                iconInputRef.current?.click();
              })()
            : undefined
        }
        onEditTitle={iAmAdmin ? startTitleEdit : undefined}
        titleEditSlot={
          titleEditing ? (
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
                className="rounded-r-2 border border-hairline bg-panel px-2 py-1 text-lg font-semibold text-text outline-none focus:border-arcan-accent"
                data-testid="group-title-edit-input"
              />
              <Button
                size="sm"
                onClick={() => void saveTitleEdit()}
                disabled={!titleDraft.trim() || actionInProgress}
                data-testid="group-title-save-btn"
              >
                save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={cancelTitleEdit}
                disabled={actionInProgress}
                data-testid="group-title-cancel-btn"
              >
                cancel
              </Button>
            </div>
          ) : undefined
        }
        admins={admins}
        writers={writers}
        iAmAdmin={iAmAdmin}
        onAddPeople={() => setAddPickerOpen(true)}
        renderMemberEnd={(m) => {
          const isMe = m.you ?? false;
          const canPromote = iAmAdmin && !isMe && m.role === "writer";
          const canRemove = iAmAdmin && !isMe && m.role === "writer";
          const canRequest = !isMe && !knownContactIDs.has(m.accountID);
          return (
            <MemberKebabMenu
              member={m}
              canPromote={canPromote}
              canRemove={canRemove}
              canRequest={canRequest}
              requestPending={pendingOutgoingIDs.has(m.accountID)}
              actionInProgress={actionInProgress}
              onPromote={() => void handlePromote(m.accountID)}
              onRemove={() => void handleRemove(m.accountID)}
              onRequestConnection={() => void handleRequestConnection(m.accountID)}
            />
          );
        }}
        onOpenMember={(accountID) => navigate(`/profile/${accountID}`)}
        onLeave={() => void handleLeave()}
        leaveInProgress={actionInProgress}
        // testid carries (E2E)
        backTestId="back-btn"
        avatarTestId="members-header-avatar"
        avatarEditTestId="conversation-icon-upload"
        titleTestId="group-title-display"
        editTitleTestId="group-title-edit-btn"
        membersCountTestId="members-count"
        addMemberTestId="add-member-btn"
        adminsSectionTestId="members-section-admins"
        writersSectionTestId="members-section-writers"
        leaveTestId="leave-conversation-btn"
      />

      {/* Overlays */}
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
          onLeave={(newAdminAccountID) =>
            void handleLeaveWithPromote(newAdminAccountID)
          }
          onCancel={() => setLeavePromoteOpen(false)}
        />
      )}
    </main>
  );
}
