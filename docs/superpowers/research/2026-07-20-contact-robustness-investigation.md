# Account/Contact Robustness Investigation — add-contact/pairing/conversation pipeline

Date: 2026-07-20
Status: investigation only — fixes deliberately NOT applied; seeds a brainstorm.
Trigger: user-reported symptoms — (1) adding a contact sometimes creates two
connection requests; (2) connected in the past, a conversation exists, but the
person is missing from the contact list.

## 1. Pipeline map

**Invitation minting (inviter, "add contact" screen)**
- `Invitation` CoValue (`src/jazz/schema/Invitation.ts:3-11`) — created in an **everyone-writer** group by `createInvitation` (`src/jazz/invitations.ts:92-139`), pushed to inviter-private `me.root.liveInvitations` (`invitations.ts:127-134`). `/contacts/add` creates a **new Invitation on every mount and every TTL change** (`src/routes/contacts/add.tsx:59-74`). QR and copied link share the same Invitation; QR adds a `?via=qr` marker only (`add.tsx:112`, `invitations.ts:151-158`).

**Request creation (requester = person who opens the invite)**
- `/invite` route loads the Invitation as guest (`src/routes/invite/index.tsx:124-168`), user clicks connect → `createConnectionRequest` (`invitations.ts:261-301`) mints a `ConnectionRequest` CoValue (`src/jazz/schema/ConnectionRequest.ts:8-19`) in a fresh requester-owned group and delivers it via `InboxSender.sendMessage` to the recipient's inbox. The returned request handle lives only in component state (`invite/index.tsx:103,232`). **There is no durable record of outbound requests anywhere** (no such field in `ArcanAccountRoot`, `src/jazz/schema/ArcanAccount.ts:32-80`).
- Group channel: `requestConnectionFromGroupMember` (`src/jazz/conversation.ts:264-270`, called from `src/routes/conversations/members.tsx:362-369`) — same mint+send, return value **discarded**.

**Request delivery (recipient)**
- Single app-level drain `useIncomingConnectionRequestInbox` (mounted `src/App.tsx:114`; impl `src/jazz/use-incoming-connection-requests.ts:33-81`) subscribes to the Jazz Inbox (one-shot + persisted `processed` stream — diagnosed in Unit 9-0, commit `d6d7559`) and pushes each request into durable `me.root.incomingRequests` (CoList), deduped **by request `$jazz.id` only** (`use-incoming-connection-requests.ts:54-61`). Readers: modal prompt (`src/components/incoming-connection-prompt.tsx:25-35`, QR channel only), sidebar pending section, `/connections/pending`.

**Acceptance — contact writes are two independent, unsynchronized one-sided writes**
- Recipient side: `approveConnectionRequest` (`invitations.ts:312-336`) stamps `approvedAt` on the shared request (idempotent per-request only) and pushes a `Contact` into **recipient's** `contactBook`. No conversation is created on approval.
- Requester side: contact written **only** by the 3-second approval poll inside the still-mounted `/invite` route (`invite/index.tsx:178-210` → `writeInviterAsContact` :47-69). Nothing else in the codebase watches `approvedAt` (verified by grep: only the invite route and device-pairing use it).

**Conversation creation/linking (separate, later, user-initiated)**
- `findOrCreate1to1Conversation` (`conversation.ts:131-193`): scan-by-membership (`isOneToOneWith` :87-109), 300 ms anti-race recheck (:144), creator pushes to own `knownConversations` (:171) + fire-and-forget inbox notification; other side's drain `useConversationInboxSubscription` (:765-838) pushes into their `knownConversations` with raw-ID dedup (:811-819), startup self-heal (:684-710) and render belt `dedupeConversationsByID` (:656-672) — the round-2 hardening, applied to **this list only**.

## 2. Failure modes

**FM1 — Non-idempotent request creation; no outbound-request memory. (confirmed-by-code → symptom 1)**
- `onConnect` has no in-flight/phase guard (`invite/index.tsx:214-238`) — a double-tap fires `createConnectionRequest` twice.
- Phase + request handle are component state: any reload of `/invite#…` returns to the confirm screen; the app has no record that a request to this inviter is already pending, so a second visit (re-scan, paste-after-scan, second device, "did it work?" reload) mints a second request. The "sent" screen even invites tab closure (`invite/index.tsx:323`).
- Group channel: `handleRequestConnection` (`members.tsx:362-369`) has no disable/pending tracking — every click sends a fresh request.
- Recipient dedup keys on request CoValue id, never on `requesterAccountID` (`use-incoming-connection-requests.ts:56-59`), so all duplicates display as separate "wants to connect" rows.

