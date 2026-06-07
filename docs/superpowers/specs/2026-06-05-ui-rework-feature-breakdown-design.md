# UI-rework supporting features — breakdown & design

**Date:** 2026-06-05
**Status:** Design agreed; capturing for staged implementation. UI reference files are still
forthcoming — this doc deliberately separates *backbone work buildable now* from *surfaces blocked
on the UI refs*.

## Purpose

A major UI rework surfaced a rough list of ten features needed for it to work nicely. This document
clarifies what each one is, groups them into coherent **design units**, records the design decisions
we settled, and flags what must wait for the UI to land. Each unit gets its own focused
implementation plan later (via the writing-plans flow), built in the recommended sequence below.

The original rough list (for traceability):

1. New messages indicator in chat
2. Conversation icons
3. Conversation names
4. Static invite generation for adding people
5. New device approval — device information
6. Contact-adding recipient confirmation
7. Add contact from shared group (UI + feature)
8. Feedback button in settings (Message, optional Attachment / Email / Category)
9. Account QR code / invite valid duration
10. Better invite duration management in general

These collapse into **six design units**. Items 4, 6, 7, 9, 10 are one subsystem (Unit 1); item 5 is
its own trust surface (Unit 2); item 8 is standalone (Unit 3); items 1, 2, 3 are conversation display
(Unit 4). A fifth unit — a codebase-wide rebrand to the app's permanent name **Arcan** — surfaced
during brainstorming and is captured as Unit 5. A sixth unit — the hard cryptographic device
revocation (Shape 3 / per-device-account architecture) — was decided during brainstorming as the
next major slice after the rework lands; it is captured as Unit 6 here and tracked in detail as
**NOX-10** in Linear.

---

## Foundational baseline — destructive rebuild (applies to all six units)

**There is no pre-existing user data to preserve across this rework.** The current deployed state
is wiped as part of this work. No unit plans migrations, dual-accept transitions, lazy
backfills, or backwards-compatible identifier shims. Where a unit's design previously hedged on
backward compatibility, the answer collapses to "no constraint — just change it."

Concrete consequences this baseline produces, called out in each unit where relevant:

- **Unit 1** (connection subsystem) — existing `Invitation` CoValues are wiped; the new schema
  doesn't have to coexist with the old `everyone-writer` invite group pattern.
- **Unit 2** (device pairing approval) — the new optional fields on `EphemeralPairing` and
  `DeviceRecord` don't need to gracefully handle pre-rework records (there aren't any).
- **Unit 3** (feedback + `api` rename) — the `auth-server` SQLite is wiped; no Better Auth user
  rows to migrate.
- **Unit 4** (conversation display) — no legacy `Conversation.title` data to fall back to; new
  conventions apply unconditionally.
- **Unit 5** (rebrand) — the `JazzMessangerAccount` → `ArcanAccount` rename, recovery-HMAC purpose
  string change, and Better Auth wipe all happen outright.
- **Unit 6** (Shape 3 revocation) — no existing shared-account-secret accounts to migrate; the
  per-device-account architecture is the only architecture from day one of the rebuild.

This baseline is the reason several units can be scoped down compared to where the spec started.

---

## Unit 1 — Connection subsystem rework

*Absorbs original items #4, #6, #7, #9, #10. The largest unit.*

### Model

One **pending-request pipeline**, three entry channels, a **universal approval gate**, time-bounded
with no stray long-lived invites. A `ConnectionRequest` is delivered as a new **Inbox** message type
alongside the existing conversation-notification type. The Inbox primitive already exists and already
delivers to accounts you don't share a group with (`InboxSender.load(accountID, me)` +
`createInboxMessage`, see `src/jazz/conversation.ts:151-166`). All three channels ride this same
backbone.

**Core invariant:** no `Contact` is written on either side until the recipient explicitly approves.
The approver is always the **non-initiator**; the initiator has already consented through their action
(scanning, opening a link, or tapping "request").

### Three entry channels

1. **In-person QR — directional.** One person shows a QR, the other scans it. Scanning lands a
   pending request on the *shower's* device; the shower taps approve. One-way per scan; approving
   writes both sides as contacts. Fast (one tap) while keeping the single approval gate intact.

2. **Async link — multi-use, revocable.** One link works for many people until its (capped) TTL
   expires or it is revoked — the "static/reusable" link from item #4. Safe because every open still
   hits the approval gate: a leaked link can only ever *produce a request you can reject*, never a
   silent contact-list entry.
   - **Duration policy:** preset choices only — **1 hour / 24 hours / 7 days**; default **24h**;
     **hard cap 7 days**. No free-form field (the cap is a guardrail by construction).
   - **Expiry is enforced** on the accept path. (Today expiry is *stored but not checked* — a real
     gap, `src/jazz/invitations.ts`.)

3. **Group connection request.** From a group's member list you can already see co-members
   (account ID + profile + fingerprint, via the shared group). Tap a co-member → **Request
   connection** → mint a `ConnectionRequest` carrying your identity plus a trust hint
   ("you're both in [Group Name]") and deliver it to **their** inbox. 1:1 delivery — only the two
   parties see it, **not** the whole group. This is item #7; it is not a special case, just the
   group-channel feed into the universal gate.

