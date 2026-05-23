import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { Button } from "@/components/ui/button";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { ContactPicker } from "@/components/contact-picker";
import { findOrCreate1to1Conversation } from "@/jazz/conversation";

/**
 * Sidebar component for the main layout.
 *
 * Slice 3b: displays conversation list derived from me.root.knownConversations,
 * sorted by last message timestamp descending. A "+" button opens the
 * ContactPicker to start a new 1:1 conversation. Contacts moved to /contacts.
 */
export function Sidebar() {
  const me = useAccount(JazzMessangerAccount, {
    resolve: {
      profile: true,
      root: {
        contactBook: { $each: true },
        knownConversations: { $each: true },
      },
    },
  });
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);

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

  // Slice 3b: derive conversation list from knownConversations (unified for 1:1 and groups).
  // Contact lookup uses contactBook for display names on DM conversations.
  const contactBook = me.root.contactBook;
  const knownConversations = me.root.knownConversations;

  const conversations = Array.from(knownConversations ?? [])
    .filter((c: any) => c != null)
    .map((c: any) => {
      // For DM conversations, find the other participant's contact for display name.
      const contact =
        c.kind === "dm"
          ? Array.from(contactBook).find((ct: any) => {
              if (!ct) return false;
              const group = c.$jazz?.owner;
              if (!group) return false;
              return group
                .getDirectMembers()
                .some(
                  (m: any) =>
                    m.account?.$jazz?.id === ct.contactAccountID,
                );
            })
          : null;
      return { conversation: c, contact };
    });

  // Sort by last message sentAt descending; fall back to conversation createdAt.
  conversations.sort((a: any, b: any) => {
    const msgs = a.conversation.messages;
    const aLastMsg = msgs ? msgs[msgs.length - 1] : null;
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

  async function handlePickContact(contact: any) {
    setPickerOpen(false);
    const conversation = await findOrCreate1to1Conversation(me, contact);
    navigate(`/conversations/${(conversation as any).$jazz.id}`);
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
          {conversations.length === 0 ? (
            <div className="p-4 text-center space-y-3">
              <p className="text-sm text-muted-foreground">No conversations yet.</p>
              <Link to="/contacts">
                <Button size="sm" variant="outline">
                  Browse contacts
                </Button>
              </Link>
            </div>
          ) : (
            conversations.map((c: any, i: number) => {
              // Derive display label: use contact name for DM, title for group
              const label =
                c.contact?.displayNameLocal ??
                c.conversation?.title ??
                "Conversation";
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
          onSelect={handlePickContact}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