**FM2 — Multi-session drain race duplicates a *single* request in `incomingRequests`. (mechanism confirmed in sibling list; plausible here → symptom 1)**
Two sessions of the recipient (second device — Android + web — or two browser tabs) both run the check-then-push drain before the `processed` stream and list writes sync; CoList concurrent appends merge as two entries. This exact mechanism was **confirmed** for `knownConversations` (commit `1beb179`: "two devices of the same account each run the inbox drain check-and-push before CRDT sync merges"). `incomingRequests` got **none** of the three protective layers: no raw-ID drain dedup, no self-heal, no render-time dedupe (`use-incoming-connection-requests.ts:114-128` maps directly; duplicate React keys at `pending.tsx:43`, `pending-requests-section.tsx:57`).

**FM3 — Requester's contact write is tab-lifetime-bound. (confirmed-by-code → symptom 2, likely the primary cause)**
`writeInviterAsContact` runs only while `/invite` stays mounted in phase "sent" (`invite/index.tsx:178-210`). Closing the tab or tapping "back to app" (:325) permanently forfeits it — the UI's "you'll be notified when they accept" is false: no notification/reconciliation path exists. Later the approver (who *does* have the contact) starts the 1:1 (`contacts/detail.tsx:87-91`), the inbox notification lands the conversation in the requester's `knownConversations` (`conversation.ts:784-825`) → **requester has a conversation with someone absent from their contact list.** For any approval that isn't near-instant, this is close to the default outcome.

**FM4 — Group-channel connections are structurally one-sided. (confirmed-by-code → symptom 2)**
`requestConnectionFromGroupMember` discards the request handle (`conversation.ts:264-270`); no poll or watcher exists, so on approval the approver writes the requester into their contactBook (`invitations.ts:322-335`) but the requester **never** gets the approver as a contact.

**FM5 — Conversation-with-non-contact by design (stub path). (confirmed-by-code → symptom 2)**
`handleMessage` uses `contact ?? { contactAccountID: accountID }` (`src/components/profile-view.tsx:271-281`; same pattern `src/routes/conversations/new.tsx:99-104`) — any reachable profile (pending requester, group co-member) can be messaged without a contact entry, on either side.

**FM6 — Contact removed, conversation kept (intentional). (confirmed-by-code → benign look-alike of symptom 2)**
`contacts/detail.tsx:93-98` removes only the contact; `profile-view.tsx:292-309` keeps the 1:1 unless the checkbox is set.

**FM7 — Approve/contact-write not idempotent at the account level → duplicate contacts. (confirmed-by-code; cascades from FM1/FM2)**
`approveConnectionRequest`'s only guard is `approvedAt` on that one request (`invitations.ts:317`); it never checks contactBook for an existing `contactAccountID` (:322-335). Approving two duplicate requests, approving concurrently on two devices (both read `approvedAt` unset → CoMap stamp converges but both Contact pushes survive), or re-connecting via a still-valid/permanent invite link each yield duplicate Contact entries. `writeInviterAsContact` likewise never dedups (`invite/index.tsx:47-69`). No consumer dedups contactBook (`use-home-lists.ts:433-446`, `contact-picker.tsx:22-24` — duplicate React keys render silently).

**FM8 — No "already a contact / already pending" gate on the invite confirm screen. (confirmed-by-code; feeds FM1/FM7)**
`InviteRoute` resolves `contactBook` (`invite/index.tsx:96`) but never consults it; a permanent (`"none"` TTL, `invitations.ts:35-36`) link in a chat log invites re-adding forever.

**FM9 — Request-loss modes (completeness).**
- Request `expiresAt` inherits the invitation's expiry (`invite/index.tsx:229`): a request sent 1 min before a 1 h link expires silently vanishes from the recipient's pending list (`use-incoming-connection-requests.ts:122-123`) while the requester waits.
- `sendMessage` resolution does not provably imply server persistence (`docs/jazz-api-notes.md:1182-1191` documents no ack semantics) — closing immediately after "sent" may strand the request locally. *(speculative)*
- Approved requests remain in `incomingRequests` forever (filter-only, `use-incoming-connection-requests.ts:118-124`); denied ones are removed (`invitations.ts:401-404`). Unbounded growth, minor.

**FM10 — Invitation proliferation.** New everyone-writer Invitation per `/contacts/add` mount + per TTL toggle (`add.tsx:59-74`); the `creationInProgressRef` guards only concurrent StrictMode double-invoke, not sequential visits.

