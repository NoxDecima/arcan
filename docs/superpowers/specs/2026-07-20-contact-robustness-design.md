# Contact & connection robustness — design

Date: 2026-07-20
Status: approved (brainstorm with user; full robustness slice, Option A)

## Grounding

- Investigation: `docs/superpowers/research/2026-07-20-contact-robustness-investigation.md`
  (pipeline map, failure modes FM1–FM10).
- App-wide inventory: `docs/superpowers/research/2026-07-20-cross-account-handshake-inventory.md`
  (every two-account/two-device convergence point, classified).
- Jazz canon: `docs/superpowers/research/2026-07-20-jazz-convergence-canon.md`
  (source-verified 0.20.18 guarantees + blessed patterns).

## Philosophy (the four canon rules this slice aligns to)

1. Duplicate-sensitive facts live in keyed records (`co.record`), never CoLists —
   concurrent writes converge by per-key LWW instead of duplicating.
2. One writer per fact; the counterpart holds a projection.
3. Handshake memory is durable account state watched by app-level hooks — never
   component-lifetime polls or fire-and-forget sends.
4. Sends await the Inbox's end-to-end ack (`sendMessage` resolves on the
   receiver's durable processed-mark); mutations await sync where a step's
   meaning depends on it.

Decided: **Option A now** (app-level canon alignment, no new infrastructure);
**Option B later** — pair-group membership as the authoritative "connected"
fact is the designed extension point for Unit 6 (hard revocation), not built
here. Option C (server-worker arbiter) rejected: hands the server plaintext
contact-graph knowledge — threat-model regression.

## 1. Schema (ArcanAccountRoot; one version bump)

| Field | From → To | Key | Notes |
|---|---|---|---|
| `contactBook` | `co.list(Contact)` → `co.record` | contact's account ID | kills FM7 structurally |
| `incomingRequests` | `co.list` → `co.record` | request CoValue ID | kills FM2 drain race; per-requester collapse at render (FM1 belt) |
| `outgoingRequests` | NEW `co.record` | counterpart account ID | `{ request ref, channel: "invite"\|"group", sentAt, status: pending\|approved\|denied\|failed\|expired, archivedAt? }` |
| `dismissedRequestIDs` | `co.list<string>` → `co.record(string, boolean)` | request ID | consistency conversion |
| `pendingNotifications` | NEW `co.record` | `${conversationID}:${accountID}` | outbound conversation/member-add notification retry state |
| `liveInvitations`, `pendingPairings` | stay lists | — | single-writer growth-only; pruned (below) |
| `invitesIssued` | REMOVED | — | dead field (zero readers/writers) |

## 2. Handshake module (`src/jazz/handshake.ts`, absorbing pieces of `invitations.ts`)

- `upsertContact(accountID, data)` — the ONLY contact writer, used by approve,
  watcher, and future reconcilers. Idempotent by key. TOFU-aware: an existing
  `pinnedFingerprint` that mismatches the incoming one is NEVER overwritten —
  the upsert keeps the old pin and sets a conflict flag on the Contact,
  surfaced in the contact profile's existing safety-number section ("identity
  key changed — verify").
- `sendConnectionRequest(counterpartID, channel)` — the single creation path
  for BOTH channels (invite screen + members screen):
  1. contactBook check → "already connected" (no send);
  2. outgoingRequests check → "already pending" (no send);
  3. write `pending` entry FIRST (durable intent);
  4. mint + send the request via Inbox, await the end-to-end ack wrapped in an
     app-side timeout (`sendMessage` has none upstream);
  5. ack → keep `pending`; failure/timeout → `failed` (watcher retries).
- `useOutgoingRequestWatcher()` — mounted once in `App.tsx` beside the inbox
  drains. Subscribes to non-archived entries:
  - `approvedAt` appears → `upsertContact` + status `approved` + archive;
  - `deniedAt` appears → status `denied` (UI shows declined) + archive;
  - past expiry → status `expired`;
  - `failed` entries → re-send on launch/reconnect.
  Kills the invite screen's 3-second component-lifetime poll (approval AND
  denial); the screen becomes a pure view of watcher-owned state.

