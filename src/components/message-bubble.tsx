import { useEffect, useState } from "react";
import { co } from "jazz-tools";
import { Button } from "@/components/ui/button";
import { editMessage, deleteMessage } from "@/jazz/messages";
import { AttachmentTile } from "@/components/attachment-tile";
import { ImageLightbox } from "@/components/image-lightbox";
import { Avatar } from "@/components/avatar";
import { resolveAvatarFileBlob, useRemoteAvatar } from "@/jazz/avatarResolver";

interface MessageBubbleProps {
  message: any;
  authorAccountID: string | null;
  authorDisplayName: string;
  isMine: boolean;
  me: any;
  group?: any; // ConversationGroup, for avatar resolution
}

export function MessageBubble({
  message,
  authorAccountID,
  authorDisplayName,
  isMine,
  me,
  group,
}: MessageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.body ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Revoke the lightbox blob URL on unmount and whenever it changes (e.g. user
  // opens a second image without explicitly closing the first). The cleanup
  // callback closes over the URL that was current when the effect ran, so
  // each new URL revokes the previous one and unmount revokes the final one.
  // Must run before any conditional early return (Rules of Hooks).
  useEffect(() => {
    return () => {
      if (lightboxSrc) URL.revokeObjectURL(lightboxSrc);
    };
  }, [lightboxSrc]);

  // Avatar resolution: try the local fast path first (self only — the
  // group-member branch in resolveAvatarFileBlob is unreliable for remote
  // accounts because Jazz doesn't deeply auto-load nested refs from
  // peer-fetched CoValues). For non-self authors, fall back to the
  // reactive useRemoteAvatar which explicitly deep-resolves the FileBlob.
  // Both hook calls must happen unconditionally (Rules of Hooks); the
  // null-arg to useRemoteAvatar is a documented "skip the subscription"
  // signal so we never fetch twice.
  const isSelfAuthor = !!authorAccountID && authorAccountID === me?.$jazz?.id;
  const localAuthorAvatar =
    isSelfAuthor && authorAccountID
      ? resolveAvatarFileBlob({ accountID: authorAccountID, me, group })
      : undefined;
  const remoteAuthorAvatar = useRemoteAvatar(
    !isSelfAuthor && authorAccountID ? authorAccountID : null,
  );
  const authorAvatar = localAuthorAvatar ?? remoteAuthorAvatar;

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
        className={`px-3 py-2 italic text-sm text-muted-foreground flex gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}
        data-testid="message-deleted"
      >
        <Avatar
          src={authorAvatar}
          initials={authorDisplayName}
          size="sm"
          loadAs={me}
        />
        <div className={isMine ? "text-right" : "text-left"}>
          ⌫ This message was deleted
          <span className="ml-2 text-xs">
            — {authorDisplayName} {formattedTime}
          </span>
        </div>
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

  const attachments = Array.from((message as any).attachments ?? []);

  async function openLightbox(att: any) {
    const id = att?.data?.$jazz?.id;
    if (!id) return;
    const blob = await co.fileStream().loadAsBlob(id, { loadAs: me });
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setLightboxSrc(url);
  }

  function closeLightbox() {
    setLightboxSrc(null);
  }

  // authorAvatar already computed above (see Avatar resolution block).

  return (
    <div
      className={`group px-3 py-1 flex gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}
      data-testid={`message-${isMine ? "mine" : "other"}`}
    >
      <Avatar
        src={authorAvatar}
        initials={authorDisplayName}
        size="sm"
        loadAs={me}
        ariaLabel={`${authorDisplayName} avatar`}
      />

      <div className={`flex-1 min-w-0 ${isMine ? "text-right" : "text-left"}`}>
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
          <>
            {message.body && (
              <div
                className={`inline-block max-w-md rounded-lg px-3 py-2 text-sm ${
                  isMine ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {message.body}
              </div>
            )}
            {attachments.length > 0 && (
              <div
                className={`mt-1 flex flex-wrap gap-2 ${isMine ? "justify-end" : "justify-start"}`}
                data-testid="message-attachments"
              >
                {attachments.map((att: any, i: number) => (
                  <AttachmentTile
                    key={(att as any)?.$jazz?.id ?? i}
                    attachment={att}
                    mode="sent"
                    loadAs={me}
                    onImageClick={() => void openLightbox(att)}
                  />
                ))}
              </div>
            )}
          </>
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

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={closeLightbox} />
      )}
    </div>
  );
}
