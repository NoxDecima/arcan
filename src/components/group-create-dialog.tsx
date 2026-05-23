import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface GroupCreateDialogProps {
  participantNames: string[];
  onCreate: (title: string) => void;
  onCancel: () => void;
}

export function GroupCreateDialog({
  participantNames,
  onCreate,
  onCancel,
}: GroupCreateDialogProps) {
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    try {
      await onCreate(trimmed);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  const participantPreview =
    participantNames.length > 0
      ? participantNames.join(", ")
      : "selected contacts";

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onCancel}
      data-testid="group-create-overlay"
    >
      <div
        className="bg-background rounded-lg p-6 max-w-md w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-1">Name your group</h2>
        <p className="text-sm text-muted-foreground mb-4">
          With: {participantPreview}
        </p>

        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 60))}
          onKeyDown={handleKeyDown}
          placeholder="Group name…"
          maxLength={60}
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary mb-1"
          data-testid="group-create-title-input"
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground mb-4 text-right">
          {title.length}/60
        </p>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            data-testid="group-create-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || loading}
            data-testid="group-create-submit"
          >
            {loading ? "Creating…" : "Create group"}
          </Button>
        </div>
      </div>
    </div>
  );
}
