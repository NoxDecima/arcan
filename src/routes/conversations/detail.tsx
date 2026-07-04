/**
 * ConversationDetailRoute: the main chat view for a single conversation.
 *
 * Unit 10 Wave B Task 3: renders ChatScreen/ChatComposer presenters.
 * All container logic (effects, derivations, handlers) is preserved verbatim
 * from the pre-Wave-B implementation. The legacy MessageBubble + Composer
 * visual markup no longer renders on this route (files stay until Phase 4).
 *
 * Unit 9-2 / 2-F: the persistent sidebar is provided by <AppShell>; this
 * route renders only its main panel into the shell's outlet column. On
 * mobile the chat view is full-screen (the shell's sidebar is hidden) and
 * the in-header "← Back" button returns to the conversation list.
 *
 * Renders a main panel containing:
 *   - Header: back button (mobile-only), conversation title, members/profile link
 *   - ConnectionBanner: shown when offline
 *   - Message timeline: each message as a kit Bubble, interleaved with
 *     SystemEvent entries from the conversation's sidecar log, plus day
 *     markers and the unread divider.
 *   - Composer: ChatComposer with file-upload state (disabled when
 *     composerDisabled — only me remains in an active 1:1)
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

import { useRef, useEffect, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAccount, useCoState } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Conversation } from "@/jazz/schema/Conversation";
import { ConnectionBanner } from "@/components/connection-banner";
import {
  sendMessage,
  getAuthorAccountIDFromMessage,
  editMessage,
  deleteMessage,
} from "@/jazz/messages";
import { resolveDisplayName } from "@/jazz/displayName";
import { isArchived, ensureMyWriteGroup } from "@/jazz/conversation";
import {
  findNewMarkIndex,
  type DividerTimelineItem,
} from "@/routes/conversations/newMarkPosition";
import { ChatHeaderSkeleton, ChatMessagesSkeleton } from "@/components/skeleton";
import { useIsDesktop } from "@/components/use-is-desktop";
import { initialsFromTitle } from "@/components/conversation-avatar";
import { MessageAttachments } from "@/components/message-attachments";
import {
  ComposerAttachmentTray,
  type PendingAttachment,
} from "@/components/composer-attachment-tray";
import {
  uploadAttachment,
  AttachmentTooLargeError,
  MAX_ATTACHMENT_BYTES,
} from "@/jazz/attachments";
import { formatSystemEventMessage } from "@/components/system-event";
import {
  ChatScreen,
  ChatComposer,
  type ChatTimelineItem,
  type ChatHeaderVM,
} from "@/ui/screens";

// ---- module-level helpers (mirrors Composer component internals) ----

let tempIdCounter = 0;
function nextTempId(): string {
  tempIdCounter += 1;
  return `pending-${tempIdCounter}-${Date.now()}`;
}

function isAcceptablePick(
  file: File,
): { ok: true } | { ok: false; reason: string } {
  if (file.size === 0) return { ok: false, reason: `${file.name} is empty.` };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      reason: `${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB. Max 5 MB per attachment.`,
    };
  }
  return { ok: true };
}

/** Local date string YYYY-MM-DD (local timezone, for day-marker boundaries). */
function localDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Day marker label for a timeline date.
 * "today" / "yesterday" / "d MMM" lowercase (e.g. "12 jun").
 * Manifest note: the prototype only shows "today"; the older-day format
 * is an inference — flagged Rung 4 for possible revision. (Unit 10 Wave B)
 */
