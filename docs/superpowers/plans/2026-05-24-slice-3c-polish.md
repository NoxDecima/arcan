> **Historical context (added 2026-06-07):** this document was written when the project was named **jazz-messanger**. The project was renamed to **Arcan** on 2026-06-05; the app rebrand itself is captured as Unit 5 in `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md`. This file is preserved as-is for historical accuracy.
# Slice 3c — Post-3b Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close NOX-14 (demote button crashes on admin-to-admin) and NOX-15 (stale `kind` after 1:1→group) by simplifying the data model: drop the `kind` field, unify display-name resolution, and remove the demote button.

**Architecture:** Two phases. Phase A touches the data layer (schema removal, protocol helper, discovery rewrite) and runs a small cojson reconnaissance test that determines a Phase B UI decision. Phase B updates four UI surfaces (sidebar, MessageRow, MembersRoute, conversation detail) to consume the new helpers and reflect the recon result, plus regression e2e.

**Tech Stack:** TypeScript strict, React 18, jazz-tools 0.20.18 (Zod-based functional schema API), Tailwind v3, Vitest 4 unit, Playwright e2e.

**Branch:** `slice-3c-polish` (already created, spec committed at `docs/superpowers/specs/2026-05-24-slice-3c-polish-design.md`).

**Critical reminders:**

- **NOX-13 footgun:** all CoValue field writes MUST go through `instance.$jazz.set(key, value)`. Direct property assignment (`conv.title = "x"`) silently no-ops.
- **No migration code:** project CLAUDE.md authorizes recreating users from scratch. Removed fields are silently ignored on read by Zod-based `co.map` schemas.
- **Phase B is BLOCKED by Phase A Task 5** (cojson admin-remove-admin recon). The recon outcome determines whether MembersRoute's Remove button is hidden on admin rows.

---

## File map

| File | Phase | Change |
|---|---|---|
| `src/jazz/displayName.ts` | A | **NEW** — pure helper `resolveDisplayName({ accountID, me, group? })` |
| `tests/unit/jazz/displayName.test.ts` | A | **NEW** — table-driven unit tests for the resolution chain |
| `src/jazz/schema/Conversation.ts` | A | Remove `kind`; `title` already optional |
| `src/jazz/conversation.ts` | A | `findOrCreate1to1Conversation`: drop `kind === "dm"` filter, rewrite to member-set comparison; `createGroupConversation`/`findOrCreate1to1`: drop the `kind` field from create payload; `updateConversationTitle`: drop the `kind !== "group"` gate |
| `tests/unit/jazz/conversation.test.ts` | A | Update `makeConversation` helper to drop `kind`; add 3 new test cases (member-set discovery, title editable on 2-person, admin-remove-admin recon); remove obsolete cases that asserted kind-based behavior |
| `src/components/sidebar.tsx` | B | Replace `c.kind === "dm"` contact lookup with `deriveConversationTitle` synthesis using `resolveDisplayName` |
| `src/routes/conversations/detail.tsx` | B | Author display uses `resolveDisplayName`; "view contact" gate replaced with 2-member + in-contactBook check |
| `src/routes/conversations/members.tsx` | B | Inline name resolution replaced with `resolveDisplayName`; demote button removed; Remove button gated by recon result |
| `tests/e2e/group-roles.spec.ts` | B | Drop assertions that the demote button is visible on admin rows |
| `tests/e2e/group-member-management.spec.ts` | B | Adjust assertions if admin-remove-admin behavior shifts |
| `tests/e2e/group-create.spec.ts` | B | Add assertion: third-party member's profile name resolves (not "Unknown") in the message header |
| `CHANGELOG.md` | B | Slice 3c entry |

---

## Phase A — Data layer + helper + recon

### Task 1: Create `resolveDisplayName` helper with unit tests

**Files:**
- Create: `src/jazz/displayName.ts`
- Create: `tests/unit/jazz/displayName.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/jazz/displayName.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveDisplayName } from "@/jazz/displayName";

/**
 * resolveDisplayName resolution order:
 *   1. self → "Me" (or me.profile.displayName when available)
 *   2. contactBook displayNameLocal
 *   3. group member profile.name / profile.displayName
 *   4. "Unknown"
 */

function makeMe(myID: string, displayName: string | null, contactBook: any[]) {
  return {
    $jazz: { id: myID },
    profile: displayName ? { displayName } : undefined,
    root: { contactBook },
  };
}

function contact(accountID: string, displayNameLocal: string) {
  return { contactAccountID: accountID, displayNameLocal };
}

function groupMember(accountID: string, name?: string, displayName?: string) {
  const profile: any = {};
  if (name) profile.name = name;
  if (displayName) profile.displayName = displayName;
  return {
    account: {
      $jazz: { id: accountID },
      profile: Object.keys(profile).length ? profile : undefined,
    },
  };
}

function group(members: any[]) {
  return { getDirectMembers: () => members };
}

describe("resolveDisplayName", () => {
  it("returns 'Me' for self when no profile displayName set", () => {
    const me = makeMe("acc_me", null, []);
    expect(resolveDisplayName({ accountID: "acc_me", me })).toBe("Me");
  });

  it("returns profile displayName for self when available", () => {
    const me = makeMe("acc_me", "Alice", []);
    expect(resolveDisplayName({ accountID: "acc_me", me })).toBe("Alice");
  });

  it("returns contactBook displayNameLocal when accountID is in contactBook", () => {
    const me = makeMe("acc_me", "Alice", [contact("acc_bob", "Bob (local)")]);
    expect(resolveDisplayName({ accountID: "acc_bob", me })).toBe("Bob (local)");
  });

  it("prefers contactBook over group profile when both present", () => {
    const me = makeMe("acc_me", "Alice", [contact("acc_bob", "Bob (local)")]);
    const g = group([groupMember("acc_bob", "Bob Smith")]);
    expect(resolveDisplayName({ accountID: "acc_bob", me, group: g })).toBe(
      "Bob (local)",
    );
  });

  it("falls back to group member profile.name when no contactBook entry", () => {
    const me = makeMe("acc_me", "Alice", []);
    const g = group([groupMember("acc_charlie", "Charlie Cohen")]);
    expect(
      resolveDisplayName({ accountID: "acc_charlie", me, group: g }),
    ).toBe("Charlie Cohen");
  });

  it("falls back to group member profile.displayName when no profile.name", () => {
    const me = makeMe("acc_me", "Alice", []);
    const g = group([groupMember("acc_dave", undefined, "Dave D")]);
    expect(resolveDisplayName({ accountID: "acc_dave", me, group: g })).toBe(
      "Dave D",
    );
  });

  it("returns 'Unknown' when no source has the accountID", () => {
    const me = makeMe("acc_me", "Alice", []);
    const g = group([]);
    expect(resolveDisplayName({ accountID: "acc_stranger", me, group: g })).toBe(
      "Unknown",
    );
  });

  it("returns 'Unknown' when group is omitted and contactBook misses", () => {
    const me = makeMe("acc_me", "Alice", []);
    expect(resolveDisplayName({ accountID: "acc_stranger", me })).toBe(
      "Unknown",
    );
  });

  it("tolerates members with no account (defensively)", () => {
    const me = makeMe("acc_me", "Alice", []);
    const g = group([{ account: null }, groupMember("acc_eve", "Eve")]);
    expect(resolveDisplayName({ accountID: "acc_eve", me, group: g })).toBe(
      "Eve",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/jazz/displayName.test.ts`
