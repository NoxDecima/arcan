# Changelog

## [Unreleased]

### Slice 4 — Conversation Lifecycle (archive + chronological system events)

**Closes:** NOX-16 (leave → archive), NOX-17 (admin-kick → archive), NOX-18 (chronological system events in timeline).

#### Added

- `SystemEvent` schema (`src/jazz/schema/SystemEvent.ts`): a CoValue with `kind` (`"left" | "added" | "removed" | "promoted"`), `subjectAccountID`, `occurredAt`, and a free-text `body`. Owned by the ConversationGroup so all current members can read it; revoked members see a NotLoaded proxy.
- `systemEvents: co.list(SystemEvent)` sidecar list appended to every `Conversation` at creation time (both 1:1 DMs and group conversations). `leaveConversation`, `addMemberToConversation`, `removeMemberFromConversation`, and `promoteToAdmin` all write a matching `SystemEvent` entry before (or alongside) the permission change.
- `SystemEvent` React component (`src/components/system-event.tsx`): renders a horizontally-centered pill in the timeline for each event kind. Testids: `system-event-left`, `system-event-added`, `system-event-removed`, `system-event-promoted`. Resolves the subject account's display name via the existing `resolveDisplayName` chain.
- Merged message + event timeline in `ConversationDetailRoute`: messages and system events are interleaved into a single sorted array by timestamp and rendered in document order, so events appear between the messages that bracket them.
- `isArchived(me, conversation)` primitive (`src/jazz/conversation.ts`): returns `true` when the caller has no role in the conversation's owning Group, or when the conversation/group is a NotLoaded proxy (post-revocation).
- `removeFromArchive(me, conversation)` primitive: splices the conversation out of `me.root.knownConversations` permanently (irreversible; shown behind a `window.confirm` guard).
- **Archived section in Sidebar**: conversations where `isArchived` returns `true` are partitioned into a collapsible "Archived (N)" section below the active list. Section header is a `<button>` toggling `archivedExpanded` state; each archived row links to the conversation detail and exposes an X button (`archived-remove-{i}`) to call `removeFromArchive`.
- **Archived-banner in `ConversationDetailRoute`**: when `archivedForMe` is true a top-of-panel amber banner is shown ("You're no longer a member of this conversation.") with a "Remove from archive" inline link. The Composer is hidden for archived conversations.

#### Changed

- `leaveConversation` (`src/jazz/conversation.ts`): after writing the `SystemEvent` entry, yields the event loop (`await Promise.resolve()`) to allow the event to sync before the crypto revoke; the conversation entry is **not** removed from `knownConversations`, so it lands in the Archived section automatically.
- `Sidebar` `knownConversations` resolve changed from `{ $each: true }` to `{ $each: { $onError: "catch" } }` so that inaccessible post-revocation conversations return NotLoaded proxies instead of blocking `me.$isLoaded` indefinitely.
- `ConversationDetailRoute` `useCoState` resolve drops the `systemEvents: { $each: true }` depth; system events are read directly from `conversation.systemEvents` in the render pass instead, avoiding a stall on conversations created before the sidecar list was added.
- `useNavigate()` hook call in `ConversationDetailRoute` moved before all conditional early-returns to satisfy React Rules of Hooks (was the root cause of blank-page regressions when navigating to a conversation from another browser context).
- `MembersRoute`: "Leave conversation" and "Remove" buttons are hidden when `isArchived` returns true (read-only view).

#### Test coverage

- **Unit tests** (unchanged count — Slice 4 additions are all e2e): 101 unit tests passing.
- **New e2e specs (4)**:
  - `archive-after-leave.spec.ts` — self-leave moves conversation to Archived section; archived-banner shown; composer hidden.
  - `archive-after-kick.spec.ts` — admin-kicks-member moves conversation to kicked member's Archived section; Alice sees `system-event-removed` pill.
  - `system-events-chronological.spec.ts` — system events render in the correct chronological position between messages in the timeline.
  - `archive-remove.spec.ts` — X button on an archived row permanently removes the conversation; Archived section disappears.
- **Updated e2e spec**: `leave-conversation.spec.ts` — assertions updated for Slice 4: conversation moves to Archived section rather than disappearing; Bob sees `system-event-left` pill.
- **Total**: 42 e2e tests passing (21 per browser).

#### Deferred

- Group avatar / icon (no design yet).
- Title-change system events (currently only membership-change events are recorded).
- Disband-group action (equivalent to removing all non-admin members and then leaving).
- Soft device revocation follow-up (NOX-10).

### Slice 3c — Polish (post-3b)

**Closes:** NOX-14 (demote button crashes), NOX-15 (stale `kind` after 1:1→group).

#### Changed
- Removed `kind: "dm" | "group"` discriminator from `Conversation` schema. Conversations now have a single shape; "1:1 with Bob" means "a conversation whose direct admin/writer members are exactly me + Bob".
- `findOrCreate1to1Conversation` discovers existing 1:1s by member-set match instead of by `kind === "dm"`. A former group that decayed to 2 members is returned correctly as the 1:1 with that contact.
- Sidebar synthesizes a conversation label from non-me members when no explicit `title` is set. Explicit titles always win. Renaming a contact propagates automatically.
- `updateConversationTitle` works on any conversation, not just groups.
- Message-header author resolution and MembersRoute name resolution share a single `resolveDisplayName` helper (`src/jazz/displayName.ts`). The chain is: self → contactBook displayNameLocal → group member profile → "Unknown".

