# Slice 3b — Group Conversations + Member Management

**Date:** 2026-05-23
**Status:** Brainstorming complete; awaiting implementation plan
**Slice of:** E1a (MVP) per `docs/superpowers/specs/2026-05-15-jazz-messanger-design.md`
**Builds on:** Slice 3a (1:1 conversations + messaging), merged to `main` at tag `slice-3a-complete`
**Companion docs:** `docs/security/threat-model.md`, `docs/jazz-api-notes.md`

---

## 1. Goal

By the end of Slice 3b, users can create group conversations of 3+ members from a multi-select contact picker, see and manage members (add, remove, promote/demote, edit title) via a dedicated `/conversations/:id/members` route, and rely on the same discovery infrastructure for 1:1 and group chats. The Slice 3a `Contact.linkedConversation` cache is replaced by a unified `Account.root.knownConversations` list populated by the Inbox subscription — one discovery path serves both conversation kinds.

The `"1:1 is just N=2"` principle stays: 1:1 conversations continue to use both-participants-as-admin; groups (N≥3) use admin+writer roles with the creator as the initial admin and added members defaulting to writer.

---

## 2. Scope

### In scope (Slice 3b)
- **Discovery refactor:** new `JazzMessangerAccountRoot.knownConversations: co.list(Conversation)`; Inbox subscription populates it; sidebar iterates it
- **Remove `Contact.linkedConversation`:** retire the Slice 1-era cache; all call sites updated to use accountID-based lookups against `knownConversations` and ConversationGroup membership
- **Group conversation creation** via multi-select ContactPicker (1 contact → 1:1 as before; 2+ contacts → title prompt → group)
- **`/conversations/:id/members` route:**
  - For groups: member list with role pills, admin-only actions (add member, remove member, promote to admin, demote to writer, edit title)
  - For 1:1: minimal info pane (display name + safety number); no role-management actions
