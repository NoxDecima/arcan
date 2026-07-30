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

// Horizontal source item (2026-07-30, user direction): icon-in-circle on top,
// label below — laid out as a row of equal columns, share-sheet style.
function SourceItem({ testId, icon, label, onClick }: {
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
      className={`${tapClass} flex flex-1 flex-col items-center gap-2 rounded-r-4 px-2 py-3 hover:bg-panel-2`}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-panel-2">
        <Icon d={icon} size={24} className="text-text-2" />
      </span>
      <span className="font-body text-ui-tab text-text">{label}</span>
    </button>
  );
}

export function ComposerAttachmentSheet({ open, onClose, onPick }: ComposerAttachmentSheetProps) {
  return (
    <MobileBottomSheet open={open} onClose={onClose} title="Add attachment">
      <div className="flex flex-row gap-2 pb-2">
        <SourceItem testId="attach-source-camera" icon="camera" label="Camera" onClick={() => onPick("camera")} />
        <SourceItem testId="attach-source-photos" icon="image" label="Photos" onClick={() => onPick("photos")} />
        <SourceItem testId="attach-source-file" icon="paperclip" label="File" onClick={() => onPick("file")} />
      </div>
    </MobileBottomSheet>
  );
}
