import { Link, useNavigate, useParams } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { Button } from "@/components/ui/button";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { isArchived } from "@/jazz/conversation";
import { resolveDisplayName } from "@/jazz/displayName";
import { Avatar } from "@/components/avatar";
import { ConversationAvatar } from "@/components/conversation-avatar";
import { NavListSkeleton } from "@/components/skeleton";
import { getUnreadCount } from "@/jazz/notifications";
import { useSidebarTab } from "@/components/sidebar-tab";
import { resolveAvatarFileBlob, useRemoteAvatar } from "@/jazz/avatarResolver";
import { EmptyPane } from "@/components/empty-pane";
import { Icon } from "@/components/icon";
import { Fab } from "@/components/fab";
import { getLastMessagePreview } from "@/jazz/notifications";

/**
 * Sidebar component for the main layout.
 *
 * Unit 4 Phase 4: the sidebar now has two tabs — `chats` and `contacts`.
 * Tab state is shared with the mobile bottom tab bar via the SidebarTab
 * context (per-session, not persisted). Clicking a row navigates as before.
 *
 * Slice 3b: displays conversation list derived from me.root.knownConversations,
 * sorted by last message timestamp descending. A "+" button now navigates to
 * the dedicated /conversations/new multi-select flow (Unit 4 Phase 6).
 */
/**
 * Derive a sidebar label for a conversation: explicit title wins; else
 * synthesize from the non-me direct members. Uses resolveDisplayName so the
 * contact-book / profile resolution chain stays consistent with MessageRow.
 */
