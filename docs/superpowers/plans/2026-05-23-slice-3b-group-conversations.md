# Jazz Messanger E1a — Slice 3b: Group Conversations + Member Management

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can create N≥3 person group conversations from a multi-select contact picker, see and manage members (add, remove, promote/demote, edit title) via `/conversations/:id/members`, and rely on the same `knownConversations`-based discovery for 1:1 and groups. The Slice 3a `Contact.linkedConversation` cache is removed in favor of a unified discovery list.

**Architecture:** Single source of truth for sidebar discovery becomes `Account.root.knownConversations: co.list(Conversation)`, populated by Inbox subscription on the recipient side and direct push on the creator side. Groups use admin+writer roles with creator-as-admin / members-as-writer defaults. 1:1 conversations stay both-admin (Slice 3a behavior). `/conversations/:id/members` route hosts the management UI for groups and a minimal info pane for 1:1.

**Tech Stack:** Continuing React 18 + Vite + TypeScript + Tailwind v3 + shadcn/ui + jazz-tools 0.20.18 + react-router-dom 7.x. No new npm deps.

**Slice scope:** Ends when 3+ accounts can form a group via multi-select; admins can add/remove members + promote/demote + edit title; the sole admin can leave via inline promotion of a member; the Slice 3a `linkedConversation` cache is fully retired. **Out of scope:** three-tier roles (manager unused), group avatars (Slice 4), inline-positioned system events (open Linear followup), Disband group + archived conversations view (TaskList #25), edit-history view.

**Authoritative spec:** `docs/superpowers/specs/2026-05-23-slice-3b-group-conversations-design.md`
**Companion docs:** `docs/security/threat-model.md`, `docs/jazz-api-notes.md`
**Linear:** team=Nox project=jazz-messanger; NOX-13 (audit direct property assignments) is **especially load-bearing** for this slice — all new mutation paths must use `instance.$jazz.set(key, value)` not `instance.key = value`.

---

## Important notes for the executor

1. **Read the spec first.** Sections 4, 5, 6, 8 of `docs/superpowers/specs/2026-05-23-slice-3b-group-conversations-design.md` are the protocol-level ground truth. Where this plan differs, the spec wins.

2. **Use `$jazz.set()` for ALL CoValue mutations.** Jazz silently no-ops direct property writes on `co.map()` instances (`foo.bar = baz` returns false in the proxy). Slice 3a's editMessage/deleteMessage were silently broken until the Phase E e2e tests caught it. Every new mutation in this slice (addMember, removeMember, role changes, title edits, knownConversations push/pop) must use `$jazz.set()` for fields or `$jazz.push()`/`$jazz.delete()` for list operations. Linear NOX-13 tracks the broader codebase audit.

3. **No data migration.** Per user authorization, we start fresh — existing IndexedDB data will be wiped during dev/manual testing. Don't write any migration code for old Conversation/Contact shapes; new accounts get `knownConversations` initialized empty by the migration.

4. **Slice 3a tests must keep passing.** After every change to existing files (especially `conversation.ts`, `sidebar.tsx`, App.tsx Inbox callback, `conversations/detail.tsx`), re-run `npm test` + `npm run test:e2e`. Particularly: `leave-conversation.spec.ts` and `conversation-auto-discovery.spec.ts` from Slice 3a — both touch the code paths being refactored here.

5. **`createGroupConversation` already exists** in `src/jazz/conversation.ts` but adds participants as `"admin"` (Slice 3a's generic default). Phase B changes the default to `"writer"`.

---

## File structure after Slice 3b

```
src/
├── App.tsx                                  # MODIFIED — Inbox callback pushes to knownConversations
├── auth/                                    # (unchanged)
├── components/
│   ├── composer.tsx                         # (unchanged)
│   ├── connection-banner.tsx                # (unchanged)
│   ├── contact-picker.tsx                   # MODIFIED — multi-select with Continue button
│   ├── empty-state.tsx                      # (unchanged)
│   ├── group-create-dialog.tsx              # NEW — title prompt after multi-select
│   ├── leave-with-promote-dialog.tsx        # NEW — last-admin leave inline promotion
│   ├── message-bubble.tsx                   # (unchanged)
│   ├── qr-display.tsx                       # (unchanged)
│   ├── role-pill.tsx                        # NEW — admin/writer badge
│   ├── safety-number.tsx                    # (unchanged)
│   ├── sidebar.tsx                          # MODIFIED — iterate knownConversations
│   ├── system-event.tsx                     # NEW — extracted from inline rendering, generic events
│   └── ui/
│       └── button.tsx                       # (unchanged)
├── jazz/
│   ├── conversation.ts                      # MODIFIED — refactor discovery, add member-mgmt primitives
│   ├── invitations.ts                       # (unchanged)
│   ├── messages.ts                          # (unchanged)
│   ├── pairing.ts                           # (unchanged)
│   ├── provider.tsx                         # (unchanged)
│   └── schema/
│       ├── Contact.ts                       # MODIFIED — remove linkedConversation field
│       ├── Conversation.ts                  # (unchanged from 3a)
│       ├── JazzMessangerAccount.ts          # MODIFIED — add knownConversations to root + migration
│       └── (other schemas unchanged)
├── lib/                                     # (unchanged)
├── main.tsx                                 # (unchanged)
├── qr/                                      # (unchanged)
└── routes/
    ├── contacts/
    │   ├── add.tsx                          # (unchanged)
    │   ├── detail.tsx                       # MODIFIED — no linkedConversation references
    │   └── index.tsx                        # (unchanged)
    ├── conversations/
    │   ├── detail.tsx                       # MODIFIED — title is Link; left-member logic generalized
    │   ├── index.tsx                        # (unchanged)
    │   └── members.tsx                      # NEW — /conversations/:id/members route
    ├── invite/                              # (unchanged)
    ├── onboarding/                          # (unchanged)
    ├── pair/                                # (unchanged)
    └── settings/                            # (unchanged)

tests/
├── e2e/
│   ├── group-create.spec.ts                 # NEW
│   ├── group-member-management.spec.ts      # NEW
│   ├── group-roles.spec.ts                  # NEW
│   ├── group-title-edit.spec.ts             # NEW
│   ├── last-admin-leave.spec.ts             # NEW
│   └── (existing Slice 1-3a specs unchanged but verified)
└── unit/
    └── jazz/
        ├── conversation.test.ts             # MODIFIED — new test cases for member mgmt
        └── (other tests unchanged)
```

---

## Task list — five phases

Phases are an execution hint. Subagent-driven execution should batch:
- **Phase A** (schema, 2-3 tasks) → 1 subagent
- **Phase B** (protocol primitives, 6 tasks) → 1 subagent
- **Phase C** (UI components, 5 tasks) → 1 subagent
- **Phase D** (routes, 4 tasks) → 1 subagent
- **Phase E** (e2e + docs, 6 tasks) → 1 subagent

---

## Phase A — Schema changes

### Task 1: Add `knownConversations` to JazzMessangerAccountRoot

**Files:**
- Modify: `src/jazz/schema/JazzMessangerAccount.ts`
- Modify: `tests/unit/jazz/schema/JazzMessangerAccount.test.ts`

- [ ] **Step 1: Add the schema field**

Open `src/jazz/schema/JazzMessangerAccount.ts`. The current `JazzMessangerAccountRoot` shape includes `contactBook`, `devices`, `invitesIssued`. Add `knownConversations`:

```ts
import { Conversation } from "./Conversation";

export const JazzMessangerAccountRoot = co.map({
  contactBook: ContactBook,
  devices: co.list(DeviceRecord),
  invitesIssued: co.list(Invitation),
  knownConversations: co.list(Conversation),   // NEW
});
```

- [ ] **Step 2: Update the migration to initialize the empty list**

In the same file, the `withMigration` hook initializes root contents. Add:

```ts
// Inside the migration callback, when initializing root:
if (!me.root.knownConversations) {
  me.root.$jazz.set(
    "knownConversations",
    co.list(Conversation).create([], { owner: me }),
  );
}
```

Place this alongside the existing root field initializations.

- [ ] **Step 3: Update the schema test**

In `tests/unit/jazz/schema/JazzMessangerAccount.test.ts`, the existing smoke test should still pass. If the test asserts specific root fields, add `knownConversations` to the list.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all 67 unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/jazz/schema/JazzMessangerAccount.ts tests/unit/jazz/schema/JazzMessangerAccount.test.ts
git commit -m "schema(account): add knownConversations list for unified conversation discovery"
```

---

### Task 2: Remove `linkedConversation` field from Contact schema

**Files:**
- Modify: `src/jazz/schema/Contact.ts`

- [ ] **Step 1: Remove the field**

Open `src/jazz/schema/Contact.ts`. Remove the `linkedConversation` field and its forward-referenced Conversation import:

```ts
import { co, z } from "jazz-tools";

export const Contact = co.map({
  contactAccountID: z.string(),
  pinnedFingerprint: z.string(),
  displayNameLocal: z.string(),
  addedAt: z.date(),
  notes: z.string().optional(),
  // linkedConversation REMOVED — discovery now uses
  // me.root.knownConversations (Slice 3b spec §5).
});

export const ContactBook = co.list(Contact);
```

- [ ] **Step 2: Update the schema test**

In `tests/unit/jazz/schema/Contact.test.ts`, remove any reference to `linkedConversation`. The smoke test (`expect(Contact).toBeDefined()`) doesn't need changes.

- [ ] **Step 3: Run unit tests**

```bash
npm test
```

Expected: schema tests pass. (Tests in `conversation.test.ts` that reference `linkedConversation` will fail — that's expected and gets fixed in Phase B.)

- [ ] **Step 4: Commit**

```bash
git add src/jazz/schema/Contact.ts tests/unit/jazz/schema/Contact.test.ts
git commit -m "schema(contact): remove linkedConversation field (replaced by knownConversations)"
```

---

### Task 3: Sweep — identify all files that reference `linkedConversation`

**Files:** (none modified yet; sweep + record)

- [ ] **Step 1: Find all references**

```bash
grep -rn "linkedConversation" src/ tests/ 2>&1 | grep -v "^Binary"
```

Expected hits (the list to be cleaned up in Phases B/C/D):
- `src/jazz/conversation.ts` — `findOrCreate1to1Conversation`, `leaveConversation`, Inbox callback
- `src/components/sidebar.tsx` — iterates contactBook for linkedConversation refs
- `src/routes/conversations/detail.tsx` — title derivation + left-member fallback
- `src/routes/contacts/detail.tsx` — possibly (the Start chat handler — probably not direct)
- `src/App.tsx` — Inbox subscription callback
- `tests/unit/jazz/conversation.test.ts` — test scaffolding using the field

Record the list (you don't need to fix yet — Phases B/C/D do that).

- [ ] **Step 2: Smoke check that the build fails as expected**

```bash
npx tsc --noEmit
```

Expected: TypeScript errors at every linkedConversation usage. These are the call sites to update.

(No commit; this task is verification/inventory only.)

---

## Phase B — Protocol primitives

### Task 4: Refactor `findOrCreate1to1Conversation` to use `knownConversations`

**Files:**
- Modify: `src/jazz/conversation.ts`

- [ ] **Step 1: Rewrite the function**

Replace the existing `findOrCreate1to1Conversation` with the new version that searches `me.root.knownConversations` instead of `contact.linkedConversation`:

```ts
export async function findOrCreate1to1Conversation(
  me: Account,
  contact: any,
): Promise<any> {
  const otherAccountID = contact.contactAccountID as string;

  // Search knownConversations for an existing 1:1 with this contact
  const known = (me as any).root?.knownConversations ?? [];
  for (const c of Array.from(known)) {
    if (!c) continue;
    const cAny = c as any;
    if (cAny.kind !== "dm") continue;
    const group = cAny.$jazz?.owner;
    if (!group) continue;
    const otherMember = group
      .getDirectMembers()
      .find((m: any) => m.account?.$jazz?.id === otherAccountID);
    if (otherMember) {
      return cAny;
    }
  }

  // Defensive wait + recheck (same rationale as Slice 3a):
  // if the other party just created the conversation, our Inbox subscription
  // may still be processing the notification.
  await new Promise((r) => setTimeout(r, 300));
  const knownAfterWait = (me as any).root?.knownConversations ?? [];
  for (const c of Array.from(knownAfterWait)) {
    if (!c) continue;
    const cAny = c as any;
    if (cAny.kind !== "dm") continue;
    const group = cAny.$jazz?.owner;
    if (!group) continue;
    const otherMember = group
      .getDirectMembers()
      .find((m: any) => m.account?.$jazz?.id === otherAccountID);
    if (otherMember) {
      return cAny;
    }
  }

  // Create new conversation
  const otherAccount = await loadAccountByID(me, otherAccountID);
  if (!otherAccount) {
    throw new Error(
      `Cannot load account ${otherAccountID} — contact not reachable`,
    );
  }

  const conversationGroup = Group.create({ owner: me });
  conversationGroup.addMember(otherAccount, "admin"); // 1:1: both admin

  const conversation = Conversation.create(
    {
      kind: "dm",
      createdAt: new Date(),
      createdBy: (me as any).$jazz.id,
      messages: co.list(Message).create([], { owner: conversationGroup }),
    },
    { owner: conversationGroup },
  );

  // Push to my own knownConversations
  (me as any).root.knownConversations.$jazz.push(conversation);

  // Notify the other party via Inbox (unchanged from Slice 3a)
  const conversationID = (conversation as any).$jazz.id as string;
  void (async () => {
    try {
      const notificationGroup = Group.create({ owner: me });
      const notification = ConversationNotification.create(
        { conversationID },
        { owner: notificationGroup },
      );
      const sender = await InboxSender.load<typeof notification>(
        otherAccountID as any,
        me,
      );
      await sender.sendMessage(notification);
    } catch (e) {
      console.warn(
        "[inbox] Failed to deliver conversation to other party's inbox:",
        e,
      );
    }
  })();

  return conversation;
}
```

Helper functions (`loadAccountByID`, etc.) and imports (`ConversationNotification`, `InboxSender`) are already in `src/jazz/conversation.ts` — no new imports needed.

- [ ] **Step 2: Run tests**

```bash
npm test
```

The Slice 3a conversation tests should pass with the refactored implementation; if any reference `linkedConversation` directly, they'll need updating (next step).

- [ ] **Step 3: Update conversation.test.ts to remove linkedConversation references**

In `tests/unit/jazz/conversation.test.ts`, any test that constructs a stub `Contact` with `linkedConversation` should be updated to not include that field. The cache lookup test should be replaced with a knownConversations lookup test:

```ts
it("returns existing conversation when one is already in knownConversations", async () => {
  // ... setup account + create a conversation + push to knownConversations ...
  const result = await findOrCreate1to1Conversation(me, contactStub);
  expect(result.$jazz.id).toBe(existingConversation.$jazz.id);
});
```

Adjust the existing test structure as needed.

- [ ] **Step 4: Run conversation tests**

```bash
npm test -- conversation
```

Expected: all conversation.test.ts tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/jazz/conversation.ts tests/unit/jazz/conversation.test.ts
git commit -m "refactor(conversation): findOrCreate1to1 uses knownConversations not linkedConversation"
```

---

### Task 5: Update `createGroupConversation` to default added members to `writer`

**Files:**
- Modify: `src/jazz/conversation.ts`

- [ ] **Step 1: Change the role default**

In `src/jazz/conversation.ts`, the existing `createGroupConversation` adds members as `"admin"`. Change to `"writer"` (and push to my own knownConversations + send inbox notifications):

```ts
export async function createGroupConversation(
  me: Account,
  participantAccountIDs: string[],
  title: string,
): Promise<any> {
  const conversationGroup = Group.create({ owner: me });

  for (const accountID of participantAccountIDs) {
    const acc = await loadAccountByID(me, accountID);
    if (acc) {
      conversationGroup.addMember(acc, "writer"); // CHANGED from "admin"
    }
  }

  const conversation = Conversation.create(
    {
      title,
      kind: "group",
      createdAt: new Date(),
      createdBy: (me as any).$jazz.id,
      messages: co.list(Message).create([], { owner: conversationGroup }),
    },
    { owner: conversationGroup },
  );

  // Push to my own knownConversations
  (me as any).root.knownConversations.$jazz.push(conversation);

  // Notify each member via Inbox (fire-and-forget, parallel)
  const conversationID = (conversation as any).$jazz.id as string;
  for (const accountID of participantAccountIDs) {
    void (async () => {
      try {
        const notificationGroup = Group.create({ owner: me });
        const notification = ConversationNotification.create(
          { conversationID },
          { owner: notificationGroup },
        );
        const sender = await InboxSender.load<typeof notification>(
          accountID as any,
          me,
        );
        await sender.sendMessage(notification);
      } catch (e) {
        console.warn(
          `[inbox] Failed to deliver group conversation to ${accountID}:`,
          e,
        );
      }
    })();
  }

  return conversation;
}
```

Make the `title` parameter required (no longer optional) — groups should always have a title.

- [ ] **Step 2: Update / add a unit test**

In `tests/unit/jazz/conversation.test.ts`, add a test:

```ts
it("createGroupConversation adds participants as 'writer' by default", async () => {
  // Setup: 3 accounts (alice, bob, carol)
  // Call: alice.createGroupConversation([bob.id, carol.id], "Test Group")
  // Assert: the conversationGroup's direct members include bob + carol with role "writer"
  //         alice is the implicit admin (via Group.create owner)
});
```

- [ ] **Step 3: Run tests**

```bash
npm test -- conversation
```

- [ ] **Step 4: Commit**

```bash
git add src/jazz/conversation.ts tests/unit/jazz/conversation.test.ts
git commit -m "feat(conversation): createGroupConversation defaults new members to 'writer' role"
```

---

### Task 6: Implement `addMemberToConversation` and `removeMemberFromConversation`

**Files:**
- Modify: `src/jazz/conversation.ts`

- [ ] **Step 1: Add the functions**

Append to `src/jazz/conversation.ts`:

```ts
/**
 * Add a new member to a group conversation with the given role (default writer).
 * Sends an Inbox notification so the new member's sidebar auto-discovers.
 *
 * Admin-only action; caller should check role before invoking. Jazz validators
 * will reject if `me` doesn't have admin/manager role on the conversationGroup.
 */
export async function addMemberToConversation(
  me: Account,
  conversation: any,
  newAccountID: string,
  role: "admin" | "writer" = "writer",
): Promise<void> {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }

  const newAccount = await loadAccountByID(me, newAccountID);
  if (!newAccount) {
    throw new Error(`Cannot load account ${newAccountID}`);
  }

  conversationGroup.addMember(newAccount, role);

  // Notify the new member via their Inbox so their sidebar auto-discovers
  const conversationID = conversation.$jazz.id as string;
  void (async () => {
    try {
      const notificationGroup = Group.create({ owner: me });
      const notification = ConversationNotification.create(
        { conversationID },
        { owner: notificationGroup },
      );
      const sender = await InboxSender.load<typeof notification>(
        newAccountID as any,
        me,
      );
      await sender.sendMessage(notification);
    } catch (e) {
      console.warn(
        `[inbox] Failed to deliver group invite to ${newAccountID}:`,
        e,
      );
    }
  })();
}

/**
 * Remove a member from a group conversation.
 *
 * Admin-only action; caller should check role before invoking. Jazz auto-rotates
 * the readKey when a member is removed.
 */
export async function removeMemberFromConversation(
  me: Account,
  conversation: any,
  targetAccountID: string,
): Promise<void> {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }

  const targetAccount = await loadAccountByID(me, targetAccountID);
  if (!targetAccount) {
    throw new Error(`Cannot load account ${targetAccountID}`);
  }

  conversationGroup.removeMember(targetAccount);
}
```

- [ ] **Step 2: Add unit tests**

In `tests/unit/jazz/conversation.test.ts`:

```ts
it("addMemberToConversation adds with writer role by default", async () => {
  // Setup: alice creates a group with bob; carol is a new contact
  // Call: alice.addMemberToConversation(group, carolID)
  // Assert: group.getDirectMembers() now includes carol with role "writer"
});

it("addMemberToConversation respects explicit admin role", async () => {
  // Setup: alice creates a group with bob; carol is a new contact
  // Call: alice.addMemberToConversation(group, carolID, "admin")
  // Assert: group.getDirectMembers() now includes carol with role "admin"
});

it("removeMemberFromConversation revokes the target", async () => {
  // Setup: alice creates a group with bob; bob is added as writer
  // Call: alice.removeMemberFromConversation(group, bobID)
  // Assert: group.getRoleOf(bobID) returns undefined (revoked = filtered out)
});
```

- [ ] **Step 3: Run tests**

```bash
npm test -- conversation
```

- [ ] **Step 4: Commit**

```bash
git add src/jazz/conversation.ts tests/unit/jazz/conversation.test.ts
git commit -m "feat(conversation): add/remove member primitives for group management"
```

---

### Task 7: Implement `promoteToAdmin`, `demoteToWriter`, `updateConversationTitle`

**Files:**
- Modify: `src/jazz/conversation.ts`

- [ ] **Step 1: Add the functions**

Append to `src/jazz/conversation.ts`:

```ts
/**
 * Promote a writer to admin. Admin-only action.
 */
export async function promoteToAdmin(
  me: Account,
  conversation: any,
  targetAccountID: string,
): Promise<void> {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }
  const targetAccount = await loadAccountByID(me, targetAccountID);
  if (!targetAccount) {
    throw new Error(`Cannot load account ${targetAccountID}`);
  }
  // Re-adding with a different role updates the role
  conversationGroup.addMember(targetAccount, "admin");
}

/**
 * Demote an admin to writer. Admin-only action.
 *
 * Caller should check `isLastAdmin(target)` first — Jazz enforces "at least
 * one admin must remain" and will reject demoting the last admin.
 */
export async function demoteToWriter(
  me: Account,
  conversation: any,
  targetAccountID: string,
): Promise<void> {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }
  const targetAccount = await loadAccountByID(me, targetAccountID);
  if (!targetAccount) {
    throw new Error(`Cannot load account ${targetAccountID}`);
  }
  conversationGroup.addMember(targetAccount, "writer");
}

/**
 * Update the conversation title. Admin-only for groups; no-op for 1:1 (1:1
 * doesn't have an explicit title — derived from other participant's display name).
 */
export async function updateConversationTitle(
  _me: Account,
  conversation: any,
  newTitle: string,
): Promise<void> {
  if (conversation.kind !== "group") {
    return; // no-op for 1:1
  }
  conversation.$jazz.set("title", newTitle);
}
```

- [ ] **Step 2: Add unit tests**

```ts
it("promoteToAdmin changes role from writer to admin", async () => {
  // Setup: alice creates group, bob is writer
  // Call: alice.promoteToAdmin(group, bobID)
  // Assert: group.getDirectMembers() shows bob with role "admin"
});

it("demoteToWriter changes role from admin to writer", async () => {
  // Setup: alice creates group, bob is admin
  // Call: alice.demoteToWriter(group, bobID)
  // Assert: group.getDirectMembers() shows bob with role "writer"
});

it("updateConversationTitle changes the title for groups", async () => {
  // Setup: alice creates group with title "Old"
  // Call: alice.updateConversationTitle(conv, "New")
  // Assert: conv.title === "New"
});

it("updateConversationTitle is a no-op for 1:1 conversations", async () => {
  // Setup: alice creates 1:1 conversation with bob
  // Call: alice.updateConversationTitle(conv, "Anything")
  // Assert: conv.title is unchanged (likely undefined)
});
```

- [ ] **Step 3: Run tests**

```bash
npm test -- conversation
```

- [ ] **Step 4: Commit**

```bash
git add src/jazz/conversation.ts tests/unit/jazz/conversation.test.ts
git commit -m "feat(conversation): promote/demote role + update title primitives"
```

---

### Task 8: Implement `isLastAdmin` + refactor `leaveConversation` to manage `knownConversations`

**Files:**
- Modify: `src/jazz/conversation.ts`

- [ ] **Step 1: Add `isLastAdmin` helper**

```ts
/**
 * Returns true when `me` is the only direct admin of the conversation's group.
 * Used to decide whether the leave flow needs to prompt for promotion.
 */
export function isLastAdmin(me: Account, conversation: any): boolean {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) return false;
  const admins = conversationGroup
    .getDirectMembers()
    .filter((m: any) => m.role === "admin");
  return (
    admins.length === 1 &&
    admins[0]?.account?.$jazz?.id === (me as any).$jazz?.id
  );
}
```

- [ ] **Step 2: Update `leaveConversation` to also remove from knownConversations**

Find the existing `leaveConversation` in `src/jazz/conversation.ts`. Update it to remove the conversation from `me.root.knownConversations` (in addition to its existing revoke behavior). Remove any `linkedConversation` clearing logic (the field doesn't exist anymore):

```ts
export async function leaveConversation(
  me: Account,
  conversation: any,
): Promise<void> {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }

  // Revoke myself from the ConversationGroup; Jazz auto-rotates the readKey
  conversationGroup.removeMember(me);

  // Remove from my own knownConversations list
  const known = (me as any).root?.knownConversations;
  if (known) {
    const conversationID = conversation.$jazz?.id;
    for (let i = 0; i < known.length; i++) {
      const entry = known[i];
      if (entry?.$jazz?.id === conversationID) {
        known.$jazz.delete(i);
        break;
      }
    }
  }
}
```

The exact API for removing an element from a CoList by index may differ; verify via `node_modules/jazz-tools/dist/`. Likely candidates: `$jazz.delete(index)`, `$jazz.remove(item)`, or `$jazz.splice(index, 1)`. Document the API path used.

- [ ] **Step 3: Add unit tests**

```ts
it("isLastAdmin returns true when I'm the only admin", async () => {
  // Setup: alice creates group, bob is writer
  // Call: isLastAdmin(alice, conv)
  // Expect: true
});

it("isLastAdmin returns false when there are multiple admins", async () => {
  // Setup: alice creates group, bob is admin (promoted)
  // Call: isLastAdmin(alice, conv)
  // Expect: false
});

it("leaveConversation removes the conversation from knownConversations", async () => {
  // Setup: alice creates conv, pushes to knownConversations
  // Call: alice.leaveConversation(conv)
  // Assert: alice.root.knownConversations no longer contains conv
});
```

- [ ] **Step 4: Run tests**

```bash
npm test -- conversation
```

- [ ] **Step 5: Commit**

```bash
git add src/jazz/conversation.ts tests/unit/jazz/conversation.test.ts
git commit -m "feat(conversation): isLastAdmin helper; leaveConversation removes from knownConversations"
```

---

### Task 9: Refactor Inbox subscription callback in App.tsx

**Files:**
- Modify: `src/App.tsx`

The Slice 3a App.tsx has an Inbox subscription that receives `ConversationNotification` messages and sets `contact.linkedConversation`. Replace with pushing to `me.root.knownConversations` (with deduplication).

- [ ] **Step 1: Update the subscription callback**

In `src/App.tsx`, find the inbox subscription setup (likely in a `useEffect` or hook). The callback currently:

```ts
// OLD (Slice 3a): set contact's linkedConversation
const contact = (me as any).root.contactBook.find(
  (c: any) => c?.contactAccountID === senderAccountID,
);
if (contact && !contact.linkedConversation) {
  contact.$jazz.set("linkedConversation", conversation);
}
```

Replace with:

```ts
// NEW (Slice 3b): push to knownConversations with dedup
const known = (me as any).root?.knownConversations;
if (!known) return;

const conversationID = conversation.$jazz?.id;
const alreadyKnown = Array.from(known).some(
  (c: any) => c?.$jazz?.id === conversationID,
);
if (!alreadyKnown) {
  known.$jazz.push(conversation);
}
```

If the Inbox callback receives a `ConversationNotification` wrapper (which it does — see Slice 3a's design), the callback must:
1. Read `notification.conversationID`
2. Load the Conversation by ID via Jazz API
3. Push to knownConversations (with dedup as above)

Verify the existing flow handles this; mostly we're just changing the destination of the push.

- [ ] **Step 2: Run unit tests**

```bash
npm test
```

Expected: pass.

- [ ] **Step 3: Run Slice 3a e2e tests to verify auto-discovery still works**

```bash
npm run test:e2e -- conversation-auto-discovery
```

Expected: pass on chromium + firefox. The mechanism is now knownConversations-based instead of linkedConversation-based, but Bob's sidebar should still auto-populate.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "refactor(app): inbox subscription pushes to knownConversations (was linkedConversation)"
```

---

## Phase C — UI components

### Task 10: Refactor ContactPicker to multi-select

**Files:**
- Modify: `src/components/contact-picker.tsx`

The existing single-select ContactPicker fires `onSelect(contact)` on row click. Refactor to multi-select with checkboxes and a Continue button.

- [ ] **Step 1: Rewrite the component**

```tsx
import { useState } from "react";
import { useAccount } from "jazz-tools/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";

interface ContactPickerProps {
  /** Called with the array of selected contacts when user clicks Continue */
  onSelect: (contacts: any[]) => void;
  onClose: () => void;
  /** Optional filter — e.g., exclude contacts already in a group */
  excludeAccountIDs?: string[];
}

export function ContactPicker({
  onSelect,
  onClose,
  excludeAccountIDs = [],
}: ContactPickerProps) {
  const me = useAccount(JazzMessangerAccount, {
    resolve: { root: { contactBook: { $each: true } } },
  });

  const [selectedIDs, setSelectedIDs] = useState<Set<string>>(new Set());

  if (!me?.$isLoaded) return null;

  const allContacts: any[] = Array.from((me as any).root?.contactBook ?? []);
  const visibleContacts = allContacts.filter(
    (c) =>
      c?.contactAccountID && !excludeAccountIDs.includes(c.contactAccountID),
  );

  function toggle(accountID: string) {
    setSelectedIDs((prev) => {
      const next = new Set(prev);
      if (next.has(accountID)) {
        next.delete(accountID);
      } else {
        next.add(accountID);
      }
      return next;
    });
  }

  function handleContinue() {
    const selected = visibleContacts.filter((c) =>
      selectedIDs.has(c.contactAccountID),
    );
    if (selected.length === 0) return;
    onSelect(selected);
  }

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

        {visibleContacts.length === 0 ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              You have no contacts available.
            </p>
            <Link to="/contacts/add" onClick={onClose}>
              <Button>Add a contact</Button>
            </Link>
          </div>
        ) : (
          <>
            <ul
              className="space-y-1 max-h-80 overflow-y-auto"
              data-testid="contact-picker-list"
            >
              {visibleContacts.map((c, i) => {
                const isSelected = selectedIDs.has(c.contactAccountID);
                return (
                  <li key={c.contactAccountID}>
                    <button
                      onClick={() => toggle(c.contactAccountID)}
                      className={`w-full text-left px-3 py-2 hover:bg-accent rounded text-sm flex items-center gap-3 ${
                        isSelected ? "bg-accent" : ""
                      }`}
                      data-testid={`contact-picker-row-${i}`}
                      aria-pressed={isSelected}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="pointer-events-none"
                        tabIndex={-1}
                      />
                      <span>{c.displayNameLocal ?? "(unknown)"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <p
              className="text-xs text-muted-foreground mt-3"
              data-testid="contact-picker-count"
            >
              {selectedIDs.size === 0
                ? "Pick one to start a 1:1 chat, or several for a group."
                : selectedIDs.size === 1
                ? "1 selected — will start a 1:1 chat"
                : `${selectedIDs.size} selected — will start a group`}
            </p>
          </>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={onClose}
            data-testid="contact-picker-cancel"
          >
            Cancel
          </Button>
          {visibleContacts.length > 0 && (
            <Button
              onClick={handleContinue}
              disabled={selectedIDs.size === 0}
              data-testid="contact-picker-continue"
            >
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update callers**

Sidebar (`src/components/sidebar.tsx`) currently uses `onSelect={(contact) => ...}`. Will be updated in Task 15 to handle the new `(contacts: any[])` callback signature.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: TypeScript errors in any caller that uses the old single-contact callback — these get fixed in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add src/components/contact-picker.tsx
git commit -m "feat(ui): multi-select ContactPicker with Continue button"
```

---

### Task 11: Create RolePill component

**Files:**
- Create: `src/components/role-pill.tsx`

- [ ] **Step 1: Implement**

```tsx
interface RolePillProps {
  role: "admin" | "writer";
}

/**
 * Small badge rendering a member's role in a group conversation.
 * Used in the member list (/conversations/:id/members).
 */
export function RolePill({ role }: RolePillProps) {
  const styles =
    role === "admin"
      ? "bg-blue-100 text-blue-800"
      : "bg-gray-100 text-gray-700";

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles}`}
      data-testid={`role-pill-${role}`}
    >
      {role}
    </span>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/role-pill.tsx
git commit -m "feat(ui): RolePill badge component for member list"
```

---

### Task 12: Create GroupCreateDialog

**Files:**
- Create: `src/components/group-create-dialog.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface GroupCreateDialogProps {
  /** Names of the selected participants for context */
  participantNames: string[];
  onCreate: (title: string) => void | Promise<void>;
  onCancel: () => void;
}

const MAX_TITLE_LENGTH = 60;

/**
 * Modal asking for a group title after the user has selected 2+ contacts
 * in the multi-select picker.
 */
export function GroupCreateDialog({
  participantNames,
  onCreate,
  onCancel,
}: GroupCreateDialogProps) {
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    const trimmed = title.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      await onCreate(trimmed);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onCancel}
      data-testid="group-create-overlay"
    >
      <div
        className="bg-background rounded-lg p-6 max-w-md w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-2">Name your group</h2>
        <p className="text-sm text-muted-foreground mb-4">
          With {participantNames.slice(0, 3).join(", ")}
          {participantNames.length > 3
            ? ` and ${participantNames.length - 3} other${participantNames.length - 3 === 1 ? "" : "s"}`
            : ""}
        </p>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TITLE_LENGTH}
          placeholder="Group name"
          className="w-full p-2 border rounded text-sm"
          autoFocus
          data-testid="group-create-title-input"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleCreate();
            }
          }}
        />

        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={creating}
            data-testid="group-create-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!title.trim() || creating}
            data-testid="group-create-submit"
          >
            {creating ? "Creating…" : "Create group"}
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
git add src/components/group-create-dialog.tsx
git commit -m "feat(ui): GroupCreateDialog for naming a new group conversation"
```

---

### Task 13: Create LeaveWithPromoteDialog

**Files:**
- Create: `src/components/leave-with-promote-dialog.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Candidate {
  accountID: string;
  displayName: string;
  currentRole: "admin" | "writer";
}

interface LeaveWithPromoteDialogProps {
  /** Members eligible to be promoted (writers — excluding self) */
  candidates: Candidate[];
  onLeave: (newAdminAccountID: string) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Modal shown when the only remaining admin tries to leave a group.
 * Requires picking a member to promote to admin before the leave completes.
 */
export function LeaveWithPromoteDialog({
  candidates,
  onLeave,
  onCancel,
}: LeaveWithPromoteDialogProps) {
  const [selectedID, setSelectedID] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  async function handleLeave() {
    if (!selectedID || leaving) return;
    setLeaving(true);
    try {
      await onLeave(selectedID);
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onCancel}
      data-testid="leave-promote-overlay"
    >
      <div
        className="bg-background rounded-lg p-6 max-w-md w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-2">You're the only admin</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Promote another member to admin before leaving. They'll be able to
          manage the group after you go.
        </p>

        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No other members to promote. You can leave anyway, but the
            conversation will become inaccessible.
          </p>
        ) : (
          <ul
            className="space-y-1 max-h-60 overflow-y-auto mb-4"
            data-testid="leave-promote-candidates"
          >
            {candidates.map((c, i) => (
              <li key={c.accountID}>
                <button
                  onClick={() => setSelectedID(c.accountID)}
                  className={`w-full text-left px-3 py-2 hover:bg-accent rounded text-sm flex items-center gap-3 ${
                    selectedID === c.accountID ? "bg-accent" : ""
                  }`}
                  data-testid={`leave-promote-candidate-${i}`}
                  aria-pressed={selectedID === c.accountID}
                >
                  <input
                    type="radio"
                    checked={selectedID === c.accountID}
                    onChange={() => {}}
                    className="pointer-events-none"
                    tabIndex={-1}
                  />
                  <span>{c.displayName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={leaving}
            data-testid="leave-promote-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleLeave}
            disabled={!selectedID || leaving}
            data-testid="leave-promote-submit"
          >
            {leaving ? "Leaving…" : "Promote and leave"}
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
git add src/components/leave-with-promote-dialog.tsx
git commit -m "feat(ui): LeaveWithPromoteDialog for last-admin leave flow"
```

---

### Task 14: Create SystemEvent component (extracted from inline rendering)

**Files:**
- Create: `src/components/system-event.tsx`

- [ ] **Step 1: Implement**

Generic system event pill, used for both "X left the chat" and (new) "X added Y to the chat" events. Slice 3a's `conversations/detail.tsx` currently renders the left-event inline; this extraction will be wired in Task 16.

```tsx
interface SystemEventProps {
  kind: "left" | "added";
  /** For "left": the leaver's display name. For "added": the new member's display name. */
  targetName: string;
  /** For "added": the admin who added them. Unused for "left". */
  actorName?: string;
}

/**
 * Center-aligned pill rendering a system event in the conversation timeline.
 *
 * For v1 we render these at the bottom of the timeline as snapshots from the
 * current group state (see Slice 3b spec §9). Chronologically-positioned
 * inline events are a future enhancement (Linear TaskList #27).
 */
export function SystemEvent({ kind, targetName, actorName }: SystemEventProps) {
  const message =
    kind === "left"
      ? `${targetName} left the chat`
      : `${actorName ?? "Someone"} added ${targetName} to the chat`;

  return (
    <div
      className="flex justify-center py-2"
      data-testid={`system-event-${kind}`}
    >
      <div className="bg-muted text-xs text-muted-foreground italic px-3 py-1 rounded-full">
        {message}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

- [ ] **Step 3: Commit**

```bash
git add src/components/system-event.tsx
git commit -m "feat(ui): SystemEvent component (extracted from inline left-event rendering)"
```

---

## Phase D — Routes

### Task 15: Refactor Sidebar to iterate `knownConversations`

**Files:**
- Modify: `src/components/sidebar.tsx`

The current sidebar iterates `me.root.contactBook` for entries with `linkedConversation` refs. Replace with iterating `me.root.knownConversations` directly. Also update the ContactPicker callback to handle the new multi-select array signature.

- [ ] **Step 1: Update the resolve query**

```tsx
const me = useAccount(JazzMessangerAccount, {
  resolve: {
    profile: true,
    root: {
      contactBook: { $each: true },                                    // for 1:1 title resolution
      knownConversations: { $each: { messages: { $each: true } } },    // for list + sort
    },
  },
});
```

- [ ] **Step 2: Update the conversation list derivation**

Replace the existing iteration over contactBook with:

```tsx
import { findOrCreate1to1Conversation, createGroupConversation } from "@/jazz/conversation";
import { GroupCreateDialog } from "@/components/group-create-dialog";

// State for the new flows
const [pickerOpen, setPickerOpen] = useState(false);
const [groupDialogContacts, setGroupDialogContacts] = useState<any[] | null>(null);

// Derive conversation list from knownConversations
const allConversations: any[] = Array.from(
  (me as any).root?.knownConversations ?? [],
);

const visibleConversations = allConversations.filter((c) => {
  if (!c) return false;
  const group = c.$jazz?.owner;
  if (!group) return false;
  // Hide conversations I've been revoked from
  const myRole = group.getRoleOf?.((me as any).$jazz.id);
  return myRole !== undefined;  // undefined = revoked or never-a-member
});

// Sort by last-message activity, fallback to createdAt
visibleConversations.sort((a: any, b: any) => {
  const aLast = a.messages?.[a.messages.length - 1]?.sentAt;
  const bLast = b.messages?.[b.messages.length - 1]?.sentAt;
  const aTime = aLast ? new Date(aLast).getTime() : new Date(a.createdAt).getTime();
  const bTime = bLast ? new Date(bLast).getTime() : new Date(b.createdAt).getTime();
  return bTime - aTime;
});

// Build accountID → display name for 1:1 title derivation
const contactDisplayNames: Record<string, string> = {};
for (const c of Array.from((me as any).root?.contactBook ?? [])) {
  const cAny = c as any;
  if (cAny?.contactAccountID && cAny?.displayNameLocal) {
    contactDisplayNames[cAny.contactAccountID] = cAny.displayNameLocal;
  }
}

function deriveTitle(conversation: any): string {
  if (conversation.kind === "group") {
    return conversation.title || "Untitled group";
  }
  // 1:1: title = other participant's display name
  const group = conversation.$jazz?.owner;
  if (!group) return "Conversation";
  const others = group.getDirectMembers().filter(
    (m: any) => m.account?.$jazz?.id !== (me as any).$jazz.id,
  );
  if (others.length === 0) return "Conversation";
  const otherID = others[0]?.account?.$jazz?.id;
  return contactDisplayNames[otherID] ?? "(unknown)";
}

async function handleContactsSelected(contacts: any[]) {
  setPickerOpen(false);
  if (contacts.length === 1) {
    // 1:1 chat
    const conversation = await findOrCreate1to1Conversation(me, contacts[0]);
    navigate(`/conversations/${(conversation as any).$jazz.id}`);
  } else if (contacts.length >= 2) {
    // Group — collect title via dialog
    setGroupDialogContacts(contacts);
  }
}

async function handleGroupCreate(title: string) {
  if (!groupDialogContacts) return;
  const participantIDs = groupDialogContacts.map((c: any) => c.contactAccountID);
  const conversation = await createGroupConversation(me, participantIDs, title);
  setGroupDialogContacts(null);
  navigate(`/conversations/${(conversation as any).$jazz.id}`);
}
```

- [ ] **Step 3: Update the JSX rendering**

```tsx
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
        {visibleConversations.length === 0 ? (
          <div className="p-4 text-center space-y-3">
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
            <Link to="/contacts">
              <Button size="sm">Browse contacts</Button>
            </Link>
          </div>
        ) : (
          visibleConversations.map((c: any, i: number) => (
            <Link
              key={c.$jazz?.id ?? i}
              to={`/conversations/${c.$jazz?.id}`}
              className="block p-2 hover:bg-accent rounded text-sm"
              data-testid={`conversation-row-${i}`}
            >
              {deriveTitle(c)}
            </Link>
          ))
        )}
      </nav>

      <footer className="p-4 border-t border-border flex flex-col gap-2">
        <Link to="/contacts" className="text-sm text-muted-foreground hover:text-foreground" data-testid="contacts-link">
          📇 Contacts
        </Link>
        <Link to="/settings" className="text-sm text-muted-foreground hover:text-foreground" data-testid="settings-link">
          ⚙ Settings
        </Link>
      </footer>
    </aside>

    {pickerOpen && (
      <ContactPicker
        onSelect={handleContactsSelected}
        onClose={() => setPickerOpen(false)}
      />
    )}

    {groupDialogContacts && (
      <GroupCreateDialog
        participantNames={groupDialogContacts.map((c) => c.displayNameLocal ?? "Contact")}
        onCreate={handleGroupCreate}
        onCancel={() => setGroupDialogContacts(null)}
      />
    )}
  </>
);
```

- [ ] **Step 4: Verify type-check + tests**

```bash
npx tsc --noEmit
npm test
npm run test:e2e
```

E2E should still pass for the Slice 1-3a specs (sidebar selectors `sidebar-display-name`, `new-chat-btn`, `conversation-list`, `conversation-row-${i}`, `contacts-link`, `settings-link` are preserved).

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "refactor(sidebar): iterate knownConversations; ContactPicker multi-select handles 1:1 vs group"
```

---

### Task 16: Refactor ConversationDetailRoute — title is Link; generalize left-member detection

**Files:**
- Modify: `src/routes/conversations/detail.tsx`

Two changes:
1. The conversation header's title becomes a Link to `/conversations/:id/members`
2. The left-member detection (currently uses `contact.linkedConversation` for the fallback) is generalized to iterate ConversationGroup members and identify the leaver via accountID lookup in contactBook

- [ ] **Step 1: Update the title to a Link**

In the conversation header section, change:

```tsx
<h1 className="flex-1 font-semibold text-gray-900 truncate" data-testid="conversation-title">
  {conversationTitle}
</h1>
```

to:

```tsx
<Link
  to={`/conversations/${id}/members`}
  className="flex-1 font-semibold text-gray-900 truncate hover:underline"
  data-testid="conversation-title"
>
  {conversationTitle}
</Link>
```

- [ ] **Step 2: Generalize title derivation**

Remove any code that uses `contact.linkedConversation`. The new derivation:

```tsx
// Derive title
let conversationTitle = "Conversation";
if (conversation) {
  if (conversation.kind === "group") {
    conversationTitle = conversation.title || "Untitled group";
  } else if (conversation.kind === "dm") {
    // Find the other ConversationGroup member, then look them up in contactBook
    const group = conversation.$jazz?.owner;
    if (group) {
      const others = group.getDirectMembers().filter(
        (m: any) => m.account?.$jazz?.id !== (me as any).$jazz.id,
      );
      if (others.length > 0) {
        const otherID = others[0].account?.$jazz?.id;
        const contact = Array.from((me as any).root?.contactBook ?? []).find(
          (c: any) => c?.contactAccountID === otherID,
        );
        conversationTitle = (contact as any)?.displayNameLocal ?? "(unknown)";
      }
    }
  }
}
```

- [ ] **Step 3: Generalize left-member detection**

Remove the `composerDisabled`-based + `Conversation.createdBy`-fallback detection from Slice 3a. Replace with: iterate all contacts in `me.root.contactBook`, check each one's `getRoleOf` on the conversation group; if any returns `undefined` AND the contact was a member of the original group (heuristic: we can't tell who was originally a member without history; pragmatic fallback: any contact whose `getRoleOf` returns undefined could be either "never a member" or "revoked" — for snapshot-only v1, we treat all `undefined` contacts as potentially-revoked).

Better heuristic: for a 1:1 (kind="dm"), there's exactly one other contact who's a member; check their role. For a group, iterate contacts and rely on the user having context to know who "should" be there.

```tsx
// Detect left members (snapshot-based — Slice 3b spec §9 limitation)
const leftMembers: { accountID: string; displayName: string }[] = [];
if (conversation && conversation.kind === "group") {
  // For groups: scan contacts; if a contact who was previously in this group
  // is now revoked, show them as "left." Without group history we use a
  // heuristic: any contact whose getRoleOf returns undefined could be
  // never-a-member OR revoked. We accept the false positives are filtered
  // by the user's own knowledge of who's in the group. To reduce noise,
  // only show contacts who appear in current `knownConversations` for THIS
  // conversation's membership history (which we don't have either).
  //
  // Pragmatic v1: just render the "left" pill for the 1:1 case where we
  // can be sure, and skip for groups until we have proper history reading.
} else if (conversation && conversation.kind === "dm") {
  const group = conversation.$jazz?.owner;
  if (group) {
    const activeOthers = group.getDirectMembers().filter(
      (m: any) =>
        (m.role === "admin" || m.role === "writer") &&
        m.account?.$jazz?.id !== (me as any).$jazz.id,
    );
    if (activeOthers.length === 0) {
      // Someone left — find their accountID
      // Strategy: use createdBy if it's not me; otherwise iterate contactBook
      const createdBy = (conversation as any).createdBy;
      const myID = (me as any).$jazz.id;
      let leaverID: string | undefined;
      if (createdBy && createdBy !== myID) {
        leaverID = createdBy;
      } else {
        // I'm the creator — leaver is the only contact who's in my contactBook
        // and whose getRoleOf returns undefined on this group
        for (const c of Array.from((me as any).root?.contactBook ?? [])) {
          const cAny = c as any;
          if (!cAny?.contactAccountID || cAny.contactAccountID === myID) continue;
          const role = group.getRoleOf?.(cAny.contactAccountID);
          if (role === undefined) {
            leaverID = cAny.contactAccountID;
            break;
          }
        }
      }
      if (leaverID) {
        const contact = Array.from((me as any).root?.contactBook ?? []).find(
          (c: any) => c?.contactAccountID === leaverID,
        );
        leftMembers.push({
          accountID: leaverID,
          displayName: (contact as any)?.displayNameLocal ?? "Someone",
        });
      }
    }
  }
}
```

- [ ] **Step 4: Render leftMembers using the new SystemEvent component**

Replace the inline pill rendering with:

```tsx
import { SystemEvent } from "@/components/system-event";

// In the timeline section, after messages.map(...):
{leftMembers.map((m) => (
  <SystemEvent
    key={`left-${m.accountID}`}
    kind="left"
    targetName={m.displayName}
  />
))}
```

For "added" events (groups), we'd similarly iterate active members and compare against `createdBy`'s original membership — but without group history, the simplest v1 is "show 'added' for any direct member who isn't the creator and isn't me." This is approximate; it shows everyone added after creation as "added" but also incorrectly flags the initial group's members. **For Slice 3b**: ship just the "left" event (existing 3a behavior generalized); defer "added" event rendering until we can read group history (TaskList #27). Document in code comments.

- [ ] **Step 5: Verify type-check + tests**

```bash
npx tsc --noEmit
npm test
npm run test:e2e -- leave-conversation
```

Expected: leave-conversation e2e still passes.

- [ ] **Step 6: Commit**

```bash
git add src/routes/conversations/detail.tsx
git commit -m "refactor(conversations): title is Link; left-member detection no longer uses linkedConversation"
```

---

### Task 17: Create MembersRoute (`/conversations/:id/members`)

**Files:**
- Create: `src/routes/conversations/members.tsx`

- [ ] **Step 1: Implement the route component**

```tsx
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAccount, useCoState } from "jazz-tools/react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/sidebar";
import { RolePill } from "@/components/role-pill";
import { SafetyNumber } from "@/components/safety-number";
import { ContactPicker } from "@/components/contact-picker";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { Conversation } from "@/jazz/schema/Conversation";
import {
  addMemberToConversation,
  removeMemberFromConversation,
  promoteToAdmin,
  demoteToWriter,
  updateConversationTitle,
} from "@/jazz/conversation";

export function MembersRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const me = useAccount(JazzMessangerAccount, {
    resolve: { profile: true, root: { contactBook: { $each: true } } },
  });
  const conversation = useCoState(Conversation, id as any, {});

  // Poll for group state changes (same pattern as Slice 3a detail.tsx)
  const [pollTick, setPollTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => {
    const interval = setInterval(() => setPollTick((t) => t + 1), 2000);
    return interval;
  });
  void pollTick;

  if (!me?.$isLoaded || !conversation) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

  const myAccountID = (me as any).$jazz.id;
  const conversationGroup = (conversation as any).$jazz?.owner;
  const myRole = conversationGroup?.getRoleOf?.(myAccountID);
  const isAdmin = myRole === "admin";

  // Build accountID → displayName from contactBook
  const contactDisplayNames: Record<string, string> = {};
  const contactPubkeys: Record<string, string> = {};
  for (const c of Array.from((me as any).root?.contactBook ?? [])) {
    const cAny = c as any;
    if (cAny?.contactAccountID) {
      if (cAny.displayNameLocal) contactDisplayNames[cAny.contactAccountID] = cAny.displayNameLocal;
      if (cAny.pinnedFingerprint) contactPubkeys[cAny.contactAccountID] = cAny.pinnedFingerprint;
    }
  }

  function nameOf(accountID: string): string {
    if (accountID === myAccountID) {
      return ((me as any).profile?.displayName ?? "Me") + " (you)";
    }
    return contactDisplayNames[accountID] ?? "(unknown)";
  }

  const isGroup = (conversation as any).kind === "group";

  // ── Render 1:1 info pane ────────────────────────────────────────────
  if (!isGroup) {
    const directMembers = conversationGroup?.getDirectMembers() ?? [];
    const other = directMembers.find((m: any) => m.account?.$jazz?.id !== myAccountID);
    const otherID = other?.account?.$jazz?.id;
    const otherName = otherID ? contactDisplayNames[otherID] ?? "(unknown)" : "(unknown)";
    const otherPubkey = otherID ? contactPubkeys[otherID] : undefined;

    return (
      <div className="flex h-screen" data-testid="members-route-1to1">
        <Sidebar />
        <main className="flex-1 p-6 max-w-2xl mx-auto">
          <Link to={`/conversations/${id}`} className="text-sm text-muted-foreground">← Back to chat</Link>
          <h1 className="text-2xl font-semibold mt-4">{otherName}</h1>
          <p className="text-sm text-muted-foreground">Direct conversation</p>

          {otherPubkey && (
            <section className="mt-6 space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">Safety number</h2>
              <SafetyNumber fingerprintHex={otherPubkey} />
            </section>
          )}
        </main>
      </div>
    );
  }

  // ── Render group member list ────────────────────────────────────────
  const members = (conversationGroup?.getDirectMembers() ?? []).filter(
    (m: any) => m.role === "admin" || m.role === "writer",
  );

  function handleStartEditTitle() {
    if (!isAdmin) return;
    setTitleDraft((conversation as any).title ?? "");
    setEditingTitle(true);
  }

  async function handleSaveTitle() {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setEditingTitle(false);
      return;
    }
    await updateConversationTitle(me, conversation, trimmed);
    setEditingTitle(false);
  }

  async function handleAddMember(contacts: any[]) {
    setAddPickerOpen(false);
    if (contacts.length === 0) return;
    // Add each picked contact as writer
    for (const c of contacts) {
      try {
        await addMemberToConversation(me, conversation, c.contactAccountID);
      } catch (e) {
        console.warn("Failed to add member:", e);
      }
    }
  }

  async function handleRemove(memberAccountID: string) {
    if (!isAdmin) return;
    if (!confirm("Remove this member from the chat? They will lose access to future messages.")) return;
    try {
      await removeMemberFromConversation(me, conversation, memberAccountID);
    } catch (e) {
      alert("Failed to remove member: " + String(e));
    }
  }

  async function handlePromote(memberAccountID: string) {
    if (!isAdmin) return;
    try {
      await promoteToAdmin(me, conversation, memberAccountID);
    } catch (e) {
      alert("Failed to promote: " + String(e));
    }
  }

  async function handleDemote(memberAccountID: string) {
    if (!isAdmin) return;
    try {
      await demoteToWriter(me, conversation, memberAccountID);
    } catch (e) {
      alert("Failed to demote: " + String(e));
    }
  }

  const excludeIDs = members.map((m: any) => m.account?.$jazz?.id).filter(Boolean);

  return (
    <div className="flex h-screen" data-testid="members-route-group">
      <Sidebar />
      <main className="flex-1 p-6 max-w-2xl mx-auto">
        <Link to={`/conversations/${id}`} className="text-sm text-muted-foreground">← Back to chat</Link>

        <div className="mt-4 flex items-center gap-2">
          {editingTitle ? (
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSaveTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              maxLength={60}
              autoFocus
              className="text-2xl font-semibold flex-1 border-b border-border bg-transparent outline-none"
              data-testid="group-title-input"
            />
          ) : (
            <h1 className="text-2xl font-semibold flex-1" data-testid="group-title">
              {(conversation as any).title || "Untitled group"}
            </h1>
          )}
          {isAdmin && !editingTitle && (
            <Button size="sm" variant="ghost" onClick={handleStartEditTitle} data-testid="edit-title-btn">
              ✏
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Group · {members.length} member{members.length === 1 ? "" : "s"}
        </p>

        {isAdmin && (
          <div className="mt-4">
            <Button onClick={() => setAddPickerOpen(true)} data-testid="add-member-btn">
              + Add member
            </Button>
          </div>
        )}

        <ul className="mt-6 space-y-1" data-testid="members-list">
          {members.map((m: any, i: number) => {
            const memberID = m.account?.$jazz?.id;
            if (!memberID) return null;
            const isSelf = memberID === myAccountID;
            const role = m.role as "admin" | "writer";
            return (
              <li
                key={memberID}
                className="flex items-center gap-3 p-3 border-b border-border"
                data-testid={`member-row-${i}`}
              >
                <span className="flex-1">{nameOf(memberID)}</span>
                <RolePill role={role} />
                {isAdmin && !isSelf && (
                  <div className="flex gap-1">
                    {role === "writer" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePromote(memberID)}
                        data-testid={`promote-btn-${i}`}
                      >
                        Promote
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDemote(memberID)}
                        data-testid={`demote-btn-${i}`}
                      >
                        Demote
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRemove(memberID)}
                      data-testid={`remove-btn-${i}`}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </main>

      {addPickerOpen && (
        <ContactPicker
          onSelect={handleAddMember}
          onClose={() => setAddPickerOpen(false)}
          excludeAccountIDs={excludeIDs}
        />
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
git add src/routes/conversations/members.tsx
git commit -m "feat(routes): /conversations/:id/members route with group management + 1:1 info pane"
```

---

### Task 18: Wire `/conversations/:id/members` in App.tsx + integrate LeaveWithPromoteDialog

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/routes/conversations/detail.tsx`

- [ ] **Step 1: Add the route in App.tsx**

```tsx
import { MembersRoute } from "@/routes/conversations/members";

// Inside the authenticated <Routes>:
<Route path="/conversations/:id/members" element={<MembersRoute />} />
```

- [ ] **Step 2: Integrate LeaveWithPromoteDialog in detail.tsx**

In `src/routes/conversations/detail.tsx`, the existing `handleLeave` directly calls `leaveConversation`. Wrap it with the last-admin check:

```tsx
import { LeaveWithPromoteDialog } from "@/components/leave-with-promote-dialog";
import { isLastAdmin, promoteToAdmin } from "@/jazz/conversation";

// State for the promote dialog
const [leavePromoteOpen, setLeavePromoteOpen] = useState(false);

async function handleLeave() {
  if (!conversation) return;
  setMenuOpen(false);

  const group = (conversation as any).$jazz?.owner;
  if (!group) return;

  const lastAdmin = isLastAdmin(me, conversation);
  const otherMembers = group.getDirectMembers().filter(
    (m: any) =>
      (m.role === "admin" || m.role === "writer") &&
      m.account?.$jazz?.id !== (me as any).$jazz.id,
  );

  if (lastAdmin && otherMembers.length > 0) {
    // Need to promote someone first
    setLeavePromoteOpen(true);
    return;
  }

  // Either I'm not the last admin, OR there's no one else (edge case)
  if (!confirm("Leave this conversation? You will lose access to its messages.")) return;
  await leaveConversation(me, conversation);
  navigate("/conversations");
}

async function handleLeaveWithPromote(newAdminAccountID: string) {
  await promoteToAdmin(me, conversation, newAdminAccountID);
  await leaveConversation(me, conversation);
  setLeavePromoteOpen(false);
  navigate("/conversations");
}

// In JSX (after the main panel):
{leavePromoteOpen && (
  <LeaveWithPromoteDialog
    candidates={otherActiveMembers().map((m: any) => ({
      accountID: m.account.$jazz.id,
      displayName: contactDisplayNames[m.account.$jazz.id] ?? "(unknown)",
      currentRole: m.role,
    }))}
    onLeave={handleLeaveWithPromote}
    onCancel={() => setLeavePromoteOpen(false)}
  />
)}
```

Where `otherActiveMembers()` is a small helper inside the component that returns the non-me writer members eligible to be promoted. Implement as needed.

- [ ] **Step 3: Verify type-check + tests**

```bash
npx tsc --noEmit
npm test
npm run test:e2e
```

All Slice 1-3a e2e tests should still pass.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/routes/conversations/detail.tsx
git commit -m "feat(routes): wire /conversations/:id/members + LeaveWithPromoteDialog for last-admin leave"
```

---

## Phase E — E2E tests + docs

### Task 19: E2E — Group create

**Files:**
- Create: `tests/e2e/group-create.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

test("group create — Alice picks Bob + Carol, names group, all 3 see it", async ({ browser }) => {
  test.setTimeout(120_000);

  // Three accounts
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await pageA.goto("/");
  await createAccount(pageA, "Alice");

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await pageB.goto("/");
  await createAccount(pageB, "Bob");

  const ctxC = await browser.newContext();
  const pageC = await ctxC.newPage();
  await pageC.goto("/");
  await createAccount(pageC, "Carol");

  // Alice adds Bob and Carol as contacts (via Slice 2 invite flow — abbreviated)
  // For brevity, use a helper if available, or inline the invite flow.
  // ... (mutual contact establishment via /contacts/add + /invite#... flow)

  // Alice opens picker, selects Bob + Carol, enters title "Project X"
  await pageA.getByTestId("new-chat-btn").click();
  await expect(pageA.getByTestId("contact-picker-list")).toBeVisible({ timeout: 10_000 });
  // Click Bob's row then Carol's row to multi-select
  await pageA.getByTestId("contact-picker-row-0").click();
  await pageA.getByTestId("contact-picker-row-1").click();
  await expect(pageA.getByTestId("contact-picker-count")).toContainText("2 selected");
  await pageA.getByTestId("contact-picker-continue").click();

  // Group title dialog appears
  await expect(pageA.getByTestId("group-create-title-input")).toBeVisible({ timeout: 5_000 });
  await pageA.getByTestId("group-create-title-input").fill("Project X");
  await pageA.getByTestId("group-create-submit").click();

  // Alice lands on the conversation
  await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });
  await expect(pageA.getByTestId("conversation-title")).toContainText("Project X");

  // Alice sends a message
  await pageA.getByTestId("composer-input").fill("Hello team");
  await pageA.getByTestId("composer-send-btn").click();

  // Bob's sidebar auto-discovers the group within ~10s
  await expect(pageB.getByTestId("conversation-list")).toContainText("Project X", { timeout: 15_000 });
  // Bob opens it and sees Alice's message
  await pageB.getByText("Project X").click();
  await expect(pageB.getByTestId("message-timeline")).toContainText("Hello team", { timeout: 10_000 });

  // Carol's sidebar auto-discovers too
  await expect(pageC.getByTestId("conversation-list")).toContainText("Project X", { timeout: 15_000 });

  await ctxA.close();
  await ctxB.close();
  await ctxC.close();
});
```

**Note:** the "Alice adds Bob and Carol as contacts" portion requires running the Slice 2 invite flow twice. Either inline it or extract a helper `establishMutualContact(pageA, pageB)` in `tests/e2e/helpers.ts`. The pattern is already in other Slice 2/3a tests; copy from there.

- [ ] **Step 2: Run the test**

```bash
npm run test:e2e -- group-create
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/group-create.spec.ts tests/e2e/helpers.ts
git commit -m "test(e2e): group create — multi-select picker, name, all members see it"
```

---

### Task 20: E2E — Group member management

**Files:**
- Create: `tests/e2e/group-member-management.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

test("group member management — admin adds Dave, removes Bob", async ({ browser }) => {
  test.setTimeout(180_000);

  // Setup: 4 accounts, Alice creates a group with Bob + Carol, then adds Dave, then removes Bob
  // ... (setup boilerplate similar to group-create test) ...

  // After group is created and Alice is in /conversations/:id:
  // Alice clicks the title to navigate to /members
  await pageA.getByTestId("conversation-title").click();
  await expect(pageA.getByTestId("members-route-group")).toBeVisible({ timeout: 10_000 });

  // Alice opens "Add member" picker, selects Dave
  await pageA.getByTestId("add-member-btn").click();
  await expect(pageA.getByTestId("contact-picker-list")).toBeVisible();
  await pageA.getByText("Dave").click();
  await pageA.getByTestId("contact-picker-continue").click();

  // Dave appears in the member list within ~5s
  await expect(pageA.getByTestId("members-list")).toContainText("Dave", { timeout: 10_000 });

  // Dave's sidebar auto-discovers the group
  await expect(pageD.getByTestId("conversation-list")).toContainText("Project X", { timeout: 15_000 });

  // Alice removes Bob (handle confirm dialog)
  pageA.on("dialog", (dialog) => dialog.accept());
  // Find Bob's row and click his Remove button. Use a heuristic: find the row containing "Bob" and click its remove-btn descendant.
  const bobRow = pageA.locator('[data-testid^="member-row-"]').filter({ hasText: "Bob" });
  await bobRow.getByText("Remove").click();

  // Bob disappears from the member list
  await expect(pageA.getByTestId("members-list")).not.toContainText("Bob", { timeout: 10_000 });

  // Bob's sidebar drops the conversation (he's revoked)
  await expect(pageB.getByTestId("conversation-list")).not.toContainText("Project X", { timeout: 15_000 });

  // ... (cleanup) ...
});
```

- [ ] **Step 2: Run + commit**

```bash
npm run test:e2e -- group-member-management
git add tests/e2e/group-member-management.spec.ts
git commit -m "test(e2e): group member management — add + remove"
```

---

### Task 21: E2E — Group roles

**Files:**
- Create: `tests/e2e/group-roles.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

test("group roles — promote Bob to admin, Bob can then add Eve", async ({ browser }) => {
  test.setTimeout(180_000);

  // Setup: Alice creates a group with Bob (writer) and Carol (writer)
  // Alice promotes Bob to admin
  // Bob navigates to /members; verifies he sees role-management actions (writer was read-only)
  // Bob adds Eve as a new member
  // Verify all members see Eve in the group

  // ... boilerplate setup ...

  // Alice is in /members of the group:
  await pageA.getByTestId("conversation-title").click();
  await expect(pageA.getByTestId("members-route-group")).toBeVisible();

  // Click Bob's row Promote button
  const bobRow = pageA.locator('[data-testid^="member-row-"]').filter({ hasText: "Bob" });
  await bobRow.getByTestId(/^promote-btn-/).click();

  // Bob's role pill updates to "admin"
  await expect(bobRow.getByTestId("role-pill-admin")).toBeVisible({ timeout: 10_000 });

  // Bob navigates to the group's /members on his side (or refreshes)
  await pageB.getByText("Project X").click();
  await pageB.getByTestId("conversation-title").click();

  // Bob now sees "Add member" button (admin-only) — was hidden before promotion
  await expect(pageB.getByTestId("add-member-btn")).toBeVisible({ timeout: 5_000 });

  // Bob adds Eve
  await pageB.getByTestId("add-member-btn").click();
  await pageB.getByText("Eve").click();
  await pageB.getByTestId("contact-picker-continue").click();

  // Eve appears in member list
  await expect(pageB.getByTestId("members-list")).toContainText("Eve", { timeout: 10_000 });

  // ... cleanup ...
});
```

- [ ] **Step 2: Run + commit**

```bash
npm run test:e2e -- group-roles
git add tests/e2e/group-roles.spec.ts
git commit -m "test(e2e): group roles — promote + demote, admin actions"
```

---

### Task 22: E2E — Last admin leave

**Files:**
- Create: `tests/e2e/last-admin-leave.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

test("last admin leave — Alice promotes Bob, leaves; Bob is sole admin", async ({ browser }) => {
  test.setTimeout(120_000);

  // Setup: Alice creates a group with Bob (writer) and Carol (writer); Alice is sole admin

  // Alice tries to leave:
  await pageA.getByTestId("conversation-menu-btn").click();
  await pageA.getByTestId("leave-conversation-btn").click();

  // LeaveWithPromoteDialog appears
  await expect(pageA.getByTestId("leave-promote-overlay")).toBeVisible({ timeout: 5_000 });

  // Alice picks Bob, clicks Promote and leave
  await pageA.getByTestId("leave-promote-candidate-0").click();   // Bob (first candidate)
  await pageA.getByTestId("leave-promote-submit").click();

  // Alice is navigated to /conversations
  await expect(pageA).toHaveURL(/\/conversations$/, { timeout: 10_000 });

  // Alice's sidebar drops the conversation
  await expect(pageA.getByTestId("conversation-list")).not.toContainText("Project X", { timeout: 10_000 });

  // Bob's role is now admin
  await pageB.getByText("Project X").click();
  await pageB.getByTestId("conversation-title").click();
  const bobRow = pageB.locator('[data-testid^="member-row-"]').filter({ hasText: "Bob" });
  await expect(bobRow.getByTestId("role-pill-admin")).toBeVisible({ timeout: 15_000 });

  // ... cleanup ...
});
```

- [ ] **Step 2: Run + commit**

```bash
npm run test:e2e -- last-admin-leave
git add tests/e2e/last-admin-leave.spec.ts
git commit -m "test(e2e): last admin leave — inline promote, leave atomically"
```

---

### Task 23: E2E — Group title edit

**Files:**
- Create: `tests/e2e/group-title-edit.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

test("group title edit — admin renames, members see new title", async ({ browser }) => {
  test.setTimeout(120_000);

  // Setup: Alice creates a group "Old Name" with Bob

  // Alice navigates to /members
  await pageA.getByTestId("conversation-title").click();
  await expect(pageA.getByTestId("members-route-group")).toBeVisible();

  // Alice clicks edit, types new title
  await pageA.getByTestId("edit-title-btn").click();
  const titleInput = pageA.getByTestId("group-title-input");
  await titleInput.fill("New Name");
  await titleInput.press("Enter");

  // Alice's title updates
  await expect(pageA.getByTestId("group-title")).toContainText("New Name", { timeout: 5_000 });

  // Bob's sidebar shows the new title
  await expect(pageB.getByTestId("conversation-list")).toContainText("New Name", { timeout: 15_000 });
  await expect(pageB.getByTestId("conversation-list")).not.toContainText("Old Name");

  // ... cleanup ...
});
```

- [ ] **Step 2: Run + commit**

```bash
npm run test:e2e -- group-title-edit
git add tests/e2e/group-title-edit.spec.ts
git commit -m "test(e2e): group title edit — admin renames, propagates to members"
```

---

### Task 24: CHANGELOG + slice-3b-complete tag

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Append the Slice 3b section**

Add to `CHANGELOG.md`'s `[Unreleased]` block (at the top, above Slice 3a):

```markdown
### Slice 3b — Group Conversations + Member Management

- Schema additions: `JazzMessangerAccountRoot.knownConversations: co.list(Conversation)` for unified conversation discovery
- Schema removal: `Contact.linkedConversation` field (replaced by knownConversations)
- Multi-select ContactPicker: pick 1 contact → 1:1 (existing behavior); pick 2+ → group title prompt → create group
- `createGroupConversation` now defaults new members to `writer` role (was `admin`)
- New protocol primitives in `src/jazz/conversation.ts`: `addMemberToConversation`, `removeMemberFromConversation`, `promoteToAdmin`, `demoteToWriter`, `updateConversationTitle`, `isLastAdmin`
- `leaveConversation` now removes the conversation from `me.root.knownConversations` (no separate cache to clear)
- App.tsx Inbox subscription callback pushes to `knownConversations` (dedupes); replaces Slice 3a's contact-linkedConversation setter
- `/conversations/:id/members` route:
  - For groups: editable title (admin-only), member list with role pills, add/remove/promote/demote actions (admin-only)
  - For 1:1: minimal info pane (display name + safety number)
- LeaveWithPromoteDialog: when the only admin tries to leave, an inline picker lets them promote a member and leave atomically
- SystemEvent component: extracted from inline left-event rendering in Slice 3a; reusable for future event types
- E2E tests: group-create, group-member-management, group-roles, last-admin-leave, group-title-edit
- Sidebar refactor: derives conversations from `knownConversations` instead of iterating contactBook for linkedConversation refs

### Slice 3b known limitations

- "Added to chat" system events are not rendered in v1 — requires reading ConversationGroup permission history with timestamps; tracked as Linear TaskList #27 (chronologically-positioned events)
- Removed members can no longer access the conversation, but no "archived chats" view to see their last-known state — tracked as Linear TaskList #26 (view archive)
- Disband group action is not in v1 — requires the archived view first; tracked as Linear TaskList #25
- "Left the chat" events for groups (N>2) use a heuristic since we lack group history; in Slice 3b we ship the existing 1:1 detection from Slice 3a, group-leaver detection is deferred to the chronological-events follow-up
- Three-tier roles (manager) not surfaced; admin+writer only
- Group avatars/icons not implemented; deferred to Slice 4
```

- [ ] **Step 2: Run full verification**

```bash
npx tsc --noEmit
npm test
npm run test:e2e
```

Expected: all unit tests pass; all e2e tests pass (Slice 1-3a baseline + 5 new Slice 3b specs).

- [ ] **Step 3: Tag the slice**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog entry for Slice 3b"
git tag -a slice-3b-complete -m "E1a Slice 3b: Group Conversations + Member Management complete"
```

---

## Done definition

Slice 3b is complete when all of the following hold:

- [ ] `npm test` exits 0 (unit tests — Slice 3a baseline + new tests, expected 75+ total)
- [ ] `npm run test:e2e` exits 0 in Chromium + Firefox (22 existing + 5 new specs × 2 browsers = 32 e2e tests)
- [ ] Manual: three accounts can be added to a single group via multi-select picker; all see the group in their sidebars; messages flow bidirectionally; admin actions work as designed
- [ ] Manual: last-admin-leave inline promote flow works
- [ ] `grep -rn "linkedConversation" src/` returns no results (the field is fully removed)
- [ ] `JazzMessangerAccountRoot.knownConversations` exists; populated for new accounts via migration
- [ ] Tag `slice-3b-complete` set
- [ ] CHANGELOG updated with the new features and the schema refactor

---

## Notes for the next slice (or for the Slice 3b implementer's followup-tracking)

The chronological-system-events work (TaskList #27) is a natural Slice 3c candidate — once we have a way to read ConversationGroup permission history with timestamps, both the "added to chat" rendering for groups AND the "left the chat" for groups (currently only worked for 1:1 via the createdBy heuristic) become straightforward. This unblocks several v1 polish items.

The archived-conversations view (TaskList #26) is a separate small piece — needs a UI surface where revoked-from conversations can be viewed read-only. Once that exists, the Disband group action (TaskList #25) plugs in cleanly.
