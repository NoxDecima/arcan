import { useAccount } from "jazz-tools/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Avatar } from "@/components/avatar";
import { resolveAvatarFileBlob, useRemoteAvatar } from "@/jazz/avatarResolver";
import { NavListSkeleton } from "@/components/skeleton";

/**
 * ContactsRoute: full-page contacts list at /contacts.
 *
 * Introduced in Slice 3a alongside the sidebar refactor (contacts moved from
 * the sidebar to this dedicated page). Full implementation in Phase D Task 14.
 */
function ContactRow({
  contact,
  index,
  me,
}: {
  contact: any;
  index: number;
  me: any;
}) {
  // Prefer the sync local resolver (self / group member). For contact-book
  // entries, the Contact schema stores accountID as a string, so we fall back
  // to the reactive remote-load hook to fetch profile.avatar from the
  // publicly-readable profile group.
  const localAvatar = resolveAvatarFileBlob({
    accountID: contact?.contactAccountID,
    me,
  });
  const remoteAvatar = useRemoteAvatar(
    localAvatar ? null : contact?.contactAccountID ?? null,
  );
  const avatar = localAvatar ?? remoteAvatar;

  return (
    <li>
      <Link
        to={`/contacts/${contact?.$jazz?.id}`}
        className="flex items-center gap-3 p-3 hover:bg-accent rounded text-sm"
        data-testid={`contacts-page-row-${index}`}
      >
        <Avatar
          src={avatar}
          initials={contact?.displayNameLocal?.[0] ?? "?"}
          size="md"
          loadAs={me}
        />
        <span>{contact?.displayNameLocal ?? "(unknown)"}</span>
      </Link>
    </li>
  );
}

export function ContactsRoute() {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { contactBook: { $each: true } } },
  });

  if (!me.$isLoaded) {
    return (
      <div className="p-6" data-testid="contacts-route-loading">
        <NavListSkeleton rows={5} />
      </div>
    );
  }

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
            <ContactRow key={i} contact={c} index={i} me={me} />
          ))}
        </ul>
      )}
    </div>
  );
}