### Approval & confirmation

- **Requester-side confirmation screen** (QR + link channels): before the request is sent, the
  requester sees the inviter's **profile (name, avatar, fingerprint)** loaded from the invite, with
  Connect / Cancel. **Skipped for the group channel** (the requester tapped a member whose profile was
  already in front of them). This is item #6, made symmetric — both parties see who they're connecting
  to; the recipient still holds the gate.
- **Approval surfaces** (the non-initiator):
  - A persistent **"Pending connections" list** — single source of truth, badged; act whenever.
    Also hosts outgoing requests and the live-invites management surface (item #10).
  - A **live in-app notification** when online with the app open (reuse the existing notification
    mechanism). For the **in-person QR** case specifically, an **immediate modal**, because both
    people are physically present waiting on the one tap.
- **On approve:** write the requester as a `Contact` (TOFU-pin their fingerprint) **and** fire a
  return "approved" inbox message so the requester's client writes the approver as a `Contact` too.
  One tap for the user; two messages under the hood. Mirrors today's mutual-append in
  `src/jazz/invitations.ts`. Reject/ignore → nothing written.

### Eventual-consistency decision

The sync lag is **accepted** (no optimistic pre-write of a pending-contact state). On approve, the
requester is the approver's contact immediately; the approver becomes the requester's contact once the
requester's client next syncs and processes the return ack. For in-person QR this is instant.

**Acceptance test (must not regress):** a conversation created between the two new contacts *while the
requester was offline* is correctly detected once the requester comes back online. This already holds
because conversation-creation notifications are durable inbox messages
(`src/jazz/conversation.ts:151`) that queue and are picked up by the inbox subscription into
`me.root.knownConversations` on next sync — but it must be covered by a test so the rework can't
silently break it.

### Management surface (item #10)

The Pending-connections / invites screen shows each live invite link with **time remaining**, a
**revoke** action, and a **regenerate** action (for an expired-but-still-wanted link). All invites
revocable; expiry enforced; pending incoming/outgoing requests visible and dismissible.

### UI-dependency

Backbone (`ConnectionRequest`, the three channels, the approval gate, duration policy, enforcement,
return-ack, acceptance test) is **buildable and testable headless now**. The user-facing surfaces —
QR display, requester confirmation screen, pending/invite lists, the live approval modal — need the
UI refs.

---

## Unit 2 — Device pairing approval gate

*Original item #5.*

Today pairing (`src/jazz/pairing.ts`) transfers the **account secret** through the QR sealed-box
handshake — `wrapAccountSecretForResponder` runs the moment the responder writes `responderPubkey`,
so by the time a new device registers it already has full access; an approval tapped afterward would
be cosmetic. We change the **gating of the existing QR flow** (no new async path is introduced):
secrets never seal/transfer until an already-trusted device approves.

### Three-phase handshake

1. **Present.** The new (blank) device generates its ephemeral keypair and writes to the existing
   `EphemeralPairing` rendezvous: `responderPubkey` (as today) **plus** new device-info fields
   (below). Crucially, this no longer triggers any secret transfer on the initiator side.
2. **Approve.** An already-trusted device (the QR-shower, or any other device already logged into the
   same account — since the `EphemeralPairing` CoValue is account-scoped, all logged-in trusted
   devices see it) sees an **enriched approval card** and taps Approve or Reject.
3. **Transfer.** Only on approve is the account secret sealed to the new device's ephemeral pubkey
   and written to `wrappedAccountSecret` via the existing `wrapAccountSecretForResponder`. The new
   device picks it up, unseals, and authenticates as today. **Scanning alone no longer transfers
   anything.**

### Schema additions to `EphemeralPairing`

Per the destructive baseline, there are no in-flight pre-rework pairings to coexist with — the
fields could just as well be required. They're declared optional only because they're written by
different actors at different lifecycle phases (responder writes some on present, trusted device
writes others on approve), so the CoMap is in a partial state between phases:

- **`responderUserAgent: string`** — raw `navigator.userAgent` from the new device. Label + OS are
  derived client-side on the trusted device (label via the existing `deriveDeviceLabel`; a simple OS
  extractor: Windows / macOS / Linux / Android / iOS / Unknown). Keeps schema small; rendering logic
  colocated on the trusted side.
- **`responderFirstSeenAt: date`** — `Date.now()` at the moment the responder writes its present.
  Local clock; rendered as a relative time on the card.
- **`responderFingerprint: string`** — **SHA-256(`responderPubkey` hex), first 8 hex chars**. The
  **same value is rendered on both devices**: the new device's "Waiting for approval…" screen and
  the trusted device's approval card. The user verifies the two match by eye — a physical-presence
  check (8 hex = 32 bits, sufficient for in-person verification). Cryptographically bound to the
  handshake's ephemeral key, so a swap would change it.
- **`approvedAt: date`** — written by the trusted device on approve, **before** writing
  `wrappedAccountSecret`. State/audit only; the responder reacts to `wrappedAccountSecret`'s
  presence, not to this field.
- **`rejectedAt: date`** — written by the trusted device on reject, alongside tombstoning
  (`expiresAt = now`). Lets the responder distinguish **Rejected** from **Timed out** in its UI.

### Approval card fields (rendered from the schema)

- **Label** — derived from `responderUserAgent` via `deriveDeviceLabel` (e.g. "Firefox browser").
- **OS** — derived from `responderUserAgent` (Windows / macOS / Linux / Android / iOS / Unknown).
- **First-seen** — relative time from `responderFirstSeenAt` ("just now", "1 minute ago").
- **Fingerprint** — `responderFingerprint`, shown verbatim. Same value the new device displays.

### Responder-side state machine

The responder subscribes to the `EphemeralPairing` and renders one of four states based on field
presence:

| State | Trigger |
|---|---|
| Presenting | `responderPubkey` written, nothing else from the trusted side yet → "Waiting for approval on the original device. Fingerprint: `A1B2C3D4`" (example value — the actual 8 hex chars derived from the responder's ephemeral pubkey) |
| Approved & transferring | `wrappedAccountSecret` set → unseal, authenticate, register device (existing `claimAccountFromPairing` path) |
| Rejected | `rejectedAt` set → "The request was rejected on the original device." |
| Timed out | `expiresAt` passed without `wrappedAccountSecret` or `rejectedAt` → "The request timed out — try again." |

### Trusted-side approve / reject actions

- **Approve:** write `approvedAt`, then call the existing `wrapAccountSecretForResponder` (which
  seals and writes `wrappedAccountSecret`). Two writes; the responder only acts on the second.
- **Reject:** write `rejectedAt`, then set `expiresAt = now` (tombstone via the existing
  `tombstonePairing`).

### Race semantics

- **Multiple trusted devices simultaneously approve:** any can approve; CoJSON last-write-wins makes
  the race benign — `wrappedAccountSecret` ends up with one valid sealed payload either way. This is
  a useful property, not a bug: if you scan from your laptop while holding your phone, both surfaces
  show the prompt and either tap completes the flow.
- **Responder disconnects after presenting:** trusted device may still approve; the responder picks
  up `wrappedAccountSecret` on reconnect. Local-first behavior; no special handling required.
- **Two responders scan the same QR** (edge case): `responderPubkey` is a single field — the second
  scan overwrites the first. Same characteristic as today's implementation; not blocking, may be
  addressed later (e.g. by rejecting writes after first present).

### Timeout

Reuse the existing `EphemeralPairing.expiresAt` (currently **10 minutes** in
`createPairingInvite`). The approval gate lives inside that window; no separate approval clock.

### Trust-signal value of approximate location — **deferred from v1**

Approximate location is derived from the device's source IP. IP is *transport* metadata the server
sees in plaintext on every TLS/WebSocket connection — it is not protected by payload E2EE because
the server has to see it to route packets. As a security signal it is **weak and spoofable** (VPN /
same-region attacker / a lying server), risking **false confidence** precisely in the scenario where
a user would rely on it to spot an intruder. The real protection is the out-of-band QR presentation
+ explicit approve on an already-trusted device. Defer.

### Interim revocation UX honesty (small piggyback scope)

Real cryptographic revocation is **not** part of Unit 2 — it is tracked as a separate slice in
Linear (**NOX-10 · "Hard device revocation via per-device-account architecture (Shape 3)"**, High
priority, sequenced to land immediately after the UI rework). Today's "Revoke" button is purely a
UI filter on `DeviceRecord.revoked`; the revoked device retains the `AgentSecret` and full read/write
access. Shipping the new Unit 2 approval gate without touching this label would compound the
misleading-reassurance problem (a clearer approval-on-add UX with no real revoke-after-the-fact).

Since Unit 2 is already touching the device-list area's UI, we piggyback two small honesty fixes:

- **Rename the button** from "Revoke" to **"Forget this device"** (or equivalent — the UI refs may
  refine the exact label). The action still flips `DeviceRecord.revoked = true`; the new label
  accurately describes what it does.
- **Add a one-paragraph explainer** under the device list: *"Forgetting a device hides it here, but
  it can still read everything it has already synced. Full cryptographic revocation lands in the
  upcoming overhaul — see NOX-10."* Wording can be tightened during UI work.

These are minor copy + a small UI block; no schema or protocol change. They get retired/replaced
when NOX-10 ships its real `removeMember`-backed revocation.

### Scope of changes

- `src/jazz/schema/EphemeralPairing.ts` — add the five optional fields above.
- `src/jazz/pairing.ts` — split the trusted-side flow into `approvePairing()` and `rejectPairing()`
  helpers; current `wrapAccountSecretForResponder` becomes called from `approvePairing` (not by an
  automatic effect on `responderPubkey` change).
- New trusted-side subscription/watcher to surface pending approvals across all logged-in trusted
  devices.
- Responder-side state-machine rendering.
- `src/routes/settings/devices-section.tsx` — relabel the revoke button to "Forget this device"
  (or equivalent); add the honesty explainer block under the device list.
- Update pairing tests to cover the gate, reject, and timeout paths.

### UI-dependency

Buildable headless now: schema additions, the approve/reject helpers, the watcher, the responder
state machine, and updated tests. **Needs UI refs:** the approval card, the new device's "Waiting…"
screen, and surfacing the prompt to other already-logged-in trusted devices.

---

## Unit 3 — Feedback + backend service rename

*Original item #8. The cleanest build-now unit — almost no UI dependency.*

### Decision: proxy through our own backend → Linear

Feedback must leave the local-first system to reach the maintainer. Sending directly to Linear or
email from the client would ship an API token in the browser bundle — unacceptable. We already run a
**Hono backend** (currently `auth-server/`, port 4300, behind Caddy, env-based secrets, rate limiting,
SQLite, docker-compose) — a natural home for a proxy endpoint. The client `POST`s feedback; the Linear
token lives **only** server-side. This satisfies "no client token" and "no in-app triage" (feedback
lands as triageable Linear issues in the project we already manage).

### Service rename

The backend has outgrown "auth," so rename `auth-server/` → **`api`** (it serves the `/api/*` paths;
no collisions — there is no existing `api/` dir or `api` script today). Touches: the directory, the
two dev scripts (`scripts/auth-server.sh`), the `npm run auth` script, `deploy/Dockerfile.auth`, the
`auth` compose service in `deploy/docker-compose.yml`, and the Caddy route. URL paths stay
`/api/auth/*` and gain `/api/feedback`.

The renamed package becomes **`@arcan/api`** (npm scope decided in Unit 5; replaces
`@jazz-messanger/auth-server`). This rename and Unit 5's full brand pass are executed as a **single
coordinated pass** — see Unit 5 for the combined touch-list — so each affected file is edited once.

### Endpoint

`POST /api/feedback` on the `api` service. Token server-side; reuse the existing Caddy routing, rate
limiting, and deploy.

**Access control (authenticated + rate-limited):** require a valid Better Auth session (the `api`
service already issues/validates these). Feedback is an in-app action by a signed-in user, so this
naturally rate-limits per account and blocks drive-by spam against the tracker. Additionally apply a
per-account/IP cap (belt-and-suspenders) on top of the existing IP-based limiter.

**Submitter email — extracted server-side:** because the request carries a valid session, the `api`
service looks up the submitter's **verified account email from its own user table** and attaches it to
the issue as metadata for potential follow-up. The client never sends an email; it's the verified
account email, not a typed-in value (spoof-proof). Consequently the **optional Email form field is
dropped** — it would be redundant and ambiguous.

**Form fields:** **Message** (required); **Category** (optional dropdown → **Bug / Improvement /
Feature**, reusing the existing Nox team labels 1:1); **Attachments** (optional, **any file type**,
**multiple files, ≤10 MB total**). No email field.

**Attachment pipeline:** client uploads files to `POST /api/feedback` as multipart; the `api` service
validates the **combined size ≤10 MB** (any MIME type allowed), then uploads each to Linear via
Linear's attachment-upload flow and links them to the created issue. Upload token/credentials stay
server-side. (Note: "any file type" makes the endpoint a small authenticated file relay — acceptable
because it's session-gated and capped; the size limit is the primary abuse guard.)

**Sink — Linear:** creates an issue in **team=Nox / project=Arcan**. The project was renamed from
"jazz-messanger" to "Arcan" on 2026-06-05 (ID `79d46a12-7563-4e3c-833b-d49531d94bb1` unchanged); URL
`https://linear.app/nox-decima/project/arcan-c718904b5ef5`. **Arcan is now the single destination for
all issues** — both user feedback and followup-tracking (the split was rejected). Each feedback issue
gets the **`Feedback`** label (created 2026-06-05, id `e4c59d7f-2ebb-4ea0-bc37-f4e863b5a694`) plus the
optional Category label. Issue title: derive from the first line / first ~60 chars of the message
(prefixed e.g. `[Feedback]`); body carries the full message, the verified submitter email, and
category.

### UI-dependency

Rename + endpoint + Linear wiring buildable now; only the settings form needs the UI refs.

---

## Unit 4 — Conversation display

*Original items #1, #2, #3.*

### Enforcement model — app-layer, by deliberate choice (consistent with current precedent)

**Decision:** title and icon are admin-only **at the application layer** (the edit affordance only
appears for admins; non-admin attempts are rejected by the UI). They live **directly on the
`Conversation` CoMap**, not in a sub-CoMap. A determined non-admin with developer tools could
technically rename or change the icon by calling `$jazz.set` directly — that is an accepted gap.

**Why:** the existing `src/jazz/schema/SystemEvent.ts` docstring explicitly establishes this
precedent for trust-circle UX features:

> "The log is application-level: a determined actor calling cojson directly could change membership
> without writing an event. This is consistent with the trust-circle threat model — the log is for
> UX clarity, not security."

The same reasoning applies to title and icon: in a small trust circle, every group member can
already spam messages and (today) write SystemEvents however they like; renaming the conversation
is within the same envelope of "things a determined misbehaving member could do." Promoting just
title/icon to cojson-level enforcement would be inconsistent with that precedent without
addressing the broader pattern.

**Future hardening — explicitly deferred.** A separate follow-up task captures the eventual
secure-by-design refactor that would promote these (and the SystemEvent invariants, and message-list
push rights) to data-layer enforcement together. That belongs as one coordinated pass after the UI
rework lands, not piecemeal here.

### #2 — Conversation icons

Add `icon` directly to `Conversation` (a new optional field). For **group conversations**; 1:1s
keep borrowing the contact's avatar (unchanged). Set/cleared by any admin (app-layer gated).

**Constraints:**

- **Types:** image only — PNG, JPEG, WebP.
- **Size:** raw upload ≤ 5 MB; resized client-side to 256×256 before storing. Reuse the image
  storage path used for profile avatars (Slice 5 — inline media).
- Clearing reverts to the monogram fallback.

**Monogram fallback (when unset):** the first 1–2 graphemes of the resolved display title,
rendered over a deterministic background color computed from a hash of the conversation ID — so the
same conversation gets the same color across devices and reloads.

Icon changes do **not** emit a `SystemEvent` (kept minimal — title rename does, see below).

### #3 — Conversation names

`Conversation.title` already exists; the existing `updateConversationTitle` (`conversation.ts:501`)
already does `conversation.$jazz.set("title", newTitle)`. The change here is:

- **Show the edit affordance only to admins** in the UI (the existing function's comment already
  notes "The caller is responsible for admin-permission gating in the UI" — we just make that
  contract real on the new title-edit surface).
- **Emit a `SystemEvent`** when a rename actually happens, so the timeline shows "Alice renamed
  the group."

**Constraints:**

- 1–100 characters after trimming.
- Cannot be all-whitespace (treated as "clear", which reverts to derived label).
- Concurrent renames: CoJSON last-write-wins on `title`. The rename `SystemEvent` log is not a
  serialization mechanism (same disclaimer as existing events).

**`SystemEvent` schema addition:** extend the `kind` enum with **`renamed`**, and add an optional
`newTitle: z.string()` field. The actor (admin doing the rename) writes the event into the
conversation's `systemEvents` list with `kind="renamed"`, `actorAccountID`, `occurredAt`, and
`newTitle`. `targetAccountID` is omitted for renames.

### #1 — New-messages indicator (in-conversation unread divider)

A "↓ new messages" divider rendered at the first unread message. The backend already has
`lastReadAt`; the divider is **pure render — fully UI-blocked, defer to the UI refs.**

**Divider semantics (locked now, so the UI work knows what to render against):**

- **Anchor:** capture `lastReadAt[conv]` into a React ref at the moment the conversation detail view
  **mounts**; do not update the anchor while the view is open. (Pairs with the read-semantics change
  below: since `lastReadAt` no longer advances on open, the anchor stays put for the whole reading
  session.)
- **Render:** above the first message whose `sentAt > anchoredLastReadAt`.
- **Excluded from the calculation:** self-authored messages and `SystemEvent`s — mirrors how
  `getUnreadCount` in `src/jazz/notifications.ts` already excludes them.
- **No unread on open** → no divider.
- **All unread on open** (e.g. brand-new conversation) → divider at top.
- **New messages arriving while viewing** appear below the divider; the divider does not move and
  no new divider is inserted.
- **Auto-scroll on mount:** if any unread on open, scroll to the divider so the user lands at the
  read/unread boundary. (UI execution detail, but specified here for consistency.)

### Read semantics change (buildable now)

Today the app marks a conversation read **on open**
(`src/routes/conversations/detail.tsx:82-102` — marks on mount when visible, re-marks on tab
refocus). **New rule: do not mark read on open.** `lastReadAt[conv]` advances only on:

- **Send.** After a message append succeeds, set
  `lastReadAt[conv] = max(currentLastReadAt, now)`. Sending implies caught up.
- **Leave.** Set `lastReadAt[conv] = max(currentLastReadAt, latestRenderedMessageSentAt + 1)`
  where `latestRenderedMessageSentAt` is captured at the moment of leaving. **Note: `now` is
  intentionally NOT used here** — if you open a chat and abandon without reading new arrivals,
  unread should reflect what you actually rendered, not the wall-clock time you left.

**Concrete "leave" triggers** — any one fires the mark-read:

1. Route change away from the conversation-detail route (react-router cleanup effect).
2. `visibilitychange` to `hidden` while still on the conversation route (tab backgrounded /
   minimized / device locked).
3. `beforeunload` (best-effort — may not land on hard crashes).

If the leave write doesn't land (crash, force-quit), the conversation stays unread next session.
Acceptable per local-first; no special recovery needed.

### Active-conversation suppression (consequence of the new read semantics)

Under the new rule, the conversation you're actively viewing accumulates "unread" between its
mount-anchor and any new arrivals, because `lastReadAt` doesn't advance until leave. Three
surfaces must suppress for the active conversation to avoid lying to the user:

| Surface | Suppression rule |
|---|---|
| **Sidebar badge** | Hide the unread badge on the row matching the current active conversation route. |
| **Tab title badge** | When summing total unread for the title, exclude the active conversation's contribution. |
| **In-app notification toasts** | Skip toast firing when the new message's conversation matches the active route. |

All three are driven by the same primitive — "is this the active conversation right now?" — read
from react-router params. Implementation lives in the notification trigger and the sidebar / tab-title
hooks.

### Scope of changes (Unit 4)

- `src/jazz/schema/Conversation.ts` — add optional `icon: FileBlob.optional()` field, mirroring
  the avatar pattern on `Profile` (`src/jazz/schema/Profile.ts:19`); keep existing `title` field.
- `src/jazz/schema/SystemEvent.ts` — extend `kind` enum with `renamed`, add optional `newTitle`.
- `src/jazz/conversation.ts` — `updateConversationTitle` writes the `renamed` SystemEvent in
  addition to setting the title; add `updateConversationIcon` (no SystemEvent). The
  admin-permission check stays in callers (UI); no schema-side gating change.
- `src/routes/conversations/detail.tsx` — replace mount-mark-read with leave/send mark-read,
  capture leaving message-sentAt.
- Sidebar, `useTabTitleBadge`, notification trigger — add active-conversation suppression.
- Display-title resolver — `conversation.title` if set, else derived label (no metadata fallback —
  no metadata CoMap exists).
- Tests — read-semantics change (mount no longer writes; leave/send do); rename SystemEvent
  emission; UI gating (the affordance only renders for admins).

### UI-dependency

**Buildable now:** the schema additions (`Conversation.icon`, SystemEvent `renamed`), the
`updateConversationTitle` + new `updateConversationIcon` mutations with SystemEvent emission, the
read-semantics change including leave/send triggers and active-conversation suppression, and tests
for all of the above.

**Needs UI refs:** the #1 divider rendering itself, the title-edit affordance and icon upload
affordance (admin-gated *in the UI*), the monogram fallback rendering, and the rename-event
timeline rendering.

### Known accepted gap

Title/icon admin-only is **app-layer only** — a determined non-admin with developer tools could
write either field directly via cojson. Captured as a follow-up to be hardened together with the
broader trust-circle data-layer pass (SystemEvent invariants, message-list push rights). Consistent
with the existing `SystemEvent.ts` precedent.

---

## Unit 5 — Rebrand jazz-messanger → Arcan

*Surfaced during this brainstorming; not in the original ten-item list.*

The app now has a permanent name, **Arcan**, replacing the temporary "jazz-messanger". This unit is a
codebase-wide rename pass.

### Decisions made (2026-06-06)

(Per the doc-wide destructive baseline above, all internal identifiers that would otherwise be
load-bearing are safe to rename outright — no migration planning required.)

| # | Topic | Decision |
|---|---|---|
| 1 | Recovery-proof HMAC purpose string (`"jazz-messanger:recovery-reset"` in `src/auth/recovery-proof.ts:4` and `auth-server/src/plugin.ts:28`) | **Change** to `"arcan:recovery-reset"`. No migration; old proofs invalidated alongside the wipe. |
| 2 | `JazzMessangerAccount` CoValue schema (file `src/jazz/schema/JazzMessangerAccount.ts`, two exported symbols, 14+ importing files) | **Rename to `ArcanAccount` / `ArcanAccountRoot`**. **Probe first** (see "Implementation gate" below) to confirm jazz-tools 0.20.18's storage layer doesn't encode the schema name in a way that makes the rename break future stored data even though current data is wiped. The probe is a knowledge gate, not a migration gate. |
| 3 | Casing of the renamed schema | `ArcanAccount` (PascalCase brand, mirrors the existing `JazzMessangerAccount` pattern). |
| 4 | npm package naming (couples Units 3 + 5) | Root `package.json` `name`: **`arcan`**. The renamed Unit-3 service package: **`@arcan/api`** (replaces `@jazz-messanger/auth-server`). |
| 5 | PWA manifest | **Add a `manifest.webmanifest`** as part of this unit. No manifest exists today (`public/` has only `favicon.svg`, `icons.svg`, `notification.mp3`); the rebrand is the natural moment to introduce one with proper `name` / `short_name` / `description` / `theme_color` / icons. Wire it up via a `<link rel="manifest">` in `index.html`. |
| 6 | Historical slice specs and plans (`docs/superpowers/specs/2026-05-15-jazz-messanger-design.md` and friends, `docs/superpowers/plans/*.md`) | **Leave files frozen** as historical artifacts (filename and content reflect the project's name at the time). Add a **top-of-doc note** to each pointing at the rename: *"This document was written when the project was named jazz-messanger. The project was renamed to Arcan on 2026-06-05; see Unit 5 of `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md`."* No other edits to those files. |
| 7 | `CHANGELOG.md` historical entries | **Leave verbatim.** Conventional practice; entries describe past state. |
| 8 | Repo / workspace directory + GitHub remote | **Rename both.** Local: `/home/nox/Documents/Projects/Nox/jazz-messanger/` → `/home/nox/Documents/Projects/Nox/arcan/`. GitHub: the user will rename the remote manually — the implementation plan must flag this point so they can do it at the right moment (and the remote URL in `.git/config` then needs updating client-side). |
| 9 | Coordination with Unit 3 (`auth-server → api` service rename) | **Single coordinated pass.** Both touch `auth-server/package.json`, `Dockerfile.auth`, `scripts/auth-server.sh`, the `auth` compose service, and the Caddy route — doing them as two separate sweeps would mean editing the same files twice. The rename pass touches each of those files exactly once: directory `auth-server/` → `api/`, package `@jazz-messanger/auth-server` → `@arcan/api`, all in one go. |
| 10 | Sequencing relative to the UI rework | Flexible because there's no migration cost. Default proposal: **land Unit 3 + Unit 5 together before the heaviest UI-rework string work**, so new UI copy is written with "Arcan" from day one and doesn't need a second sweep. |

### Inventory of references (categorized)

**A · Pure cosmetic strings (mechanical swap):**
- `index.html:7` — `<title>Jazz Messanger</title>`
- `src/routes/onboarding/welcome-step.tsx:25` — "Welcome to Jazz Messanger"
- `src/routes/auth/login.tsx:54` — "Welcome back to Jazz Messanger."
- `src/components/notification-manager.tsx:109` — `new Notification("Jazz Messanger", ...)`
- `src/hooks/useTabTitleBadge.ts:11` — default `baseTitle = "Jazz Messanger"`
- Tests with literal strings: `tests/e2e/account-creation.spec.ts:23`, `tests/e2e/tab-title-badge.spec.ts`, `tests/unit/hooks/useTabTitleBadge.test.ts` (~10 literals).

**B · Repo / project naming:**
- `package.json:2` `"name"` → `"arcan"`.
- `auth-server/package.json:2` `"name"` → `"@arcan/api"` (combined with the Unit 3 service rename, see #9).
- `shell.nix:1, 31, 60` — nix shell name + comments + echo.
- `scripts/dev-all.sh:95` — banner.

**C · Documentation:**
- `README.md` — top title + design-spec reference. (Linear URL already fixed.)
- `deploy/README.md:1, 18, 19` — title + clone instructions.
- `CLAUDE.md:1, 9, 36` — title, design-spec reference, schema-filename example. (Linear destination already fixed.)
- Historical specs/plans get top-of-doc notes only, per #6.

**D · Load-bearing internal identifiers (all safe to change outright per the destructive premise):**
- `JazzMessangerAccount` schema (file + two exported symbols + 14+ importers) → `ArcanAccount` / `ArcanAccountRoot`. Gated on the probe.
- Recovery HMAC purpose string in both client and server.
- Better Auth — quick audit to confirm no embedded brand strings; expected to be a no-op.

**E · New artifact:**
- `public/manifest.webmanifest` + `<link rel="manifest">` wiring in `index.html`.

### Implementation gate — schema-rename probe (must run before the rename pass)

Before renaming `JazzMessangerAccount` → `ArcanAccount`, run a small probe to confirm:

- A CoValue created under one schema **export name** is not encoded with that name in a way that
  prevents reading it back after a rename.
- Concretely: create an account under `JazzMessangerAccount`, rename the symbol/file to
  `ArcanAccount` (no behavioural change), reload, verify the account still loads correctly.

The destructive wipe means this isn't a *migration* concern — but knowing whether the rename is
clean affects future renames too. If the probe shows the schema name IS load-bearing, document that
characteristic for posterity; the immediate rename still proceeds (with the wipe).

### Coordinated touch-list (Units 3 + 5 combined pass)

Each file touched exactly once:

- `auth-server/` directory → `api/`
- `auth-server/package.json` → `api/package.json` with `"name": "@arcan/api"`
- `deploy/Dockerfile.auth` → `deploy/Dockerfile.api`
- `scripts/auth-server.sh` → `scripts/api.sh`
- `package.json` root: `"name": "arcan"`; script `"auth": "./scripts/auth-server.sh"` → `"api": "./scripts/api.sh"`
- `deploy/docker-compose.yml`: service `auth` → `api`; build context `auth-server` → `api`; `Dockerfile.auth` → `Dockerfile.api`
- `deploy/Caddyfile`: `reverse_proxy auth:4300` → `reverse_proxy api:4300`
- All `BETTER_AUTH_URL` paths stay `/api/auth/*` (URL paths are unaffected by the service rename — only the internal hostname changes)

### Out of scope for Unit 5

- Old historical doc filenames are not changed (decision #6).
- CHANGELOG entries are not rewritten (decision #7).
- The probe is part of this unit's implementation plan, but its *result* is documentation-only;
  it does not block the rename.

### Already done (2026-06-05/06)

- Linear project renamed jazz-messanger → Arcan; `CLAUDE.md` and assistant memory updated.
- `README.md` Linear destination updated to the Arcan URL.

### Needs its own implementation plan

This spec settles the *decisions*. The implementation plan still needs sequencing of touch points
(probe first, then schema rename, then service+package rename, then string sweep, then PWA
manifest, then directory + GitHub-remote rename ceremony), and a checklist for the GitHub-remote
manual step that the user will perform.

---

## Unit 6 — Hard device revocation (Shape 3 / per-device-account architecture)

*Promoted into a spec unit during this brainstorming; full design lives in Linear as **NOX-10**
(High priority).*

### Summary

Replace the current "the account secret is shared across devices" model with **one Account per
device**, all members of a shared **`UserGroup`**. The user identity becomes the group; each
device is a cryptographically-distinct member.

- **Pair** a device → create a fresh per-device `Account` on the new device (no secret transfer);
  the trusted device admins it into the `UserGroup`. Composes with Unit 2's approval gate, which
  now gates *admission into the UserGroup* rather than *secret sealing*.
- **Revoke** a device → `UserGroup.removeMember(deviceAccount)`. Jazz auto-rotates the readKey on
  member removal (the same primitive §6 already uses for conversation member removal). The revoked
  device cannot decrypt content authored after revocation.
- **Forward-rotation only** — the revoked device retains read access to content it already synced,
  same documented property as §6.4.

### Why this is a separate unit

Hard revocation is a foundational architectural change that touches every place currently rooted on
"the account" (account secret, schemas keyed on `me`, author derivation, all pairing flows). Doing
it concurrently with the UI rework would mean the UI is built against a moving target. Doing it
later means shipping the rework with a Unit-2 approval gate but no real revoke-after-the-fact —
which is why Unit 2 includes the interim "Forget this device" relabel + honesty explainer
(see Unit 2 → "Interim revocation UX honesty").

### Sequencing

**Land immediately after the five UI-rework units complete**, before any public launch. This is
the user-set sequencing: rework first, then this slice. Per the doc-wide destructive baseline,
there are no shared-secret accounts to migrate — the rebuilt system uses Shape 3 from day one of
Unit 6's implementation.

### Pointer to detail

Full architectural detail, scope sketch, migration-options discussion, and references live in
Linear: **NOX-10 — "Hard device revocation via per-device-account architecture (Shape 3)"**
(<https://linear.app/nox-decima/issue/NOX-10/hard-device-revocation-via-per-device-account-architecture-shape-3>).
That issue is the single source of truth for Unit 6's design; this spec section exists so the
six-unit picture is captured in one place and so the cross-unit interactions (especially Unit 2's
interim UX) are honest.

### UI-dependency

**Buildable backbone:** all schema and protocol work (UserGroup, per-device Account, pairing
rewrite, real `removeMember`-backed revoke). **Needs UI refs:** updates to the Settings → Devices
screen so the relabeled-and-honest UX from Unit 2 ("Forget this device") gets replaced by the real
revocation flow.

---

## UI-dependency & sequencing summary

| Unit | Backbone buildable now (headless + tested) | Needs UI refs for |
|------|---|---|
| 1 · Connection subsystem | ✅ `ConnectionRequest`, three channels, approval gate, duration policy, expiry enforcement, return-ack, offline-conversation acceptance test | QR display, requester confirmation screen, pending/invite lists, live approval modal |
| 2 · Device pairing approval | ✅ schema additions, approve/reject helpers, trusted-side watcher, responder state machine, devices-section button relabel + honesty explainer copy, updated tests | approval card, new-device "Waiting…" screen, exact wording / placement of the explainer block |
| 3 · Feedback + `api` rename | ✅ rename, `POST /api/feedback`, Linear wiring | settings feedback form |
| 4 · Conversation display | ✅ `Conversation.icon` field, SystemEvent `renamed`, `updateConversationTitle`/`updateConversationIcon` mutations + rename-event emission, read-semantics change (leave/send), active-conversation suppression (sidebar/tab/toast) | #1 divider rendering, title-edit & icon-upload affordances (admin-gated in UI), monogram fallback rendering, rename-event timeline |
| 5 · Rebrand → Arcan | ✅ destructive rebrand (no migrations); schema-rename probe, `JazzMessangerAccount` → `ArcanAccount`, recovery HMAC purpose string, package names (`arcan` root / `@arcan/api` service — coordinated with Unit 3), PWA manifest, cosmetic strings, top-of-doc notes on historical specs/plans, repo-dir + GitHub-remote rename ceremony (manual GH step flagged for the user) | nothing — but new UI copy should be authored as "Arcan" from day one to avoid a second sweep |
| 6 · Hard revocation (Shape 3) | ✅ all schema/protocol work — UserGroup, per-device Account, pairing rewrite, real `removeMember`-backed revoke. Lands **after** Units 1–5 complete (NOX-10) | Settings → Devices revocation flow replaces the Unit-2 interim "Forget this device" honesty UX with the real action |

**Recommended order:** **Units 3 + 5 coordinated first** (cleanest, almost no UI dependency, share
deploy/config files so the combined pass touches each once). Then the headless backbones of Units 1,
2, and 4's read-semantics/schema in parallel with the UI work, filling in each visual surface once
the refs land. **#1's divider is the one piece deferred entirely to UI time.** **Unit 6 (Shape 3
hard revocation) follows the five UI-rework units** as its own slice, sequenced before any public
launch.

## Housekeeping note (not part of this work)

The `Status` section in the repo `CLAUDE.md` is stale — it states Slice 3 is "not yet started," but
Slices 3–8 are merged. Worth correcting separately so future sessions work from reality.
