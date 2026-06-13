import { useState, useRef, type ChangeEvent } from "react";
import { useAccount, useCoState } from "jazz-tools/react";
import { Link, useNavigate } from "react-router-dom";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import { SafetyNumber } from "@/components/safety-number";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/avatar";
import { resolveAvatarFileBlob, useRemoteAvatar } from "@/jazz/avatarResolver";
import { setProfileAvatar, clearProfileAvatar } from "@/jazz/avatar";
import { AttachmentTooLargeError, MAX_ATTACHMENT_BYTES } from "@/jazz/attachments";
import { getAccountPubkeyHex } from "@/auth/pubkey";
import { findOrCreate1to1Conversation } from "@/jazz/conversation";

/**
 * ProfileView: polymorphic profile component that renders either the local
 * user's own profile (when `accountID === me.$jazz.id`) or another account's
 * profile.
 *
 * Own branch:
 *   - Avatar with a camera overlay for upload / change / remove
 *   - Display name with a pencil-edit affordance
 *   - "add a contact" CTA → /contacts/add
 *   - Your conversations (via useSharedGroups against self — empty by design)
 *   - Safety number (own pubkey via getAccountPubkeyHex)
 *   - "account & settings" navigation row
 *
 * Other branch:
 *   - Avatar (read-only)
 *   - Display name from contactBook entry's displayNameLocal (or remote profile fallback)
 *   - Truncated account ID
 *   - "message" CTA → finds/creates 1:1 conversation
 *   - Shared conversations list
 *   - Safety number (pinnedFingerprint from contactBook; falls back to remote pubkey)
 *
 * The data wiring relies on existing helpers: avatarResolver for avatars,
 * the contactBook for pinnedFingerprint/displayNameLocal, and useRemoteAvatar
 * for the contact-list case where the schema stores only an account ID string.
 */
interface ProfileViewProps {
  accountID: string;
}

