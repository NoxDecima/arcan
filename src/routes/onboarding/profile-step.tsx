import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { pickFilesNative } from "@/platform/files";
import { signUp } from "@/auth/flows";
import { decodeRecoveryCode } from "@/auth/recovery-code";
import {
  useCreateAccountWithSeed,
  useSetDisplayNameOnMe,
} from "@/jazz/createAccountFromSeed";
import { setProfileAvatar, resizeImageToSquare } from "@/jazz/avatar";
import { MAX_ATTACHMENT_BYTES } from "@/jazz/attachments";
import { ProfileSetupScreen } from "@/ui/screens";
import type { Credentials } from "./credentials-step";

interface ProfileStepProps {
  credentials: Credentials;
  recoveryCode: string;
  onBack: () => void;
}

/**
 * ProfileStep: container for the profile-setup onboarding step.
 * Delegates rendering to ProfileSetupScreen (Rung 2 presenter).
 *
 * Sequence (all driven by `flows.signUp`):
 *   1. Decode the user's 24-word recovery code back into its 32-byte seed.
 *   2. Hand that seed to `createAccountWithSeed`, which derives the Jazz
 *      AgentSecret and registers a new Account via the React context's
 *      `register` function.
 *   3. Inside the same callback, set the profile display name via
 *      `setDisplayNameOnMe`.
 *   4. `flows.signUp` derives the KDF key from the password, encrypts the
 *      seed, computes the recovery proof, and POSTs everything to
 *      /api/auth/sign-up/email. On any non-2xx, it invokes the rollback
 *      callback returned from createAccountWithSeed (clears local creds).
 *
 * On success, the browser cookie + AuthSecretStorage are populated, App's
 * useIsAuthenticated flips to true, and OnboardingRoute unmounts.
 */
export function ProfileStep({
  credentials,
  recoveryCode,
  onBack,
}: ProfileStepProps) {
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build/tear down the object-URL preview whenever the picked file changes.
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  function ingestAvatar(file: File) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(
        `${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB. max 5 MB.`,
      );
      return;
    }
    setError(null);
    setAvatarFile(file);
  }

  async function handleAvatarPick() {
    try {
      const native = await pickFilesNative({ imagesOnly: true, multiple: false, maxBytes: MAX_ATTACHMENT_BYTES });
      if (native !== null) {
        if (native.length > 0) ingestAvatar(native[0]);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "pick failed — try again.");
      return;
    }
    fileInputRef.current?.click();
  }

  function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    ingestAvatar(file);
  }

  const createAccountWithSeed = useCreateAccountWithSeed();
  const setDisplayNameOnMe = useSetDisplayNameOnMe();

  const canSubmit = displayName.trim().length > 0 && !isSubmitting;

  async function handleFinish() {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const seed = decodeRecoveryCode(recoveryCode);
      await signUp({
        email: credentials.email,
        password: credentials.password,
        displayName: displayName.trim(),
        seed,
        createJazzAccount: async (s, name) => {
          const handle = await createAccountWithSeed(s);
          await setDisplayNameOnMe(handle, name);
          // Deferred avatar upload: the account exists now. Resize to 256²
          // (matching conversation-icon behavior) and assign. A failure here
          // must NOT abort sign-up — the account is already created — so we
          // surface a non-blocking note and continue.
          if (avatarFile) {
            try {
              const { ArcanAccount } = await import(
                "@/jazz/schema/ArcanAccount"
              );
              const me = await ArcanAccount.getMe().$jazz.ensureLoaded({
                resolve: { profile: true },
              });
              const resized = await resizeImageToSquare(avatarFile, 256);
              await setProfileAvatar(me as any, resized);
            } catch {
              setError(
                "account created, but the profile picture didn't upload — you can add it later in your profile.",
              );
            }
          }
          return handle;
        },
      });
      // Replay any stashed /invite fragment so the user lands on the invite
      // acceptance page after sign-up.
      const pendingInviteFragment = sessionStorage.getItem(
        "pending-invite-fragment",
      );
      if (pendingInviteFragment) {
        sessionStorage.removeItem("pending-invite-fragment");
        window.location.assign(`/invite${pendingInviteFragment}`);
      }
      // Otherwise: App's useIsAuthenticated flips, OnboardingRoute unmounts.
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "sign-up failed. please try again.",
      );
      setIsSubmitting(false);
    }
  }

  const errorSlot = error ? (
    <p
      data-testid="profile-error"
      className="rounded-r-4 bg-red/10 px-3 py-2 text-ui-toast text-red"
    >
      {error}
    </p>
  ) : undefined;

  const avatarInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleAvatarChange}
      data-testid="onboarding-avatar-input"
    />
  );

  return (
    <div className="h-app w-app flex flex-col">
      <ProfileSetupScreen
        avatarPreview={avatarPreview}
        onPickAvatar={() => void handleAvatarPick()}
        avatarInput={avatarInput}
        displayName={displayName}
        onDisplayName={setDisplayName}
        onFinish={() => void handleFinish()}
        onBack={onBack}
        submitting={isSubmitting}
        finishDisabled={!canSubmit}
        errorSlot={errorSlot}
        nameTestId="display-name-input"
        finishTestId="finish-onboarding-btn"
        avatarChangeTestId="onboarding-avatar-change"
        avatarPreviewTestId="onboarding-avatar-preview"
      />
    </div>
  );
}
