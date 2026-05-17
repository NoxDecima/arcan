import { Link } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { Button } from "@/components/ui/button";

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
  const hasContacts = contacts.length > 0;

  return (
    <aside className="w-64 flex flex-col border-r border-gray-200 bg-white">
      {/* Header: display name + add contact button (when contacts exist) */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-2">
        <span
          data-testid="sidebar-display-name"
          className="font-semibold text-gray-800 truncate"
        >
          {me.profile.displayName}
        </span>
        {hasContacts && (
          <Link
            to="/contacts/add"
            data-testid="add-contact-btn-header"
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium leading-none"
            title="Add contact"
          >
            +
          </Link>
        )}
      </div>

      {/* Main nav: contact list */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul data-testid="contact-list" className="space-y-1">
          {contacts.length === 0 ? (
            <li className="px-2 py-1">
              <Link to="/contacts/add">
                <Button
                  variant="outline"
                  className="w-full"
                  data-testid="add-contact-btn-empty"
                >
                  Add contact
                </Button>
              </Link>
            </li>
          ) : (
            contacts.map((contact, idx) => (
              <li key={(contact as any).$jazz?.id ?? idx}>
                <Link
                  to={`/contacts/${(contact as any).$jazz?.id ?? idx}`}
                  data-testid={`contact-row-${idx}`}
                  className="block text-sm text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                >
                  {(contact as any).displayNameLocal}
                </Link>
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