Expected: FAIL with module-not-found error for `@/jazz/displayName`.

- [ ] **Step 3: Implement the helper**

Create `src/jazz/displayName.ts`:

```ts
/**
 * Single-source name resolution used by both MessageRow (in detail.tsx) and
 * MembersRoute. Resolution order:
 *
 *   1. self → me.profile.displayName ?? "Me"
 *   2. contactBook entry whose contactAccountID matches
 *   3. group member whose account.$jazz.id matches, using profile.name then profile.displayName
 *   4. "Unknown"
 *
 * The helper is pure: no async, no Jazz mutations. Inputs are already-loaded
 * Jazz CoValues / proxies.
 */
export function resolveDisplayName(args: {
  accountID: string;
  me: any;
  group?: any;
}): string {
  const { accountID, me, group } = args;

  const myID = me?.$jazz?.id ?? null;
  if (myID && accountID === myID) {
    return me?.profile?.displayName ?? "Me";
  }

  const contactBook = me?.root?.contactBook;
  if (contactBook) {
    for (const c of Array.from(contactBook) as any[]) {
      if (c?.contactAccountID === accountID && c?.displayNameLocal) {
        return c.displayNameLocal as string;
      }
    }
  }

  if (group?.getDirectMembers) {
    let members: any[] = [];
    try {
      members = group.getDirectMembers();
    } catch {
      members = [];
    }
    for (const m of members) {
      const memberID = m?.account?.$jazz?.id;
      if (memberID === accountID) {
        const name = m.account?.profile?.name;
        if (name) return name as string;
        const displayName = m.account?.profile?.displayName;
        if (displayName) return displayName as string;
      }
    }
  }

  return "Unknown";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/jazz/displayName.test.ts`
Expected: PASS (9/9).

- [ ] **Step 5: Commit**

```bash
git add src/jazz/displayName.ts tests/unit/jazz/displayName.test.ts
git commit -m "feat(jazz): resolveDisplayName helper with unified resolution chain"
```

---

### Task 2: Drop `kind` from Conversation schema

**Files:**
- Modify: `src/jazz/schema/Conversation.ts`
- Modify: `tests/unit/jazz/conversation.test.ts` (helper)

- [ ] **Step 1: Modify the schema**

Edit `src/jazz/schema/Conversation.ts`:

Before:
```ts
export const Conversation = co.map({
  title: z.string().optional(),
  kind: z.enum(["dm", "group"]),
  createdAt: z.date(),
  createdBy: z.string(),
  messages: co.list(Message),
});
```

After:
```ts
export const Conversation = co.map({
  title: z.string().optional(),
  createdAt: z.date(),
  createdBy: z.string(),
  messages: co.list(Message),
});
```

Also update the file's top-level doc comment by removing the "1:1 or group" framing — conversations now have one shape regardless of member count. Replace lines 4-13 with:

```ts
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
```

- [ ] **Step 2: Update the test helper that constructs a Conversation**

Edit `tests/unit/jazz/conversation.test.ts` lines 25-38. Drop `kind: "dm"` from the `makeConversation` helper's create payload:

Before:
```ts
async function makeConversation(me: any) {
  const conversationGroup = Group.create({ owner: me });
  const conversation = Conversation.create(
    {
      kind: "dm",
      createdAt: new Date(),
      createdBy: me.$jazz.id,
      messages: co.list(Message).create([], { owner: conversationGroup }),
    },
    { owner: conversationGroup },
  );
  return { conversationGroup, conversation };
}
```

After:
```ts
async function makeConversation(me: any) {
  const conversationGroup = Group.create({ owner: me });
  const conversation = Conversation.create(
    {
      createdAt: new Date(),
      createdBy: me.$jazz.id,
      messages: co.list(Message).create([], { owner: conversationGroup }),
    },
    { owner: conversationGroup },
  );
  return { conversationGroup, conversation };
}
```

- [ ] **Step 3: Verify the schema change typechecks**

Run: `npx tsc --noEmit`
Expected: errors in `src/jazz/conversation.ts` (the create payloads at lines ~111 and ~185 still set `kind`) and possibly in tests that read `conv.kind`. These get fixed in Tasks 3 and 4. **Do not commit yet** — finish Task 3 first so the working tree stays compilable per-commit.

---

### Task 3: Rewrite `findOrCreate1to1Conversation` to use member-set discovery; remove `kind` writes

