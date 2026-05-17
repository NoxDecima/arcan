import { useAccount } from "jazz-tools/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";

interface ContactPickerProps {
  onSelect: (contact: any) => void;
  onClose: () => void;
}

export function ContactPicker({ onSelect, onClose }: ContactPickerProps) {
  const me = useAccount(JazzMessangerAccount, {
    resolve: { root: { contactBook: { $each: true } } },
  });

  if (!me.$isLoaded) return null;

  const contacts = me.root?.contactBook ?? [];

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
          <ul
            className="space-y-1 max-h-80 overflow-y-auto"
            data-testid="contact-picker-list"
          >
            {Array.from(contacts).map((c: any, i: number) => (
              <li key={i}>
                <button
                  onClick={() => onSelect(c)}
                  className="w-full text-left px-3 py-2 hover:bg-accent rounded text-sm"
                  data-testid={`contact-picker-row-${i}`}
                >
                  {c?.displayNameLocal ?? "(unknown)"}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end mt-4">
          <Button
            variant="outline"
            onClick={onClose}
            data-testid="contact-picker-cancel"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
