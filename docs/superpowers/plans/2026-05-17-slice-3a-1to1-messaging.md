> **Historical context (added 2026-06-07):** this document was written when the project was named **jazz-messanger**. The project was renamed to **Arcan** on 2026-06-05; the app rebrand itself is captured as Unit 5 in `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md`. This file is preserved as-is for historical accuracy.
# Jazz Messanger E1a — Slice 3a: 1:1 Conversations + Messaging Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two existing-contact accounts can start a 1:1 chat, exchange messages, edit and delete their own messages, and leave the conversation cryptographically. The sidebar becomes a conversation list; contacts move to `/contacts`.

**Architecture:** All conversation machinery is generic over N participants ("1:1 is N=2"). Each participant self-creates their per-author `WriteGroup` lazily on first send. Author derivation reads the create-transaction signer (not the Group's current structure) to defeat post-hoc Group manipulation. The `Conversation.authorWriteGroups` registry from Slice 1 is removed.

**Tech Stack:** Continuing React 18 + Vite + TypeScript + Tailwind v3 + shadcn/ui + jazz-tools 0.20.18 + react-router-dom 7.x. No new npm deps.

**Slice scope:** Ends when two existing-contact accounts can start a 1:1 chat from contact detail page, send/receive messages, edit/delete their own messages, and cleanly leave (cryptographic revoke from `ConversationGroup`). The sidebar replaces its contact list with a conversation list. **Out of scope:** group conversations with 3+ members (Slice 3b), read receipts and typing (E1.1), media (Slice 4), edit-history view (deferred), "delete for me" local-only hide (deferred).

**Authoritative spec:** `docs/superpowers/specs/2026-05-17-slice-3a-1to1-messaging-design.md`
**Companion docs:** `docs/security/threat-model.md`, `docs/jazz-api-notes.md`
**Linear:** team=Nox project=jazz-messanger; NOX-9 closed by this slice's merge

---

## Important notes for the executor

1. **Read the spec first.** Sections 4, 5, 6, 7 of the design spec are the protocol-level ground truth. Where this plan differs, the spec wins.

2. **One API-discovery risk (spec §11.1):** the renderer needs `message.$jazz.createdBy` (or equivalent) — the accountID that signed the create transaction of a CoValue. If after 10-15 minutes of investigation the API path isn't clear, dispatch a focused research subagent following the Slice 1 jazz-api-notes survey template. Don't invent APIs. Likely candidates: `message.$jazz.createdBy`, `cojsonInternals.firstSigner(message)`, iteration over `message.core.transactions[0].madeBy`, or similar.

3. **Existing tests must keep passing.** After every schema change (Phase A) and after every modification to existing files, re-run `npm test` and `npm run test:e2e`. The Slice 1+2 specs cover 55 unit tests and 14 e2e tests; if any break, fix before continuing.

4. **No groups yet.** Where the plan or spec mentions group conversations, that's context for Slice 3b only. In Slice 3a, the only `findOrCreate*` entry point exposed in the UI is the 1:1 variant. The generic `createGroupConversation` helper is built but not wired into any UI.

5. **The schema change (remove `Conversation.authorWriteGroups`) is destructive but safe.** Slice 2 explicitly deferred conversation creation, so no Conversation CoValue exists in any deployment. The change is purely an in-codebase refactor of the schema definition.

---

## File structure after Slice 3a

```
src/
├── App.tsx                                  # MODIFIED — add /conversations, /contacts routes
├── auth/                                    # (unchanged)
├── components/
│   ├── composer.tsx                         # NEW — message composer (textarea + send button)
│   ├── connection-banner.tsx                # NEW — offline-status banner
│   ├── contact-picker.tsx                   # NEW — overlay for selecting a contact to chat with
│   ├── empty-state.tsx                      # (unchanged)
│   ├── message-bubble.tsx                   # NEW — single message rendering (variants for own/other/deleted/edited)
│   ├── qr-display.tsx                       # (unchanged)
│   ├── safety-number.tsx                    # (unchanged)
│   ├── sidebar.tsx                          # MODIFIED — render conversations + "+ New chat" button
│   └── ui/                                  # (shadcn primitives — add Dialog if not present)
├── jazz/
│   ├── conversation.ts                      # NEW — lifecycle primitives
│   ├── invitations.ts                       # (unchanged Slice 2)
│   ├── messages.ts                          # NEW — message lifecycle + author derivation
│   ├── pairing.ts                           # (unchanged Slice 2)
│   ├── provider.tsx                         # (unchanged)
│   └── schema/
│       ├── Conversation.ts                  # MODIFIED — remove authorWriteGroups field
│       ├── Contact.ts                       # (unchanged)
│       ├── Message.ts                       # MODIFIED — add deleted, editedAt
│       └── (other schemas unchanged)
├── lib/                                     # (unchanged)
├── main.tsx                                 # (unchanged)
└── routes/
    ├── contacts/
    │   ├── add.tsx                          # (unchanged Slice 2)
    │   ├── detail.tsx                       # MODIFIED — add "Start chat" button
    │   └── index.tsx                        # NEW — full-page contacts list
    ├── conversations/
    │   ├── detail.tsx                       # NEW — single conversation view
    │   └── index.tsx                        # NEW — conversation list route (new home)
    ├── home/
    │   └── index.tsx                        # MODIFIED — redirect to /conversations
    ├── invite/                              # (unchanged Slice 2)
    ├── onboarding/                          # (unchanged Slices 1-2)
    ├── pair/                                # (unchanged Slice 2)
    └── settings/                            # (unchanged Slices 1-2)

tests/
├── e2e/
│   ├── conversation-list-ordering.spec.ts   # NEW
│   ├── leave-conversation.spec.ts           # NEW
│   ├── messaging-1to1.spec.ts               # NEW
│   └── (existing Slice 1+2 specs unchanged)
└── unit/
    ├── jazz/
    │   ├── conversation.test.ts             # NEW
    │   ├── messages.test.ts                 # NEW
    │   └── schema/
    │       ├── Conversation.test.ts         # MODIFIED — reflect removal of authorWriteGroups
    │       ├── Message.test.ts              # MODIFIED — assert new fields exist
    │       └── (other schema tests unchanged)
    └── (other test files unchanged)
```

---

## Task list — five phases

Phases are an execution hint. Subagent-driven execution should batch Phase A (schema + small), Phase C (components), and Phase E (e2e + docs) as single subagent dispatches; Phases B and D get heavier per-phase treatment because they touch protocol + integration.

---

## Phase A — Schema changes

### Task 1: Remove `authorWriteGroups` from Conversation schema

**Files:**
- Modify: `src/jazz/schema/Conversation.ts`
- Modify: `tests/unit/jazz/schema/Conversation.test.ts`

- [ ] **Step 1: Update the schema**

Open `src/jazz/schema/Conversation.ts`. The current shape includes `authorWriteGroups: co.record(z.string(), z.string())`. Remove that field. Final:

```ts
import { co, z } from "jazz-tools";
import { Message } from "./Message";

/**
 * Conversation: a 1:1 or group chat thread.
 *
 * Author derivation does NOT use a registry — see §6.2 of the design spec.
 * Author is read from each message's create-transaction signer, validated
 * against the well-formedness of the owning WriteGroup. The previous
 * authorWriteGroups field was removed in Slice 3a because it enabled a
 * registry-poisoning impersonation attack (any conversation writer could
 * overwrite the mapping for any participant).
 */
export const Conversation = co.map({
  title: z.string().optional(),
  kind: z.enum(["dm", "group"]),
  createdAt: z.date(),
  createdBy: z.string(),
  messages: co.list(Message),
});
```

- [ ] **Step 2: Update the schema unit test**

Open `tests/unit/jazz/schema/Conversation.test.ts`. Remove any references to `authorWriteGroups`. The test should still verify the schema exports and can be referenced; the field-level assertions are minimal (TypeScript enforces shape).

If the existing test merely asserts `expect(Conversation).toBeDefined()` and `expect(typeof Conversation).toBe("function")`, no change needed beyond removing any `authorWriteGroups` mention.

- [ ] **Step 3: Run schema test**

```bash
npm test -- Conversation
```

Expected: pass.

- [ ] **Step 4: Verify full unit suite still passes**

```bash
npm test
```

Expected: all 55 pass.

- [ ] **Step 5: Commit**

```bash
git add src/jazz/schema/Conversation.ts tests/unit/jazz/schema/Conversation.test.ts
git commit -m "schema: remove Conversation.authorWriteGroups (registry-poisoning attack vector)"
```

---

### Task 2: Add `deleted` and `editedAt` to Message schema

**Files:**
- Modify: `src/jazz/schema/Message.ts`
- Modify: `tests/unit/jazz/schema/Message.test.ts`

- [ ] **Step 1: Update the schema**

Open `src/jazz/schema/Message.ts`. Add two fields:

```ts
import { co, z } from "jazz-tools";
import { FileBlob } from "./FileBlob";

/**
 * Message: a single message in a conversation.
 *
 * Authorship is structural (the message's create-transaction signer) — NOT
 * a self-declared field. See §6.2 of the Slice 3a design spec.
 *
 * Edit semantics: body is overwritten in place; `edited` flag set; `editedAt`
 * records the most recent edit time. Edit history (previous versions) is not
 * surfaced.
 *
 * Delete semantics: body is cleared (set to empty string); `deleted` flag set.
 * Body is no longer trusted; the renderer shows a "This message was deleted"
 * placeholder. Transaction-log retention is a documented threat-model property.
 */
export const Message = co.map({
  sentAt: z.date(),
  body: z.string(),
  attachments: co.list(FileBlob),
  edited: z.boolean().optional(),
  editedAt: z.date().optional(),       // NEW
  deleted: z.boolean().optional(),     // NEW
  get replyTo() {
    return Message.optional();
  },
});
```

- [ ] **Step 2: Schema test minor update if needed**

Open `tests/unit/jazz/schema/Message.test.ts`. The existing schema smoke test (`expect(Message).toBeDefined()`) still passes; no change required.

- [ ] **Step 3: Verify full unit suite still passes**

```bash
npm test
```

Expected: 55 pass.

- [ ] **Step 4: Commit**

```bash
git add src/jazz/schema/Message.ts
git commit -m "schema: add Message.deleted and Message.editedAt for soft edit/delete"
```

---

### Task 3: Smoke-test Slice 1+2 still functional after schema changes

**Files:** (none new; verification only)

- [ ] **Step 1: Run full unit suite**

```bash
npm test
```

Expected: 55 pass.

- [ ] **Step 2: Run full e2e suite**

```bash
npm run test:e2e
```

Expected: 14 pass (3 Slice 1 specs + 4 Slice 2 specs × 2 browsers).

No commit; verification only.

---

## Phase B — Protocol primitives

### Task 4: Investigate `createdBy` accessor (API discovery)

**Files:**
- Read-only investigation; may update `docs/jazz-api-notes.md` at end

The renderer needs the create-transaction signer (`message.$jazz.createdBy` or equivalent). Verify the path before writing dependent code.

- [ ] **Step 1: Inspect jazz-tools internals**

```bash
grep -rE "createdBy|firstSigner|madeBy|signerID|createdAt" node_modules/jazz-tools/dist/*.d.ts | head -50
grep -rE "createdBy|firstSigner|madeBy" node_modules/jazz-tools/dist/tools/*.d.ts | head -30
grep -rE "createdBy|firstSigner|madeBy" node_modules/cojson/dist/*.d.ts 2>/dev/null | head -30
```

- [ ] **Step 2: Read the most-promising .d.ts files**

Likely candidates:
- `node_modules/jazz-tools/dist/tools/coValues/*.d.ts`
- `node_modules/jazz-tools/dist/tools/jazzApi.d.ts`
- `node_modules/cojson/dist/coValueCore.d.ts`

Look for: a getter on `CoValueJazzApi` (the `$jazz` namespace) named `createdBy` or similar, OR a way to iterate transactions and read the first one's `madeBy`.

- [ ] **Step 3: Decision point**

If a clean public API exists (e.g., `coValue.$jazz.createdBy` returns `AccountID`):
- Document in `docs/jazz-api-notes.md` and proceed to Task 5

If the API requires cojson-internals (e.g., `cojsonInternals.firstAuthorOf(coValue)`):
- Document the calling pattern and proceed

If unclear after 15-20 minutes:
- Stop, dispatch a focused research subagent with the brief: "Find the jazz-tools 0.20.18 API path for retrieving the accountID of the agent who signed the create-transaction of a given CoValue. Append findings to docs/jazz-api-notes.md as a new section."
- Re-dispatch Task 5 once findings are committed

- [ ] **Step 4: Commit any docs updates**

If `docs/jazz-api-notes.md` was extended:
```bash
git add docs/jazz-api-notes.md
git commit -m "docs(jazz-api-notes): document createdBy / first-signer accessor for Slice 3a"
```

If no doc changes: no commit, just proceed to Task 5.

---

### Task 5: Implement `src/jazz/messages.ts` with TDD

**Files:**
- Create: `src/jazz/messages.ts`, `tests/unit/jazz/messages.test.ts`

Module exports:
- `sendMessage(me, conversation, body)`
- `editMessage(me, message, newBody)`
- `deleteMessage(me, message)`
- `getAuthorAccountIDFromMessage(message)` — reads create-transaction signer
- `isWellFormedWriteGroup(group, conversationGroup)` — validator
- `directWriterMembers(group)` and `directAdminMembers(group)` — helpers

- [ ] **Step 1: Write the failing tests**

`tests/unit/jazz/messages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createJazzTestAccount } from "jazz-tools/testing";
import { Group } from "jazz-tools";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { Conversation } from "@/jazz/schema/Conversation";
import { Message } from "@/jazz/schema/Message";
import { co } from "jazz-tools";
import {
  getAuthorAccountIDFromMessage,
  isWellFormedWriteGroup,
  directWriterMembers,
  directAdminMembers,
} from "@/jazz/messages";

describe("getAuthorAccountIDFromMessage", () => {
  it("returns the create-transaction signer accountID for a message", async () => {
    const { account: alice } = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
    });

    // Create a minimal WriteGroup and Message owned by it
    const conversationGroup = Group.create({ owner: alice });
    const writeGroup = Group.create({ owner: alice });
    // Add the conversation as parent with reader mapping (verify API)
    writeGroup.extend(conversationGroup, "reader");
    // Alice is already admin via owner; add as direct writer for invariant
    writeGroup.addMember(alice, "writer");

    const message = Message.create(
      {
        sentAt: new Date(),
        body: "hello",
        attachments: co.list(/* FileBlob */).create([], { owner: writeGroup }),
      },
      { owner: writeGroup },
    );

    const author = getAuthorAccountIDFromMessage(message);
    expect(author).toBe((alice as any).$jazz.id);
  });
});

describe("isWellFormedWriteGroup", () => {
  it("returns true for a properly-shaped WriteGroup", async () => {
    const { account: alice } = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
    });
    const conversationGroup = Group.create({ owner: alice });
    const writeGroup = Group.create({ owner: alice });
    writeGroup.extend(conversationGroup, "reader");
    writeGroup.addMember(alice, "writer");

    expect(isWellFormedWriteGroup(writeGroup, conversationGroup)).toBe(true);
  });

  it("returns false when the parent mapping is wrong", async () => {
    const { account: alice } = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
    });
    const conversationGroup = Group.create({ owner: alice });
    const wg = Group.create({ owner: alice });
    wg.extend(conversationGroup, "extend"); // wrong: should be "reader"
    wg.addMember(alice, "writer");

    expect(isWellFormedWriteGroup(wg, conversationGroup)).toBe(false);
  });

  it("returns false when there are multiple direct writers", async () => {
    const { account: alice } = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
    });
    const { account: bob } = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
    });
    const conversationGroup = Group.create({ owner: alice });
    const wg = Group.create({ owner: alice });
    wg.extend(conversationGroup, "reader");
    wg.addMember(alice, "writer");
    wg.addMember(bob, "writer");

    expect(isWellFormedWriteGroup(wg, conversationGroup)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests (expect fail)**

```bash
npm test -- messages
```

Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/jazz/messages.ts`**

```ts
import { Group, co } from "jazz-tools";
import type { Account } from "jazz-tools";
import { Message } from "@/jazz/schema/Message";
import { FileBlob } from "@/jazz/schema/FileBlob";
import { ensureMyWriteGroup } from "@/jazz/conversation";

/**
 * Send a new message in a conversation.
 *
 * Ensures the sender has a WriteGroup in the conversation (self-create on first
 * send), then creates a Message CoValue owned by that WriteGroup and appends a
 * ref to conversation.messages.
 */
export async function sendMessage(
  me: any,
  conversation: any,
  body: string,
): Promise<any> {
  const myWriteGroup = await ensureMyWriteGroup(me, conversation);
  const message = Message.create(
    {
      sentAt: new Date(),
      body,
      attachments: co.list(FileBlob).create([], { owner: myWriteGroup }),
    },
    { owner: myWriteGroup },
  );
  conversation.messages.$jazz.push(message);
  return message;
}

/**
 * Edit a message in place. The Jazz validator rejects writes from non-writers,
 * so this only succeeds when called by the message's author.
 */
export async function editMessage(
  _me: any,
  message: any,
  newBody: string,
): Promise<void> {
  message.$jazz.set("body", newBody);
  message.$jazz.set("edited", true);
  message.$jazz.set("editedAt", new Date());
}

/**
 * Soft-delete a message. Clears the body and sets the deleted flag. The
 * renderer shows a placeholder; body is no longer the source of truth.
 * Transaction-log retention is a documented threat-model property.
 */
export async function deleteMessage(_me: any, message: any): Promise<void> {
  message.$jazz.set("body", "");
  message.$jazz.set("deleted", true);
}

/**
 * Derive the accountID of the author by reading the create-transaction signer
 * of the message. This is signed bytes — immutable — not derived from the
 * Group's current shape, which could be manipulated post-hoc.
 *
 * The exact accessor depends on jazz-tools 0.20.18's API; see docs/jazz-api-notes.md.
 * Common candidates:
 *   - message.$jazz.createdBy
 *   - cojsonInternals.firstAuthorOf(message)
 * Verified during Task 4.
 */
export function getAuthorAccountIDFromMessage(message: any): string | null {
  return message?.$jazz?.createdBy ?? null;
}

/**
 * Read direct (non-inherited) member accountIDs with the given role on a Group.
 * The exact API for distinguishing direct from inherited members depends on
 * jazz-tools; if a clean accessor isn't available, the fallback is to read the
 * full member list and filter using the parent-inheritance metadata.
 */
function directMembersWithRole(group: Group, role: string): any[] {
  // Pseudocode — replace with the verified API path during implementation
  const all = (group as any).members ?? [];
  return all.filter((m: any) => m.role === role && m.isDirect === true);
}

export function directWriterMembers(group: Group): any[] {
  return directMembersWithRole(group, "writer");
}

export function directAdminMembers(group: Group): any[] {
  return directMembersWithRole(group, "admin");
}

/**
 * Validate that a Group is a properly-shaped per-author WriteGroup for the
 * given conversation. A well-formed WriteGroup has:
 *   - parent: the given conversationGroup, with mapping "reader"
 *   - exactly one direct writer member
 *   - exactly one direct admin member
 *   - direct admin === direct writer
 */
export function isWellFormedWriteGroup(
  group: Group,
  conversationGroup: Group,
): boolean {
  if (!(group instanceof Group)) return false;

  const parents = (group as any).parentExtensions?.() ?? [];
  const matchingParent = parents.find(
    (p: any) => p.group?.$jazz?.id === (conversationGroup as any).$jazz?.id,
  );
  if (!matchingParent) return false;
  if (matchingParent.role !== "reader") return false;

  const writers = directWriterMembers(group);
  if (writers.length !== 1) return false;

  const admins = directAdminMembers(group);
  if (admins.length !== 1) return false;

  if (writers[0]?.$jazz?.id !== admins[0]?.$jazz?.id) return false;

  return true;
}
```

Most of the WriteGroup-introspection code uses placeholder accessors (`(group as any).members`, `(group as any).parentExtensions()`). These need verification against the actual Jazz API during Task 4 or in this task. If accessors don't exist, dispatch a focused research subagent.

- [ ] **Step 4: Run tests (expect pass)**

```bash
npm test -- messages
```

If tests fail due to API mismatch, iterate on the accessor calls. Don't proceed until green.

- [ ] **Step 5: Commit**

```bash
git add src/jazz/messages.ts tests/unit/jazz/messages.test.ts
git commit -m "feat(jazz): messages module — send, edit, delete, signer-based author derivation"
```

---

### Task 6: Implement `src/jazz/conversation.ts` with TDD

**Files:**
- Create: `src/jazz/conversation.ts`, `tests/unit/jazz/conversation.test.ts`

Module exports:
- `findOrCreate1to1Conversation(me, contact)` — 1:1 entry point
- `createGroupConversation(me, participants, title?)` — generic, ready for 3b
- `ensureMyWriteGroup(me, conversation)` — self-create WriteGroup
- `leaveConversation(me, conversation)` — cryptographic revoke

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { createJazzTestAccount } from "jazz-tools/testing";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import {
  findOrCreate1to1Conversation,
  ensureMyWriteGroup,
} from "@/jazz/conversation";

describe("findOrCreate1to1Conversation", () => {
  it("creates a new ConversationGroup + Conversation if none exists", async () => {
    const { account: alice } = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
    });
    const { account: bob } = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
    });

    // Simulate Alice having Bob as a contact (a Contact instance referencing bob's accountID)
    // For the unit test we pass a minimal contact-like object
    const contactStub = {
      contactAccountID: (bob as any).$jazz.id,
      linkedConversation: null,
      $jazz: {
        set: (key: string, value: any) => {
          (contactStub as any)[key] = value;
        },
      },
    };

    const conversation = await findOrCreate1to1Conversation(alice, contactStub);
    expect(conversation).toBeDefined();
    expect(conversation.kind).toBe("dm");
    expect(contactStub.linkedConversation).toBeDefined();
  });

  it("returns the existing conversation when linkedConversation is set", async () => {
    // ... (similar shape; assert no new Group is created)
  });
});

