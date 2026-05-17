import { useState, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";

interface ComposerProps {
  onSend: (body: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function Composer({
  onSend,
  disabled = false,
  placeholder = "Type a message…",
}: ComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending || disabled) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setText("");
    } finally {
      setSending(false);
    }
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="flex gap-2 p-3 border-t border-border" data-testid="composer">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        disabled={disabled || sending}
        placeholder={disabled ? "No one else is in this chat" : placeholder}
        rows={2}
        className="flex-1 resize-none rounded border bg-background p-2 text-sm"
        data-testid="composer-input"
      />
      <Button
        onClick={handleSend}
        disabled={!text.trim() || sending || disabled}
        data-testid="composer-send-btn"
      >
        Send
      </Button>
    </div>
  );
}
