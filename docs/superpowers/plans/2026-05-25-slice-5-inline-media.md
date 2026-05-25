# Slice 5 — Inline Media + Profile Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a working file-upload → message-attachment pipeline and profile-avatar UI on top of the existing Jazz FileStream + FileBlob schemas, closing the last item on the E1a §9.1 done-definition.

**Architecture:** Two thin Jazz-side primitives (`uploadAttachment` + `setProfileAvatar`) wrap `co.fileStream().createFromBlob` and produce/store FileBlob CoValues owned by the same group as their parent (preserves authorship-integrity per E1a §6.3). Composer is rewritten around a pending-attachment tray; MessageBubble renders attachments via a shared `<AttachmentTile>`; a new `<Avatar>` component surfaces avatars across sidebar / members / contacts / per-message gutter; `setProfileAvatar` writes to `me.profile.avatar`.

**Tech Stack:** TypeScript, React 18, Tailwind v3, shadcn/ui, jazz-tools 0.20.18 (`co.fileStream()` modern API), Vitest (unit, scoped to `tests/unit/`), Playwright (e2e, two-browser scenarios).

**Spec:** `docs/superpowers/specs/2026-05-25-slice-5-inline-media-design.md`

**Critical reminders for every task:**
- All CoValue mutations via `instance.$jazz.set/$jazz.push/$jazz.remove` (NOX-13). Never direct property assignment.
- Modern non-deprecated Jazz API: `co.fileStream().createFromBlob(file, { owner })` and `co.fileStream().loadAsBlob(id, { loadAs })`. The static `FileStream.createFromBlob` / `FileStream.loadAsBlob` are deprecated.
- `FileBlob` owner = same group as parent CoValue (per spec §1.1).
- Vitest only runs `tests/unit/**`.
- Object URLs from `URL.createObjectURL` MUST be revoked on unmount / on FileBlob change (blob-URL leak risk per spec §10).

---

## File structure

| Status | Path | Responsibility |
|---|---|---|
| NEW | `src/jazz/attachments.ts` | `uploadAttachment(owner, file)` primitive + `AttachmentTooLargeError` + `MAX_ATTACHMENT_BYTES` |
| NEW | `src/jazz/avatar.ts` | `setProfileAvatar(me, file)` + `clearProfileAvatar(me)` |
| NEW | `src/jazz/avatarResolver.ts` | `resolveAvatarFileBlob({ accountID, me, group? })` — mirrors `resolveDisplayName` |
| NEW | `src/components/avatar.tsx` | `<Avatar>` round-container primitive with blob-URL lifecycle |
| NEW | `src/components/attachment-tile.tsx` | `<AttachmentTile>` two-mode tile (pending / sent) |
| NEW | `src/components/image-lightbox.tsx` | `<ImageLightbox>` fullscreen overlay |
| NEW | `src/components/composer-attachment-tray.tsx` | `<ComposerAttachmentTray>` tray above the composer textarea |
| Modify | `src/jazz/messages.ts` | `sendMessage` accepts `attachments: FileBlob[]` |
| Modify | `src/components/composer.tsx` | Paperclip + paste handler + tray + tray-aware Send |
| Modify | `src/components/message-bubble.tsx` | Attachment render + leading avatar gutter |
| Modify | `src/components/sidebar.tsx` | Avatar in header |
| Modify | `src/routes/conversations/members.tsx` | Avatar swap (replace initials with `<Avatar>`) |
| Modify | `src/routes/contacts/index.tsx` | Avatar in row |
| Modify | `src/routes/contacts/detail.tsx` | Avatar at top |
| Modify | `src/routes/settings/profile-section.tsx` | Avatar upload row + Remove button |
| NEW | `tests/unit/jazz/attachments.test.ts` | Unit tests for `uploadAttachment` |
| NEW | `tests/unit/jazz/avatar.test.ts` | Unit tests for `setProfileAvatar` / `clearProfileAvatar` |
| Modify | `tests/unit/jazz/messages.test.ts` | Extend `sendMessage` tests with attachments-arg |
| NEW | `tests/e2e/attachment-image.spec.ts` | Image send + lightbox |
| NEW | `tests/e2e/attachment-file.spec.ts` | File-tile + download |
| NEW | `tests/e2e/attachment-multiple.spec.ts` | Multiple attachments in one message |
| NEW | `tests/e2e/attachment-paste.spec.ts` | Clipboard paste |
| NEW | `tests/e2e/attachment-too-large.spec.ts` | Size cap |
| NEW | `tests/e2e/profile-avatar.spec.ts` | Avatar upload + cross-context visibility |
| NEW | `tests/e2e/fixtures/tiny.png` | ~2KB PNG fixture |
| NEW | `tests/e2e/fixtures/tiny.pdf` | ~2KB PDF fixture |
| NEW | `tests/e2e/fixtures/oversized.bin` | 6MB random-bytes fixture (gitignored or committed lfs-style) |
| Modify | `CHANGELOG.md` | Slice 5 entry |

---

## Phase A — Primitives + schema validation

### Task 1: `uploadAttachment` primitive + size enforcement

**Files:**
- Create: `src/jazz/attachments.ts`
- Test: `tests/unit/jazz/attachments.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/jazz/attachments.test.ts
import { describe, it, expect } from "vitest";
import { createJazzTestAccount } from "jazz-tools/testing";
import { Group, co } from "jazz-tools";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import {
  uploadAttachment,
  AttachmentTooLargeError,
  MAX_ATTACHMENT_BYTES,
} from "@/jazz/attachments";

describe("uploadAttachment", () => {
  it("creates a FileBlob with the right mimeType/size/filename and a loaded FileStream", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const group = Group.create({ owner: me });

    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const file = new File([bytes], "hello.bin", { type: "application/octet-stream" });

    const blob = await uploadAttachment(group, file);

    expect((blob as any).mimeType).toBe("application/octet-stream");
    expect((blob as any).size).toBe(5);
    expect((blob as any).filename).toBe("hello.bin");
    expect((blob as any).data).toBeDefined();
  });

  it("rejects files larger than MAX_ATTACHMENT_BYTES", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const group = Group.create({ owner: me });

    const oversized = new Uint8Array(MAX_ATTACHMENT_BYTES + 1);
    const file = new File([oversized], "big.bin", { type: "application/octet-stream" });

    await expect(uploadAttachment(group, file)).rejects.toBeInstanceOf(
      AttachmentTooLargeError,
    );
  });

  it("MAX_ATTACHMENT_BYTES is exactly 5_000_000 (5 MB)", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(5_000_000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- attachments.test`
Expected: FAIL with "Cannot find module '@/jazz/attachments'"

- [ ] **Step 3: Create the module**

```ts
// src/jazz/attachments.ts
import { co } from "jazz-tools";
import type { Group } from "jazz-tools";
import { FileBlob } from "@/jazz/schema/FileBlob";

export const MAX_ATTACHMENT_BYTES = 5_000_000;

export class AttachmentTooLargeError extends Error {
  constructor(public readonly filename: string, public readonly size: number) {
    super(
      `${filename} is ${(size / 1_000_000).toFixed(1)} MB. Max 5 MB per attachment.`,
    );
    this.name = "AttachmentTooLargeError";
  }
}

/**
 * Upload a file as a Jazz FileBlob owned by the given group.
 *
 * Caller is responsible for passing the correct owning group:
 * - Message attachments → author's per-message WriteGroup.
 * - Profile avatar → the profile's owning group (me.profile.$jazz.owner).
 *
 * Throws AttachmentTooLargeError when file.size > MAX_ATTACHMENT_BYTES.
 * Throws on Jazz/network errors (caller surfaces).
 */
export async function uploadAttachment(
  owner: Group,
  file: File,
): Promise<typeof FileBlob.$Type> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentTooLargeError(file.name, file.size);
  }
  const stream = await co.fileStream().createFromBlob(file, { owner });
  const blob = FileBlob.create(
    {
      mimeType: file.type,
      size: file.size,
      filename: file.name,
      data: stream,
    },
    { owner },
  );
  return blob;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- attachments.test`