function deriveConversationLabel(conversation: any, me: any): string {
  const explicit = conversation?.title;
  if (typeof explicit === "string" && explicit.length > 0) return explicit;

  const myID = me?.$jazz?.id ?? null;
  const group = conversation?.$jazz?.owner;
  if (!group) return "Conversation";

  let members: any[] = [];
  try {
    members = group.getDirectMembers();
  } catch {
    return "Conversation";
  }

  const others = members
    .filter(
      (m: any) =>
        (m.role === "admin" || m.role === "writer") &&
        m.account?.$jazz?.id !== myID,
    )
    .map((m: any) => m.account?.$jazz?.id)
    .filter((id: any) => typeof id === "string") as string[];

  if (others.length === 0) return "Conversation";

  const names = others.map((id) =>
    resolveDisplayName({ accountID: id, me, group }),
  );

  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names[0]}, ${names[1]} +${names.length - 2} more`;
}

/**
 * One contact row inside the contacts tab. Mirrors the contacts page row but
 * navigates to the polymorphic profile route at /profile/:accountID instead
 * of the legacy /contacts/:contactID detail.
 */
function SidebarContactRow({
  contact,
  index,
  me,
}: {
  contact: any;
  index: number;
  me: any;
}) {
  const accountID = contact?.contactAccountID as string | undefined;
  const localAvatar = resolveAvatarFileBlob({
    accountID: accountID ?? "",
    me,
  });
  const remoteAvatar = useRemoteAvatar(
    localAvatar ? null : accountID ?? null,
  );
  const avatar = localAvatar ?? remoteAvatar;

  if (!accountID) return null;

  return (
    <Link
      to={`/profile/${accountID}`}
      data-testid={`sidebar-contact-row-${index}`}
      data-account-id={accountID}
      data-contact-id={(contact as any)?.$jazz?.id}
      className="flex items-center gap-3 p-2 hover:bg-accent rounded text-sm"
    >
      <Avatar
        src={avatar}
        initials={contact?.displayNameLocal?.[0] ?? "?"}
        size="sm"
        loadAs={me}
      />
      <span className="truncate flex-1 text-text">
        {contact?.displayNameLocal ?? "(unknown)"}
      </span>
    </Link>
  );
}

export function Sidebar() {
  const me = useAccount(ArcanAccount, {
    resolve: {
      profile: true,
      root: {
        contactBook: { $each: true },
        // $onError: "catch" ensures the sidebar loads even when some conversations
        // become inaccessible (e.g. after the user is kicked and Jazz revokes their
        // read access to the ConversationGroup). Without this, the whole
        // knownConversations resolve stalls indefinitely and me.$isLoaded stays false.
        // Slice 8: also resolve `messages` so getUnreadCount can iterate them
        // here without tripping on a NotLoaded list proxy.
        knownConversations: { $each: { messages: true, $onError: "catch" } },
        // Slice 8: per-conversation read cutoff for unread-badge computation.
        lastReadAt: true,
      },
    },
  });
  const navigate = useNavigate();
  const { id: activeConvId } = useParams<{ id: string }>();
  const { tab, setTab } = useSidebarTab();

  // Render a minimal shell while loading — avoids layout flash.
  if (!me.$isLoaded) {
    return (
      <aside
        className="w-full md:w-64 flex flex-col border-r border-hairline bg-panel"
        data-testid="sidebar-loading"
      >
        <div className="p-4 border-b border-hairline">
          <NavListSkeleton rows={1} />
        </div>
        <NavListSkeleton rows={5} />
      </aside>
    );
  }

  // Derive conversation list from knownConversations. Filter out entries the
  // user has been removed from (self-leave splices in leaveConversation; kicked
  // entries linger in knownConversations but Jazz revocation hides their data,
  // so we hide them from the sidebar to avoid broken stubs).
  const knownConversations = me.root.knownConversations;

  const conversations = Array.from(knownConversations ?? [])
    .filter((c: any) => c != null && !isArchived(me, c, { treatNotLoadedAsArchived: true }))
    .map((c: any) => ({ conversation: c }));

  // Sort by last message sentAt descending; fall back to conversation createdAt.
  const sortedActive = [...conversations].sort((a, b) => {
    const aMsgs = a.conversation.messages;
    const aLastMsg = aMsgs ? aMsgs[aMsgs.length - 1] : null;
    const bMsgs = b.conversation.messages;
    const bLastMsg = bMsgs ? bMsgs[bMsgs.length - 1] : null;
    const aTime = aLastMsg?.sentAt
      ? new Date(aLastMsg.sentAt).getTime()
      : new Date(a.conversation.createdAt).getTime();
    const bTime = bLastMsg?.sentAt
      ? new Date(bLastMsg.sentAt).getTime()
      : new Date(b.conversation.createdAt).getTime();
    return bTime - aTime;
  });

  const contacts = Array.from(me.root?.contactBook ?? []);

  const myID = (me as any).$jazz?.id as string | undefined;

  return (
    <aside className="relative w-full md:w-64 flex flex-col border-r border-hairline bg-panel overflow-hidden">
      {/* Header (Unit 9-3, item 2-B): avatar + name + gear→settings only.
          The Arcan/Lattice mark was removed from list chrome — it lives in
          the empty-pane watermark + auth screens, not here. The old "+"
          moved to the bottom-right FAB (item 2-C). */}
      <div className="p-4 border-b border-hairline flex items-center justify-between gap-2">
        <button
          type="button"
          data-testid="sidebar-header-profile"
          data-account-id={myID}
          onClick={() => myID && navigate(`/profile/${myID}`)}
          className="flex items-center gap-2 min-w-0 text-left hover:opacity-90 flex-1"
          aria-label="Open your profile"
        >
          <Avatar
            src={(me as any).profile.avatar}
            initials={me.profile.displayName?.[0] ?? "?"}
            size="sm"
            loadAs={me}
            data-testid="sidebar-avatar"
          />
          <span
            data-testid="sidebar-display-name"
            className="font-semibold text-text truncate"
          >
            {me.profile.displayName}
          </span>
        </button>
        <Link
          to="/settings"
          data-testid="sidebar-settings-gear"
          className="flex-shrink-0 text-text-2 hover:text-text"
          aria-label="Settings"
          title="Settings"
        >
          <Icon name="gear" size={20} />
        </Link>
      </div>

      {/*
        Tab header (Unit 4 Phase 4) — sidebar separation pinned to
        Option A · hairline under tabs (Unit 8d).

        The four options enumerated in design/hf-chat.jsx#SidebarOptions:
          A · hairline under tabs   <-- chosen
          B · section label ("recent")
          C · label + hairline
          D · spacing only

        Rationale (see docs/superpowers/plans/2026-06-13-unit-8d-mobile-chrome.md):
        A matches the current shipping treatment, keeps visual rhythm
        consistent with the mobile bottom tab bar's top hairline, and
        avoids the orphaned `recent` label that would imply a multi-group
        list the live sidebar doesn't have.

        Anchored by tests/unit/components/sidebar-separation.test.tsx —
        changes to this divider treatment must update that test in lockstep.
      */}
      <div className="flex border-b border-hairline" data-testid="sidebar-tabs">
        <button
          type="button"
          data-testid="sidebar-tab-chats"
          className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 ${
            tab === "chats"
              ? "text-text border-b-2 border-arcan-accent"
              : "text-dim"
          }`}
          onClick={() => setTab("chats")}
        >
          <Icon name="chat" size={16} />
          chats
        </button>
        <button
          type="button"
          data-testid="sidebar-tab-contacts"
          className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 ${
            tab === "contacts"
              ? "text-text border-b-2 border-arcan-accent"
              : "text-dim"
          }`}
          onClick={() => setTab("contacts")}
        >
          <Icon name="people" size={16} />
          contacts
        </button>
      </div>

      {/* Main nav: conversations OR contacts list, depending on active tab */}
      {tab === "chats" ? (
        <nav
          className="flex-1 overflow-y-auto p-2"
          data-testid="conversation-list"
          style={{
            // Mobile: clear the fixed MobileTabBar (56px) + iOS safe-area.
            // env() resolves to 0px on desktop; the tab bar is also hidden
            // there (md:hidden), so the extra 56px is harmless on >=md.
            paddingBottom: "calc(56px + env(safe-area-inset-bottom))",
          }}
        >
          {sortedActive.length === 0 ? (
            <EmptyPane
              variant="compact"
              title="no conversations yet"
              description="start a chat with one of your contacts."
              cta={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTab("contacts")}
                >
                  browse contacts
                </Button>
              }
              data-testid="sidebar-chats-empty"
            />
          ) : (
            sortedActive.map((c: any, i: number) => {
              const label = deriveConversationLabel(c.conversation, me);
              // Slice 8: per-row unread count + badge + bold styling.
              const convID = c.conversation.$jazz.id;
              const lastReadAt = (me.root as any).lastReadAt?.[convID];
              const isActive = convID === activeConvId;
              let unread = 0;
              if (myID && !isActive) {
                try {
                  unread = getUnreadCount(c.conversation, lastReadAt, myID);
                } catch {
                  unread = 0;
                }
              }
              return (
                <Link
                  key={i}
                  to={`/conversations/${convID}`}
                  className={`block p-2 hover:bg-accent rounded text-sm flex items-center gap-2 ${
                    unread > 0 ? "font-semibold" : ""
                  }`}
                  data-testid={`conversation-row-${i}`}
                  data-conversation-id={convID}
                >
                  <ConversationAvatar
                    conversationId={convID}
                    title={label}
                    icon={(c.conversation as any)?.icon}
                    size={32}
                    loadAs={me}
                    data-testid={`conversation-avatar-${i}`}
                  />
                  <span className="truncate flex-1">{label}</span>
                  {!isActive && unread > 0 && (
                    <span
                      data-testid={`unread-badge-${i}`}
                      className="flex-shrink-0 px-2 py-0.5 text-xs rounded-full bg-arcan-accent text-on-accent"
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
              );
            })
          )}
        </nav>
      ) : (
        <nav
          className="flex-1 overflow-y-auto p-2"
          data-testid="sidebar-contacts-list"
          style={{
            // Mobile: clear the fixed MobileTabBar (56px) + iOS safe-area.
            // env() resolves to 0px on desktop; the tab bar is also hidden
            // there (md:hidden), so the extra 56px is harmless on >=md.
            paddingBottom: "calc(56px + env(safe-area-inset-bottom))",
          }}
        >
          {contacts.length === 0 ? (
            <EmptyPane
              variant="compact"
              title="no contacts yet"
              description="invite someone with a QR code or share link."
              cta={
                <Link to="/contacts/add">
                  <Button size="sm" variant="outline">add a contact</Button>
                </Link>
              }
              data-testid="sidebar-contacts-empty"
            />
          ) : (
            contacts.map((c: any, i: number) => (
              <SidebarContactRow
                key={(c as any)?.$jazz?.id ?? i}
                contact={c}
                index={i}
                me={me}
              />
            ))
          )}
        </nav>
      )}

      {/* Unit 9-3 (item 2-C): bottom-right floating FAB replaces the old
          header "+". Context-aware target — new conversation in the chats
          tab, add-contact in the contacts tab (matches DesktopApp,
          design/proto.jsx:777). Item 2-D: the footer settings link was
          removed; settings is reached via the header gear. */}
      <Fab
        label={tab === "contacts" ? "Add a contact" : "New chat"}
        onClick={() =>
          navigate(tab === "contacts" ? "/contacts/add" : "/conversations/new")
        }
      />
    </aside>
  );
}