describe("ensureMyWriteGroup", () => {
  it("creates a new WriteGroup with self as single writer + admin when none exists", async () => {
    // Setup: account, a ConversationGroup, a Conversation owned by it, no messages yet
    // Call ensureMyWriteGroup, assert returned group has the expected shape
  });

  it("returns the existing WriteGroup when one is already in conversation.messages", async () => {
    // Setup: send a message first to create the WriteGroup, then call ensureMyWriteGroup again
    // Assert same group instance returned
  });
});
```

Some test scaffolding (creating accounts, simulating contacts) may require helper utilities. Add them in `tests/unit/jazz/test-helpers.ts` if reused.

- [ ] **Step 2: Run tests (expect fail)**

```bash
npm test -- conversation
```

- [ ] **Step 3: Implement `src/jazz/conversation.ts`**

```ts
import { Group, co } from "jazz-tools";
import { Conversation } from "@/jazz/schema/Conversation";
import { Message } from "@/jazz/schema/Message";

/**
 * Find or create a 1:1 conversation between `me` and the account referenced
 * by `contact`. The contact is a Contact CoValue from `me.root.contactBook`.
 *
 * Steps:
 *   1. If contact.linkedConversation is set, return it.
 *   2. Otherwise iterate my ConversationGroups; if any is a 2-member group
 *      with the contact's accountID as the other member, populate the cache
 *      and return.
 *   3. Otherwise create a new ConversationGroup + Conversation, set the cache.
 *
 * Returns the Conversation CoValue.
 */