Expected: PASS — 3/3

- [ ] **Step 5: Commit**

```bash
git add src/jazz/attachments.ts tests/unit/jazz/attachments.test.ts
git commit -m "feat(jazz): add uploadAttachment primitive with 5MB cap"
```

---

### Task 2: `setProfileAvatar` + `clearProfileAvatar`

**Files:**
- Create: `src/jazz/avatar.ts`
- Test: `tests/unit/jazz/avatar.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/jazz/avatar.test.ts
import { describe, it, expect } from "vitest";
import { createJazzTestAccount } from "jazz-tools/testing";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { setProfileAvatar, clearProfileAvatar } from "@/jazz/avatar";
import { AttachmentTooLargeError, MAX_ATTACHMENT_BYTES } from "@/jazz/attachments";

describe("setProfileAvatar", () => {
  it("writes a FileBlob to me.profile.avatar", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
    });
    const file = new File([new Uint8Array([1, 2, 3])], "me.png", { type: "image/png" });

    await setProfileAvatar(me as any, file);

    expect((me as any).profile.avatar).toBeDefined();
    expect((me as any).profile.avatar.mimeType).toBe("image/png");
    expect((me as any).profile.avatar.size).toBe(3);
  });

  it("replaces an existing avatar on second call", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
    });
    const first = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    const second = new File([new Uint8Array([2, 2])], "b.png", { type: "image/png" });

    await setProfileAvatar(me as any, first);
    await setProfileAvatar(me as any, second);

    expect((me as any).profile.avatar.size).toBe(2);
    expect((me as any).profile.avatar.filename).toBe("b.png");
  });

  it("rejects oversized files via AttachmentTooLargeError", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
    });
    const oversized = new File(
      [new Uint8Array(MAX_ATTACHMENT_BYTES + 1)],
      "big.png",
      { type: "image/png" },
    );

    await expect(setProfileAvatar(me as any, oversized)).rejects.toBeInstanceOf(
      AttachmentTooLargeError,
    );
  });
});

describe("clearProfileAvatar", () => {
  it("removes me.profile.avatar so the field becomes undefined", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
    });
    const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    await setProfileAvatar(me as any, file);
    expect((me as any).profile.avatar).toBeDefined();

    await clearProfileAvatar(me as any);

    expect((me as any).profile.avatar).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- avatar.test`
Expected: FAIL — "Cannot find module '@/jazz/avatar'"

- [ ] **Step 3: Create the module**

```ts
// src/jazz/avatar.ts
import type { Account, Group } from "jazz-tools";
import { uploadAttachment } from "@/jazz/attachments";

/**
 * Set the user's profile avatar. Replaces any prior avatar.
 *
 * Owner of the new FileBlob is the profile's owning group (= the account's
 * profile group). Prior FileBlob CoValues become unreferenced — same caveat
 * as deleted-message attachments (see NOX-21).
 */
export async function setProfileAvatar(me: Account, file: File): Promise<void> {
  const profileGroup = (me as any).profile.$jazz.owner as Group;
  const blob = await uploadAttachment(profileGroup, file);
  (me as any).profile.$jazz.set("avatar", blob);
}

/**
 * Remove the user's profile avatar. The prior FileBlob remains in storage
 * (Jazz append-only); the field is just cleared from the current view.
 */
export async function clearProfileAvatar(me: Account): Promise<void> {
  (me as any).profile.$jazz.delete("avatar");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- avatar.test`
Expected: PASS — 4/4

- [ ] **Step 5: Commit**

```bash
git add src/jazz/avatar.ts tests/unit/jazz/avatar.test.ts
git commit -m "feat(jazz): add setProfileAvatar + clearProfileAvatar primitives"
```

---

### Task 3: Extend `sendMessage` to accept attachments

**Files:**
- Modify: `src/jazz/messages.ts`
- Modify: `tests/unit/jazz/messages.test.ts` (extend)

- [ ] **Step 1: Add the failing test**

Append to `tests/unit/jazz/messages.test.ts`:

```ts
import { uploadAttachment } from "@/jazz/attachments";

describe("sendMessage with attachments", () => {
  it("attaches a FileBlob to the new Message", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(alice, bob);

    const conversationGroup = Group.create({ owner: alice });
    conversationGroup.addMember(bob, "admin");
    const conversation = Conversation.create(
      {
        createdAt: new Date(),
        createdBy: alice.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
        systemEvents: co.list(SystemEvent).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );
    alice.root.knownConversations.$jazz.push(conversation);

    // Author's WriteGroup is created by ensureMyWriteGroup on first send.
    // For the test, we upload directly via a fresh WriteGroup to mimic the flow:
    const writeGroup = Group.create({ owner: alice });
    writeGroup.addMember(conversationGroup, "reader");
    const file = new File([new Uint8Array([1, 2, 3])], "hi.png", { type: "image/png" });
    const attachment = await uploadAttachment(writeGroup, file);

    const message = await sendMessage(alice as any, conversation, "look", [attachment]);

    expect((message as any).body).toBe("look");
    expect(Array.from((message as any).attachments).length).toBe(1);
    expect(((message as any).attachments[0] as any).filename).toBe("hi.png");
  });

  it("accepts an empty attachments array (backward compatible)", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const conversationGroup = Group.create({ owner: alice });
    const conversation = Conversation.create(
      {
        createdAt: new Date(),
        createdBy: alice.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
        systemEvents: co.list(SystemEvent).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );
    (alice as any).root.knownConversations.$jazz.push(conversation);

    const message = await sendMessage(alice as any, conversation, "no files");

    expect((message as any).body).toBe("no files");
    expect(Array.from((message as any).attachments).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm test -- messages.test`
Expected: FAIL — "sendMessage" signature doesn't accept attachments

- [ ] **Step 3: Update `sendMessage` signature + body**

Modify `src/jazz/messages.ts` `sendMessage`:

```ts
import type { FileBlob as FileBlobSchema } from "@/jazz/schema/FileBlob";
// (if FileBlob isn't already imported as a type — keep the value import for runtime)

/**
 * Send a new message in a conversation.
 *
 * Ensures the sender has a WriteGroup in the conversation (self-create on first
 * send), then creates a Message CoValue owned by that WriteGroup, attaches the
 * given FileBlobs (which the caller has already uploaded via uploadAttachment),
 * and appends a ref to conversation.messages.
 */
export async function sendMessage(
  me: Account,
  conversation: any,
  body: string,
  attachments: Array<any> = [],
): Promise<any> {
  if (!_ensureMyWriteGroup) {
    const mod = await import("@/jazz/conversation");
    _ensureMyWriteGroup = mod.ensureMyWriteGroup;
  }
  const myWriteGroup = await _ensureMyWriteGroup(me, conversation);
  const attachmentsList = co.list(FileBlob).create(attachments, {
    owner: myWriteGroup,
  });
  const message = Message.create(
    {
      sentAt: new Date(),
      body,
      attachments: attachmentsList,
    },
    { owner: myWriteGroup },
  );
  conversation.messages.$jazz.push(message);
  return message;
}
```