## 3. Receive/approve path

- Inbox drain writes into keyed `incomingRequests` (duplication impossible);
  render collapses rows per requester (latest wins visually).
- `approveConnectionRequest`: keeps per-request `approvedAt` guard; contact
  write goes through `upsertContact`.
- Invite confirm screen re-validates the Invitation (`revokedAt`/`expiresAt`)
  at Connect time, not only at mount.
- Request expiry decoupled from invitation TTL: `max(invitationExpiry,
  sentAt + 7 days)`.

## 4. Other fire-and-forget senders (same discipline)

- Conversation-creation + member-add notifications: write
  `pendingNotifications` entry before send; clear on ack; watcher retries.
  (Receive side is already the hardened three-layer knownConversations drain.)
- System-event `"added"`: membership pre-check before writing, so concurrent
  admin adds cannot double-log (and the silent role overwrite is surfaced).

## 5. Migration + repair (the risk center)

- List → record conversions dedup per key, latest entry wins — EXCEPT
  fingerprint conflicts in `contactBook`, where the OLDEST pin is kept (TOFU)
  and a conflict flag is set for the UI to surface.
- Historical outbound requests are unrecoverable (no records exist) — accepted.
- Existing damage repair is VISIBLE, not silent: any 1:1 conversation whose
  counterpart is absent from `contactBook` gets an "add to contacts"
  affordance (profile view + conversation header). Silent auto-repair would
  re-pin the counterpart's current key without verification (TOFU downgrade) —
  explicitly rejected.
- Pruning: approved/denied incoming requests >30 days; expired
  `pendingPairings`; revoked/expired `liveInvitations`.
- Dead code removed with the migration: `invitesIssued`, orphaned `markRead`
  self-heal.

## 6. UX states

- Invite confirm screen: `already contacts` / `request pending` states replace
  silent re-minting (FM8).
- Sent screen: `delivered` only after ack; `sending…` before; `failed — will
  retry` on failure. "You can close this" becomes true.
- Denied: requester sees declined state (parity with current intent).
- Members screen: connect button reflects pending state (disabled + label).
- Add-contact screen: invitation minted lazily on first QR-reveal/share, not
  on mount or TTL toggle (FM10).

## 7. Testing

- Unit: `upsertContact` idempotency + TOFU-conflict behavior; watcher state
  transitions (approved/denied/expired/failed-retry); migration dedup fixtures
  (incl. fingerprint-conflict oldest-pin rule).
- E2e: double-tap Connect → exactly one request; close-tab-then-approve →
  contact appears on requester's next launch (FM3 scenario, two contexts);
  denial path; group-channel connect → both sides get contacts (FM4); revoked
  invite blocked at Connect; existing invite/connection suites stay green.
- Two-device drain race: unit-level coverage (e2e cannot deterministically
  race it).

## Out of scope (recorded decisions)

- Device-pairing polls: ephemeral by design (interactive ceremony, 10-min TTL
  recovery). Only list pruning included.
- Email+password login bypassing the Unit-2 device-approval gate: real finding,
  belongs to Unit 6 (hard revocation) — record there.
- Contact display names frozen at approval vs live avatars: product decision,
  separate brainstorm.
- Pair-group as authoritative "connected" fact: Option B, designed extension
  point for Unit 6.
- FM5/FM6 (conversation-with-non-contact stub path; contact removal keeping
  the conversation): intentional behavior, kept; ties into the pending
  Bundle-F brainstorm.

## Decisions log (brainstorm, 2026-07-20)

- Scope: FULL robustness slice (all FM1–FM10 + inventory extensions).
- Mechanism: approval watcher over durable `outgoingRequests` (rejected:
  approver-side push — version-coupled; rejected: both — redundant paths).
- Overarching: align to Jazz canon app-wide now (A); pair-group authority
  later (B, Unit 6); no server arbiter (C, threat model).
- Repair of missing contacts: visible affordance, never silent re-TOFU.