export function ProfileView({ accountID }: ProfileViewProps) {
  const me = useAccount(ArcanAccount, {
    resolve: { profile: true, root: { contactBook: { $each: true } } },
  });
  const sharedGroups = useSharedGroups(accountID);
  const [showSafety, setShowSafety] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const myID = (me as any)?.$jazz?.id as string | undefined;
  const isOwn = !!myID && accountID === myID;

  // For the "other" branch, load the target account so we can read its
  // profile.displayName and pubkey as a fallback when no contact entry exists.
  const otherAccount = useCoState(
    ArcanAccount,
    isOwn ? undefined : (accountID as any),
    { resolve: { profile: true } },
  );

  // Find the contactBook entry (other-branch only).
  const contact = me.$isLoaded
    ? (me.root.contactBook as any)?.find(
        (c: any) => c?.contactAccountID === accountID,
      )
    : undefined;

  // Avatar resolution: self → me.profile.avatar; other → resolveAvatarFileBlob
  // (local) with remote fallback for the contact-book branch.
  const ownAvatar = isOwn ? ((me as any)?.profile?.avatar ?? undefined) : undefined;
  const otherLocalAvatar = !isOwn && me.$isLoaded
    ? resolveAvatarFileBlob({ accountID, me })
    : undefined;
  const otherRemoteAvatar = useRemoteAvatar(
    isOwn || otherLocalAvatar ? null : accountID,
  );
  const otherAvatar = !isOwn ? (otherLocalAvatar ?? otherRemoteAvatar) : undefined;
  const avatarSrc = isOwn ? ownAvatar : otherAvatar;

  if (!me.$isLoaded) {
    return (
      <div className="flex flex-col items-center gap-4 p-6" data-testid="profile-loading">
        <p className="text-sm text-dim">Loading…</p>
      </div>
    );
  }

  // Display name resolution.
  const ownDisplayName = (me as any).profile?.displayName ?? "";
  const contactDisplayName = (contact as any)?.displayNameLocal as string | undefined;
  const remoteDisplayName = (otherAccount as any)?.profile?.displayName as string | undefined;
  const displayName = isOwn
    ? ownDisplayName
    : contactDisplayName ?? remoteDisplayName ?? "Unknown";

  // Fingerprint: own → derive from current signing key; other → contact pin if
  // present, else the remote account's pubkey (best-effort — won't match the
  // pinned value the other party stamped on us, but at least proves identity
  // to the same level the contacts/detail screen does today).
  let fingerprintHex = "";
  if (isOwn) {
    try {
      fingerprintHex = getAccountPubkeyHex(me as any);
    } catch {
      fingerprintHex = "";
    }
  } else {
    const pin = (contact as any)?.pinnedFingerprint as string | undefined;
    if (pin && pin.length === 64) {
      fingerprintHex = pin;
    } else if (otherAccount) {
      try {
        fingerprintHex = getAccountPubkeyHex(otherAccount as any);
      } catch {
        fingerprintHex = "";
      }
    }
  }

  async function handleAvatarPick() {
    fileInputRef.current?.click();
  }

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAvatarError(`${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB. Max 5 MB.`);
      return;
    }
    setBusy(true);
    setAvatarError(null);
    try {
      await setProfileAvatar(me as any, file);
    } catch (err) {
      if (err instanceof AttachmentTooLargeError) setAvatarError(err.message);
      else setAvatarError("Upload failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAvatarRemove() {
    if (!confirm("Remove your profile picture?")) return;
    setBusy(true);
    setAvatarError(null);
    try {
      await clearProfileAvatar(me as any);
    } finally {
      setBusy(false);
    }
  }

  function beginEditName() {
    setNameDraft(ownDisplayName);
    setEditingName(true);
  }

  async function saveName() {
    const next = nameDraft.trim();
    if (!next || next === ownDisplayName) {
      setEditingName(false);
      return;
    }
    setBusy(true);
    try {
      (me as any).profile.$jazz.set("displayName", next);
      (me as any).profile.$jazz.set("name", next);
    } finally {
      setBusy(false);
      setEditingName(false);
    }
  }

  async function handleMessage() {
    if (isOwn) return;
    setBusy(true);
    try {
      // Contact entry may be missing if this is a profile of a non-contact
      // (e.g. a co-member of a shared group). findOrCreate1to1Conversation
      // only needs `contactAccountID` from its argument.
      const stub = contact ?? { contactAccountID: accountID };
      const conv = await findOrCreate1to1Conversation(me as any, stub);
      navigate(`/conversations/${(conv as any).$jazz.id}`);
    } finally {
      setBusy(false);
    }
  }

  const idShort = `${accountID.slice(0, 6)}…${accountID.slice(-3)}`;

  return (
    <div
      data-testid="profile-view"
      data-profile-mode={isOwn ? "own" : "other"}
      className="flex flex-col items-center gap-4 p-6 max-w-md mx-auto"
    >
      {/* Back affordance — sits left-aligned at the top of the column */}
      <div className="w-full">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm text-dim hover:text-text"
          data-testid="profile-back"
        >
          ← Back
        </button>
      </div>

      {/* Avatar + camera overlay (own only) */}
      <div className="relative">
        <Avatar
          src={avatarSrc}
          initials={displayName?.[0] ?? "?"}
          size="lg"
          loadAs={me}
          data-testid="profile-avatar"
        />
        {isOwn && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
              data-testid="profile-avatar-input"
            />
            <button
              type="button"
              onClick={() => void handleAvatarPick()}
              disabled={busy}
              data-testid="profile-avatar-change"
              aria-label="Change avatar"
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-pill bg-arcan-accent text-on-accent flex items-center justify-center text-sm"
            >
              ✎
            </button>
          </>
        )}
      </div>

      {/* Display name + edit affordance */}
      <div className="flex items-center gap-2">
        {editingName && isOwn ? (
          <>
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveName();
                if (e.key === "Escape") setEditingName(false);
              }}
              maxLength={64}
              data-testid="profile-name-input"
              className="text-xl font-semibold text-text bg-panel border border-hairline rounded-r-2 px-2 py-1 outline-none focus:border-arcan-accent"
            />
          </>
        ) : (
          <>
            <h1
              data-testid="profile-display-name"
              className="text-xl font-semibold text-text"
            >
              {displayName}
            </h1>
            {isOwn && (
              <button
                type="button"
                onClick={beginEditName}
                aria-label="Edit name"
                data-testid="profile-edit-name"
                className="text-dim hover:text-text"
              >
                ✎
              </button>
            )}
          </>
        )}
      </div>

      {/* Truncated account ID — present on both branches as an identity hint */}
      <p
        data-testid="profile-account-id"
        className="text-xs text-dim font-mono"
      >
        {idShort}
      </p>

      {avatarError && (
        <p className="text-xs text-red" data-testid="profile-avatar-error">
          {avatarError}
        </p>
      )}

      {/* Primary action */}
      {isOwn ? (
        <Link to="/contacts/add" className="w-full">
          <Button
            variant="primary"
            className="w-full"
            data-testid="profile-add-contact"
          >
            add a contact
          </Button>
        </Link>
      ) : (
        <Button
          variant="primary"
          className="w-full"
          onClick={() => void handleMessage()}
          disabled={busy}
          data-testid="profile-message"
        >
          message
        </Button>
      )}

      {/* Shared conversations section */}
      <section className="w-full" data-testid="profile-shared-section">
        <h3 className="text-[10px] uppercase tracking-widest text-dim font-semibold mb-2">
          {isOwn ? "your conversations" : "shared conversations"}
        </h3>
        {sharedGroups.length === 0 ? (
          <p className="text-sm text-text-2" data-testid="profile-shared-empty">
            {isOwn
              ? "Conversations you start with contacts appear here."
              : "No shared conversations yet."}
          </p>
        ) : (
          <ul className="space-y-1" data-testid="profile-shared-list">
            {sharedGroups.map((g) => (
              <li key={g.id}>
                <Link
                  to={`/conversations/${g.id}`}
                  className="block p-2 rounded-r-2 hover:bg-panel-2 text-sm text-text"
                >
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Safety number section */}
      <section className="w-full" data-testid="profile-safety-section">
        <button
          type="button"
          className="w-full flex items-center justify-between p-3 rounded-r-3 border border-hairline bg-panel"
          onClick={() => setShowSafety((s) => !s)}
          data-testid="profile-safety-toggle"
        >
          <span className="text-sm font-semibold text-text">view security code</span>
          <span className="text-dim">{showSafety ? "▾" : "▸"}</span>
        </button>
        {showSafety && (
          <div className="mt-2 p-3 rounded-r-3 border border-hairline bg-panel">
            {fingerprintHex && fingerprintHex.length === 64 ? (
              <SafetyNumber fingerprintHex={fingerprintHex} />
            ) : (
              <p className="text-xs text-dim" data-testid="profile-safety-unavailable">
                Security code not available.
              </p>
            )}
            <p className="text-[11px] text-dim text-center mt-3">
              {isOwn
                ? "Share this in person so others can verify it's really you."
                : "Compare in person to confirm it's really them."}
            </p>
          </div>
        )}
      </section>

      {/* Own-only: avatar remove + account & settings link */}
      {isOwn && (
        <>
          {ownAvatar && (
            <button
              type="button"
              onClick={() => void handleAvatarRemove()}
              disabled={busy}
              data-testid="profile-avatar-remove"
              className="text-xs text-red hover:underline"
            >
              Remove profile picture
            </button>
          )}
          <Link
            to="/settings"
            data-testid="profile-settings-link"
            className="w-full mt-2 p-3 rounded-r-3 border border-hairline bg-panel text-sm text-text text-center"
          >
            account & settings
          </Link>
        </>
      )}
    </div>
  );
}
