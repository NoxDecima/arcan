import { Link, useNavigate, useParams } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { Button } from "@/components/ui/button";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { isArchived } from "@/jazz/conversation";
import { resolveDisplayName } from "@/jazz/displayName";
import { Avatar } from "@/components/avatar";
import { ConversationAvatar } from "@/components/conversation-avatar";
import { getUnreadCount } from "@/jazz/notifications";
import { useSidebarTab } from "@/components/sidebar-tab";
import { resolveAvatarFileBlob, useRemoteAvatar } from "@/jazz/avatarResolver";

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
      <aside className="w-full md:w-64 flex flex-col border-r border-hairline bg-panel">
        <div className="p-4 border-b border-hairline">
          <span className="text-sm text-dim">Loading…</span>
        </div>
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
    <aside className="w-full md:w-64 flex flex-col border-r border-hairline bg-panel">
      {/* Header: avatar + display name + new chat button */}
      <div className="p-4 border-b border-hairline flex items-center justify-between gap-2">
        <button
          type="button"
          data-testid="sidebar-header-profile"
          onClick={() => myID && navigate(`/profile/${myID}`)}
          className="flex items-center gap-2 min-w-0 text-left hover:opacity-90"
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
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate("/conversations/new")}
          data-testid="new-chat-btn"
          className="flex-shrink-0"
          title="New chat"
        >
          +
        </Button>
      </div>

      {/* Tab header (Unit 4 Phase 4) */}
      <div className="flex border-b border-hairline" data-testid="sidebar-tabs">
        <button
          type="button"
          data-testid="sidebar-tab-chats"
          className={`flex-1 py-2 text-xs font-semibold ${
            tab === "chats"
              ? "text-text border-b-2 border-arcan-accent"
              : "text-dim"
          }`}
          onClick={() => setTab("chats")}
        >
          chats
        </button>
        <button
          type="button"
          data-testid="sidebar-tab-contacts"
          className={`flex-1 py-2 text-xs font-semibold ${
            tab === "contacts"
              ? "text-text border-b-2 border-arcan-accent"
              : "text-dim"
          }`}
          onClick={() => setTab("contacts")}
        >
          contacts
        </button>
      </div>

      {/* Main nav: conversations OR contacts list, depending on active tab */}
      {tab === "chats" ? (
        <nav
          className="flex-1 overflow-y-auto p-2"
          data-testid="conversation-list"
        >
          {sortedActive.length === 0 ? (
            <div className="p-4 text-center space-y-3">
              <p className="text-sm text-muted-foreground">No conversations yet.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTab("contacts")}
              >
                Browse contacts
              </Button>
            </div>
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
        >
          {contacts.length === 0 ? (
            <div className="p-4 text-center space-y-3">
              <p className="text-sm text-muted-foreground">No contacts yet.</p>
              <Link to="/contacts/add">
                <Button size="sm" variant="outline">
                  Add a contact
                </Button>
              </Link>
            </div>
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

      {/* Footer: settings link */}
      <div className="p-4 border-t border-hairline flex flex-col gap-2">
        <Link
          to="/settings"
          data-testid="settings-link"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ⚙ Settings
        </Link>
      </div>
    </aside>
  );
}
