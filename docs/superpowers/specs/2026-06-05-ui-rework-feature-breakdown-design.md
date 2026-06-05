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

These collapse into **five design units**. Items 4, 6, 7, 9, 10 are one subsystem (Unit 1); item 5 is
its own trust surface (Unit 2); item 8 is standalone (Unit 3); items 1, 2, 3 are conversation display
(Unit 4). A fifth unit — a codebase-wide rebrand to the app's permanent name **Arcan** — surfaced
during brainstorming and is captured as Unit 5.

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

All new fields are **optional** so backward compatibility is trivial (no migration; pre-rework code
paths are simply replaced):

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

### Scope of changes

- `src/jazz/schema/EphemeralPairing.ts` — add the five optional fields above.
- `src/jazz/pairing.ts` — split the trusted-side flow into `approvePairing()` and `rejectPairing()`
  helpers; current `wrapAccountSecretForResponder` becomes called from `approvePairing` (not by an
  automatic effect on `responderPubkey` change).
- New trusted-side subscription/watcher to surface pending approvals across all logged-in trusted
  devices.
- Responder-side state-machine rendering.
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

### Data-layer enforcement of admin-only edits (foundation for #2 and #3)

Per-field permissions are not a Jazz primitive — a CoMap is one permission domain. Conversation
members already have write access to the conversation's group (so they can append messages to the
sidecar lists), so making title/icon admin-only at the data layer requires them to live in a
**sub-CoMap owned by an admin-write group**, not directly on `Conversation`.

**New schema — `ConversationMetadata`:**

```text
ConversationMetadata = co.map({
  title: z.string().optional(),
  icon: ImageDefinition (optional),       // reuse the image storage used for profile avatars (Slice 5)
})
```

**Group structure for the metadata:**

