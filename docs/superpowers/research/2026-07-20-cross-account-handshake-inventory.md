# Cross-account handshake inventory — Arcan

Date: 2026-07-20. Read-only inventory of every place two accounts (or two
devices of one account) must converge on a shared fact, classifying each by
mechanism and failure-mode exposure. Extends (does not repeat)
`2026-07-20-contact-robustness-investigation.md` ("[report]").

## 1. Connection requests + approval — [report] §1–2

Facts: "a request exists" (Inbox → durable drain into `incomingRequests`,
check-then-push by `$jazz.id`, `src/jazz/use-incoming-connection-requests.ts:54-61`);
"approved/denied" (stamps on the shared request, `src/jazz/invitations.ts:319,394`,
observed requester-side ONLY by a 3 s poll bound to the mounted `/invite` route,
`src/routes/invite/index.tsx:178-210`). Extension: the **denial** path uses the
identical fragile shape — `deniedAt` is only observed by the same
component-lifetime poll; a requester who closed the tab never learns they were
declined.

## 2. Device pairing / linking (Unit 2)

Initiator creates `EphemeralPairing` in an everyone-writer group
(`src/jazz/pairing.ts:250-266`), check-free push to `pendingPairings`
(`pairing.ts:283-290`), ephemeral privkey in per-tab sessionStorage. Responder
writes its pubkey (`pairing.ts:447-450`); trusted side stamps `approvedAt` +
`wrappedAccountSecret` (`pairing.ts:351-359`) or `rejectedAt`. Mechanism:
**symmetric 2 s polls, both component-lifetime** (`initiator-step.tsx:120-138`,
`responder-step.tsx:154-174`); the second device learns approval by polling for
`wrappedAccountSecret` presence (`approvedAt` is audit-only,
`EphemeralPairing.ts:50-51`). Not durable vs tab close on either end **by
design** (eph keys die with the tab; 10-min TTL is the recovery). Concurrent
approve/reject: approve wins (`pairing.ts:380-383`). `pendingPairings` entries
never removed — filter-only read (`use-pending-pairings.ts:19-26`).
**Bypass:** email+password login (`src/auth/flows.ts:127`) adds a second device
with no approval gate.

## 3. Conversation creation notification

The one hardened path (three layers): creator pushes own `knownConversations`
(`src/jazz/conversation.ts:171,231`) + fire-and-forget inbox notification
(`conversation.ts:176-190,235-255`); recipient drain raw-ID dedup
(`:811-819`), startup self-heal (`:684-710`), render belt (`:656-672`).
Residual: the SEND side has no outbound record or retry — a failed
notification permanently strands the other party (no secondary discovery
path). Inbox persistence makes the receive side durable.

## 4. Group membership + system events

Membership: **Jazz-native, robust, no app convergence** — add/remove/promote/
leave are group ops (`conversation.ts:408,459,486,371`); every UI derives from
`group.getDirectMembers()` (`conversation.ts:96-103`). Kicked members get no
signal; stale `knownConversations` entries are hidden derivationally via
`isArchived` (`conversation.ts:601-618`) and never pruned. Added-member
discovery rides the same fire-and-forget notification as §3. System events:
single-writer per action, but `addMemberToConversation` writes "added" BEFORE
checking existing membership (`conversation.ts:403-408`) — concurrent admin
adds double-log + silently overwrite role; UI guard is per-tab state only.

## 5. Invitations

Revocation stamp (`invitations.ts:174-178`) is checked by `/invite` only in
the mount effect (`invite/index.tsx:132-140`); `onConnect` never rechecks — a
parked confirm screen can send from a revoked invite. `liveInvitations`:
check-free push at creation, one new everyone-writer Invitation per
`/contacts/add` mount + per TTL change, never pruned (filter-only render).

## 6. Profile / avatar

Plain shared-CoValue read (everyone-reader profile group,
`ArcanAccount.ts:105-123`); CoMap LWW; robust. Asymmetry: contact display
names use the frozen `displayNameLocal` snapshot pinned at approval
(`displayName.ts:25-32`) — renames never propagate while avatars update live.

## 7. Read/unread

`me.root.lastReadAt` is a `co.record` keyed by conversation ID
(`ArcanAccount.ts:47`) — per-key LWW, structurally immune to append
duplication. Robust; multi-device e2e exists. Residuals: `beforeunload` flush
race (bounded); `markRead()` + its lastReadAt self-heal (`notifications.ts:57-86`)
is orphaned — zero call sites.

## 8. ArcanAccountRoot collection census

| Field | Type | Guard on write | Verdict |
|---|---|---|---|
| `contactBook` | CoList | none ([report] FM7) | fragile |
| `devices` | CoList | keyed check by sessionFingerprint (`ArcanAccount.ts:343-348`) | mostly fine; same-device two-tab migration race |
| `invitesIssued` | CoList | — | DEAD FIELD (zero readers/writers) |
| `knownConversations` | CoList | three-layer hardened | hardened |
| `lastReadAt` | co.record | per-key LWW | robust |
| `settings` | co.map | LWW | robust |
| `pendingPairings` | CoList | none; never pruned | growth only |
| `dismissedRequestIDs` | CoList<string> | check-then-push | duplicate-tolerant (Set read) |
| `liveInvitations` | CoList | none; never pruned | growth only |
| `incomingRequests` | CoList | check-then-push by id | fragile (FM2, 0/3 layers) |

## 9. Other

Messages/edits/deletes: shared CoValue log + LWW sets — robust. Conversation
title/icon: LWW + non-idempotent system-event append (arguably correct).
Feedback: HTTP POST, client→server. Blocklist: does not exist. "Archive" is
derived, not stored — robust.

## Pattern summary

Fragile interactions share three shapes: (1) **component-lifetime polls
carrying account-level facts** (invite approval, denial, both pairing polls);
(2) **check-then-push / check-free CoList appends** (contactBook,
incomingRequests, pendingPairings, liveInvitations; only knownConversations is
hardened); (3) **fire-and-forget inbox sends with no durable outbound record**
(connection requests, conversation + member-add notifications). Robust
interactions are robust for generalizable reasons: Jazz-native group
membership (protocol convergence, derived UI), keyed CoMap/co.record writes
(LWW), public shared-CoValue subscriptions. Incidental: `invitesIssued` dead,
`markRead` orphaned, email+password bypasses the device gate, name-snapshot
asymmetry.