function dayLabel(
  dateStr: string,
  todayStr: string,
  yesterdayStr: string,
): string {
  if (dateStr === todayStr) return "today";
  if (dateStr === yesterdayStr) return "yesterday";
  const parts = dateStr.split("-");
  const months = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];
  return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]}`;
}

// ---- component ----

export function ConversationDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  // Autoscroll anchor
  const bottomRef = useRef<HTMLDivElement>(null);

  // Composer state (moved from Composer component to this container)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [composerText, setComposerText] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Edit/delete per-message state (moved from MessageBubble to this container)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

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
    // icon: true — the conversation's icon FileBlob feeds the header avatar
    // (same one-shot resolution pattern as use-home-lists.ts).
    resolve: { messages: { $each: true }, icon: true },
  });

  // Header avatar: one-shot conversation-icon resolution (Wave A pattern).
  // Per-message author photos stay initials-only — folded into the tracked
  // remote-avatar followup (same useRemoteAvatar mechanism as home lists).
  const [headerAvatarUrl, setHeaderAvatarUrl] = useState<string | null>(null);
  const iconStreamId: string | null =
    (conversation as any)?.icon?.data?.$jazz?.id ?? null;
  useEffect(() => {
    if (!iconStreamId) {
      setHeaderAvatarUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    void (async () => {
      try {
        const { co } = await import("jazz-tools");
        const blob = await co
          .fileStream()
          .loadAsBlob(iconStreamId, { loadAs: me as any });
        if (cancelled || !blob) return;
        createdUrl = URL.createObjectURL(blob);
        setHeaderAvatarUrl(createdUrl);
      } catch {
        if (!cancelled) setHeaderAvatarUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iconStreamId]);

  // Auto-scroll to bottom whenever the message list grows
  const messageCount = (conversation as any)?.messages?.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount]);

  // Unit 4 Phase 3: mark-on-send + mark-on-leave semantics.
  // anchorRef captures lastReadAt at mount for the "new messages" divider.
  // latestRenderedSentAtRef tracks the newest message currently rendered so
  // mark-on-leave can advance the cutoff.
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
      const t =
        m?.sentAt instanceof Date
          ? m.sentAt.getTime()
          : typeof m?.sentAt === "number"
            ? m.sentAt
            : 0;
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
      if (
        next > cur &&
        lastReadMap &&
        typeof lastReadMap.$jazz?.set === "function"
      ) {
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

  // Phase 7: auto-scroll the new-messages divider into view on mount.
  // Runs once per conversation switch; if there's no divider we no-op.
  useEffect(() => {
    const t = setTimeout(() => {
      const el = document.querySelector('[data-testid="new-messages-divider"]');
      if (el) {
        (el as HTMLElement).scrollIntoView({ block: "center", behavior: "auto" });
      }
    }, 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(conversation as any)?.$jazz?.id]);

  // ---- derived values (safe to call before early returns) ----

  // useNavigate already called above (hook order preserved).

  // Redirect to /conversations when me has been revoked from this conversation.
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
      <main
        className="flex-1 flex flex-col min-w-0"
        data-testid="conversation-detail-loading"
      >
        <ChatHeaderSkeleton />
        <ChatMessagesSkeleton />
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
    // Still loading
    return (
      <main
        className="flex-1 flex flex-col min-w-0"
        data-testid="conversation-detail-loading-late"
      >
        <ChatHeaderSkeleton />
        <ChatMessagesSkeleton />
      </main>
    );
  }

  // ---- handlers ----

  const convId = (conversation as any)?.$jazz?.id as string | undefined;

  async function handleSend(body: string, attachments: any[]) {
    await sendMessage(me as any, conversation, body, attachments);
    // Mark-on-send: advance lastReadAt to now so the message I just sent
    // doesn't appear as unread on my other devices/tabs.
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

  // ---- composer handlers ----

  function showComposerError(msg: string) {
    setComposerError(msg);
    window.setTimeout(
      () => setComposerError((prev) => (prev === msg ? null : prev)),
      4000,
    );
  }

  function ingestFiles(files: FileList | File[]) {
    const accepted: PendingAttachment[] = [];
    const rejections: string[] = [];
    for (const f of Array.from(files)) {
      const verdict = isAcceptablePick(f);
      if (verdict.ok) {
        accepted.push({ tempId: nextTempId(), file: f });
      } else {
        rejections.push(verdict.reason);
      }
    }
    if (accepted.length > 0) setPending((prev) => [...prev, ...accepted]);
    if (rejections.length > 0) showComposerError(rejections.join(" "));
  }

  function handlePickClick() {
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) ingestFiles(e.target.files);
    e.target.value = ""; // reset so re-picking the same file fires onChange
  }

  function handleRemovePending(tempId: string) {
    setPending((prev) => prev.filter((p) => p.tempId !== tempId));
  }

  function handleComposerPaste(e: ClipboardEvent<HTMLInputElement>) {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      const realFiles = Array.from(files).filter((f) => f.size > 0);
      if (realFiles.length > 0) {
        e.preventDefault();
        ingestFiles(realFiles);
      }
    }
  }

  async function handleComposerSend() {
    if (isSending || composerDisabled) return;
    const trimmed = composerText.trim();
    if (!trimmed && pending.length === 0) return;

    setIsSending(true);
    try {
      let uploaded: any[] = [];
      if (pending.length > 0) {
        const writeGroup = await handleGetWriteGroup();
        for (const p of pending) {
          try {
            const blob = await uploadAttachment(writeGroup, p.file);
            uploaded.push(blob);
          } catch (err) {
            if (err instanceof AttachmentTooLargeError) {
              showComposerError(err.message);
            } else {
              showComposerError("Sending failed — try again.");
            }
            return; // keep tray + text intact for retry
          }
        }
      }
      await handleSend(trimmed, uploaded);
      setComposerText("");
      setPending([]);
      setComposerError(null);
    } catch {
      showComposerError("Sending failed — try again.");
    } finally {
      setIsSending(false);
    }
  }

  // ---- edit/delete handlers ----

  async function handleSaveEdit(message: any) {
    const trimmed = editText.trim();
    if (!trimmed) return;
    await editMessage(me as any, message, trimmed);
    setEditingMessageId(null);
  }

  async function handleDeleteMessage(message: any) {
    if (!confirm("Delete this message for everyone in this chat?")) return;
    await deleteMessage(me as any, message);
  }

  // ---- render ----

  const bubbleWidth = isDesktop ? 460 : 190;
  const conversationGroup = (conversation as any)?.$jazz?.owner;
  const messages = Array.from((conversation as any).messages ?? []);

  // ---- Build raw timeline (messages + system events, sorted by time) ----
  type RawItem =
    | { kind: "message"; data: any; sortAt: number; key: string }
    | { kind: "event"; data: any; sortAt: number; key: string };

  const rawItems: RawItem[] = [];
  for (const m of messages as any[]) {
    const sentAt = (m as any)?.sentAt;
    const ts =
      sentAt instanceof Date
        ? sentAt.getTime()
        : new Date(sentAt ?? 0).getTime();
    rawItems.push({
      kind: "message",
      data: m,
      sortAt: ts,
      key: `m-${(m as any)?.$jazz?.id ?? rawItems.length}`,
    });
  }
  const eventsList = Array.from(
    ((conversation as any)?.systemEvents ?? []) as any[],
  );
  for (const e of eventsList) {
    const occurredAt = (e as any)?.occurredAt;
    const ts =
      occurredAt instanceof Date
        ? occurredAt.getTime()
        : new Date(occurredAt ?? 0).getTime();
    rawItems.push({
      kind: "event",
      data: e,
      sortAt: ts,
      key: `e-${(e as any)?.$jazz?.id ?? rawItems.length}`,
    });
  }
  rawItems.sort((a, b) => a.sortAt - b.sortAt);

  // ---- New-mark divider position ----
  const dividerInput: DividerTimelineItem[] = rawItems.map((item) => {
    if (item.kind === "message") {
      return {
        kind: "message" as const,
        sortAt: item.sortAt,
        authorAccountID: getAuthorAccountIDFromMessage(item.data),
      };
    }
    return { kind: "event" as const, sortAt: item.sortAt };
  });
  const dividerBeforeIndex = findNewMarkIndex(
    dividerInput,
    anchorRef.current,
    myAccountID,
  );

  // ---- Day marker helpers ----
  const nowTs = Date.now();
  const todayStr = localDateStr(nowTs);
  const yesterdayStr = localDateStr(nowTs - 86_400_000);

  // ---- Map raw items → ChatTimelineItem[] ----
  const timelineItems: ChatTimelineItem[] = [];
  let lastDateStr: string | null = null;

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];

    // Day marker first: when the divider and a date boundary coincide, the
    // day label must precede the new-mark ("today → new → msg", not
    // "new → today → msg").
    const itemDateStr = localDateStr(item.sortAt);
    if (itemDateStr !== lastDateStr) {
      lastDateStr = itemDateStr;
      timelineItems.push({
        kind: "day",
        label: dayLabel(itemDateStr, todayStr, yesterdayStr),
        key: `day-${itemDateStr}`,
      });
    }

    // Insert new-mark divider before the target item
    if (i === dividerBeforeIndex) {
      timelineItems.push({ kind: "new", key: "new-mark" });
    }

    if (item.kind === "event") {
      const event = item.data;
      const actorName = resolveDisplayName({
        accountID: event.actorAccountID,
        me,
        group: conversationGroup,
      });
      const targetName = event.targetAccountID
        ? resolveDisplayName({
            accountID: event.targetAccountID,
            me,
            group: conversationGroup,
          })
        : undefined;
      const text = formatSystemEventMessage({
        kind: event.kind,
        actorName,
        targetName,
        newTitle: event.newTitle,
      });
      timelineItems.push({
        kind: "sys",
        text,
        key: item.key,
        testId: `system-event-${event.kind}`,
      });
    } else {
      // message
      const message = item.data;
      const msgId: string = (message as any)?.$jazz?.id ?? item.key;
      const authorAccountID = getAuthorAccountIDFromMessage(message);
      const isMine = authorAccountID === myAccountID;
      const malformed = !authorAccountID;
      const isDeleted = Boolean(message?.deleted);

      const authorDisplayName = authorAccountID
        ? resolveDisplayName({
            accountID: authorAccountID,
            me,
            group: conversationGroup,
          })
        : "Unknown";

      // Time format (same as message-bubble.tsx)
      const formattedTime = message?.sentAt
        ? new Date(message.sentAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";

      // Attachments slot — Rung 4
      const hasAttachments =
        !isDeleted &&
        !malformed &&
        Array.from((message as any).attachments ?? []).length > 0;
      const attSlot = hasAttachments ? (
        <MessageAttachments message={message} isMine={isMine} me={me} />
      ) : undefined;

      // Inline edit bodyOverride — Rung 4
      const isEditing = editingMessageId === msgId;
      const bodyOverride = isEditing ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center rounded-pill border border-hairline bg-bg px-3 h-[38px] w-[220px]">
            <input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSaveEdit(message);
                if (e.key === "Escape") setEditingMessageId(null);
              }}
              className="flex-1 border-none outline-none bg-transparent font-body text-ui-row leading-none text-text"
              data-testid="message-edit-input"
              autoFocus
            />
          </div>
          <div className="flex gap-1 justify-end">
            <button
              type="button"
              onClick={() => setEditingMessageId(null)}
              className="px-2 py-0.5 font-body text-ui-sub text-text-2"
            >
              cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSaveEdit(message)}
              data-testid="message-edit-save"
              className="px-2 py-0.5 font-body text-ui-sub text-arcan-accent"
            >
              save
            </button>
          </div>
        </div>
      ) : undefined;

      // Edit/delete menu slot — Rung 4
      const isMenuOpen = menuOpenId === msgId;
      const menuSlot =
        isMine && !isDeleted && !malformed && !isEditing ? (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => setMenuOpenId(isMenuOpen ? null : msgId)}
              className="text-dim font-body text-ui-sub mt-0.5"
              data-testid="message-menu-btn"
              aria-label="Message actions"
            >
              ⋮
            </button>
            {isMenuOpen && (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpenId(null);
                    setEditingMessageId(msgId);
                    setEditText(message?.body ?? "");
                  }}
                  data-testid="message-edit-btn"
                  className="px-2 py-0.5 font-body text-ui-sub text-text-2 rounded border border-hairline"
                >
                  edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpenId(null);
                    void handleDeleteMessage(message);
                  }}
                  data-testid="message-delete-btn"
                  className="px-2 py-0.5 font-body text-ui-sub text-text-2 rounded border border-hairline"
                >
                  delete
                </button>
              </div>
            )}
          </div>
        ) : undefined;

      // Author name: only for group chats (no contact = group), and only for
      // others' messages (mine omit the name, proto Row ~L65–66).
      const isGroupChat = !contact;
      const authorName =
        !isMine && isGroupChat ? authorDisplayName : undefined;
      const authorInitials = authorDisplayName.slice(0, 2).toUpperCase();

      timelineItems.push({
        kind: "msg",
        key: item.key,
        mine: isMine,
        text: message?.body ?? "",
        time: formattedTime,
        authorName,
        authorInitials,
        att: hasAttachments,
        attSlot,
        edited: !isDeleted && Boolean(message?.edited),
        deleted: isDeleted,
        malformed,
        menuSlot,
        bodyOverride,
      });
    }
  }

  // ---- Build header view model ----

  // Member count for groups (reuses the same getDirectMembers() introspection)
  let memberCount: number | null = null;
  if (!contact) {
    const grp = (conversation as any).$jazz?.owner;
    if (grp) {
      try {
        memberCount = grp
          .getDirectMembers()
          .filter((m: any) => m.role === "admin" || m.role === "writer").length;
      } catch {
        // Group introspection unavailable
      }
    }
  }

  // USER DECISION (2026-07-05 walkthrough): no "@" prefix on 1:1 titles —
  // the prototype's `'@' + name` (proto:175) is rejected; plain name for
  // both 1:1 and group.
  const headerTitle = conversationTitle;
  const headerSub =
    !contact && memberCount !== null ? `${memberCount} members` : undefined;

  const headerVM: ChatHeaderVM = {
    title: headerTitle,
    sub: headerSub,
    initials: initialsFromTitle(conversationTitle),
    avatarSrc: headerAvatarUrl ?? undefined,
    group: !contact,
  };

  // ---- Composer element (container-rendered; pure ChatComposer is visual-only) ----

  // proto:194 — first word of the name, original casing ("message ada").
  const composerPlaceholder = contact
    ? `message ${conversationTitle.split(" ")[0]}`
    : "message group";

  const composerElement = (
    <div data-testid="composer">
      {/* Hidden file input — stays container-side; testid preserved for e2e */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
        data-testid="composer-file-input"
      />
      <ChatComposer
        value={composerText}
        onChange={setComposerText}
        onSend={handleComposerSend}
        placeholder={composerPlaceholder}
        disabled={composerDisabled || isSending}
        hasAttachments={pending.length > 0}
        onAttach={handlePickClick}
        onPaste={handleComposerPaste}
        attachSlot={
          pending.length > 0 ? (
            <ComposerAttachmentTray
              pending={pending}
              onRemove={handleRemovePending}
            />
          ) : undefined
        }
        errorSlot={
          composerError ? (
            <div
              className="px-3 py-2 text-xs text-red"
              data-testid="composer-error"
            >
              {composerError}
            </div>
          ) : undefined
        }
      />
    </div>
  );

  return (
    <main
      // min-h-0 is load-bearing: without it this flex item's min-height:auto
      // grows to content height on long conversations — the timeline never
      // scrolls and the composer is pushed below the clipped fold
      // (walkthrough bug 2026-07-05).
      className="flex-1 min-h-0 flex flex-col min-w-0"
      data-testid="conversation-detail"
      // Drag-drop upload (walkthrough feedback 2026-07-05): dropping files
      // anywhere on the chat pane ingests them through the same path as the
      // attach button — the natural desktop gesture the picker doesn't cover.
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          e.preventDefault();
          ingestFiles(files);
        }
      }}
    >
      <ChatScreen
        header={headerVM}
        items={timelineItems}
        bubbleWidth={bubbleWidth}
        onBack={isDesktop ? undefined : () => navigate("/conversations")}
        onOpenInfo={() =>
          navigate(`/conversations/${convId ?? id}/members`)
        }
        composer={composerElement}
        banner={<ConnectionBanner />}
        emptyText="No messages yet. Say hello!"
        bottomRef={bottomRef}
        headerLinkTestId="conversation-header-link"
        backBtnTestId="chat-back-arrow"
        titleTestId="conversation-title"
        avatarTestId="conversation-header-avatar"
      />
    </main>
  );
}
