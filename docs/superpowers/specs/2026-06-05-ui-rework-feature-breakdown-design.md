# UI-rework supporting features — breakdown & design

**Date:** 2026-06-05 (last revised 2026-06-08 — see Decisions changelog)
**Status:** Design and discrepancy alignment with hi-fi UI references agreed. Implementation pending.

## Purpose

A major UI rework surfaced a rough list of ten features needed for it to work nicely. This document
clarifies what each one is, groups them into coherent **design units**, records the design decisions
we settled, and flags what must wait for the UI to land. Each unit gets its own focused
implementation plan (via the writing-plans flow), built in the recommended sequence below.

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

These collapsed into **six design units** (May/June discrepancy pass), and a seventh was added
during the 2026-06-08 hi-fi alignment pass:

- **Unit 1** — connection subsystem (items 4, 6, 7, 9, 10)
- **Unit 2** — device pairing approval gate (item 5)
- **Unit 3** — feedback endpoint + `api` rename (item 8) **[SHIPPED — small design follow-up]**
- **Unit 4** — conversation display (items 1, 2, 3)
- **Unit 5** — codebase-wide rebrand jazz-messanger → Arcan **[SHIPPED — tiny color touch]**
- **Unit 6** — hard cryptographic device revocation (Shape 3 / per-device-account architecture) — tracked as **NOX-10**, sequenced after the UI rework
- **Unit 7** — design system foundation (added 2026-06-08; runs first) **[SHIPPED — see Decisions changelog]**
- **Unit 8** — final UI alignment sweep (added 2026-06-09; runs after Units 1/2/3-follow-up/4)

---

## Foundational baseline — destructive rebuild (applies to all seven units)

**There is no pre-existing user data to preserve across this rework.** The current deployed state
is wiped as part of this work. No unit plans migrations, dual-accept transitions, lazy backfills,
or backwards-compatible identifier shims. Where a unit's design previously hedged on backward
compatibility, the answer collapses to "no constraint — just change it."

Concrete consequences this baseline produces, called out in each unit where relevant:

- **Unit 1** — existing `Invitation` CoValues are wiped; the new schema doesn't have to coexist
  with the old `everyone-writer` invite group pattern.
