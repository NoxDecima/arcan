// src/components/message-attachments.tsx — container-side attachment renderer.
// Extracted from message-bubble.tsx (Task 3, Unit 10 Wave B) so attachment
// content can be passed as attSlot into ChatScreen's ChatTimelineItem.msg.
// Preserves blob-URL resolution + lightbox behavior from the original.
import { useEffect, useState } from "react";
import { co } from "jazz-tools";
import { AttachmentTile } from "@/components/attachment-tile";
import { ImageLightbox } from "@/components/image-lightbox";

interface MessageAttachmentsProps {
  message: any;
  isMine: boolean;
  me: any;
}

export function MessageAttachments({ message, isMine, me }: MessageAttachmentsProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Revoke the lightbox blob URL on unmount and whenever it changes.
  useEffect(() => {
    return () => {
      if (lightboxSrc) URL.revokeObjectURL(lightboxSrc);
    };
  }, [lightboxSrc]);

  const attachments = Array.from((message as any).attachments ?? []);
  if (attachments.length === 0) return null;

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

  return (
    <>
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
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={closeLightbox} />
      )}
    </>
  );
}