#### Removed
- Demote button on MembersRoute admin rows. Cojson 0.20.18 forbids admin-to-admin demotion at the protocol level; the button could only crash. The `demoteToWriter` and `isLastAdmin` primitives in `src/jazz/conversation.ts` are retained for future self-demote / transfer-ownership work.
- Remove button hidden on admin rows (same cojson constraint: admin-remove-admin is forbidden). Remove button remains visible for writer rows.

#### Fixed
- Author display in group chats: messages from a member who is not in the local contact book now show that member's profile name instead of "Unknown".

#### Test coverage
- New unit tests for `resolveDisplayName` (9 cases) and for member-set-based discovery.
- New e2e assertion in `group-create.spec.ts` that a non-contact member's profile name resolves in the message header.
- Phase A reconnaissance test documenting cojson admin-remove-admin behavior.

#### Deferred
- Owner / manager / transfer-ownership concepts → future slice.
- Conversation lifecycle (disband group, archive, chronological events) → NOX-16, NOX-17, NOX-18.

### Slice 3b — Group Conversations + Member Management

- knownConversations refactor: `Account.root.knownConversations: co.list(Conversation)` replaces the per-contact `linkedConversation` cache; Inbox subscription populates it for both 1:1 and group conversations; sidebar iterates it as the single source of truth
- Group conversation creation: multi-select ContactPicker (2+ contacts selected → GroupCreateDialog for title → `createGroupConversation` → `knownConversations`) with Inbox notifications so all participants auto-discover via sidebar
- MembersRoute at `/conversations/:id/members`: member list with role pills, admin-only "Add member" button (ContactPicker with excluded-member list), per-member promote/remove/demote buttons, "Leave conversation" button at the bottom; members-link in conversation detail header navigates here
- Member add/remove with admin gating: `addMemberToConversation` sends Inbox notification so the new member's sidebar auto-discovers; `removeMemberFromConversation` revokes Jazz crypto access (readKey rotates)
- Role management: admin/writer distinction (creator = admin, added members = writer); `RolePill` badge component; `promoteToAdmin` works via `group.addMember(target, "admin")`; cojson 0.20.18 constraint: admin-to-admin demotion is not permitted by the protocol (only the target admin themselves can relinquish admin role) — documented in `src/jazz/conversation.ts:demoteToWriter`
- Last-admin promote-before-leave flow: `isLastAdmin` guard → `LeaveWithPromoteDialog` → `promoteToAdmin` + `leaveConversation` as one user action
- Inline group title edit on MembersRoute: admin clicks `group-title-display` → input appears; Enter/save-button saves via `updateConversationTitle`; Esc cancels; 60-char max; writer role sees read-only display
- SystemEvent component extracted for left/added events; `system-event-left` and `system-event-added` testids
- Test counts: 79 unit tests passing, 34 e2e tests passing (17 per browser: 6 new specs added — group-create, group-member-management, group-roles, last-admin-leave ×2, group-title-edit)

### Slice 3b known limitations