## 3. Cross-cutting observations

- **CoList concurrent-append duplication is the systemic hazard.** `contactBook`, `incomingRequests`, `liveInvitations`, `dismissedRequestIDs` are all CoLists guarded only by local check-then-push; only `knownConversations` received the three-layer hardening (drain raw-ID dedup / startup self-heal / render belt). The round-2 spike's confirmed mechanism transfers verbatim to the other lists.
- **Two independent one-sided contact writes with different lifetimes.** Recipient writes on click; requester writes only via an ephemeral poll. No durable outbound-request record means no way to reconcile after the fact — the asymmetry is architectural, not a race.
- **StrictMode** (`src/main.tsx:34-46`) is dev-only; the drain hooks are correctly cancel-guarded (`use-incoming-connection-requests.ts:37-78`), so it is *not* a plausible production duplicate source.
- **Migrations** are append-only backfills (`ArcanAccount.ts:184-326`); no repair/reconciliation pass exists for contacts, requests, or duplicates. `contactBook` predates all schema churn — no migration gap explains a missing contact.
- **Threat-model constraint** for any auto-repair: `Contact.pinnedFingerprint` is TOFU (threat model §6). Reconciling a missing contact from conversation membership must source a fingerprint from somewhere — re-deriving it from the live account pubkey at repair time is a silent re-TOFU, weaker than pinning at request time.

## 4. Robustness options (sketches for brainstorming)

**FM1/FM8 (duplicate sends):**
- Durable `outgoingRequests` CoList in root keyed by `(recipientAccountID)`; confirm screen checks it + contactBook and renders "request pending / already contacts" states. Tradeoff: schema addition + backfill; also fixes FM3/FM4 (below).
- In-flight guard + phase check in `onConnect`; disable-and-track in the members kebab. Cheap, but only closes the double-tap window, not the reload/second-device window.
- Recipient-side collapse: key pending surfaces by `requesterAccountID` (show latest per requester). Masks rather than prevents; cheap belt.

**FM2 (drain-race duplicates):**
- Port the knownConversations three-layer fix to `incomingRequests` (raw-ID dedup in the drain, startup self-heal, render dedupe) — identical, proven pattern.
- Alternative: make `incomingRequests` a `co.record` keyed by request ID (CoMap same-key writes converge instead of duplicating). Tradeoff: schema migration; loses ordering (recoverable via `createdAt`).

**FM3/FM4 (missing requester-side contact):**
- App-level approval watcher: subscribe to each entry in a durable `outgoingRequests` list (mounted once like the inbox drains); on `approvedAt`, write the contact idempotently, then archive the entry. Fixes both channels and survives tab closure. This is the structural fix.
- Alternative/simpler: approval *push* — on approve, recipient sends an "approved" inbox message (they already have writer access on the request CoValue; an inbox notification mirrors the conversation pattern) that the requester's drain converts into a contact write. Tradeoff: new message type; still needs idempotent contact write.
- Reconciliation-on-read as backstop: 1:1 conversation rows/profiles with no matching contact offer (or auto-perform) "add to contacts" — fingerprint sourced live = TOFU tradeoff to flag explicitly.

**FM5/FM6:** likely keep as designed, but the UI could distinguish "non-contact conversation" explicitly — turns the surprising state into an intentional one; ties into the pending Bundle-F 1:1-vs-group model brainstorm.

**FM7 (duplicate contacts):**
- Make contact-write idempotent by key: `upsertContact(accountID)` helper used by *all three* writers (approve, invite poll, any future reconciler) that scans contactBook by `contactAccountID` before push — plus a startup self-heal + render dedupe for contactBook (same pattern as FM2). Fingerprint-mismatch on upsert should surface, not overwrite (TOFU).
- Longer-term: contactBook as `co.record(accountID → Contact)` — deterministic key kills the class. Migration cost highest.

**FM9/FM10:** decouple request TTL from invitation TTL (e.g. min 7 days from send); lazily create the invitation on first share/QR-reveal instead of on mount; periodic purge of approved entries in `incomingRequests`.

**Priority reading of the evidence:** FM3 (+FM4) is the highest-confidence explanation of "connected but contact missing"; FM1 and FM2 jointly cover "two connection requests" (FM1 = two real CoValues, FM2 = one CoValue shown twice — distinguishable in the field by whether approving one row clears both). FM7 is the silent downstream corruption both leave behind, and is currently invisible only because duplicate React keys happen to render tolerably.