**Files:**
- Modify: `src/jazz/conversation.ts:37-156` (findOrCreate1to1Conversation)
- Modify: `src/jazz/conversation.ts:111` (drop `kind: "dm"` from create payload)
- Modify: `src/jazz/conversation.ts:185` (drop `kind: "group"` from createGroupConversation payload)
- Modify: `tests/unit/jazz/conversation.test.ts` (add new test, remove kind-coupled tests)

- [ ] **Step 1: Write the failing test**

In `tests/unit/jazz/conversation.test.ts`, find the existing `describe("findOrCreate1to1Conversation", …)` block. Add this new test inside it:

```ts
it("returns an existing 2-member conversation matching {me, contact} even if it lacks an explicit kind", async () => {
  const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
  const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
  linkAccounts(me, bob);

  const bobContact = {
    contactAccountID: bob.$jazz.id,
    displayNameLocal: "Bob",
  };

  // Manually create a conversation with bob (no kind field) and push to knownConversations
  const conversationGroup = Group.create({ owner: me });
  conversationGroup.addMember(bob, "admin");
  const existing = Conversation.create(
    {
      createdAt: new Date(),
      createdBy: me.$jazz.id,
      messages: co.list(Message).create([], { owner: conversationGroup }),
    },
    { owner: conversationGroup },
  );
  me.root.knownConversations.$jazz.push(existing);

  const result = await findOrCreate1to1Conversation(me, bobContact);
  expect(result.$jazz.id).toBe(existing.$jazz.id);
});
```

Search the file for any existing test that reads `.kind` from a conversation (e.g., `expect(conversation.kind).toBe("dm")`) and **delete those test cases entirely** — they're asserting on a field that no longer exists. The behaviors they covered (a new 1:1 was created, a participant was added with admin role) are already covered by other tests in the block; if the only thing a deleted test was checking was `kind`, the coverage isn't load-bearing.

- [ ] **Step 2: Run test to verify the new one fails**

Run: `npx vitest run tests/unit/jazz/conversation.test.ts -t "matching {me, contact}"`
Expected: FAIL because `findOrCreate1to1Conversation` currently filters by `cAny.kind !== "dm"` and the existing conversation lacks a `kind` field → it's skipped → a new conversation is created instead.

- [ ] **Step 3: Rewrite `findOrCreate1to1Conversation`**

In `src/jazz/conversation.ts`, replace the body of `findOrCreate1to1Conversation` (lines 37-156). The diff is precise; show full replacement:

```ts
export async function findOrCreate1to1Conversation(
  me: Account,
  contact: any,
): Promise<any> {
  const otherAccountID = contact.contactAccountID as string;
  const myAccountID = (me as any).$jazz?.id as string;

  /**
   * Safely iterate knownConversations. The list may be a NotLoaded CoValue
   * proxy (truthy but not iterable) if the calling component's resolve query
   * doesn't include knownConversations. Guard with both existence and
   * iterability checks.
   */
  function iterateKnown(list: any): any[] {
    if (!list || typeof list[Symbol.iterator] !== "function") return [];
    try {
      return Array.from(list);
    } catch {
      return [];
    }
  }

  /**
   * A conversation matches "the 1:1 with this contact" iff its direct admin-
   * or-writer members form exactly the set {me, otherAccountID}. This replaces
   * the prior `kind === "dm"` filter — see Slice 3c §2 (drop-the-kind-field).
   * A former 3-member group that decayed to 2 members WILL match; that's
   * intentional: a conversation between exactly me and Bob IS my conversation
   * with Bob, regardless of how it started.
   */
  function isOneToOneWith(conversation: any, otherID: string): boolean {
    const group = conversation?.$jazz?.owner;
    if (!group) return false;
    let members: any[] = [];
    try {
      members = group.getDirectMembers();
    } catch {
      return false;
    }
    const participantIDs = members
      .filter((m: any) => m.role === "admin" || m.role === "writer")
      .map((m: any) => m.account?.$jazz?.id)
      .filter((id: any) => typeof id === "string");
    if (participantIDs.length !== 2) return false;
    return (
      participantIDs.includes(myAccountID) &&
      participantIDs.includes(otherID)
    );
  }

  // Search knownConversations for an existing 1:1 with this contact
  const known = (me as any).root?.knownConversations;
  for (const c of iterateKnown(known)) {
    if (c && isOneToOneWith(c, otherAccountID)) return c;
  }

  // Defensive wait against the duplicate-creation race: if the other party
  // just created the conversation, our Inbox subscription may still be
  // processing the notification. Brief wait + recheck.
  await new Promise((r) => setTimeout(r, 300));
  const knownAfterWait = (me as any).root?.knownConversations;
  for (const c of iterateKnown(knownAfterWait)) {
    if (c && isOneToOneWith(c, otherAccountID)) return c;
  }

  // Load the other account so we can add them as a member
  const otherAccount = await loadAccountByID(me, otherAccountID);
  if (!otherAccount) {
    throw new Error(
      `Cannot load account ${otherAccountID} — contact not reachable`,
    );
  }

  // Create new ConversationGroup with both participants as admin (1:1: both admin)
  const conversationGroup = Group.create({ owner: me });
  conversationGroup.addMember(otherAccount, "admin");

  const conversation = Conversation.create(
    {
      createdAt: new Date(),
      createdBy: (me as any).$jazz.id,
      messages: co.list(Message).create([], { owner: conversationGroup }),
    },
    { owner: conversationGroup },
  );

  // Push to my own knownConversations
  (me as any).root.knownConversations.$jazz.push(conversation);

  // Notify the other party via their inbox so their sidebar can auto-discover
  // the conversation without requiring them to navigate to an explicit URL.
  const conversationID = (conversation as any).$jazz.id as string;
  void (async () => {
    try {
      // Fresh notification group — the other account has no prior role here,
      // so InboxSender's add-as-writer call won't conflict with admin role.
      const notificationGroup = Group.create({ owner: me });
      const notification = ConversationNotification.create(
        { conversationID },
        { owner: notificationGroup },
      );
      const sender = await InboxSender.load<typeof notification>(otherAccountID as any, me);
      await sender.sendMessage(notification);
    } catch (e) {
      console.warn("[inbox] Failed to deliver conversation to other party's inbox:", e);
    }
  })();

  return conversation;
}
```