export async function findOrCreate1to1Conversation(
  me: any,
  contact: any,
): Promise<any> {
  if (contact.linkedConversation) {
    return contact.linkedConversation;
  }

  // Defensive scan: maybe Bob created the conversation first
  const existing = await find1to1ConversationWith(me, contact.contactAccountID);
  if (existing) {
    contact.$jazz.set("linkedConversation", existing);
    return existing;
  }

  // Create new
  const conversationGroup = Group.create({ owner: me });
  // Resolve the other account as a Jazz Account ref (verify resolution API)
  const otherAccount = await loadAccountByID(contact.contactAccountID);
  conversationGroup.addMember(otherAccount, "admin");

  const conversation = Conversation.create(
    {
      kind: "dm",
      createdAt: new Date(),
      createdBy: me.$jazz.id,
      messages: co.list(Message).create([], { owner: conversationGroup }),
    },
    { owner: conversationGroup },
  );

  contact.$jazz.set("linkedConversation", conversation);
  return conversation;
}

/**
 * Generic group conversation creation, ready for Slice 3b. Not exposed via UI
 * in 3a — only the 1:1 entry point is wired.
 */
export async function createGroupConversation(
  me: any,
  participantAccountIDs: string[],
  title?: string,
): Promise<any> {
  const conversationGroup = Group.create({ owner: me });
  for (const accountID of participantAccountIDs) {
    const acc = await loadAccountByID(accountID);
    conversationGroup.addMember(acc, "admin");
  }
  const conversation = Conversation.create(
    {
      title,
      kind: "group",
      createdAt: new Date(),
      createdBy: me.$jazz.id,
      messages: co.list(Message).create([], { owner: conversationGroup }),
    },
    { owner: conversationGroup },
  );
  return conversation;
}