- The metadata CoMap is owned by a new **`ConversationAdminGroup`** where only the conversation's
  admins are writers (members mirrored from the conversation group's admin role).
- The existing **`ConversationGroup`** is added as a **reader parent** of the admin group, so
  every member of the conversation can *read* the metadata but only admins can *write* it.
- CoJSON enforces this — a non-admin client physically cannot write `metadata.title` or
  `metadata.icon`; the write is rejected at the protocol layer. UI gating is a UX nicety, not the
  security control.

**Reference from `Conversation`:**

- Add an optional `metadata: ConversationMetadata` ref on `Conversation`.
- Read precedence for the display title: `conversation.metadata?.title` wins; if absent, fall back
  to the legacy `conversation.title`; if both absent, derive from members (existing
  `displayName.ts` behavior).

**Migration — lazy, admin-driven:**

- **New conversations** (post-rework): `createGroupConversation` creates `ConversationAdminGroup` +
  the `metadata` CoMap as part of conversation creation, populating `metadata.title` with whatever
  title was passed in. The legacy `Conversation.title` is left empty for new conversations.
- **Existing conversations:** on first admin write to title or icon, the admin client creates the
  `ConversationAdminGroup` + `metadata` CoMap, copies the current `conversation.title` into
  `metadata.title`, then performs the requested update. Until that happens, the legacy field is
  read; this avoids any forced bulk migration.

### #2 — Conversation icons

`metadata.icon` (above), for **group conversations**; 1:1s keep borrowing the contact's avatar
(unchanged). **Constraints:**

- **Types:** image only — PNG, JPEG, WebP.
- **Size:** raw upload ≤ 5 MB; resized client-side to 256×256 before storing. Reuse the image
  storage path used for profile avatars (Slice 5 — inline media).
- **Set/clear:** any conversation admin can set or clear it (data-layer-enforced). Clearing
  reverts to the monogram fallback.

**Monogram fallback (when unset):** the first 1–2 graphemes of the resolved display title,
rendered over a deterministic background color computed from a hash of the conversation ID — so the
same conversation gets the same color across devices and reloads.

Icon changes do **not** emit a `SystemEvent` (kept minimal — title rename does, see below).

### #3 — Conversation names

`metadata.title` (above), edited by any admin. **Constraints:**

- 1–100 characters after trimming.
- Cannot be all-whitespace (treated as "clear", which reverts to derived label).
- Concurrent renames: CoJSON last-write-wins on `metadata.title`. The rename `SystemEvent` log is
  not a serialization mechanism — see existing `SystemEvent` doc note that it's "for UX clarity,
  not security."

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

- `src/jazz/schema/Conversation.ts` — add optional `metadata: ConversationMetadata` ref.
- New `src/jazz/schema/ConversationMetadata.ts` — `title` + `icon` fields.
- `src/jazz/schema/SystemEvent.ts` — extend `kind` enum with `renamed`, add optional `newTitle`.
- `src/jazz/conversation.ts` — on group conversation creation, create the admin group + metadata
  CoMap. On admin rename / icon-set on a legacy conversation, lazy-migrate.
- `src/routes/conversations/detail.tsx` — replace mount-mark-read with leave/send mark-read,
  capture leaving message-sentAt.
- Sidebar, `useTabTitleBadge`, notification trigger — add active-conversation suppression.
- Display-title resolver — read `metadata.title` first, fall back to legacy `conversation.title`,
  then to derived label.
- Tests — read-semantics change (mount no longer writes; leave/send do); admin-only enforcement
  (non-admin write should be rejected); migration of legacy `title`.

### UI-dependency

**Buildable now:** the schema additions (metadata sub-CoMap, admin group wiring, SystemEvent
`renamed`, Conversation.metadata ref), the read-semantics change including leave/send triggers and
active-conversation suppression, the lazy migration path, and tests for all of the above.

**Needs UI refs:** the #1 divider rendering itself, the title-edit affordance and icon upload
affordance (admin-gated UI surfaces), the monogram fallback rendering, and the rename-event timeline
rendering.

---

## Unit 5 — Rebrand jazz-messanger → Arcan

*Surfaced during this brainstorming; not in the original ten-item list.*

The app now has a permanent name, **Arcan**, replacing the temporary "jazz-messanger". This unit is a
codebase-wide pass to find and change references, with one critical distinction:

- **Cosmetic / user-facing strings — change freely:** app title, PWA manifest, `<title>` / meta tags,
  README and docs prose, `package.json` `name`, repo/dir references, splash/branding copy.
- **Load-bearing identifiers — change only with migration care:** on a local-first Jazz app, renaming
  a CoValue **schema** (e.g. `JazzMessangerAccount`, file `src/jazz/schema/JazzMessangerAccount.ts`)
  or Better Auth keys can **orphan existing stored account data**. These need either a migration path
  or a deliberate decision to leave the internal identifier as-is while changing only the display name.
  The rebrand pass must inventory each reference and classify it before changing it.

**Coupling:** overlaps with Unit 3's `auth-server → api` rename (both touch deploy/config). Sequence
them together to avoid two churns over the same files.

**Already done (2026-06-05):** the Linear project was renamed jazz-messanger → Arcan; `CLAUDE.md`
Linear destination and the assistant's memory were updated to match.

**Needs its own clarification round + plan** (which identifiers are safe to rename vs. need migration).

---

## UI-dependency & sequencing summary

| Unit | Backbone buildable now (headless + tested) | Needs UI refs for |
|------|---|---|
| 1 · Connection subsystem | ✅ `ConnectionRequest`, three channels, approval gate, duration policy, expiry enforcement, return-ack, offline-conversation acceptance test | QR display, requester confirmation screen, pending/invite lists, live approval modal |
| 2 · Device pairing approval | ✅ schema additions, approve/reject helpers, trusted-side watcher, responder state machine, updated tests | approval card, new-device "Waiting…" screen |
| 3 · Feedback + `api` rename | ✅ rename, `POST /api/feedback`, Linear wiring | settings feedback form |
| 4 · Conversation display | ✅ `ConversationMetadata` sub-CoMap + admin group wiring, SystemEvent `renamed`, lazy migration, read-semantics change (leave/send), active-conversation suppression (sidebar/tab/toast) | #1 divider rendering, title-edit & icon-upload affordances, monogram fallback rendering, rename-event timeline |
| 5 · Rebrand → Arcan | ✅ cosmetic string changes; identifier inventory | nothing (but coordinate user-facing strings with the new UI) |

**Recommended order:** **Unit 3 first** (cleanest, almost no UI dependency) — coordinate its
`auth-server → api` rename with **Unit 5's** rebrand pass so the deploy/config files are touched once.
Then the headless backbones of Units 1, 2, and 4's read-semantics/schema in parallel with the UI work,
filling in each visual surface once the refs land. **#1's divider is the one piece deferred entirely
to UI time.**

## Housekeeping note (not part of this work)

The `Status` section in the repo `CLAUDE.md` is stale — it states Slice 3 is "not yet started," but
Slices 3–8 are merged. Worth correcting separately so future sessions work from reality.
