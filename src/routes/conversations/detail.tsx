/**
 * ConversationDetailRoute: the main chat view for a single conversation.
 *
 * Renders Sidebar + a main panel containing:
 *   - Header: back link, conversation title, members link
 *   - ConnectionBanner: shown when offline
 *   - Message timeline: each message as a <MessageBubble>, interleaved with
 *     SystemEvent entries from the conversation's sidecar log.
 *   - Composer: text input + send button (disabled when composerDisabled —
 *     only me remains in an active 1:1)
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
 *
 * If me has been revoked from the ConversationGroup (e.g. kicked), the URL
 * is unreadable — we redirect to /conversations rather than render a stub.
 */

import { useRef, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAccount, useCoState } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Conversation } from "@/jazz/schema/Conversation";
import { Sidebar } from "@/components/sidebar";
import { Composer } from "@/components/composer";
import { MessageBubble } from "@/components/message-bubble";
import { ConnectionBanner } from "@/components/connection-banner";
import { Button } from "@/components/ui/button";
import { sendMessage } from "@/jazz/messages";
import { getAuthorAccountIDFromMessage } from "@/jazz/messages";
import { SystemEvent } from "@/components/system-event";
import { resolveDisplayName } from "@/jazz/displayName";
import { isArchived, ensureMyWriteGroup } from "@/jazz/conversation";