/**
 * Ensure I have a WriteGroup in this conversation. Creates one (parent =
 * conversationGroup mapped reader, self as direct writer) if none exists.
 *
 * Idempotent. Safe to call before every send.
 */
export async function ensureMyWriteGroup(me: any, conversation: any): Promise<Group> {
  const conversationGroup = conversation.$jazz.owner as Group;

  // Scan existing messages to find one whose owner Group has me as direct writer.
  for (const message of conversation.messages) {
    if (!message) continue;
    const owningGroup = (message as any).$jazz?.owner;
    if (owningGroup instanceof Group && isMyDirectWriteGroup(owningGroup, me)) {
      return owningGroup;
    }
  }

  // Create new
  const wg = Group.create({ owner: me });
  wg.extend(conversationGroup, "reader");
  wg.addMember(me, "writer");
  return wg;
}

/**
 * Leave a conversation by revoking self from the ConversationGroup. Jazz
 * rotates the readKey; future messages from remaining members are encrypted
 * under the new key I no longer have access to.
 *
 * Clears any linkedConversation cache pointing here.
 */
export async function leaveConversation(me: any, conversation: any): Promise<void> {
  const conversationGroup = conversation.$jazz.owner as Group;
  conversationGroup.removeMember(me);

  // Clear any contact cache referencing this conversation
  const contactBook = (me as any).root?.contactBook;
  if (contactBook) {
    for (const contact of contactBook) {
      if (contact?.linkedConversation?.$jazz?.id === conversation.$jazz.id) {
        contact.$jazz.set("linkedConversation", null);
      }
    }
  }
}

// ----- private helpers -----

async function find1to1ConversationWith(
  me: any,
  otherAccountID: string,
): Promise<any | null> {
  // Iterate my known conversations; for each, check if it's a 2-member
  // ConversationGroup with otherAccountID as the non-me member.
  // The mechanism for "list my conversations" depends on Jazz's account
  // CoValues / group membership graph traversal. Verify API.
  // Fallback if no clean iteration API: rely on the linkedConversation cache.
  return null;
}

async function loadAccountByID(_accountID: string): Promise<any> {
  // Resolve an Account CoValue by ID. Jazz exposes this; verify exact pattern.
  // Likely: Account.load(id) or similar.
  throw new Error("loadAccountByID — verify Jazz API during implementation");
}

function isMyDirectWriteGroup(group: Group, me: any): boolean {
  const writers = (group as any).members?.filter(
    (m: any) => m.role === "writer" && m.isDirect && m.account?.$jazz?.id === me.$jazz.id,
  );
  return Boolean(writers && writers.length === 1);
}
```

**Note:** `loadAccountByID` and `find1to1ConversationWith` rely on Jazz APIs not yet covered in `docs/jazz-api-notes.md`. Verify during implementation. If unclear after 15-20 minutes, dispatch a focused research subagent.

- [ ] **Step 4: Run tests (expect pass)**

- [ ] **Step 5: Commit**

```bash
git add src/jazz/conversation.ts tests/unit/jazz/conversation.test.ts
git commit -m "feat(jazz): conversation module — 1:1 + group lifecycle, ensureMyWriteGroup, leave"
```

---

## Phase C — UI components

### Task 7: Composer component

**Files:**
- Create: `src/components/composer.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";

