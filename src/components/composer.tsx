// src/components/composer.tsx
import { useRef, useState, type KeyboardEvent, type ClipboardEvent, type ChangeEvent } from "react";
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
  placeholder = "type a message…",
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
    <div className="border-t border-hairline bg-bg" data-testid="composer">
      <ComposerAttachmentTray pending={pending} onRemove={handleRemove} />
      {error && (
        <div
          className="px-3 py-2 text-xs text-red"
          data-testid="composer-error"
        >
          {error}
        </div>
      )}
      <div
        className="flex items-center gap-2 px-3 pt-3"
        style={{
          // 12px baseline + iOS safe-area on chat-detail (mobile full-screen).
          paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
          data-testid="composer-file-input"
        />
        {/* attach (proto: paperclip/plus icon, text-2) */}
        <button
          type="button"
          onClick={handlePickClick}
          disabled={disabled || sending}
          aria-label="Add attachment"
          data-testid="composer-attach-btn"
          className="shrink-0 text-text-2 hover:text-text disabled:opacity-50"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" />
          </svg>
        </button>

        {/* pill input wrapper (proto: rounded-pill, hairline, bg-bg, height 38) */}
        <div className="flex flex-1 items-center rounded-pill border border-hairline bg-bg px-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            onPaste={handlePaste}
            disabled={disabled || sending}
            placeholder={disabled ? "no one else is in this chat" : placeholder}
            rows={1}
            className="flex-1 resize-none bg-transparent py-2 text-[12.5px] text-text placeholder:text-dim outline-none"
            data-testid="composer-input"
          />
        </div>

        {/* 38x38 pill send button — accent fill when sendable (proto L197-199) */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!sendEnabled}
          aria-label="Send message"
          data-testid="composer-send-btn"
          className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-pill transition-colors ${
            sendEnabled
              ? "bg-arcan-accent text-on-accent"
              : "bg-panel-2 text-dim"
          }`}
        >
          {sending ? (
            <span className="text-[10px] font-mono">…</span>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a1 1 0 0 0-1.39 1.21L4 11l11 1-11 1-1.98 6.19a1 1 0 0 0 1.38 1.21z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
