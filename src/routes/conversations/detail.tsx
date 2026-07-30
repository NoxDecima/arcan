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
 *   - SyncStatusPill: floating "not syncing" pill when offline (feedback R4)
 *   - Message timeline: each message as a kit Bubble, interleaved with
 *     SystemEvent entries from the conversation's sidecar log, plus day
 *     markers and the unread divider.
 *   - Composer: ChatComposer with file-upload state (disabled when
 *     composerDisabled — only me remains in an active 1:1)
 *
 * Title derivation (1:1): looks up me.root.contacts (keyed by account ID) for
 * the other member of the conversation's owning Group.
 * Falls back to conversation.title (groups) or "Conversation" while loading.
 *
 * Author derivation: getAuthorAccountIDFromMessage() reads the create-tx signer
 * (immutable, unforgeable). Display name resolved from the contacts record.
 *
 * composerDisabled: true when the ConversationGroup's direct-admin list is
 * length 1 (only me remains) — the other party has left.
 *
 * If me has been revoked from the ConversationGroup (e.g. kicked), the URL
 * is unreadable — we redirect to /conversations rather than render a stub.
 */

import {
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { getUiZoom } from "@/styles/ui-scale";
import { pickFilesNative } from "@/platform/files";
import { ComposerAttachmentSheet, type AttachSource } from "@/components/composer-attachment-sheet";
import { isTauriAndroid } from "@/platform/is-tauri";
import { useParams, useNavigate } from "react-router-dom";
import { useUpNavigation } from "@/nav/use-up-navigation";
import { useAccount, useCoState } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Conversation } from "@/jazz/schema/Conversation";
import { SyncStatusPill } from "@/components/sync-status-pill";
import {
  sendMessage,
  getAuthorAccountIDFromMessage,
  editMessage,
  deleteMessage,
} from "@/jazz/messages";
import { resolveDisplayName } from "@/jazz/displayName";
import { getContact } from "@/jazz/handshake";
import { isArchived, ensureMyWriteGroup, isLastAdmin, leaveConversation } from "@/jazz/conversation";
import {
  findNewMarkIndex,
  type DividerTimelineItem,
} from "@/routes/conversations/newMarkPosition";
import { ChatHeaderSkeleton, ChatMessagesSkeleton } from "@/components/skeleton";
import { useIsDesktop } from "@/components/use-is-desktop";
import { initialsFromTitle } from "@/components/conversation-avatar";
import { MessageAttachments } from "@/components/message-attachments";
import { MessageMarkdown } from "@/components/message-markdown";
import {
  ComposerAttachmentTray,
  type PendingAttachment,
} from "@/components/composer-attachment-tray";
import {
  uploadAttachment,
  AttachmentTooLargeError,
  MAX_ATTACHMENT_BYTES,
} from "@/jazz/attachments";
import { downscaleToFit } from "@/jazz/image-downscale";
import { formatSystemEventMessage } from "@/components/system-event";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { useAccountAvatars } from "@/components/use-account-avatars";
import {
  ChatScreen,
  ChatComposer,
  type ChatTimelineItem,
  type ChatHeaderVM,
} from "@/ui/screens";
import { Icon, tapClass } from "@/ui/kit";
import { editBoxWidth } from "@/lib/edit-box-width";

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

/**
 * AnchoredMessageMenu — the per-message actions popover (R2+R3 fix).
 *
 * Renders through a portal into document.body with position:fixed, anchored
 * at the interaction point (pointer coords for right-click / long-press, the
 * ⋮ button rect for kebab clicks). The portal frees it from the timeline's
 * overflow clipping and from transient stacking contexts (the arcan-rise
 * entrance transform on fresh rows), and viewport clamping + flip-above
 * keeps the last message's menu fully visible without extra scrolling.
 *
 * Dismissal (replaces the round-4 focusout close, which never fired when
 * tapping the non-focusable timeline background):
 *   - pointerdown outside the popover (capture phase; the ⋮ triggers are
 *     exempt so their own click handlers can toggle / move the menu),
 *   - Escape,
 *   - any scroll outside the popover (capture catches the timeline),
 *   - selecting an item (the item handlers close it — unchanged).
 *
 * Accessibility (follow-up #27):
 *   - role="menu" on the container; role="menuitem" on items (added at the
 *     call-site in JSX, not via cloneElement — keeps the API explicit).
 *   - ArrowDown/ArrowUp/Home/End cycle focus among [role=menuitem] buttons.
 *   - Tab closes the menu (standard ARIA menu behavior) and skips the
 *     trigger-focus restore so focus advances naturally past the trigger.
 *   - Escape restores focus to the trigger (keyboard-initiated close).
 *   - Pointer-initiated closes (pointerdown outside, scroll, resize) do NOT
 *     restore focus to the trigger — the user tapped elsewhere and restoring
 *     would steal focus from whatever they tapped.
 */