interface ComposerProps {
  onSend: (body: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function Composer({ onSend, disabled = false, placeholder = "Type a message…" }: ComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending || disabled) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setText("");
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

  return (
    <div className="flex gap-2 p-3 border-t border-border" data-testid="composer">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        disabled={disabled || sending}
        placeholder={disabled ? "No one else is in this chat" : placeholder}
        rows={2}
        className="flex-1 resize-none rounded border bg-background p-2 text-sm"
        data-testid="composer-input"
      />
      <Button
        onClick={handleSend}
        disabled={!text.trim() || sending || disabled}
        data-testid="composer-send-btn"
      >
        Send
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/composer.tsx
git commit -m "feat(ui): message composer with Enter-to-send"
```

---

### Task 8: MessageBubble component

**Files:**
- Create: `src/components/message-bubble.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { editMessage, deleteMessage } from "@/jazz/messages";

interface MessageBubbleProps {
  message: any;
  authorAccountID: string | null;
  authorDisplayName: string;
  isMine: boolean;
  me: any;
}

export function MessageBubble({
  message,
  authorAccountID,
  authorDisplayName,
  isMine,
  me,
}: MessageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.body);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!authorAccountID) {
    return (
      <div className="px-3 py-1 text-xs text-muted-foreground" data-testid="message-malformed">
        [unverified author — message hidden]
      </div>
    );
  }

  const formattedTime = message.sentAt
    ? new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  if (message.deleted) {
    return (
      <div
        className={`px-3 py-2 italic text-sm text-muted-foreground ${isMine ? "text-right" : "text-left"}`}
        data-testid="message-deleted"
      >
        ⌫ This message was deleted
        <span className="ml-2 text-xs">— {authorDisplayName} {formattedTime}</span>
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

  return (
    <div
      className={`group px-3 py-1 ${isMine ? "text-right" : "text-left"}`}
      data-testid={`message-${isMine ? "mine" : "other"}`}
    >
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
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveEdit} data-testid="message-edit-save">Save</Button>
          </div>
        </div>
      ) : (
        <div className={`inline-block max-w-md rounded-lg px-3 py-2 text-sm ${
          isMine ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}>
          {message.body}
        </div>
      )}

      {menuOpen && isMine && !editing && (
        <div className="mt-1 flex justify-end gap-1">
          <Button size="sm" variant="outline" onClick={() => { setMenuOpen(false); setEditing(true); }} data-testid="message-edit-btn">
            Edit
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setMenuOpen(false); handleDelete(); }} data-testid="message-delete-btn">
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/message-bubble.tsx
git commit -m "feat(ui): message bubble component with edit/delete + deleted/edited variants"
```

---

### Task 9: ConnectionBanner component

**Files:**
- Create: `src/components/connection-banner.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useSyncConnectionStatus } from "jazz-tools/react";

/**
 * Shows a subtle banner when sync is disconnected. Renders nothing when online.
 * Uses Jazz's useSyncConnectionStatus hook (see docs/jazz-api-notes.md §3).
 */
export function ConnectionBanner() {
  const status = useSyncConnectionStatus();
  const isConnected = status === "connected" || status === undefined;

  if (isConnected) return null;

  return (
    <div className="bg-yellow-100 text-yellow-900 text-xs px-3 py-2 border-b border-yellow-300" data-testid="connection-banner">
      ⚠ No connection — messages will send when you reconnect.
    </div>
  );
}
```

If `useSyncConnectionStatus` doesn't return `"connected"`/`"disconnected"` literally, adapt the check to whatever value indicates online. Verify against `docs/jazz-api-notes.md`.

- [ ] **Step 2: Verify build**

- [ ] **Step 3: Commit**

```bash
git add src/components/connection-banner.tsx
git commit -m "feat(ui): connection-status banner shown only when offline"
```

---

### Task 10: ContactPicker overlay component

**Files:**
- Create: `src/components/contact-picker.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useAccount } from "jazz-tools/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";

interface ContactPickerProps {
  onSelect: (contact: any) => void;
  onClose: () => void;
}

export function ContactPicker({ onSelect, onClose }: ContactPickerProps) {
  const me = useAccount(JazzMessangerAccount, {
    resolve: { root: { contactBook: { $each: true } } },
  });

  if (!me?.$isLoaded) return null;

  const contacts = me.root?.contactBook ?? [];

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
      data-testid="contact-picker-overlay"
    >
      <div
        className="bg-background rounded-lg p-6 max-w-md w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">Start a chat with…</h2>

        {contacts.length === 0 ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">You have no contacts yet.</p>
            <Link to="/contacts/add" onClick={onClose}>
              <Button>Add a contact</Button>
            </Link>
          </div>
        ) : (
          <ul className="space-y-1 max-h-80 overflow-y-auto" data-testid="contact-picker-list">
            {contacts.map((c: any, i: number) => (
              <li key={i}>
                <button
                  onClick={() => onSelect(c)}
                  className="w-full text-left px-3 py-2 hover:bg-accent rounded text-sm"
                  data-testid={`contact-picker-row-${i}`}
                >
                  {c?.displayNameLocal ?? "(unknown)"}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose} data-testid="contact-picker-cancel">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

- [ ] **Step 3: Commit**

```bash
git add src/components/contact-picker.tsx
git commit -m "feat(ui): contact picker overlay for starting a new chat"
```

---

### Task 11: Refactor sidebar to render conversations

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Rewrite sidebar**

The current sidebar renders contacts from `me.root.contactBook`. Replace with a conversation list.

```tsx
import { useState } from "react";
import { useAccount } from "jazz-tools/react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { ContactPicker } from "@/components/contact-picker";
import { findOrCreate1to1Conversation } from "@/jazz/conversation";

export function Sidebar() {
  const me = useAccount(JazzMessangerAccount, {
    resolve: { profile: true, root: { contactBook: { $each: true } } },
  });
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!me?.$isLoaded) return null;

  // For Slice 3a, the conversation list is derived from contactBook.linkedConversation refs.
  // (Each Contact may or may not have a linkedConversation; we filter.)
  // A more general "list all my conversations" path will come in 3b.
  const contacts = me.root?.contactBook ?? [];
  const conversations = contacts
    .filter((c: any) => c?.linkedConversation)
    .map((c: any) => ({
      conversation: c.linkedConversation,
      contact: c,
    }));

  // Sort by last message's sentAt (descending)
  conversations.sort((a: any, b: any) => {
    const aLast = a.conversation.messages?.[a.conversation.messages.length - 1]?.sentAt;
    const bLast = b.conversation.messages?.[b.conversation.messages.length - 1]?.sentAt;
    const aTime = aLast ? new Date(aLast).getTime() : new Date(a.conversation.createdAt).getTime();
    const bTime = bLast ? new Date(bLast).getTime() : new Date(b.conversation.createdAt).getTime();
    return bTime - aTime;
  });

  async function handlePickContact(contact: any) {
    setPickerOpen(false);
    const conversation = await findOrCreate1to1Conversation(me, contact);
    navigate(`/conversations/${conversation.$jazz.id}`);
  }

  return (
    <>
      <aside className="w-64 border-r border-border flex flex-col">
        <header className="p-4 border-b border-border flex items-center justify-between">
          <p className="text-sm font-medium truncate" data-testid="sidebar-display-name">
            {me.profile?.displayName ?? "Loading…"}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPickerOpen(true)}
            data-testid="new-chat-btn"
          >
            +
          </Button>
        </header>

        <nav className="flex-1 overflow-y-auto p-2" data-testid="conversation-list">
          {conversations.length === 0 ? (
            <div className="p-4 text-center space-y-3">
              <p className="text-sm text-muted-foreground">No conversations yet.</p>
              <Link to="/contacts">
                <Button size="sm">Browse contacts</Button>
              </Link>
            </div>
          ) : (
            conversations.map((c: any, i: number) => (
              <Link
                key={i}
                to={`/conversations/${c.conversation.$jazz.id}`}
                className="block p-2 hover:bg-accent rounded text-sm"
                data-testid={`conversation-row-${i}`}
              >
                {c.contact.displayNameLocal}
              </Link>
            ))
          )}
        </nav>

        <footer className="p-4 border-t border-border flex flex-col gap-2">
          <Link
            to="/contacts"
            className="text-sm text-muted-foreground hover:text-foreground"
            data-testid="contacts-link"
          >
            📇 Contacts
          </Link>
          <Link
            to="/settings"
            className="text-sm text-muted-foreground hover:text-foreground"
            data-testid="settings-link"
          >
            ⚙ Settings
          </Link>
        </footer>
      </aside>

      {pickerOpen && (
        <ContactPicker onSelect={handlePickContact} onClose={() => setPickerOpen(false)} />
      )}
    </>
  );
}
```

The old `add-contact-btn-header` and `add-contact-btn-empty` testids are replaced (they're not on the sidebar anymore — they're on `/contacts`). Slice 1+2 e2e tests that referenced these testids need updating in Task 17.

- [ ] **Step 2: Update Slice 2's invitation e2e to point at `/contacts/add` directly**

Open `tests/e2e/contact-invitation.spec.ts` and `tests/e2e/invite-before-signin.spec.ts`. Where they currently click `add-contact-btn-header` or `add-contact-btn-empty`, replace with `await pageB.goto("/contacts/add")`. The user flow now requires navigating via the sidebar's Contacts link → `/contacts` → "+ Add contact" button.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npm run test:e2e
```

E2e: expect 14 to still pass (with the test selector updates).

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx tests/e2e/contact-invitation.spec.ts tests/e2e/invite-before-signin.spec.ts
git commit -m "feat(sidebar): render conversation list; '+' opens contact picker; contacts moved to /contacts"
```

---

## Phase D — Routes

### Task 12: Conversations list route

**Files:**
- Create: `src/routes/conversations/index.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Sidebar } from "@/components/sidebar";
import { EmptyState } from "@/components/empty-state";

export function ConversationsRoute() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1" data-testid="conversations-main">
        <EmptyState
          title="Select a conversation"
          description="Choose a conversation from the sidebar, or start a new one with the + button."
        />
      </main>
    </div>
  );
}
```

This is the empty "select a conversation" view shown at `/conversations` when no specific conversation is selected.

- [ ] **Step 2: Commit**

```bash
git add src/routes/conversations/index.tsx
git commit -m "feat(routes): conversations list route (sidebar + empty selection state)"
```

---

### Task 13: Conversation detail route

**Files:**
- Create: `src/routes/conversations/detail.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAccount, useCoState } from "jazz-tools/react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/sidebar";
import { ConnectionBanner } from "@/components/connection-banner";
import { Composer } from "@/components/composer";
import { MessageBubble } from "@/components/message-bubble";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { Conversation } from "@/jazz/schema/Conversation";
import { sendMessage, getAuthorAccountIDFromMessage } from "@/jazz/messages";
import { leaveConversation } from "@/jazz/conversation";

