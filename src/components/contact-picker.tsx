import { useState } from "react";
import { useAccount } from "jazz-tools/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";

interface ContactPickerProps {
  onSelect: (contacts: any[]) => void;
  onClose: () => void;
  excludeAccountIDs?: string[];
}

export function ContactPicker({ onSelect, onClose, excludeAccountIDs }: ContactPickerProps) {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { contactBook: { $each: true } } },
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (!me.$isLoaded) return null;

  const allContacts = Array.from(me.root?.contactBook ?? []);
  const contacts = excludeAccountIDs && excludeAccountIDs.length > 0
    ? allContacts.filter((c: any) => !excludeAccountIDs.includes(c?.contactAccountID))
    : allContacts;

  function toggleContact(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      return next;
    });
  }

  function handleContinue() {
    const picked = contacts.filter((_: any, i: number) => selected.has(i));
    onSelect(picked);
  }

  const count = selected.size;
  const helperText =
    count === 0
      ? "Pick one to start a 1:1 chat, or several for a group."
      : count === 1
        ? "1 contact selected — continue for a 1:1 chat."
        : `${count} contacts selected — continue to create a group.`;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
      data-testid="contact-picker-overlay"
    >
      <div
        className="bg-background rounded-lg p-6 max-w-md w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">Start a chat with…</h2>

        {contacts.length === 0 ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">You have no contacts yet.</p>
            <Link to="/contacts/add" onClick={onClose}>
              <Button>Add a contact</Button>
            </Link>
          </div>
        ) : (
          <>
            <ul
              className="space-y-1 max-h-80 overflow-y-auto"
              data-testid="contact-picker-list"
            >
              {contacts.map((c: any, i: number) => (
                <li key={i}>
                  <button
                    onClick={() => toggleContact(i)}
                    className={`w-full text-left px-3 py-2 hover:bg-accent rounded text-sm flex items-center gap-2 ${
                      selected.has(i) ? "bg-accent" : ""
                    }`}
                    data-testid={`contact-picker-row-${i}`}
                    aria-pressed={selected.has(i)}
                  >
                    <span
                      className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs ${
                        selected.has(i)
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground"
                      }`}
                    >
                      {selected.has(i) ? "✓" : ""}
                    </span>
                    {c?.displayNameLocal ?? "(unknown)"}
                  </button>
                </li>
              ))}
            </ul>

            <p
              className="text-xs text-muted-foreground mt-3"
              data-testid="contact-picker-count"
            >
              {helperText}
            </p>
          </>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={onClose}
            data-testid="contact-picker-cancel"
          >
            Cancel
          </Button>
          {contacts.length > 0 && (
            <Button
              onClick={handleContinue}
              disabled={count === 0}
              data-testid="contact-picker-continue"
            >
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
