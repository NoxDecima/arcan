# Slice 3a — 1:1 Conversations + Messaging Foundation

**Date:** 2026-05-17
**Status:** Brainstorming complete; awaiting implementation plan
**Slice of:** E1a (MVP) per `docs/superpowers/specs/2026-05-15-jazz-messanger-design.md`
**Builds on:** Slice 2 (QR pairing + contact invitations), merged to `main` at tag `slice-2-complete`
**Companion docs:** `docs/security/threat-model.md`, `docs/jazz-api-notes.md`
**Resolves:** Linear NOX-9 ("policy for messages from removed contact in existing conversation")

---

## 1. Goal

By the end of Slice 3a, two existing-contact accounts can start a 1:1 conversation from a contact detail page, exchange messages bidirectionally, edit and delete their own messages, and leave the conversation cryptographically. The sidebar becomes a list of active conversations; contacts move to a dedicated page.

**Critical design principle: 1:1 is just N=2.** All conversation machinery (creation, per-author WriteGroups, message send/edit/delete, member-set tracking) is generic over the number of participants. The only 1:1-specific code is UX presentation: title derivation, the "Start chat" entry point from contact detail. Slice 3b (group conversations) is mostly UX work on top of this same data layer.

---

## 2. Scope

### In scope (Slice 3a)
- Conversation creation on demand from contact detail page (lazy)
- `ConversationGroup` with both participants as `admin`; per-author `WriteGroup` for each participant
- Message creation, rendering in a chronological timeline
- Message edit (soft, in-place body overwrite + `edited` / `editedAt` flags)
- Message delete (soft — clear `body`, set `deleted: true`; renderer shows placeholder)
- Leave conversation (cryptographic revoke from `ConversationGroup`)
- Conversation list in sidebar (replaces existing contact list)
- Contacts list moves to `/contacts` (full page)
- Connection-status banner on conversation detail (offline awareness only — no per-message pending indicator)
- Schema additions: `Message.deleted: boolean.optional()`, `Message.editedAt: date.optional()`

### Out of scope (Slice 3b)
- Group conversations with 3+ members
- Multi-member picker UI ("New group")
- Member add/remove UI in existing conversations
- Admin / manager / writer role granting UI
- Group title editing
- "Group" specific renderings (member list view, etc.)

### Out of scope (E1.1+)
- Read receipts (E1.1)
- Typing indicators (E1.1)
- Disappearing messages (E1.1)
- Edit history view ("show previous versions of edited messages")
- "Delete for me" — local-only hide separate from broadcast delete (future polish)
- Inline media (Slice 4)
- Per-message ratchet (E2)

### NOX-9 resolution (baked in here)
Contact removal stays local-only (Slice 2 status quo). A separate "Leave conversation" action in the conversation menu does the cryptographic revoke. Removing a contact does NOT change anything in any shared conversation — messages keep arriving in conversations Alice is still a member of. Leaving a conversation is a deliberate, irreversible protocol event distinct from removing a contact.

---

## 3. Architecture

### 3.1 New files

