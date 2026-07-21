import { useEffect, useState } from "react";
import { useAccount } from "jazz-tools/react";
import { co } from "jazz-tools";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { isArchived, dedupeConversationsByID } from "@/jazz/conversation";
import { resolveDisplayName } from "@/jazz/displayName";
import { getUnreadCount, getLastMessagePreview } from "@/jazz/notifications";
import { resolveAvatarFileBlob } from "@/jazz/avatarResolver";
import { listContacts } from "@/jazz/handshake";
import { useAccountAvatars } from "@/components/use-account-avatars";
import type { ConvoItem, ContactItem, HomeProfile } from "@/ui/screens/home-types";

// ---------------------------------------------------------------------------
// Helpers — moved verbatim from src/components/sidebar.tsx (Task 5, Unit 10
// Wave A). Sidebar.tsx retains its own copies until Phase 4 deletion.
// ---------------------------------------------------------------------------

/**
 * Derive a sidebar label for a conversation: explicit title wins; else
 * synthesize from the non-me direct members. Uses resolveDisplayName so the
 * contact-book / profile resolution chain stays consistent with MessageRow.
 *
 * Moved from sidebar.tsx.
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
 * Returns true when a conversation has more than one other member (i.e. a
 * proper group chat rather than a 1:1). Derived from the same
 * getDirectMembers() path as deriveConversationLabel; returns false on error
 * (e.g. after kick when the group is inaccessible).
 */
function deriveIsGroup(conversation: any, myID: string | undefined): boolean {
  const jazzGroup = conversation?.$jazz?.owner;
  if (!jazzGroup) return false;
  try {
    const members: any[] = jazzGroup.getDirectMembers();
    const others = members.filter(
      (m: any) =>
        (m.role === "admin" || m.role === "writer") &&
        m.account?.$jazz?.id !== myID,
    );
    return others.length > 1;
  } catch {
    return false;
  }
}

/**
 * Format a chat-row timestamp (Unit 9-3, item 3.1-C). Shows HH:MM for the
 * most recent message; returns "" when there is no message to time.
 * Locale-aware via toLocaleTimeString — matches the design's compact time.
 *
 * Moved from sidebar.tsx.
 *
 * Manifest note (data-driven deviation): the proto seed strings use static
 * "9:00 AM" style strings. The app uses locale-formatted HH:MM; that format
 * was already aligned in Unit 9 and is kept here without change.
 */
