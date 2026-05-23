import { useState } from "react";
import { Button } from "@/components/ui/button";
import { editMessage, deleteMessage } from "@/jazz/messages";

interface MessageBubbleProps {
  message: any;
  authorAccountID: string | null;
  authorDisplayName: string;
  isMine: boolean;
  me: any;
}

export function MessageBubble({
  message,
  authorAccountID,
  authorDisplayName,
  isMine,
  me,
}: MessageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.body ?? "");
  const [menuOpen, setMenuOpen] = useState(false);

  if (!authorAccountID) {
    return (
      <div
        className="px-3 py-1 text-xs text-muted-foreground"
        data-testid="message-malformed"
      >
        [unverified author — message hidden]
      </div>
    );
  }

  const formattedTime = message.sentAt
    ? new Date(message.sentAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  if (message.deleted) {
    return (
      <div
        className={`px-3 py-2 italic text-sm text-muted-foreground ${isMine ? "text-right" : "text-left"}`}
        data-testid="message-deleted"
      >
        ⌫ This message was deleted
        <span className="ml-2 text-xs">
          — {authorDisplayName} {formattedTime}
        </span>
      </div>
    );
  }

  async function handleSaveEdit() {
    const trimmed = editText.trim();
    if (!trimmed) return;
    await editMessage(me, message, trimmed);
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this message for everyone in this chat?")) return;
    await deleteMessage(me, message);
  }

  return (
    <div
      className={`group px-3 py-1 ${isMine ? "text-right" : "text-left"}`}
      data-testid={`message-${isMine ? "mine" : "other"}`}
    >
      <div className="text-xs text-muted-foreground mb-1">
        {isMine ? formattedTime : `${authorDisplayName} ${formattedTime}`}
        {message.edited && <span className="ml-1">(edited)</span>}
        {isMine && !editing && (
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="ml-2 opacity-0 group-hover:opacity-100"
            data-testid="message-menu-btn"
          >
            ⋮
          </button>
        )}
      </div>

      {editing ? (
        <div className="inline-flex flex-col gap-1 items-end">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={2}
            className="rounded border bg-background p-2 text-sm w-64"
            data-testid="message-edit-input"
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveEdit}
              data-testid="message-edit-save"
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={`inline-block max-w-md rounded-lg px-3 py-2 text-sm ${
            isMine ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
        >
          {message.body}
        </div>
      )}

      {menuOpen && isMine && !editing && (
        <div className="mt-1 flex justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setMenuOpen(false);
              setEditing(true);
            }}
            data-testid="message-edit-btn"
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setMenuOpen(false);
              void handleDelete();
            }}
            data-testid="message-delete-btn"
          >
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}