export function ConversationDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useAccount(JazzMessangerAccount, {
    resolve: { root: { contactBook: { $each: true } } },
  });
  const conversation = useCoState(Conversation, id, { resolve: { messages: { $each: true } } });
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [conversation?.messages?.length]);

  const otherDisplayName = useMemo(() => {
    if (!conversation || !me?.$isLoaded) return "…";
    // For dm, the title is the other participant's displayName
    // Derived from contactBook entry whose linkedConversation matches
    const contact = me.root?.contactBook?.find(
      (c: any) => c?.linkedConversation?.$jazz?.id === conversation.$jazz?.id,
    );
    return contact?.displayNameLocal ?? "Conversation";
  }, [conversation, me]);

  async function handleSend(body: string) {
    if (!conversation) return;
    await sendMessage(me, conversation, body);
  }

  async function handleLeave() {
    if (!conversation) return;
    if (!confirm("Leave this chat? You'll stop receiving new messages and lose access to this conversation. You'd need a new invitation to rejoin.")) return;
    await leaveConversation(me, conversation);
    navigate("/conversations");
  }

  if (!me?.$isLoaded || !conversation) {
    return <div className="p-6">Loading…</div>;
  }

  // Determine if composer should be disabled (no other active members in a 1:1).
  // For 3a's 1:1 case: count the ConversationGroup's writer-role members
  // (excluding me); if zero, the other party has left and we disable.
  const conversationGroup = conversation.$jazz?.owner;
  const otherActiveMembers = (conversationGroup as any)?.members?.filter(
    (m: any) =>
      m.role !== "revoked" &&
      m.account?.$jazz?.id !== me.$jazz.id,
  ) ?? [];
  const composerDisabled = otherActiveMembers.length === 0;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col" data-testid="conversation-detail">
        <header className="flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Link to="/conversations" className="text-sm text-muted-foreground">←</Link>
            <h2 className="text-base font-semibold" data-testid="conversation-title">
              {otherDisplayName}
            </h2>
          </div>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} data-testid="conversation-menu-btn">
              ⋮
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-1 bg-background border border-border rounded shadow-lg" data-testid="conversation-menu">
                <button
                  onClick={() => { setMenuOpen(false); handleLeave(); }}
                  className="block px-4 py-2 text-sm hover:bg-accent w-full text-left"
                  data-testid="leave-conversation-btn"
                >
                  Leave conversation
                </button>
              </div>
            )}
          </div>
        </header>

        <ConnectionBanner />

        <div ref={scrollRef} className="flex-1 overflow-y-auto" data-testid="message-timeline">
          {conversation.messages?.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No messages yet. Say hi!
            </div>
          ) : (
            conversation.messages.map((m: any, i: number) => {
              if (!m) return null;
              const authorID = getAuthorAccountIDFromMessage(m);
              const isMine = authorID === me.$jazz.id;
              // Look up display name: own or from contactBook
              let authorName = "Unknown";
              if (isMine) {
                authorName = me.profile?.displayName ?? "Me";
              } else {
                const contact = me.root?.contactBook?.find(
                  (c: any) => c?.contactAccountID === authorID,
                );
                authorName = contact?.displayNameLocal ?? "Unknown";
              }
              return (
                <MessageBubble
                  key={i}
                  message={m}
                  authorAccountID={authorID}
                  authorDisplayName={authorName}
                  isMine={isMine}
                  me={me}
                />
              );
            })
          )}
        </div>

        <Composer onSend={handleSend} disabled={composerDisabled} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

- [ ] **Step 3: Commit**

```bash
git add src/routes/conversations/detail.tsx
git commit -m "feat(routes): conversation detail — timeline, composer, leave menu"
```

---

### Task 14: Full-page contacts list route

**Files:**
- Create: `src/routes/contacts/index.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useAccount } from "jazz-tools/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";

export function ContactsRoute() {
  const me = useAccount(JazzMessangerAccount, {
    resolve: { root: { contactBook: { $each: true } } },
  });

  if (!me?.$isLoaded) return <div className="p-6">Loading…</div>;

  const contacts = me.root?.contactBook ?? [];

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Contacts</h2>
        <Link to="/contacts/add">
          <Button data-testid="add-contact-page-btn">+ Add contact</Button>
        </Link>
      </header>

      <Link to="/" className="text-sm text-muted-foreground">← Conversations</Link>

      {contacts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="contacts-empty">
          <p>No contacts yet.</p>
          <p className="text-xs mt-2">Add your first contact via the + Add contact button.</p>
        </div>
      ) : (
        <ul className="space-y-1" data-testid="contacts-page-list">
          {contacts.map((c: any, i: number) => (
            <li key={i}>
              <Link
                to={`/contacts/${c?.$jazz?.id}`}
                className="block p-3 hover:bg-accent rounded text-sm"
                data-testid={`contacts-page-row-${i}`}
              >
                {c?.displayNameLocal ?? "(unknown)"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/contacts/index.tsx
git commit -m "feat(routes): full-page contacts list at /contacts"
```

---

### Task 15: Add "Start chat" button to contact detail

**Files:**
- Modify: `src/routes/contacts/detail.tsx`

- [ ] **Step 1: Add the button**

Open `src/routes/contacts/detail.tsx`. Add a "Start chat" button above (or alongside) the existing "Remove contact" button. The button calls `findOrCreate1to1Conversation(me, contact)` and navigates to the conversation.

