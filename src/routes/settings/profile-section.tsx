// src/routes/settings/profile-section.tsx
import { useRef, useState, type ChangeEvent } from "react";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { setProfileAvatar, clearProfileAvatar } from "@/jazz/avatar";
import { AttachmentTooLargeError, MAX_ATTACHMENT_BYTES } from "@/jazz/attachments";
import { Skel } from "@/components/skeleton";

export function ProfileSection() {
  const me = useAccount(ArcanAccount, {
    resolve: { profile: true },
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me.$isLoaded) {
    return (
      <section data-testid="profile-section-loading">
        <h2 className="text-base font-semibold text-text mb-2">Profile</h2>
        <div className="w-full p-4 rounded-r-3 border border-hairline bg-panel">
          <Skel w="40%" h={14} />
        </div>
      </section>
    );
  }

  function handlePick() {
    fileInputRef.current?.click();
  }

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB. Max 5 MB.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setProfileAvatar(me as any, file);
    } catch (err) {
      if (err instanceof AttachmentTooLargeError) setError(err.message);
      else setError("Upload failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Remove your profile picture?")) return;
    setBusy(true);
    setError(null);
    try {
      await clearProfileAvatar(me as any);
    } finally {
      setBusy(false);
    }
  }

  const hasAvatar = Boolean((me as any).profile.avatar);

  return (
    <section>
      <h2 className="text-base font-semibold text-text mb-2">Profile</h2>
      <div className="bg-panel rounded border border-hairline px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Avatar
            src={(me as any).profile.avatar}
            initials={(me as any).profile.displayName?.[0] ?? "?"}
            size="lg"
            loadAs={me}
            data-testid="settings-avatar"
          />
          <div className="flex flex-col gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleChange}
              data-testid="settings-avatar-input"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handlePick}
              disabled={busy}
              data-testid="settings-avatar-change-btn"
            >
              {hasAvatar ? "Change picture" : "Upload picture"}
            </Button>
            {hasAvatar && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void handleRemove()}
                disabled={busy}
                data-testid="settings-avatar-remove-btn"
                className="text-red-600"
              >
                Remove
              </Button>
            )}
          </div>
        </div>
        {error && (
          <p className="text-xs text-red-600" data-testid="settings-avatar-error">
            {error}
          </p>
        )}
        <div className="border-t border-hairline pt-3">
          <p className="text-xs text-dim mb-1">Display name</p>
          <p
            data-testid="settings-display-name"
            className="text-sm font-medium text-text"
          >
            {(me as any).profile.displayName}
          </p>
        </div>
      </div>
    </section>
  );
}