- **Unit 2** — the new optional fields on `EphemeralPairing` and `DeviceRecord` don't need to
  gracefully handle pre-rework records (there aren't any).
- **Unit 3** — the `auth-server` SQLite was wiped during the rename; no Better Auth user rows to
  migrate. Linear label set will be reshaped outright.
- **Unit 4** — no legacy `Conversation.title` data to fall back to; new conventions apply
  unconditionally. Existing `me.root.notificationPrefs` becomes `me.root.settings.notifications`.
- **Unit 5** — completed under destructive baseline.
- **Unit 6** — no existing shared-account-secret accounts to migrate; per-device-account
  architecture is the only architecture from day one of the Shape 3 slice.
- **Unit 7** — `me.root` schema gains a `settings` CoMap outright; no migration shim from the
  current `notificationPrefs` field.

---

## Decisions changelog (2026-06-08)

The hi-fi UI references (`Jazz Hi-Fi App.html`, `Jazz Hi-Fi Chat.html`, `Arcan Prototype.html`,
plus the `hf-*.jsx` and `proto.jsx` files) were reviewed against the unit bodies and the discrepancies
were settled in a focused brainstorming pass. The resolutions are now folded into each unit body
below. Summary for the audit trail:

- **Unit 1** — keep duration policy (1h/24h/7d, cap 7d); reuse existing `formatSafetyNumber` rendered
  as 3×4 grid (no verified-state concept); "dismiss" copy with local-only semantics; unified
  Add-Contact screen; shared-group hint above the safety number on the approval card.
- **Unit 2** — fingerprint replaces location on the approval card; responder-side waiting / rejected
  / timed-out screens added; subscription-based prompts so any logged-in trusted device sees pending
  pairings; "Approve / Deny" copy.
- **Unit 3** — Linear labels reshaped to `Bug / Idea / Question / Note` (drop `Improvement` and
  `Feature`); drop the email form field (verified account email already extracted server-side);
  attachment UI relaxes to multi-file with neutral copy.
- **Unit 4** — sidebar tabs (chats/contacts) + mobile bottom tab bar on root screens; hash-based
  per-conversation colors for both 1:1 and group (no global violet); display names rendered verbatim;
  no `@` prefix; **in-scope additions**: shared-conversations on the unified profile route +
  multi-select "new conversation" promotion-to-group + polymorphic profile route.
- **Unit 5** — adopt `#0a0b11` body/theme color; keep separate `/pair` and `/invite` URL schemes.
- **Unit 7 (new)** — design system foundation: generic `tokens.css`, self-hosted Inter + JetBrains
  Mono, nested `me.root.settings`, theme toggle + 6-color accent picker, Lattice logo component,
  toast + skeleton primitives, full component-library restyle + cross-route token audit + lint
  convention.

**Deferred to Linear (Low priority):**

- **NOX-31** — online presence indicator (metadata-leak concerns; opt-in design when revisited)
- **NOX-32** — typing indicator (same family as presence; defer together)
- **NOX-33** — message delivery states (sending/sent/failed; requires real ack protocol)

---

## Unit 7 — Design system foundation

*Added 2026-06-08. Runs first; gates every other unit's UI work.*

The hi-fi references encode a complete visual language ("Nox Noir": dark-first, JetBrains Mono +
Inter, sharp radii, hairline borders, accent gradient, Lattice mark, cosmic watermark). The current
implementation is Tailwind defaults with no theme system. Building any of Units 1, 2, or 4 against
the current visual baseline would mean two restyle passes. This unit lays the foundation that all
other unit UIs consume.

### Tokens and fonts

- **`src/styles/tokens.css`** — global CSS custom-property tokens for palette (dark + light),
  typography, spacing, radii, borders, shadows, motion, layout. Modeled on the design's
  `nox-tokens.css` but with the "Nox" naming dropped — generic token names so the file can grow
  without brand entanglement.
- **Self-hosted fonts** in `public/fonts/`:
  - Inter — weights 300, 400, 500, 600, 700, woff2, Latin subset
  - JetBrains Mono — weights 400, 500, 600, 700, woff2, Latin subset
  - `@font-face` declarations in `tokens.css`. No Google Fonts CDN dependency.
- **Font tokens:**
  - `--font-body: 'Inter', system-ui, -apple-system, sans-serif`
  - `--font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace`
  - `--font-display: 'JetBrains Mono', ui-monospace, monospace` (display is mono in this system)

### Theme system

Light + dark themes, with dark as the primary surface. Theme is reactive — toggling reflows
immediately. Persisted on `me.root.settings.appearance.theme`. Defaults to system preference for
first-time accounts.

### Accent picker

Six curated accents — **tokyo · violet · teal · lime · amber · rose**. User-selectable via Settings →
Appearance. Each accent supplies both a solid fill and a 2-stop gradient (matching the design's
`ACCENTS` constant in `hf-kit.jsx`). Accent is persisted on `me.root.settings.appearance.accent`.
Defaults to `tokyo` for first-time accounts.

### `me.root.settings` — nested settings CoMap

Schema addition (replaces the current `notificationPrefs` outright per the destructive baseline):

```ts
settings: co.map({
  appearance: co.map({
    theme: z.enum(["light", "dark"]),
    accent: z.enum(["tokyo", "violet", "teal", "lime", "amber", "rose"]),
  }),
  notifications: co.map({
    sound: z.boolean(),
    browser: z.boolean(),
  }),
})
```

Future opt-in groups (privacy, presence per NOX-31, typing per NOX-32) will land as new sub-maps
under `settings`. Migration is destructive — `notificationPrefs` is removed; `notifications` lives
under `settings`.

### Lattice logo component

`src/components/lattice.tsx` — React component rendering the Arcan "Lattice" mark using the
mathematical primitives from the design's `lattice.js`. Four detail tiers chosen by render size:

- **full** (≥ 44px) — engraved instrument: outer ring + 24 fine ticks + 6 spokes + inner ring + nested hex
- **reduced** (26–43px) — outer ring + spokes + inner ring + nested hex
- **minimal** (18–25px) — outer ring + spokes + nested hex (no inner ring)
- **glyph** (≤ 17px) — outer ring + solid gem + 6 spoke connectors

Accent-aware: fills with the accent gradient by default; `mono` prop for single-color contexts.
Used in: app header, auth surface watermark, empty-state cosmic backdrop, settings.

### Toast component + provider

`src/components/toast/` — a provider + hook + component that renders timed toasts (~2s). Variants:
**neutral · success · accent · error**. Replaces ad-hoc inline status messages. Used in: copy-link
confirmation, contact-added confirmation, failed-action errors. API:

```tsx
const toast = useToast();
toast({ icon: "copy", text: "invite link copied", tone: "accent" });
```

### Skeleton primitives

`src/components/skeletons/` — focused components for the most-loaded surfaces:

- `<NavListSkeleton />` — for the conversation/contact list while `me.root` is resolving
- `<ChatHeaderSkeleton />`, `<ChatMessagesSkeleton />` — for the chat surface before messages stream in
- Generic `<Skel w="…" h="…" />` primitive for ad-hoc use

Replaces every "Loading…" text fallback currently in the codebase.

### Component-library restyle (the big chunk)

Every primitive in `src/components/ui/` (shadcn-derived) gets rewritten to **consume tokens** rather
than hard-coded Tailwind values:

- `Button` — variants `primary` / `ghost` / `outline` / `danger`, sized by token spacing,
  background by accent or panel token, radius from `--r-2` or `--r-pill` based on `s.soft` equivalent
- `Input`, `Textarea` — panel background, border hairline, monospace caret
- `Card` — panel background, hairline border, `--r-3`
- `Avatar` — accent-soft background, accent text, configurable radius
- `Toggle`, `Tabs`, `Chip` — same accent + panel treatment

Same component API; new internals. Shadcn's pattern (component + props) is preserved so existing
call sites don't break; visual identity becomes token-driven.

### Cross-route token-audit pass

Routes outside Units 1/2/4's direct scope still need to use tokens consistently:

- `src/routes/auth/` (login, recovery)
- `src/routes/onboarding/` (welcome, credentials, backup-display, backup-confirm, profile,
  restore-choice, restore-with-code)
- `src/routes/pair/` (initiator, responder)
- `src/routes/invite/` (accept invitation)
- `src/components/sidebar.tsx`, `src/components/notification-manager.tsx`, the App shell
- Global error boundaries / 404 / unauthenticated states

Pass replaces every hard-coded Tailwind color/typography class (`bg-white`, `text-gray-800`,
`border-gray-200`, font-family literals) with token-based equivalents.

### Drift prevention

A simple pre-commit grep or ESLint rule flags ad-hoc color/typography Tailwind classes outside of
token consumption. Cheap to add; prevents recurring restyle work.

### CLAUDE.md convention update

Add a "Visual conventions" subsection to CLAUDE.md noting: use `var(--token-name)` for colors,
spacing, typography; never `bg-white`/`text-gray-*` literals; consult `tokens.css` for available
tokens.

### Scope of changes (Unit 7)

- `src/styles/tokens.css` (new) — palette + typography + spacing + radii + borders + motion + layout tokens
- `public/fonts/` (new) — woff2 files for Inter + JetBrains Mono
- `src/components/lattice.tsx` (new) — Lattice logo, 4 tiers
- `src/components/toast/` (new) — Toast provider + component + hook
- `src/components/skeletons/` (new) — skeleton primitives
- `src/components/ui/*` — rewrite all primitives to consume tokens (same API)
- `src/jazz/schema/ArcanAccount.ts` — add `settings: co.map({ appearance, notifications })`;
  remove the old `notificationPrefs` map (destructive baseline)
- `src/routes/settings/` — new Appearance card (theme toggle + accent picker), update notification
  reads/writes from `notificationPrefs` to `settings.notifications`
- All routes outside Units 1/2/4 scope — token-audit pass (color + typography literals → tokens)
- `index.html` — `<link rel="manifest">` already wired; `theme-color` meta becomes `#0a0b11`
  (coordinated with Unit 5)
- `CLAUDE.md` — add "Visual conventions" section
- ESLint config or pre-commit hook — drift-prevention rule
- Tests — theme reactivity (toggle changes CSS), accent persistence (`me.root.settings.appearance`
  round-trips), token-resolution sanity (token CSS file loads + key tokens are non-empty),
  skeleton render snapshots

### UI-dependency

This unit IS the foundation; everything Unit 1 / 2 / 4 needs from a visual perspective comes from
here. Independent of UI refs (the hi-fi files provide the design source of truth) — Unit 7 is
buildable in full.

---

## Unit 1 — Connection subsystem rework

*Absorbs original items #4, #6, #7, #9, #10. Largest unit by surface area.*

### Model

**Two CoValues, three channels, one pipeline, one universal approval gate.** Every channel ends up
delivering a `ConnectionRequest` to the recipient's Inbox; the recipient mutates the same CoValue
to signal approval; the requester subscribes and reacts. Mirrors the protocol shape of
`EphemeralPairing` in Unit 2 (responder watches the CoValue for state change rather than waiting
for a separate ack message).

**Core invariant:** no `Contact` is written on either side until the recipient explicitly approves.
The approver is the **non-initiator**; the initiator has already consented through their action.
Per the each-side-writes-its-own-Contact decision, each side writes its own Contact locally once
approval is observed — no cross-account writes.

The Inbox primitive already exists in `src/jazz/conversation.ts:151-166` (`InboxSender.load` +
`createInboxMessage`). All three channels ride this same backbone.

### CoValues

#### `Invitation` (reshaped — multi-use)

Replaces the existing single-use `Invitation` in `src/jazz/schema/Invitation.ts`. Per the
destructive baseline, this is a clean reshape — the legacy single-recipient fields and `consumed`
flag are dropped. One primitive serves both **async links** (channel='link') and **in-person QR**
(channel='qr'); only the TTL differs.

```ts
Invitation = co.map({
  inviterAccountID: z.string(),
  inviterFingerprint: z.string(),
  inviterDisplayName: z.string(),
  channel: z.enum(["qr", "link"]),
  createdAt: z.date(),
  expiresAt: z.date(),
  revokedAt: z.date().optional(),
})
```

Owned by an "everyone-writer" group (same pattern as today) so guest nodes can load it.

- **Multi-use:** the `Invitation` is **not consumed** on use; many openings → many
  `ConnectionRequest`s. Per-opener data lives on the `ConnectionRequest`.
- **Duration policy** (items #4, #9, #10):
  - `channel='qr'` — fixed short TTL (**5 minutes**, not user-configurable). Not listed in the
    management surface.
  - `channel='link'` — TTL preset at creation: **1 hour / 24 hours / 7 days**; default **24h**;
    **hard cap 7 days**. **No `30d`, no `∞`** — the cap is a deliberate guardrail per the trust-circle
    threat model. (The hi-fi designs render `30d` and `∞` options; those are dropped at implementation.)
- **Expiry enforcement** on the accept path: when a requester loads an `Invitation`,
  `expiresAt > now` AND `revokedAt` absent are checked. Today the field is stored but not checked —
  a real gap closed here.

#### `ConnectionRequest` (new — per opener)

One CoValue per opening of a link / scanning of a QR / tapping of a member.

```ts
ConnectionRequest = co.map({
  requesterAccountID: z.string(),
  requesterFingerprint: z.string(),
  requesterDisplayName: z.string(),
  requesterAvatar: FileBlob.optional(),

  recipientAccountID: z.string(),

  channel: z.enum(["qr", "link", "group"]),
  invitationID: z.string().optional(),  // present for 'qr'/'link'; absent for 'group'

  createdAt: z.date(),
  expiresAt: z.date(),
  approvedAt: z.date().optional(),       // recipient writes on approve
})
```

**Ownership:** owned by a fresh group the **requester** creates, with the **recipient** added as
`writer` so they can write `approvedAt`. Requester is `admin`. Delivered via
`InboxSender.load(recipientAccountID, me)`.

**Expiry derivation:**
- `channel='qr'` or `channel='link'`: `expiresAt = invitation.expiresAt` — inherits the parent
- `channel='group'`: no parent — independent clock of **30 days from `createdAt`**

**Notably absent:**
- **No `rejectedAt`.** The recipient's only options besides Approve are **Dismiss** (purely local
  — `me.root.dismissedRequestIDs`) or letting the request expire. The requester cannot distinguish
  dismissed from forgotten/expired. Trust-circle privacy property. The hi-fi designs render a
  "decline" button — that maps to **dismiss** semantics with the **"dismiss"** copy.
- **No shared-group context field.** The hint is **dynamic and bilateral**, computed locally — see
  Trust hint below.
- **No `verifiedAt` or verified-status concept.** Safety numbers are for out-of-band reading only.

### Three entry channels (UX layer over the unified protocol)

1. **In-person QR.** Initiator creates an `Invitation` with `channel='qr'` and a 5-minute TTL,
   renders the QR. Responder scans → loads the `Invitation` as a guest → goes through the
   requester-confirmation screen → creates a `ConnectionRequest` with `channel='qr'` and delivers
   via Inbox. Both parties physically present, so approval surfaces as an **immediate modal** on
   the initiator's side and on any other already-logged-in trusted device on the same account.

2. **Async link.** Initiator creates an `Invitation` with `channel='link'` and a preset TTL.
   Sharable with many people; each opener spawns a separate `ConnectionRequest`. The recipient
   acts on each request at their leisure from the Pending Connections list.

3. **Group connection request.** Inside a group's member list, tap a co-member → "Request
   connection" → no `Invitation` involved. Mint a `ConnectionRequest` with `channel='group'`,
   `invitationID` unset, `expiresAt = createdAt + 30d`, delivered via Inbox to the target.
   Requester-confirmation screen is skipped (they already saw the member's profile when they tapped).
   1:1 delivery — the rest of the group is not informed.

### Unified Add-Contact page

Per the 2026-06-08 alignment, all entry points to the connection subsystem live on **one screen**
(matching `proto.jsx AddContactScreen` and `hf-extra.jsx AddContactBody`):

- **"your code"** card with QR display + truncated account ID + copy-link + share buttons + the
  duration picker (1h / 24h / 7d).
- Divider "add someone".
- **"scan their code"** primary action.
- **"or paste a link"** secondary affordance.

### Requester-side confirmation screen (QR + link channels only)

Before a `ConnectionRequest` is sent, the requester sees a confirmation showing the inviter's
profile loaded from the `Invitation` CoValue — **displayName, avatar (if any), safety number** —
plus the dynamic shared-group hint (next section) if any applies. Actions: **Connect** / **Cancel**.
Skipped for `channel='group'`.

### Approval card layout

Per 1E, the recipient's approval card stacks **two trust signals** vertically:

1. **Shared-group hint (always visible, top)** — rendered from the local `useSharedGroups()`
   computation (see below). When non-empty, lists the names of groups both parties are in.
   ("You're both in: retrieval-squad · jun-mori-collab")
2. **Safety number (collapsed under, expandable)** — rendered as a **3-column × 4-row grid** of the
   12 BLAKE3-derived 4-digit groups (reusing `formatSafetyNumber` + `SafetyNumber` from
   `src/auth/fingerprint.ts` + `src/components/safety-number.tsx`). Mono font. Header reads
   "view security code"; expand reveals the grid + caption "compare in person to confirm it's
   really them". No action buttons attached — viewing only.

### Shared-group trust hint — dynamic, bilateral, channel-agnostic

The hint is **not stored** on any CoValue. It is computed locally by each side at render time via
a `useSharedGroups(otherAccountID)` hook:

- For each group the local user is a member of (visible via `me.root` accessors), check whether the
  other party's `accountID` appears in that group's member list.
- Return the matching groups' names.

**Properties:**
- No invitation field can lie about it — the hint is not in the message, it comes from the
  recipient's own view of reality.
- Channel-agnostic — a cold link opened by someone who happens to share a group still surfaces it.
- Bilateral — same hook on the requester's confirmation screen.
- The hook is **shared with Unit 4's shared-conversations section on the unified profile route**
  (replaces the design's "shared conversations · soon" placeholder).

### Approval mechanic (mutate, don't ack-message)

**Recipient approve:**
1. Write `approvedAt = new Date()` on the `ConnectionRequest`.
2. Write a `Contact` to **their own** ContactBook: captures `requesterAccountID`, TOFU-pins
   `requesterFingerprint`, sets `displayNameLocal` from `requesterDisplayName`, records `addedAt`.

**Recipient dismiss (local-only):** the request ID is added to `me.root.dismissedRequestIDs`; the
row stops rendering. The shared CoValue is untouched, so the requester sees no `approvedAt` and the
request remains pending until it expires.

**Requester observation:** the requester subscribes to the `ConnectionRequest`. When `approvedAt`
appears, the requester's client writes a `Contact` to its own ContactBook with the recipient's
account info, TOFU-pinning the recipient's fingerprint.

Each side's ContactBook is written only by its owner. No cross-account writes.

### Lifecycle states summary

**Recipient pending card:**

| State | Trigger |
|---|---|
| Pending | `approvedAt` and the dismissed flag are both unset; `expiresAt > now` |
| Approved (transient) | recipient just tapped Approve; written and visible until card is closed |
| Dismissed (local) | request ID is in `me.root.dismissedRequestIDs` |
| Expired | `expiresAt ≤ now` |

**Requester view:**

| State | Trigger |
|---|---|
| Pending | `approvedAt` unset, `expiresAt > now` |
| Approved | `approvedAt` set |
| Timed out | `expiresAt ≤ now`, `approvedAt` unset |

Note: the requester cannot distinguish Dismissed from "Timed out" — by design.

### Eventual-consistency decision and acceptance test

Sync lag for the requester-side Contact write is **accepted**. In-person QR is effectively instant;
async links are "next time the requester opens the app."

**Acceptance test (must not regress):** a conversation created between the two new contacts while
the requester was offline must be detected once the requester comes back online. Already holds
because conversation-creation notifications are durable Inbox messages
(`src/jazz/conversation.ts:151`).

### Management surfaces

**For the link owner — Live Invites screen** (item #10): lists active `Invitation`s with
`channel='link'`. Per row: time remaining, **revoke** action (writes `revokedAt = now`),
**regenerate** action (creates a fresh `Invitation` with the same TTL preset).

**For the recipient — Pending Connections list**: shows incoming requests where `approvedAt` is
unset, expiry has not passed, and the request is not in `me.root.dismissedRequestIDs`. Per row:
requester identity + dynamic shared-group hint + **Approve** / **Dismiss**. Live in-app
**toast** when a request arrives and the app is open (Unit 7's toast component); **immediate modal**
for `channel='qr'` (both parties present).

**For the requester — Outgoing Pending Requests**: outgoing `ConnectionRequest`s in pending state.
Surfaces "waiting on [name]" with the same shared-group hint if applicable. When `approvedAt`
appears, the row transitions to "Connected" and the local Contact is written. When `expiresAt`
passes, the row transitions to "Timed out."

### Scope of changes

- `src/jazz/schema/Invitation.ts` — reshape per the schema above
- `src/jazz/schema/ConnectionRequest.ts` (new)
- `src/jazz/schema/ArcanAccount.ts` — add `dismissedRequestIDs: co.list(z.string())` (or equivalent)
- `src/jazz/invitations.ts` — significant rewrite:
  - `createInvitation(channel, ttlPreset)`
  - `createConnectionRequest(invitation, me)` (replaces `acceptInvitation`)
  - `approveConnectionRequest` / `dismissConnectionRequest`
  - Expiry enforcement
- `src/jazz/conversation.ts` — group-channel helper `requestConnectionFromGroupMember`
- `src/hooks/useSharedGroups.ts` (new) — used by both the connection-request UI and Unit 4's
  unified profile shared-conversations section
- Inbox subscription hook surfacing incoming `ConnectionRequest`s into the Pending Connections list,
  firing a Unit-7 toast on arrival, immediate modal for QR
- Unified `AddContactScreen` (`src/routes/contacts/add.tsx` or similar)
- Approval card component with shared-group hint on top + safety-number expander beneath
- Tests: multi-use link (no consumed-race); expiry enforcement (qr 5min / link presets); dismiss
  local-only (requester never observes a signal); group-channel 1:1 delivery; shared-group hint
  correctness; offline-conversation acceptance test

### UI-dependency

**Buildable headless (after Unit 7):** the two CoValues, three creation paths, inbox delivery and
subscription, dismiss-local mechanic, expiry enforcement, shared-groups hint, approve mutation +
local Contact writes, all tests.

**Visual surfaces (consume Unit 7's tokens/components):** QR display, requester-confirmation
screen, Pending Connections list, Live Invites screen, Outgoing Pending Requests view, in-person QR
immediate modal, the approval card with stacked shared-group hint + safety-number grid.

---

## Unit 2 — Device pairing approval gate

*Original item #5.*

Today pairing transfers the **account secret** through the QR sealed-box handshake — the moment the
responder writes `responderPubkey`, `wrapAccountSecretForResponder` runs automatically and the new
device has full access. The Unit 2 gate inserts an approval step in between. The state machines
exist on both sides today (`src/routes/pair/initiator-step.tsx` and `responder-step.tsx`) with phases
`awaiting-approval` and `waiting-approval` respectively, and `handleApprove()` is wired on the
initiator. What's missing is the enriched approval card, fingerprint match on both sides, reject
path, and the broadcast-to-other-trusted-devices behavior.

### Three-phase handshake

1. **Present.** New (blank) device generates its ephemeral keypair and writes to
   `EphemeralPairing`: `responderPubkey`, `responderUserAgent`, `responderFirstSeenAt`,
   `responderFingerprint`. **No** secret transfer here.
2. **Approve.** An already-trusted device (the QR-shower, or any other device already logged into
   the same account — the CoValue is account-scoped, so all logged-in trusted devices see it) sees
   the enriched card and taps Approve or Deny.
3. **Transfer.** Only on approve is the account secret sealed and written to
   `wrappedAccountSecret` via `wrapAccountSecretForResponder`. The new device picks it up,
   unseals, and authenticates.

### Schema additions to `EphemeralPairing`

All new fields are optional only because the CoValue is in a partial state between phases (different
actors write at different times). Per destructive baseline, no compat concerns.

- **`responderUserAgent: string`** — raw `navigator.userAgent` from the new device. Label + OS
  derived client-side on the trusted device (via existing `deriveDeviceLabel` + a simple OS
  extractor: Windows / macOS / Linux / Android / iOS / Unknown).
- **`responderFirstSeenAt: date`** — `Date.now()` at responder present time.
- **`responderFingerprint: string`** — first 8 hex chars of SHA-256(`responderPubkey` hex). The
  same value is rendered on **both** the new-device "Waiting…" screen and the trusted-device
  approval card. User verifies they match by eye — physical-presence check.
- **`approvedAt: date`** — written by trusted device on approve, before `wrappedAccountSecret`.
- **`rejectedAt: date`** — written by trusted device on reject, alongside tombstoning
  (`expiresAt = now`).

### Approval card field set

Per 2A, the card shows:

- **Label** — derived from `responderUserAgent` via `deriveDeviceLabel`
- **OS** — derived from `responderUserAgent` (Windows / macOS / Linux / Android / iOS / Unknown)
- **First-seen** — relative time from `responderFirstSeenAt`
- **Fingerprint** — `responderFingerprint` verbatim. **Same value the new device displays.**

**`location` is explicitly NOT shown** (the hi-fi design's `ScApproveDevice` includes it; that is
overridden). Source IP is server-attested transport metadata, spoofable (VPN / region), and risks
false confidence. Real protection is the out-of-band QR presentation + explicit approve on an
already-trusted device + the fingerprint match.

### Responder-side state machine

The responder subscribes to the `EphemeralPairing` and renders one of four states. Existing
`waiting-approval` screen gets enriched; `rejected` and `timed-out` are new.

| State | Trigger | UI |
|---|---|---|
| Presenting | `responderPubkey` written, nothing else from trusted side yet | `ScLinkWaiting` — large mono fingerprint (e.g. `A1B2C3D4`), caption "match this with the code shown on your other device", subtle spinner. Cosmic `AuthSurface` shell |
| Approved & transferring | `wrappedAccountSecret` set | unseal, authenticate, register device (existing `claimAccountFromPairing` path) |
| Rejected | `rejectedAt` set | `ScLinkRejected` — "the request was rejected on the original device · try again" |
| Timed out | `expiresAt` passed without `wrappedAccountSecret` or `rejectedAt` | `ScLinkTimedOut` — "the request timed out · try again" |

### Trusted-side approve / reject actions

- **Approve:** write `approvedAt`, then call the existing `wrapAccountSecretForResponder`.
- **Deny:** write `rejectedAt`, then `expiresAt = now` (tombstone via existing `tombstonePairing`).

Button copy: **"Approve / Deny"** (2C).

### Multi-trusted-device pattern (2B-iii)

Replace the current polling on the initiator's session with a **subscription** on `me`'s pending
`EphemeralPairing`s, so:

- Any logged-in trusted device on the same account sees a pending pairing as a Unit-7 toast/modal
  showing the enriched approval card.
- First device to approve wins; CoJSON last-write-wins resolves the race benignly
  (`wrappedAccountSecret` ends up with one valid sealed payload either way).

Useful when you scan from your laptop while holding your phone — both surfaces show the prompt and
either tap completes the flow.

### Race semantics (unchanged from prior spec)

- **Multiple trusted devices simultaneously approve:** benign via LWW.
- **Responder disconnects after presenting:** trusted device may still approve; responder picks up
  `wrappedAccountSecret` on reconnect.
- **Two responders scan the same QR:** the second overwrites the first's `responderPubkey`. Same
  characteristic as today; not blocking.

### Timeout

Reuse the existing `EphemeralPairing.expiresAt` (currently 10 minutes in `createPairingInvite`).
The approval gate lives inside that window.

### Interim revocation UX honesty (unchanged from prior spec)

Real cryptographic revocation lives in Unit 6 / NOX-10. Today's "Revoke" button is purely a UI
filter on `DeviceRecord.revoked`. To avoid a misleading-reassurance compound with the new
approval-gate UX:

- **Rename the button** from "Revoke" to **"Forget this device"** (or equivalent).
- **Add a one-paragraph explainer** under the device list: *"Forgetting a device hides it here, but
  it can still read everything it has already synced. Full cryptographic revocation lands in the
  upcoming overhaul — see NOX-10."*

These ride out when Unit 6 ships.

### Scope of changes

- `src/jazz/schema/EphemeralPairing.ts` — add the five optional fields above
- `src/jazz/pairing.ts` — split trusted-side into `approvePairing()` and `rejectPairing()` helpers;
  `wrapAccountSecretForResponder` becomes called from `approvePairing` (not auto-fired on
  `responderPubkey` change)
- New trusted-side subscription replacing polling — surfaces pending pairings as toasts/modals
  app-wide
- Responder-side state-machine rendering: enriched `ScLinkWaiting` with fingerprint, new
  `ScLinkRejected`, new `ScLinkTimedOut`
- `src/routes/settings/devices-section.tsx` — button relabel to "Forget this device"; add the
  honesty explainer block
- Pairing tests — gate, reject, timeout, multi-trusted-device, fingerprint match

### UI-dependency

**Buildable headless (after Unit 7):** schema additions, approve/reject helpers, watcher,
responder state machine, devices-section relabel + explainer.

**Visual surfaces (consume Unit 7):** enriched approval card on the trusted side (rendered as a
Unit-7 toast/modal), new-device "Waiting…" / Rejected / Timed-out screens in the cosmic
`AuthSurface` shell.

---

## Unit 3 — Feedback endpoint + `api` rename

*Original item #8. **SHIPPED** as commits `15cb67b` + `f983c77` + the Phase 2 service rename. The
design-driven follow-up below restructures the form and the Linear taxonomy.*

### What shipped

- `auth-server/` renamed to `api/`; npm package `@arcan/api`; Caddy/compose/Dockerfile/scripts
  updated in one coordinated pass.
- `LinearClient` (issueCreate + two-step fileUpload).
- `InMemoryRateLimiter`.
- `POST /api/feedback` route — session-gated (Better Auth), per-account rate-limited, multipart
  with any-file-type / multi-file / 10 MB total cap, attachments uploaded to Linear and embedded
  as markdown links in the issue description.
- Server-side verified email extraction from the Better Auth `user` table — client never sends an
  email.
- Linear issue created in **team=Nox · project=Arcan** with the **`Feedback`** label + optional
  category label. Title prefixed `[Feedback]`.

### Design-driven follow-up (2026-06-08)

The hi-fi feedback form differs from what shipped in three ways. Resolutions:

**Category taxonomy — reshape Linear labels.**

- Workspace pass:
  - **Rename** `Improvement` → `Idea` (kept the existing label UUID; the label name moves)
  - **Drop** `Feature` from the workspace label set (no orphaned issues — confirm during execution)
  - **Create** new `Question` label
  - **Create** new `Note` label
- All four kept **Title-case** in Linear (matching workspace convention); rendered **lowercase** in
  the in-app form to match the design voice: `bug · idea · question · note`.

Final form: optional Category dropdown maps to `Bug / Idea / Question / Note`.

**Email field — dropped from the form.**

The hi-fi form has "email · optional" with "leave blank to stay anonymous" copy that implies
unauthenticated submission. The shipped endpoint requires a session (decision Q-auth: C); the email
is already extracted server-side from the authenticated user. The form drops the input and shows a
small note instead — "we'll know it's from your account · `<email>`" (final wording finalized at UI
implementation).

**Attachment UI — multi-file, neutral copy.**

Shipped accepts any file type / multiple files / 10 MB total. The design's "add a screenshot" copy
is narrowed. Final form:

- Label: "attachments · optional"
- Empty: dashed-border drop zone with paperclip icon + "attach files"
- Populated: list of attached files (filename + remove button per row)
- Total-size readout under the list

### Backend changes for the follow-up

- `api/src/env.ts` — replace label UUIDs:
  - Remove `LINEAR_LABEL_IMPROVEMENT_ID`, `LINEAR_LABEL_FEATURE_ID`
  - Add `LINEAR_LABEL_IDEA_ID`, `LINEAR_LABEL_QUESTION_ID`, `LINEAR_LABEL_NOTE_ID`
  - Keep `LINEAR_LABEL_BUG_ID` (only the name changes if at all)
- `api/src/feedback-route.ts` — `categoryLabels` map becomes `Bug / Idea / Question / Note`
- `api/tests/feedback.test.ts` — update category-label assertions

### Scope of changes (follow-up)

- Linear workspace label reshape (programmatic via MCP or manual; done as a workspace pass)
- `api/src/env.ts`, `api/src/feedback-route.ts`, `api/tests/feedback.test.ts` (label set changes)
- Settings → Feedback form: render lowercase categories, drop email input, multi-file attachments

### UI-dependency

**Settings form** consumes Unit 7's tokens, Card, Button, Input, Toast (on submit-success), and the
new category-chip styling. No new schema; all backend changes are localized.

---

## Unit 4 — Conversation display

*Original items #1, #2, #3 + the 2026-06-08 IA shift, polymorphic profile route, multi-select new-conversation flow, and shared-conversations section.*

### Enforcement model — app-layer, by deliberate choice

Per the existing precedent (`src/jazz/schema/SystemEvent.ts` documents app-layer-only enforcement
for trust-circle UX features), title and icon are admin-only at the application layer (UI affordance
only appears for admins; non-admin attempts are rejected by the UI). A determined non-admin with
developer tools could technically rename or change the icon by calling `$jazz.set` directly — that
is an accepted gap, captured for a future hardening pass (see "Future hardening — replace
trust-circle app-layer enforcement" follow-up task).

### IA shift — sidebar tabs + mobile bottom tab bar (4M)

Chats and contacts are no longer separate top-level routes. They become **tabs in a single
persistent sidebar** on desktop, and a **bottom tab bar** on mobile (rendered only on **root**
screens, i.e. the chats list and contacts list — not on chat/profile/settings, where it would
compete with the composer or other actions).

**Routes after the shift:**

- `/` — chats list (default tab)
- `/contacts` — contacts list
- `/conversations/:id` — chat detail
- `/profile/:accountID` — **polymorphic profile** (own or other; see below)
- `/settings` and subroutes — settings
- `/pair`, `/invite` — unchanged

The sidebar's `chats | contacts` tabs are stateful — the active tab persists per session. Mobile
bottom tab bar mirrors the same active state.

### Polymorphic profile route (4 — in-scope addition)

**One** route — `/profile/:accountID` — rendered by a single `<ProfileRoute>` component that
branches on `accountID === me.$jazz.id`:

**Standard contact profile (other account):**
- Avatar + display name + truncated account ID
- Primary action: **`message`** (opens or creates a 1:1 conversation)
- **Shared conversations section** — list of conversations both parties are in (uses
  `useSharedGroups()` from Unit 1; replaces the design's "soon" badge)
- **Safety number** — collapsed under "view security code"; expands to the 3×4 mono grid
- No edit affordances

**Own profile (`accountID === me`):**
- Same shell, but:
  - Avatar has a **camera-overlay** for editing
  - Display name has an inline **pencil-edit** affordance
  - Primary action becomes **`add a contact`** (opens the unified Add-Contact screen from Unit 1)
  - Shared-conversations section still applies (shows your own groups for completeness)
  - Safety number still applies (this is the value others scan)
  - Footer row: **"account & settings"** → routes to `/settings`

**Entry points (matching the hi-fi prototype):**
1. Tap your avatar/name in the chat-list header → `/profile/<me-id>`
2. Tap your avatar/name in the contacts-list header → `/profile/<me-id>`
3. Tap the profile row in Settings → `/profile/<me-id>`
4. Tap any contact row → `/profile/<their-id>`

This unifies what was previously split across `src/routes/contacts/detail.tsx` (other contacts)
and `src/routes/settings/profile-section.tsx` (own profile editing inside settings).
`contacts/detail.tsx` becomes the polymorphic component; `settings/profile-section.tsx` reduces to
a thin "go to your profile" row.

### Multi-select new-conversation flow (4 — in-scope addition)

`NewConvoScreen` (matches `proto.jsx`): a single screen with a checklist of contacts. Behavior keyed
to selection count:

- **0 selected** — primary button disabled, label "select contacts"
- **1 selected** — primary button label "message", action: open or create 1:1 conversation with that contact
- **2+ selected** — primary button label "create group · N members", action: create group conversation
  with an optional title field that appears at the top of the screen (placeholder "group name (optional)")

Routed at `/conversations/new`.

### #1 — New-messages indicator (in-conversation unread divider)

The hi-fi `NewMark` component aligns exactly with the spec. A "↓ new messages" divider rendered at
the first unread message — pure render, fully UI-blocked until Unit 7's typography tokens land.

**Divider semantics (locked):**
- Anchor: capture `lastReadAt[conv]` into a React ref at the moment the conversation detail view
  **mounts**; do not update the anchor while the view is open.
- Render: above the first message whose `sentAt > anchoredLastReadAt`.
- **Excluded:** self-authored messages and `SystemEvent`s.
- No unread on open → no divider. All unread on open → divider at top. New messages arriving while
  viewing appear below; the divider does not move.
- Auto-scroll to the divider on mount when any unread.

### Read semantics change

Replace the current mount-mark-read with leave/send mark-read. `lastReadAt[conv]` advances only on:

- **Send.** After a message append succeeds, `lastReadAt[conv] = max(currentLastReadAt, now)`.
- **Leave.** Set `lastReadAt[conv] = max(currentLastReadAt, latestRenderedMessageSentAt + 1)`. **Not**
  `now` — abandoned-without-reading should reflect what was actually rendered.

**"Leave" triggers** — any one fires the mark-read: route change away from the conversation detail
route; `visibilitychange` to `hidden` while still on the conversation route; `beforeunload`
(best-effort).

### Active-conversation suppression

Under the new rule, the conversation you're actively viewing accumulates "unread" between mount-anchor
and any new arrivals, because `lastReadAt` doesn't advance until leave. Three surfaces suppress:

| Surface | Rule |
|---|---|
| Sidebar badge | Hide the unread badge on the row matching the current active conversation route |
| Tab title badge | Exclude the active conversation's contribution from the total |
| In-app notification toasts | Skip toast firing when the new message's conversation matches the active route |

All three driven by react-router params.

### #2 — Conversation icons

Add `icon: FileBlob.optional()` to `Conversation`, mirroring the avatar pattern on `Profile`
(`src/jazz/schema/Profile.ts:19`). For **group conversations**; 1:1s keep borrowing the contact's
avatar (unchanged).

**Constraints:**
- Image only (PNG / JPEG / WebP).
- Raw upload ≤ 5 MB; resized client-side to 256×256 before storing. Reuse the avatar storage path
  from Slice 5.
- Set/cleared by any admin (app-layer gated). Clearing reverts to the monogram fallback.

**Monogram fallback (when unset):** the first 1–2 graphemes of the resolved display title, rendered
over a **deterministic background color computed from a hash of the conversation ID** drawing from
the accent-family palette. **Both 1:1 and group conversations use this same hash-based scheme** —
no global violet treatment for groups (the design's violet group tint is overridden per 4O).

Icon changes do **not** emit a `SystemEvent`.

### #3 — Conversation names

`Conversation.title` already exists; the existing `updateConversationTitle` mutation already does
`conversation.$jazz.set("title", newTitle)`. Changes:

- Show the title-edit affordance only to admins in the UI.
- Emit a `SystemEvent` when a rename actually happens, so the timeline shows "Alice renamed the group."

**Constraints:**
- 1–100 characters after trimming.
- Cannot be all-whitespace (treated as "clear", which reverts to derived label).
- Concurrent renames: CoJSON LWW. The rename `SystemEvent` log is not a serialization mechanism.

**`SystemEvent` schema addition:** extend the `kind` enum with **`renamed`**, add optional
`newTitle: z.string()`.

### Display name conventions (4P)

- **Rendered verbatim.** No CSS-lowercasing. Users see names as they were entered.
- **No `@` prefix** on names anywhere — the hi-fi mono variants render `@ada · keyring`; that is
  not adopted.

### Scope of changes (Unit 4)

- `src/jazz/schema/Conversation.ts` — add `icon: FileBlob.optional()`
- `src/jazz/schema/SystemEvent.ts` — extend `kind` with `renamed`; add optional `newTitle`
- `src/jazz/conversation.ts` — `updateConversationTitle` writes the `renamed` SystemEvent; add
  `updateConversationIcon`
- `src/routes/conversations/detail.tsx` — replace mount-mark-read with leave/send; capture
  leaving message-sentAt; render the unread divider; auto-scroll
- Sidebar component + tabs (chats/contacts) + mobile bottom tab bar
- `useTabTitleBadge` + sidebar + notification trigger — active-conversation suppression
- Display-title resolver — `conversation.title` if set, else derived label
- `src/routes/conversations/new.tsx` (or refactor of existing) — multi-select promotion-to-group
- **Polymorphic profile**:
  - `src/routes/profile/index.tsx` (new) — `/profile/:accountID` route
  - `src/components/profile-view.tsx` (new) — the polymorphic component
  - `src/routes/contacts/detail.tsx` — replaced by routing to `/profile/<id>` (or kept as a thin
    redirect)
  - `src/routes/settings/profile-section.tsx` — reduces to a "go to your profile" navigation row
- Tests — read-semantics change; rename SystemEvent; UI gating; multi-select flow; polymorphic
  profile branches; shared-conversations rendering

### Known accepted gap

Title/icon admin-only is **app-layer only** — captured for the broader trust-circle data-layer pass
(future hardening follow-up task).

### UI-dependency

**Buildable headless (after Unit 7):** schema additions, mutations, read-semantics change,
suppression logic, lazy migration paths, multi-select flow logic, profile-route polymorphism,
shared-conversations integration via Unit 1's `useSharedGroups()`, tests.

**Visual surfaces (consume Unit 7):** chat detail, sidebar tabs + bottom tab bar, conversation list
row treatment, monogram avatar generation, divider rendering, icon-upload affordance, title-edit
affordance, rename-event timeline rendering, polymorphic profile screen (both modes),
shared-conversations section rendering.

---

## Unit 5 — Rebrand jazz-messanger → Arcan

*Original brainstorming surfaced this. **SHIPPED** as commit `d0b67f4` + Phase 7 historical notes
+ rest of the rename pass. The design-driven touch below is a single-value adjustment.*

### What shipped

- `JazzMessangerAccount` → `ArcanAccount` across the file, 20 importers, tests.
- Recovery-HMAC purpose string → `arcan:recovery-reset` on both client and server.
- Root `package.json` name `arcan`; service package `@arcan/api`.
- PWA manifest (`public/manifest.webmanifest`) wired via `<link rel="manifest">` in `index.html`.
- All user-facing brand strings updated (index.html title, welcome, login, notifications, tab title
  default, README, deploy/README, CLAUDE.md, e2e + unit test literals).
- Top-of-doc historical-context notes prepended to all 20 historical slice specs and plans.

### Design-driven touch (2026-06-08)

The hi-fi prototype uses `#0a0b11` for the body background; the shipped PWA manifest uses `#0a0a0a`.

- Update `public/manifest.webmanifest` `theme_color` and `background_color` from `#0a0a0a` to
  `#0a0b11`.
- Update `index.html` `<meta name="theme-color">` from `#0a0a0a` to `#0a0b11`.

This is a one-line-each tweak; folds naturally into Unit 7's deploy.

### URL scheme — `/pair#…` and `/invite#…` kept separate

The hi-fi design shows a unified `arcan.app/link#…` scheme. The shipped/implemented paths
(`/pair#…` for device pairing, `/invite#…` for contact invitations) are kept — the two flows have
meaningfully different schemas and lifecycles, and the distinct paths are already implemented and
tested. Design copy updates to the right path per context.

---

## Unit 6 — Hard device revocation (Shape 3 / per-device-account architecture)

*Promoted into a spec unit during the original brainstorming; full design lives in Linear as
**NOX-10** (High priority).*

### Summary (unchanged from previous revision)

Replace "the account secret is shared across devices" with **one Account per device**, all members
of a shared **`UserGroup`**. The user identity becomes the group; each device is a
cryptographically-distinct member.

- **Pair** → create a fresh per-device `Account` on the new device (no secret transfer); the
  trusted device admins it into the `UserGroup`. Composes with Unit 2's approval gate, which now
  gates *admission into the UserGroup* rather than *secret sealing*.
- **Revoke** → `UserGroup.removeMember(deviceAccount)`. Jazz auto-rotates the readKey on member
  removal. The revoked device cannot decrypt content authored after revocation.
- **Forward-rotation only** — the revoked device retains read access to content it already synced
  (consistent with §6.4's documented property for conversation member removal).

### Why a separate unit

Hard revocation is a foundational architectural change touching every place currently rooted on
"the account" (account secret, schemas keyed on `me`, author derivation, all pairing flows). Doing
it concurrently with the UI rework would mean the UI is built against a moving target.

### Sequencing

**Land immediately after the five UI-rework units complete**, before any public launch. Pairing
UX from Unit 2 carries over (the approval gate stays; under-the-hood mechanism changes). The
Settings → Devices card grows from a single-row design into a multi-row list with the Unit 2
interim "Forget this device" relabel transitioning to "Revoke" (real cryptographic revocation) at
that point.

### Pointer to detail

Full architectural detail, scope sketch, migration-options discussion, and references live in
Linear: **NOX-10 — "Hard device revocation via per-device-account architecture (Shape 3)"**.
That issue is the single source of truth for Unit 6's design.

### UI-dependency

**Buildable backbone:** all schema and protocol work.
**Needs UI:** the Settings → Devices revocation flow at the point Unit 6 ships; replaces the Unit-2
interim "Forget this device" honesty UX with the real action.

---

## Unit 8 — Final UI alignment sweep

*Added 2026-06-09. Runs after Units 1, 2, 3-follow-up, and 4 have landed. Before Unit 6.*

### Why this exists

Unit 7 delivered the **foundation** (tokens, fonts, theme + accent, Lattice component, toast +
skeleton primitives, component-library restyle, cross-route token audit). Units 1, 2, 4, and the
Unit 3 follow-up each redraw their specific surfaces to the hi-fi designs. But Units 1/2/4 are
scoped to *their* features — they don't necessarily touch every surrounding screen, and they don't
catch hi-fi patterns that are unique to other contexts (e.g. the cosmic **AuthSurface** shell for
welcome/sign-in/onboarding/restore, the empty-pane Lattice watermark, modal restyling, mobile
layout chrome, etc.).

Without an explicit sweep at the end, gaps end up living forever — half the app looks like the
hi-fi reference, half is old-layout-but-with-new-tokens. Unit 8 makes that mismatch unacceptable
by inventorying it once and closing it.

### Scope — two phases

**Phase A · Audit.** Walk through every screen present in the hi-fi reference files
(`Jazz Hi-Fi App.html`, `Jazz Hi-Fi Chat.html`, `Arcan Prototype.html`, `hf-*.jsx`, `proto.jsx`)
and every screen present in the implementation. For each, classify:

- **Matches** — the implementation visually corresponds to the hi-fi treatment (within reasonable
  tolerance).
- **Partial** — the implementation uses the right tokens but the layout / composition still
  doesn't match the hi-fi treatment.
- **Not started** — no transition applied.

Produce a markdown report `docs/superpowers/specs/2026-XX-XX-unit-8-audit.md` with the inventory
table + a prioritised work list for Phase B.

**Phase B · Transition.** Build any missing layout components and rewire screens. Each surface
gets a small focused task in the Phase B plan.

### Known-likely candidates (starter list — Phase A confirms)

- **`<AuthSurface>` component** — cosmic Lattice watermark bleeding off the corner (low opacity)
  + 2–4 scattered cosmic dots + centered narrow card (~300px). Used by welcome, sign-in,
  credentials, backup-display, backup-confirm, profile-step, restore-choice, restore-with-code,
  recovery — 9 routes total. This was scoped to Unit 7 in spirit but only the token pass landed;
  the layout component itself was not built. It also gets reused by Unit 2's responder-side
  waiting / rejected / timed-out screens; if Unit 2 ships first it may build the component, in
  which case Unit 8 just adopts it.
- **Empty-pane cosmic backdrop** — the design's `EmptyPane` with oversized Lattice + cosmic dots.
  Appears on the desktop reading-pane "pick a conversation" / "pick a contact" empty states. Unit
  4 *may* build this as part of the IA shift; if it doesn't, Unit 8 picks it up.
- **Modal shells** — `change-password-modal`, `view-recovery-code-modal`, `leave-with-promote-dialog`,
  `group-create-dialog`, `contact-picker`, `image-lightbox`. Currently tokens are right; layout
  is the old centered-card-in-scrim. The hi-fi designs use a consistent modal shell (`Card` over
  scrim with hairline header + action footer) — may or may not need formalising.
- **Mobile chrome** — the design renders a phone frame with notch + status bar + bottom indicator
  in the hi-fi files. Whether to apply mobile-chrome adjustments (safe-area inset for the bottom
  tab bar, status-bar transparency hints, etc.) needs decision during Phase A.
- **Top app header** — the design's desktop window chrome shows `arcan · local-first` pill with a
  small Lattice. Worth checking the current implementation header against this.
- **Lattice placement** — the component is built but unused. Phase A confirms where it should land
  (welcome screen, app header on initial paint, empty-pane backdrop, etc.).
- **Sidebar separation treatment** — Unit 4 picks one of A/B/C/D from the design's
  `SidebarOptions` mock. Confirm during Phase A.
- **Toast call sites** — the toast component exists; only consumer code that explicitly calls
  `useToast()` actually surfaces toasts. Many existing user actions still use inline status
  messages. Phase A inventories which actions should fire a toast; Phase B wires them.
- **Skeleton call sites** — same as toasts. The components exist; existing surfaces still render
  "Loading…" text. Phase A inventories which surfaces should use skeletons; Phase B wires them.
- **Any other gaps surfaced by the audit.**

### Why this slots after Units 1/2/3/4

- Units 1/2/4 each redraw substantial surfaces. Doing Unit 8's audit before they ship would
  inventory work that's about to be redone anyway.
- Most of Unit 8's likely candidates either land naturally in Units 1/2/4 or are explicitly
  out-of-scope for them — easier to detect after-the-fact.
- The Phase A audit produces a complete picture in one place; Phase B work-list flows from it,
  not from guesswork.

### Why it runs before Unit 6

- Unit 6 (Shape 3 / NOX-10) is a foundational architectural change — pre-rebuild UI work would be
  thrown away. Unit 8 is the final UI alignment **of the pre-Shape-3 application**.
- After Unit 6 lands its own UI changes (Settings → Devices revocation flow, the per-device-account
  pairing rewrite), a smaller second pass may be needed; that's part of Unit 6's scope, not Unit 8.

### Out of scope for Unit 8

- New features (defer to their own units).
- Anything that requires backend / schema changes (Units 1/2/4 territory).
- The deferred items NOX-31 (presence) / NOX-32 (typing) / NOX-33 (delivery states) — those stay
  deferred per the 2026-06-08 decisions.

### Deliverables

- `docs/superpowers/specs/2026-XX-XX-unit-8-audit.md` — Phase A audit report
- `docs/superpowers/plans/2026-XX-XX-unit-8-final-alignment.md` — Phase B implementation plan
- The actual transitions in code

### UI-dependency

Unit 8 IS the UI catch-up; no further refs needed beyond the existing hi-fi files.

---

## UI-dependency & sequencing summary

| Unit | Status | Buildable now (post Unit 7) | UI surface consumers |
|---|---|---|---|
| 7 · Design system foundation | SHIPPED (2026-06-09) | tokens, fonts, Lattice, settings CoMap, theme + accent, toasts, skeletons, component-library restyle, cross-route token audit, lint convention | every screen below |
| 1 · Connection subsystem | new build | CoValues, channels, gate, durations, enforcement, dismiss-local, shared-group hint, offline acceptance test | unified Add-Contact, approval card (hint + safety grid), pending/outgoing lists, live invites screen, QR modal |
| 2 · Device pairing approval | gate exists, needs enrich + reject + broadcast | enriched approval card (fingerprint not location), responder waiting/rejected/timed-out screens, subscription-based prompts | toast/modal on trusted side, cosmic AuthSurface screens on responder side, devices-section relabel + explainer |
| 3 · Feedback (follow-up) | shipped; follow-up | label reshape in Linear + env + route map, drop email field, multi-file attachment UX | restyled settings feedback form |
| 4 · Conversation display | mostly buildable | schema (icon, SystemEvent rename), read-semantics change, suppression, multi-select flow, polymorphic profile route, shared-conversations integration | chat detail with divider, sidebar tabs + mobile bottom tab bar, monograms, polymorphic profile (both modes), rename timeline |
| 5 · Rebrand touch | shipped + tiny tweak | `#0a0b11` value swap in manifest + index.html | trivial |
| 8 · Final UI alignment sweep | NEW · RUNS AFTER 1/2/3/4 | Phase A audit report + Phase B transitions for any surface still off-design (AuthSurface, empty-pane cosmic backdrop, modal shells, mobile chrome, Lattice placement, toast/skeleton call-site wiring, anything else surfaced) | all leftover surfaces |
| 6 · Hard revocation (Shape 3 / NOX-10) | scheduled after Unit 8 | all schema/protocol work | Settings → Devices revocation flow at ship time |

**Recommended execution order:**

```
Unit 7 (design system foundation) — RUN FIRST
    ↓
Parallel after Unit 7:
    ├── Unit 1 — connection subsystem (largest)
    ├── Unit 2 — device pairing approval gate enrichments
    ├── Unit 3 — Linear label reshape + form revision
    ├── Unit 4 — conversation display + IA shift + polymorphic profile + multi-select
    └── Unit 5 touch — `#0a0b11` swap (already done in Unit 7's deploy)
    ↓
Unit 8 — final UI alignment sweep (audit + transition leftover surfaces, AuthSurface, etc.)
    ↓
Unit 6 (Shape 3 / NOX-10) — after the UI rework lands
```

**Why Unit 7 first:** every other unit's UI surface depends on tokens, fonts, the theme/accent
system, toast pipeline, and skeleton primitives. Building Units 1, 2, or 4 against current Tailwind
defaults would mean two restyle passes.

**Why parallel after Unit 7:** Units 1, 2, 3-follow-up, 4 touch different surfaces and can each be
its own implementation pass without conflict.

**Why Unit 8 before Unit 6:** Unit 8 is the final UI alignment of the pre-Shape-3 application. It
sweeps up anything Units 1/2/3/4 didn't touch (most notably the cosmic `AuthSurface` shell for
welcome / sign-in / onboarding / restore, where Unit 7 applied token-level treatment but did not
build the layout component). Doing this before Unit 6's architectural rewrite means the UI is
visually complete when Unit 6 begins.

---

## Deferred items (tracked in Linear)

These surfaces were considered during the 2026-06-08 alignment pass but explicitly deferred. Each
has a dedicated Linear issue with rationale and a suggested opt-in design for when it's revisited.

- **NOX-31** — Online presence indicator (Low). Metadata-leak concerns; opt-in design.
- **NOX-32** — Typing indicator (Low). Same family as presence; defer together.
- **NOX-33** — Message delivery states (sending/sent/failed) (Low). Requires real per-recipient
  acknowledgment protocol; couples with future read receipts.

These do **not** block the seven-unit UI rework. They will be considered after Unit 6 ships, when
the overall surface is stable enough to evaluate opt-in privacy features deliberately.
