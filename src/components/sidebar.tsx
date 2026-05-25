import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { Button } from "@/components/ui/button";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { ContactPicker } from "@/components/contact-picker";
import { GroupCreateDialog } from "@/components/group-create-dialog";
import { findOrCreate1to1Conversation, createGroupConversation, isArchived } from "@/jazz/conversation";
import { resolveDisplayName } from "@/jazz/displayName";

/**
 * Sidebar component for the main layout.
 *
 * Slice 3b: displays conversation list derived from me.root.knownConversations,
 * sorted by last message timestamp descending. A "+" button opens the
 * ContactPicker to start a new 1:1 conversation. Contacts moved to /contacts.
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

export function Sidebar() {
  const me = useAccount(JazzMessangerAccount, {
    resolve: {
      profile: true,
      root: {
        contactBook: { $each: true },
        // $onError: "catch" ensures the sidebar loads even when some conversations
        // become inaccessible (e.g. after the user is kicked and Jazz revokes their
        // read access to the ConversationGroup). Without this, the whole
        // knownConversations resolve stalls indefinitely and me.$isLoaded stays false.
        knownConversations: { $each: { $onError: "catch" } },
      },
    },
  });
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingGroupContacts, setPendingGroupContacts] = useState<any[] | null>(null);

  // Render a minimal shell while loading — avoids layout flash.
  if (!me.$isLoaded) {
    return (
      <aside className="w-64 flex flex-col border-r border-gray-200 bg-white">
        <div className="p-4 border-b border-gray-200">
          <span className="text-sm text-gray-400">Loading…</span>
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

  async function handlePickContacts(contacts: any[]) {
    setPickerOpen(false);
    if (contacts.length === 1) {
      const conversation = await findOrCreate1to1Conversation(me, contacts[0]);
      navigate(`/conversations/${(conversation as any).$jazz.id}`);
    } else if (contacts.length >= 2) {
      setPendingGroupContacts(contacts);
    }
  }

  return (
    <>
      <aside className="w-64 flex flex-col border-r border-gray-200 bg-white">
        {/* Header: display name + new chat button */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-2">
          <span
            data-testid="sidebar-display-name"
            className="font-semibold text-gray-800 truncate"
          >
            {me.profile.displayName}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPickerOpen(true)}
            data-testid="new-chat-btn"
            className="flex-shrink-0"
            title="New chat"
          >
            +
          </Button>
        </div>

        {/* Main nav: conversation list */}
        <nav
          className="flex-1 overflow-y-auto p-2"
          data-testid="conversation-list"
        >
          {sortedActive.length === 0 ? (
            <div className="p-4 text-center space-y-3">
              <p className="text-sm text-muted-foreground">No conversations yet.</p>
              <Link to="/contacts">
                <Button size="sm" variant="outline">
                  Browse contacts
                </Button>
              </Link>
            </div>
          ) : (
            sortedActive.map((c: any, i: number) => {
              const label = deriveConversationLabel(c.conversation, me);
              return (
                <Link
                  key={i}
                  to={`/conversations/${c.conversation.$jazz.id}`}
                  className="block p-2 hover:bg-accent rounded text-sm"
                  data-testid={`conversation-row-${i}`}
                >
                  {label}
                </Link>
              );
            })
          )}
        </nav>

        {/* Footer: contacts + settings links */}
        <div className="p-4 border-t border-gray-200 flex flex-col gap-2">
          <Link
            to="/contacts"
            data-testid="contacts-link"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            📇 Contacts
          </Link>
          <Link
            to="/settings"
            data-testid="settings-link"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ⚙ Settings
          </Link>
        </div>
      </aside>

      {pickerOpen && (
        <ContactPicker
          onSelect={handlePickContacts}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {pendingGroupContacts && (
        <GroupCreateDialog
          participantNames={pendingGroupContacts.map(
            (c: any) => c?.displayNameLocal ?? "(unknown)",
          )}
          onCreate={async (title) => {
            const accountIDs = pendingGroupContacts.map(
              (c: any) => c.contactAccountID as string,
            );
            const conv = await createGroupConversation(me, accountIDs, title);
            setPendingGroupContacts(null);
            navigate(`/conversations/${(conv as any).$jazz.id}`);
          }}
          onCancel={() => setPendingGroupContacts(null)}
        />
      )}
    </>
  );
}
