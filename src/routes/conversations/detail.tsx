/**
 * ConversationDetailRoute: the main chat view for a single conversation.
 *
 * Renders Sidebar + a main panel containing:
 *   - Header: back link, conversation title, kebab menu with "Leave conversation"
 *   - ConnectionBanner: shown when offline
 *   - Message timeline: each message as a <MessageBubble>
 *   - Composer: text input + send button (disabled when all other members left)
 *
 * Title derivation (1:1): finds the contact in me.root.contactBook whose
 * linkedConversation matches this conversation's ID, and uses that contact's
 * displayNameLocal. Falls back to "Conversation" while loading.
 *
 * Author derivation: getAuthorAccountIDFromMessage() reads the create-tx signer
 * (immutable, unforgeable). Display name resolved from contactBook.
 *
 * composerDisabled: true when the ConversationGroup's direct-admin list is
 * length 1 (only me remains) — the other party has left.
 */

import { useRef, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAccount, useCoState } from "jazz-tools/react";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { Conversation } from "@/jazz/schema/Conversation";
import { Sidebar } from "@/components/sidebar";
import { Composer } from "@/components/composer";
import { MessageBubble } from "@/components/message-bubble";
import { ConnectionBanner } from "@/components/connection-banner";
import { Button } from "@/components/ui/button";
import { sendMessage } from "@/jazz/messages";
import { leaveConversation } from "@/jazz/conversation";
import { getAuthorAccountIDFromMessage } from "@/jazz/messages";

export function ConversationDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const me = useAccount(JazzMessangerAccount, {
    resolve: {
      profile: true,
      root: { contactBook: { $each: true } },
    },
  });

  const conversation = useCoState(Conversation, id as any, {
    resolve: { messages: { $each: true } },
  });

  // Auto-scroll to bottom whenever the message list grows
  const messageCount = (conversation as any)?.messages?.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount]);

  // ---- derived values (safe to call before early returns) ----

  const myAccountID = me.$isLoaded ? (me as any).$jazz?.id : null;

  // Derive title: find contact whose linkedConversation matches this conversation
  const contact =
    me.$isLoaded && id
      ? Array.from((me as any).root.contactBook).find(
          (c: any) => c?.linkedConversation?.$jazz?.id === id,
        )
      : null;

  const conversationTitle =
    (contact as any)?.displayNameLocal ?? "Conversation";

  // Build accountID → displayName map from contactBook for author display
  const contactDisplayNames: Record<string, string> = {};
  if (me.$isLoaded) {
    for (const c of Array.from((me as any).root.contactBook)) {
      const cAny = c as any;
      if (cAny?.contactAccountID && cAny?.displayNameLocal) {
        contactDisplayNames[cAny.contactAccountID] = cAny.displayNameLocal;
      }
    }
  }

  // composerDisabled: true when the ConversationGroup's direct admin list is 1
  // (only me remains after the other party left). We check this via the group
  // stored on the conversation.
  let composerDisabled = false;
  if (conversation) {
    const group = (conversation as any).$jazz?.owner;
    if (group) {
      try {
        const directAdmins = group
          .getDirectMembers()
          .filter((m: any) => m.role === "admin" || m.role === "writer");
        // If only 1 admin member (just me), the other party has left
        if (directAdmins.length <= 1) {
          composerDisabled = true;
        }
      } catch {
        // Group introspection unavailable — allow sending
      }
    }
  }

  // ---- loading / error states ----

  if (!me.$isLoaded) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

  if (conversation === null) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-red-600">Conversation not found.</p>
        </main>
      </div>
    );
  }

  if (!conversation) {
    // Still loading
    return (
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading conversation…</p>
        </main>
      </div>
    );
  }

  // ---- handlers ----

  async function handleSend(body: string) {
    await sendMessage(me, conversation, body);
  }

  async function handleLeave() {
    if (!confirm("Leave this conversation? You will lose access to its messages.")) return;
    setMenuOpen(false);
    setLeaving(true);
    try {
      await leaveConversation(me, conversation);
      navigate("/conversations");
    } finally {
      setLeaving(false);
    }
  }

  // ---- render ----

  const messages = Array.from((conversation as any).messages ?? []);

  return (
    <div className="flex h-screen" data-testid="conversation-detail">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-white">
          <Link
            to="/conversations"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back
          </Link>

          <h1
            className="flex-1 font-semibold text-gray-900 truncate"
            data-testid="conversation-title"
          >
            {conversationTitle}
          </h1>

          {/* Kebab menu */}
          <div className="relative">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMenuOpen((v) => !v)}
              data-testid="conversation-menu-btn"
              title="Conversation options"
            >
              ⋮
            </Button>

            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-10 bg-white border border-border rounded shadow-md min-w-[160px]"
                data-testid="conversation-menu"
              >
                <button
                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  onClick={() => void handleLeave()}
                  disabled={leaving}
                  data-testid="leave-conversation-btn"
                >
                  {leaving ? "Leaving…" : "Leave conversation"}
                </button>
              </div>
            )}
          </div>
        </div>

        <ConnectionBanner />

        {/* Message timeline */}
        <div
          className="flex-1 overflow-y-auto py-2"
          data-testid="message-timeline"
          onClick={() => setMenuOpen(false)}
        >
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">
                No messages yet. Say hello!
              </p>
            </div>
          ) : (
            messages.map((message: any, i: number) => {
              const authorAccountID = getAuthorAccountIDFromMessage(message);
              const isMine = authorAccountID === myAccountID;
              const authorDisplayName = authorAccountID
                ? (contactDisplayNames[authorAccountID] ??
                  (isMine
                    ? ((me as any).profile?.displayName ?? "Me")
                    : "Unknown"))
                : "Unknown";

              return (
                <MessageBubble
                  key={(message as any)?.$jazz?.id ?? i}
                  message={message}
                  authorAccountID={authorAccountID}
                  authorDisplayName={authorDisplayName}
                  isMine={isMine}
                  me={me}
                />
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <Composer
          onSend={handleSend}
          disabled={composerDisabled}
        />
      </main>
    </div>
  );
}