| Path | Responsibility |
|---|---|
| `src/jazz/conversation.ts` | Conversation lifecycle: `findOrCreate1to1Conversation`, `ensureMyWriteGroup` (self-create per participant on first need), `leaveConversation`. Also exports the generic `createGroupConversation(me, participants, title?)` ready for Slice 3b; 3a only wires the 1:1 entry point. |
| `src/jazz/messages.ts` | Message lifecycle: `sendMessage` (prepends `ensureMyWriteGroup`), `editMessage`, `deleteMessage`, `getAuthorAccountIDFromMessage` (derives author structurally from the single direct writer of the message's owning Group). |
| `src/routes/conversations/index.tsx` | Conversation list route (the new "home"). Lists all conversations sorted by last-message timestamp; empty state when none. |
| `src/routes/conversations/detail.tsx` | Single conversation view: timeline + composer + kebab menu with "Leave conversation". |
| `src/routes/contacts/index.tsx` | Full-page contacts list (moved out of sidebar). Same data as the previous sidebar list; adds "+ Add contact" button. |
| `src/components/message-bubble.tsx` | One message rendering. Branches on author === me, on `deleted`, on `edited`. |
| `src/components/composer.tsx` | Text input + send button; Enter sends, Shift-Enter inserts newline. |
| `src/components/connection-banner.tsx` | Subtle banner shown only when sync server is unreachable. |
| `src/components/contact-picker.tsx` | Overlay invoked by sidebar "+" — lists contacts, click one to start chat. |

### 3.2 Modified files

| Path | Change |
|---|---|
| `src/jazz/schema/Message.ts` | Add `deleted: z.boolean().optional()` and `editedAt: z.date().optional()` fields |
| `src/jazz/schema/Conversation.ts` | **Remove** `authorWriteGroups` registry field (Slice 1 vestige). Author derivation is now structural — see §6. Safe to remove because Slice 3a is the first time any Conversation CoValue is created in practice. |
| `src/components/sidebar.tsx` | Replace contact list rendering with conversation list; "+" button opens `ContactPicker`; add a "Contacts" link in the footer |
| `src/routes/home/index.tsx` | Becomes a thin redirect to `/conversations` (or absorbed into `ConversationsRoute`) |
| `src/routes/contacts/detail.tsx` | Add "Start chat" button → calls `findOrCreate1to1Conversation` → navigates |
| `src/App.tsx` | Add routes `/conversations`, `/conversations/:id`, `/contacts` |

### 3.3 New npm dependencies

None expected. All work uses existing toolchain (React, react-router-dom, Tailwind, shadcn/ui, jazz-tools, tweetnacl).

---

## 4. Data model changes

```ts
// src/jazz/schema/Message.ts — add two fields
export const Message = co.map({
  sentAt: z.date(),
  body: z.string(),
  attachments: co.list(FileBlob),
  edited: z.boolean().optional(),
  editedAt: z.date().optional(),     // NEW — timestamp of most recent edit
  deleted: z.boolean().optional(),   // NEW — soft-delete flag; on delete, body is also cleared
  get replyTo() {
    return Message.optional();
  },
});

// src/jazz/schema/Conversation.ts — REMOVE the authorWriteGroups field
export const Conversation = co.map({
  title: z.string().optional(),
  kind: z.enum(["dm", "group"]),
  createdAt: z.date(),
  createdBy: z.string(),
  messages: co.list(Message),
  // authorWriteGroups REMOVED — author is derived structurally from
  // each WriteGroup's single direct writer member (see §6).
});
```

**Why drop `authorWriteGroups`:** the registry was writable by every conversation member (any writer on the ConversationGroup could write any key in the record), which enabled a *registry-poisoning* impersonation attack — Mallory could overwrite `authorWriteGroups[bob] = malloryWGID` and her messages would render as authored by Bob. Self-creating WriteGroups (§5.1, §5.2) eliminates this attack class because author derivation becomes structural: a WriteGroup's single direct writer member is its true author, and that membership cannot be forged.

`Contact.linkedConversation` (Slice 2) gets populated on conversation creation.

No new top-level schema. Per-author WriteGroups are runtime `Group` instances, not custom schemas — each participant creates their own via `Group.create({ owner: me })` with parent + member configuration set imperatively on first message.

---

## 5. Conversation lifecycle

### 5.1 Create a 1:1 conversation (from Alice's perspective)

Triggered by Alice clicking "Start chat" on Bob's contact detail page.

```
1. existing = bobContact.linkedConversation
   if existing: navigate to /conversations/{existing.$jazz.id}; return

2. (defensive) iterate my ConversationGroups
   for each 2-member group where the other member's accountID === bob:
     bobContact.linkedConversation = its Conversation
     navigate; return

3. (create new)
   conversationGroup = Group.create({ owner: me })
   conversationGroup.addMember(bob, "admin")   // bob is admin; me is already admin as owner

   conversation = Conversation.create(
     { kind: "dm",
       createdAt: new Date(),
       createdBy: me.$jazz.id,
       messages: co.list(Message).create([], { owner: conversationGroup }) },
     { owner: conversationGroup }
   )

   bobContact.linkedConversation = conversation
   navigate to /conversations/{conversation.$jazz.id}
```

Note: **no WriteGroups are created at conversation-create time**. Each participant creates their own WriteGroup lazily on their first message send (see §5.4 and §7.1). This scales naturally to groups (Slice 3b: a new member's WriteGroup is created the first time they send), eliminates the "creator-provisions-everyone" coupling, and structurally prevents the registry-poisoning attack described in §4.

### 5.2 Bob's perspective on receiving the conversation

Bob's client subscribes to all `ConversationGroup`s he's a member of. When Alice creates one, Bob's sync session pulls the new Group + its referenced `Conversation` CoValue. His client adds it to his conversation list. No explicit "accept" action — being added to the Group is the accept.

His `bobContact.linkedConversation` for Alice's contact entry is null at this point. When Bob clicks "Start chat" on Alice's contact detail, step 2 of §5.1 finds the existing conversation and populates Bob's local cache. So clicks from either side converge.

Bob doesn't yet have a WriteGroup. He can read everything (he's a member of the ConversationGroup), but he can't send a message until `ensureMyWriteGroup` (§5.4) creates one — which happens transparently on his first send.

### 5.3 Self-creating WriteGroups on first message (`ensureMyWriteGroup`)

```
function ensureMyWriteGroup(me, conversation): Group {
  conversationGroup = conversation.$jazz.owner

  // Check whether I already have a WriteGroup in this conversation.
  // We look at the conversation's existing Message owners and find the
  // one whose direct writer is me. (See §6 for the underlying derivation.)
  for each message in conversation.messages:
    owningGroup = message.$jazz.owner
    if isWriteGroupOwnedBy(owningGroup, me): return owningGroup

  // None exists — create one.
  wg = Group.create({ owner: me })
  wg.extend(conversationGroup, "reader")    // inherit readers from the conversation
  wg.addMember(me, "writer")                // I am the only direct writer
  return wg
}
```

The `for each message in conversation.messages` scan is fine for v1 (small message volume per conversation); a future optimization could cache the participant→WriteGroup mapping in account-local storage, but that's not needed here.

`ensureMyWriteGroup` is idempotent and safe to call before every send.

### 5.4 Leave conversation

In the conversation detail view's kebab menu, "Leave conversation":

1. Confirm dialog: "Leave this chat? You'll stop receiving new messages and lose access to this conversation. You'd need a new invitation to rejoin."
2. `leaveConversation(me, conversation)`:
   - Resolve the owning `ConversationGroup`
   - `group.removeMember(me)` — Jazz rotates the readKey
   - Tombstone my `WriteGroup_me` (optional cleanup; harmless if left)
   - Clear `bobContact.linkedConversation` if it was pointing at this conversation
3. Navigate to `/conversations` (the conversation no longer appears in the list because I'm revoked from the Group)

**Bob's perspective when Alice leaves:**
- He sees Alice's revoke transaction → his client renders a synthetic timeline event ("Alice left the chat")
- For 1:1 (and any conversation where he'd be the only remaining active participant), his composer becomes disabled with a placeholder "No one else is in this chat" message
- He can still read history; he just can't send new messages because there's no one to send to
- He can leave the conversation himself if he wants it out of his list

### 5.5 Conversation list ordering

Sort by **last message's `sentAt`** descending. Empty conversations (no messages yet) fall back to `Conversation.createdAt`. The renderer reads `conversation.messages[messages.length - 1]?.sentAt ?? conversation.createdAt`.

### 5.6 Title derivation

`Conversation.kind === "dm"`: title = the other participant's `Profile.displayName`. The "other" is determined by iterating `ConversationGroup` members and excluding `me`. Special case: if I'm the only remaining active member (other party revoked), title shows their display name with a "(left)" suffix.

`Conversation.kind === "group"`: title comes from `Conversation.title` (added in 3b). Not used in 3a since we only create `"dm"` kind here.

---

## 6. Per-author WriteGroup mechanics

The Slice 1 spec (§6.3) introduced this pattern. Slice 3a operationalizes it for the first time, with **self-create** (each participant creates their own WriteGroup on first send — see §5.3):

**Per participant, per conversation:** one `WriteGroup` such that
- `WriteGroup` has `ConversationGroup` as parent with mapping `"reader"` — every member of the conversation (current and future) inherits `reader` on this WriteGroup
- `WriteGroup` has the named participant as the *single direct* `writer` member — only that participant can author writes
- Implicitly: the named participant is also the WriteGroup's admin (they created it via `Group.create({ owner: me })`)

When a participant sends a message: client calls `ensureMyWriteGroup` (§5.3) → creates a `Message` CoValue with `owner: theirWriteGroup`. The Jazz validator on every replica accepts the write because the author is a `writer` on the owning group. Other participants can read (via parent inheritance) but cannot write (no direct `writer` role on someone else's WriteGroup).

**Authorship derivation — structural, no registry:**

```ts
function getAuthorAccountIDFromMessage(message): string | null {
  const owningGroup = message.$jazz.owner;
  if (!(owningGroup instanceof Group)) return null;

  // Read the direct (non-inherited) writer members of this WriteGroup.
  // For a well-formed WriteGroup there is exactly one.
  const directWriters = directWriterMembers(owningGroup);
  if (directWriters.length !== 1) {
    // Malformed: refuse to render (treat as unknown author).
    return null;
  }
  return directWriters[0].$jazz.id;
}
```

`directWriterMembers(group)` reads the Group's member list and filters to those with role `writer` whose membership is set *directly* (not inherited via parent). The exact Jazz API for distinguishing direct vs inherited members is verified during implementation. If Jazz doesn't expose this distinction cleanly, the fallback is to use the WriteGroup's admin set (which is also length-1 for self-created WriteGroups by convention, and is not subject to parent inheritance for admin role — verify).

**Why this is forgery-resistant:** Mallory cannot create a Group with Bob as the single direct writer AND have it pass renderer validation, because creating the Group requires *her* to sign the create transaction — making her (not Bob) the structural creator/admin. Even if she adds Bob as the direct writer, the Group's admin set is Mallory, not Bob, and the structural mismatch (`directWriters[0] !== admins[0]`) is detectable. The renderer treats any WriteGroup that doesn't have `directWriters.length === 1 && directWriters[0] === admins[0]` as malformed and refuses to render its messages.

The `Message` schema has **no `author` field**. Author is computed structurally from the WriteGroup's membership shape.

---

## 7. Message lifecycle

### 7.1 Send

User types in composer, hits Enter (Shift-Enter = newline):

```
async function sendMessage(me, conversation, body):
  myWriteGroup = ensureMyWriteGroup(me, conversation)   // creates on first call per conversation
  message = Message.create(
    { sentAt: new Date(),
      body,
      attachments: co.list(FileBlob).create([], { owner: myWriteGroup }) },
    { owner: myWriteGroup }
  )
  conversation.messages.$jazz.push(message)
```

UI clears composer; message appears in timeline immediately (optimistic, no per-message pending indicator per fork #5). Connection-status banner conveys the broader "is sync happening" signal.

**First-send overhead:** the very first message a participant sends in a conversation is a 2-write operation (create WriteGroup + create Message). Both happen in the same logical action; on failure mid-way (rare), the worst case is an orphan WriteGroup with no messages — harmless. Subsequent sends are O(1) once `ensureMyWriteGroup` finds the existing WriteGroup via the §5.3 scan.

### 7.2 Edit

UI shows Edit option in message kebab menu only when `getAuthorAccountIDFromMessage(message) === me.$jazz.id`.

```
async function editMessage(me, message, newBody):
  message.$jazz.set("body", newBody)
  message.$jazz.set("edited", true)
  message.$jazz.set("editedAt", new Date())
```

UI re-renders with new body + `(edited)` indicator near the timestamp.

The Jazz validator on every replica accepts the write because `me` is the `writer` on the message's owning WriteGroup. Other participants cannot edit the message because they aren't in that WriteGroup — this is enforced cryptographically, not merely in the UI.

### 7.3 Delete

UI shows Delete option in message kebab menu only when `getAuthorAccountIDFromMessage(message) === me.$jazz.id`.

```
async function deleteMessage(me, message):
  message.$jazz.set("body", "")            // clear the body
  message.$jazz.set("deleted", true)
```

UI renders the position as a `DeletedMessagePlaceholder` showing "This message was deleted" with the author's display name preserved.

**Why clear the body too** (decided during brainstorm): the body field is no longer trusted as the source of truth once `deleted` is set. Clearing it means the *current state* of the CoValue has no content — the renderer can't accidentally show it; a malicious client can't conditionally show it. The body is still present in the CoValue's transaction log (Jazz keeps per-session history); fully scrubbing that is best-effort and out of scope for soft delete. Hard delete (`deleteCoValues`) is not used in 3a.

---

## 8. UI surfaces

### 8.1 Sidebar (replaces existing contact list)

```
┌──────────────────────────┐
│ Sven                  +  │   ← "+" opens ContactPicker → "Select a contact to chat with"
├──────────────────────────┤
│ Anna             1m ago  │   ← conversation rows, sorted by last activity
│ Bob              2h ago  │
│ ...                      │
│                          │
│ (empty state when none)  │
│ "No conversations yet.   │
│  Start a chat from your  │
│  contacts."              │
├──────────────────────────┤
│ 📇 Contacts              │   ← link to /contacts
│ ⚙ Settings               │   ← existing
└──────────────────────────┘
```

Empty-state CTA links to `/contacts` so first-time users can find people to chat with.

### 8.2 Conversation detail (`/conversations/:id`)

```
┌─────────────────────────────────────────────────┐
│ ← Back     Anna                              ⋮  │
├─────────────────────────────────────────────────┤
│ ⚠ No connection — messages will send when       │   ← connection-banner (only when offline)
│   you reconnect                                  │
├─────────────────────────────────────────────────┤
│  Anna 10:42                                     │
│  Hey, ready for the call?                       │
│                                                 │
│                            10:43        Sven    │   ← my messages right-aligned
│                       Yep, joining now          │
│                                                 │
│                 10:43 (edited)          Sven    │
│                          Joining in 2           │
│                                                 │
│  Anna 10:45                                     │
│  ⌫ This message was deleted                     │   ← deleted placeholder
│                                                 │
├─────────────────────────────────────────────────┤
│ Type a message...                          [→]  │
└─────────────────────────────────────────────────┘
```

Kebab menu (top-right) options for 3a:
- **Leave conversation** (with confirm dialog)

Each message has its own kebab (visible on hover/long-press) with:
- **Edit** (only if author === me, not deleted)
- **Delete** (only if author === me, not deleted)

### 8.3 Contacts page (`/contacts`)

Full-page list of contacts. Same data and behavior as the previous sidebar list:
- Each row shows `displayNameLocal`, click to detail
- "+ Add contact" button at top (already wired to `/contacts/add` from Slice 2)
- Empty state encourages adding the first contact

### 8.4 Contact picker (`ContactPicker` overlay)

Triggered by sidebar `+`:
- Modal/overlay listing contacts
- Each row clickable; click → calls `findOrCreate1to1Conversation(me, contact)` → navigates to the conversation
- Empty state "You have no contacts yet" with a link to `/contacts/add`

### 8.5 Connection-status banner

A small component subscribed to Jazz's `useSyncConnectionStatus()` hook (per `docs/jazz-api-notes.md` §3). Renders nothing when connected; a subtle yellow banner when disconnected, mounted at the top of the conversation detail view.

---

## 9. Testing

### 9.1 Unit

- `tests/unit/jazz/conversation.test.ts` — `findOrCreate1to1Conversation` round-trips: simulate Alice + Bob clients; Alice creates, Bob looks up, both converge on same `ConversationGroup`. WriteGroup structure verified (parent inheritance + direct writer member).
- `tests/unit/jazz/messages.test.ts` — `sendMessage` creates a Message owned by the correct WriteGroup; `getAuthorAccountIDFromMessage` resolves to the correct accountID; `editMessage` modifies body + sets flags; `deleteMessage` clears body + sets `deleted`; non-author cannot edit (validator throws).

### 9.2 E2E

- `tests/e2e/messaging-1to1.spec.ts` — full happy path. Two browser contexts as mutual-contact accounts. Alice taps "Start chat" on Bob's contact → conversation appears in both sidebars. Alice sends a message → appears in Bob's timeline within a few seconds. Bob replies → appears in Alice's timeline. Alice edits her message → Bob sees "(edited)" indicator. Alice deletes her message → Bob sees "This message was deleted" placeholder.
- `tests/e2e/leave-conversation.spec.ts` — Alice leaves the conversation. Conversation disappears from Alice's list. Bob sees "Alice left the chat" event in the timeline. Bob's composer becomes disabled. Alice cannot re-enter without a new invitation (the conversation isn't accessible via direct navigation).
- `tests/e2e/conversation-list-ordering.spec.ts` — three conversations with different last-message times; sidebar sorts most-recent first; sending a message in an older conversation bumps it to the top.

### 9.3 Manual verification (pre-merge)

- Connection-status banner appears within ~2s of stopping the sync server; disappears within ~2s of restarting it
- Contact picker is keyboard-navigable (arrow keys + Enter)
- Long messages wrap correctly; the timeline auto-scrolls to bottom on new messages
- Editing your own message of a deleted message is impossible (UI doesn't expose Edit on deleted messages)

---

## 10. Done definition

Slice 3a is complete when all of the following are true:

- [ ] `npm test` exits 0 (unit tests — adds at least 2 new files: `conversation.test.ts`, `messages.test.ts`)
- [ ] `npm run test:e2e` exits 0 in Chromium + Firefox (adds 3 new e2e specs)
- [ ] Manual: two browser contexts as different accounts can establish mutual contact, start a 1:1 chat, exchange messages, edit own messages, delete own messages, leave the conversation. Both sides see consistent state throughout.
- [ ] Manual: Settings → "Sign out" still works (Slice 2 regression check)
- [ ] Manual: sidebar shows conversations (not contacts); contacts accessible via `/contacts` link in sidebar footer
- [ ] Linear NOX-9 closed with link to merged PR / merge commit (resolution: separate-actions, leave-conversation in conversation menu)
- [ ] Tag `slice-3a-complete` set on the merge commit

---

## 11. Open risks

1. **Author derivation requires distinguishing direct from inherited members.** §6's `directWriterMembers(group)` needs the Jazz API to expose direct-vs-inherited member resolution. If the API only returns the resolved member set (including parent-inherited members), every conversation member would appear as a "writer" of each WriteGroup via inheritance subsumption, breaking the length-1 check. Fallback: derive author from the WriteGroup's admin set, which by convention is length-1 for self-created WriteGroups and is not subject to parent inheritance for admin role (verify). If neither works cleanly, dispatch a focused research subagent for this API before committing the renderer code.

2. **Sender's local optimistic render must reconcile with Jazz's actual write completion.** The `Message.create` call returns a CoValue ID immediately; the actual sync to other peers happens asynchronously. The renderer should subscribe to the message's load state and re-render if anything changes (e.g., the sync confirms the write differently than expected). React + Jazz hooks should handle this automatically via `useCoState`.

3. **Order of edits across devices.** If Alice edits the same message from two devices simultaneously, both writes target the same field. Jazz's CRDT semantics resolve to last-writer-wins per the spec's §6.5 ("Group consistency"). This is fine but may surprise users if they don't realize their other device made the same edit. No UI mitigation in 3a; just rely on the natural behavior.

4. **Title derivation when the other party hasn't yet been resolved.** On first conversation load, Bob's `Profile.displayName` may not be resolved yet (network round-trip). The title may briefly render as "Loading…" or empty. Acceptable for 3a; consider a fallback shortcut (use `Contact.displayNameLocal` if Profile not yet loaded) — implementer's call.

5. **"Bob sees Alice left" timeline event is a synthetic UI element, not a CoValue.** It's derived from the ConversationGroup's role-grant transaction history (Alice's role goes to `revoked`). Implementation needs to query that history and render the synthetic event in the right timeline position. The Jazz API for reading a Group's permission history needs verification — if not exposed cleanly, the fallback is to display a static "[Member left]" indicator at the bottom of the timeline rather than positioned at the exact transaction time. The full version of this is a 3b polish task; 3a can ship with the simple fallback if the API requires hunting.

6. **react-router-dom param parsing.** `/conversations/:id` — verify the `:id` matches Jazz's CoValue ID format (`co_z…`) without URL-encoding surprises.

7. **Removal of `Conversation.authorWriteGroups` is a schema change.** Slice 3a removes a Slice-1 field. Safe because no Conversation CoValue has ever been created (Slice 2 explicitly deferred conversation creation), but the test for the Conversation schema (`tests/unit/jazz/schema/Conversation.test.ts`) will need updating to reflect the new shape.

---

## 12. References

- `docs/superpowers/specs/2026-05-15-jazz-messanger-design.md` — full E1a design (§3 data model, §6 conversation/group lifecycle)
- `docs/superpowers/specs/2026-05-16-slice-2-pairing-invitations-design.md` — Slice 2 design (Contact.linkedConversation field added here)
- `docs/superpowers/plans/2026-05-15-e1a-slice-1-foundation-account.md` — Slice 1 plan (initial Conversation + Message schemas)
- `docs/superpowers/plans/2026-05-16-slice-2-pairing-invitations.md` — Slice 2 plan (executed and merged)
- `docs/security/threat-model.md` — relevant: §5 "Content disclosure by participants" (deletion is best-effort), §3 "Authorship integrity" (per-author WriteGroup guarantee)
- `docs/jazz-api-notes.md` — API reference; §3 for `useSyncConnectionStatus`, §5/§6 for Group / CoMap APIs
- Linear NOX-9 — `https://linear.app/nox-decima/issue/NOX-9` (resolved by this spec)
- Linear NOX-10 — `https://linear.app/nox-decima/issue/NOX-10` (deferred — hard device revocation, unchanged)
