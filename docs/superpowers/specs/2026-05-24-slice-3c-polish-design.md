> **Historical context (added 2026-06-07):** this document was written when the project was named **jazz-messanger**. The project was renamed to **Arcan** on 2026-06-05; the app rebrand itself is captured as Unit 5 in `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md`. This file is preserved as-is for historical accuracy.
# Slice 3c — Post-3b Polish (kind unification + author resolution + demote removal) Design

**Goal.** Close three small wounds left after Slice 3b: (1) messages from group members who aren't yet contacts show "unknown" as author; (2) the `kind: "dm"|"group"` discriminator complicates the data model and breaks when a 1:1 grows to 3+ members; (3) the demote button on MembersRoute throws at runtime because cojson 0.20.18 forbids admin-to-admin demotion.

**Scope.** Small polish slice — ~3–4 hours of work, probably one Phase A (schema + protocol) and one Phase B (UI + e2e).

**Closes:** NOX-14 (demote button), NOX-15 (stale kind on 1:1→group).

**Deferred (explicit non-goals):** owner / manager / transfer-ownership concepts (later slice), hard cryptographic role enforcement, NOX-16/17/18 (conversation lifecycle + chronological events), TaskList #15 (Contacts discoverability).

---

## 1. Item 1 — Fix "unknown" author in MessageRow

### Current behavior

`src/routes/conversations/detail.tsx:107-116` builds a `contactDisplayNames: Record<string, string>` map by iterating `me.root.contactBook` only. When MessageRow renders an author whose `accountID` isn't in the map, it falls back to "unknown".

`src/routes/conversations/members.tsx:121-133` resolves names differently: it tries `account.profile.name` first, then `account.profile.displayName`, then contactBook lookup, then "Unknown". Profile data is already loaded for any group member, because the conversation group's direct-members include the loaded Account.

### Required behavior

Both surfaces must use the same resolution chain:

