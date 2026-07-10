# Feedback round 2 — quick-fix bundles — Design Spec

**Goal.** Close the straightforward items from the 2026-07-10 walkthrough feedback (46 items,
triaged in the "Arcan Review round" session). This spec covers **Bundles A–E** plus one
diagnosis spike. The two architecture-level outcomes of the triage — the 1:1-vs-group
conversation model ("Bundle F") and the identity-code rename/shortening — get their own
brainstorm → spec cycles and are explicitly out of scope here.

**Requirements source.** The user's 2026-07-10 feedback list + the triage Q&A in-session.
Deferred features are tracked in Linear: NOX-42…NOX-48.

---

## Locked decisions (from the triage Q&A)

1. **Copy convention stays all-lowercase** app-wide.
2. **QR popup: closing = dismiss** (the 2026-07-08 dismiss≠deny decision stands); an
   **explicit decline button is added** so the choice can be made immediately or later from
   the pending list.
3. **Permanent invite links are acceptable** before blocking exists, because the live-invites
   management screen allows revoking them at any time.
4. **Notification defaults:** `sound: true`; `browser` stays `false` (permission-gated — a
   default of on is impossible).
5. **Profile "message" button: rename only** ("create conversation"); no lazy-create.
6. **Drop the "account & settings" row from own profile**; the home-header gear is the
   settings entry point.
7. **Manual crop deferred** (NOX-42); an interim automatic square center-crop ships in
   Bundle B.
8. **Identity-code rename/shortening → separate brainstorm**; only a copy button ships now,
   under the existing "security code" name.
9. **Group-picture changes emit a system event**; profile-avatar changes stay event-less
   (by design, unchanged).
10. **Duplicate-conversations bug is still live** → diagnosis spike; confirm the cause before
    fixing (Unit 9-0 discipline).

---

## Bundle A — copy & phrasing

| Change | Where |
|---|---|
| "scan their code" → "scan their QR code" | `src/ui/screens/add-contact-screen.tsx:172` |
| new-convo confirm "message" → "create conversation" (group label unchanged) | `src/routes/conversations/new.tsx:101` |
| profile "message" button → "create conversation" | `src/components/profile-view.tsx` / profile presenter |
| invite confirm screen: primary → "request to become contacts"; "decline" → "cancel"; cancel navigates to `/` instead of `history.back()` | `src/routes/invite/index.tsx:365-382` |
| incoming-request popup: requester display name on its own line, separated from the "wants to connect" sentence; connect phrasing reviewed | `src/components/incoming-connection-prompt.tsx:81` |
| 1:1-delete confirmation copy: must state the other party sees you left and that your history is gone | `src/components/profile-view.tsx:301` — final copy lands with Bundle C's modal migration to avoid double-editing |

## Bundle B — small behavior fixes

1. **Recovery verification = always the first 3 words** — replace the random-index selection
   (`src/routes/onboarding/backup-confirm-step.tsx:31-39`). No security downside (uniform
   BIP-39 entropy).
2. **Notification default `sound: true`** at account creation + backfill
   (`src/jazz/schema/ArcanAccount.ts:152-154`, `:267-269`); `browser` remains `false`.
3. **Edit-discard guard:** unchanged text exits edit mode without stamping
   `edited`/`editedAt` (`src/routes/conversations/detail.tsx:614`).
4. **Send text verbatim:** remove the `.trim()` transform on send; still reject
   whitespace-only messages (`detail.tsx:579`).
5. **Own-message timestamp on the left** of the bubble (`src/ui/kit/bubble.tsx:90-96`).
6. **FAB icon per tab:** chat-bubble+plus on chats, person+plus on contacts
   (`src/ui/kit/fab.tsx:32`, wired from `nav-column.tsx:164-170` + mobile screens).
7. **Copy button on the security-code display** with toast confirmation
   (`src/components/safety-number.tsx`). Name stays "security code" until the identity-code
   brainstorm.
8. **Pending-requests badge on the contacts tab** — reuse the unread-pill pattern
   (`src/ui/screens/rows.tsx:72-80`) fed by `useIncomingConnectionRequests()`.
9. **Default group name from member names** — first ~3 first-names, "+N" beyond
   (`src/routes/conversations/new.tsx:84`).
10. **Group image bubble opens a file picker** directly during creation
    (`src/ui/screens/new-convo-screen.tsx:65-70`); image applied on creation.
11. **"back to app" affordance on the waiting-for-approval screen**
    (`src/routes/invite/index.tsx:312-320`).
12. **Remove-avatar as an icon button adjacent to the avatar** (mirror the camera-badge
    pattern; confirmation retained via the Bundle C dialog) — `profile-view.tsx:350-360` +
    `own-profile-screen.tsx`.
13. **Drop the "account & settings" row from own profile**
    (`src/ui/screens/own-profile-screen.tsx:137-144`).
14. **New-conversation screen polish:** desktop max-width, mobile spacing alignment,
    `EmptyPane`-based no-contacts state (`new.tsx:126-139` + `new-convo-screen.tsx`).
15. **Lightbox download button** — reuse the blob-download logic from
    `attachment-tile.tsx:140-152` in `image-lightbox.tsx`.
16. **Attachment bubble sized to the image aspect ratio** within max bounds
    (`src/components/attachment-tile.tsx:99-104`).