- **admin + writer** role distinction (writer is default for newly added group members)
- **Last-admin-leave inline promotion:** when the only remaining admin tries to leave, the leave dialog includes a member picker for the new admin; promotion + leave happen as one user action
- **Sidebar title derivation:** group conversations show `conversation.title`; 1:1 unchanged (other participant's `Profile.displayName`)
- **System events in timeline:** "{adminName} added {newName} to the chat" + the existing Slice 3a "{name} left the chat" pill
- **Inbox-based discovery for new members:** when a member is added to a group, the new member's Inbox receives a notification and their sidebar auto-populates
- All 22 existing Slice 1-3a e2e tests must keep passing

### Out of scope (deferred)
- Three-tier role hierarchy (manager role unused; admin+writer only)
- Group avatars/icons (would be Slice 4 with media)
- Adding non-contacts directly to a group (must be a contact first — Vision X invariant)
- Role-change + title-change system events ("{X} promoted {Y}" / "{X} renamed the group") — only join + leave events for v1
- Disband group action and an archived/ended-conversations view (Linear TaskList #25 — captured during this brainstorm; needs the archive view first)
- Edit-history view for previous group titles

---

## 3. Architecture

### 3.1 Files to modify

| Path | Change |
|---|---|
| `src/jazz/schema/JazzMessangerAccount.ts` | Add `knownConversations: co.list(Conversation)` to `JazzMessangerAccountRoot`; populate empty list in migration |
| `src/jazz/schema/Contact.ts` | **Remove** `linkedConversation` field |
| `src/jazz/conversation.ts` | Refactor `findOrCreate1to1Conversation` to use `knownConversations`; implement `addMemberToConversation`, `removeMemberFromConversation`, `promoteToAdmin`, `demoteToWriter`, `updateConversationTitle`, `isLastAdmin`; refactor `leaveConversation` to push to knownConversations on removal; refactor Inbox subscription callback to push the conversation to `me.root.knownConversations` instead of setting linkedConversation; refactor `createGroupConversation` to add other members as `"writer"` (currently defaults to `"admin"` per Slice 3a's generic implementation) |
| `src/components/sidebar.tsx` | Iterate `me.root.knownConversations` instead of contactBook entries' linkedConversation refs; title derivation forks on `conversation.kind` |
| `src/components/contact-picker.tsx` | Multi-select with checkbox UI + "Continue" button; callback receives `Contact[]` array; the caller decides 1:1 vs group based on count |
| `src/routes/conversations/detail.tsx` | Title becomes a clickable Link to `/conversations/:id/members`; remove `linkedConversation`-based contact lookup, replace with iteration over conversation group's members + accountID lookup in contactBook |
| `src/routes/contacts/detail.tsx` | `findOrCreate1to1Conversation` lookup no longer reads `linkedConversation` directly (the function handles it internally) |

### 3.2 Files to create

| Path | Responsibility |
|---|---|
| `src/routes/conversations/members.tsx` | The member-list route. Branches on `conversation.kind`: group renders the full management UI; 1:1 renders a minimal info pane |
| `src/components/group-create-dialog.tsx` | Modal asking for group title after the multi-select picker continues with 2+ contacts. Inline below the picker or a separate modal — implementation choice |
| `src/components/role-pill.tsx` | Small badge component rendering "admin" / "writer" labels with consistent styling |
| `src/components/leave-with-promote-dialog.tsx` | The modal shown when the last admin tries to leave: explains the situation, picker for the new admin, single "Promote and leave" action |

### 3.3 No new npm dependencies

All work uses the existing toolchain (React, react-router-dom, Tailwind, shadcn/ui, jazz-tools, tweetnacl).

---

## 4. Data model changes

```ts
// src/jazz/schema/JazzMessangerAccount.ts — add knownConversations to root
export const JazzMessangerAccountRoot = co.map({
  contactBook: ContactBook,
  devices: co.list(DeviceRecord),
  invitesIssued: co.list(Invitation),
  knownConversations: co.list(Conversation),   // NEW — unified discovery list
});

// src/jazz/schema/Contact.ts — REMOVE linkedConversation
export const Contact = co.map({
  contactAccountID: z.string(),
  pinnedFingerprint: z.string(),
  displayNameLocal: z.string(),
  addedAt: z.date(),
  notes: z.string().optional(),
  // linkedConversation REMOVED — discovery now uses
  // me.root.knownConversations (Slice 3b spec §5)
});
```

**Migration:** none. Per user authorization, existing local IndexedDB data is wiped and accounts recreated from scratch. New accounts get `knownConversations` initialized to an empty list by the account migration.

**Why drop `linkedConversation`:** Slice 3a used it as a per-contact convenience cache for sidebar discovery. With `knownConversations` as the source of truth (works identically for 1:1 and groups), the cache becomes redundant — two parallel data paths to keep consistent without added value. The "find existing 1:1 with Bob" lookup becomes a linear scan of knownConversations for a `kind="dm"` Conversation whose ConversationGroup has Bob's accountID as the other member. Trivial cost at Vision X scales.

---

## 5. Discovery refactor — `knownConversations` + Inbox

### 5.1 Populating `knownConversations`

**Sources:**
1. **Conversation creator's side:** `findOrCreate1to1Conversation` and `createGroupConversation` push the new conversation to `me.root.knownConversations` after creation.
2. **Recipient's side:** the Inbox subscription's `ConversationNotification` callback already loads the Conversation by ID and (in Slice 3a) sets `contact.linkedConversation`. In Slice 3b, it instead pushes the Conversation to `me.root.knownConversations`. (One additional check: don't push duplicates — iterate before push to confirm absence.)
3. **Slice 1-2-3a accounts:** none — fresh start per migration policy.

### 5.2 Sidebar iteration

```tsx
const me = useAccount(JazzMessangerAccount, {
  resolve: {
    profile: true,
    root: {
      contactBook: { $each: true },        // for 1:1 title resolution
      knownConversations: { $each: { messages: { $each: true } } },  // for sort + render
    },
  },
});

const conversations = me.root.knownConversations
  .filter((c) => c && isAccessible(c))     // hide conversations I've been revoked from
  .sort(byLastActivityDesc);
```

`isAccessible` checks `conversation.$jazz.loadingState !== "deleted"` and that my role on the ConversationGroup is not `"revoked"`. (Use the same `getRoleOf` pattern from Slice 3a's left-member detection, returning `undefined` for both "not a member" and "revoked"; here we want to hide when undefined-for-revoked.)

### 5.3 Title derivation

```ts
function deriveConversationTitle(conversation, me): string {
  if (conversation.kind === "group") {
    return conversation.title || "Untitled group";
  }
  // 1:1: find the other participant in the ConversationGroup
  const group = conversation.$jazz.owner;
  const otherMember = group.getDirectMembers()
    .find((m) => m.account?.$jazz?.id !== me.$jazz.id);
  if (!otherMember) return "Conversation";
  const accountID = otherMember.account?.$jazz?.id;
  const contact = me.root.contactBook.find((c) => c?.contactAccountID === accountID);
  return contact?.displayNameLocal ?? "(unknown)";
}
```

Same logic powers the conversation detail's `<h1>` title and the sidebar row labels.

### 5.4 Removing `Contact.linkedConversation` — call site sweep

The Slice 3a code currently uses `Contact.linkedConversation` in:
- `src/components/sidebar.tsx` — iterates contactBook for linkedConversation refs
- `src/routes/conversations/detail.tsx` — finds the contact for title + left-member fallback
- `src/jazz/conversation.ts` — `findOrCreate1to1Conversation` (read + write), `leaveConversation` (clears), Inbox callback (sets)

Every reference must be replaced or removed. The plan's Phase A is the schema removal; subsequent phases update call sites.

---

## 6. Group conversation lifecycle

### 6.1 Create

User clicks `+` in sidebar → multi-select ContactPicker → picks 2+ contacts → "Continue" → group-title dialog:

```
async function createGroup(me, selectedContacts, title):
  participantIDs = selectedContacts.map(c => c.contactAccountID)
  conversation = await createGroupConversation(me, participantIDs, title)
    // ConversationGroup: me=admin (default via Group.create owner)
    //                    each participant added as "writer" (Slice 3b change
    //                    from 3a's "admin" default)
    // Conversation: kind="group", title, createdBy=me.id
  me.root.knownConversations.$jazz.push(conversation)
  for each participantID:
    fire-and-forget: InboxSender.load(participantID).sendMessage(notification)
  navigate to /conversations/{conversation.$jazz.id}
```

The 1-contact case continues to call `findOrCreate1to1Conversation` (existing flow, unchanged behaviour: both participants as admin).

### 6.2 Receive (other members)

Inbox subscription processes the `ConversationNotification` → loads Conversation by ID → pushes to `me.root.knownConversations`. Sidebar updates within a few seconds. New member opens the conversation; sees `writer` role on their own row in the members view.

### 6.3 Add member (admin action)

In `/conversations/:id/members`, admin clicks "Add member" button:
1. ContactPicker opens in single-select mode; excludes members already in the group
2. Pick contact → `addMemberToConversation(me, conversation, contact.contactAccountID)`:
   - `group.addMember(loadedAccount, "writer")` on the ConversationGroup
   - `InboxSender.load(newAccountID).sendMessage(ConversationNotification{conversationID})`
3. Member list re-renders to include the new row (admin pill + role/remove kebab unchanged for self)
4. New member's sidebar auto-discovers within seconds
5. System event "{adminDisplayName} added {newDisplayName} to the chat" appears in timeline (derivation per §8)

### 6.4 Remove member (admin action)

Admin clicks kebab on a member row → "Remove from chat":
1. Confirm dialog: "Remove {name} from this chat? They will lose access to all future messages."
2. `group.removeMember(targetAccount)` — Jazz rotates the readKey
3. Removed member's sidebar drops the conversation (their role becomes "revoked"; `isAccessible` returns false)
4. Remaining members see "{adminDisplayName} removed {targetDisplayName} from the chat" timeline event

### 6.5 Promote / demote (admin action)

Admin clicks role pill or kebab → "Promote to admin" (on a writer row) or "Demote to writer" (on an admin row, with safeguards):
- Promote: `group.addMember(target, "admin")` — Jazz treats this as a role change
- Demote: `group.addMember(target, "writer")`
- Safeguard on demote-self: if I'm the last admin, refuse with explanatory error
- Safeguard on demote-other: refuse if doing so leaves zero admins (shouldn't happen in normal flow — there's at least me — but defensive)
- Member list re-renders the role pill
- No timeline event in v1 (deferred)

### 6.6 Leave conversation — with last-admin handling

User clicks "Leave conversation" in conversation header kebab:

```
function handleLeave():
  if I am NOT the last admin (either I'm a writer, or there are other admins):
    confirm dialog → leaveConversation(me, conversation) → navigate to /conversations
  else if I am the last admin AND there are other members:
    open <LeaveWithPromoteDialog>
      pick a member to promote
      "Promote and leave" button:
        group.addMember(target, "admin")
        await leaveConversation(me, conversation)
        navigate to /conversations
  else if I am the only member (no others):
    show "You're the only member; just leave." → leaveConversation as usual
    (Edge case; harmless — conversation becomes inaccessible from any side until tombstoned)
```

`isLastAdmin(me, conversation)`:
```ts
const admins = group.getDirectMembers().filter(m => m.role === "admin");
return admins.length === 1 && admins[0].account?.$jazz?.id === me.$jazz.id;
```

After leaving, `leaveConversation` also removes the conversation from `me.root.knownConversations` (in addition to the Slice 3a behavior of revoking from the group).

### 6.7 Edit title (admin action)

In `/conversations/:id/members`, admin clicks the title heading → it becomes an editable text input:
1. Save (Enter or blur) → `conversation.$jazz.set("title", newTitle)`
2. Other members see the new title in their sidebar + conversation header within seconds
3. No timeline event in v1 (deferred)

Writers see the title as read-only text.

---

## 7. Sidebar + title derivation

Sidebar header unchanged. Conversation rows now iterate `knownConversations` (filtered by accessibility, sorted by last activity). Each row:
- Title via `deriveConversationTitle` (§5.3)
- Click → navigate to `/conversations/:id`

Conversation detail header now wraps the title in a Link to `/conversations/:id/members` (new for 3b; in 3a the title was non-clickable). This is the discoverable entry point to member management.

---

## 8. Member list route (`/conversations/:id/members`)

### 8.1 For `kind === "group"`

Layout: sidebar + main panel with:

```
┌─────────────────────────────────────┐
│ ← Back to chat                      │
│                                     │
│ Project X                    ✏      │ ← editable for admins (click pencil)
│ Group · 4 members                   │
│                                     │
├─────────────────────────────────────┤
│ [+ Add member]                      │ ← admin-only
├─────────────────────────────────────┤
│ Sven    (you)         [admin]   ⋮  │
│ Anna                  [admin]   ⋮  │
│ Bob                   [writer]  ⋮  │
│ Carol                 [writer]  ⋮  │
└─────────────────────────────────────┘
```

Kebab ⋮ menu actions per row (admin-only, hidden on self for the "remove me" action):
- Promote to admin / Demote to writer (depending on current role)
- Remove from chat (with confirm dialog)

Role pill component renders `[admin]` / `[writer]` with consistent styling.

The "you" suffix marks the current user.

If user is a writer (not admin), they see the member list as read-only — no Add button, no kebabs, title not editable. They can still navigate back.

### 8.2 For `kind === "dm"`

Layout: sidebar + main panel with a single info card:

```
┌─────────────────────────────────────┐
│ ← Back to chat                      │
│                                     │
│ Anna                                │
│ Direct conversation                 │
│                                     │
├─────────────────────────────────────┤
│ Safety number                       │
│ 8429 1037 5512 6628 ... (12 groups) │
│                                     │
│ Display name (your local label)     │
│ Anna                                │
└─────────────────────────────────────┘
```

No role management. The display name is the local `Contact.displayNameLocal` value the user set during invitation acceptance. The safety number is the same as shown in Settings → Account, but for the OTHER participant — verifies TOFU binding.

---

## 9. System events in timeline

The Slice 3a `<MessageBubble>`-adjacent rendering of "X left the chat" pills moves into a more general `<SystemEvent>` component. The conversation detail's timeline derives these events from the ConversationGroup's permission state:

**For v1 (Slice 3b):** snapshot-based, bottom-of-timeline rendering (same as Slice 3a's "left" pill placement):
- For each member currently with `role === "revoked"` who's also in my contactBook → render "{contactDisplayName} left the chat"
- For each member currently active (writer or admin) who joined after the conversation was created → render "{adderName} added {addedName} to the chat"
  - "joined after creation" detection: not currently in `createdBy === me`'s initial group set. Without easy access to creation-time member list, fallback: just render for members whose addition transaction we can see in the group history. If we can't read group history cleanly, render no "joined" events for v1 and document as a known limitation.

**Deferred:** chronologically positioned events (require reading the Group's permission transaction history with timestamps), role-change events, title-change events.

The implementation reuses the leftMembers detection pattern from Slice 3a's detail.tsx, generalized into a single `useSystemEvents(conversation)` hook returning `[{kind: "left" | "added", actorName, targetName, accountID}, ...]`. The detail.tsx renders the result below the message list.

---

## 10. Testing

### 10.1 Unit tests

New cases in `tests/unit/jazz/conversation.test.ts`:
- `createGroupConversation` adds participants as `writer` (not `admin`) by default
- `addMemberToConversation` adds with writer role
- `promoteToAdmin` / `demoteToWriter` change roles correctly
- `isLastAdmin` returns true only when I'm the single admin
- `leaveConversation` removes the conversation from `me.root.knownConversations`

`tests/unit/jazz/schema/JazzMessangerAccount.test.ts`: assert `knownConversations` is initialized empty by the migration.

### 10.2 E2E tests

New specs in `tests/e2e/`:
- `group-create.spec.ts` — Alice picks 2 contacts (Bob + Carol) → enters title → all 3 see the group in their sidebar within seconds. Alice sends a message; Bob + Carol both see it.
- `group-member-management.spec.ts` — Alice (admin) navigates to /members, adds Dave; Dave's sidebar shows the group. Alice removes Bob; Bob's sidebar drops it.
- `group-roles.spec.ts` — Alice promotes Bob to admin; Bob can now add Eve; both admins can remove members. Demotion to writer also works.
- `last-admin-leave.spec.ts` — Sven is the sole admin of a group with Carol + Dave as writers. Sven tries to leave → picker prompts to promote → Sven picks Carol → promote happens, leave completes; Carol is the sole admin.
- `group-title-edit.spec.ts` — Admin edits title; other members see the new title in their sidebar.

Existing 22 e2e tests must keep passing. Particularly: `leave-conversation.spec.ts` from Slice 3a, since `leaveConversation` is being refactored to push/pop knownConversations.

### 10.3 Manual verification (pre-merge)

- Multi-select picker works keyboard-only (space toggles, enter continues)
- Group title input has reasonable max length (60 chars?)
- Editing title with empty value is rejected (or stored as empty? Use `"Untitled group"` fallback in render)
- Writer's view of /members shows roles but no actions
- Last-admin-leave promote picker doesn't show me as a candidate
- Sidebar correctly hides conversations after leave/removal

---

## 11. Done definition

Slice 3b is complete when all of the following hold:

- [ ] `npm test` exits 0 (unit tests — Slice 3a baseline + new tests, expected ~75+ total)
- [ ] `npm run test:e2e` exits 0 in Chromium + Firefox (22 existing + 5 new specs × 2 browsers = 32 e2e tests)
- [ ] Manual: three accounts can be added to a single group; all see the group in their sidebars; messages flow bidirectionally; admin actions (add, remove, promote, demote, edit title) work as designed
- [ ] Manual: last-admin-leave inline promote flow works end-to-end
- [ ] `Contact.linkedConversation` is gone from the schema and all source files — `grep -rn "linkedConversation" src/` returns no results outside CHANGELOG/spec mentions
- [ ] `JazzMessangerAccountRoot.knownConversations` exists; populated for new accounts via migration
- [ ] Tag `slice-3b-complete` set on the merge commit
- [ ] CHANGELOG updated with the new features + the schema refactor

---

## 12. Open risks

1. **Reading ConversationGroup permission history for "added" system events.** Need Jazz API for "list role-grant transactions on this Group" with timestamps. If not cleanly exposed, fall back to bottom-of-timeline static "{name} joined" badges based on current state (snapshot) rather than chronological position. Doesn't break the feature; just less precise positioning. Document as known limitation matching Slice 3a's "left" event positioning.

2. **Picker click semantics for multi-select.** Refactoring from single-select-click-immediately to checkbox-then-continue changes UX expectations. Edge case: clicking a row that's already selected — toggles off (deselects). Verify with a quick keyboard-navigation pass during implementation.

3. **Double-click race on "Continue" in multi-select picker.** If the user quickly double-clicks Continue with 2+ contacts selected, could create two groups. Add a `useRef` guard in the handler matching the Slice 2 invitations.ts pattern.

4. **`knownConversations` duplicates on Inbox auto-discovery.** If Alice and Bob both create the same kind of conversation (e.g., race conditions in 1:1 creation), Bob's Inbox might push to his knownConversations twice. Mitigation: the subscription callback iterates `knownConversations` first; if it finds the same conversation ID already present, no-op.

5. **Sidebar accessibility check on revoked conversations.** When I leave a conversation, my role is "revoked" — the conversation entry stays in `knownConversations` (Jazz can't auto-clean it). The sidebar filter must hide it. Verify the `getRoleOf` check works as expected (returns undefined for revoked).

6. **Slice 3a inbox callback compatibility.** The Slice 3a Inbox subscription is in App.tsx and currently sets `contact.linkedConversation`. Refactoring to push to `me.root.knownConversations` means the callback's logic changes; verify the e2e auto-discovery test still passes.

---

## 13. References

- `docs/superpowers/specs/2026-05-15-jazz-messanger-design.md` — full E1a design (§6 conversation/group lifecycle, §6.3 per-author WriteGroups)
- `docs/superpowers/specs/2026-05-17-slice-3a-1to1-messaging-design.md` — Slice 3a design (`Contact.linkedConversation` introduced; `createGroupConversation` skeleton; Inbox subscription)
- `docs/superpowers/plans/2026-05-17-slice-3a-1to1-messaging.md` — Slice 3a plan (executed and merged)
- `docs/security/threat-model.md` — relevant: §3 (cryptographic protections), §6.2 (authorship integrity)
- `docs/jazz-api-notes.md` — API reference; §3 (React hooks), §5 (Groups + permissions), §6 (CoValue mutation), §16 (no public Group enumeration), §17 (Inbox / InboxSender)
- Linear NOX-9 — closed by Slice 3a (leave conversation)
- Linear NOX-10 — deferred (hard device revocation)
- Linear NOX-12 — deferred (writeGroup internals usage)
- Linear NOX-13 — deferred (direct-property-assignment audit; **especially relevant to this slice** which adds new mutation paths — verify all new code uses `$jazz.set()`)
- TaskList #25 — deferred (disband group + archived conversations view)
