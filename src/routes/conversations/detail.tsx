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
 * contactAccountID matches another member of the conversation's owning Group.
 * Falls back to conversation.title (groups) or "Conversation" while loading.
 *
 * Author derivation: getAuthorAccountIDFromMessage() reads the create-tx signer
 * (immutable, unforgeable). Display name resolved from contactBook.
 *
 * composerDisabled: true when the ConversationGroup's direct-admin list is
 * length 1 (only me remains) — the other party has left.
 */

import { useRef, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAccount, useCoState } from "jazz-tools/react";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { Conversation } from "@/jazz/schema/Conversation";
import { Sidebar } from "@/components/sidebar";
import { Composer } from "@/components/composer";
import { MessageBubble } from "@/components/message-bubble";
import { ConnectionBanner } from "@/components/connection-banner";
import { Button } from "@/components/ui/button";
import { sendMessage } from "@/jazz/messages";
import { getAuthorAccountIDFromMessage } from "@/jazz/messages";
import { SystemEvent } from "@/components/system-event";

export function ConversationDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const bottomRef = useRef<HTMLDivElement>(null);

  const me = useAccount(JazzMessangerAccount, {
    resolve: {
      profile: true,
      root: { contactBook: { $each: true }, knownConversations: true },
    },
  });

  const conversation = useCoState(Conversation, id as any, {
    resolve: { messages: { $each: true } },
  });

  // Jazz's useCoState fires re-renders when the Conversation CoValue itself
  // changes, but NOT when its owning ConversationGroup's membership changes
  // (e.g., the other party leaves). We poll every 2s while the view is open
  // so composerDisabled + leftMembers re-evaluate against the current group
  // state. Future: replace with an explicit Group subscription if jazz-tools
  // exposes one cleanly.
  const [pollTick, setPollTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setPollTick((t) => t + 1), 2000);
    return () => clearInterval(interval);
  }, []);

  void pollTick;

  // Auto-scroll to bottom whenever the message list grows
  const messageCount = (conversation as any)?.messages?.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount]);

  // ---- derived values (safe to call before early returns) ----

  const myAccountID = me.$isLoaded ? (me as any).$jazz?.id : null;

  // Derive title: for DM conversations find the contact whose contactAccountID
  // matches one of the other members of the conversation's owning Group.
  // Falls back to conversation.title (group chats) or "Conversation".
  const contact =
    me.$isLoaded && id && conversation
      ? (() => {
          const conv = conversation as any;
          if (conv.kind !== "dm") return null;
          const group = conv.$jazz?.owner;
          if (!group) return null;
          const members = (() => {
            try {
              return group.getDirectMembers();
            } catch {
              return [];
            }
          })();
          const contactBook = (me as any).root?.contactBook;
          if (!contactBook) return null;
          return Array.from(contactBook).find((ct: any) => {
            if (!ct?.contactAccountID) return false;
            return members.some(
              (m: any) => m.account?.$jazz?.id === ct.contactAccountID,
            );
          }) ?? null;
        })()
      : null;

  const conversationTitle =
    (contact as any)?.displayNameLocal ??
    (conversation as any)?.title ??
    "Conversation";

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
  // (only me remains after the other party left).
  //
  // leftMembers: contacts whose current role on the conversation is "revoked"
  // — rendered as system events at the bottom of the timeline.
  //
  // Note: Jazz's getDirectMembers() returns GroupMember[] typed with
  // AccountRole (reader / writer / admin / manager / writeOnly), which
  // EXCLUDES "revoked" — revoked members are filtered out of that list.
  // To detect revocations we use group.getRoleOf(accountID), which returns
  // the full Role type including "revoked". For the 1:1 case we check the
  // contact paired with this conversation. (Slice 3b will iterate all
  // participants for the N-way case.)
  let composerDisabled = false;
  const leftMembers: { accountID: string; displayName: string }[] = [];
  if (conversation) {
    const group = (conversation as any).$jazz?.owner;
    if (group) {
      try {
        const activeWriters = group
          .getDirectMembers()
          .filter((m: any) => m.role === "admin" || m.role === "writer");
        if (activeWriters.length <= 1) {
          composerDisabled = true;
        }
      } catch {
        // Group introspection unavailable — allow sending
      }

      // Identify the leaver when composer is disabled. Jazz's getRoleOf
      // returns `undefined` for both "never-a-member" and "was-revoked"
      // (they're indistinguishable via this API), so we infer "the other
      // party left" from composerDisabled and find the leaver via:
      //   1. The contact derived from group membership (most reliable)
      //   2. Fallback to Conversation.createdBy if it's not me
      if (composerDisabled) {
        let leaverID: string | undefined;
        let leaverName = "Someone";

        if (contact) {
          const cAny = contact as any;
          if (cAny.contactAccountID && cAny.contactAccountID !== myAccountID) {
            leaverID = cAny.contactAccountID;
            leaverName = cAny.displayNameLocal ?? "Someone";
          }
        }

        if (!leaverID) {
          const createdBy = (conversation as any).createdBy;
          if (createdBy && createdBy !== myAccountID) {
            leaverID = createdBy;
            const cb = (me as any).root?.contactBook;
            if (cb) {
              for (const c of Array.from(cb)) {
                const cAny = c as any;
                if (cAny?.contactAccountID === createdBy) {
                  leaverName = cAny.displayNameLocal ?? "Someone";
                  break;
                }
              }
            }
          }
        }

        if (leaverID) {
          leftMembers.push({ accountID: leaverID, displayName: leaverName });
        }
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

          {/* Members link */}
          <Link
            to={`/conversations/${id}/members`}
            data-testid="members-link"
          >
            <Button size="sm" variant="ghost" title="View members">
              👥 Members
            </Button>
          </Link>
        </div>

        <ConnectionBanner />

        {/* Message timeline */}
        <div
          className="flex-1 overflow-y-auto py-2"
          data-testid="message-timeline"
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

          {/* System events: members who have left the conversation */}
          {leftMembers.map((m) => (
            <SystemEvent
              key={`left-${m.accountID}`}
              kind="left"
              targetName={m.displayName}
            />
          ))}

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