```tsx
// Add imports:
import { useNavigate } from "react-router-dom";
import { findOrCreate1to1Conversation } from "@/jazz/conversation";

// Inside the component:
const navigate = useNavigate();

async function handleStartChat() {
  if (!contact) return;
  const conversation = await findOrCreate1to1Conversation(me, contact);
  navigate(`/conversations/${conversation.$jazz.id}`);
}

// Add button in the JSX, before or alongside the existing Remove button:
<Button onClick={handleStartChat} data-testid="start-chat-btn">
  Start chat
</Button>
```

- [ ] **Step 2: Verify build**

- [ ] **Step 3: Commit**

```bash
git add src/routes/contacts/detail.tsx
git commit -m "feat(contacts): 'Start chat' button on contact detail"
```

---

### Task 16: Wire routes into App.tsx; home redirects to /conversations

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/routes/home/index.tsx`

- [ ] **Step 1: Update App.tsx routes**

Open `src/App.tsx`. Inside the authenticated `<Routes>`, add:

```tsx
import { ConversationsRoute } from "@/routes/conversations";
import { ConversationDetailRoute } from "@/routes/conversations/detail";
import { ContactsRoute } from "@/routes/contacts";

// inside the authenticated branch:
<Route path="/" element={<ConversationsRoute />} />
<Route path="/conversations" element={<ConversationsRoute />} />
<Route path="/conversations/:id" element={<ConversationDetailRoute />} />
<Route path="/contacts" element={<ContactsRoute />} />
// (existing routes preserved: /settings/*, /contacts/add, /contacts/:contactID, /invite, /pair, *)
```

The `/` route now renders the ConversationsRoute (sidebar + empty selection state) instead of the old HomeRoute.

- [ ] **Step 2: Repurpose or remove home/index.tsx**

The old `src/routes/home/index.tsx` is no longer routed to. Either delete it or update its content to a thin re-export of ConversationsRoute. Simpler: delete it.

```bash
git rm src/routes/home/index.tsx
```

If any imports still reference HomeRoute, update them to import ConversationsRoute instead.

- [ ] **Step 3: Verify build + tests**

```bash
npx tsc --noEmit
npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(routing): wire /conversations + /contacts routes; / now shows conversation list"
```

---

## Phase E — E2E tests + docs

### Task 17: E2E — 1:1 messaging happy path

**Files:**
- Create: `tests/e2e/messaging-1to1.spec.ts`
- Modify: `tests/e2e/helpers.ts` (add helpers if needed)

- [ ] **Step 1: Add a helper for establishing mutual contacts**

If `tests/e2e/helpers.ts` doesn't already have a `establishMutualContacts(pageA, nameA, pageB, nameB)` helper, add one. It runs the Slice 2 invite flow end-to-end and returns once both sidebars show the other contact.

- [ ] **Step 2: Write the e2e test**

```ts
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

test("1:1 messaging — send, receive, edit, delete", async ({ browser }) => {
  // Setup: two accounts as mutual contacts (via Slice 2 invite flow)
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await pageA.goto("/");
  await createAccount(pageA, "Alice");

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await pageB.goto("/");
  await createAccount(pageB, "Bob");

  // Bob invites Alice
  await pageB.goto("/contacts/add");
  const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();
  await pageA.goto(inviteUrl);
  await pageA.getByTestId("invite-accept-btn").click();
  await expect(pageA.getByTestId("conversation-list")).toContainText("Bob", { timeout: 10000 });
  await expect(pageB.getByTestId("conversation-list")).toContainText("Alice", { timeout: 10000 });

  // Alice opens Bob's contact and starts a chat
  await pageA.goto("/contacts");
  await pageA.getByTestId("contacts-page-row-0").click();
  await pageA.getByTestId("start-chat-btn").click();
  await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 10000 });

  // Alice sends a message
  await pageA.getByTestId("composer-input").fill("Hey Bob");
  await pageA.getByTestId("composer-send-btn").click();
  await expect(pageA.getByTestId("message-mine").first()).toContainText("Hey Bob");

  // Bob opens his conversation list, clicks Alice's conversation
  await expect(pageB.getByTestId("conversation-row-0")).toBeVisible({ timeout: 10000 });
  await pageB.getByTestId("conversation-row-0").click();
  await expect(pageB.getByTestId("message-timeline")).toContainText("Hey Bob", { timeout: 10000 });

  // Bob replies
  await pageB.getByTestId("composer-input").fill("Hi Alice!");
  await pageB.getByTestId("composer-send-btn").click();
  await expect(pageA.getByTestId("message-timeline")).toContainText("Hi Alice!", { timeout: 10000 });

  // Alice edits her message
  await pageA.getByTestId("message-mine").first().hover();
  await pageA.getByTestId("message-menu-btn").first().click();
  await pageA.getByTestId("message-edit-btn").click();
  await pageA.getByTestId("message-edit-input").fill("Hey Bob, updated");
  await pageA.getByTestId("message-edit-save").click();
  await expect(pageB.getByTestId("message-timeline")).toContainText("(edited)", { timeout: 10000 });
  await expect(pageB.getByTestId("message-timeline")).toContainText("Hey Bob, updated");

  // Alice deletes her message
  pageA.on("dialog", (dialog) => dialog.accept());
  await pageA.getByTestId("message-mine").first().hover();
  await pageA.getByTestId("message-menu-btn").first().click();
  await pageA.getByTestId("message-delete-btn").click();
  await expect(pageB.getByTestId("message-deleted")).toBeVisible({ timeout: 10000 });

  await ctxA.close();
  await ctxB.close();
});
```

- [ ] **Step 3: Run**

```bash
npm run test:e2e -- messaging-1to1
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/messaging-1to1.spec.ts tests/e2e/helpers.ts
git commit -m "test(e2e): 1:1 messaging happy path — send, receive, edit, delete"
```

---

### Task 18: E2E — Leave conversation

**Files:**
- Create: `tests/e2e/leave-conversation.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

test("leave conversation — Alice leaves, Bob sees the system event", async ({ browser }) => {
  // Setup mutual contacts + open conversation
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await pageA.goto("/");
  await createAccount(pageA, "Alice");

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await pageB.goto("/");
  await createAccount(pageB, "Bob");

  await pageB.goto("/contacts/add");
  const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();
  await pageA.goto(inviteUrl);
  await pageA.getByTestId("invite-accept-btn").click();
  await expect(pageA.getByTestId("conversation-list")).toContainText("Bob", { timeout: 10000 });

  // Alice starts chat
  await pageA.goto("/contacts");
  await pageA.getByTestId("contacts-page-row-0").click();
  await pageA.getByTestId("start-chat-btn").click();
  await pageA.getByTestId("composer-input").fill("Test message");
  await pageA.getByTestId("composer-send-btn").click();
  await expect(pageA.getByTestId("conversation-detail")).toBeVisible();

  // Bob also opens it
  await expect(pageB.getByTestId("conversation-row-0")).toBeVisible({ timeout: 10000 });
  await pageB.getByTestId("conversation-row-0").click();
  await expect(pageB.getByTestId("message-timeline")).toContainText("Test message", { timeout: 10000 });

  // Alice leaves
  pageA.on("dialog", (dialog) => dialog.accept());
  await pageA.getByTestId("conversation-menu-btn").click();
  await pageA.getByTestId("leave-conversation-btn").click();

  // Alice is back on conversation list, conversation no longer shown
  await expect(pageA.getByTestId("conversations-main")).toBeVisible({ timeout: 10000 });
  // (The conversation should be filtered out of Alice's list because she's revoked)
  // Note: Alice's contactBook entry for Bob's linkedConversation was cleared in leaveConversation;
  // so the sidebar shouldn't show it.

  await ctxA.close();
  await ctxB.close();
});
```

The "Bob sees system event" part of the spec relies on synthetic timeline rendering of the role-grant transaction history. If that proves complex to test in 3a, skip the assertion and rely on the manual verification step.

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/leave-conversation.spec.ts
git commit -m "test(e2e): leave conversation — Alice revokes self, list updates"
```