function formatRowTime(conversation: any): string {
  const msgs = conversation?.messages;
  const last = msgs && msgs.length ? msgs[msgs.length - 1] : null;
  const raw = last?.sentAt;
  if (!raw) return "";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface HomeListsResult {
  loading: boolean;
  /** Jazz account ID of the local user — used by containers for own-profile
   *  navigation (/profile/:accountId). */
  accountId: string | undefined;
  profile: HomeProfile;
  /** Conversations: archived-filtered, sorted by last-message time desc. */
  convos: ConvoItem[];
  /** Contacts from the local contact book. */
  contacts: ContactItem[];
}

/**
 * Container hook: resolves home-screen data from Jazz, including avatar images.
 *
 * Extracts the data layer that was previously embedded inside
 * src/components/sidebar.tsx (Unit 10 Wave A, Task 5). The logic is moved
 * verbatim — same useAccount resolve spec, isArchived filter, sort, helpers.
 * Sidebar.tsx retains its own copies until Phase 4.
 *
 * Avatar resolution:
 *   - Own profile: unconditional useState/useEffect; resolves
 *     me.profile.avatar.data.$jazz.id → objectURL.
 *   - Convos icons: one combined effect builds a convID → objectURL map via
 *     icon.data.$jazz.id → loadAsBlob (snapshot on icon change).
 *   - Contact photos + 1:1 counterpart avatars: a second effect creates one
 *     live ArcanAccount.subscribe() per account ID (imperative, non-hook,
 *     mirroring useRemoteAvatar). Each subscription callback extracts the
 *     avatar stream ID, async-loads blob → objectURL, and updates
 *     remoteAvatarMap. Live: re-fires when the remote profile changes.
 *     Cleanup: unsubscribe all + revoke all URLs.
 *
 * Called unconditionally in AppShell (hook rules); desktop NavColumn consumes
 * it there. Mobile ConversationsRoute calls its own instance for screen
 * presenters. This means two Jazz subscriptions on mobile while at "/", which
 * is accepted per the Wave A architecture.
 */
export function useHomeLists(): HomeListsResult {
  const me = useAccount(ArcanAccount, {
    resolve: {
      profile: true,
      root: {
        contacts: { $each: true },
        // $onError: "catch" ensures the sidebar loads even when some
        // conversations become inaccessible (e.g. after the user is kicked
        // and Jazz revokes their read access to the ConversationGroup).
        // Without this, the whole knownConversations resolve stalls
        // indefinitely and me.$isLoaded stays false.
        // Slice 8: also resolve `messages` so getUnreadCount can iterate
        // them without tripping on a NotLoaded list proxy.
        // `icon: true` loads the conversation's FileBlob so we can read
        // icon.data.$jazz.id for blob-URL resolution below.
        knownConversations: { $each: { messages: true, icon: true, $onError: "catch" } },
        // Slice 8: per-conversation read cutoff for unread-badge computation.
        lastReadAt: true,
      },
    },
  });

  // ---------------------------------------------------------------------------
  // Own profile avatar — unconditional (hooks must precede any early return).
  // ---------------------------------------------------------------------------
  const [ownAvatarUrl, setOwnAvatarUrl] = useState<string | null>(null);

  // Derive stream ID for own profile; null until Jazz is loaded.
  const ownStreamId: string | null = me.$isLoaded
    ? ((me as any).profile?.avatar?.data?.$jazz?.id ?? null)
    : null;

  useEffect(() => {
    if (!ownStreamId) {
      setOwnAvatarUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    void (async () => {
      try {
        const blob = await co.fileStream().loadAsBlob(ownStreamId, { loadAs: me as any });
        if (cancelled || !blob) return;
        createdUrl = URL.createObjectURL(blob);
        setOwnAvatarUrl(createdUrl);
      } catch {
        // Silent — falls back to initials.
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // `me` intentionally omitted: ownStreamId is derived from it; closure
    // captures the correct `me` for the lifetime of this stream ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownStreamId]);

  // ---------------------------------------------------------------------------
  // Convos + contacts avatar map — one effect, id → objectURL.
  // ---------------------------------------------------------------------------
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});

  // Stable dep strings: joined IDs. Effect re-runs when the visible set changes.
  const convosDep = me.$isLoaded
    ? Array.from(me.root?.knownConversations ?? [])
        .filter(Boolean)
        .map((c: any) => (c as any)?.$jazz?.id ?? "")
        .join(",")
    : "";
  const contactsDep = me.$isLoaded
    ? listContacts(me)
        .filter((c: any) => c?.contactAccountID)
        .map((c: any) => c.contactAccountID as string)
        .join(",")
    : "";
  const listsDep = `${convosDep}|${contactsDep}`;

  useEffect(() => {
    if (!me.$isLoaded) return;
    let cancelled = false;
    const createdUrls: string[] = [];

    void (async () => {
      const nextMap: Record<string, string> = {};

      // Conversations with icons: icon is a FileBlob; read stream ID from data.$jazz.id.
      // Pattern mirrors ConversationAvatar.tsx.
      for (const c of Array.from(me.root?.knownConversations ?? []) as any[]) {
        if (!c) continue;
        const convID = (c as any).$jazz?.id as string | undefined;
        if (!convID) continue;
        const streamId: string | null = (c as any).icon?.data?.$jazz?.id ?? null;
        if (!streamId) continue;
        try {
          const blob = await co.fileStream().loadAsBlob(streamId, { loadAs: me });
          if (cancelled || !blob) continue;
          const url = URL.createObjectURL(blob);
          createdUrls.push(url);
          nextMap[convID] = url;
        } catch {
          // No icon available — fall through (monogram shows).
        }
      }

      // Contacts: resolveAvatarFileBlob is a documented no-op for contacts
      // (Contact stores contactAccountID as a plain string; no ref to walk).
      // Live contact photos are now handled by the remoteAvatarMap effect below.
      for (const c of listContacts(me) as any[]) {
        if (!c?.contactAccountID) continue;
        const accountID = c.contactAccountID as string;
        const fileBlob = resolveAvatarFileBlob({ accountID, me });
        if (!fileBlob) continue;
        const streamId: string | null = (fileBlob as any)?.data?.$jazz?.id ?? null;
        if (!streamId) continue;
        try {
          const blob = await co.fileStream().loadAsBlob(streamId, { loadAs: me });
          if (cancelled || !blob) continue;
          const url = URL.createObjectURL(blob);
          createdUrls.push(url);
          nextMap[accountID] = url;
        } catch {
          // No avatar available — fall through (initials show).
        }
      }

      if (!cancelled) setAvatarMap(nextMap);
    })();

    return () => {
      cancelled = true;
      for (const url of createdUrls) URL.revokeObjectURL(url);
    };
    // `me` intentionally omitted: listsDep is derived from it; adding `me`
    // would re-run on every Jazz subscription tick (too frequent for blob
    // loading). Snapshot behavior is correct for conversation icons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listsDep, me.$isLoaded]);

  // ---------------------------------------------------------------------------
  // Remote avatar subscriptions — contacts + 1:1 conversation counterparts.
  // Delegates to useAccountAvatars (extracted from the original per-account
  // ArcanAccount.subscribe machinery — see src/components/use-account-avatars.ts).
  // ---------------------------------------------------------------------------

  // Collect the account IDs needing live remote resolution:
  //   • every contact's contactAccountID
  //   • each 1:1 conversation counterpart's accountID
  const remoteAccountIds: string[] = (() => {
    if (!me.$isLoaded) return [];
    const myID = (me as any).$jazz?.id ?? "";
    const ids = new Set<string>();
    // Contacts
    for (const c of listContacts(me) as any[]) {
      if (c?.contactAccountID) ids.add(c.contactAccountID as string);
    }
    // 1:1 conversation counterparts (exactly one other non-self member)
    for (const conv of Array.from(me.root?.knownConversations ?? []) as any[]) {
      if (!conv || !myID) continue;
      const jazzGroup = conv?.$jazz?.owner;
      if (!jazzGroup) continue;
      try {
        const members = jazzGroup.getDirectMembers() as any[];
        const others = members.filter(
          (m: any) =>
            (m.role === "admin" || m.role === "writer") &&
            m.account?.$jazz?.id !== myID,
        );
        if (others.length === 1) {
          const id = others[0].account?.$jazz?.id as string | undefined;
          if (id) ids.add(id);
        }
      } catch {
        // ignored — inaccessible after kick, etc.
      }
    }
    return [...ids];
  })();

  const remoteAvatarMap = useAccountAvatars(me, remoteAccountIds);

  // ---------------------------------------------------------------------------
  // Early loading gate — all hooks above this line are unconditional.
  // ---------------------------------------------------------------------------
  if (!me.$isLoaded) {
    return {
      loading: true,
      accountId: undefined,
      profile: { name: "", initials: "" },
      convos: [],
      contacts: [],
    };
  }

  const myID = (me as any).$jazz?.id as string | undefined;

  // Derive convID → counterpart accountID for 1:1 conversations.
  // Used below to feed remoteAvatarMap lookup into each 1:1 ConvoItem.
  const convCounterpartMap = new Map<string, string>();
  for (const conv of Array.from(me.root?.knownConversations ?? []) as any[]) {
    if (!conv || !myID) continue;
    const jazzGroup = conv?.$jazz?.owner;
    if (!jazzGroup) continue;
    try {
      const members = jazzGroup.getDirectMembers() as any[];
      const others = members.filter(
        (m: any) =>
          (m.role === "admin" || m.role === "writer") &&
          m.account?.$jazz?.id !== myID,
      );
      if (others.length === 1) {
        const counterpartId = others[0].account?.$jazz?.id as string | undefined;
        const convID = conv.$jazz?.id as string | undefined;
        if (counterpartId && convID) convCounterpartMap.set(convID, counterpartId);
      }
    } catch {
      // ignored
    }
  }

  // --- own profile ---
  const displayName = me.profile.displayName ?? "";
  const profile: HomeProfile = {
    name: displayName,
    initials: displayName[0] ?? "?",
    // ownAvatarUrl resolves asynchronously; undefined → initials fallback.
    avatarSrc: ownAvatarUrl ?? undefined,
  };

  // --- conversations ---
  const knownConversations = me.root.knownConversations;

  const conversations = dedupeConversationsByID(Array.from(knownConversations ?? []))
    .filter(
      (c: any) =>
        c != null &&
        !isArchived(me, c, { treatNotLoadedAsArchived: true }),
    )
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

  const convos: ConvoItem[] = sortedActive.map((c: any) => {
    const conversation = c.conversation;
    const convID = conversation.$jazz.id as string;
    const label = deriveConversationLabel(conversation, me);
    const lastReadAt = (me.root as any).lastReadAt?.[convID];
    let unread = 0;
    if (myID) {
      try {
        unread = getUnreadCount(conversation, lastReadAt, myID);
      } catch {
        unread = 0;
      }
    }
    const preview = getLastMessagePreview(conversation);
    const time = formatRowTime(conversation);
    const group = deriveIsGroup(conversation, myID);
    return {
      id: convID,
      name: label,
      initials: label[0] ?? "?",
      // avatarMap[convID]: conversation icon (snapshot). Falls back to the
      // counterpart's live remote avatar for 1:1 conversations.
      avatarSrc:
        avatarMap[convID] ??
        (convCounterpartMap.has(convID)
          ? remoteAvatarMap.get(convCounterpartMap.get(convID)!)
          : undefined),
      group,
      preview,
      time,
      unread,
    };
  });

  // --- contacts ---
  // contactAccountID is the account ID string on each Contact entry.
  // ContactItem.id = accountID so onOpenContact(id) → navigate('/profile/${id}').
  const rawContacts = listContacts(me);
  const contacts: ContactItem[] = rawContacts
    .filter((c: any) => c != null && c.contactAccountID)
    .map((c: any) => {
      const name = (c.displayNameLocal as string | undefined) ?? "(unknown)";
      return {
        id: c.contactAccountID as string,
        name,
        initials: name[0] ?? "?",
        // remoteAvatarMap[accountID] resolves live via per-account subscription.
        avatarSrc: remoteAvatarMap.get(c.contactAccountID as string),
      };
    });

  return { loading: false, accountId: myID, profile, convos, contacts };
}