- [ ] **Step 4: Run all unit tests to verify**

Run: `npm test`
Expected: PASS — all existing tests still pass + 2 new ones

- [ ] **Step 5: Commit**

```bash
git add src/jazz/messages.ts tests/unit/jazz/messages.test.ts
git commit -m "feat(jazz): sendMessage accepts attachments array"
```

---

### Task 4: E2E fixtures

**Files:**
- Create: `tests/e2e/fixtures/tiny.png` (~2KB PNG, magic bytes preserved)
- Create: `tests/e2e/fixtures/tiny.pdf` (~2KB PDF)
- Create: `tests/e2e/fixtures/oversized.bin` (6 MB random bytes)

- [ ] **Step 1: Create the PNG and PDF fixtures**

Run (creates a 100x100 red PNG):
```bash
mkdir -p tests/e2e/fixtures
python3 -c "
import struct, zlib
def png_chunk(t, d):
    return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
sig = b'\\x89PNG\\r\\n\\x1a\\n'
ihdr = struct.pack('>IIBBBBB', 100, 100, 8, 2, 0, 0, 0)
raw = b''.join(b'\\x00' + b'\\xff\\x00\\x00' * 100 for _ in range(100))
idat = zlib.compress(raw)
data = sig + png_chunk(b'IHDR', ihdr) + png_chunk(b'IDAT', idat) + png_chunk(b'IEND', b'')
open('tests/e2e/fixtures/tiny.png', 'wb').write(data)
"
```

Then the PDF (minimal valid PDF):
```bash
python3 -c "
pdf = b'%PDF-1.4\\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj xref\\n0 4\\n0000000000 65535 f \\n0000000009 00000 n \\n0000000053 00000 n \\n0000000098 00000 n \\ntrailer<</Size 4/Root 1 0 R>>\\nstartxref\\n149\\n%%EOF'
open('tests/e2e/fixtures/tiny.pdf', 'wb').write(pdf)
"
```

- [ ] **Step 2: Create the oversized fixture**

```bash
dd if=/dev/urandom of=tests/e2e/fixtures/oversized.bin bs=1M count=6
```

- [ ] **Step 3: Verify sizes are sane**

Run: `ls -la tests/e2e/fixtures/`
Expected:
- `tiny.png` ≤ 5KB
- `tiny.pdf` ≤ 1KB
- `oversized.bin` = 6_291_456 bytes (6×1024×1024)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/fixtures/
git commit -m "test(e2e): add file fixtures for attachment tests"
```

---

## Phase B — UI components

### Task 5: `<Avatar>` round-container component

**Files:**
- Create: `src/components/avatar.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/avatar.tsx
import { useEffect, useState } from "react";
import { co } from "jazz-tools";

interface AvatarProps {
  /**
   * Loaded FileBlob (e.g. me.profile.avatar). When null/undefined the avatar
   * falls back to rendering the initials over a tinted background.
   */
  src?: any | null;
  /** 1-2 letter fallback when src is absent or still loading. */
  initials: string;
  /** "sm" = 32px (sidebar), "md" = 40px (members/contacts), "lg" = 96px (settings). */
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Optional aria-label override; defaults to "<initials> avatar". */
  ariaLabel?: string;
  /** When this account loads files, used by FileStream.loadAsBlob. Pass `me`. */
  loadAs?: any;
  "data-testid"?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-24 h-24 text-2xl",
};