1. **Self → "Me"** (or the user's own profile display name if available).
2. **Contact-book local name** — wins when present (lets users locally rename people).
3. **Group-member profile name** (`account.profile.name` or `account.profile.displayName`).
4. **"Unknown"** — only when no profile data is available at all (e.g., member account didn't sync yet).

### Implementation

Create `src/jazz/displayName.ts` exporting:

```ts
export function resolveDisplayName(args: {
  accountID: string;
  me: any;           // loaded JazzMessangerAccount
  group?: any;       // optional conversationGroup; if absent, only contactBook is consulted
}): string;
```

Replace the inline name-resolution logic in both `members.tsx` and `detail.tsx` with calls to this helper. The helper is pure (no async, no Jazz mutations), so it's straightforward to unit-test.

### Test coverage

- Unit: `tests/unit/jazz/displayName.test.ts` — table-driven cases for each branch of the resolution chain.
- E2E: extend `tests/e2e/group-create.spec.ts` or add a small spec asserting that when Alice and Bob are in a group with Charlie (who is in Alice's contact book as "Chuck" but not in Bob's contact book), Bob's message header for Charlie's messages shows "Charlie" (Charlie's profile name), not "Unknown".

---

## 2. Item 2 — Drop `kind` from Conversation schema

### Rationale

`kind: z.enum(["dm", "group"])` is used in only four places (`src/jazz/conversation.ts:63,86,111,185,466`, `src/components/sidebar.tsx:52`, `src/routes/conversations/detail.tsx:81`). All four have member-count-based replacements. Removing the field eliminates the stale-discriminator footgun (NOX-15) and lets us treat 1:1 and group conversations as one shape — consistent with the "1:1 is just N=2" principle from Slice 3a/3b.

### Schema changes

`src/jazz/schema/Conversation.ts`:

- Remove `kind: z.enum(["dm", "group"])`.
- Change `title` from required to optional: `title: z.string().optional()`.
- No migration code — we're recreating users from scratch per project convention (CLAUDE.md).

### Discovery changes

`findOrCreate1to1Conversation` (`src/jazz/conversation.ts`) becomes: scan `me.root.knownConversations`, return the first conversation whose `conversationGroup.getDirectMembers()` has exactly two admin-or-writer members whose account IDs are `{me.id, contact.contactAccountID}`. If none match, create a new conversation with the same shape as today (no `kind: "dm"` field).

A former 3-member group that decayed to me + contact WILL be returned. This is correct: a 2-member conversation between me and Bob *is* my conversation with Bob, regardless of how it started. No duplicate "DMs" get created.

### Sidebar title rendering

`src/components/sidebar.tsx` — replace the `c.kind === "dm"` branch with title-or-synthesis:

```ts
function deriveConversationTitle(conv, me, group, contactBook): string {
  if (conv.title) return conv.title;
  const others = group.getDirectMembers()
    .filter(m => m.account?.id !== me.id && (m.role === "admin" || m.role === "writer"));
  if (others.length === 1) return resolveDisplayName({ accountID: others[0].account.id, me, group });
  if (others.length === 2) return others.map(o => resolveDisplayName(...)).join(", ");
  return `${resolveDisplayName(first)}, ${resolveDisplayName(second)} +${others.length - 2} more`;
}
```

### Title editing

`updateConversationTitle` (`src/jazz/conversation.ts:466`) — remove the `if (conversation.kind !== "group")` gate. Any admin can set/edit/clear the title on any conversation. Two-person conversations typically have no title; an admin can set one if they want a custom label.

### Detail route "view contact" affordance

`src/routes/conversations/detail.tsx:81` — replace `if (conv.kind !== "dm") return null` with: show the button iff the conversation has exactly 2 direct members (me + one other) AND the other one's account ID is in my contact book. Already-computed data; no extra lookup.

### Migration / data path

Existing conversations on user devices will have a stale `kind` field. Per project policy (CLAUDE.md: "Disregard migration concerns we will recreate our users"), we don't write a migration. The unused field is simply ignored — Zod-based `co.map` schemas silently tolerate extra fields on read.

---

## 3. Item 3 — Remove demote button + finalize admin/writer model

### UI changes

`src/routes/conversations/members.tsx` — remove the `demote-${accountID}` button rendering. The "admin" role rows show only the Remove button (and only when the actor has admin powers).

### Verify admin-remove-admin at Phase A

Open question: cojson 0.20.18 forbids `addMember(target, "writer")` when target is already admin (the demote bug). I do not know whether `removeMember(target)` works when target is also admin. **First task in Phase A reconnaissance: write a small test case that creates a group with two admins, has one try to remove the other, and observes whether cojson permits it.**

If cojson permits admin-remove-admin: keep the Remove button visible on all rows where the actor has admin powers.

If cojson forbids admin-remove-admin: hide the Remove button on admin rows (mirror of demote), and add a TaskList followup capturing the constraint (will eventually become a Linear issue if the constraint persists across cojson versions).

### Protocol primitives — stay

The `demoteToWriter` and `isLastAdmin` exports in `src/jazz/conversation.ts` stay. They're harmless and may be used by future slices (self-demote, transfer-ownership). No code path currently calls `demoteToWriter` from the UI after the button is removed; it's a pure protocol export.

### `LeaveWithPromoteDialog` — stays

The "last admin must promote a writer before leaving" rule still applies. The dialog is reachable from the leave-conversation flow and works the same as Slice 3b.

### RolePill — stays

Two-state RolePill (admin / writer) is correct for the current role model. No change.

---

## 4. Files touched

| File | Change |
|---|---|
| `src/jazz/displayName.ts` | **NEW** — `resolveDisplayName` helper |
| `src/jazz/schema/Conversation.ts` | Remove `kind`; make `title` optional |
| `src/jazz/conversation.ts` | `findOrCreate1to1Conversation` rewrites to member-count-based discovery; `updateConversationTitle` drops the kind gate; cleanup of `kind` field writes in create functions |
| `src/components/sidebar.tsx` | New `deriveConversationTitle` synthesis logic; remove `c.kind === "dm"` branch |
| `src/routes/conversations/detail.tsx` | Author resolution via `resolveDisplayName`; replace `kind !== "dm"` gate on "view contact" button with member-count check |
| `src/routes/conversations/members.tsx` | Remove demote button rendering; switch author resolution to `resolveDisplayName` |
| `tests/unit/jazz/displayName.test.ts` | **NEW** — unit tests for resolution chain |
| `tests/unit/jazz/conversation.test.ts` | Update tests that referenced `kind`; add new test for member-count-based discovery; remove tests for demote-button-throws scenarios |
| `tests/e2e/messaging-1to1.spec.ts` | Verify still passes (regression — no kind-based assertions assumed) |
| `tests/e2e/group-create.spec.ts` | Extend with non-contact-member author display assertion (item 1 coverage) |
| `tests/e2e/group-roles.spec.ts` | Update for demote button removal — drop assertions that the button is present on admin rows |
| `tests/e2e/conversation-auto-discovery.spec.ts` | Verify still passes — discovery shape changed but behavior preserved |
| `CHANGELOG.md` | Slice 3c entry |

---

## 5. Phases

This slice is small enough for two phases instead of five.

- **Phase A — Schema + protocol + helper.** Schema (remove `kind`, optional `title`), `resolveDisplayName` helper + unit tests, `findOrCreate1to1Conversation` rewrite, `updateConversationTitle` gate removal, reconnaissance for the admin-remove-admin cojson behavior (single small Vitest case in `tests/unit/jazz/conversation.test.ts`).
- **Phase B — UI + e2e.** Sidebar title synthesis, MessageRow author resolution, MembersRoute author resolution + demote button removal, detail route "view contact" gate, all 5 affected e2e specs verified/updated, CHANGELOG, tag `slice-3c-complete`.

---

## 6. Acceptance criteria

1. In a group chat where Alice has Bob and Charlie as members but only Bob is in Alice's contact book, messages from Charlie show Charlie's profile name (not "Unknown") in Alice's view.
2. The `kind` field is gone from `Conversation` schema. `grep -rn "\\.kind" src/` returns only unrelated matches (onboarding state machine, system event component).
3. Starting a chat with Bob via the contact-detail "Start chat" button reuses any existing 2-member-with-Bob conversation regardless of whether it started as a 1:1 or as a group that decayed.
4. The sidebar shows a synthesized "Bob" or "Bob, Carol" label for conversations without a title; explicit titles always win.
5. Admins can set a title on any conversation (including former 1:1s).
6. The demote button is absent from MembersRoute. `grep -rn "demote-" src/` returns no matches in MembersRoute.
7. All Slice 1/2/3a/3b regression e2e tests still pass.
8. Verified behavior of admin-remove-admin in cojson is documented in the Phase A reconnaissance commit message and reflected in the MembersRoute UI (Remove button visible if cojson permits, hidden if not).

---

## 7. Open questions resolved during brainstorming

- **Owner / manager concept** — deferred. Multiple admins are allowed; no owner badge.
- **Manager role** — deferred. Future slice will revisit once we have a clearer story for crypto-enforced "can invite but not promote".
- **Transfer ownership** — deferred (no owner concept yet).
- **`kind` reintroduction as `createdAsKind`** — rejected. Re-introduces the discriminator we're removing.
- **Auto-tracking title from contact name on rename** — covered by the title-or-synthesize design: when title is absent the synthesized name follows the current member's profile, so renames propagate automatically.

---

## 8. Risk

Low. All changes are within existing files except `src/jazz/displayName.ts` (new, tiny, pure). Schema removal is invisible to users because we treat missing fields as nullable on read. The only non-trivial unknown is the admin-remove-admin cojson behavior — Phase A's reconnaissance task de-risks it before we touch the UI.