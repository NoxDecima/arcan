import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalShell, ModalFooter } from "@/components/modal-shell";

interface Candidate {
  accountID: string;
  displayName: string;
  currentRole: string;
}

interface LeaveWithPromoteDialogProps {
  candidates: Candidate[];
  onLeave: (newAdminAccountID: string) => void;
  onCancel: () => void;
}

export function LeaveWithPromoteDialog({
  candidates,
  onLeave,
  onCancel,
}: LeaveWithPromoteDialogProps) {
  const [selectedAccountID, setSelectedAccountID] = useState<string | null>(
    candidates.length > 0 ? candidates[0].accountID : null,
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!selectedAccountID || loading) return;
    setLoading(true);
    try {
      await onLeave(selectedAccountID);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell
      open
      onClose={onCancel}
      title="promote a new admin"
      dataTestId="leave-promote-overlay"
      footer={
        <ModalFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            data-testid="leave-promote-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!selectedAccountID || loading}
            data-testid="leave-promote-submit"
          >
            {loading ? "Leaving…" : "Promote and leave"}
          </Button>
        </ModalFooter>
      }
    >
      <p className="text-sm text-text-2">
        You are the only admin. Promote someone before you leave.
      </p>
      <ul
        className="flex flex-col gap-1 max-h-60 overflow-y-auto"
        data-testid="leave-promote-candidates"
      >
        {candidates.map((candidate, i) => {
          const isSelected = selectedAccountID === candidate.accountID;
          return (
            <li key={candidate.accountID}>
              <label
                className={`flex items-center gap-3 rounded-r-3 px-3 py-2 cursor-pointer text-sm text-text hover:bg-panel-2 ${
                  isSelected ? "bg-panel-2" : ""
                }`}
                data-testid={`leave-promote-candidate-${i}`}
              >
                <input
                  type="radio"
                  name="promote-candidate"
                  value={candidate.accountID}
                  checked={isSelected}
                  onChange={() => setSelectedAccountID(candidate.accountID)}
                  disabled={loading}
                  style={{ accentColor: "var(--color-accent)" }}
                />
                <span>{candidate.displayName}</span>
                {candidate.currentRole && (
                  <span className="ml-auto text-xs text-text-2">
                    {candidate.currentRole}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </ModalShell>
  );
}
