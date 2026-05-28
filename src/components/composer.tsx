// src/components/composer.tsx
import { useRef, useState, type KeyboardEvent, type ClipboardEvent, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  ComposerAttachmentTray,
  type PendingAttachment,
} from "@/components/composer-attachment-tray";
import {
  uploadAttachment,
  AttachmentTooLargeError,
  MAX_ATTACHMENT_BYTES,
} from "@/jazz/attachments";
import type { Group } from "jazz-tools";

interface ComposerProps {
  /**
   * Called by the composer when the user hits Send. Body may be empty if
   * `attachments` is non-empty. The Composer awaits this promise (blocking
   * "Sending…" state) before resetting its text + tray.
   */
  onSend: (body: string, attachments: any[]) => void | Promise<void>;
  /**
   * Per-send WriteGroup factory. The Composer asks for this fresh each send
   * so the caller (detail.tsx) can ensure-then-pass the author's WriteGroup
   * for FileBlob ownership.
   */
  getWriteGroup: () => Promise<Group>;
  disabled?: boolean;
  placeholder?: string;
}

let tempIdCounter = 0;
function nextTempId(): string {
  tempIdCounter += 1;
  return `pending-${tempIdCounter}-${Date.now()}`;
}

function isAcceptablePick(file: File): { ok: true } | { ok: false; reason: string } {
  if (file.size === 0) return { ok: false, reason: `${file.name} is empty.` };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      reason: `${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB. Max 5 MB per attachment.`,
    };
  }
  return { ok: true };
}

export function Composer({
  onSend,
  getWriteGroup,
  disabled = false,
  placeholder = "Type a message…",
}: ComposerProps) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function showError(msg: string) {
    setError(msg);
    window.setTimeout(() => setError((prev) => (prev === msg ? null : prev)), 4000);
  }

  function ingestFiles(files: FileList | File[]) {
    const accepted: PendingAttachment[] = [];
    const rejections: string[] = [];
    for (const f of Array.from(files)) {
      const verdict = isAcceptablePick(f);
      if (verdict.ok) {
        accepted.push({ tempId: nextTempId(), file: f });
      } else {
        rejections.push(verdict.reason);
      }
    }
    if (accepted.length > 0) {
      setPending((prev) => [...prev, ...accepted]);
    }
    if (rejections.length > 0) {
      showError(rejections.join(" "));
    }
  }

  function handlePickClick() {
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) ingestFiles(e.target.files);
    e.target.value = ""; // reset so re-picking the same file fires onChange
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      // Only intercept if there are non-empty files; let text paste fall through
      const realFiles = Array.from(files).filter((f) => f.size > 0);
      if (realFiles.length > 0) {
        e.preventDefault();
        ingestFiles(realFiles);
      }
    }
  }

  function handleRemove(tempId: string) {
    setPending((prev) => prev.filter((p) => p.tempId !== tempId));
  }

  async function handleSend() {
    if (sending || disabled) return;
    const trimmed = text.trim();
    if (!trimmed && pending.length === 0) return;

    setSending(true);
    try {
      let uploaded: any[] = [];
      if (pending.length > 0) {
        const writeGroup = await getWriteGroup();
        const blobs: any[] = [];
        for (const p of pending) {
          try {
            const blob = await uploadAttachment(writeGroup, p.file);
            blobs.push(blob);
          } catch (err) {
            if (err instanceof AttachmentTooLargeError) {
              showError(err.message);
            } else {
              showError(`Sending failed — try again.`);
            }
            return; // keep tray + text intact for retry
          }
        }
        uploaded = blobs;
      }
      await onSend(trimmed, uploaded);
      setText("");
      setPending([]);
      setError(null);
    } catch {
      showError("Sending failed — try again.");
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

  const sendEnabled =
    !disabled && !sending && (text.trim().length > 0 || pending.length > 0);

  return (
    <div className="border-t border-border" data-testid="composer">
      <ComposerAttachmentTray pending={pending} onRemove={handleRemove} />
      {error && (
        <div
          className="px-3 py-2 bg-red-50 text-xs text-red-700"
          data-testid="composer-error"
        >
          {error}
        </div>
      )}
      <div className="flex gap-2 p-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
          data-testid="composer-file-input"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePickClick}
          disabled={disabled || sending}
          aria-label="Add attachment"
          data-testid="composer-attach-btn"
        >
          📎
        </Button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          onPaste={handlePaste}
          disabled={disabled || sending}
          placeholder={disabled ? "No one else is in this chat" : placeholder}
          rows={2}
          className="flex-1 resize-none rounded border bg-background p-2 text-sm"
          data-testid="composer-input"
        />
        <Button
          onClick={handleSend}
          disabled={!sendEnabled}
          data-testid="composer-send-btn"
        >
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
