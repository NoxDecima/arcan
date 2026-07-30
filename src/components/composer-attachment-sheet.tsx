// src/components/composer-attachment-sheet.tsx
// Android attachment-source tray (feedback round 6; Camera added 2026-07-30).
// Tapping the composer attach button on the Android shell opens this sheet;
// picking a source closes it and opens the matching native picker. Camera
// clicks a dedicated `<input capture>` in detail.tsx (wry-native
// ACTION_IMAGE_CAPTURE), not pickFilesNative — see the camera-capture spec.
import { MobileBottomSheet } from "@/components/modal-shell";
import { Icon } from "@/ui/kit/icon";
import { tapClass } from "@/ui/kit/tap";

export type AttachSource = "photos" | "file" | "camera";

interface ComposerAttachmentSheetProps {
  open: boolean;
  onClose: () => void;
  onPick: (source: AttachSource) => void;
}

function SourceRow({ testId, icon, label, onClick }: {
  testId: string;
  icon: "image" | "paperclip" | "camera";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`${tapClass} flex w-full items-center gap-3 rounded-r-4 px-3 py-3 text-left hover:bg-panel-2`}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-panel-2">
        <Icon d={icon} size={20} className="text-text-2" />
      </span>
      <span className="font-body text-ui-row text-text">{label}</span>
    </button>
  );
}

export function ComposerAttachmentSheet({ open, onClose, onPick }: ComposerAttachmentSheetProps) {
  return (
    <MobileBottomSheet open={open} onClose={onClose} title="Add attachment">
      <div className="flex flex-col gap-1 pb-2">
        <SourceRow testId="attach-source-photos" icon="image" label="Photos" onClick={() => onPick("photos")} />
        <SourceRow testId="attach-source-file" icon="paperclip" label="File" onClick={() => onPick("file")} />
        <SourceRow testId="attach-source-camera" icon="camera" label="Camera" onClick={() => onPick("camera")} />
      </div>
    </MobileBottomSheet>
  );
}