17. **Conversation-header context menu** in the unused `PHeader` `right` slot with the
    destructive actions appropriate to role/kind (delete / leave) — `src/ui/kit/pheader.tsx`
    + `detail.tsx:1005-1022`; actions reuse the existing danger-zone handlers.
18. **Last-person-standing delete:** when the composer is disabled because everyone else
    left (`detail.tsx:445-462`), offer an in-conversation delete action.
19. **Group-picture system event:** new `SystemEvent` kind (`"icon"`), emitted from
    `setConversationIcon` (`src/jazz/avatar.ts:86-98`), rendered as "X changed the group
    picture" (`src/components/system-event.tsx`); renderer must ignore unknown kinds
    defensively (forward compat with older clients).
20. **Interim avatar crop:** apply `resizeImageToSquare()` to avatar uploads (profile +
    onboarding) — `src/jazz/avatar.ts:12-16`; replaced later by NOX-42's manual crop.
21. **Messages right-click / long-press for context** + rethink of the menu's positioning;
    the `⋮` affordance stays (`detail.tsx:814-856`).
22. **Auth-surface audit** *(low priority)*: enumerate welcome / sign-in / restore /
    recovery screens; verify each is reachable, necessary, and properly linked; promote the
    sign-in screen's create-account `MuteLink` (`sign-in-screen.tsx:99-101`) to a visible
    secondary button. Output: a small fix-list executed within this bundle.

## Bundle C — confirmation-dialog migration

New kit-level **`ConfirmDialog`** primitive on `ModalShell` (title, body, confirm label,
danger tone; `RemoveContactDialog` demonstrates the pattern). Confirmations are true
interrupts, so `ModalShell` remains legal for them under Unit 9's modals→routes rule.

Migrate all seven native `confirm()` sites (final confirmation copy — lowercase — is decided
here, including Bundle A's 1:1-delete phrasing):

| Site | Guards |
|---|---|
| `profile-view.tsx:224` | remove avatar |
| `profile-view.tsx:301` | delete 1:1 conversation |
| `members.tsx:308` | remove member |
| `members.tsx:324` | leave conversation |
| `settings/index.tsx:157` | forget device |
| `settings/index.tsx:198` | sign out |
| `detail.tsx:622` | delete message |

## Bundle D — connection-request decline propagation

- **Schema:** `ConnectionRequest` gains optional `deniedAt` (same style as `approvedAt`) —
  `src/jazz/schema/ConnectionRequest.ts`.
- **Recipient:** `denyConnectionRequest()` (`src/jazz/invitations.ts:363`) additionally
  stamps `deniedAt` on the shared CoValue (same write mechanism as
  `approveConnectionRequest` stamping `approvedAt`), keeping the existing local cleanup.
- **Popup:** explicit **decline** button (danger) next to approve; closing (X / scrim)
  remains dismiss — `incoming-connection-prompt.tsx`. The pending-list deny action
  propagates the same way.
- **Requester:** the waiting screen watches `deniedAt` → terminal "declined" state (e.g.
  "they declined your request"); expiry handling unchanged.
- **Test:** extend the 9-0 regression pattern with a decline round-trip.

## Bundle E — invite-link management

- **Permanent option:** extend `LINK_TTL_OPTIONS` (`src/routes/contacts/add.tsx:20`) with
  "no expiry"; `createInvitation` (`src/jazz/invitations.ts:69-120`) handles absent expiry.
- **Surface the live-invites screen:** `/connections/live-invites` exists and is registered
  (`src/App.tsx:180`) but nothing links to it — link from the add-contact screen and from
  settings.
- **Reuse old links:** per-invite copy-link button on the live-invites rows.
- Permanent invites show "no expiry" instead of a countdown; revoke works unchanged
  (`src/routes/connections/live-invites.tsx`).

## Spike — duplicate conversations on group add

Reproduce with two accounts on the local sync server; instrument the
`useConversationInboxSubscription` dedup path (`src/jazz/conversation.ts:692-744`) —
suspected silent no-op of `known.$jazz.push` when `knownConversations` isn't resolved.
**Confirm the cause before fixing** (Unit 9-0 discipline); add a regression test.

---

## Sequencing & gates

- Order: **A → C → B → E → D** (C's `ConfirmDialog` is a dependency of B items 12/18; D's
  schema change goes last of the UI bundles). The spike runs in parallel.
- Each bundle merges `--no-ff` to main; subagent-driven development per repo process.
- Gates per bundle: `npm run typecheck`, `npm run check-tokens`, `npm run check-ui-purity`,
  `npm run parity`, plus targeted vitest/playwright for touched flows.

## Out of scope

- **Bundle F — conversation model** (`kind: "direct" | "group"` discriminator): separate
  brainstorm. Includes: 3rd-person-leaves→becomes-1:1, weird-1:1-group-after-leave-and-re-add,
  and "only groups in the profile shared-conversations section" (deliberately waits for the
  discriminator instead of shipping a member-count filter now).
- **Identity-code rename/shortening** (naming, letters+digits encoding, length/security
  tradeoff): separate brainstorm.
- Deferred features: NOX-42 (manual crop), NOX-43 (blocking), NOX-44 (direct chat links),
  NOX-45 (media gallery), NOX-46 (lightbox navigation), NOX-47 (wifi-only auto-download),
  NOX-48 (group overview page).

## Deliverables

- Bundles A–E as `--no-ff` merges; spike fix + regression test.
- CLAUDE.md status corrections (Unit 9 merged; feedback-round-2 entry) — landed with this
  spec commit.
