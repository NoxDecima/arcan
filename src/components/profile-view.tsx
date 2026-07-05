import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { useAccount, useCoState } from "jazz-tools/react";
import { co } from "jazz-tools";
import { Link, useNavigate } from "react-router-dom";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import { SafetyNumber } from "@/components/safety-number";
import { resolveAvatarFileBlob, useRemoteAvatar } from "@/jazz/avatarResolver";
import { setProfileAvatar, clearProfileAvatar } from "@/jazz/avatar";
import { AttachmentTooLargeError, MAX_ATTACHMENT_BYTES } from "@/jazz/attachments";
import { getAccountPubkeyHex } from "@/auth/pubkey";
import { findOrCreate1to1Conversation } from "@/jazz/conversation";
import { PButton } from "@/ui/kit";
import { OwnProfileScreen } from "@/ui/screens/own-profile-screen";
import { ProfileScreen } from "@/ui/screens/profile-screen";

/**
 * ProfileView: polymorphic profile component that renders either the local
 * user's own profile (when `accountID === me.$jazz.id`) or another account's
 * profile.
 *
 * Wave C (Unit 10): drops AuthSurface wrapper; branches on isOwn to render
 * <OwnProfileScreen> or <ProfileScreen>. All data logic and handlers are
 * moved verbatim from the prior hand-rolled render.
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

  // ── own-profile avatar (item 6 fix) ─────────────────────────────────────────
  // Mirrors use-home-lists.ts's own-avatar effect: extract stream ID from the
  // FileBlob ref, load as objectURL, key the effect on the stream ID so a new
  // upload (which produces a new stream ID) causes a re-run and shows the new
  // photo. Previously the raw FileBlob was passed as avatarSrc which HAv cannot
  // use as an <img src>. (user decision, 2026-07-05 walkthrough)
  const ownStreamId: string | null =
    isOwn && me.$isLoaded
      ? ((me as any).profile?.avatar?.data?.$jazz?.id ?? null)
      : null;
  const [ownAvatarUrl, setOwnAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!ownStreamId) {
      setOwnAvatarUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    void (async () => {
      try {
        const blob = await co.fileStream().loadAsBlob(ownStreamId, { loadAs: me as any });
        if (cancelled || !blob) return;
        createdUrl = URL.createObjectURL(blob);
        setOwnAvatarUrl(createdUrl);
      } catch {
        // Silent — falls back to initials.
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // ownStreamId changes when the user uploads a new avatar → effect re-runs.
    // `me` omitted: ownStreamId is derived from it; closure captures the correct
    // `me` for the lifetime of this stream ID (same pattern as use-home-lists.ts).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownStreamId]);

  // Avatar resolution: self → objectURL from effect above; other → resolveAvatarFileBlob
  // (local) with remote fallback for the contact-book branch.
  const otherLocalAvatar =
    !isOwn && me.$isLoaded
      ? resolveAvatarFileBlob({ accountID, me })
      : undefined;
  const otherRemoteAvatar = useRemoteAvatar(
    isOwn || otherLocalAvatar ? null : accountID,
  );
  const otherAvatar = !isOwn ? (otherLocalAvatar ?? otherRemoteAvatar) : undefined;
  const avatarSrc = isOwn ? (ownAvatarUrl ?? undefined) : otherAvatar;

  if (!me.$isLoaded) return null;

  // Display name resolution.
  const ownDisplayName = (me as any).profile?.displayName ?? "";
  const contactDisplayName = (contact as any)?.displayNameLocal as
    | string
    | undefined;
  const remoteDisplayName = (otherAccount as any)?.profile?.displayName as
    | string
    | undefined;
  const displayName = isOwn
    ? ownDisplayName
    : contactDisplayName ?? remoteDisplayName ?? "unknown";

  // Fingerprint: own → derive from current signing key; other → contact pin if
  // present, else the remote account's pubkey (best-effort).
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

  // ── handlers ─────────────────────────────────────────────────────────────

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAvatarError(
        `${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB. Max 5 MB.`,
      );
      return;
    }
    setBusy(true);
    setAvatarError(null);
    try {
      await setProfileAvatar(me as any, file);
    } catch (err) {
      if (err instanceof AttachmentTooLargeError) setAvatarError(err.message);
      else setAvatarError("upload failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAvatarRemove() {
    if (!confirm("remove your profile picture?")) return;
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
      const stub = contact ?? { contactAccountID: accountID };
      const conv = await findOrCreate1to1Conversation(me as any, stub);
      navigate(`/conversations/${(conv as any).$jazz.id}`);
    } finally {
      setBusy(false);
    }
  }

  // Remove-contact handler (item 9): mirrors detail.tsx's handleRemove.
  // Removes the contactBook entry by its $jazz.id, then navigates home.
  function handleRemoveContact() {
    if (!contact) return;
    const contactJazzId = (contact as any)?.$jazz?.id;
    if (!contactJazzId) return;
    if (!confirm("remove this contact?")) return;
    (me as any).root.contactBook.$jazz.remove(
      (c: any) => c?.$jazz?.id === contactJazzId,
    );
    navigate("/");
  }

  const idShort = `${accountID.slice(0, 6)}…${accountID.slice(-3)}`;

  // ── own-branch extra sections (Rung-4 app-only) ──────────────────────────
  // Section order (user decision, 2026-07-05 walkthrough, item 8):
  // "view security code" moves directly below the action-buttons block;
  // "your conversations" list moves below it.
  const ownExtraSections = (
    <>
      {avatarError && (
        <p className="text-xs text-red" data-testid="profile-avatar-error">
          {avatarError}
        </p>
      )}

      {/* Safety number — directly below action-buttons block (reordered per item 8) */}
      <section className="w-full" data-testid="profile-safety-section">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-r-3 border border-hairline bg-panel p-3"
          onClick={() => setShowSafety((s) => !s)}
          data-testid="profile-safety-toggle"
        >
          <span className="text-sm font-semibold text-text">view security code</span>
          <span className="text-dim">{showSafety ? "▾" : "▸"}</span>
        </button>
        {showSafety && (
          <div className="mt-2 rounded-r-3 border border-hairline bg-panel p-3">
            {fingerprintHex && fingerprintHex.length === 64 ? (
              <SafetyNumber fingerprintHex={fingerprintHex} />
            ) : (
              <p className="text-xs text-dim">Security code not available.</p>
            )}
            <p className="mt-3 text-center text-[11px] text-dim">
              Share this in person so others can verify it&apos;s really you.
            </p>
          </div>
        )}
      </section>

      {/* Your conversations — below safety number (reordered per item 8) */}
      <section className="w-full" data-testid="profile-shared-section">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-dim">
          your conversations
        </h3>
        {sharedGroups.length === 0 ? (
          <p className="text-sm text-text-2" data-testid="profile-shared-empty">
            Conversations you start with contacts appear here.
          </p>
        ) : (
          <ul className="space-y-1" data-testid="profile-shared-list">
            {sharedGroups.map((g) => (
              <li key={g.id}>
                <Link
                  to={`/conversations/${g.id}`}
                  className="block rounded-r-2 p-2 text-sm text-text hover:bg-panel-2"
                >
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Remove avatar */}
      {ownStreamId && (
        <button
          type="button"
          onClick={() => void handleAvatarRemove()}
          disabled={busy}
          data-testid="profile-avatar-remove"
          className="text-xs text-red hover:underline"
        >
          remove profile picture
        </button>
      )}
    </>
  );

  // ── root wrapper (carries profile-view + data-profile-mode) ──────────────
  return (
    <div
      data-testid="profile-view"
      data-profile-mode={isOwn ? "own" : "other"}
      className="flex flex-col flex-1 min-h-0"
    >
      {isOwn ? (
        <OwnProfileScreen
          vm={{
            name: displayName,
            initials: displayName[0]?.toUpperCase() ?? "?",
            avatarSrc: avatarSrc ?? undefined,
            idShort,
          }}
          onBack={() => navigate(-1)}
          onEditName={beginEditName}
          onEditAvatar={() => fileInputRef.current?.click()}
          onAddContact={() => navigate("/contacts/add")}
          onSettings={() => navigate("/settings")}
          nameEditSlot={
            editingName ? (
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
                className="rounded-r-2 border border-hairline bg-panel px-2 py-1 text-xl font-semibold text-text outline-none focus:border-arcan-accent"
              />
            ) : undefined
          }
          extraSections={ownExtraSections}
          avatarInput={
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
              data-testid="profile-avatar-input"
            />
          }
          // testid carries
          backTestId="profile-back"
          avatarTestId="profile-avatar"
          avatarChangeTestId="profile-avatar-change"
          nameTestId="profile-display-name"
          editNameTestId="profile-edit-name"
          addContactTestId="profile-add-contact"
          settingsTestId="profile-settings-link"
        />
      ) : (
        <ProfileScreen
          vm={{
            name: displayName,
            initials: displayName[0]?.toUpperCase() ?? "?",
            avatarSrc: avatarSrc ?? undefined,
            idShort,
            sharedConversations: sharedGroups,
          }}
          onBack={() => navigate(-1)}
          onMessage={() => void handleMessage()}
          onOpenConversation={(id) => navigate(`/conversations/${id}`)}
          safetyOpen={showSafety}
          onToggleSafety={() => setShowSafety((s) => !s)}
          safetySlot={
            fingerprintHex && fingerprintHex.length === 64 ? (
              <SafetyNumber fingerprintHex={fingerprintHex} />
            ) : (
              <p className="text-xs text-dim">Security code not available.</p>
            )
          }
          // item 9: remove-contact danger zone when a contactBook entry exists.
          // Uses same removal flow as src/routes/contacts/detail.tsx handleRemove.
          dangerZone={
            contact ? (
              <PButton
                danger
                full
                label="remove contact"
                onClick={handleRemoveContact}
                data-testid="contact-remove-btn"
              />
            ) : undefined
          }
          // testid carries
          backTestId="profile-back"
          avatarTestId="profile-avatar"
          nameTestId="profile-display-name"
          messageTestId="profile-message"
          safetyToggleTestId="profile-safety-toggle"
        />
      )}
    </div>
  );
}
