import { useAccount } from "jazz-tools/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { Avatar } from "@/components/avatar";
import { resolveAvatarFileBlob } from "@/jazz/avatarResolver";

/**
 * ContactsRoute: full-page contacts list at /contacts.
 *
 * Introduced in Slice 3a alongside the sidebar refactor (contacts moved from
 * the sidebar to this dedicated page). Full implementation in Phase D Task 14.
 */
export function ContactsRoute() {
  const me = useAccount(JazzMessangerAccount, {
    resolve: { root: { contactBook: { $each: true } } },
  });

  if (!me.$isLoaded) return <div className="p-6">Loading…</div>;

  const contacts = Array.from(me.root?.contactBook ?? []);

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Contacts</h2>
        <Link to="/contacts/add">
          <Button data-testid="add-contact-page-btn">+ Add contact</Button>
        </Link>
      </header>

      <Link to="/" className="text-sm text-muted-foreground">
        ← Conversations
      </Link>

      {contacts.length === 0 ? (
        <div
          className="text-center py-12 text-muted-foreground"
          data-testid="contacts-empty"
        >
          <p>No contacts yet.</p>
          <p className="text-xs mt-2">
            Add your first contact via the + Add contact button.
          </p>
        </div>
      ) : (
        <ul className="space-y-1" data-testid="contacts-page-list">
          {contacts.map((c: any, i: number) => (
            <li key={i}>
              <Link
                to={`/contacts/${c?.$jazz?.id}`}
                className="flex items-center gap-3 p-3 hover:bg-accent rounded text-sm"
                data-testid={`contacts-page-row-${i}`}
              >
                <Avatar
                  src={resolveAvatarFileBlob({ accountID: c?.contactAccountID, me })}
                  initials={c?.displayNameLocal?.[0] ?? "?"}
                  size="md"
                  loadAs={me}
                />
                <span>{c?.displayNameLocal ?? "(unknown)"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
