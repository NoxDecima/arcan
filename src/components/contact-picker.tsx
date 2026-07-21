import { useState } from "react";
import { useAccount } from "jazz-tools/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MobileBottomSheet, ModalFooter } from "@/components/modal-shell";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { listContacts } from "@/jazz/handshake";

interface ContactPickerProps {
  onSelect: (contacts: any[]) => void;
  onClose: () => void;
  excludeAccountIDs?: string[];
}

export function ContactPicker({ onSelect, onClose, excludeAccountIDs }: ContactPickerProps) {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { contacts: { $each: true } } },
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (!me.$isLoaded) return null;

  const allContacts = listContacts(me);
  const contacts = excludeAccountIDs && excludeAccountIDs.length > 0
    ? allContacts.filter((c: any) => !excludeAccountIDs.includes(c?.contactAccountID))
    : allContacts;

  function toggleContact(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
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
    <MobileBottomSheet
      open
      onClose={onClose}
      title="start a chat with…"
      dataTestId="contact-picker-overlay"
      footer={
        <ModalFooter>
          <Button variant="outline" onClick={onClose} data-testid="contact-picker-cancel">
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
        </ModalFooter>
      }
    >
      {contacts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <p className="text-sm text-text-2">You have no contacts yet.</p>
          <Link to="/contacts/add" onClick={onClose}>
            <Button>Add a contact</Button>
          </Link>
        </div>
      ) : (
        <>
          <ul
            className="flex flex-col gap-1 max-h-80 overflow-y-auto"
            data-testid="contact-picker-list"
          >
            {contacts.map((c: any, i: number) => {
              const isOn = selected.has(i);
              return (
                <li key={i}>
                  <button
                    onClick={() => toggleContact(i)}
                    className={`flex w-full items-center gap-2 rounded-r-3 px-3 py-2 text-left text-sm text-text hover:bg-panel-2 active:bg-hairline transition-tint duration-fast ease-out ${
                      isOn ? "bg-panel-2" : ""
                    }`}
                    data-testid={`contact-picker-row-${i}`}
                    aria-pressed={isOn}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs ${
                        isOn
                          ? "bg-arcan-accent border-arcan-accent text-on-accent"
                          : "border-hairline text-transparent"
                      }`}
                    >
                      {isOn ? "✓" : ""}
                    </span>
                    {c?.displayNameLocal ?? "(unknown)"}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-text-2" data-testid="contact-picker-count">
            {helperText}
          </p>
        </>
      )}
    </MobileBottomSheet>
  );
}
