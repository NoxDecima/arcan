> **Historical context (added 2026-06-07):** this document was written when the project was named **jazz-messanger**. The project was renamed to **Arcan** on 2026-06-05; the app rebrand itself is captured as Unit 5 in `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md`. This file is preserved as-is for historical accuracy.
# Slice 4 — Conversation Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close NOX-17 (archive of left/kicked conversations) and NOX-18 (chronologically-positioned system events) by adding a sidecar SystemEvent log on Conversation, a merged timeline that interleaves events with messages, and an "Archived" sidebar section that holds conversations where the user is no longer a member.

**Architecture:** Application-managed event log written by the actor of each membership-changing protocol call. Timeline render is a sorted merge of messages + events. Archive detection uses `getRoleOf(me) === undefined`. `leaveConversation` no longer removes from `knownConversations` — the resulting "no longer a member" state is detected dynamically and the conversation routes to a collapsible Archived section instead.

**Tech Stack:** TypeScript strict, React 18, jazz-tools 0.20.18 (Zod-based functional schema API), Tailwind v3, Vitest 4 unit, Playwright e2e.

**Branch:** `slice-4-conversation-lifecycle` (already created, spec committed at `docs/superpowers/specs/2026-05-24-slice-4-conversation-lifecycle-design.md` as commit `86227ab`).

**Critical reminders:**

- **NOX-13 footgun:** all CoValue field writes use `instance.$jazz.set(key, value)`; list mutations use `list.$jazz.push(item)` and `list.$jazz.remove(index)`. Never direct property assignment.
- **Existing conversations have `systemEvents` undefined.** Always read via `conversation.systemEvents ?? []`.
- **`leaveConversation` event ordering:** write `left` event BEFORE `conversationGroup.removeMember(me)` — once self-revoked, the leaver no longer has write permission.
- **No migration code:** project CLAUDE.md authorizes recreating users from scratch.

---

## File map

| File | Phase | Change |
|---|---|---|
| `src/jazz/schema/SystemEvent.ts` | A | **NEW** — schema for membership-change log entries |
| `tests/unit/jazz/schema/SystemEvent.test.ts` | A | **NEW** — schema unit tests |
| `src/jazz/schema/Conversation.ts` | A | Add `systemEvents: co.list(SystemEvent)` |
| `src/jazz/conversation.ts` | A | Write events in `addMemberToConversation`, `removeMemberFromConversation`, `leaveConversation`, `promoteToAdmin`; new `isArchived`, `removeFromArchive`; `leaveConversation` stops splicing knownConversations |
| `tests/unit/jazz/conversation.test.ts` | A | Tests for event writes; `isArchived` & `removeFromArchive`; `leaveConversation` archive behavior |
| `src/components/system-event.tsx` | B | Props grow to accept all 4 kinds + actor/target IDs via `resolveDisplayName` |
| `src/routes/conversations/detail.tsx` | B | Merged message+event timeline; archived branch (composer hidden, banner shown); remove `leftMembers` heuristic + 2-second poll effect |
| `src/components/sidebar.tsx` | B | Partition knownConversations into active/archived; collapsible Archived section; X-button per archived row |
| `src/routes/conversations/members.tsx` | B | Read-only mode when archived (hide action buttons + leave button) |
| `tests/e2e/archive-after-leave.spec.ts` | C | **NEW** |
| `tests/e2e/archive-after-kick.spec.ts` | C | **NEW** |
| `tests/e2e/system-events-chronological.spec.ts` | C | **NEW** |
| `tests/e2e/archive-remove.spec.ts` | C | **NEW** |
| `tests/e2e/leave-conversation.spec.ts` | C | Update — assert conversation lands in archive instead of being removed |
| `CHANGELOG.md` | C | Slice 4 entry |

---

## Phase A — Schema + protocol

### Task 1: Create SystemEvent schema

**Files:**
- Create: `src/jazz/schema/SystemEvent.ts`
- Create: `tests/unit/jazz/schema/SystemEvent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/jazz/schema/SystemEvent.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createJazzTestAccount } from "jazz-tools/testing";
import { Group } from "jazz-tools";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { SystemEvent } from "@/jazz/schema/SystemEvent";

describe("SystemEvent schema", () => {
  it("creates an 'added' event with actor + target", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const group = Group.create({ owner: me });
    const event = SystemEvent.create(
      {
        kind: "added",
        actorAccountID: "acc_alice",
        targetAccountID: "acc_bob",
        occurredAt: new Date("2026-05-24T10:00:00Z"),
      },
      { owner: group },
    );
    expect(event.kind).toBe("added");
    expect(event.actorAccountID).toBe("acc_alice");
    expect(event.targetAccountID).toBe("acc_bob");
    expect(event.occurredAt.getTime()).toBe(new Date("2026-05-24T10:00:00Z").getTime());
  });

  it("creates a 'left' event with no target", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const group = Group.create({ owner: me });
    const event = SystemEvent.create(
      {
        kind: "left",
        actorAccountID: "acc_alice",
        occurredAt: new Date(),
      },
      { owner: group },
    );
    expect(event.kind).toBe("left");
    expect(event.targetAccountID).toBeUndefined();
  });

  it("accepts all four kinds: added, removed, left, promoted", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const group = Group.create({ owner: me });
    const kinds = ["added", "removed", "left", "promoted"] as const;
    for (const kind of kinds) {
      const event = SystemEvent.create(
        {
          kind,
          actorAccountID: "acc_a",
          occurredAt: new Date(),
        },
        { owner: group },
      );
      expect(event.kind).toBe(kind);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/jazz/schema/SystemEvent.test.ts`
Expected: FAIL — module not found at `@/jazz/schema/SystemEvent`.

- [ ] **Step 3: Create the schema**

Create `src/jazz/schema/SystemEvent.ts`:

```ts
import { co, z } from "jazz-tools";

/**
 * A membership-related event captured in the conversation's sidecar log.
 *
 * Events are written by the actor performing the action:
 *   - admin adding/removing/promoting a member writes their own event
 *   - a leaver writes their own "left" event BEFORE self-revoking (otherwise
 *     they would lose write permission and the event couldn't land)
 *
 * The log is application-level: a determined actor calling cojson directly
 * could change membership without writing an event. This is consistent with
 * the trust-circle threat model — the log is for UX clarity, not security.
 *
 * `targetAccountID` is omitted for kind="left" (actor IS target).
 */
export const SystemEvent = co.map({
  kind: z.enum(["added", "removed", "left", "promoted"]),
  actorAccountID: z.string(),
  targetAccountID: z.string().optional(),
  occurredAt: z.date(),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/jazz/schema/SystemEvent.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/jazz/schema/SystemEvent.ts tests/unit/jazz/schema/SystemEvent.test.ts
git commit -m "feat(schema): SystemEvent for membership-change log entries"
```

---

### Task 2: Add `systemEvents` field to Conversation

**Files:**
- Modify: `src/jazz/schema/Conversation.ts`

- [ ] **Step 1: Edit the schema**

Edit `src/jazz/schema/Conversation.ts`. Add the SystemEvent import and the new field:

Before:
```ts
import { co, z } from "jazz-tools";
import { Message } from "./Message";

/**
 * Conversation: a chat thread with one or more participants.
 *
 * Slice 3c removed the `kind` discriminator — a conversation's identity is
 * defined by its member set, not by a stored type field. Two-person
 * conversations and groups share the same shape.
 *
 * Author derivation does NOT use a registry — see §6.2 of the Slice 3a design.
 * Author is read from each message's create-transaction signer, validated
 * against the well-formedness of the owning WriteGroup.
 */
export const Conversation = co.map({
  title: z.string().optional(),
  createdAt: z.date(),
  createdBy: z.string(),
  messages: co.list(Message),
});
```

After:
```ts
import { co, z } from "jazz-tools";
import { Message } from "./Message";
import { SystemEvent } from "./SystemEvent";

/**
 * Conversation: a chat thread with one or more participants.
 *
 * Slice 3c removed the `kind` discriminator — a conversation's identity is
 * defined by its member set, not by a stored type field. Two-person
 * conversations and groups share the same shape.
 *
 * Slice 4 added the `systemEvents` sidecar log — see §1 of the Slice 4 design.
 * Membership-change events (added / removed / left / promoted) are written
 * here by the actor performing the action. Render order is sorted by
 * occurredAt + message sentAt, giving the timeline a chronological view of
 * what happened in the conversation.
 *
 * Author derivation does NOT use a registry — see §6.2 of the Slice 3a design.
 * Author is read from each message's create-transaction signer, validated
 * against the well-formedness of the owning WriteGroup.
 */
export const Conversation = co.map({
  title: z.string().optional(),
  createdAt: z.date(),
  createdBy: z.string(),
  messages: co.list(Message),
  systemEvents: co.list(SystemEvent),
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — schema change is additive; existing call sites that omit `systemEvents` at create time will still type-check because `co.map` schema fields default to nullable on create when not explicitly set (existing pattern across the codebase).

- [ ] **Step 3: Run full unit suite to confirm no regression**

Run: `npm test`
Expected: PASS — 90/90 (the new test file from Task 1 is already running and green; no existing tests assert on schema shape).

- [ ] **Step 4: Commit**

```bash
git add src/jazz/schema/Conversation.ts
git commit -m "feat(schema): add systemEvents sidecar log to Conversation"
```

---

### Task 3: Write SystemEvent in the four protocol functions

**Files:**
- Modify: `src/jazz/conversation.ts` (`addMemberToConversation`, `removeMemberFromConversation`, `leaveConversation`, `promoteToAdmin`)
- Modify: `tests/unit/jazz/conversation.test.ts` (add event-write tests)

- [ ] **Step 1: Write the failing tests**

In `tests/unit/jazz/conversation.test.ts`:

First, add this import to the existing import block at the top of the file (just below the existing `import { Message } from "@/jazz/schema/Message";` line):

```ts
import { SystemEvent } from "@/jazz/schema/SystemEvent";
```

Then append this describe block at the bottom of the file:

```ts
describe("Slice 4 systemEvents writes", () => {
  it("addMemberToConversation writes an 'added' event with actor=me, target=new member", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const charlie = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(alice, bob);
    linkAccounts(alice, charlie);

    const conversationGroup = Group.create({ owner: alice });
    conversationGroup.addMember(bob, "writer");
    const conversation = Conversation.create(
      {
        createdAt: new Date(),
        createdBy: alice.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
        systemEvents: co.list(SystemEvent).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );

    await addMemberToConversation(alice, conversation, charlie.$jazz.id, "writer");

    const events = Array.from(conversation.systemEvents ?? []);
    const addedEvents = events.filter((e: any) => e.kind === "added");
    expect(addedEvents).toHaveLength(1);
    expect(addedEvents[0].actorAccountID).toBe(alice.$jazz.id);
    expect(addedEvents[0].targetAccountID).toBe(charlie.$jazz.id);
    expect(addedEvents[0].occurredAt).toBeInstanceOf(Date);
  });

  it("removeMemberFromConversation writes a 'removed' event", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(alice, bob);

    const conversationGroup = Group.create({ owner: alice });
    conversationGroup.addMember(bob, "writer");
    const conversation = Conversation.create(
      {
        createdAt: new Date(),
        createdBy: alice.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
        systemEvents: co.list(SystemEvent).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );

    await removeMemberFromConversation(alice, conversation, bob.$jazz.id);

    const events = Array.from(conversation.systemEvents ?? []);
    const removed = events.filter((e: any) => e.kind === "removed");
    expect(removed).toHaveLength(1);
    expect(removed[0].actorAccountID).toBe(alice.$jazz.id);
    expect(removed[0].targetAccountID).toBe(bob.$jazz.id);
  });

  it("leaveConversation writes a 'left' event BEFORE self-revoking (so the leaver still has write permission)", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(alice, bob);

    const conversationGroup = Group.create({ owner: alice });
    conversationGroup.addMember(bob, "admin"); // both admin so alice can leave w/o promote
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

    await leaveConversation(alice, conversation);

    const events = Array.from(conversation.systemEvents ?? []);
    const left = events.filter((e: any) => e.kind === "left");
    expect(left).toHaveLength(1);
    expect(left[0].actorAccountID).toBe(alice.$jazz.id);
    expect(left[0].targetAccountID).toBeUndefined();
  });

  it("promoteToAdmin writes a 'promoted' event", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(alice, bob);

    const conversationGroup = Group.create({ owner: alice });
    conversationGroup.addMember(bob, "writer");
    const conversation = Conversation.create(
      {
        createdAt: new Date(),
        createdBy: alice.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
        systemEvents: co.list(SystemEvent).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );

    await promoteToAdmin(alice, conversation, bob.$jazz.id);

    const events = Array.from(conversation.systemEvents ?? []);
    const promoted = events.filter((e: any) => e.kind === "promoted");
    expect(promoted).toHaveLength(1);
    expect(promoted[0].actorAccountID).toBe(alice.$jazz.id);
    expect(promoted[0].targetAccountID).toBe(bob.$jazz.id);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/jazz/conversation.test.ts -t "Slice 4 systemEvents"`
Expected: FAIL — the four protocol functions don't write events yet.

- [ ] **Step 3: Add the `writeSystemEvent` helper at the top of `src/jazz/conversation.ts`**

Insert this helper near the top of `src/jazz/conversation.ts`, just below the `ConversationNotification` definition (~line 22):

```ts
import { SystemEvent } from "@/jazz/schema/SystemEvent";

/**
 * Append a SystemEvent to the conversation's sidecar log.
 *
 * Caller MUST have write access to the conversation's owning group. For
 * leaveConversation specifically, this MUST be called BEFORE self-revoke —
 * once the leaver's role is revoked, $jazz.push will be rejected by cojson.
 *
 * Defensive: if `conversation.systemEvents` is undefined (pre-Slice-4
 * conversation created without the field), the push will fail. We accept
 * this — existing conversations get no events; new ones do. The render
 * path uses `?? []` to handle the missing-field case.
 */
function writeSystemEvent(
  me: Account,
  conversation: any,
  payload: {
    kind: "added" | "removed" | "left" | "promoted";
    targetAccountID?: string;
  },
): void {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) return;
  const events = conversation.systemEvents;
  if (!events || typeof events.$jazz?.push !== "function") return;
  const event = SystemEvent.create(
    {
      kind: payload.kind,
      actorAccountID: (me as any).$jazz.id as string,
      targetAccountID: payload.targetAccountID,
      occurredAt: new Date(),
    },
    { owner: conversationGroup },
  );
  events.$jazz.push(event);
}
```

- [ ] **Step 4: Call `writeSystemEvent` in `addMemberToConversation`**

Find `addMemberToConversation` (~line 310). After the `loadAccountByID` block and BEFORE `conversationGroup.addMember(newAccount, role)`, insert the event write. Final body of the function:

```ts
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

  writeSystemEvent(me, conversation, {
    kind: "added",
    targetAccountID: newAccountID,
  });

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
```

- [ ] **Step 5: Call `writeSystemEvent` in `removeMemberFromConversation`**

Find `removeMemberFromConversation` (~line 357). Insert the event write BEFORE `conversationGroup.removeMember(targetAccount)`:

```ts
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

  writeSystemEvent(me, conversation, {
    kind: "removed",
    targetAccountID,
  });

  conversationGroup.removeMember(targetAccount);
}
```

- [ ] **Step 6: Call `writeSystemEvent` in `leaveConversation`**

Find `leaveConversation` (~line 269). Insert the event write BEFORE `conversationGroup.removeMember(me)`:

```ts
// (excerpt — keep the rest of leaveConversation unchanged for now; Task 5
// will modify the knownConversations splice path)
  writeSystemEvent(me, conversation, {
    kind: "left",
    // targetAccountID intentionally omitted — actor IS the target for "left"
  });

  // Revoke myself from the ConversationGroup; Jazz auto-rotates the readKey
  conversationGroup.removeMember(me);
  // ... rest of function (knownConversations splice — touched in Task 5)
```

- [ ] **Step 7: Call `writeSystemEvent` in `promoteToAdmin`**

Find `promoteToAdmin` (~line 381). Insert the event write BEFORE `conversationGroup.addMember(targetAccount, "admin")`:

```ts
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
  writeSystemEvent(me, conversation, {
    kind: "promoted",
    targetAccountID,
  });
  // Re-adding with a different role overwrites the prior role
  conversationGroup.addMember(targetAccount, "admin");
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run tests/unit/jazz/conversation.test.ts -t "Slice 4 systemEvents"`
Expected: PASS (4/4).

Run full unit suite to ensure no regression: `npm test`
Expected: PASS — 94/94 (90 prior + 4 new).

- [ ] **Step 9: Commit**

```bash
git add src/jazz/conversation.ts tests/unit/jazz/conversation.test.ts
git commit -m "feat(conversation): write SystemEvent in addMember/remove/leave/promote"
```

---

### Task 4: Add `isArchived` and `removeFromArchive` primitives

**Files:**
- Modify: `src/jazz/conversation.ts` (append two new exports near end)
- Modify: `tests/unit/jazz/conversation.test.ts` (add tests)

- [ ] **Step 1: Write the failing tests**

In `tests/unit/jazz/conversation.test.ts`:

First, add `isArchived` and `removeFromArchive` to the existing import line for `@/jazz/conversation` at the top of the file (you'll find an import that already destructures several conversation primitives — add the two new names to that destructure).

Then append this describe block at the bottom of the file:

```ts
describe("isArchived", () => {
  it("returns false for a conversation where me is still a member", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const { conversation } = await makeConversation(me);
    expect(isArchived(me, conversation)).toBe(false);
  });

  it("returns true after me is removed from the conversation group", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(alice, bob);

    const conversationGroup = Group.create({ owner: bob });
    conversationGroup.addMember(alice, "writer");
    const conversation = Conversation.create(
      {
        createdAt: new Date(),
        createdBy: bob.$jazz.id,
        messages: co.list(Message).create([], { owner: conversationGroup }),
        systemEvents: co.list(SystemEvent).create([], { owner: conversationGroup }),
      },
      { owner: conversationGroup },
    );

    expect(isArchived(alice, conversation)).toBe(false);
    conversationGroup.removeMember(alice);
    expect(isArchived(alice, conversation)).toBe(true);
  });
});

