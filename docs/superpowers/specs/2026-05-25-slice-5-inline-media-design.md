> **Historical context (added 2026-06-07):** this document was written when the project was named **jazz-messanger**. The project was renamed to **Arcan** on 2026-06-05; the app rebrand itself is captured as Unit 5 in `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md`. This file is preserved as-is for historical accuracy.
# Slice 5 — Inline Media + Profile Avatars Design

**Goal.** Close the last item on the E1a §9.1 done-definition ("share an image") by adding a working composer-to-render pipeline for message attachments, and bundle profile-avatar UI on top because both surfaces share the same `FileBlob` upload primitive.

**Scope.** Medium slice — ~6–8 hours of work, 3 phases (primitives + schema validation; UI components; surface integration + e2e).

**Closes:** the E1a §9.1 "inline media (≤5 MB)" line item and the Profile-avatar gap (`Profile.avatar` schema field has existed since Slice 1 with no UI).

**Deferred (explicit non-goals):**
- True erasure of deleted message body / attachments. Jazz/cojson is append-only; the current "soft delete" (clear body, set `deleted` flag) hides content from the rendered view but the original transaction stays in the local + server logs. Slice 5 keeps the same model — deleted messages just don't render their attachments either. A future slice will revisit "true delete" once cojson exposes a CoValue-delete API (or once we accept a sync-server-side compaction pass).
- Link preview unfurling, PDF previews, text-file previews (future polish).
- Cropping / resizing the avatar at upload time. v1 accepts the uploaded image as-is and relies on CSS `object-fit: cover` in a round container.
- Drag-and-drop onto the conversation window. Composer adds via paperclip button + clipboard paste only.
- Per-attachment upload progress indicator. Send is blocking: Composer shows "Sending…" until all uploads commit, then the message lands.

---

## 1. Data model (no schema changes)

Both schemas already exist:

- `Message.attachments: co.list(FileBlob)` — added in Slice 3a, currently always created empty.
- `MessangerProfile.avatar: FileBlob.optional()` — added in Slice 1, currently always undefined.
- `FileBlob { mimeType: z.string(), size: z.number(), filename: z.string().optional(), data: co.fileStream() }`.

### 1.1 Ownership

Each `FileBlob` and its inner `FileStream` is owned by the **same group as its parent CoValue**:

- Message attachment FileBlobs → the author's per-message `WriteGroup` (same group that owns the Message).
- Profile avatar FileBlob → the same group that owns the `MessangerProfile` (the user's account).

This preserves the authorship-integrity invariant from the E1a design spec §6.3: no one else can replace your image, because writes to your WriteGroup are limited to you. Profile avatars are owned by your account; other members can read but not modify.

---

## 2. New modules

### 2.1 `src/jazz/attachments.ts`

```ts
export class AttachmentTooLargeError extends Error {
  constructor(public readonly filename: string, public readonly size: number) {
    super(`${filename} is ${(size / 1_000_000).toFixed(1)} MB. Max 5 MB per attachment.`);
  }
}

export const MAX_ATTACHMENT_BYTES = 5_000_000;

export async function uploadAttachment(owner: Group, file: File): Promise<typeof FileBlob.$Type> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentTooLargeError(file.name, file.size);
  }
  const stream = await co.fileStream().createFromBlob(file, { owner });
  return FileBlob.create(
    {
      mimeType: file.type,
      size: file.size,
      filename: file.name,
      data: stream,
    },
    { owner },
  );
}
```

Pure primitive — no side effects on conversation or message. Caller is responsible for passing the right owning Group (per §1.1).

### 2.2 `src/jazz/avatar.ts`

```ts
export async function setProfileAvatar(me: Account, file: File): Promise<void> {
  const profileGroup = me.profile.$jazz.owner as Group;
  const blob = await uploadAttachment(profileGroup, file);
  me.profile.$jazz.set("avatar", blob);
}

export async function clearProfileAvatar(me: Account): Promise<void> {
  me.profile.$jazz.delete("avatar");
}
```

Replacing an avatar (calling `setProfileAvatar` twice) orphans the prior FileBlob — same caveat as deleted message attachments. Acceptable.

### 2.3 `sendMessage` signature change

`src/jazz/messages.ts` `sendMessage` grows one parameter:

```ts
export async function sendMessage(
  me: Account,
  conversation: any,
  body: string,
  attachments: Array<typeof FileBlob.$Type> = [],
): Promise<any>;
```

The Composer accumulates pending picks → calls `uploadAttachment(myWriteGroup, file)` for each one in `handleSend` → passes the resolved `FileBlob[]` to `sendMessage`. The `attachments` list on the new Message is populated from this array.

Send is blocking. `handleSend` awaits all uploads, then awaits `sendMessage`. The Composer disables the Send button while any upload is in flight.

---

## 3. New UI components

### 3.1 `src/components/avatar.tsx`

```tsx
type AvatarProps = {
  src?: typeof FileBlob.$Type | null;
  initials: string;          // fallback when no avatar present
  size?: "sm" | "md" | "lg"; // 32 / 40 / 64 px
  className?: string;
};
```

Renders a round container. When `src` is present and its FileStream resolves, renders `<img src={blobURL} className="object-cover" />`. Otherwise renders the `initials` over a tinted background (matches the existing `members.tsx` initial-circle style).

URL lifecycle: derive a blob via `co.fileStream().loadAsBlob(attachment.data.$jazz.id, { loadAs: me })` → `URL.createObjectURL`; revoke on unmount. The `loadAsBlob` call is async; render a small spinner placeholder until it resolves.

### 3.2 `src/components/attachment-tile.tsx`

```tsx
type AttachmentTileProps = {
  attachment: typeof FileBlob.$Type;
  mode: "pending" | "sent";
  onRemove?: () => void; // only for "pending" mode
  onClick?: () => void;  // image-tile in "sent" mode → lightbox; file-tile → download
};
```

Two visual variants based on `mode` and `attachment.mimeType`:

- **Image** (`mimeType.startsWith("image/")`): `<img>` thumbnail with `max-width: 280px; max-height: 200px` in "sent" mode (clickable → lightbox), and a small 80×80 square in "pending" mode (with a × overlay).
- **File** (everything else): a tile with file-type icon (📄 generic), filename, formatted size (e.g. "1.2 MB"). In "sent" mode → click triggers a browser download via a hidden `<a download={filename}>`. In "pending" mode → × button to remove from tray.

### 3.3 `src/components/image-lightbox.tsx`

Stateless overlay. Props: `{ src: string; alt?: string; onClose: () => void }`. Renders a fixed-position dark backdrop, the image centered, a close button top-right. Dismisses on backdrop click, Esc keydown, or close button.

### 3.4 `src/components/composer-attachment-tray.tsx`

Renders the array of pending attachments above the Composer textarea. Each attachment renders via `<AttachmentTile mode="pending" />`. Empty list → nothing rendered (no empty-state padding).

### 3.5 `src/components/composer.tsx` (rewrite)

Composer state grows from `{ text, sending }` to `{ text, pending: PendingAttachment[], errors: string[], sending }` where `PendingAttachment = { tempId: string; file: File }`.

New behavior:

- **Paperclip button** opens `<input type="file" multiple>`. On change, each picked file is validated against the 5 MB cap; passing files are pushed to `pending`; failing files raise a transient inline error.
- **Paste handler** on the textarea: reads `e.clipboardData.files`; same validation as above; non-files (text, URLs, …) fall through to default textarea paste.
- **Tray** renders above the textarea via `<ComposerAttachmentTray attachments={pending} onRemove={…} />`.
- **Send** enables when `text.trim() || pending.length > 0`. Click handler: set `sending = true`; upload each pending file via `uploadAttachment`; `sendMessage(me, conv, text.trim(), uploadedBlobs)`; clear `text + pending`. On any error, surface message; keep tray intact for retry.

---

## 4. Edit / delete semantics

- **Message body edit** — unchanged. Editing affects only `body`; the `attachments` list is untouched. No "remove this image after sending" affordance in v1.
- **Message delete** — unchanged from current behavior (`message.$jazz.set("body", ""); message.$jazz.set("deleted", true)`). The renderer additionally hides attachments when `deleted === true`, alongside the existing "This message was deleted" placeholder. The underlying `FileBlob` CoValues remain in storage; true erasure is out of scope (see deferred-list).

---

## 5. Avatar surfaces

| Surface | Change |
|---|---|
| `/settings` profile section | New "Profile picture" row: shows current avatar (or initials placeholder), "Change" button → file picker → `setProfileAvatar`. "Remove" button below when one is set → `clearProfileAvatar`. |
| `src/components/sidebar.tsx` header | The current display-name span gets a leading `<Avatar size="sm">` resolved from `me.profile.avatar`. |
| `src/routes/conversations/members.tsx` | Replace the existing `<div>{initial}</div>` with `<Avatar src={member.profile?.avatar} initials={...} />`. |
| `src/routes/contacts/index.tsx` and `src/routes/contacts/detail.tsx` | Same swap; resolves the contact's other-side profile via `me.root.contactBook[i].$jazz.owner` → Account → Profile chain. |
| `src/components/message-bubble.tsx` | Add a leading avatar gutter for every message (1:1 and group, mine and other). 32 px circle. |

### 5.1 Avatar resolution chain

Add a small helper `src/jazz/avatarResolver.ts`:

```ts
export function resolveAvatarFileBlob(args: {
  accountID: string;
  me: any;
  group?: any;
}): typeof FileBlob.$Type | undefined;
```

Mirrors `resolveDisplayName` semantics: contact-book entry (its referenced Account → profile.avatar) → group-member profile.avatar → undefined. Returns undefined when no avatar is configured; the `<Avatar>` component handles the fallback to initials.

---

## 6. Validation and error handling

- **Per-file size cap (5 MB):** checked in the Composer / settings handler at pick time. Rejected files never enter the tray; a transient inline error below the textarea reads *"<filename> is 7.2 MB. Max 5 MB per attachment."* Auto-dismisses after 4 s or on next interaction.
- **Avatar size cap:** same 5 MB ceiling, surfaced via toast / inline error in settings.
- **Upload failure:** if `uploadAttachment` throws (Jazz error, network, etc.) during `handleSend`, the whole `handleSend` rejects; Composer surfaces *"Sending failed — try again."*; the pending tray and text stay intact. No partial commit: `sendMessage` only pushes to `conversation.messages` after all `uploadAttachment` calls resolve.
- **Mixed paste:** `clipboardData.files` may contain mixed kinds. Filter to non-empty files passing the size cap; silently ignore other clipboard data so the default textarea paste handler (for text) still runs.

---

## 7. Files touched

| Status | File |
|---|---|
| NEW | `src/jazz/attachments.ts` |
| NEW | `src/jazz/avatar.ts` |
| NEW | `src/jazz/avatarResolver.ts` |
| NEW | `src/components/avatar.tsx` |
| NEW | `src/components/attachment-tile.tsx` |
| NEW | `src/components/image-lightbox.tsx` |
| NEW | `src/components/composer-attachment-tray.tsx` |
| Modify | `src/jazz/messages.ts` — `sendMessage` accepts `attachments` |
| Modify | `src/components/composer.tsx` — paperclip + paste + tray + tray-aware Send |
| Modify | `src/components/message-bubble.tsx` — attachment render + avatar gutter |
| Modify | `src/components/sidebar.tsx` — avatar in header |
| Modify | `src/routes/conversations/members.tsx` — avatar swap |
| Modify | `src/routes/contacts/index.tsx`, `src/routes/contacts/detail.tsx` — avatar swap |
| Modify | `src/routes/settings/account-section.tsx` (or wherever the profile section lives) — avatar upload row |
| NEW | `tests/unit/jazz/attachments.test.ts` |
| NEW | `tests/unit/jazz/avatar.test.ts` |
| Modify | `tests/unit/messages.test.ts` (extend with attachments-arg tests) |
| NEW | `tests/e2e/attachment-image.spec.ts` |
| NEW | `tests/e2e/attachment-file.spec.ts` |
| NEW | `tests/e2e/attachment-multiple.spec.ts` |
| NEW | `tests/e2e/attachment-paste.spec.ts` |
| NEW | `tests/e2e/attachment-too-large.spec.ts` |
| NEW | `tests/e2e/profile-avatar.spec.ts` |
| NEW | `tests/e2e/fixtures/{tiny.png,tiny.pdf,oversized.bin}` |
| Modify | `CHANGELOG.md` |

---

## 8. Phases

- **Phase A — Primitives + schema validation** (~3 tasks):
  - `attachments.ts` (`uploadAttachment` + `AttachmentTooLargeError`) + unit tests.
  - `avatar.ts` (`setProfileAvatar` + `clearProfileAvatar`) + unit tests.
  - `sendMessage` extension to accept `attachments: FileBlob[]` + unit test for the new shape.

- **Phase B — UI components** (~5 tasks):
  - `avatar.tsx` round-container primitive.
  - `attachment-tile.tsx` two-mode tile.
  - `image-lightbox.tsx` overlay.
  - `composer-attachment-tray.tsx` pending tray.
  - `composer.tsx` rewrite around paperclip + paste + tray + tray-aware Send.

- **Phase C — Surface integration + e2e** (~6 tasks):
  - `MessageBubble` attachment render + avatar gutter (1:1 and groups).
  - Settings profile section — avatar upload row.
  - Sidebar header — avatar.
  - Members route — avatar swap.
  - Contacts (index + detail) — avatar swap + `avatarResolver`.
  - 6 new e2e specs + 3 fixtures + CHANGELOG entry.

---

## 9. Acceptance criteria

1. Alice can attach an image via paperclip OR clipboard paste; the pending tray shows a thumbnail with a × remove button before send.
2. Multiple attachments (any mix of images and other files) can be queued and sent in one message.
3. Bob sees images as inline thumbnails (max 280×200) and other files as named tiles with size + download button.
4. Clicking an image thumbnail opens a full-viewport lightbox; Esc / backdrop / close-button dismisses.
5. >5 MB picks are rejected at the picker with an inline error; no upload happens.
6. Alice uploads a profile avatar in Settings; it appears in the sidebar header, members list, contacts list, and as the per-message avatar gutter in conversations (1:1 and group).
7. Bob sees Alice's updated avatar after sync, in the same surfaces.
8. Deleted messages don't render attachments (existing `deleted` flag is consulted; FileBlob CoValues remain in storage — followup tracked).
9. All Slice 1–4 regression tests still pass.

---

## 10. Risks

- **Jazz FileStream upload behavior under bad sync.** A 5 MB upload over a flaky connection could hang. Mitigation: existing `sendMessage` already throws on Jazz failures; Composer surfaces the error and keeps the tray intact so the user can retry.
- **Image MIME-type sniffing.** We trust `file.type` from the File API. A user-renamed `.exe` to `.png` would render a broken-image icon in the bubble. Acceptable for the v1 trust-circle threat model; magic-number sniffing is followup-worthy.
- **Avatar resolution-chain refactor.** The new `<Avatar>` component reaches into contactBook + group members the same way `resolveDisplayName` does. Risk of subtle name/avatar divergence. Mitigation: `resolveAvatarFileBlob` mirrors `resolveDisplayName`'s lookup order exactly, both keyed on `accountID`.
- **FileStream blob-URL leaks.** Each `<Avatar>` mount creates an object URL. Must `URL.revokeObjectURL` on unmount and on FileBlob reference change. Mitigation: dedicated `useEffect` cleanup in `<Avatar>`.

---

## 11. Open questions resolved during brainstorming

- **File-type scope** — images inline + non-image as download-link tiles (Q1: option B). Future: link previews, PDF previews, text-file previews.
- **One vs many attachments per message** — multiple (Q2: option B).
- **Send blocking vs optimistic-with-progress** — blocking for v1 (Q3: option A). Upgrade to optimistic is an E1.1 polish followup.
- **Bundle profile-avatar editing** — yes (Q4: option A).
- **Avatar display surfaces** — everywhere (settings, members, contacts, sidebar header, message bubble gutter for both 1:1 and groups) (Q5: option C, plus 1:1 gutter override).
- **Add affordances** — click paperclip + clipboard paste (Q6: option B). Drag-drop deferred.
- **Image click behavior** — lightbox (Q7: option B).
- **Delete-message attachment scrub** — skip; deleted messages just don't render their attachments. True erasure deferred (later slice). Followup captured for Linear.