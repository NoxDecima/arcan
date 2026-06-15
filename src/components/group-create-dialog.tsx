import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { MobileBottomSheet, ModalFooter } from "@/components/modal-shell";

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
    // useModalA11y moves focus to the first focusable element; the title
    // input is the first focusable, but we re-focus explicitly here so the
    // caret lands cleanly after the modal's enter animation.
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
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
    participantNames.length > 0 ? participantNames.join(", ") : "selected contacts";

  return (
    <MobileBottomSheet
      open
      onClose={onCancel}
      title="name your group"
      dataTestId="group-create-overlay"
      footer={
        <ModalFooter>
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
        </ModalFooter>
      }
    >
      <p className="text-sm text-text-2">With: {participantPreview}</p>
      <TextField
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, 60))}
        onKeyDown={handleKeyDown}
        placeholder="Group name…"
        maxLength={60}
        data-testid="group-create-title-input"
        disabled={loading}
      />
      <p className="text-right text-xs text-dim">{title.length}/60</p>
    </MobileBottomSheet>
  );
}