- [ ] **Step 4: Remove the `kind: "group"` write in `createGroupConversation`**

In `src/jazz/conversation.ts`, edit the `Conversation.create` call inside `createGroupConversation` (around line 182-191). Drop the `kind: "group"` line:

Before:
```ts
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
```

After:
```ts
const conversation = Conversation.create(
  {
    title,
    createdAt: new Date(),
    createdBy: (me as any).$jazz.id,
    messages: co.list(Message).create([], { owner: conversationGroup }),
  },
  { owner: conversationGroup },
);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/jazz/conversation.test.ts`
Expected: PASS — the new "matching {me, contact}" test passes; existing findOrCreate1to1 tests still pass; createGroupConversation tests still pass.

Run: `npx tsc --noEmit`
Expected: PASS — schema field removal is complete in production code (only `updateConversationTitle` may still reference `.kind`, fixed in Task 4).

- [ ] **Step 6: Commit**

```bash
git add src/jazz/schema/Conversation.ts src/jazz/conversation.ts tests/unit/jazz/conversation.test.ts
git commit -m "refactor(conversation): drop kind field; findOrCreate1to1 uses member-set discovery"
```

---

### Task 4: Drop the `kind === "group"` gate from `updateConversationTitle`

**Files:**
- Modify: `src/jazz/conversation.ts:461-470` (updateConversationTitle)
- Modify: `tests/unit/jazz/conversation.test.ts` (add test)

- [ ] **Step 1: Write the failing test**

