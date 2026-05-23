import { useState } from "react";
import { Button } from "@/components/ui/button";

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
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onCancel}
      data-testid="leave-promote-overlay"
    >
      <div
        className="bg-background rounded-lg p-6 max-w-md w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-1">Promote a new admin</h2>
        <p className="text-sm text-muted-foreground mb-4">
          You are the only admin. Promote someone before you leave.
        </p>

        <ul
          className="space-y-1 max-h-60 overflow-y-auto mb-4"
          data-testid="leave-promote-candidates"
        >
          {candidates.map((candidate, i) => (
            <li key={candidate.accountID}>
              <label
                className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer hover:bg-accent text-sm ${
                  selectedAccountID === candidate.accountID ? "bg-accent" : ""
                }`}
                data-testid={`leave-promote-candidate-${i}`}
              >
                <input
                  type="radio"
                  name="promote-candidate"
                  value={candidate.accountID}
                  checked={selectedAccountID === candidate.accountID}
                  onChange={() => setSelectedAccountID(candidate.accountID)}
                  disabled={loading}
                  className="accent-primary"
                />
                <span>{candidate.displayName}</span>
                {candidate.currentRole && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {candidate.currentRole}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>

        <div className="flex justify-end gap-2">
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
        </div>
      </div>
    </div>
  );
}