export function ConversationDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const bottomRef = useRef<HTMLDivElement>(null);

  const me = useAccount(ArcanAccount, {
    resolve: {
      profile: true,
      // Slice 8: lastReadAt is required for markRead to write the cutoff.
      root: {
        contactBook: { $each: true },
        knownConversations: true,
        lastReadAt: true,
      },
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

  // Unit 4 Phase 3: mark-on-send + mark-on-leave semantics.
  // anchorRef captures lastReadAt at mount for the "new messages" divider
  // (rendered in a later phase). latestRenderedSentAtRef tracks the newest
  // message currently rendered so mark-on-leave can advance the cutoff.
  const anchorRef = useRef<number | null>(null);
  const latestRenderedSentAtRef = useRef<number>(0);

  // Capture anchor lastReadAt at mount.
  useEffect(() => {
    const lastReadMap = (me as any)?.root?.lastReadAt;
    const convId = (conversation as any)?.$jazz?.id as string | undefined;
    if (!convId) return;
    const prev = lastReadMap?.[convId];
    anchorRef.current = typeof prev === "number" ? prev : 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(conversation as any)?.$jazz?.id]);

  // Track the latest rendered message's sentAt.
  useEffect(() => {
    const messages = (conversation as any)?.messages ?? [];
    let maxT = latestRenderedSentAtRef.current;
    for (const m of messages) {
      const t = m?.sentAt instanceof Date ? m.sentAt.getTime() : (typeof m?.sentAt === "number" ? m.sentAt : 0);
      if (t > maxT) maxT = t;
    }
    latestRenderedSentAtRef.current = maxT;
  }, [(conversation as any)?.messages?.length]);

  // Mark on leave: fires on route change (cleanup), visibilitychange-to-hidden,
  // and beforeunload. Advances lastReadAt to latestRenderedSentAt + 1.
  useEffect(() => {
    const convId = (conversation as any)?.$jazz?.id as string | undefined;
    if (!convId) return;

    const markLeave = () => {
      const latest = latestRenderedSentAtRef.current;
      if (latest <= 0) return;
      const next = latest + 1;
      const lastReadMap = (me as any)?.root?.lastReadAt;
      const cur = lastReadMap?.[convId] ?? 0;
      if (next > cur && lastReadMap && typeof lastReadMap.$jazz?.set === "function") {
        lastReadMap.$jazz.set(convId, next);
      }
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") markLeave();
    };
    const onBeforeUnload = () => markLeave();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // route-change cleanup
      markLeave();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(conversation as any)?.$jazz?.id]);

  // ---- derived values (safe to call before early returns) ----

  // useNavigate MUST be called here (before any conditional returns) — hooks
  // must always be called in the same order regardless of component state.
  const navigate = useNavigate();

  // Redirect to /conversations when me has been revoked from this conversation.
  // Reachable via a bookmarked URL after being kicked, or via direct nav before
  // the sidebar's filter has settled. Hook order is preserved by calling
  // useEffect unconditionally.
  const archivedForMe =
    me.$isLoaded && conversation ? isArchived(me, conversation) : false;
  useEffect(() => {
    if (archivedForMe) navigate("/conversations", { replace: true });
  }, [archivedForMe, navigate]);

  const myAccountID = me.$isLoaded ? (me as any).$jazz?.id : null;

  // Derive title: for DM conversations find the contact whose contactAccountID
  // matches one of the other members of the conversation's owning Group.
  // Falls back to conversation.title (group chats) or "Conversation".
  // "View contact" affordance: show when the conversation has exactly two
  // direct admin/writer members (me + one other) AND the other one is in my
  // contact book. Replaces the prior kind === "dm" gate per Slice 3c.
  const contact =
    me.$isLoaded && id && conversation
      ? (() => {
          const conv = conversation as any;
          const group = conv.$jazz?.owner;
          if (!group) return null;
          const myID = (me as any).$jazz?.id;
          let members: any[] = [];
          try {
            members = group.getDirectMembers();
          } catch {
            return null;
          }
          const participants = members.filter(
            (m: any) => m.role === "admin" || m.role === "writer",
          );
          if (participants.length !== 2) return null;
          const otherMember = participants.find(
            (m: any) => m.account?.$jazz?.id !== myID,
          );
          if (!otherMember) return null;
          const otherID = otherMember.account?.$jazz?.id;
          const contactBook = (me as any).root?.contactBook;
          if (!contactBook || !otherID) return null;
          return (
            (Array.from(contactBook).find(
              (ct: any) => ct?.contactAccountID === otherID,
            ) as any) ?? null
          );
        })()
      : null;

  const conversationTitle =
    (contact as any)?.displayNameLocal ??
    (conversation as any)?.title ??
    "Conversation";

  // composerDisabled: true when the ConversationGroup's direct admin list is 1
  // (only me remains after the other party left in an active conversation).
  let composerDisabled = false;
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
    }
  }

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
    // Still loading
    return (
      <div className="flex h-screen">
        <div className="hidden md:contents"><Sidebar /></div>
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading conversation…</p>
        </main>
      </div>
    );
  }

  // ---- handlers ----

  async function handleSend(body: string, attachments: any[]) {
    await sendMessage(me as any, conversation, body, attachments);
    // Mark-on-send: advance lastReadAt to now so the message I just sent
    // doesn't appear as unread on my other devices/tabs.
    const convId = (conversation as any)?.$jazz?.id as string | undefined;
    const lastReadMap = (me as any)?.root?.lastReadAt;
    if (convId && lastReadMap && typeof lastReadMap.$jazz?.set === "function") {
      const cur = lastReadMap?.[convId] ?? 0;
      const next = Date.now();
      if (next > cur) lastReadMap.$jazz.set(convId, next);
    }
  }

  async function handleGetWriteGroup() {
    return ensureMyWriteGroup(me as any, conversation);
  }

  // ---- render ----

  const messages = Array.from((conversation as any).messages ?? []);

  return (
    <div className="flex h-screen" data-testid="conversation-detail">
      <div className="hidden md:contents"><Sidebar /></div>

      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-panel">
          <Link
            to="/conversations"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back
          </Link>

          <h1
            className="flex-1 font-semibold text-text truncate"
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
          {(() => {
            const conversationGroup = (conversation as any)?.$jazz?.owner;
            type TimelineItem =
              | { kind: "message"; data: any; sortAt: number; key: string }
              | { kind: "event"; data: any; sortAt: number; key: string };

            const items: TimelineItem[] = [];
            for (const m of messages as any[]) {
              const sentAt = (m as any)?.sentAt;
              const ts = sentAt instanceof Date ? sentAt.getTime() : new Date(sentAt ?? 0).getTime();
              items.push({
                kind: "message",
                data: m,
                sortAt: ts,
                key: `m-${(m as any)?.$jazz?.id ?? items.length}`,
              });
            }
            const eventsList = Array.from(((conversation as any)?.systemEvents ?? []) as any[]);
            for (const e of eventsList) {
              const occurredAt = (e as any)?.occurredAt;
              const ts = occurredAt instanceof Date ? occurredAt.getTime() : new Date(occurredAt ?? 0).getTime();
              items.push({
                kind: "event",
                data: e,
                sortAt: ts,
                key: `e-${(e as any)?.$jazz?.id ?? items.length}`,
              });
            }
            items.sort((a, b) => a.sortAt - b.sortAt);

            if (items.length === 0) {
              return (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">
                    No messages yet. Say hello!
                  </p>
                </div>
              );
            }

            return items.map((item) => {
              if (item.kind === "message") {
                const message = item.data;
                const authorAccountID = getAuthorAccountIDFromMessage(message);
                const isMine = authorAccountID === myAccountID;
                const authorDisplayName = authorAccountID
                  ? resolveDisplayName({
                      accountID: authorAccountID,
                      me,
                      group: conversationGroup,
                    })
                  : "Unknown";
                return (
                  <MessageBubble
                    key={item.key}
                    message={message}
                    authorAccountID={authorAccountID}
                    authorDisplayName={authorDisplayName}
                    isMine={isMine}
                    me={me}
                    group={conversationGroup}
                  />
                );
              }
              return (
                <SystemEvent
                  key={item.key}
                  event={item.data}
                  me={me}
                  group={conversationGroup}
                />
              );
            });
          })()}

          <div ref={bottomRef} />
        </div>

        <Composer
          onSend={handleSend}
          getWriteGroup={handleGetWriteGroup}
          disabled={composerDisabled}
        />
      </main>
    </div>
  );
}