function AnchoredMessageMenu({
  anchor,
  triggerEl,
  onClose,
  children,
}: {
  /** Anchor in viewport coordinates: x is the horizontal reference; top /
   * bottom the vertical extent of the anchored thing. Pointer opens pass a
   * zero-height extent (top === bottom === clientY); the ⋮ trigger passes
   * its rect edges so a flipped menu clears the button instead of covering
   * it (covering would swallow the toggle-close click). */
  anchor: { x: number; top: number; bottom: number };
  /** The ⋮ trigger element — focus is restored to it on keyboard-initiated
   * closes (Escape, item via keyboard). Pointer closes skip restore. */
  triggerEl: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Helpers — collect focusable menu items, get the currently-focused index.
  const getItems = () =>
    Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );

  // Restore focus to the trigger; used only for keyboard-initiated closes.
  const restoreToTrigger = useCallback(() => {
    triggerEl?.focus({ preventScroll: true });
  }, [triggerEl]);

  // Measure after first paintless render, then clamp into the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8; // breathing room from viewport edges
    const gap = 4; // offset from the press point / trigger
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.x;
    if (left + width + margin > vw) left = anchor.x - width;
    left = Math.max(margin, Math.min(left, vw - width - margin));
    let top = anchor.bottom + gap;
    if (top + height + margin > vh) top = anchor.top - height - gap; // flip above
    top = Math.max(margin, Math.min(top, vh - height - margin));
    setPos({ left, top });
  }, [anchor.x, anchor.top, anchor.bottom]);

  // Focus the first item on open (keyboard reachability — the portal lives at
  // the end of <body>, so natural Tab order from the ⋮ button won't reach it).
  // The timeout defers past the triggering keyup event (Enter on the ⋮ button)
  // so the browser doesn't re-focus the trigger after we move focus here.
  useEffect(() => {
    const id = setTimeout(() => {
      ref.current
        ?.querySelector<HTMLElement>('[role="menuitem"]')
        ?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (ref.current && t && ref.current.contains(t)) return;
      // A ⋮ trigger toggles/moves the menu via its own click handler; closing
      // here as well would make that click re-open instead of toggle.
      // behavioral marker, not a test hook.
      if (
        t instanceof Element &&
        t.closest('[data-message-menu-trigger]')
      ) {
        return;
      }
      // Pointer-initiated close — no focus restore (user tapped elsewhere).
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const items = getItems();
      const focused = document.activeElement;
      const idx = items.indexOf(focused as HTMLElement);

      if (e.key === "Escape") {
        e.preventDefault();
        // Keyboard close — restore focus to the trigger.
        onClose();
        restoreToTrigger();
        return;
      }

      if (e.key === "Tab") {
        // Standard ARIA menu: Tab closes the menu and lets focus move naturally
        // past the trigger. Do NOT restore focus here — let the browser handle
        // the Tab naturally after we call onClose (the trigger is restored only
        // for keyboard-Escape, not Tab).
        onClose();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = items[(idx + 1) % items.length];
        next?.focus({ preventScroll: true });
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = items[(idx - 1 + items.length) % items.length];
        prev?.focus({ preventScroll: true });
        return;
      }

      if (e.key === "Home") {
        e.preventDefault();
        items[0]?.focus({ preventScroll: true });
        return;
      }

      if (e.key === "End") {
        e.preventDefault();
        items[items.length - 1]?.focus({ preventScroll: true });
        return;
      }
    };
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (ref.current && t && ref.current.contains(t)) return;
      // Pointer-initiated close — no focus restore.
      onClose();
    };
    const onResize = () => {
      // Pointer-initiated close — no focus restore.
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [onClose, restoreToTrigger]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      data-testid="message-menu"
      // position/coords are geometry, not paint — inline style is sanctioned.
      // Coordinates are computed in (unzoomed) viewport px from rects, but
      // fixed left/top inside the zoomed <html> are multiplied by the UI-scale
      // zoom at render — divide before applying (Task-1 probe, 2026-07-23).
      style={
        pos
          ? { position: "fixed", left: pos.left / getUiZoom(), top: pos.top / getUiZoom() }
          : {
              // Pre-measure render: park at the anchor, invisible, so the
              // first paint never flashes an unclamped menu.
              position: "fixed",
              left: anchor.x / getUiZoom(),
              top: anchor.bottom / getUiZoom(),
              visibility: "hidden",
            }
      }
      className="z-50 min-w-[120px] flex flex-col rounded-r-4 border border-hairline bg-panel shadow-bubble overflow-hidden"
    >
      {children}
    </div>,
    document.body,
  );
}

// ---- component ----

export function ConversationDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const goUp = useUpNavigation();
  const isDesktop = useIsDesktop();

  // Autoscroll anchor + the scrollable timeline element
  const bottomRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // UI motion (2026-07-18, AUDIT-011): only messages appended AFTER this
  // conversation's first loaded render animate in. `primed` flips once the
  // messages list has rendered loaded; keys seen while unprimed enter
  // silently. `enter` is remembered so re-renders during the 200ms play
  // don't strip the class mid-animation. `mountTs` is a belt against
  // late-syncing history: anything older than mount never rises. `sortAt` is
  // sender-authored (`sentAt`), so the 2s belt tolerates modest clock skew
  // between devices; the seen/primed gate is the primary guard.
  const motionRef = useRef<{
    convoId: string | null;
    seen: Set<string>;
    enter: Set<string>;
    primed: boolean;
  }>({ convoId: null, seen: new Set(), enter: new Set(), primed: false });
  const mountTsRef = useRef(Date.now());

  // Composer state (moved from Composer component to this container)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [composerText, setComposerText] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);

  // Edit/delete per-message state (moved from MessageBubble to this container)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  // Per-message actions menu: which message it's open for + the anchor it's
  // attached to (viewport coords; see AnchoredMessageMenu). R2+R3: pointer-
  // anchored portal. `triggerEl` is the ⋮ button that opened the menu — used
  // to restore focus on keyboard-initiated closes (Escape / item via keyboard).
  const [menuState, setMenuState] = useState<{
    id: string;
    x: number;
    top: number;
    bottom: number;
    triggerEl: HTMLElement | null;
  } | null>(null);
  const closeMenu = useCallback(() => setMenuState(null), []);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  const toast = useToast();
  const confirmDialog = useConfirm();

  const me = useAccount(ArcanAccount, {
    resolve: {
      profile: true,
      // Slice 8: lastReadAt is required to write the read-cutoff.
      root: {
        contacts: { $each: { $onError: "catch" } },
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

  // ---------------------------------------------------------------------------
  // Detail avatar resolution — 1:1 counterpart + incoming message authors.
  // Both derivations are guarded (me.$isLoaded && conversation) so they
  // return empty/null while loading; useAccountAvatars is a no-op until ready.
  // ---------------------------------------------------------------------------

  // Counterpart account ID: only set for exactly-2-member (1:1) conversations.
  const counterpartAccountID: string | null =
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
          const other = participants.find(
            (m: any) => m.account?.$jazz?.id !== myID,
          );
          return (other?.account?.$jazz?.id as string | null) ?? null;
        })()
      : null;

  // Incoming author IDs: distinct non-self signers across the current message list.
  const incomingAuthorIds: string[] = (() => {
    if (!me.$isLoaded || !conversation) return [];
    const myID = (me as any).$jazz?.id as string | undefined;
    const ids = new Set<string>();
    for (const m of Array.from((conversation as any).messages ?? []) as any[]) {
      const authorID = getAuthorAccountIDFromMessage(m);
      if (authorID && authorID !== myID) ids.add(authorID);
    }
    return [...ids];
  })();

  // Merge IDs: counterpart (for header) + authors (for message rows).
  const detailAvatarIds: string[] = [
    ...(counterpartAccountID ? [counterpartAccountID] : []),
    ...incomingAuthorIds,
  ];
  const detailAvatarMap = useAccountAvatars(me, detailAvatarIds);

  // Divider anchor state — declared before the positioning effect that
  // gates on it; captured by the effect further down.
  const [anchorReadyFor, setAnchorReadyFor] = useState<string | null>(null);
  const lastReadLoaded = Boolean((me as any)?.root?.lastReadAt);

  // Timeline positioning (walkthrough 2026-07-05):
  //  - on OPENING a conversation: jump instantly to the new-messages divider
  //    (top of viewport) if present, else to the very bottom — smooth
  //    scrolling on mount was interruptible by late layout and could strand
  //    the view at the top;
  //  - on NEW messages while open: smooth-scroll to bottom as before.
  const messageCount = (conversation as any)?.messages?.length ?? 0;
  const positionedForRef = useRef<string | null>(null);
  // Scroll-state foundation (feedback round 5). userScrolledRef latches true on
  // the first user-initiated scroll of this conversation visit — after that we
  // stop auto-re-anchoring and defer to the user. programmaticScrollRef marks
  // scrolls WE trigger so the scroll listener doesn't mistake them for user
  // intent. isNearBottom drives auto-scroll-on-new + the jump button (Task 7).
  const userScrolledRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  useEffect(() => {
    const convKey = (conversation as any)?.$jazz?.id as string | undefined;
    if (!convKey || messageCount === 0) return;
    // Wait for the divider anchor: positioning before capture would land at
    // the bottom and then have the divider pop in above the fold.
    if (anchorReadyFor !== convKey) return;
    if (positionedForRef.current === convKey) {
      if (isNearBottom) {
        programmaticScrollRef.current = true;
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
      }
      return;
    }
    positionedForRef.current = convKey;
    userScrolledRef.current = false;
    setIsNearBottom(true);
    // Direct scrollTop on the timeline element — scrollIntoView could pick
    // the wrong scroll ancestor / fire pre-layout and leave the view at the
    // top (walkthrough round 4). Divider goes to the viewport top (short
    // unread tails clamp so the bottom stays visible); no divider → bottom.
    const position = () => {
      const el = timelineRef.current;
      if (!el) return;
      programmaticScrollRef.current = true;
      const divider = el.querySelector(
        '[data-testid="new-messages-divider"]',
      ) as HTMLElement | null;
      if (divider) {
        const target =
          (divider.getBoundingClientRect().top -
            el.getBoundingClientRect().top) /
            getUiZoom() +
          el.scrollTop -
          8; // breathing room above the divider
        el.scrollTop = Math.max(0, target);
      } else {
        el.scrollTop = el.scrollHeight;
      }
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    };
    // position after this commit's layout, then re-assert on the next frame
    // (late layout: fonts/avatars can shift heights under the first pass)
    const t = setTimeout(() => {
      position();
      requestAnimationFrame(position);
    }, 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageCount, (conversation as any)?.$jazz?.id, anchorReadyFor, isNearBottom]);

  // Re-anchor on late content growth (images/fonts/avatars) until the user
  // takes over, and keep isNearBottom current (feedback round 5).
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const NEAR_PX = 120;

    const computeNearBottom = () =>
      el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_PX;

    const onScroll = () => {
      if (!programmaticScrollRef.current) userScrolledRef.current = true;
      const near = computeNearBottom();
      setIsNearBottom(near);
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    const ro = new ResizeObserver(() => {
      if (userScrolledRef.current) return;
      programmaticScrollRef.current = true;
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
      setIsNearBottom(true);
    });
    for (const child of Array.from(el.children)) ro.observe(child);
    const mo = new MutationObserver(() => {
      for (const child of Array.from(el.children)) ro.observe(child);
    });
    mo.observe(el, { childList: true });

    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      mo.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(conversation as any)?.$jazz?.id]);

  // Jump-to-latest (feedback round 5): user tapped the floating button →
  // smooth-scroll to the bottom, clear the "scrolled away" latch.
  const handleJumpToLatest = () => {
    const el = timelineRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
    userScrolledRef.current = false;
    setIsNearBottom(true);
  };

  // Unit 4 Phase 3: mark-on-send + mark-on-leave semantics.
  // anchorRef captures lastReadAt at mount for the "new messages" divider.
  // latestRenderedSentAtRef tracks the newest message currently rendered so
  // mark-on-leave can advance the cutoff.
  const anchorRef = useRef<number | null>(null);
  const latestRenderedSentAtRef = useRef<number>(0);

  // Capture the divider anchor ONCE per conversation — but only after BOTH
  // the conversation AND me.root.lastReadAt have loaded. The old effect keyed
  // only on the conversation id: when lastReadAt loaded a beat later (hard
  // refresh straight into a conversation), the anchor froze at 0 and the
  // divider planted itself at the first incoming message ever — and the
  // open-positioning then stopped at that phantom divider (walkthrough
  // 2026-07-05 round 3). anchorReadyFor is state (not a ref) so the divider
  // computation re-renders when capture completes.
  useEffect(() => {
    const lastReadMap = (me as any)?.root?.lastReadAt;
    const convId = (conversation as any)?.$jazz?.id as string | undefined;
    if (!convId || !lastReadMap) return;
    if (anchorReadyFor === convId) return; // frozen for this conversation
    const prev = lastReadMap[convId];
    anchorRef.current = typeof prev === "number" ? prev : 0;
    setAnchorReadyFor(convId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(conversation as any)?.$jazz?.id, lastReadLoaded]);

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

  // (Divider positioning is handled by the unified effect above.)

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
          if (!otherID) return null;
          return getContact(me, otherID) ?? null;
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
    // Sending your own message dismisses the new-messages divider (the
    // frozen mount anchor would otherwise keep it pinned all session).
    anchorRef.current = Date.now();
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
    if (rejections.length > 0) {
      // Inline error line keeps its testid (e2e); the toast makes the
      // rejection impossible to miss (walkthrough 2026-07-05: silent-looking
      // failures on desktop).
      showComposerError(rejections.join(" "));
      toast({ tone: "error", icon: "alert", text: rejections.join(" ") });
    }
  }

  async function handlePickClick() {
    try {
      const native = await pickFilesNative({ multiple: true, maxBytes: MAX_ATTACHMENT_BYTES });
      if (native !== null) {
        if (native.length > 0) ingestFiles(native);
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "pick failed — try again.";
      showComposerError(msg);
      toast({ tone: "error", icon: "alert", text: msg });
      return;
    }
    fileInputRef.current?.click();
  }

  function handleAttachClick() {
    if (isTauriAndroid()) {
      setAttachSheetOpen(true);
      return;
    }
    void handlePickClick();
  }

  async function handlePickSource(source: AttachSource) {
    setAttachSheetOpen(false);
    // Camera: the wry WebView fires ACTION_IMAGE_CAPTURE from a native
    // <input capture> click (NOT via pickFilesNative, which the Android path
    // otherwise uses); the photo arrives on that input's onChange
    // (handleCameraCapture). See the camera-capture spec (2026-07-30).
    if (source === "camera") {
      cameraInputRef.current?.click();
      return;
    }
    try {
      const native = await pickFilesNative({
        imagesOnly: source === "photos",
        multiple: true,
        maxBytes: MAX_ATTACHMENT_BYTES,
      });
      if (native !== null && native.length > 0) ingestFiles(native);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "pick failed — try again.";
      showComposerError(msg);
      toast({ tone: "error", icon: "alert", text: msg });
    }
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) ingestFiles(e.target.files);
    e.target.value = ""; // reset so re-picking the same file fires onChange
  }

  // Camera capture (2026-07-30): downscale large photos to fit the 5 MB cap
  // BEFORE ingest — a raw camera shot often exceeds it and the user can't pick
  // a smaller one. Falls back to the original on any decode failure (ingest's
  // size check then rejects with the normal toast).
  async function handleCameraCapture(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    e.target.value = "";
    if (!files || files.length === 0) return;
    const out: File[] = [];
    for (const f of Array.from(files)) {
      try {
        out.push(await downscaleToFit(f, MAX_ATTACHMENT_BYTES));
      } catch {
        out.push(f);
      }
    }
    ingestFiles(out);
  }

  function handleRemovePending(tempId: string) {
    setPending((prev) => prev.filter((p) => p.tempId !== tempId));
  }

  function handleComposerPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
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
    // Feedback round 2: no whitespace stripping on send — only reject
    // messages that are whitespace-only (and have no attachments).
    const body = composerText;
    if (!body.trim() && pending.length === 0) return;

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
      await handleSend(body, uploaded);
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
    // Feedback round 2: no whitespace stripping — text is stored verbatim.
    // An unchanged edit discards silently instead of stamping edited/editedAt.
    const next = editText;
    if (!next.trim()) return;
    if (next === message.body) {
      setEditingMessageId(null);
      return;
    }
    await editMessage(me as any, message, next);
    setEditingMessageId(null);
  }

  async function handleDeleteMessage(message: any) {
    const ok = await confirmDialog({
      title: "delete message",
      body: "this message is deleted for everyone in this chat.",
      confirmLabel: "delete",
      testId: "confirm-delete-message",
    });
    if (!ok) return;
    await deleteMessage(me as any, message);
  }

  async function handleHeaderDelete() {
    setHeaderMenuOpen(false);
    if (!conversation) return;
    const is1to1 = Boolean(counterpartAccountID);
    if (!is1to1 && isLastAdmin(me as any, conversation)) {
      const others = ((conversation as any).$jazz?.owner as any)
        ?.getDirectMembers?.()
        .filter(
          (m: any) =>
            m.account?.$jazz?.id !== (me as any).$jazz?.id &&
            (m.role === "admin" || m.role === "writer"),
        );
      if (others && others.length > 0) {
        // Promote flow lives on the members screen.
        navigate(`/conversations/${convId ?? id}/members`);
        return;
      }
    }
    const ok = await confirmDialog(
      is1to1
        ? {
            title: "delete conversation",
            body: "your copy is deleted for good — you lose this history. they will see that you left. messaging them again starts fresh.",
            confirmLabel: "delete conversation",
            testId: "confirm-delete-conversation",
          }
        : {
            title: "leave conversation",
            body: "you lose access to its messages. others keep their copies and will see that you left.",
            confirmLabel: "leave",
            testId: "confirm-leave-conversation",
          },
    );
    if (!ok) return;
    await leaveConversation(me as any, conversation);
    navigate("/conversations");
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

  // ---- Rise-in bookkeeping (render path, after early returns) ----
  const convoIdForMotion = ((conversation as any)?.$jazz?.id as string) ?? null;
  if (motionRef.current.convoId !== convoIdForMotion) {
    motionRef.current = {
      convoId: convoIdForMotion,
      seen: new Set(),
      enter: new Set(),
      primed: false,
    };
    mountTsRef.current = Date.now();
  }
  const motion = motionRef.current;
  for (const it of rawItems) {
    if (it.kind !== "message") continue;
    if (
      motion.primed &&
      !motion.seen.has(it.key) &&
      it.sortAt >= mountTsRef.current - 2000
    ) {
      motion.enter.add(it.key);
    }
    motion.seen.add(it.key);
  }
  // Prime only once the messages CoList itself has resolved — priming on a
  // still-loading empty list would make the whole history "new".
  if ((conversation as any)?.messages) {
    motion.primed = true;
  }

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
  // No divider until the anchor is captured for THIS conversation — a
  // null/0 anchor would mark all history as unread (phantom divider).
  const dividerBeforeIndex =
    anchorReadyFor === ((conversation as any)?.$jazz?.id as string)
      ? findNewMarkIndex(dividerInput, anchorRef.current, myAccountID)
      : -1;

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
        <MessageAttachments
          message={message}
          isMine={isMine}
          me={me}
          // Bubble att content width: bubbleWidth − 2·6px padding (kit
          // bubble.tsx uses maxWidth w−12 for the attachment wrapper).
          gridWidth={bubbleWidth - 12}
        />
      ) : undefined;

      // Inline edit bodyOverride — Rung 4
      const isEditing = editingMessageId === msgId;

      // Rich markdown body for normal (not deleted/malformed/editing, non-empty)
      // messages. When editing, bodyOverride takes priority in the bubble so the
      // raw markdown is still shown; deleted/malformed leave richBody undefined so
      // the existing shells render. `text` below stays set as the accessible
      // fallback + edit/parity path.
      const bodyText = message?.body ?? "";
      const richBody =
        !isDeleted && !malformed && !isEditing && bodyText ? (
          <MessageMarkdown source={bodyText} mine={isMine} />
        ) : undefined;
      const bodyOverride = isEditing ? (
        <div className="flex flex-col gap-1">
          <div
            className="rounded-r-4 border border-hairline bg-bg px-3 py-2"
            style={{ width: editBoxWidth(bubbleWidth) }}
          >
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onInput={(e) => {
                const ta = e.currentTarget;
                ta.style.height = "auto";
                ta.style.height = `${ta.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSaveEdit(message);
                } else if (e.key === "Escape") {
                  setEditingMessageId(null);
                }
              }}
              rows={1}
              className="block w-full resize-none border-none outline-none bg-transparent font-body text-ui-row leading-normal text-text max-h-[8.5rem] overflow-y-auto"
              data-testid="message-edit-input"
              ref={(ta) => {
                if (ta) {
                  ta.style.height = "auto";
                  ta.style.height = `${ta.scrollHeight}px`;
                  ta.focus();
                  const len = ta.value.length;
                  ta.setSelectionRange(len, len);
                }
              }}
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

      // Edit/delete menu slot — Rung 4. The popover itself renders through
      // AnchoredMessageMenu (portal to <body>, fixed at the interaction
      // point) — see the component doc above for the R2+R3 rationale.
      const isMenuOpen = menuState?.id === msgId;
      const menuSlot =
        isMine && !isDeleted && !malformed && !isEditing ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                if (isMenuOpen) {
                  closeMenu();
                } else {
                  // ⋮ opens anchored to the button rect (below it, flipping
                  // fully above it near the viewport bottom); right-click /
                  // long-press anchor at the press point via onContext.
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenuState({
                    id: msgId,
                    x: r.left,
                    top: r.top,
                    bottom: r.bottom,
                    triggerEl: e.currentTarget,
                  });
                }
              }}
              className={[
                "text-dim font-body text-ui-sub mt-0.5",
                "transition-tint duration-fast ease-out hover:text-text-2",
                // Hover-capable pointers: hidden until the row is hovered,
                // the menu is open, or the button is focused. Touch
                // (hover:none) keeps it always visible — long-press users
                // must still see the affordance (feedback round 4).
                // `focus:opacity-100` (NOT focus-visible:) is intentional: it
                // reveals the button on any focus event — keyboard Tab included
                // — so screen-reader / keyboard users never encounter a visually
                // invisible interactive element. focus-visible: would hide it
                // again on pointer-focus, breaking that guarantee.
                isMenuOpen
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100",
              ].join(" ")}
              data-testid="message-menu-btn"
              data-message-menu-trigger
              aria-label="Message actions"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
            >
              ⋮
            </button>
            {isMenuOpen && menuState && (
              <AnchoredMessageMenu
                anchor={{
                  x: menuState.x,
                  top: menuState.top,
                  bottom: menuState.bottom,
                }}
                triggerEl={menuState.triggerEl}
                onClose={closeMenu}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    setEditingMessageId(msgId);
                    setEditText(message?.body ?? "");
                  }}
                  data-testid="message-edit-btn"
                  className={`${tapClass} w-full px-3 py-2.5 text-left font-body text-ui-sub text-text hover:bg-panel-2 active:bg-hairline`}
                >
                  edit
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    void handleDeleteMessage(message);
                  }}
                  data-testid="message-delete-btn"
                  className={`${tapClass} w-full px-3 py-2.5 text-left font-body text-ui-sub text-red border-t border-hairline hover:bg-red/10 active:bg-red-wash`}
                >
                  delete
                </button>
              </AnchoredMessageMenu>
            )}
          </>
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
        text: bodyText, // keep — accessible fallback + edit/parity paths
        richBody,
        time: formattedTime,
        authorName,
        authorInitials,
        // Live avatar URL for incoming messages — resolved via detailAvatarMap.
        authorAvatarSrc:
          !isMine && authorAccountID
            ? (detailAvatarMap.get(authorAccountID) ?? undefined)
            : undefined,
        // Avatar tap → author profile (user decision, 2026-07-08 walkthrough).
        onAvatar:
          !isMine && authorAccountID
            ? () => navigate(`/profile/${authorAccountID}`)
            : undefined,
        att: hasAttachments,
        attSlot,
        edited: !isDeleted && Boolean(message?.edited),
        deleted: isDeleted,
        malformed,
        menuSlot,
        onContext:
          isMine && !isDeleted && !malformed && !isEditing
            ? (at: { x: number; y: number }) =>
                setMenuState({ id: msgId, x: at.x, top: at.y, bottom: at.y, triggerEl: null })
            : undefined,
        bodyOverride,
        entering: motion.enter.has(item.key),
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

  // For 1:1s: conversation icon wins; falls back to counterpart's live avatar.
  // Groups keep icon-only (counterpartAccountID is null for groups).
  const headerVM: ChatHeaderVM = {
    title: headerTitle,
    sub: headerSub,
    initials: initialsFromTitle(conversationTitle),
    avatarSrc:
      headerAvatarUrl ??
      (counterpartAccountID
        ? detailAvatarMap.get(counterpartAccountID)
        : undefined) ??
      undefined,
    group: !contact,
  };

  // ---- Header menu node (feedback round 2: ⋮ overflow menu) ----

  const headerMenu = (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setHeaderMenuOpen((o) => !o)}
        aria-label="conversation actions"
        data-testid="conversation-menu-btn"
        className={`${tapClass} group w-8 h-8 justify-center rounded-r-3 hover:bg-panel-2 active:bg-hairline`}
      >
        <Icon
          d="dots"
          size={18}
          className="text-text-2 group-hover:text-text group-active:text-text transition-colors duration-fast ease-out"
        />
      </button>
      {headerMenuOpen && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setHeaderMenuOpen(false)}
          />
          <div
            data-testid="conversation-menu"
            className="absolute right-0 top-full mt-1 z-40 min-w-[200px] flex flex-col rounded-r-4 border border-hairline bg-panel shadow-bubble overflow-hidden"
          >
            <button
              type="button"
              data-testid="conversation-menu-settings"
              className={`${tapClass} w-full px-3 py-2.5 text-left font-body text-ui-sub text-text hover:bg-panel-2 active:bg-hairline`}
              onClick={() => {
                setHeaderMenuOpen(false);
                navigate(`/conversations/${convId ?? id}/members`);
              }}
            >
              conversation settings
            </button>
            <button
              type="button"
              data-testid="conversation-menu-delete"
              className={`${tapClass} w-full px-3 py-2.5 text-left font-body text-ui-sub text-red border-t border-hairline hover:bg-red/10 active:bg-red-wash`}
              onClick={() => void handleHeaderDelete()}
            >
              {counterpartAccountID ? "delete conversation" : "leave conversation"}
            </button>
          </div>
        </>
      )}
    </div>
  );

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
      {/* Camera capture (2026-07-30): a dedicated input whose `capture` attr
          makes the wry WebView open the system camera (ACTION_IMAGE_CAPTURE);
          the photo arrives on its onChange, downscaled then ingested. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraCapture}
        data-testid="composer-camera-input"
      />
      {composerDisabled && (
        <div
          className="flex items-center justify-between gap-3 px-3 py-2 border-t border-hairline"
          data-testid="composer-disabled-banner"
        >
          <span className="font-body text-ui-sub text-dim">
            you're the only one left in this conversation.
          </span>
          <button
            type="button"
            onClick={() => void handleHeaderDelete()}
            data-testid="last-person-delete-btn"
            className="shrink-0 px-2 py-1 font-body text-ui-sub text-red rounded border border-hairline"
          >
            delete conversation
          </button>
        </div>
      )}
      {counterpartAccountID && !contact && (
        <div
          className="flex items-center justify-between gap-3 px-3 py-2 border-t border-hairline"
          data-testid="not-a-contact-banner"
        >
          <span className="font-body text-ui-sub text-dim">
            not in your contacts.
          </span>
          <button
            type="button"
            onClick={() => navigate(`/profile/${counterpartAccountID}`)}
            data-testid="not-a-contact-add-btn"
            className="shrink-0 px-2 py-1 font-body text-ui-sub text-arcan-accent rounded border border-hairline"
          >
            view profile to add
          </button>
        </div>
      )}
      <ChatComposer
        value={composerText}
        onChange={setComposerText}
        onSend={handleComposerSend}
        placeholder={composerPlaceholder}
        disabled={composerDisabled}
        sending={isSending}
        hasAttachments={pending.length > 0}
        onAttach={handleAttachClick}
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
        onBack={isDesktop ? undefined : () => goUp()}
        onOpenInfo={() =>
          navigate(`/conversations/${convId ?? id}/members`)
        }
        composer={composerElement}
        overlay={<SyncStatusPill />}
        jumpToLatest={{
          visible: !isNearBottom,
          onClick: handleJumpToLatest,
        }}
        emptyText="No messages yet. Say hello!"
        bottomRef={bottomRef}
        timelineRef={timelineRef}
        headerLinkTestId="conversation-header-link"
        backBtnTestId="chat-back-arrow"
        titleTestId="conversation-title"
        avatarTestId="conversation-header-avatar"
        headerRight={headerMenu}
      />
      <ComposerAttachmentSheet
        open={attachSheetOpen}
        onClose={() => setAttachSheetOpen(false)}
        onPick={handlePickSource}
      />
    </main>
  );
}
