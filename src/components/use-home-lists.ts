import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { isArchived } from "@/jazz/conversation";
import { resolveDisplayName } from "@/jazz/displayName";
import { getUnreadCount, getLastMessagePreview } from "@/jazz/notifications";
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
 * Container hook: resolves home-screen data from Jazz.
 *
 * Extracts the data layer that was previously embedded inside
 * src/components/sidebar.tsx (Unit 10 Wave A, Task 5). The logic is moved
 * verbatim — same useAccount resolve spec, isArchived filter, sort, helpers.
 * Sidebar.tsx retains its own copies until Phase 4.
 *
 * avatarSrc fields are undefined in Rung 1: HAv falls back to initials. Real
 * avatar resolution (FileBlob → URL, per-contact useRemoteAvatar) is deferred
 * to Rung 4 (manifest note: §8.5d data-driven deviation).
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
        contactBook: { $each: true },
        // $onError: "catch" ensures the sidebar loads even when some
        // conversations become inaccessible (e.g. after the user is kicked
        // and Jazz revokes their read access to the ConversationGroup).
        // Without this, the whole knownConversations resolve stalls
        // indefinitely and me.$isLoaded stays false.
        // Slice 8: also resolve `messages` so getUnreadCount can iterate
        // them without tripping on a NotLoaded list proxy.
        knownConversations: { $each: { messages: true, $onError: "catch" } },
        // Slice 8: per-conversation read cutoff for unread-badge computation.
        lastReadAt: true,
      },
    },
  });

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

  // --- own profile ---
  const displayName = me.profile.displayName ?? "";
  const profile: HomeProfile = {
    name: displayName,
    initials: displayName[0] ?? "?",
    // Rung 4: FileBlob → URL resolution is async; HAv initials are the
    // Rung 1 fallback. Manifest note: §8.5d data-driven deviation.
    avatarSrc: undefined,
  };

  // --- conversations ---
  const knownConversations = me.root.knownConversations;

  const conversations = Array.from(knownConversations ?? [])
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
      // Rung 4: conversation avatar images (§8.5d deviation manifest note).
      avatarSrc: undefined,
      group,
      preview,
      time,
      unread,
    };
  });

  // --- contacts ---
  // contactAccountID is the account ID string on each Contact entry.
  // ContactItem.id = accountID so onOpenContact(id) → navigate('/profile/${id}').
  const rawContacts = Array.from(me.root?.contactBook ?? []);
  const contacts: ContactItem[] = rawContacts
    .filter((c: any) => c != null && c.contactAccountID)
    .map((c: any) => {
      const name = (c.displayNameLocal as string | undefined) ?? "(unknown)";
      return {
        id: c.contactAccountID as string,
        name,
        initials: name[0] ?? "?",
        // Rung 4: contact avatar images (§8.5d deviation manifest note).
        avatarSrc: undefined,
      };
    });

  return { loading: false, accountId: myID, profile, convos, contacts };
}
