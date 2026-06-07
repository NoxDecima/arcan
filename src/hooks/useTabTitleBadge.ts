import { useEffect } from "react";

/**
 * Sets document.title to `(N) baseTitle` when the tab is hidden AND there
 * are unread messages; otherwise leaves baseTitle plain. Reacts to both
 * totalUnread changes and Page Visibility API events.
 *
 * On unmount, restores the plain baseTitle. This prevents a stale "(3)"
 * prefix from lingering if the notification UI is torn down mid-session.
 */
export function useTabTitleBadge(totalUnread: number, baseTitle = "Arcan") {
  useEffect(() => {
    const sync = () => {
      if (document.hidden && totalUnread > 0) {
        const shown = totalUnread > 99 ? "99+" : String(totalUnread);
        document.title = `(${shown}) ${baseTitle}`;
      } else {
        document.title = baseTitle;
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      document.title = baseTitle;
    };
  }, [totalUnread, baseTitle]);
}
