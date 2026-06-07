> **Historical context (added 2026-06-07):** this document was written when the project was named **jazz-messanger**. The project was renamed to **Arcan** on 2026-06-05; the app rebrand itself is captured as Unit 5 in `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md`. This file is preserved as-is for historical accuracy.
# Slice 4 — Conversation Lifecycle (archive + chronological system events) Design

**Goal.** Give "left" and "kicked" conversations a proper home instead of either silently disappearing (self-left) or rendering broken in the sidebar (kicked). Make membership-change events first-class chronological items in the conversation timeline instead of static bottom-of-list pills.

**Scope.** Medium slice — ~6–8 hours of work, 3 phases (schema + protocol; timeline + archive UI; e2e + docs).

**Closes:** NOX-17 (archive of left/kicked conversations) and NOX-18 (chronologically-positioned system events). Partially addresses NOX-16 (its archive-view portion is fully covered; the disband portion stays open in NOX-16 for a later slice).

**Deferred (explicit non-goals):**
- Disband group action (stays in NOX-16).
- `demoteToWriter` system event (the primitive isn't UI-callable currently; can add an event when UI exposes self-demote).
- Owner / manager role concepts (still deferred, separate from this slice).
- Privacy filter for late-joiners (late joiners see all historical events that occurred before they joined — natural messenger UX).
- Hard cryptographic enforcement of event-write coverage. The log is application-level; trust-circle threat model.

---

## 1. The sidecar SystemEvent log

Membership-change events live on the `Conversation` CoValue itself, not derived from cojson permission history (which jazz-tools 0.20.18 doesn't expose publicly anyway).

### 1.1 Schema

New schema file `src/jazz/schema/SystemEvent.ts`:

```ts
import { co, z } from "jazz-tools";

/**
 * A membership-related event captured in the conversation's sidecar log.
 *
 * Events are written by the actor performing the action (admin adding/removing
 * a member writes their own event; a leaver writes their own "left" before
 * self-revoking). The log is application-level: a determined actor could call
 * cojson directly and skip the event write. This is consistent with the
 * trust-circle threat model.
 */
export const SystemEvent = co.map({
  kind: z.enum(["added", "removed", "left", "promoted"]),
  actorAccountID: z.string(),
  targetAccountID: z.string().optional(), // omitted for kind="left" (actor IS target)
  occurredAt: z.date(),
});
```

`Conversation` gains one field (in `src/jazz/schema/Conversation.ts`):

```ts
import { SystemEvent } from "./SystemEvent";

export const Conversation = co.map({
  title: z.string().optional(),
  createdAt: z.date(),
  createdBy: z.string(),
  messages: co.list(Message),
  systemEvents: co.list(SystemEvent),
});
```

**Migration:** existing conversations (created pre-Slice-4) have `undefined` `systemEvents`. Code that reads the list uses `?? []` so this is graceful. Events history starts from the first Slice-4 protocol call on a given conversation.

### 1.2 Protocol-function event writes

Four protocol functions in `src/jazz/conversation.ts` gain a "write event first, then perform action" pattern:

| Function | Event kind | Actor | Target | Why ordering matters |
|---|---|---|---|---|
| `addMemberToConversation` | `added` | caller (`me`) | new member | Caller has write access throughout. |
| `removeMemberFromConversation` | `removed` | caller | revoked member | Caller has write access throughout. |
| `leaveConversation` | `left` | caller | (omitted) | **Write event BEFORE self-revoke** — otherwise the leaver loses write permission and the event can't land. |
| `promoteToAdmin` | `promoted` | caller | promoted member | Caller has write access throughout. |

Each write uses `conversation.systemEvents.$jazz.push(SystemEvent.create({ … }, { owner: conversationGroup }))`. The owning group is the same `ConversationGroup` that owns messages and the conversation — same permission shape, no new groups needed.

`demoteToWriter` does NOT get an event in this slice. The primitive is not UI-callable (Slice 3c removed the demote button). When future work re-introduces a self-demote path, add the event then.

---

## 2. Chronological timeline rendering (closes NOX-18)

Current state (Slice 3a/3b): `src/routes/conversations/detail.tsx` renders messages in order, then a flat list of `<SystemEvent>` pills derived from a `getRoleOf` heuristic at the bottom. The heuristic is removed; the log becomes the single source of truth.

### 2.1 Merged timeline

In `detail.tsx`, build a single sorted stream:

```ts
type TimelineItem =
  | { kind: "message"; data: Message; sortAt: Date }
  | { kind: "event"; data: SystemEvent; sortAt: Date };

const merged: TimelineItem[] = [
  ...messages.map(m => ({ kind: "message" as const, data: m, sortAt: m.sentAt })),
  ...(conversation.systemEvents ?? []).map(e => ({
    kind: "event" as const,
    data: e,
    sortAt: e.occurredAt,
  })),
].sort((a, b) => a.sortAt.getTime() - b.sortAt.getTime());
```

Render: `merged.map(item => item.kind === "message" ? <MessageBubble … /> : <SystemEvent … />)`.

### 2.2 SystemEvent component

`src/components/system-event.tsx` already exists. Refresh its props to accept the four event kinds and the actor/target IDs; resolve display names via the existing `resolveDisplayName` helper. Renderings:

| kind | Render |
|---|---|
| `added` | "{actor} added {target} to the chat" |
| `removed` | "{actor} removed {target} from the chat" |
| `left` | "{actor} left the chat" |
| `promoted` | "{actor} promoted {target} to admin" |

Same pill styling as today (centered, muted, italic, rounded pill). data-testids: `system-event-{kind}`.

### 2.3 Backward compat

Remove the `getRoleOf`-based `leftMembers` derivation from `detail.tsx` entirely. The "left" pill stops appearing for pre-Slice-4 conversations where the other party already left (no event was written for that historical leave). This is acceptable per the project convention of recreating users; the new behavior is what users will see going forward.

---

## 3. Archive detection + sidebar section (closes NOX-17)

### 3.1 Detection

New helper in `src/jazz/conversation.ts`:

```ts
/**
 * True when `me` is no longer a participant in the conversation.
 *
 * Detection: getRoleOf returns undefined when the account is revoked OR was
 * never a member. Since this helper is only called for conversations in
 * me.root.knownConversations (which we only push to when me becomes a member),
 * undefined here means "was a member, now revoked" — i.e., archived.
 */
export function isArchived(me: Account, conversation: any): boolean {
  const group = conversation?.$jazz?.owner;
  if (!group) return false;
  const myID = (me as any).$jazz?.id;
  return group.getRoleOf(myID) === undefined;
}
```

### 3.2 Sidebar refactor

`src/components/sidebar.tsx` partitions `knownConversations` into two buckets via `isArchived`:

- **Active list** (existing render path) — chronologically sorted by last activity, label via `deriveConversationLabel`.
- **Archived section** (new) — below active list, collapsible header `▶ Archived (N)`. Default collapsed (state stored in local component state, not persisted — re-collapses on reload). When expanded, renders archived rows with muted styling: `text-gray-500 italic` plus `opacity-70`. Each row links to the read-only conversation detail (see §4).
- Each archived row has a hover-revealed "×" button on the right. Click triggers a confirmation prompt ("Remove this conversation from your archive? This cannot be undone."). On confirm, calls `removeFromArchive(me, conversation)` which splices the entry out of `me.root.knownConversations`. The conversation truly disappears from this user's view.

data-testids: `archived-section-header`, `archived-section-list`, `archived-row-{i}`, `archived-remove-{i}`.

### 3.3 `leaveConversation` change

Stop removing the conversation from `me.root.knownConversations` on self-leave. The leave protocol becomes:
1. Write `left` event to `conversation.systemEvents`.
2. Self-revoke from the conversation group (via `conversationGroup.removeMember(me)`).

After step 2, `isArchived(me, conversation)` returns true → the entry lands in the archived section automatically. Unified behavior: self-left and kicked conversations end up in the same place via the same mechanism.

### 3.4 `removeFromArchive` primitive

New protocol export in `src/jazz/conversation.ts`:

```ts
export async function removeFromArchive(
  me: Account,
  conversation: any,
): Promise<void> {
  const known = (me as any).root.knownConversations;
  // Find and splice. knownConversations is a co.list — use $jazz.splice.
  const items = Array.from(known) as any[];
  const idx = items.findIndex(
    (c) => c?.$jazz?.id === conversation.$jazz?.id,
  );
  if (idx >= 0) known.$jazz.splice(idx, 1);
}
```

This is the only way (currently) for a user to remove a conversation from their own view post-Slice-4. Future "Delete from archive" UX could chain with local-IndexedDB cleanup; not in scope here.

---

## 4. Read-only archived conversation view

`src/routes/conversations/detail.tsx` gains an `isArchived` branch:

- **Composer:** hidden entirely. Not disabled — the input does not render. Replaces the existing `composerDisabled` pathway for archived conversations.
- **Header banner:** new prominent banner above the message timeline reading "You're no longer a member of this conversation. [Remove from archive]". The link triggers the same confirmation + `removeFromArchive` flow as the sidebar X button.
- **Members link:** in the header, the "Members" link still works. The destination `MembersRoute` renders in read-only mode (see §4.1).
- **Timeline:** renders normally via the merged stream from §2.1. The last entry typically explains how the user got here ("Alice left" or "Bob removed Alice").
- **No polling:** the existing 2-second poll for `composerDisabled` + `leftMembers` is no longer needed (the log is the source of truth, not a derived snapshot). Remove the polling effect entirely.

### 4.1 MembersRoute read-only mode

`src/routes/conversations/members.tsx` already gates the action buttons on `iAmAdmin`. Extend the gating with an `iAmCurrentMember` check (uses the same `isArchived` helper):

- When `isArchived(me, conversation)` is true: hide the entire action sidebar (Add member, Leave, Promote/Demote/Remove buttons). Show only the member list with role pills, for historical reference.
- The "Leave conversation" button at the bottom is hidden (already-left users can't leave again).

---

## 5. Files touched

| File | Status | Change |
|---|---|---|
| `src/jazz/schema/SystemEvent.ts` | **NEW** | Schema |
| `src/jazz/schema/Conversation.ts` | Modify | Add `systemEvents: co.list(SystemEvent)` |
| `src/jazz/conversation.ts` | Modify | Write events in 4 protocol fns; new `isArchived`; new `removeFromArchive`; `leaveConversation` stops splicing knownConversations |
| `src/components/system-event.tsx` | Modify | Props grow to accept all 4 event kinds + actor/target; uses `resolveDisplayName` |
| `src/components/sidebar.tsx` | Modify | Active/archived partition; collapsible archived section; remove-X button |
| `src/routes/conversations/detail.tsx` | Modify | Merged timeline stream; archived banner + composer hide; remove polling effect; remove `getRoleOf` heuristic |
| `src/routes/conversations/members.tsx` | Modify | Read-only mode when archived |
| `tests/unit/jazz/conversation.test.ts` | Modify | Event-write tests; `isArchived` + `removeFromArchive` tests |
| `tests/e2e/archive-after-leave.spec.ts` | **NEW** | Self-leave lands in archive |
| `tests/e2e/archive-after-kick.spec.ts` | **NEW** | Kicked lands in archive |
| `tests/e2e/system-events-chronological.spec.ts` | **NEW** | Events appear in correct timeline position |
| `tests/e2e/archive-remove.spec.ts` | **NEW** | X-button removes from archive |
| `tests/e2e/leave-conversation.spec.ts` | Modify | Assertion: conversation now appears in archive, NOT deleted |
| `CHANGELOG.md` | Modify | Slice 4 entry |

---

## 6. Phases

- **Phase A — Schema + protocol** (~5 tasks): SystemEvent schema; Conversation.systemEvents field; write events in addMember/removeMember/leave/promote; `isArchived` + `removeFromArchive` primitives; unit tests for each.
- **Phase B — Timeline + archive UI** (~5 tasks): merged timeline render in detail.tsx; SystemEvent component refresh; sidebar archived section; detail.tsx read-only banner + composer hide + polling removal; MembersRoute read-only mode.
- **Phase C — E2E + docs** (~5 tasks): 4 new e2e specs; update `leave-conversation.spec.ts` for new archive behavior; CHANGELOG; ready-for-tag.

---

## 7. Acceptance criteria

1. After Alice self-leaves a group, the conversation appears in her sidebar under `▶ Archived (1)`, NOT removed entirely. Her last-known message history is viewable read-only.
2. After Bob (admin) removes Alice from a group, the conversation appears in Alice's sidebar under `▶ Archived (1)`. The system event log shows "Bob removed Alice".
3. When Alice adds Charlie to a group at 10:30 and a message is sent at 10:35, the "Alice added Charlie" pill renders BEFORE the 10:35 message in the timeline, not at the bottom.
4. Opening an archived conversation shows the read-only banner, no composer, no action buttons on MembersRoute. The header still navigates to MembersRoute (in read-only mode).
5. Clicking the X on an archived sidebar row + confirming removes the conversation from `me.root.knownConversations`. It disappears from both the archived section and the active list.
6. All Slice 1/2/3a/3b/3c regression e2e tests still pass.
7. `conversation.systemEvents ?? []` handles pre-Slice-4 conversations (where the field is undefined) without crashing.

---

## 8. Risk

Medium-low. The two highest-risk pieces:

- **Timeline merge ordering with mixed CoValue read latency.** Messages and system events are both CoValues; they load asynchronously. If a system event hasn't synced yet, the timeline shows an inconsistent intermediate state. Mitigation: the existing message timeline already handles this — items appear as they load and re-sort on each render. System events follow the same pattern; nothing new required.
- **`isArchived` detection accuracy.** `getRoleOf` returning undefined could in theory mean "load not complete yet" rather than "revoked". Mitigation: the resolve depth for conversations in the sidebar already pulls the conversation + its owning group's membership snapshot; by the time the sidebar renders, getRoleOf is reliable. Document this in the helper's doc comment so future changes don't violate the assumption.