- cojson 0.20.18 prevents an admin from downgrading another admin's role; the UI exposes a Demote button for admin rows but the protocol call throws — only self-demotion is possible, which the current UI does not expose
- Group conversation `kind` field stays `"dm"` when a 1:1 DM has a third member added via MembersRoute "Add member" (the kind is set at creation time and is immutable); this is a cosmetic inconsistency in title derivation
- No group avatars/icons (deferred to Slice 4)
- No role-change or title-change system events in timeline (only join/leave events in v1)
- Disband group action and archived conversations view deferred (Linear task #25)

### Slice 3a — 1:1 Conversations + Messaging Foundation

- Schema additions: Message.deleted, Message.editedAt
- Schema removal: Conversation.authorWriteGroups (registry-poisoning attack vector)
- Self-creating per-author WriteGroups: each participant creates their own WriteGroup on first send. Author derivation reads the create-transaction signer (immutable signed bytes), validated against well-formedness of the owning WriteGroup. Scales naturally to groups (Slice 3b) and structurally defeats both the "two direct writers" forgery and the "demote-trick" sequencing attack.
- 1:1 conversation creation on Start chat from contact detail page (lazy)
- Conversation list in the sidebar (replaces contact list); "+" opens contact picker
- Contacts moved to /contacts (full page) accessible via sidebar footer link
- Message composer (Enter sends, Shift-Enter newline) and message bubbles (own/other variants, edited indicator, deleted placeholder)
- Edit own message (soft, in-place body overwrite, edited + editedAt flags)
- Delete own message (soft: body cleared, deleted: true, placeholder rendered)
- Leave conversation (cryptographic revoke from ConversationGroup; closes NOX-9)
- Connection-status banner shown only when offline
- E2E tests: messaging-1to1, leave-conversation, conversation-list-ordering

### Slice 3a known limitations

- No group conversations yet (Slice 3b)
- No "delete for me" — delete is always for everyone
- No edit-history view (we don't surface previous versions of edited messages)
- Conversation discovery is via Contact.linkedConversation cache; "iterate all my conversations" path will come in Slice 3b
- Soft revoke device follow-up (NOX-10) remains deferred

### Slice 2 — QR Pairing + Contact Invitations

- New `EphemeralPairing` CoValue schema for the QR multi-device pairing handshake.
- Added `linkedConversation` optional field to `Contact` (deferred from Slice 1).
- New `src/auth/pubkey.ts` extracts real Ed25519 pubkey hex from an account.
- New `src/auth/session.ts` derives real session fingerprint; `JazzMessangerAccount` migration now uses it (Slice 1 placeholder retired for new accounts; existing accounts keep their random-UUID values).
- Settings → Account now shows safety number derived from the real Ed25519 pubkey.
- QR multi-device pairing: existing device generates QR + copy URL on `/pair?role=initiator`; new device camera-scans or pastes URL on `/pair#…` and joins the existing account via sealed-box account-secret transfer.
- Contact invitations: inviter generates QR + copy URL on `/contacts/add`; recipient opens `/invite#…` to accept; mutual contact entries created with TOFU-pinned Ed25519 fingerprints.
- Pending invites section in Settings (revoke action).
- Contact detail page with safety number + remove.
- Migrated routing from state machine to `react-router-dom`; `/pair`, `/invite`, `/contacts/add`, `/contacts/:id` all work via direct URL entry.
- New e2e tests: device pairing, contact invitation, invite-before-signin replay.

### Slice 2 round 3 fixes

- Switched pairing protocol from secretSeed transfer to accountSecret (AgentSecret) transfer. Sidesteps the secretSeed clobbering bug that affected repeated pairings within a single session.
  - Trade-off: paired devices cannot display the passphrase via `getCurrentAccountPassphrase()`. The original device retains this capability. Document as a known property.
- Added "Back to home" button on the initiator's pair-complete screen.
- Added "Sign out" button in Settings → Account that clears local credentials and returns to onboarding.
- Added soft device revocation in Settings → Devices. Marks DeviceRecord.revoked = true and hides from the list. Full cryptographic revocation (account secret rotation) deferred to E1.1.

### Slice 2 known limitations

- Conversations are not yet created on invite acceptance — `Contact.linkedConversation` stays null. Slice 3 adds conversation creation.
- Pending invites' "Copy link" button only works within the original inviter's session (the invite-agent secret isn't stored on the Invitation CoValue; it lives in the URL fragment that was generated at creation). Documented as a known limitation; users should re-generate if they lose the link.
- Session fingerprints for old DeviceRecords created during Slice 1 remain `crypto.randomUUID()` values; they are not retroactively migrated.
- Old DeviceRecords keep their `crypto.randomUUID()` values for `sessionFingerprint`; real session-derived fingerprints apply only to new accounts created in Slice 2+.
- The "everyone writer" pattern is used instead of writerInvite-agent scoping for both pairing and invitations; tighter access control is planned for a future slice.
- The responder device is not automatically registered as a `DeviceRecord` after QR pairing; Settings → Devices shows only the original device. Slice 3 can wire this up via a post-pair migration or hook.

### Slice 1 — Foundation + Account Creation

- Vite + React 18 + TypeScript + Tailwind v3 + shadcn/ui project scaffold.
- jazz-tools 0.20.18 integration with passphrase auth via `usePassphraseAuth`.
- Local sync server runnable via `npm run sync` (binds `ws://localhost:4200`).
- All eight CoValue schemas: MessangerProfile, DeviceRecord, Contact + ContactBook, Invitation, FileBlob, Message, Conversation, JazzMessangerAccount + JazzMessangerAccountRoot.
- Account migration hook initializes profile (publicly readable) and root (account-private contactBook, devices, invitesIssued).
- Onboarding flow: welcome → passphrase display → passphrase confirm (random-word challenge) → profile (account creation) → home.
- Restore-account flow via 24-word passphrase.
- Home screen with sidebar (display name + contact list) and empty state.
- Settings page with Profile, Devices, and Account (safety number) sections.
- End-to-end tests in Chromium and Firefox covering account creation, persistence across reload, and restore on a fresh context.
- Companion docs: design spec, threat model, jazz-tools 0.20.18 API survey.

### Known limitations
- Single-device account loss = account loss (no email recovery yet — planned for E1.1).
- No per-message forward secrecy (planned for E2).
- No QR multi-device pairing yet (Slice 2).
- No contact invitations / conversations / groups yet (Slices 2, 3, 4).
- `sessionFingerprint` on DeviceRecord uses `crypto.randomUUID()` placeholder; real session-derived value awaits a Slice 2 helper.
- `formatSafetyNumber` input is a hex transformation of the account ID rather than a real Ed25519 pubkey; awaits Slice 2.
- Tailwind v3 chosen over v4 to match shadcn/ui standard config; revisit when shadcn fully supports v4.