---

### Task 19: E2E — Conversation list ordering

**Files:**
- Create: `tests/e2e/conversation-list-ordering.spec.ts`

- [ ] **Step 1: Write the test (lighter-weight)**

A full 3-conversation test is involved — for 3a a 2-conversation test is sufficient.

```ts
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

test("conversation list — most recent first; sending bumps to top", async ({ browser }) => {
  // Setup: Alice + two contacts Bob and Carol
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await pageA.goto("/");
  await createAccount(pageA, "Alice");

  const setupContact = async (name: string) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/");
    await createAccount(page, name);
    await page.goto("/contacts/add");
    const inviteUrl = (await page.getByTestId("qr-url-text").textContent())!.trim();
    await pageA.goto(inviteUrl);
    await pageA.getByTestId("invite-accept-btn").click();
    await ctx.close();
  };

  await setupContact("Bob");
  await setupContact("Carol");

  await pageA.goto("/contacts");

  // Alice starts chat with Bob first
  await pageA.getByText("Bob").click();
  await pageA.getByTestId("start-chat-btn").click();
  await pageA.getByTestId("composer-input").fill("Hi Bob");
  await pageA.getByTestId("composer-send-btn").click();
  await expect(pageA.getByTestId("message-mine")).toContainText("Hi Bob");

  // Then with Carol
  await pageA.goto("/contacts");
  await pageA.getByText("Carol").click();
  await pageA.getByTestId("start-chat-btn").click();
  await pageA.getByTestId("composer-input").fill("Hi Carol");
  await pageA.getByTestId("composer-send-btn").click();
  await expect(pageA.getByTestId("message-mine")).toContainText("Hi Carol");

  // Sidebar: Carol should be on top (most recent)
  await pageA.goto("/conversations");
  const firstRow = pageA.getByTestId("conversation-row-0");
  await expect(firstRow).toContainText("Carol");

  // Send a new message in Bob's conversation; sidebar should now show Bob first
  await pageA.goto("/contacts");
  await pageA.getByText("Bob").click();
  await pageA.getByTestId("start-chat-btn").click();
  await pageA.getByTestId("composer-input").fill("Another for Bob");
  await pageA.getByTestId("composer-send-btn").click();
  await pageA.goto("/conversations");
  await expect(pageA.getByTestId("conversation-row-0")).toContainText("Bob");

  await ctxA.close();
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/conversation-list-ordering.spec.ts
git commit -m "test(e2e): conversation list sorts by most-recent activity"
```

---

### Task 20: CHANGELOG entry + slice-3a-complete tag

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add a Slice 3a section above Slice 2's**

Append to `CHANGELOG.md`'s `[Unreleased]` block (at the top of the slices):

```markdown
### Slice 3a — 1:1 Conversations + Messaging Foundation

- Schema additions: `Message.deleted: boolean.optional()`, `Message.editedAt: date.optional()`.
- Schema removal: `Conversation.authorWriteGroups` registry (Slice 1 vestige; removed because it enabled a registry-poisoning impersonation attack — see Slice 3a spec §4).
- Self-creating per-author WriteGroups: each participant creates their own WriteGroup on first send. Author derivation reads the create-transaction signer, validated against well-formedness of the owning WriteGroup. Scales naturally to groups (Slice 3b) and structurally defeats both the "two direct writers" forgery and the "demote-trick" sequencing attack.
- 1:1 conversation creation on "Start chat" from contact detail page. Lazy: no conversation exists until both sides have interacted.
- Conversation list in the sidebar (replaces the old contact list). "+" button opens a contact picker.
- Contacts moved to `/contacts` (full page) accessible via the sidebar footer link.
- Message composer (Enter sends, Shift-Enter newline) and message bubbles (own/other variants, edited indicator, deleted placeholder).
- Edit own message (soft, in-place body overwrite, `edited`/`editedAt` flags).
- Delete own message (soft: body cleared, `deleted: true`, placeholder rendered).
- Leave conversation (cryptographic revoke from `ConversationGroup`; closes NOX-9).
- Connection-status banner shown only when offline. Per-message indicator deliberately omitted (optimistic-first).
- E2E tests: messaging-1to1, leave-conversation, conversation-list-ordering.

### Slice 3a known limitations

- No group conversations yet (Slice 3b).
- No "delete for me" — delete is always for everyone in the conversation.
- No edit-history view (we don't surface previous versions of edited messages).
- Synthetic "Alice left the chat" timeline event on Bob's side is a known weak spot; may show as a static "[Member left]" indicator at the timeline bottom rather than at the exact transaction position.
- Conversation discovery is via `Contact.linkedConversation` cache; the more general "iterate all my conversations" path will come in Slice 3b.
```

- [ ] **Step 2: Tag the slice**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog entry for Slice 3a"
git tag -a slice-3a-complete -m "E1a Slice 3a: 1:1 Conversations + Messaging Foundation complete"
```

---

### Task 21: Close Linear NOX-9

**Files:** none in repo

- [ ] **Step 1: Update NOX-9 in Linear**

After the slice merges to main, update NOX-9 with a comment linking to the merge commit and the design spec's §5.3 (Leave conversation):

The MCP tool: `mcp__claude_ai_Linear__save_comment` (or via `save_issue` with `state` field).

For the executor: report back the merge commit SHA so the controller can update NOX-9 from the parent session.

(No commit; coordination action.)

---

## Done definition

Slice 3a is complete when all of the following are true:

- [ ] `npm test` exits 0 (unit tests — adds at least 2 new files: `conversation.test.ts`, `messages.test.ts`)
- [ ] `npm run test:e2e` exits 0 in Chromium + Firefox (Slice 1+2's 14 still pass + 3 new specs × 2 browsers = 20 e2e tests)
- [ ] Manual: two browser contexts as different accounts can establish mutual contact (Slice 2 flow), start a 1:1 chat, exchange messages, edit own messages, delete own messages, leave the conversation. Both sides see consistent state throughout.
- [ ] Manual: Settings → Sign out still works (Slice 2 regression check)
- [ ] Manual: sidebar shows conversations (not contacts); contacts accessible via `/contacts` link in sidebar footer
- [ ] Linear NOX-9 closed with reference to the merge commit
- [ ] Tag `slice-3a-complete` set

---

## Notes for Slice 3b author

- The generic `createGroupConversation(me, participants, title?)` already exists in `src/jazz/conversation.ts` — Slice 3b wires it into a UI (multi-member contact picker, group title input).
- `ensureMyWriteGroup` handles the N>2 case transparently (each new member self-creates on first send).
- Conversation discovery (the "list all my conversations" path) is currently derived from `Contact.linkedConversation` caches. For groups (where there's no single per-contact link), Slice 3b needs to introduce a `Account.root.activeConversations` list or use Jazz's group-membership graph traversal. Verify the appropriate API.
- The synthetic "[Member left]" timeline event will become more important in 3b (group has multiple members; each leave event needs positioned rendering). May warrant promoting from "[Member left]" indicator to actual timeline events derived from the ConversationGroup's role-grant transaction history.
- 3a defers the moderator-override design discussion (admin cannot delete a participant's message). Slice 3b or E2 needs to decide whether to add such a capability.