In `tests/unit/jazz/conversation.test.ts`, find the existing `describe("updateConversationTitle", …)` block (or create one if it doesn't exist). Add:

```ts
it("allows setting a title on a 2-person conversation (formerly DM)", async () => {
  const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
  const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
  linkAccounts(me, bob);

  const conversationGroup = Group.create({ owner: me });
  conversationGroup.addMember(bob, "admin");
  const conversation = Conversation.create(
    {
      createdAt: new Date(),
      createdBy: me.$jazz.id,
      messages: co.list(Message).create([], { owner: conversationGroup }),
    },
    { owner: conversationGroup },
  );

  await updateConversationTitle(me, conversation, "Custom Label");
  expect((conversation as any).title).toBe("Custom Label");
});
```

If there are existing tests asserting `updateConversationTitle` is a no-op for DMs (i.e., asserting title remains undefined after a call), **delete them** — the behavior is intentionally changing in this task.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/jazz/conversation.test.ts -t "title on a 2-person"`
Expected: FAIL because the current function returns early when `conversation.kind !== "group"`, and there is no `kind` field on the new-style conversation.

- [ ] **Step 3: Drop the gate**

In `src/jazz/conversation.ts`, replace the `updateConversationTitle` function body (lines 461-470):

Before:
```ts
/**
 * Update the conversation title. Admin-only for groups; no-op for 1:1
 * (1:1 conversations derive their title from the other participant's display
 * name — there is no explicit title field to update).
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

After:
```ts
/**
 * Update the conversation title on any conversation.
 *
 * Slice 3c removed the kind="group" gate — titles are editable on every
 * conversation regardless of member count. Two-person conversations
 * typically have no title (the sidebar synthesizes a label from the other
 * participant's name); admins may still set one if they want a custom label.
 *
 * The caller is responsible for admin-permission gating in the UI; cojson
 * will reject the underlying $jazz.set at the protocol level if the caller
 * lacks write access to the conversation.
 */
export async function updateConversationTitle(
  _me: Account,
  conversation: any,
  newTitle: string,
): Promise<void> {
  conversation.$jazz.set("title", newTitle);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/jazz/conversation.test.ts`
Expected: PASS — full unit suite green.

Run: `npx tsc --noEmit`
Expected: PASS — no remaining `.kind` references in `src/jazz/`.

- [ ] **Step 5: Commit**

```bash
git add src/jazz/conversation.ts tests/unit/jazz/conversation.test.ts
git commit -m "refactor(conversation): updateConversationTitle works on any conversation"
```

---

### Task 5: Reconnaissance — admin-remove-admin cojson behavior

**Files:**
- Modify: `tests/unit/jazz/conversation.test.ts` (new test)

This task answers the question: *does cojson 0.20.18 permit one admin to remove another admin?* The answer determines whether Phase B Task 8 hides the Remove button on admin rows.

- [ ] **Step 1: Write the reconnaissance test**

Append to `tests/unit/jazz/conversation.test.ts`:

```ts
describe("[recon] cojson admin-remove-admin behavior (Slice 3c)", () => {
  it("documents whether one admin can remove another admin", async () => {
    const alice = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const bob = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    linkAccounts(alice, bob);

    const group = Group.create({ owner: alice });
    group.addMember(bob, "admin");

    // Sanity: both are admins
    const beforeRoles = group.getDirectMembers().map((m: any) => m.role).sort();
    expect(beforeRoles).toEqual(["admin", "admin"]);

    // Attempt: Alice (the caller, the test's "me") removes Bob
    let removeError: unknown = null;
    try {
      await removeMemberFromConversation(
        alice as any,
        { $jazz: { owner: group } } as any,
        bob.$jazz.id,
      );
    } catch (e) {
      removeError = e;
    }

    const afterRoles = group.getDirectMembers().map((m: any) => m.role).sort();
    const stillContainsBob = group
      .getDirectMembers()
      .some((m: any) => m.account?.$jazz?.id === bob.$jazz.id);

    // This test does not assert pass/fail on cojson's behavior — it documents
    // the observed result. Read the commit message for the recorded outcome.
    // The Phase B UI is built against whichever outcome lands.
    console.log("[recon] admin-remove-admin:", {
      removeErrorMessage: removeError instanceof Error ? removeError.message : null,
      beforeRoles,
      afterRoles,
      stillContainsBob,
    });

    // Recon result will be recorded by the implementer in the commit message
    // and used to set REMOVE_ADMIN_PERMITTED in Phase B Task 8.
    // The test itself passes regardless — its purpose is to surface observable
    // behavior, not to enforce it.
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run the reconnaissance test and capture the result**

Run: `npx vitest run tests/unit/jazz/conversation.test.ts -t "admin-remove-admin"`

Read the console output for the `[recon] admin-remove-admin:` line. The four possible outcomes:

| `removeErrorMessage` | `stillContainsBob` | Interpretation |
|---|---|---|
| non-null | true | cojson FORBIDS admin-remove-admin (operation threw, no change) |
| non-null | false | cojson permits but throws a non-fatal warning (operation partly succeeded) |
| null | false | cojson PERMITS admin-remove-admin (clean success) |
| null | true | silent no-op (unexpected — flag for follow-up) |

- [ ] **Step 3: Commit with the recon result in the commit message**

Pick the commit message based on observed outcome:

If cojson PERMITS (third row above):
```bash
git add tests/unit/jazz/conversation.test.ts
git commit -m "$(cat <<'EOF'
test(recon): cojson admin-remove-admin permitted

Phase A reconnaissance for Slice 3c. Test observes that one admin can remove
another admin in cojson 0.20.18 — the operation succeeds cleanly with no
error. Phase B Task 8 should keep the Remove button visible on admin rows.

Recorded console output:
[recon] admin-remove-admin: { removeErrorMessage: null, beforeRoles: [admin, admin], afterRoles: [admin], stillContainsBob: false }
EOF
)"
```

If cojson FORBIDS (first row above):
```bash
git add tests/unit/jazz/conversation.test.ts
git commit -m "$(cat <<'EOF'
test(recon): cojson admin-remove-admin forbidden

Phase A reconnaissance for Slice 3c. Test observes that one admin CANNOT
remove another admin in cojson 0.20.18 — the operation throws and group
membership is unchanged. Phase B Task 8 should hide the Remove button on
admin rows (matching the pattern used for the demote button), and Phase B
should add a TaskList followup capturing the cojson constraint.

Recorded console output:
[recon] admin-remove-admin: { removeErrorMessage: "<actual error>", beforeRoles: [admin, admin], afterRoles: [admin, admin], stillContainsBob: true }
EOF
)"
```

If the outcome is one of the two unexpected rows: do not proceed. Report BLOCKED with the observed output and let the controller decide.

- [ ] **Step 4: Record the result for Phase B**

In your final Phase A status report, include a line: `REMOVE_ADMIN_PERMITTED: true` or `REMOVE_ADMIN_PERMITTED: false` based on the recon outcome. Phase B Task 8 uses this constant directly.

---

## Phase B — UI + e2e + docs

**🚧 BLOCKED until Phase A Task 5 reports `REMOVE_ADMIN_PERMITTED`. 🚧**

### Task 6: Sidebar — replace kind-based contact lookup with title synthesis

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Add the import**

In `src/components/sidebar.tsx`, add to the existing imports block:

```ts
import { resolveDisplayName } from "@/jazz/displayName";
```

- [ ] **Step 2: Replace the `c.kind === "dm"` branch with member-based synthesis**

Replace lines 42-66 (the `contactBook` / `knownConversations` derivation through the end of the `.map`) with:

```ts
  // Slice 3c: derive conversation list from knownConversations (unified shape).
  // The label for each conversation prefers the explicit title; falls back to
  // synthesizing from non-me direct members. resolveDisplayName handles the
  // contact-book / profile chain.
  const knownConversations = me.root.knownConversations;

  const conversations = Array.from(knownConversations ?? [])
    .filter((c: any) => c != null)
    .map((c: any) => ({ conversation: c }));
```

- [ ] **Step 3: Replace the `label` derivation in the row render**

Find the row render block (around lines 131-147). Replace the `label` derivation:

Before:
```ts
            conversations.map((c: any, i: number) => {
              // Derive display label: use contact name for DM, title for group
              const label =
                c.contact?.displayNameLocal ??
                c.conversation?.title ??
                "Conversation";
```

After:
```ts
            conversations.map((c: any, i: number) => {
              const label = deriveConversationLabel(c.conversation, me);
```

- [ ] **Step 4: Add the `deriveConversationLabel` helper above the component**

Insert this helper at the module level, just above the `export function Sidebar()` declaration:

```ts
/**
 * Derive a sidebar label for a conversation: explicit title wins; else
 * synthesize from the non-me direct members. Uses resolveDisplayName so the
 * contact-book / profile resolution chain stays consistent with MessageRow.
 */
function deriveConversationLabel(conversation: any, me: any): string {
  const explicit = conversation?.title;
  if (typeof explicit === "string" && explicit.length > 0) return explicit;

  const myID = me?.$jazz?.id ?? null;
  const group = conversation?.$jazz?.owner;
  if (!group) return "Conversation";

  let members: any[] = [];
  try {
    members = group.getDirectMembers();
  } catch {
    return "Conversation";
  }

  const others = members
    .filter(
      (m: any) =>
        (m.role === "admin" || m.role === "writer") &&
        m.account?.$jazz?.id !== myID,
    )
    .map((m: any) => m.account?.$jazz?.id)
    .filter((id: any) => typeof id === "string") as string[];

  if (others.length === 0) return "Conversation";

  const names = others.map((id) =>
    resolveDisplayName({ accountID: id, me, group }),
  );

  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names[0]}, ${names[1]} +${names.length - 2} more`;
}
```

- [ ] **Step 5: Typecheck + verify in browser**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm test`
Expected: PASS — sidebar code paths aren't unit-tested directly, but no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(sidebar): synthesize conversation label from members when no explicit title"
```

---

### Task 7: detail.tsx — author resolution via `resolveDisplayName` + member-based view-contact gate

**Files:**
- Modify: `src/routes/conversations/detail.tsx`

- [ ] **Step 1: Add the import**

In `src/routes/conversations/detail.tsx`, add to the existing imports block (near the top, with other `@/jazz/` imports):

```ts
import { resolveDisplayName } from "@/jazz/displayName";
```

- [ ] **Step 2: Replace the kind-based view-contact gate**

Find the `contact` derivation block (lines 77-100). Replace:

Before:
```ts
  const contact =
    me.$isLoaded && id && conversation
      ? (() => {
          const conv = conversation as any;
          if (conv.kind !== "dm") return null;
          const group = conv.$jazz?.owner;
          if (!group) return null;
          const members = (() => {
            try {
              return group.getDirectMembers();
            } catch {
              return [];
            }
          })();
          const contactBook = (me as any).root?.contactBook;
          if (!contactBook) return null;
          return Array.from(contactBook).find((ct: any) => {
            if (!ct?.contactAccountID) return false;
            return members.some(
              (m: any) => m.account?.$jazz?.id === ct.contactAccountID,
            );
          }) ?? null;
        })()
      : null;
```

After:
```ts
  // "View contact" affordance: show when the conversation has exactly two
  // direct admin/writer members (me + one other) AND the other one is in my
  // contact book. Replaces the prior kind === "dm" gate per Slice 3c.
  const contact =
    me.$isLoaded && id && conversation
      ? (() => {
          const conv = conversation as any;
          const group = conv.$jazz?.owner;
          if (!group) return null;
          const myID = (me as any).$jazz?.id;
          let members: any[] = [];
          try {
            members = group.getDirectMembers();
          } catch {
            return null;
          }
          const participants = members.filter(
            (m: any) => m.role === "admin" || m.role === "writer",
          );
          if (participants.length !== 2) return null;
          const otherMember = participants.find(
            (m: any) => m.account?.$jazz?.id !== myID,
          );
          if (!otherMember) return null;
          const otherID = otherMember.account?.$jazz?.id;
          const contactBook = (me as any).root?.contactBook;
          if (!contactBook || !otherID) return null;
          return (
            (Array.from(contactBook).find(
              (ct: any) => ct?.contactAccountID === otherID,
            ) as any) ?? null
          );
        })()
      : null;
```

- [ ] **Step 3: Switch author display to `resolveDisplayName`**

Find the message render block (around lines 281-301). Replace:

Before:
```ts
            messages.map((message: any, i: number) => {
              const authorAccountID = getAuthorAccountIDFromMessage(message);
              const isMine = authorAccountID === myAccountID;
              const authorDisplayName = authorAccountID
                ? (contactDisplayNames[authorAccountID] ??
                  (isMine
                    ? ((me as any).profile?.displayName ?? "Me")
                    : "Unknown"))
                : "Unknown";
```

After:
```ts
            messages.map((message: any, i: number) => {
              const authorAccountID = getAuthorAccountIDFromMessage(message);
              const isMine = authorAccountID === myAccountID;
              const conversationGroup = (conversation as any)?.$jazz?.owner;
              const authorDisplayName = authorAccountID
                ? resolveDisplayName({
                    accountID: authorAccountID,
                    me,
                    group: conversationGroup,
                  })
                : "Unknown";
```

- [ ] **Step 4: Remove the now-unused `contactDisplayNames` map**

The `contactDisplayNames` map (lines 107-116) is no longer referenced. Delete the block in its entirety:

```ts
  // Build accountID → displayName map from contactBook for author display
  const contactDisplayNames: Record<string, string> = {};
  if (me.$isLoaded) {
    for (const c of Array.from((me as any).root.contactBook)) {
      const cAny = c as any;
      if (cAny?.contactAccountID && cAny?.displayNameLocal) {
        contactDisplayNames[cAny.contactAccountID] = cAny.displayNameLocal;
      }
    }
  }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/conversations/detail.tsx
git commit -m "feat(detail): author display + view-contact gate use unified helpers (Slice 3c)"
```

---

### Task 8: members.tsx — author resolution via helper; remove demote button; gate Remove button on admin rows by recon result

**Files:**
- Modify: `src/routes/conversations/members.tsx`

**Recon input:** `REMOVE_ADMIN_PERMITTED` from Phase A Task 5. If `true`, the Remove button stays visible on all rows (current behavior). If `false`, the Remove button is hidden on admin rows (mirrors the demote button removal).

- [ ] **Step 1: Add the import**

In `src/routes/conversations/members.tsx`, add to the existing imports block:

```ts
import { resolveDisplayName } from "@/jazz/displayName";
```

- [ ] **Step 2: Replace the inline name resolution with the helper**

Find the `rawMembers` building loop (lines 115-138). Replace the `displayName` derivation:

Before:
```ts
      for (const m of directMembers) {
        const accountID: string = m.account?.$jazz?.id ?? m.id;
        const role = m.role as string;
        if (role !== "admin" && role !== "writer") continue; // skip revoked / inherited
        const displayName: string =
          m.account?.profile?.name ??
          m.account?.profile?.displayName ??
          ((() => {
            // Try looking up in contactBook
            for (const c of Array.from((me as any).root?.contactBook ?? []) as any[]) {
              if (c?.contactAccountID === accountID) return c.displayNameLocal ?? null;
            }
            return null;
          })()) ??
          (accountID === myAccountID
            ? ((me as any).profile?.displayName ?? "Me")
            : "Unknown");
        rawMembers.push({ accountID, role: role as "admin" | "writer", displayName });
      }
```

After:
```ts
      for (const m of directMembers) {
        const accountID: string = m.account?.$jazz?.id ?? m.id;
        const role = m.role as string;
        if (role !== "admin" && role !== "writer") continue; // skip revoked / inherited
        const displayName = resolveDisplayName({
          accountID,
          me,
          group: conversationGroup,
        });
        rawMembers.push({ accountID, role: role as "admin" | "writer", displayName });
      }
```

(Verify the `conversationGroup` variable exists in the surrounding scope — it should be the same one being iterated for `directMembers`. If the local variable has a different name, use that.)

- [ ] **Step 3: Remove the demote button rendering**

Find the admin-actions block (around lines 367-403). Delete the `{member.role === "admin" && (…)}` block entirely. The remaining admin-actions block should be:

```tsx
                  {/* Admin actions (only for other members, only if I'm admin) */}
                  {iAmAdmin && !isMe && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {member.role === "writer" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7 px-2"
                          onClick={() => void handlePromote(member.accountID)}
                          disabled={actionInProgress}
                          data-testid={`promote-${member.accountID}`}
                        >
                          Promote
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7 px-2 text-red-600 hover:bg-red-50"
                        onClick={() => void handleRemove(member.accountID)}
                        disabled={actionInProgress}
                        data-testid={`remove-${member.accountID}`}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
```

- [ ] **Step 4: Conditionally hide the Remove button on admin rows (only if recon says FORBIDDEN)**

**If Phase A Task 5 reported `REMOVE_ADMIN_PERMITTED: true`:** skip this step. The block above already shows Remove for both writer and admin rows.

**If Phase A Task 5 reported `REMOVE_ADMIN_PERMITTED: false`:** wrap the Remove button render in a role check:

```tsx
                      {member.role === "writer" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7 px-2 text-red-600 hover:bg-red-50"
                          onClick={() => void handleRemove(member.accountID)}
                          disabled={actionInProgress}
                          data-testid={`remove-${member.accountID}`}
                        >
                          Remove
                        </Button>
                      )}
```

Also remove the `handleDemote` function definition from the component if it exists (it's now unused). Search the file for `handleDemote` and delete the function. The `demoteToWriter` protocol primitive stays in `src/jazz/conversation.ts` — only the UI binding goes.

- [ ] **Step 5: If recon was FORBIDDEN, add a TaskList followup**

Only if `REMOVE_ADMIN_PERMITTED: false`. Run this in a separate shell or via TaskCreate:

```
TaskCreate({
  subject: "Cojson admin-remove-admin not supported — Remove button hidden on admin rows",
  description: "Phase A Task 5 of Slice 3c confirmed cojson 0.20.18 forbids one admin from removing another admin. MembersRoute hides the Remove button on admin rows as a result. Revisit when cojson exposes admin-remove-admin (or when we ship the deferred owner/manager model that gives owners special privileges).",
  metadata: { kind: "followup" }
})
```

The triage flow will surface this at the end of Phase B for Linear persistence.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/routes/conversations/members.tsx
git commit -m "feat(members): unified name resolution; remove demote button (Slice 3c)"
```

---

### Task 9: Update e2e tests for the demote-button removal

**Files:**
- Modify: `tests/e2e/group-roles.spec.ts`
- Possibly modify: `tests/e2e/group-member-management.spec.ts` (only if recon was FORBIDDEN)

- [ ] **Step 1: Find and remove demote-button assertions**

Search `tests/e2e/group-roles.spec.ts` for any assertion that the demote button is present:

```bash
grep -n "demote-\|Demote" tests/e2e/group-roles.spec.ts
```

For each match: remove the assertion. The test should be rewritten to verify only that the Promote → admin transition works and the post-promotion state has the expected role pill. Do not assert presence or absence of any demote testid — there is no demote testid in the new UI.

Specifically, look for the block that the Phase E implementer added (around lines 171-188 per the Phase E report) that verifies the demote button is visible on admin rows — delete that entire block. The header comment that documented the cojson constraint (around lines 12-18) should also be removed (the recon in Phase A Task 5 has now superseded it).

- [ ] **Step 2: If recon was FORBIDDEN, update remove-button assertions**

Only if `REMOVE_ADMIN_PERMITTED: false`. Search `tests/e2e/group-member-management.spec.ts`:

```bash
grep -n "remove-" tests/e2e/group-member-management.spec.ts
```

If the test asserts that an admin can be removed by another admin, change it to assert that the Remove button is NOT present on admin rows. Otherwise no change needed.

- [ ] **Step 3: Run the affected e2e specs**

Run: `npm run test:e2e -- group-roles group-member-management`
Expected: PASS — both specs green against the new UI.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/group-roles.spec.ts tests/e2e/group-member-management.spec.ts
git commit -m "test(e2e): update group-roles + group-member-management for demote button removal"
```

(If `group-member-management.spec.ts` was untouched, omit it from the `git add` line.)

---

### Task 10: Extend `group-create.spec.ts` to assert non-contact author resolves to profile name

**Files:**
- Modify: `tests/e2e/group-create.spec.ts`

- [ ] **Step 1: Read the existing test to find a good insertion point**

The existing test creates a 3-member group (Alice, Bob, Charlie) where all are paired. Add a new assertion: after Charlie sends a message, on Bob's screen the author header for Charlie's message should show "Charlie" (Charlie's profile name) and NOT "Unknown", even though Charlie is not in Bob's contact book.

Read the existing spec to see how messages are sent and how author headers are queried (`grep -n "send-btn\|message-bubble\|author" tests/e2e/group-create.spec.ts`).

- [ ] **Step 2: Add the assertion at the bottom of the test, before context teardown**

The exact code depends on the existing testid structure of `MessageBubble`. Use this pattern (adjust testids to match what's actually in `src/routes/conversations/detail.tsx` — look for `data-testid` on the author span):

```ts
// Slice 3c regression: Charlie is not in Bob's contact book; the message
// header on Bob's screen should still show "Charlie" via profile fallback.
// Pre-Slice-3c this rendered "Unknown".
await charliePage.getByTestId("composer-textarea").fill("Hello from Charlie");
await charliePage.getByTestId("send-btn").click();

const charlieMessageOnBobScreen = bobPage
  .getByTestId("message-timeline")
  .locator('[data-testid^="message-bubble-"]')
  .filter({ hasText: "Hello from Charlie" })
  .first();

await expect(charlieMessageOnBobScreen).toBeVisible({ timeout: 10_000 });
// The author label should be Charlie's profile name, not "Unknown".
await expect(
  charlieMessageOnBobScreen.getByText("Charlie"),
).toBeVisible();
await expect(
  charlieMessageOnBobScreen.getByText("Unknown"),
).not.toBeVisible();
```

(If the existing test's variable names differ — e.g. `pageCharlie` / `pageBob` — use those.)

- [ ] **Step 3: Run the spec**

Run: `npm run test:e2e -- group-create`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/group-create.spec.ts
git commit -m "test(e2e): assert non-contact member's profile name resolves in message header"
```

---

### Task 11: Full regression sweep + CHANGELOG + ready-for-tag

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS — full suite (existing 79 + new tests from Tasks 1, 3, 4, 5).

- [ ] **Step 2: Run the full e2e suite**

Run: `npm run test:e2e`
Expected: PASS — all Slice 1/2/3a/3b/3c specs green.

If any pre-existing spec fails, do NOT skip it. Investigate the failure — it likely points to a regression in the kind-removal or sidebar-synthesis logic. Common suspects:
- `tests/e2e/conversation-auto-discovery.spec.ts` — uses sidebar to confirm a DM appears after Inbox delivery; the sidebar label is now synthesized from members rather than from contactBook.
- `tests/e2e/messaging-1to1.spec.ts` — uses sidebar to navigate to the DM; same sidebar-label concern.
- `tests/e2e/leave-conversation.spec.ts` — uses sidebar to assert the conversation disappears after leave; no label concern, but verify.
- `tests/e2e/conversation-list-ordering.spec.ts` — same sidebar-label concern.

If any of these fail because the sidebar label doesn't match a previously-hardcoded contact name: the new label IS the contact name (resolveDisplayName chain matches contactBook first), so the assertion should still hold. If it doesn't, debug the synthesis logic rather than the test.

- [ ] **Step 3: Verify acceptance criteria from the spec**

Run these greps to confirm the spec's acceptance criteria:

```bash
grep -rnE "\.kind" src/ | grep -v "src/routes/onboarding\|src/components/system-event"
```
Expected: no matches (only the onboarding state-machine and SystemEvent component should use `kind`, both unrelated to Conversation).

```bash
grep -rn "demote-" src/routes/conversations/members.tsx
```
Expected: no matches.

```bash
grep -rn "kind:" src/jazz/
```
Expected: no matches in production code.

- [ ] **Step 4: Update CHANGELOG.md**

Find the most recent "## [Unreleased]" or top-of-file entry. Add a new section above the Slice 3b entry (read the Slice 3b entry first to match style):

```bash
head -40 CHANGELOG.md
```

Insert:

```markdown
## Slice 3c — Polish (post-3b)

**Closes:** NOX-14 (demote button crashes), NOX-15 (stale `kind` after 1:1→group).

### Changed
- Removed `kind: "dm" | "group"` discriminator from `Conversation` schema. Conversations now have a single shape; "1:1 with Bob" means "a conversation whose direct admin/writer members are exactly me + Bob".
- `findOrCreate1to1Conversation` discovers existing 1:1s by member-set match instead of by `kind === "dm"`. A former group that decayed to 2 members is returned correctly as the 1:1 with that contact.
- Sidebar synthesizes a conversation label from non-me members when no explicit `title` is set. Explicit titles always win. Renaming a contact propagates automatically.
- `updateConversationTitle` works on any conversation, not just groups.
- Message-header author resolution and MembersRoute name resolution share a single `resolveDisplayName` helper (`src/jazz/displayName.ts`). The chain is: self → contactBook displayNameLocal → group member profile → "Unknown".

### Removed
- Demote button on MembersRoute admin rows. Cojson 0.20.18 forbids admin-to-admin demotion at the protocol level; the button could only crash. The `demoteToWriter` and `isLastAdmin` primitives in `src/jazz/conversation.ts` are retained for future self-demote / transfer-ownership work.

### Fixed
- Author display in group chats: messages from a member who is not in the local contact book now show that member's profile name instead of "Unknown".

### Test coverage
- New unit tests for `resolveDisplayName` (9 cases) and for member-set-based discovery.
- New e2e assertion in `group-create.spec.ts` that a non-contact member's profile name resolves in the message header.
- Phase A reconnaissance test documenting cojson admin-remove-admin behavior.

### Deferred
- Owner / manager / transfer-ownership concepts → future slice.
- Conversation lifecycle (disband group, archive, chronological events) → NOX-16, NOX-17, NOX-18.
```

- [ ] **Step 5: Commit the changelog**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for Slice 3c"
```

- [ ] **Step 6: Final report**

Do NOT tag yet — the controller tags and merges via the `finishing-a-development-branch` skill. In your final report include:

- All 11 commit SHAs in order
- Final unit + e2e test counts
- Confirmation that all 8 acceptance criteria from spec §6 pass
- The `REMOVE_ADMIN_PERMITTED` recon result and how Phase B Task 8 reflected it
- Any unexpected regressions observed and how they were resolved
- Any TaskList followups captured during implementation

---

## Acceptance criteria (verbatim from spec §6)

1. In a group chat where Alice has Bob and Charlie as members but only Bob is in Alice's contact book, messages from Charlie show Charlie's profile name (not "Unknown") in Alice's view. — Task 10.
2. The `kind` field is gone from Conversation schema. `grep -rn "\\.kind" src/` returns only unrelated matches. — Task 2 + Task 11 §3.
3. Starting a chat with Bob via the contact-detail "Start chat" button reuses any existing 2-member-with-Bob conversation regardless of whether it started as a 1:1 or as a group that decayed. — Task 3 (unit test for the matching primitive); e2e regression coverage via existing `conversation-auto-discovery`.
4. Sidebar shows synthesized "Bob" or "Bob, Carol" label for conversations without a title; explicit titles always win. — Task 6.
5. Admins can set a title on any conversation (including former 1:1s). — Task 4.
6. Demote button absent from MembersRoute. `grep -rn "demote-" src/` returns no matches. — Task 8 + Task 11 §3.
7. All Slice 1/2/3a/3b regression e2e tests still pass. — Task 11 §2.
8. Admin-remove-admin behavior in cojson documented + reflected in MembersRoute UI. — Task 5 + Task 8.