export function Avatar({
  src,
  initials,
  size = "md",
  className,
  ariaLabel,
  loadAs,
  "data-testid": testId,
}: AvatarProps) {
  const [url, setUrl] = useState<string | null>(null);

  // Load the avatar's FileStream as a Blob → object URL. Re-runs whenever
  // the underlying FileStream ID changes (e.g. user uploads a new avatar).
  const streamID = src?.data?.$jazz?.id ?? null;

  useEffect(() => {
    if (!streamID || !loadAs) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;

    void (async () => {
      try {
        const blob = await co.fileStream().loadAsBlob(streamID, { loadAs });
        if (cancelled || !blob) return;
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
      } catch {
        // Silent — falls back to initials
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [streamID, loadAs]);

  const label = (initials || "?").slice(0, 2).toUpperCase();
  const sizeClasses = SIZE_CLASSES[size];

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? `${label} avatar`}
      data-testid={testId}
      className={`rounded-full bg-primary/10 flex items-center justify-center font-medium text-primary flex-shrink-0 overflow-hidden ${sizeClasses} ${className ?? ""}`}
    >
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span>{label}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/avatar.tsx
git commit -m "feat(ui): add <Avatar> primitive with blob-URL lifecycle"
```

---

### Task 6: `<AttachmentTile>` two-mode tile

**Files:**
- Create: `src/components/attachment-tile.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/attachment-tile.tsx
import { useEffect, useState } from "react";
import { co } from "jazz-tools";

interface AttachmentTileProps {
  attachment: any;          // FileBlob (loaded)
  mode: "pending" | "sent";
  loadAs?: any;             // pass me; required to load the FileStream as a Blob
  onRemove?: () => void;    // only for "pending"
  onImageClick?: () => void; // only for "sent" + image mimeType; opens lightbox
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function AttachmentTile({
  attachment,
  mode,
  loadAs,
  onRemove,
  onImageClick,
}: AttachmentTileProps) {
  const mimeType = attachment?.mimeType ?? "";
  const filename = attachment?.filename ?? "file";
  const size = attachment?.size ?? 0;
  const streamID = attachment?.data?.$jazz?.id ?? null;

  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!streamID || !loadAs || !isImage(mimeType)) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    void (async () => {
      try {
        const blob = await co.fileStream().loadAsBlob(streamID, { loadAs });
        if (cancelled || !blob) return;
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
      } catch {
        // ignored
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [streamID, loadAs, mimeType]);

  // Image tile
  if (isImage(mimeType)) {
    if (mode === "pending") {
      return (
        <div
          className="relative w-20 h-20 rounded border border-border overflow-hidden bg-muted"
          data-testid="attachment-tile-pending-image"
        >
          {url ? (
            <img src={url} alt={filename} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
              …
            </div>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${filename}`}
              data-testid="attachment-tile-remove"
              className="absolute top-0 right-0 bg-black/60 text-white text-xs w-5 h-5 flex items-center justify-center rounded-bl"
            >
              ×
            </button>
          )}
        </div>
      );
    }
    // sent
    return (
      <button
        type="button"
        onClick={onImageClick}
        className="block max-w-xs"
        data-testid="attachment-tile-sent-image"
        aria-label={`Open ${filename}`}
      >
        {url ? (
          <img
            src={url}
            alt={filename}
            className="rounded max-w-full max-h-48 object-contain border border-border"
            style={{ maxWidth: 280, maxHeight: 200 }}
          />
        ) : (
          <div className="w-48 h-32 flex items-center justify-center bg-muted text-xs text-muted-foreground rounded">
            Loading image…
          </div>
        )}
      </button>
    );
  }

  // File tile
  if (mode === "pending") {
    return (
      <div
        className="flex items-center gap-2 px-2 py-1 border border-border rounded bg-muted/30 text-xs"
        data-testid="attachment-tile-pending-file"
      >
        <span aria-hidden>📄</span>
        <span className="truncate max-w-[140px]">{filename}</span>
        <span className="text-muted-foreground">{formatSize(size)}</span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${filename}`}
            data-testid="attachment-tile-remove"
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  // sent file → download via a hidden <a>
  async function handleDownload() {
    if (!streamID || !loadAs) return;
    const blob = await co.fileStream().loadAsBlob(streamID, { loadAs });
    if (!blob) return;
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(dlUrl);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex items-center gap-2 px-3 py-2 rounded border border-border bg-muted/30 text-sm hover:bg-muted"
      data-testid="attachment-tile-sent-file"
      aria-label={`Download ${filename}`}
    >
      <span aria-hidden className="text-lg">📄</span>
      <span className="flex flex-col text-left">
        <span className="truncate max-w-[180px]">{filename}</span>
        <span className="text-xs text-muted-foreground">{formatSize(size)}</span>
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/attachment-tile.tsx
git commit -m "feat(ui): add <AttachmentTile> with pending and sent modes"
```

---

### Task 7: `<ImageLightbox>` overlay

**Files:**
- Create: `src/components/image-lightbox.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/image-lightbox.tsx
import { useEffect } from "react";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="image-lightbox"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image"
        data-testid="image-lightbox-close"
        className="absolute top-4 right-4 text-white text-2xl bg-black/40 rounded w-10 h-10 flex items-center justify-center"
      >
        ×
      </button>
      <img
        src={src}
        alt={alt ?? ""}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[95vw] max-h-[95vh] object-contain"
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/image-lightbox.tsx
git commit -m "feat(ui): add <ImageLightbox> overlay"
```

---

### Task 8: `<ComposerAttachmentTray>`

**Files:**
- Create: `src/components/composer-attachment-tray.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/composer-attachment-tray.tsx
import { useEffect, useState } from "react";

export interface PendingAttachment {
  tempId: string;
  file: File;
}

interface ComposerAttachmentTrayProps {
  pending: PendingAttachment[];
  onRemove: (tempId: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function PendingPreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/")) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  if (file.type.startsWith("image/") && url) {
    return <img src={url} alt={file.name} className="w-full h-full object-cover" />;
  }
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-xs">
      <span aria-hidden className="text-lg">📄</span>
      <span className="text-muted-foreground">{formatSize(file.size)}</span>
    </div>
  );
}

export function ComposerAttachmentTray({
  pending,
  onRemove,
}: ComposerAttachmentTrayProps) {
  if (pending.length === 0) return null;

  return (
    <div
      className="flex gap-2 px-3 py-2 border-t border-border overflow-x-auto"
      data-testid="composer-attachment-tray"
    >
      {pending.map((p) => (
        <div
          key={p.tempId}
          className="relative w-20 h-20 rounded border border-border overflow-hidden bg-muted"
          data-testid="composer-attachment-tray-item"
        >
          <PendingPreview file={p.file} />
          <button
            type="button"
            onClick={() => onRemove(p.tempId)}
            aria-label={`Remove ${p.file.name}`}
            data-testid="composer-attachment-tray-remove"
            className="absolute top-0 right-0 bg-black/60 text-white text-xs w-5 h-5 flex items-center justify-center rounded-bl"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/composer-attachment-tray.tsx
git commit -m "feat(ui): add <ComposerAttachmentTray> for pending attachments"
```

---

### Task 9: Rewrite `composer.tsx` with paperclip + paste + tray-aware send

**Files:**
- Modify: `src/components/composer.tsx`

- [ ] **Step 1: Rewrite the Composer**

Replace the entire file:

```tsx
// src/components/composer.tsx
import { useRef, useState, KeyboardEvent, ClipboardEvent, ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  ComposerAttachmentTray,
  PendingAttachment,
} from "@/components/composer-attachment-tray";
import {
  uploadAttachment,
  AttachmentTooLargeError,
  MAX_ATTACHMENT_BYTES,
} from "@/jazz/attachments";
import type { Group } from "jazz-tools";

interface ComposerProps {
  /**
   * Called by the composer when the user hits Send. Body may be empty if
   * `attachments` is non-empty. The Composer awaits this promise (blocking
   * "Sending…" state) before resetting its text + tray.
   */
  onSend: (body: string, attachments: any[]) => void | Promise<void>;
  /**
   * Per-send WriteGroup factory. The Composer asks for this fresh each send
   * so the caller (detail.tsx) can ensure-then-pass the author's WriteGroup
   * for FileBlob ownership.
   */
  getWriteGroup: () => Promise<Group>;
  disabled?: boolean;
  placeholder?: string;
}

let tempIdCounter = 0;
function nextTempId(): string {
  tempIdCounter += 1;
  return `pending-${tempIdCounter}-${Date.now()}`;
}

function isAcceptablePick(file: File): { ok: true } | { ok: false; reason: string } {
  if (file.size === 0) return { ok: false, reason: `${file.name} is empty.` };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      reason: `${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB. Max 5 MB per attachment.`,
    };
  }
  return { ok: true };
}

export function Composer({
  onSend,
  getWriteGroup,
  disabled = false,
  placeholder = "Type a message…",
}: ComposerProps) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function showError(msg: string) {
    setError(msg);
    window.setTimeout(() => setError((prev) => (prev === msg ? null : prev)), 4000);
  }

  function ingestFiles(files: FileList | File[]) {
    const accepted: PendingAttachment[] = [];
    const rejections: string[] = [];
    for (const f of Array.from(files)) {
      const verdict = isAcceptablePick(f);
      if (verdict.ok) {
        accepted.push({ tempId: nextTempId(), file: f });
      } else {
        rejections.push(verdict.reason);
      }
    }
    if (accepted.length > 0) {
      setPending((prev) => [...prev, ...accepted]);
    }
    if (rejections.length > 0) {
      showError(rejections.join(" "));
    }
  }

  function handlePickClick() {
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) ingestFiles(e.target.files);
    e.target.value = ""; // reset so re-picking the same file fires onChange
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      // Only intercept if there are non-empty files; let text paste fall through
      const realFiles = Array.from(files).filter((f) => f.size > 0);
      if (realFiles.length > 0) {
        e.preventDefault();
        ingestFiles(realFiles);
      }
    }
  }

  function handleRemove(tempId: string) {
    setPending((prev) => prev.filter((p) => p.tempId !== tempId));
  }

  async function handleSend() {
    if (sending || disabled) return;
    const trimmed = text.trim();
    if (!trimmed && pending.length === 0) return;

    setSending(true);
    try {
      let uploaded: any[] = [];
      if (pending.length > 0) {
        const writeGroup = await getWriteGroup();
        const blobs: any[] = [];
        for (const p of pending) {
          try {
            const blob = await uploadAttachment(writeGroup, p.file);
            blobs.push(blob);
          } catch (err) {
            if (err instanceof AttachmentTooLargeError) {
              showError(err.message);
            } else {
              showError(`Sending failed — try again.`);
            }
            return; // keep tray + text intact for retry
          }
        }
        uploaded = blobs;
      }
      await onSend(trimmed, uploaded);
      setText("");
      setPending([]);
      setError(null);
    } catch {
      showError("Sending failed — try again.");
    } finally {
      setSending(false);
    }
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const sendEnabled =
    !disabled && !sending && (text.trim().length > 0 || pending.length > 0);

  return (
    <div className="border-t border-border" data-testid="composer">
      <ComposerAttachmentTray pending={pending} onRemove={handleRemove} />
      {error && (
        <div
          className="px-3 py-2 bg-red-50 text-xs text-red-700"
          data-testid="composer-error"
        >
          {error}
        </div>
      )}
      <div className="flex gap-2 p-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
          data-testid="composer-file-input"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePickClick}
          disabled={disabled || sending}
          aria-label="Add attachment"
          data-testid="composer-attach-btn"
        >
          📎
        </Button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          onPaste={handlePaste}
          disabled={disabled || sending}
          placeholder={disabled ? "No one else is in this chat" : placeholder}
          rows={2}
          className="flex-1 resize-none rounded border bg-background p-2 text-sm"
          data-testid="composer-input"
        />
        <Button
          onClick={handleSend}
          disabled={!sendEnabled}
          data-testid="composer-send-btn"
        >
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update the only caller — `src/routes/conversations/detail.tsx`**

The Composer now needs `onSend` and `getWriteGroup`. Update the call site:

```tsx
// In src/routes/conversations/detail.tsx, replace the existing handleSend + Composer
// usage:

import { ensureMyWriteGroup } from "@/jazz/conversation";

// (inside the component, after the other handlers)

async function handleSend(body: string, attachments: any[]) {
  await sendMessage(me, conversation, body, attachments);
}

async function handleGetWriteGroup() {
  return ensureMyWriteGroup(me, conversation);
}

// ...later, where <Composer onSend={handleSend} disabled={composerDisabled} /> is:

<Composer
  onSend={handleSend}
  getWriteGroup={handleGetWriteGroup}
  disabled={composerDisabled}
/>
```

- [ ] **Step 3: Run unit tests + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS / clean

- [ ] **Step 4: Commit**

```bash
git add src/components/composer.tsx src/routes/conversations/detail.tsx
git commit -m "feat(ui): rewrite Composer around paperclip + paste + tray"
```

---

## Phase C — Surface integration + e2e

### Task 10: `MessageBubble` attachment render + avatar gutter

**Files:**
- Modify: `src/components/message-bubble.tsx`

- [ ] **Step 1: Add the attachment render below the body**

Modify `MessageBubble.tsx`. Add to the imports:

```tsx
import { AttachmentTile } from "@/components/attachment-tile";
import { ImageLightbox } from "@/components/image-lightbox";
import { Avatar } from "@/components/avatar";
import { resolveAvatarFileBlob } from "@/jazz/avatarResolver";
```

(`resolveAvatarFileBlob` is added in Task 12. For now, write `MessageBubble` to import it; `tsc` will fail on Task 10 until Task 12 lands. If you'd rather not have a transient failure, do Task 12 first.)

Update the props shape to include the conversation's owning Group (for the avatar resolver):

```tsx
interface MessageBubbleProps {
  message: any;
  authorAccountID: string | null;
  authorDisplayName: string;
  isMine: boolean;
  me: any;
  group?: any; // ConversationGroup, for avatar resolution
}
```

Inside the render (after the existing body / before `menuOpen`), add the attachment block. Replace the bubble render with:

```tsx
const attachments = Array.from((message as any).attachments ?? []);
const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

async function openLightbox(att: any) {
  const id = att?.data?.$jazz?.id;
  if (!id) return;
  const blob = await co.fileStream().loadAsBlob(id, { loadAs: me });
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  setLightboxSrc(url);
}

function closeLightbox() {
  if (lightboxSrc) URL.revokeObjectURL(lightboxSrc);
  setLightboxSrc(null);
}

const authorAvatar = authorAccountID
  ? resolveAvatarFileBlob({ accountID: authorAccountID, me, group })
  : undefined;
```

Wrap the existing bubble in a flex row with the avatar gutter on the left (other) or right (mine):

```tsx
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
      {/* existing header div with name + time + menu button */}

      {editing ? (
        // existing edit textarea + buttons
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

      {/* existing menuOpen block */}
    </div>

    {lightboxSrc && (
      <ImageLightbox src={lightboxSrc} onClose={closeLightbox} />
    )}
  </div>
);
```

Add `import { co } from "jazz-tools";` at the top.

Update the deleted branch to also show the avatar gutter (for layout consistency):

```tsx
if (message.deleted) {
  return (
    <div
      className={`px-3 py-2 italic text-sm text-muted-foreground flex gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}
      data-testid="message-deleted"
    >
      <Avatar
        src={authorAccountID ? resolveAvatarFileBlob({ accountID: authorAccountID, me, group }) : undefined}
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
```

- [ ] **Step 2: Update the caller (`detail.tsx`) to pass `group`**

In `src/routes/conversations/detail.tsx`, the existing `MessageBubble` invocation already has access to `conversationGroup`. Add `group={conversationGroup}` to the props.

- [ ] **Step 3: Run typecheck + unit tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS (after Task 12 lands; sequence Tasks 12 → 10 if running strictly TDD-style)

- [ ] **Step 4: Commit**

```bash
git add src/components/message-bubble.tsx src/routes/conversations/detail.tsx
git commit -m "feat(ui): MessageBubble renders attachments + avatar gutter"
```

---

### Task 11: Settings — Profile-picture upload row

**Files:**
- Modify: `src/routes/settings/profile-section.tsx`

- [ ] **Step 1: Rewrite the section**

```tsx
// src/routes/settings/profile-section.tsx
import { useRef, useState, ChangeEvent } from "react";
import { useAccount } from "jazz-tools/react";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { setProfileAvatar, clearProfileAvatar } from "@/jazz/avatar";
import { AttachmentTooLargeError, MAX_ATTACHMENT_BYTES } from "@/jazz/attachments";

export function ProfileSection() {
  const me = useAccount(JazzMessangerAccount, {
    resolve: { profile: true },
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me.$isLoaded) {
    return (
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-2">Profile</h2>
        <p className="text-sm text-gray-400">Loading…</p>
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
      <h2 className="text-base font-semibold text-gray-800 mb-2">Profile</h2>
      <div className="bg-white rounded border border-gray-200 px-4 py-3 flex flex-col gap-3">
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
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500 mb-1">Display name</p>
          <p
            data-testid="settings-display-name"
            className="text-sm font-medium text-gray-800"
          >
            {(me as any).profile.displayName}
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/settings/profile-section.tsx
git commit -m "feat(ui): profile-picture upload + remove in settings"
```

---

### Task 12: `resolveAvatarFileBlob` helper

**Files:**
- Create: `src/jazz/avatarResolver.ts`

- [ ] **Step 1: Add the helper**

```ts
// src/jazz/avatarResolver.ts
/**
 * Resolve the FileBlob for an account's avatar, mirroring resolveDisplayName.
 *
 * Lookup chain:
 *   1. Self (me): me.profile.avatar
 *   2. contactBook entry: contact's referenced Account → profile.avatar
 *   3. group direct member: member.account → profile.avatar
 *   4. undefined → caller's <Avatar> falls back to initials
 */
export function resolveAvatarFileBlob(args: {
  accountID: string;
  me: any;
  group?: any;
}): any | undefined {
  const { accountID, me, group } = args;

  // Self
  if ((me as any)?.$jazz?.id === accountID) {
    return (me as any)?.profile?.avatar ?? undefined;
  }

  // Contact book
  const contactBook = (me as any)?.root?.contactBook;
  if (contactBook) {
    for (const contact of contactBook as Iterable<any>) {
      if (contact?.contactAccountID === accountID) {
        // contact.$jazz.owner is a Group; the contact's Account is on the
        // group's direct-members. Try the explicit ref path:
        const accountRef = contact?.$jazz?.refs?.account;
        if (accountRef && accountRef?.profile?.avatar) {
          return accountRef.profile.avatar;
        }
        break;
      }
    }
  }

  // Group direct member
  if (group) {
    try {
      const members = group.getDirectMembers() as any[];
      for (const m of members) {
        if (m?.account?.$jazz?.id === accountID) {
          const avatar = m?.account?.profile?.avatar;
          if (avatar) return avatar;
        }
      }
    } catch {
      // ignored
    }
  }

  return undefined;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/jazz/avatarResolver.ts
git commit -m "feat(jazz): add resolveAvatarFileBlob helper"
```

---

### Task 13: Sidebar header — Avatar next to display name

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Add the avatar to the header**

In `src/components/sidebar.tsx`, import `<Avatar>`:

```tsx
import { Avatar } from "@/components/avatar";
```

Replace the existing header `<div>` with:

```tsx
<div className="p-4 border-b border-gray-200 flex items-center justify-between gap-2">
  <div className="flex items-center gap-2 min-w-0">
    <Avatar
      src={(me as any).profile.avatar}
      initials={me.profile.displayName?.[0] ?? "?"}
      size="sm"
      loadAs={me}
      data-testid="sidebar-avatar"
    />
    <span
      data-testid="sidebar-display-name"
      className="font-semibold text-gray-800 truncate"
    >
      {me.profile.displayName}
    </span>
  </div>
  <Button
    size="sm"
    variant="outline"
    onClick={() => setPickerOpen(true)}
    data-testid="new-chat-btn"
    className="flex-shrink-0"
    title="New chat"
  >
    +
  </Button>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(ui): avatar in sidebar header"
```

---

### Task 14: Members route — Replace initials with `<Avatar>`

**Files:**
- Modify: `src/routes/conversations/members.tsx`

- [ ] **Step 1: Swap the initial-circle for `<Avatar>`**

In `members.tsx`, add imports:

```tsx
import { Avatar } from "@/components/avatar";
import { resolveAvatarFileBlob } from "@/jazz/avatarResolver";
```

Replace the existing avatar `<div>` inside the members map. Find:

```tsx
{/* Avatar initial */}
<div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary flex-shrink-0">
  {member.displayName[0]?.toUpperCase() ?? "?"}
</div>
```

Replace with:

```tsx
<Avatar
  src={resolveAvatarFileBlob({ accountID: member.accountID, me, group })}
  initials={member.displayName[0] ?? "?"}
  size="sm"
  loadAs={me}
  data-testid={`member-avatar-${member.accountID}`}
/>
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/conversations/members.tsx
git commit -m "feat(ui): avatar in members route"
```

---

### Task 15: Contacts list + detail — Avatar swap

**Files:**
- Modify: `src/routes/contacts/index.tsx`
- Modify: `src/routes/contacts/detail.tsx`

- [ ] **Step 1: Update contacts list**

In `src/routes/contacts/index.tsx`, add imports:

```tsx
import { Avatar } from "@/components/avatar";
import { resolveAvatarFileBlob } from "@/jazz/avatarResolver";
```

Locate the contact `<li>` render. Wrap its inner content so the avatar comes before the existing display-name text. Example:

```tsx
{contacts.map((c: any, i: number) => (
  <li key={i}>
    <Link
      to={`/contacts/${c?.$jazz?.id}`}
      className="flex items-center gap-3 p-3 hover:bg-accent rounded text-sm"
      data-testid={`contacts-page-row-${i}`}
    >
      <Avatar
        src={resolveAvatarFileBlob({ accountID: c?.contactAccountID, me })}
        initials={c?.displayNameLocal?.[0] ?? "?"}
        size="md"
        loadAs={me}
      />
      <span>{c?.displayNameLocal}</span>
    </Link>
  </li>
))}
```

(Adjust to whatever the existing list shape is; preserve the existing test ID `contacts-page-row-${i}`.)

- [ ] **Step 2: Update contacts detail**

In `src/routes/contacts/detail.tsx`, add the same imports. At the top of the rendered contact view, insert an `<Avatar size="lg">` showing the contact's avatar:

```tsx
<div className="flex items-center gap-4 mb-4">
  <Avatar
    src={resolveAvatarFileBlob({ accountID: (contact as any).contactAccountID, me })}
    initials={(contact as any).displayNameLocal?.[0] ?? "?"}
    size="lg"
    loadAs={me}
  />
  <h1 className="text-xl font-semibold">
    {(contact as any).displayNameLocal}
  </h1>
</div>
```

(Locate the existing display-name `<h1>` and replace with the above flex container.)

- [ ] **Step 3: Commit**

```bash
git add src/routes/contacts/index.tsx src/routes/contacts/detail.tsx
git commit -m "feat(ui): avatars in contacts list + detail"
```

---

### Task 16: E2E — Image attachment send + lightbox

**Files:**
- Create: `tests/e2e/attachment-image.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/attachment-image.spec.ts
import path from "node:path";
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

const PNG = path.resolve(__dirname, "fixtures/tiny.png");

test("image attachment: Alice sends a PNG, Bob sees it + lightbox opens", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();

  try {
    await pageA.goto("/");
    await createAccount(pageA, "Alice");
    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    // Establish contact
    await pageB.goto("/contacts/add");
    await expect(pageB.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
    const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();
    await pageA.goto(inviteUrl);
    await pageA.getByTestId("invite-accept-btn").click();
    await expect(pageA.getByTestId("invite-accepted")).toBeVisible({ timeout: 10_000 });
    await expect(pageB.getByTestId("add-contact-accepted")).toBeVisible({ timeout: 15_000 });

    // Start chat
    await pageA.goto("/contacts");
    await pageA.getByTestId("contacts-page-row-0").click();
    await pageA.getByTestId("start-chat-btn").click();
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });

    // Attach + send
    await pageA.setInputFiles('[data-testid="composer-file-input"]', PNG);
    await expect(
      pageA.getByTestId("composer-attachment-tray-item"),
    ).toHaveCount(1);
    await pageA.getByTestId("composer-send-btn").click();

    // Bob sees the image
    const aliceConvUrl = pageA.url();
    await pageB.goto(aliceConvUrl);
    await expect(pageB.getByTestId("conversation-detail")).toBeVisible({ timeout: 15_000 });
    await expect(
      pageB.getByTestId("attachment-tile-sent-image").first(),
    ).toBeVisible({ timeout: 15_000 });

    // Open lightbox in Bob's view
    await pageB.getByTestId("attachment-tile-sent-image").first().click();
    await expect(pageB.getByTestId("image-lightbox")).toBeVisible();
    await pageB.getByTestId("image-lightbox-close").click();
    await expect(pageB.getByTestId("image-lightbox")).not.toBeVisible();
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/attachment-image.spec.ts
git commit -m "test(e2e): image attachment + lightbox"
```

---

### Task 17: E2E — File-tile + multiple + paste + too-large

**Files:**
- Create: `tests/e2e/attachment-file.spec.ts`
- Create: `tests/e2e/attachment-multiple.spec.ts`
- Create: `tests/e2e/attachment-paste.spec.ts`
- Create: `tests/e2e/attachment-too-large.spec.ts`

- [ ] **Step 1: file-tile spec**

```ts
// tests/e2e/attachment-file.spec.ts
import path from "node:path";
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

const PDF = path.resolve(__dirname, "fixtures/tiny.pdf");

test("non-image attachment renders as a file tile in Bob's bubble", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();

  try {
    await pageA.goto("/");
    await createAccount(pageA, "Alice");
    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    await pageB.goto("/contacts/add");
    await expect(pageB.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
    const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();
    await pageA.goto(inviteUrl);
    await pageA.getByTestId("invite-accept-btn").click();
    await expect(pageA.getByTestId("invite-accepted")).toBeVisible({ timeout: 10_000 });
    await expect(pageB.getByTestId("add-contact-accepted")).toBeVisible({ timeout: 15_000 });

    await pageA.goto("/contacts");
    await pageA.getByTestId("contacts-page-row-0").click();
    await pageA.getByTestId("start-chat-btn").click();
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });

    await pageA.setInputFiles('[data-testid="composer-file-input"]', PDF);
    await pageA.getByTestId("composer-send-btn").click();

    const aliceConvUrl = pageA.url();
    await pageB.goto(aliceConvUrl);
    await expect(pageB.getByTestId("attachment-tile-sent-file")).toBeVisible({
      timeout: 15_000,
    });
    await expect(pageB.getByTestId("attachment-tile-sent-file")).toContainText("tiny.pdf");
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
```

- [ ] **Step 2: multiple-attachments spec**

```ts
// tests/e2e/attachment-multiple.spec.ts
import path from "node:path";
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

const PNG = path.resolve(__dirname, "fixtures/tiny.png");
const PDF = path.resolve(__dirname, "fixtures/tiny.pdf");

test("multiple attachments in one message", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();

  try {
    await pageA.goto("/");
    await createAccount(pageA, "Alice");
    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    await pageB.goto("/contacts/add");
    await expect(pageB.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
    const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();
    await pageA.goto(inviteUrl);
    await pageA.getByTestId("invite-accept-btn").click();
    await expect(pageA.getByTestId("invite-accepted")).toBeVisible({ timeout: 10_000 });
    await expect(pageB.getByTestId("add-contact-accepted")).toBeVisible({ timeout: 15_000 });

    await pageA.goto("/contacts");
    await pageA.getByTestId("contacts-page-row-0").click();
    await pageA.getByTestId("start-chat-btn").click();
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });

    await pageA.setInputFiles('[data-testid="composer-file-input"]', [PNG, PDF]);
    await expect(pageA.getByTestId("composer-attachment-tray-item")).toHaveCount(2);
    await pageA.getByTestId("composer-send-btn").click();

    const aliceConvUrl = pageA.url();
    await pageB.goto(aliceConvUrl);
    await expect(pageB.getByTestId("conversation-detail")).toBeVisible({ timeout: 15_000 });
    await expect(pageB.getByTestId("attachment-tile-sent-image").first()).toBeVisible({ timeout: 15_000 });
    await expect(pageB.getByTestId("attachment-tile-sent-file")).toContainText("tiny.pdf");
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
```

- [ ] **Step 3: paste spec**

```ts
// tests/e2e/attachment-paste.spec.ts
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

const PNG = path.resolve(__dirname, "fixtures/tiny.png");

test("paste an image from clipboard adds it to the tray", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();

  try {
    await pageA.goto("/");
    await createAccount(pageA, "Alice");
    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    await pageB.goto("/contacts/add");
    await expect(pageB.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
    const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();
    await pageA.goto(inviteUrl);
    await pageA.getByTestId("invite-accept-btn").click();
    await expect(pageA.getByTestId("invite-accepted")).toBeVisible({ timeout: 10_000 });
    await expect(pageB.getByTestId("add-contact-accepted")).toBeVisible({ timeout: 15_000 });

    await pageA.goto("/contacts");
    await pageA.getByTestId("contacts-page-row-0").click();
    await pageA.getByTestId("start-chat-btn").click();
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });

    // Build a ClipboardEvent in the page and dispatch on the textarea
    const pngBytes = fs.readFileSync(PNG);
    const pngB64 = pngBytes.toString("base64");

    await pageA.evaluate(async (b64) => {
      const arr = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const file = new File([arr], "pasted.png", { type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const textarea = document.querySelector('[data-testid="composer-input"]') as HTMLTextAreaElement;
      textarea.focus();
      const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
      textarea.dispatchEvent(ev);
    }, pngB64);

    await expect(pageA.getByTestId("composer-attachment-tray-item")).toHaveCount(1);
    await pageA.getByTestId("composer-send-btn").click();

    const aliceConvUrl = pageA.url();
    await pageB.goto(aliceConvUrl);
    await expect(pageB.getByTestId("attachment-tile-sent-image").first()).toBeVisible({ timeout: 15_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
```

- [ ] **Step 4: too-large spec**

```ts
// tests/e2e/attachment-too-large.spec.ts
import path from "node:path";
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

const OVERSIZED = path.resolve(__dirname, "fixtures/oversized.bin");

test("oversized files are rejected at pick time", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  try {
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    // Create a one-user "conversation" via Contacts → cannot start chat without
    // a contact. Use the new-chat picker to get to a detail page is gated.
    // Simpler: just navigate to /conversations and verify the picker route via
    // the contacts-empty path. For this test we only need a page with a
    // Composer rendered. Open settings to set up state, then start a chat with
    // a self-contact would be invalid. So this test needs two accounts:
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    await pageB.goto("/contacts/add");
    await expect(pageB.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
    const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();
    await pageA.goto(inviteUrl);
    await pageA.getByTestId("invite-accept-btn").click();
    await expect(pageA.getByTestId("invite-accepted")).toBeVisible({ timeout: 10_000 });
    await expect(pageB.getByTestId("add-contact-accepted")).toBeVisible({ timeout: 15_000 });
    await pageA.goto("/contacts");
    await pageA.getByTestId("contacts-page-row-0").click();
    await pageA.getByTestId("start-chat-btn").click();
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });

    await pageA.setInputFiles('[data-testid="composer-file-input"]', OVERSIZED);

    // Tray remains empty
    await expect(pageA.getByTestId("composer-attachment-tray-item")).toHaveCount(0);

    // Inline error appears
    await expect(pageA.getByTestId("composer-error")).toContainText("Max 5 MB");

    // Send button stays disabled (no text either)
    await expect(pageA.getByTestId("composer-send-btn")).toBeDisabled();

    await ctxB.close();
  } finally {
    await ctxA.close();
  }
});
```

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/attachment-file.spec.ts tests/e2e/attachment-multiple.spec.ts tests/e2e/attachment-paste.spec.ts tests/e2e/attachment-too-large.spec.ts
git commit -m "test(e2e): file-tile + multiple + paste + too-large attachment specs"
```

---

### Task 18: E2E — Profile avatar cross-context visibility

**Files:**
- Create: `tests/e2e/profile-avatar.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/profile-avatar.spec.ts
import path from "node:path";
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

const PNG = path.resolve(__dirname, "fixtures/tiny.png");

test("avatar uploaded in settings appears in sidebar + Bob's contacts list after sync", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();

  try {
    await pageA.goto("/");
    await createAccount(pageA, "Alice");
    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    // Establish contact (Bob invites, Alice accepts)
    await pageB.goto("/contacts/add");
    await expect(pageB.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
    const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();
    await pageA.goto(inviteUrl);
    await pageA.getByTestId("invite-accept-btn").click();
    await expect(pageA.getByTestId("invite-accepted")).toBeVisible({ timeout: 10_000 });
    await expect(pageB.getByTestId("add-contact-accepted")).toBeVisible({ timeout: 15_000 });

    // Alice uploads her avatar in settings
    await pageA.goto("/settings");
    await pageA.setInputFiles('[data-testid="settings-avatar-input"]', PNG);

    // Avatar img tag appears within the settings-avatar container
    await expect(
      pageA.getByTestId("settings-avatar").locator("img"),
    ).toBeVisible({ timeout: 10_000 });

    // Sidebar header shows the avatar img
    await pageA.goto("/conversations");
    await expect(
      pageA.getByTestId("sidebar-avatar").locator("img"),
    ).toBeVisible({ timeout: 10_000 });

    // Bob navigates to contacts and sees Alice's avatar in her contact row
    await pageB.goto("/contacts");
    await expect(pageB.getByTestId("contacts-page-list")).toContainText("Alice", {
      timeout: 15_000,
    });
    await expect(
      pageB.getByTestId("contacts-page-row-0").locator("img"),
    ).toBeVisible({ timeout: 30_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/profile-avatar.spec.ts
git commit -m "test(e2e): profile avatar cross-context visibility"
```

---

### Task 19: Regression sweep + CHANGELOG + handoff

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all unit tests pass (count is the prior 98 + new from Tasks 1–3).

```bash
npx playwright test --reporter=line
```

Expected: all e2e tests pass — prior count + 6 new specs (12 with Chromium + Firefox = +12).

- [ ] **Step 2: Append the CHANGELOG entry**

Add under `## [Unreleased]`, above the existing entries:

```markdown
### Slice 5 — Inline media + profile avatars

**Closes:** E1a §9.1 "inline media (≤5 MB)" line item; Profile.avatar UI gap.

#### Added

- `src/jazz/attachments.ts` — `uploadAttachment(owner, file)` primitive + `AttachmentTooLargeError` + `MAX_ATTACHMENT_BYTES`. Wraps `co.fileStream().createFromBlob` and wraps the resulting FileStream in a FileBlob CoMap owned by the same group as its parent.
- `src/jazz/avatar.ts` — `setProfileAvatar(me, file)` + `clearProfileAvatar(me)`. The avatar FileBlob is owned by the profile's owning group.
- `src/jazz/avatarResolver.ts` — `resolveAvatarFileBlob({ accountID, me, group? })`, mirrors `resolveDisplayName`'s lookup order.
- `<Avatar>` (`src/components/avatar.tsx`) — round container; loads the FileStream as a Blob via `co.fileStream().loadAsBlob` → object URL; revokes on unmount + on FileStream-ID change.
- `<AttachmentTile>` (`src/components/attachment-tile.tsx`) — pending vs sent modes; image vs file branches.
- `<ImageLightbox>` (`src/components/image-lightbox.tsx`) — Esc / backdrop-click / close-button dismiss.
- `<ComposerAttachmentTray>` (`src/components/composer-attachment-tray.tsx`) — pending tray above the composer textarea.
- Avatar surfaces: sidebar header, members route, contacts list, contacts detail, per-message bubble gutter (both 1:1 and groups), settings profile section (upload + Remove).

#### Changed

- `sendMessage` (`src/jazz/messages.ts`) — new optional `attachments: FileBlob[]` parameter. Empty array is the default for backward compatibility.
- `Composer` (`src/components/composer.tsx`) — paperclip button + clipboard-paste handler + pending tray + tray-aware Send. New `getWriteGroup` prop so the composer can request the author's WriteGroup at upload time. New `onSend(body, attachments)` signature.
- `MessageBubble` (`src/components/message-bubble.tsx`) — renders `<AttachmentTile mode="sent">` per attachment under the body text; new leading avatar gutter for every bubble (1:1 + group, mine + other).

#### Test coverage

- Unit: +6 tests across `tests/unit/jazz/attachments.test.ts`, `tests/unit/jazz/avatar.test.ts`, `tests/unit/jazz/messages.test.ts`.
- E2E: +6 new specs — attachment-image, attachment-file, attachment-multiple, attachment-paste, attachment-too-large, profile-avatar.
- 3 fixtures committed: `tests/e2e/fixtures/{tiny.png,tiny.pdf,oversized.bin}`.

#### Deferred

- True deletion of body / attachments (orphan-scrub + Jazz local-cache GC investigation) — tracked as **NOX-21**.
- Drag-and-drop attachment onto window.
- Optimistic send with per-attachment upload progress.
- Link / PDF / text-file previews.
- Cropping at avatar upload.
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for Slice 5"
```

- [ ] **Step 4: Hand off to finishing-a-development-branch**

Invoke `superpowers:finishing-a-development-branch` with the slice context. It will:

- Verify tests are green.
- Present the 4 finishing options.
- (For Option 1 — Merge Locally) merge `slice-5-inline-media` to `main` with `--no-ff`, tag `slice-5-complete`, push tag + main + branch.

---

## Self-review

**Spec coverage:**
- §1 schemas — no changes needed; reuse FileBlob + Profile.avatar + Message.attachments → covered.
- §2.1 `uploadAttachment` → Task 1.
- §2.2 `setProfileAvatar` / `clearProfileAvatar` → Task 2.
- §2.3 `sendMessage` extension → Task 3.
- §3.1 `<Avatar>` → Task 5.
- §3.2 `<AttachmentTile>` → Task 6.
- §3.3 `<ImageLightbox>` → Task 7.
- §3.4 `<ComposerAttachmentTray>` → Task 8.
- §3.5 Composer rewrite → Task 9.
- §4 edit/delete semantics (no behavior change; renderer hides attachments when `deleted`) → Task 10 covers via the existing `message.deleted` branch.
- §5 Avatar surfaces — settings → Task 11; sidebar → Task 13; members → Task 14; contacts → Task 15; per-message gutter (1:1 + group) → Task 10. `resolveAvatarFileBlob` → Task 12.
- §6 Validation + error handling — size cap is enforced in `uploadAttachment` (Task 1), in the Composer pick handler (Task 9), and in the settings handler (Task 11). Mixed-paste filtering (Task 9). Upload-failure surfaces in Composer (Task 9). E2E too-large coverage (Task 17).
- §7 files-touched table — matches the table at the top of this plan.
- §8 phases — Phase A = Tasks 1–4; Phase B = Tasks 5–9; Phase C = Tasks 10–19.
- §9 acceptance criteria — covered by e2e specs in Tasks 16–18 + manual verification in the regression sweep.
- §10 risks — addressed in implementation comments (Task 1, Task 5, Task 9).

**Placeholder scan:** no "TBD" / "TODO" / "fill in details" / "similar to Task N" patterns. All test code is complete.

**Type consistency:** `uploadAttachment` returns the FileBlob CoValue throughout (Tasks 1, 2, 3, 6, 9). `co.fileStream().createFromBlob` is used in Task 1 only; `co.fileStream().loadAsBlob` in Tasks 5, 6, 10 only. `<Avatar>` props consistent across Tasks 5, 11, 13, 14, 15, 10. `Composer.onSend` signature `(body, attachments)` matches between Tasks 9 and 10's caller wiring.