describe("removeFromArchive", () => {
  it("splices the conversation from me.root.knownConversations", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const { conversation } = await makeConversation(me);
    me.root.knownConversations.$jazz.push(conversation);
    expect(Array.from(me.root.knownConversations).length).toBe(1);

    await removeFromArchive(me, conversation);

    expect(Array.from(me.root.knownConversations).length).toBe(0);
  });

  it("is a no-op when the conversation is not in knownConversations", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const { conversation } = await makeConversation(me);

    await removeFromArchive(me, conversation); // not in list yet

    expect(Array.from(me.root.knownConversations).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/jazz/conversation.test.ts -t "isArchived|removeFromArchive"`
Expected: FAIL — `isArchived` and `removeFromArchive` are not yet exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/jazz/conversation.ts`:

```ts
/**
 * True when `me` is no longer a participant in the conversation.
 *
 * Detection: getRoleOf returns undefined for both "revoked" and
 * "never-a-member". Since this helper is only called for conversations in
 * me.root.knownConversations (which we only push to when me becomes a
 * member), undefined here means "was a member, now revoked" — i.e., archived.
 *
 * Slice 4 uses this to partition the sidebar into active vs archived sections
 * and to gate the detail/members routes into read-only mode.
 */
export function isArchived(me: Account, conversation: any): boolean {
  const group = conversation?.$jazz?.owner as Group | undefined;
  if (!group) return false;
  const myID = (me as any).$jazz?.id;
  if (!myID) return false;
  return group.getRoleOf(myID) === undefined;
}

/**
 * Remove a conversation from me's knownConversations list. Terminal action —
 * the conversation disappears from the user's view entirely (active and
 * archived sections both).
 *
 * No-op when the conversation is not in the list.
 */
export async function removeFromArchive(
  me: Account,
  conversation: any,
): Promise<void> {
  const known = (me as any).root?.knownConversations;
  if (!known || typeof known.$jazz?.remove !== "function") return;
  const conversationID = conversation?.$jazz?.id;
  if (!conversationID) return;
  for (let i = 0; i < known.length; i++) {
    const entry = known[i];
    if (entry?.$jazz?.id === conversationID) {
      known.$jazz.remove(i);
      return;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/jazz/conversation.test.ts -t "isArchived|removeFromArchive"`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/jazz/conversation.ts tests/unit/jazz/conversation.test.ts
git commit -m "feat(conversation): isArchived + removeFromArchive primitives"
```

---

### Task 5: `leaveConversation` stops splicing knownConversations

**Files:**
- Modify: `src/jazz/conversation.ts` (`leaveConversation`, ~lines 281-298)
- Modify: `tests/unit/jazz/conversation.test.ts` (add test, remove obsolete assertion)

- [ ] **Step 1: Write the failing test**

In `tests/unit/jazz/conversation.test.ts`, find the existing `describe("leaveConversation", …)` block. Add this test inside it:

```ts
it("does NOT remove the conversation from knownConversations after leaving (Slice 4)", async () => {
  const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
  const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
  linkAccounts(alice, bob);

  const conversationGroup = Group.create({ owner: alice });
  conversationGroup.addMember(bob, "admin"); // both admin so alice can leave cleanly
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
  expect(Array.from(alice.root.knownConversations).length).toBe(1);

  await leaveConversation(alice, conversation);

  // Slice 4: conversation stays in knownConversations so it can appear in archive
  expect(Array.from(alice.root.knownConversations).length).toBe(1);
  // But me is no longer in the group
  expect(isArchived(alice, conversation)).toBe(true);
});
```

Now search the same `describe("leaveConversation", …)` block for any existing test that asserts `knownConversations.length` is 0 after `leaveConversation` (the pre-Slice-4 contract). Delete that assertion — the contract has changed. If the entire test was only about the splice behavior, delete the whole test.

```bash
grep -n "knownConversations" tests/unit/jazz/conversation.test.ts
```

Audit each match in the `leaveConversation` describe block and update or delete.

- [ ] **Step 2: Run tests to verify the new one fails and obsolete ones are removed**

Run: `npx vitest run tests/unit/jazz/conversation.test.ts -t "leaveConversation"`
Expected: the new "does NOT remove" test FAILS (because current code still splices); other leaveConversation tests PASS.

- [ ] **Step 3: Remove the splice block from `leaveConversation`**

In `src/jazz/conversation.ts`, find `leaveConversation` (~line 269). After the body that writes the `left` event and calls `conversationGroup.removeMember(me)`, REMOVE the `knownConversations` splice block. The final body should be:

```ts
export async function leaveConversation(
  me: Account,
  conversation: any,
): Promise<void> {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }

  // Write the "left" event BEFORE self-revoking — once removeMember(me) lands,
  // me no longer has write permission to the conversation's owning group.
  writeSystemEvent(me, conversation, {
    kind: "left",
  });

  // Revoke myself from the ConversationGroup; Jazz auto-rotates the readKey
  conversationGroup.removeMember(me);

  // NOTE: We deliberately do NOT remove from me.root.knownConversations.
  // Slice 4 keeps the conversation in the list so it lands in the Archived
  // section (isArchived returns true after self-revoke). The user can
  // explicitly remove via the archive's X button -> removeFromArchive().
}
```

Update the function's doc comment to reflect the new behavior:

Before (existing comment block before the function — check lines ~265):
```ts
/**
 * Leave a conversation. Revokes me from the ConversationGroup and removes
 * the conversation from me.root.knownConversations.
 * ...
 */
```

After:
```ts
/**
 * Leave a conversation.
 *
 * Slice 4 changed this from "splice from knownConversations" to "leave a
 * trail": we write a `left` system event, then self-revoke. The conversation
 * stays in me.root.knownConversations; the sidebar detects via isArchived()
 * and routes it to the Archived section. The user can call removeFromArchive
 * later to truly delete the entry.
 *
 * For last-admin leaves, the caller should first call promoteToAdmin on
 * another member (see LeaveWithPromoteDialog) — this function does not
 * handle that flow.
 */
```

- [ ] **Step 4: Run all leaveConversation tests**

Run: `npx vitest run tests/unit/jazz/conversation.test.ts -t "leaveConversation"`
Expected: PASS — including the new "does NOT remove" test.

Run full suite: `npm test`
Expected: 95-96/95-96 PASS (depending on how many obsolete tests you removed in Step 1).

- [ ] **Step 5: Commit**

```bash
git add src/jazz/conversation.ts tests/unit/jazz/conversation.test.ts
git commit -m "refactor(conversation): leave keeps entry in knownConversations for archive (Slice 4)"
```

---

## Phase B — Timeline + archive UI

### Task 6: Refresh `SystemEvent` component to handle all four kinds

**Files:**
- Modify: `src/components/system-event.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `src/components/system-event.tsx`:

```tsx
import { resolveDisplayName } from "@/jazz/displayName";

interface SystemEventProps {
  event: {
    kind: "added" | "removed" | "left" | "promoted";
    actorAccountID: string;
    targetAccountID?: string;
    occurredAt: Date;
  };
  me: any;
  group?: any;
}

/**
 * Render a SystemEvent log entry as a pill in the conversation timeline.
 *
 * Display name resolution goes through resolveDisplayName so it matches
 * MessageRow and MembersRoute. The pill text is fully resolved at render
 * time — there's no need to pre-compute names in the parent.
 */
export function SystemEvent({ event, me, group }: SystemEventProps) {
  const actorName = resolveDisplayName({
    accountID: event.actorAccountID,
    me,
    group,
  });
  const targetName = event.targetAccountID
    ? resolveDisplayName({
        accountID: event.targetAccountID,
        me,
        group,
      })
    : undefined;

  let message: string;
  switch (event.kind) {
    case "added":
      message = `${actorName} added ${targetName ?? "someone"} to the chat`;
      break;
    case "removed":
      message = `${actorName} removed ${targetName ?? "someone"} from the chat`;
      break;
    case "left":
      message = `${actorName} left the chat`;
      break;
    case "promoted":
      message = `${actorName} promoted ${targetName ?? "someone"} to admin`;
      break;
  }

  return (
    <div
      className="flex justify-center py-2"
      data-testid={`system-event-${event.kind}`}
    >
      <div className="bg-muted text-xs text-muted-foreground italic px-3 py-1 rounded-full">
        {message}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL — `detail.tsx` still calls `<SystemEvent kind="left" targetName={...} />` with the old props. This gets fixed in Task 7. Continue to Task 7 to keep the working tree compilable per-commit.

- [ ] **Step 3: Hold the commit**

Do NOT commit yet. Combine with Task 7's commit to keep each commit compilable.

---

### Task 7: Merged message+event timeline in `detail.tsx`

**Files:**
- Modify: `src/routes/conversations/detail.tsx`

- [ ] **Step 1: Remove the polling effect**

Find the `pollTick` block (~lines 57-62 plus `void pollTick;`). Delete:

```ts
const [pollTick, setPollTick] = useState(0);
useEffect(() => {
  const interval = setInterval(() => setPollTick((t) => t + 1), 2000);
  return () => clearInterval(interval);
}, []);

void pollTick;
```

Update the file's top-level doc comment (lines 17-18) to drop the `composerDisabled` note (the variable still exists for the "I'm the only admin in a 1:1 because the other party left" case, but it's now derived from group membership snapshot only).

If `useState` is no longer used elsewhere in the file, leave the `useState` import — composer code may use it. Run typecheck to confirm.

- [ ] **Step 2: Remove the `leftMembers` heuristic**

Find the `leftMembers` block (~lines 132-187). Delete the entire block — including the `if (composerDisabled) { … leftMembers.push(...) … }` logic. Keep `composerDisabled` itself (it still gates the composer for the "only-me-left" 1:1 case). The `leftMembers` array becomes dead; remove its declaration too.

- [ ] **Step 3: Update conversation resolve depth**

Find the `useCoState(Conversation, id, …)` call (~line 47). Add `systemEvents: { $each: true }` to the resolve query:

Before:
```ts
const conversation = useCoState(Conversation, id as any, {
  resolve: { messages: { $each: true } },
});
```

After:
```ts
const conversation = useCoState(Conversation, id as any, {
  resolve: { messages: { $each: true }, systemEvents: { $each: true } },
});
```

- [ ] **Step 4: Add isArchived import and computation**

In the imports block near the top (around line 31), add:

```ts
import { isArchived } from "@/jazz/conversation";
```

In the render body, after `const messages = Array.from((conversation as any).messages ?? []);`, add:

```ts
const archivedForMe = me.$isLoaded && conversation ? isArchived(me, conversation) : false;
```

- [ ] **Step 5: Build the merged timeline**

In the render body, replace the message-mapping block (the `{messages.length === 0 ? … : messages.map(...)}` and the trailing `{leftMembers.map(...)}` — both inside `<div data-testid="message-timeline">`) with a single merged stream. Replace the whole `<div data-testid="message-timeline">` content block with:

```tsx
        <div
          className="flex-1 overflow-y-auto py-2"
          data-testid="message-timeline"
        >
          {(() => {
            const conversationGroup = (conversation as any)?.$jazz?.owner;
            type TimelineItem =
              | { kind: "message"; data: any; sortAt: number; key: string }
              | { kind: "event"; data: any; sortAt: number; key: string };

            const items: TimelineItem[] = [];
            for (const m of messages as any[]) {
              const sentAt = (m as any)?.sentAt;
              const ts = sentAt instanceof Date ? sentAt.getTime() : new Date(sentAt ?? 0).getTime();
              items.push({
                kind: "message",
                data: m,
                sortAt: ts,
                key: `m-${(m as any)?.$jazz?.id ?? items.length}`,
              });
            }
            const eventsList = Array.from(((conversation as any)?.systemEvents ?? []) as any[]);
            for (const e of eventsList) {
              const occurredAt = (e as any)?.occurredAt;
              const ts = occurredAt instanceof Date ? occurredAt.getTime() : new Date(occurredAt ?? 0).getTime();
              items.push({
                kind: "event",
                data: e,
                sortAt: ts,
                key: `e-${(e as any)?.$jazz?.id ?? items.length}`,
              });
            }
            items.sort((a, b) => a.sortAt - b.sortAt);

            if (items.length === 0) {
              return (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">
                    No messages yet. Say hello!
                  </p>
                </div>
              );
            }

            return items.map((item) => {
              if (item.kind === "message") {
                const message = item.data;
                const authorAccountID = getAuthorAccountIDFromMessage(message);
                const isMine = authorAccountID === myAccountID;
                const authorDisplayName = authorAccountID
                  ? resolveDisplayName({
                      accountID: authorAccountID,
                      me,
                      group: conversationGroup,
                    })
                  : "Unknown";
                return (
                  <MessageBubble
                    key={item.key}
                    message={message}
                    authorAccountID={authorAccountID}
                    authorDisplayName={authorDisplayName}
                    isMine={isMine}
                    me={me}
                  />
                );
              }
              return (
                <SystemEvent
                  key={item.key}
                  event={item.data}
                  me={me}
                  group={conversationGroup}
                />
              );
            });
          })()}

          <div ref={bottomRef} />
        </div>
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — Tasks 6 + 7 together make the types line up.

- [ ] **Step 7: Run unit suite**

Run: `npm test`
Expected: PASS — no unit tests cover detail.tsx directly; the existing suite stays green.

- [ ] **Step 8: Commit (covers Tasks 6 + 7)**

```bash
git add src/components/system-event.tsx src/routes/conversations/detail.tsx
git commit -m "feat(detail): merged message+event timeline; SystemEvent props grow to four kinds"
```

---

### Task 8: Archived read-only branch in `detail.tsx`

**Files:**
- Modify: `src/routes/conversations/detail.tsx`

- [ ] **Step 1: Add `removeFromArchive` import**

Update the existing import line in `src/routes/conversations/detail.tsx`:

Before:
```ts
import { isArchived } from "@/jazz/conversation";
```

After:
```ts
import { isArchived, removeFromArchive } from "@/jazz/conversation";
import { useNavigate } from "react-router-dom";
```

(If `useNavigate` is already imported, just merge the destructured names.)

- [ ] **Step 2: Add the archived banner + remove-from-archive handler**

Inside `ConversationDetailRoute`, after the existing `handleSend` function (~line 227), add:

```ts
const navigate = useNavigate();

async function handleRemoveFromArchive() {
  if (!conversation) return;
  if (!confirm("Remove this conversation from your archive? This cannot be undone.")) return;
  await removeFromArchive(me, conversation);
  navigate("/conversations");
}
```

- [ ] **Step 3: Render the banner and conditionally hide the composer**

Find the JSX block containing the `<Composer …>` element (~line 318-322). Replace it with the conditional render below. Also insert the banner above the message timeline by editing the `<ConnectionBanner />` block (~line 267):

Before (current order):
```tsx
        <ConnectionBanner />

        {/* Message timeline */}
        <div
          className="flex-1 overflow-y-auto py-2"
          data-testid="message-timeline"
        >
          ...
        </div>

        {/* Composer */}
        <Composer
          onSend={handleSend}
          disabled={composerDisabled}
        />
```

After:
```tsx
        <ConnectionBanner />

        {archivedForMe && (
          <div
            className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-900 flex items-center justify-between"
            data-testid="archived-banner"
          >
            <span>You're no longer a member of this conversation.</span>
            <button
              className="text-amber-700 underline hover:text-amber-900"
              onClick={handleRemoveFromArchive}
              data-testid="archived-remove-link"
            >
              Remove from archive
            </button>
          </div>
        )}

        {/* Message timeline */}
        <div
          className="flex-1 overflow-y-auto py-2"
          data-testid="message-timeline"
        >
          ...
        </div>

        {!archivedForMe && (
          <Composer
            onSend={handleSend}
            disabled={composerDisabled}
          />
        )}
```

- [ ] **Step 4: Typecheck + unit suite**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/conversations/detail.tsx
git commit -m "feat(detail): archived read-only branch with banner + composer hide"
```

---

### Task 9: Archived section in sidebar

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Add imports**

Add to the existing imports block in `src/components/sidebar.tsx`:

```ts
import { isArchived, removeFromArchive } from "@/jazz/conversation";
```

- [ ] **Step 2: Add archived-section state**

Inside the `Sidebar` component, after the existing `useState` calls (around lines 28-29), add:

```ts
const [archivedExpanded, setArchivedExpanded] = useState(false);
```

- [ ] **Step 3: Partition conversations into active + archived**

Find the `conversations` derivation block (~lines 89-97). Replace with:

```ts
  const allConversations = Array.from(knownConversations ?? [])
    .filter((c: any) => c != null)
    .map((c: any) => ({ conversation: c }));

  const archivedConversations = allConversations.filter((c: any) =>
    isArchived(me, c.conversation),
  );
  const conversations = allConversations.filter(
    (c: any) => !isArchived(me, c.conversation),
  );
```

The existing sort-by-last-activity logic (the `.sort(...)` call) should be applied to BOTH `conversations` (active) and `archivedConversations`. Wrap the sort in a helper or duplicate it:

```ts
  function sortByActivity(list: any[]): any[] {
    return [...list].sort((a, b) => {
      const aMsgs = a.conversation.messages;
      const aLastMsg = aMsgs ? aMsgs[aMsgs.length - 1] : null;
      const bMsgs = b.conversation.messages;
      const bLastMsg = bMsgs ? bMsgs[bMsgs.length - 1] : null;
      const aTime = aLastMsg?.sentAt
        ? new Date(aLastMsg.sentAt).getTime()
        : new Date(a.conversation.createdAt).getTime();
      const bTime = bLastMsg?.sentAt
        ? new Date(bLastMsg.sentAt).getTime()
        : new Date(b.conversation.createdAt).getTime();
      return bTime - aTime;
    });
  }

  const sortedActive = sortByActivity(conversations);
  const sortedArchived = sortByActivity(archivedConversations);
```

Replace the existing `conversations.sort(…)` block with the helper call. The render loop will use `sortedActive` and `sortedArchived` instead of `conversations`.

- [ ] **Step 4: Render the archived section**

Find the active conversation list render block (the `<nav data-testid="conversation-list">` containing the `.map((c, i) => …)`). Update the map to iterate `sortedActive`. Then below the active list, insert the collapsible archived section. Final structure of the `<nav>` block:

```tsx
        <nav
          className="flex-1 overflow-y-auto p-2"
          data-testid="conversation-list"
        >
          {sortedActive.length === 0 && sortedArchived.length === 0 ? (
            <div className="p-4 text-center space-y-3">
              <p className="text-sm text-muted-foreground">No conversations yet.</p>
              <Link to="/contacts">
                <Button size="sm" variant="outline">
                  Browse contacts
                </Button>
              </Link>
            </div>
          ) : (
            <>
              {sortedActive.map((c: any, i: number) => {
                const label = deriveConversationLabel(c.conversation, me);
                return (
                  <Link
                    key={i}
                    to={`/conversations/${c.conversation.$jazz.id}`}
                    className="block p-2 hover:bg-accent rounded text-sm"
                    data-testid={`conversation-row-${i}`}
                  >
                    {label}
                  </Link>
                );
              })}

              {sortedArchived.length > 0 && (
                <div className="mt-4 border-t border-gray-200 pt-2">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 w-full"
                    onClick={() => setArchivedExpanded((v) => !v)}
                    data-testid="archived-section-header"
                  >
                    <span>{archivedExpanded ? "▼" : "▶"}</span>
                    <span>Archived ({sortedArchived.length})</span>
                  </button>
                  {archivedExpanded && (
                    <div data-testid="archived-section-list">
                      {sortedArchived.map((c: any, i: number) => {
                        const label = deriveConversationLabel(c.conversation, me);
                        return (
                          <div
                            key={i}
                            className="group flex items-center gap-1 p-2 hover:bg-accent rounded text-sm text-gray-500 italic opacity-70"
                            data-testid={`archived-row-${i}`}
                          >
                            <Link
                              to={`/conversations/${c.conversation.$jazz.id}`}
                              className="flex-1 min-w-0 truncate"
                            >
                              {label}
                            </Link>
                            <button
                              type="button"
                              className="opacity-0 group-hover:opacity-100 text-xs text-red-600 px-1"
                              title="Remove from archive"
                              data-testid={`archived-remove-${i}`}
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!confirm("Remove this conversation from your archive? This cannot be undone.")) return;
                                await removeFromArchive(me, c.conversation);
                              }}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </nav>
```

- [ ] **Step 5: Typecheck + unit suite**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(sidebar): collapsible Archived section with remove-from-archive X button"
```

---

### Task 10: Read-only mode in MembersRoute

**Files:**
- Modify: `src/routes/conversations/members.tsx`

- [ ] **Step 1: Add `isArchived` import**

In `src/routes/conversations/members.tsx`, add to the imports block:

```ts
import { isArchived } from "@/jazz/conversation";
```

- [ ] **Step 2: Compute `archivedForMe` flag**

In the component body, after the line that computes `iAmAdmin` (~line 141), add:

```ts
const archivedForMe = me.$isLoaded && conversation ? isArchived(me, conversation) : false;
const iAmCurrentMember = !archivedForMe;
```

- [ ] **Step 3: Gate Add Member button**

Find the Add Member button render block. Change the gating from `iAmAdmin` to `iAmAdmin && iAmCurrentMember`. Use a grep to find the exact location:

```bash
grep -n "add-member-btn\|Add member" src/routes/conversations/members.tsx
```

- [ ] **Step 4: Gate the per-member action buttons**

Find the admin-actions block (around lines 367-403 — the `{iAmAdmin && !isMe && (…)}` block containing Promote and Remove buttons). Change the gating expression to:

Before:
```tsx
                  {iAmAdmin && !isMe && (
```

After:
```tsx
                  {iAmAdmin && iAmCurrentMember && !isMe && (
```

- [ ] **Step 5: Gate the Leave button**

Find the Leave button (search for `leave-conversation-btn`). Wrap its render in `iAmCurrentMember &&`. If the button is unconditionally rendered, change to:

```tsx
{iAmCurrentMember && (
  <Button
    ...
    data-testid="leave-conversation-btn"
  >
    Leave conversation
  </Button>
)}
```

- [ ] **Step 6: Gate title editing**

Find `startTitleEdit` (~line 216). Add the `iAmCurrentMember` check:

Before:
```ts
function startTitleEdit() {
  if (!iAmAdmin) return;
  setTitleDraft(conversationTitle);
  setTitleEditing(true);
}
```

After:
```ts
function startTitleEdit() {
  if (!iAmAdmin || !iAmCurrentMember) return;
  setTitleDraft(conversationTitle);
  setTitleEditing(true);
}
```

- [ ] **Step 7: Typecheck + unit suite**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/routes/conversations/members.tsx
git commit -m "feat(members): hide action buttons when conversation is archived"
```

---

## Phase C — E2E + docs

### Task 11: E2E — archive-after-leave

**Files:**
- Create: `tests/e2e/archive-after-leave.spec.ts`

- [ ] **Step 1: Read existing patterns**

Read `tests/e2e/leave-conversation.spec.ts` to learn the existing pairing + leave flow. The new spec follows the same setup but asserts the post-leave archive behavior.

```bash
cat tests/e2e/leave-conversation.spec.ts | head -80
```

- [ ] **Step 2: Write the spec**

Create `tests/e2e/archive-after-leave.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { setupAccount, pairWith, startConversation, sendMessage } from "./helpers";

test("self-leave lands conversation in archive section (Slice 4)", async ({ browser }) => {
  // Two paired accounts: Alice and Bob, both admin of a fresh 1:1
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const pageA = await aliceCtx.newPage();
  const pageB = await bobCtx.newPage();

  await setupAccount(pageA, "Alice");
  await setupAccount(pageB, "Bob");
  await pairWith(pageA, pageB);
  await startConversation(pageA, "Bob");
  await sendMessage(pageA, "Hello Bob");
  await expect(pageB.getByText("Hello Bob")).toBeVisible({ timeout: 10_000 });

  // Alice opens the conversation, navigates to Members, clicks Leave, confirms
  pageA.on("dialog", (d) => d.accept());
  await pageA.getByTestId("members-link").click();
  await pageA.getByTestId("leave-conversation-btn").click();
  await pageA.waitForURL("**/conversations");

  // Sidebar: active list does NOT contain the conversation with Bob
  // (it's no longer active for Alice)
  await expect(pageA.getByTestId("conversation-row-0")).not.toBeVisible({ timeout: 3_000 });

  // Sidebar: Archived (1) header appears
  const archivedHeader = pageA.getByTestId("archived-section-header");
  await expect(archivedHeader).toBeVisible();
  await expect(archivedHeader).toHaveText(/Archived \(1\)/);

  // Expand the section; the conversation is in there
  await archivedHeader.click();
  await expect(pageA.getByTestId("archived-section-list")).toBeVisible();
  await expect(pageA.getByTestId("archived-row-0")).toBeVisible();

  // Click the archived row → archived banner shows; composer is gone
  await pageA.getByTestId("archived-row-0").locator("a").click();
  await expect(pageA.getByTestId("archived-banner")).toBeVisible();
  await expect(pageA.getByTestId("composer-textarea")).not.toBeVisible();
});
```

(Adjust helper imports to match the actual `tests/e2e/helpers` exports — grep `tests/e2e/helpers.ts` or whatever file defines them.)

- [ ] **Step 3: Run the spec**

Run: `npm run test:e2e -- archive-after-leave`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/archive-after-leave.spec.ts
git commit -m "test(e2e): self-leave lands conversation in archive section"
```

---

### Task 12: E2E — archive-after-kick

**Files:**
- Create: `tests/e2e/archive-after-kick.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/archive-after-kick.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { setupAccount, pairWith, startGroup, sendMessage } from "./helpers";

test("admin-kicks-member lands conversation in kicked member's archive (Slice 4)", async ({ browser }) => {
  // Alice creates a 3-member group with Bob and Charlie. Then removes Charlie.
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const charlieCtx = await browser.newContext();
  const pageA = await aliceCtx.newPage();
  const pageB = await bobCtx.newPage();
  const pageC = await charlieCtx.newPage();

  await setupAccount(pageA, "Alice");
  await setupAccount(pageB, "Bob");
  await setupAccount(pageC, "Charlie");
  await pairWith(pageA, pageB);
  await pairWith(pageA, pageC);

  // Alice creates the group (reuse the startGroup helper used by existing
  // tests/e2e/group-create.spec.ts — adapt invocation if helper signature differs)
  await startGroup(pageA, ["Bob", "Charlie"], "Trip planning");
  await sendMessage(pageA, "Hi everyone");
  await expect(pageC.getByText("Hi everyone")).toBeVisible({ timeout: 10_000 });

  // Alice opens Members, removes Charlie
  pageA.on("dialog", (d) => d.accept());
  await pageA.getByTestId("members-link").click();
  // Find Charlie's account ID by grabbing the member row label match
  const charlieRow = pageA.locator('[data-testid^="member-row-"]').filter({ hasText: "Charlie" });
  const charlieTestId = await charlieRow.getAttribute("data-testid");
  expect(charlieTestId).toBeTruthy();
  const charlieID = charlieTestId!.replace("member-row-", "");
  await pageA.getByTestId(`remove-${charlieID}`).click();

  // Charlie's sidebar: conversation now under Archived (1)
  const archivedHeader = pageC.getByTestId("archived-section-header");
  await expect(archivedHeader).toHaveText(/Archived \(1\)/, { timeout: 10_000 });
  await archivedHeader.click();
  await expect(pageC.getByTestId("archived-row-0")).toBeVisible();

  // Charlie opens the archived conversation; sees the "Alice removed Charlie" event
  await pageC.getByTestId("archived-row-0").locator("a").click();
  await expect(pageC.getByTestId("system-event-removed")).toBeVisible();
});
```

- [ ] **Step 2: Run the spec**

Run: `npm run test:e2e -- archive-after-kick`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/archive-after-kick.spec.ts
git commit -m "test(e2e): admin-kicks-member lands conversation in kicked member's archive"
```

---

### Task 13: E2E — system-events-chronological

**Files:**
- Create: `tests/e2e/system-events-chronological.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/system-events-chronological.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { setupAccount, pairWith, startGroup, sendMessage } from "./helpers";

test("'added' system event renders at the correct chronological position in the timeline (Slice 4)", async ({ browser }) => {
  // Alice creates a 2-person group with Bob, sends a message, adds Charlie,
  // sends another message. The timeline should show:
  //   message #1 → "Alice added Charlie" → message #2
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const charlieCtx = await browser.newContext();
  const pageA = await aliceCtx.newPage();
  const pageB = await bobCtx.newPage();
  const pageC = await charlieCtx.newPage();

  await setupAccount(pageA, "Alice");
  await setupAccount(pageB, "Bob");
  await setupAccount(pageC, "Charlie");
  await pairWith(pageA, pageB);
  await pairWith(pageA, pageC);

  // Alice creates a 2-person group with Bob only
  await startGroup(pageA, ["Bob"], "Plans");
  await sendMessage(pageA, "First message");
  await expect(pageB.getByText("First message")).toBeVisible({ timeout: 10_000 });

  // Alice opens Members, adds Charlie
  await pageA.getByTestId("members-link").click();
  await pageA.getByTestId("add-member-btn").click();
  await pageA.getByTestId("contact-picker-row-0").click(); // Charlie (only available contact)
  await pageA.getByTestId("contact-picker-continue").click();
  await pageA.waitForTimeout(500); // let add settle

  // Alice navigates back to the conversation, sends another message
  await pageA.getByTestId("back-btn").click();
  await sendMessage(pageA, "Second message");

  // Now read the timeline order on Alice's screen
  const timelineItems = await pageA
    .getByTestId("message-timeline")
    .locator('[data-testid^="message-bubble-"], [data-testid^="system-event-"]')
    .all();

  // Map each locator to a "type:text" descriptor for ordering assertions
  const descriptions: string[] = [];
  for (const item of timelineItems) {
    const testId = await item.getAttribute("data-testid");
    const text = (await item.innerText()).trim().replace(/\s+/g, " ");
    descriptions.push(`${testId}: ${text}`);
  }

  // Expected order: first message → added event → second message
  const firstMsgIdx = descriptions.findIndex((d) => d.includes("First message"));
  const addedIdx = descriptions.findIndex((d) => d.startsWith("system-event-added"));
  const secondMsgIdx = descriptions.findIndex((d) => d.includes("Second message"));

  expect(firstMsgIdx).toBeGreaterThanOrEqual(0);
  expect(addedIdx).toBeGreaterThan(firstMsgIdx);
  expect(secondMsgIdx).toBeGreaterThan(addedIdx);
});
```

- [ ] **Step 2: Run the spec**

Run: `npm run test:e2e -- system-events-chronological`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/system-events-chronological.spec.ts
git commit -m "test(e2e): system events render at correct chronological timeline position"
```

---

### Task 14: E2E — archive-remove + update leave-conversation.spec.ts

**Files:**
- Create: `tests/e2e/archive-remove.spec.ts`
- Modify: `tests/e2e/leave-conversation.spec.ts`

- [ ] **Step 1: Write archive-remove spec**

Create `tests/e2e/archive-remove.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { setupAccount, pairWith, startConversation, sendMessage } from "./helpers";

test("X button on archived row removes conversation from knownConversations entirely (Slice 4)", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const pageA = await aliceCtx.newPage();
  const pageB = await bobCtx.newPage();

  await setupAccount(pageA, "Alice");
  await setupAccount(pageB, "Bob");
  await pairWith(pageA, pageB);
  await startConversation(pageA, "Bob");
  await sendMessage(pageA, "Hi");
  await expect(pageB.getByText("Hi")).toBeVisible({ timeout: 10_000 });

  // Alice leaves
  pageA.on("dialog", (d) => d.accept());
  await pageA.getByTestId("members-link").click();
  await pageA.getByTestId("leave-conversation-btn").click();
  await pageA.waitForURL("**/conversations");

  // Expand archive
  const archivedHeader = pageA.getByTestId("archived-section-header");
  await expect(archivedHeader).toBeVisible();
  await archivedHeader.click();
  await expect(pageA.getByTestId("archived-row-0")).toBeVisible();

  // Hover the row and click ×
  await pageA.getByTestId("archived-row-0").hover();
  await pageA.getByTestId("archived-remove-0").click();

  // Archived section disappears (count is now 0 → header doesn't render)
  await expect(pageA.getByTestId("archived-section-header")).not.toBeVisible({ timeout: 3_000 });
});
```

- [ ] **Step 2: Update leave-conversation.spec.ts**

`tests/e2e/leave-conversation.spec.ts` was written for the Slice 3a/3b behavior where leave REMOVED the conversation from the sidebar entirely. Slice 4 changes that — the conversation lands in archive instead.

Read the current spec:
```bash
cat tests/e2e/leave-conversation.spec.ts
```

Find the assertion that says something like `await expect(conversation-row-0).not.toBeVisible()`. Update to instead assert:
- The active list no longer contains the conversation (`conversation-row-0` not visible) — KEEP this assertion (still true).
- The archived section IS now visible with `Archived (1)`. ADD this assertion.

For example, after the leave action:

```ts
// Active conversation list no longer shows the conversation
await expect(pageA.getByTestId("conversation-row-0")).not.toBeVisible({ timeout: 3_000 });

// But it lives in archive now (Slice 4)
await expect(pageA.getByTestId("archived-section-header")).toHaveText(/Archived \(1\)/);
```

- [ ] **Step 3: Run both specs**

Run: `npm run test:e2e -- archive-remove leave-conversation`
Expected: PASS for both.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/archive-remove.spec.ts tests/e2e/leave-conversation.spec.ts
git commit -m "test(e2e): archive-remove flow + leave-conversation updated for Slice 4 archive behavior"
```

---

### Task 15: Full regression + CHANGELOG + ready-for-tag

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run full unit suite**

Run: `npm test`
Expected: PASS — all tests green (90 + Phase A additions = ~95+).

- [ ] **Step 2: Run full e2e suite**

Run: `npm run test:e2e`
Expected: PASS — all existing specs (34) + 4 new specs = 38 e2e.

If any pre-Slice-4 spec fails, investigate:
- `tests/e2e/leave-conversation.spec.ts` — should have been updated in Task 14. Verify the assertion change works.
- `tests/e2e/conversation-list-ordering.spec.ts` — sidebar sort logic touches both active and archived; verify both lists render correctly.
- `tests/e2e/messaging-1to1.spec.ts` — composer should still work; no regression expected.
- Any spec that asserts presence of `system-event-left` testid — Slice 4's SystemEvent component still produces that testid, so the assertion should hold IF a "left" event was actually written via Slice 4's `leaveConversation`. Pre-Slice-4 conversations in tests don't go through the new write path; but each test creates fresh accounts so all conversations should produce events.

- [ ] **Step 3: Verify acceptance criteria**

Spot-check the spec §7 acceptance criteria via greps:

```bash
# Criterion 7: systemEvents ?? [] handles undefined gracefully
grep -rn "systemEvents \?\?" src/
# Expected: matches in detail.tsx and possibly elsewhere
```

- [ ] **Step 4: Update CHANGELOG.md**

Read existing CHANGELOG.md to match style:
```bash
head -50 CHANGELOG.md
```

Insert a new entry above the Slice 3c block:

```markdown
## Slice 4 — Conversation Lifecycle

**Closes:** NOX-17 (archive of left/kicked conversations), NOX-18 (chronologically-positioned system events). Partial NOX-16 (archive view shipped; disband still open).

### Added
- `Conversation.systemEvents: co.list(SystemEvent)` sidecar log capturing membership changes.
- `SystemEvent` schema (`src/jazz/schema/SystemEvent.ts`) with four kinds: `added`, `removed`, `left`, `promoted`. Each entry records actor, target (omitted for `left`), and occurredAt.
- `isArchived(me, conversation)` and `removeFromArchive(me, conversation)` protocol primitives.
- Collapsible "Archived" section in the sidebar — shows conversations the user is no longer a member of, with hover-revealed X to permanently remove from knownConversations.
- Read-only conversation detail when archived: composer hidden, banner shown, MembersRoute hides action buttons.

### Changed
- `addMemberToConversation`, `removeMemberFromConversation`, `leaveConversation`, `promoteToAdmin` now write a `SystemEvent` before performing their action. For `leaveConversation` the write goes BEFORE self-revoke (otherwise the leaver loses write permission).
- `leaveConversation` no longer removes the conversation from `me.root.knownConversations`. The conversation now lands in the Archived section automatically.
- Conversation detail timeline renders a merged sorted stream of messages + system events. The old `getRoleOf`-based "X left" heuristic and 2-second polling effect are removed — the sidecar log is the single source of truth.
- `SystemEvent` component grew to accept all four event kinds. Display names resolved at render via `resolveDisplayName` (no pre-computed name maps).

### Test coverage
- Schema unit tests for SystemEvent (3 cases).
- Protocol unit tests for event writes in 4 functions (4 cases).
- Unit tests for `isArchived`, `removeFromArchive`, and new `leaveConversation` archive behavior.
- 4 new e2e specs: `archive-after-leave`, `archive-after-kick`, `system-events-chronological`, `archive-remove`.

### Deferred
- Disband group action — stays open in NOX-16.
- `demoteToWriter` system event — not UI-callable currently; will add when a self-demote flow ships.
- Late-joiner privacy filter for historical events — not added; late joiners see whatever events are in the log they have read access to.
```

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for Slice 4"
```

- [ ] **Step 6: Final report**

Do NOT tag. The controller tags and merges via `finishing-a-development-branch`. In your final report include:

- All 15 commit SHAs in order (Tasks 1-5 are individual; Tasks 6+7 are combined into one commit; Tasks 8-15 individual = 14 commits total on top of the spec commit).
- Final unit + e2e test counts.
- Whether `leave-conversation.spec.ts` update worked cleanly or needed restructuring.
- Any flakes encountered.
- Any TaskList followups created during implementation.

---

## Acceptance criteria (verbatim from spec §7)

1. After Alice self-leaves a group, the conversation appears in her sidebar under `▶ Archived (1)`, NOT removed entirely. Her last-known message history is viewable read-only. — Tasks 5 + 9 + 11.
2. After Bob (admin) removes Alice from a group, the conversation appears in Alice's sidebar under `▶ Archived (1)`. System event log shows "Bob removed Alice". — Tasks 3 + 9 + 12.
3. When Alice adds Charlie at 10:30 and a message is sent at 10:35, the "Alice added Charlie" pill renders BEFORE the 10:35 message in the timeline, not at the bottom. — Tasks 3 + 7 + 13.
4. Opening an archived conversation shows the read-only banner, no composer, no action buttons on MembersRoute. Header still navigates to MembersRoute (read-only mode). — Tasks 8 + 10 + 11.
5. Clicking X on an archived sidebar row + confirming removes the conversation from knownConversations. Disappears from both archived and active lists. — Tasks 4 + 9 + 14.
6. All Slice 1/2/3a/3b/3c regression e2e tests still pass. — Task 15.
7. `conversation.systemEvents ?? []` handles pre-Slice-4 conversations without crashing. — Tasks 7 + 3 (defensive `?? []` everywhere it's read).