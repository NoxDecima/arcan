import { useState } from "react";
import { ModalShell, ModalFooter } from "@/components/modal-shell";
import { PButton } from "@/ui/kit";

/**
 * Confirmation dialog for removing a contact (user decision, 2026-07-09):
 * when a live 1:1 conversation with the contact exists, the dialog offers a
 * checkbox to also delete it (leave + forget — the counterpart keeps their
 * copy). Default is unchecked: removing a contact keeps the history unless
 * explicitly asked.
 *
 * Replaces the native confirm() previously used by profile-view's
 * handleRemoveContact.
 */
export function RemoveContactDialog({
  contactName,
  hasConversation,
  onCancel,
  onConfirm,
}: {
  contactName: string;
  hasConversation: boolean;
  onCancel: () => void;
  /** Called with whether the 1:1 conversation should be deleted too. */
  onConfirm: (deleteConversation: boolean) => void;
}) {
  const [deleteConversation, setDeleteConversation] = useState(false);

  return (
    <ModalShell
      open
      onClose={onCancel}
      title="remove contact"
      dataTestId="remove-contact-dialog"
      footer={
        <ModalFooter>
          <PButton
            label="cancel"
            className="flex-1"
            onClick={onCancel}
            data-testid="remove-contact-cancel"
          />
          <PButton
            danger
            label="remove"
            className="flex-1"
            onClick={() => onConfirm(hasConversation && deleteConversation)}
            data-testid="remove-contact-confirm"
          />
        </ModalFooter>
      }
    >
      <p className="font-body text-ui-sub text-dim">
        {contactName} will be removed from your contacts. They are not
        notified.
      </p>
      {hasConversation && (
        <label className="flex items-center gap-2 cursor-pointer font-body text-ui-sub text-text">
          <input
            type="checkbox"
            checked={deleteConversation}
            onChange={(e) => setDeleteConversation(e.target.checked)}
            data-testid="remove-contact-delete-convo"
          />
          also delete our conversation
        </label>
      )}
    </ModalShell>
  );
}
