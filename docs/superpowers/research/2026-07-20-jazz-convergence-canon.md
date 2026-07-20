# Jazz cross-account convergence — canonical patterns (jazz-tools 0.20.18)

Date: 2026-07-20. Source-verified against the installed package (`[jt]` =
node_modules/jazz-tools 0.20.18, `[cj]` = node_modules/cojson) and the
classic.jazz.tools archived docs (the 0.17–0.20-era site). NOTE: jazz.tools/docs
now documents a next-generation API that does NOT apply to 0.20.18; nothing
below relies on it.

## 1. Sync/delivery guarantees (source-verified)

- **Writes are local-first and durably outboxed.** `UnsyncedCoValuesTracker`
  persists unsynced-CoValue IDs to storage, including "unsynced to any peer"
  (`[cj]/src/UnsyncedCoValuesTracker.ts:6-33`); on startup they are reloaded
  and re-pushed (`[cj]/src/sync.ts:521-531`). One-sided writes survive restart
  at the CoJSON layer when IndexedDB storage is on.
- **Reconciliation with acks**: `reconcile`/`reconcile-ack` per CoValue batch
  (`[cj]/src/sync.ts:82-88,352-446`).
- **`waitForSync`** (`coValue.$jazz.waitForSync`, `waitForAllCoValuesSync`)
  waits for connected server peers to confirm upload + local persistence;
  default timeout 60 s (`[cj]/src/sync.ts:1547-1611`). **Caveat:** with no
  connected peer it resolves storage-only — "persisted + queued", not
  "delivered".

## 2. Canonical handshake patterns

**(a) Inbox** — built for account handshakes (CHANGELOG 0.8.45). Semantics
(`[jt]/src/tools/coValues/inbox.ts`):
- Rendezvous via `profile.inboxInvite` (writeOnly invite auto-accept,
  `inbox.ts:40-65,435-453`).
- `sendMessage`: grants the inbox owner **writer on the payload's owning
  group** (`inbox.ts:96-103` — security-relevant, undocumented); awaits
  payload+envelope `waitForSync` BEFORE announcing (`inbox.ts:112-113`);
  returns a promise resolving only when the receiver durably marks
  `processed: true` — an end-to-end app-level ack, optionally carrying a
  result CoValue ID — **with no timeout** (`inbox.ts:390-411`).
- Receiver dedup: persisted processed-CoStream, fully streamed before drain
  (`inbox.ts:203-216,264,313-321,365`). Failed messages go to a `failed`
  stream and are NEVER retried (`inbox.ts:267-287`).

**(b) requestToJoin pattern test** (`[jt]/src/tools/tests/patterns/
requestToJoin.test.ts`) — the blessed approval handshake:
- Public rendezvous: `requests: co.record(accountID, RequestToJoin)` in a
  group with `addMember("everyone", "writeOnly")` (submitters can't read each
  other).
- **Keyed by requester account ID** (`set(account.$jazz.id, request)`) —
  idempotent by construction.
- **One writer per fact**: a separate admin-owned `statuses` record is "the
  source of truth for admins"; the requester's copy is notification-only.
- **The converged fact is group membership** (`mainGroup.addMember(user,
  "writer")`) — cryptographically enforced, cannot fork.
- Every step ends with `await waitForAllCoValuesSync()`.

**(c) Invite links + own-root registration**: acceptors add the shared thing
to their OWN root list — each account writes only its own root. Classic docs
caveat: "Invites do not expire and cannot be revoked."

**(d) Deterministic unique CoValues** — `getOrCreateUnique / upsertUnique /
loadUnique` on CoMap/CoRecord/CoList (`[jt]/src/tools/coValues/coMap.ts:443-593`)
with first-writer-wins init enforced by cojson (`fww` transaction meta,
`[cj]/src/coValueCore/coValueCore.ts:1508-1529`). ID derived from
`(type, unique, ownerID)`. Dedups within an existing shared group; cannot
bootstrap the group itself. Absent from docs/jazz-api-notes.md.

## 3. CoList vs co.record under concurrency

- CoList = insertion-order CRDT; two concurrent appends BOTH survive —
  duplication is the correct CRDT outcome. Docs: set-like collections should
  be CoRecords "keyed on the item's CoValue ID".
- co.record/CoMap = per-key LWW (`[cj]/src/coValues/coMap.ts:117-160`).
  Undocumented caveat: identical-millisecond cross-session writes tie-break by
  arrival order.
- CoFeed/CoStream: per-session append-only streams — "one writer per fact"
  embodied; no write conflicts ever.

## 4. Facilities Arcan isn't using that fit

1. `getOrCreateUnique` + first-writer-wins for singleton-per-scope facts.
2. The Inbox `result` back-channel as the handshake reply + ack.
3. Group membership as the authoritative converged fact; app records as
   projections.
4. `writeOnly` everyone role as stranger-safe rendezvous.
5. Server workers / JazzRPC (rejected for Arcan: threat model).
6. `SyncStateManager.subscribeToCoValueUpdates` for per-write upload status.
7. CoFeed for per-account signals.

## 5. Gaps (docs don't cover)

- Multi-tab/multi-device concurrent Inbox draining (no claim/lease primitive;
  Arcan's one-shot hardening exceeds upstream).
- No delivery-guarantee spec for the 0.20 protocol (source-derived only).
- No "one writer per fact" doctrine doc (implicit in patterns only).
- Inbox failure semantics (failed = dropped forever; sendMessage never times
  out; sender grants receiver writer on payload group) — source/tests only.
- No account-to-account "friend request" example app in the 0.20 era.

**Bottom line:** rendezvous via Inbox or writeOnly keyed record; every
duplicate-sensitive fact in a keyed record or unique CoValue — never a CoList;
authoritative fact = group membership or an arbiter-owned record with the
counterpart holding a projection; await sync/acks before treating a step done.
