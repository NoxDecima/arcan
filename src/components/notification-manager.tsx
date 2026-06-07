import { useCallback, useMemo } from "react";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useTabTitleBadge } from "@/hooks/useTabTitleBadge";
import { useNewMessageEvents } from "@/hooks/useNewMessageEvents";
import { getUnreadCount } from "@/jazz/notifications";
import { resolveDisplayName } from "@/jazz/displayName";

interface NotificationManagerProps {
  /**
   * Optional `me` override — when provided, the component reads from this
   * value directly (e.g. tests injecting a stub). When omitted, the
   * component calls its own `useAccount` with the deep resolve it needs.
   * Keeping the deep resolve scoped here (rather than at App.tsx) avoids
   * triggering Jazz reconciliation churn during auth-state flips that
   * would otherwise remount sibling routes like /auth/recovery.
   */
  me?: any;
}

/**
 * The single home for the in-app notification stack:
 *   • aggregates total unread across all conversations
 *   • drives the tab title via useTabTitleBadge
 *   • fans out sound + browser-notification side effects via the
 *     useNewMessageEvents callback
 *
 * Gating contract (per spec §3.3 / §3.4):
 *   • Sound: requires me.root.notificationPrefs.sound === true
 *            AND document.hidden === true
 *   • Browser notification: requires me.root.notificationPrefs.browser === true
 *            AND Notification.permission === "granted"
 *            AND document.hidden === true
 *
 * Returns null — purely side-effectful, no DOM output.
 */
export function NotificationManager({ me: meProp }: NotificationManagerProps = {}): null {
  // Self-load when no `me` prop is provided. This keeps App.tsx's resolve
  // shallow — important because the App-level deep resolve was observed
  // to remount /auth/recovery on the post-recovery auth-state flip,
  // losing the RecoveryRoute's `stage` useState.
  const meFromHook = useAccount(ArcanAccount, {
    resolve: {
      profile: true,
      root: {
        knownConversations: { $each: { messages: true, $onError: "catch" } },
        lastReadAt: true,
        notificationPrefs: true,
      },
    },
  });
  const me = meProp ?? meFromHook;

  const myID = me?.$jazz?.id ?? null;
  const knownConversations = me?.root?.knownConversations;
  const lastReadAt = me?.root?.lastReadAt;
  const prefs = me?.root?.notificationPrefs;

  // Aggregate { id, label, messageCount, unread } per conversation for both
  // the title badge (sum unread) and the diff tracker (per-conv arrival).
  const conversations = useMemo(() => {
    if (!myID || !knownConversations) return [];
    const out: Array<{
      id: string;
      label: string;
      messageCount: number;
      unread: number;
    }> = [];
    for (const conv of knownConversations) {
      if (!conv) continue;
      const id = conv.$jazz?.id;
      if (!id) continue;
      const label = deriveLabel(conv, me);
      // Defensive: messages may be a NotLoaded proxy until Jazz hydrates it.
      // length-read is safe; iteration in getUnreadCount may throw — catch
      // and treat as 0 unread until the next render cycle.
      const messageCount = conv.messages?.length ?? 0;
      let unread = 0;
      try {
        unread = getUnreadCount(conv, lastReadAt?.[id], myID);
      } catch {
        unread = 0;
      }
      out.push({ id, label, messageCount, unread });
    }
    return out;
  }, [knownConversations, lastReadAt, myID, me]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unread, 0),
    [conversations],
  );

  useTabTitleBadge(totalUnread);

  const onNewMessage = useCallback(
    (event: { conversationID: string; conversationLabel: string }) => {
      // Gate: sound requires pref + hidden
      if (prefs?.sound && document.hidden) {
        void new Audio("/notification.mp3").play().catch(() => {});
      }
      // Gate: browser notification requires pref + permission + hidden
      if (
        prefs?.browser &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        document.hidden
      ) {
        const n = new Notification("Arcan", {
          body: `New message in ${event.conversationLabel}`,
          tag: `conv-${event.conversationID}`,
          renotify: false,
        } as NotificationOptions);
        n.onclick = () => {
          window.focus();
          window.location.assign(`/conversations/${event.conversationID}`);
          n.close();
        };
      }
    },
    [prefs?.sound, prefs?.browser],
  );

  useNewMessageEvents({ conversations, onNewMessage });

  return null;
}

/**
 * Derive a display label for the conversation — uses explicit title for
 * groups, falls back to the other 1:1 member's display name via the
 * existing resolveDisplayName helper.
 */
function deriveLabel(conversation: any, me: any): string {
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
