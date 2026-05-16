import { Link } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";

/**
 * Sidebar component for the home screen.
 *
 * Navigation strategy: react-router-dom. The "Settings" control is a <Link>
 * to "/settings". No callback props.
 */
export function Sidebar() {
  const me = useAccount(JazzMessangerAccount, {
    resolve: {
      profile: true,
      root: { contactBook: { $each: true } },
    },
  });

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

  const contacts = me.root.contactBook;

  return (
    <aside className="w-64 flex flex-col border-r border-gray-200 bg-white">
      {/* Header: display name */}
      <div className="p-4 border-b border-gray-200">
        <span
          data-testid="sidebar-display-name"
          className="font-semibold text-gray-800 truncate block"
        >
          {me.profile.displayName}
        </span>
      </div>

      {/* Main nav: contact list */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul data-testid="contact-list" className="space-y-1">
          {contacts.length === 0 ? (
            <li className="text-sm text-gray-400 px-2 py-1">
              No contacts yet
            </li>
          ) : (
            contacts.map((contact, idx) => (
              <li
                key={idx}
                className="text-sm text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
              >
                {contact.displayNameLocal}
              </li>
            ))
          )}
        </ul>
      </nav>

      {/* Footer: Settings link */}
      <div className="p-4 border-t border-gray-200">
        <Link
          to="/settings"
          data-testid="settings-link"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Settings
        </Link>
      </div>
    </aside>
  );
}
