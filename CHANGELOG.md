# Changelog

## [Unreleased]

### Slice 7 — Zero-knowledge email + password auth

**Closes:** E1a §9.4 / threat-model "Account recovery story" — replaces the bare 24-word passphrase as the primary credential with the email + password pair users actually expect, without giving up the zero-knowledge property (the server still cannot decrypt anyone's Jazz seed).

#### Added

- `auth-server/` — new Node service running Better Auth 1.6 on Hono + better-sqlite3, with a custom `jazzZkPlugin` that augments the `user` table with `kdfSalt` / `encryptedSeed` / `recoveryProofHmac` / `accountID` columns (all client-derived, opaque to the server). Endpoints: stock Better Auth `/sign-up/email` + `/sign-in/email` + `/sign-out` + `/change-password` plus custom `/me/auth-material` (session-gated) and `/reset-with-recovery` (HMAC-proof-gated).
- `src/auth/kdf.ts` — Argon2id key derivation + AES-GCM envelope (`deriveKey`, `encryptSeed`, `decryptSeed`).
- `src/auth/recovery-proof.ts` — HMAC-SHA256(seed, "jazz-messanger:recovery-reset") so the server can verify the user knows the seed at recovery time without ever seeing it.
- `src/auth/flows.ts` — orchestration for `signUp` / `signIn` / `recoverWithCode` / `changePassword` / `getRecoveryCodeFromAuthMaterial`. Sequences Jazz account creation, KDF, AES envelope, and Better Auth POSTs; rolls back local Jazz credentials on a failed server POST.
- `src/auth/client.ts` — Better Auth client singleton (plugin id-matches the server's `jazz-zk-plugin`). Imported for side-effects from `src/jazz/provider.tsx`.
- `src/jazz/createAccountFromSeed.ts` — React-hook bridge (`useCreateAccountWithSeed`, `useSetDisplayNameOnMe`, `useSignInToJazzWithSeed`) that closes over the Jazz context's `register` / `authenticate` / `AuthSecretStorage` and persists the seed-derived account under provider tag `"better-auth"`.
- `src/routes/onboarding/credentials-step.tsx` — new onboarding step: email + username + password + confirm, with local regex / length validation.
- Renamed `passphrase-step` → `backup-display-step.tsx` + `backup-confirm-step.tsx`; new `restore-with-code-step.tsx` (sign-in via 24-word recovery code).
- `src/routes/onboarding/restore-choice-step.tsx` — fork between "I have an email/password account" and "I have a 24-word recovery code".
- `src/routes/onboarding/index.tsx` state machine rewired to welcome → (credentials → backup-display → backup-confirm → profile) | (restore-choice → login / restore-with-code).
- `src/routes/auth/login.tsx` + `src/routes/auth/recovery.tsx` — new auth routes; recovery is two-stage (decode code + sign in, then optionally set a new password).
- `src/routes/settings/change-password-modal.tsx` + `view-recovery-code-modal.tsx` + buttons in `account-section.tsx`.
- `deploy/Dockerfile.auth` + `deploy/migrate.mjs` + `auth` service in `docker-compose.yml` + `handle /api/auth/*` block in `Caddyfile` + `BETTER_AUTH_SECRET` in `.env.example`.
- `vite.config.ts` server.proxy: `/api/auth → http://localhost:4300`, `/sync → ws://localhost:4200` (so the dev browser sees same-origin cookies for Better Auth).
- `scripts/migrate-auth-server.mjs` + `scripts/auth-server-with-migrate.sh` — runs Better Auth migrations before booting the dev/e2e auth-server. Wired into `playwright.config.ts` webServer array so `npm run test:e2e` spins up the full sync + auth + dev stack with a clean schema.

#### Changed

- App routing inversion (`src/App.tsx`): unauthenticated users now land on `/auth/login` (not `/onboarding`). `/onboarding` remains reachable via the "Create new account" link on the login screen. `/pair` and `/invite` keep their auth-optional carve-outs.
- `src/jazz/provider.tsx` — side-effect imports `@/auth/client` so the Better Auth nanostore singleton is ready before any component calls `authClient.useSession()`.
- `tests/e2e/helpers.ts` `createAccount` now walks the email/password onboarding flow and returns `{ credentials, recoveryCode, displayName }` (was `{ phrase, displayName }`). Adds `signIn(page, credentials)` helper, `freshCredentials(prefix)`, and `captureRecoveryCode(page)`. All Slice 1-5 e2e specs auto-migrated; `restore-account.spec.ts` was deleted in favor of `recovery-with-code.spec.ts` + `login-email-password.spec.ts` covering both restore paths.
- `tests/e2e/account-creation.spec.ts` and `tests/e2e/invite-before-signin.spec.ts` updated for the new flow / routing inversion.

#### Test coverage

- Unit: +9 tests for `kdf.ts`, +3 for `recovery-proof.ts`, +7 for `flows.ts`, +1 password-leak regression scanning localStorage/sessionStorage. 132 total Vitest tests (was 111).
- Server-side: +7 unit tests in `auth-server/tests/` covering plugin contract (`/sign-up`, `/sign-in`, `/reset-with-recovery`, missing-header rejection) plus a zero-knowledge regression that dumps every row of every table and asserts neither the plaintext password nor the seed bytes appear anywhere.
- E2E: +6 new specs — `signup-email-password`, `login-email-password`, `recovery-with-code`, `change-password`, `invalid-credentials` (4 sub-tests), `auth-server-down`.

#### Deferred (filed as followups, not in this slice)

- OAuth providers + Passkey enrollment.
- Strict ZK via PAKE / OPAQUE (current scheme leaks password to the server during sign-in; the trade-off is documented in the spec).
- Email verification + transactional email.
- Account deletion + username tombstoning.
- Recovery-code rotation UI.
- Multi-session UI.
- Password strength meter, breach checks (HIBP).
- Migration script for existing Slice 1-6 accounts (those users will see the new login screen on next reload and need to re-create — acceptable for pre-release; documented as known break).

### Slice 6 — Caddy + TLS Docker Compose deploy

**Closes:** E1a §9.2 (Production deployment) — minimum viable VPS deploy story.

#### Added

- `deploy/Dockerfile.caddy` — multi-stage build: `node:22-alpine` runs `npm ci && npm run build`, then `caddy:2-alpine` serves the resulting `dist/` from `/usr/share/caddy` and reverse-proxies `/sync/*` to the sync container.
- `deploy/Dockerfile.sync` — `node:22-alpine` + `npm install -g jazz-tools@^0.20.0`; CMD runs `jazz-run sync --host 0.0.0.0 --port 4200 --db /data/sync.sqlite`. Listens only on the internal Docker network; not exposed on the host.
- `deploy/Caddyfile` — one site block for `{$DOMAIN}`. `handle_path /sync/*` strips the prefix before reverse-proxying (Caddy handles the WebSocket `Upgrade` natively). `tls {$ACME_EMAIL}` enables auto-TLS via Let's Encrypt HTTP-01.
- `deploy/docker-compose.yml` — two services + named `caddy_data` and `caddy_config` volumes (cert state must persist across rebuilds) + bind mount `./data:/data` for the SQLite file (operator-inspectable). Sync service has no `ports:` block.
- `deploy/.env.example` — `DOMAIN` + `ACME_EMAIL` template, separate from the repo-root `.env.example` (which stays for local dev).
- `deploy/README.md` — one-page operator guide: prerequisites, quick start, verify, update, on-disk data, reserved path, troubleshooting.
- `.dockerignore` at repo root — excludes `node_modules`, `tests/`, `.vite/`, `dist/`, `.env*`, `.jazz-data/`, `deploy/data/`, etc. Trims the build context for both Dockerfiles.

#### Changed

- `src/jazz/provider.tsx` — when `VITE_SYNC_URL` is unset, the default sync URL is derived at runtime from `window.location` (`wss://<host>/sync/` over HTTPS, `ws://<host>/sync/` over HTTP). Makes the built Docker image domain-portable: the same image works on any domain without rebuild. The existing `VITE_SYNC_URL` override still wins when set (used for local Tailscale dev, etc.).

#### Test coverage

- Unit: +4 tests in `tests/unit/jazz/provider.test.ts` covering the derivation matrix (SSR-undefined window, HTTPS host, HTTP host, non-standard port). 111 total.
- Smoke: `docker compose config` validates; `docker compose build` completes. Full end-to-end run-on-a-real-domain test is operator-side (documented in `deploy/README.md`).

#### Fixed (build hygiene, discovered while implementing this slice)

- Strict-mode TypeScript breaks that had accumulated since around Slice 3 — `verbatimModuleSyntax` violations on React event imports (`composer.tsx`, `profile-section.tsx`); `erasableSyntaxOnly` violations in `AttachmentTooLargeError`; `MaybeLoaded<Account>` not narrowing into handler closures across `sidebar.tsx`, `members.tsx`, `contacts/detail.tsx`, `conversations/detail.tsx`; `Settled<Account>` Inaccessible variant in `loadAccountByID`; `knownConversations` access on a `never`-narrowed migration branch; unused `demoteToWriter` import in `members.tsx`. All masked by the documented "verify clean" step running `tsc --noEmit` against the root `tsconfig.json` (`files: []`) which type-checks nothing. `npm run build` now passes; **NOX-25** tracks switching every plan's verify step from `npx tsc --noEmit` to `npm run build` so this can't recur.

#### Deferred

- Backups of `./data/sync.sqlite` and the `caddy_data` volume — specced at high level in E1a §7.2 (weekly encrypted snapshots, off-site object storage). Out of scope for the first deploy.
- Per-account quotas / abuse heuristics.
- Monitoring / log shipping.
- DNS-01 ACME challenge / wildcard certs.
- Docker Compose support for local development (kept on `npm run dev` + `npm run sync`).

### Slice 5 — Inline media + profile avatars

**Closes:** E1a §9.1 "inline media (≤5 MB)" line item; Profile.avatar UI gap.

#### Added

- `src/jazz/attachments.ts` — `uploadAttachment(owner, file)` primitive + `AttachmentTooLargeError` + `MAX_ATTACHMENT_BYTES`. Wraps `co.fileStream().createFromBlob` and wraps the resulting FileStream in a FileBlob CoMap owned by the same group as its parent.
- `src/jazz/avatar.ts` — `setProfileAvatar(me, file)` + `clearProfileAvatar(me)`. The avatar FileBlob is owned by the profile's owning group.
- `src/jazz/avatarResolver.ts` — `resolveAvatarFileBlob({ accountID, me, group? })`, mirrors `resolveDisplayName`'s lookup order. Also exports `useRemoteAvatar(accountID)` — a reactive hook that loads a remote account's `profile.avatar` FileBlob by ID. Needed because the `Contact` schema stores `contactAccountID: string` (not an Account ref), so the contact-book branch of the sync resolver has no path to the avatar; the hook backfills via `useCoState(JazzMessangerAccount, accountID, { resolve: { profile: true } })`.
- `<Avatar>` (`src/components/avatar.tsx`) — round container; loads the FileStream as a Blob via `co.fileStream().loadAsBlob` → object URL; revokes on unmount + on FileStream-ID change.
- `<AttachmentTile>` (`src/components/attachment-tile.tsx`) — pending vs sent modes; image vs file branches.
- `<ImageLightbox>` (`src/components/image-lightbox.tsx`) — Esc / backdrop-click / close-button dismiss.
- `<ComposerAttachmentTray>` (`src/components/composer-attachment-tray.tsx`) — pending tray above the composer textarea.
- Avatar surfaces: sidebar header, members route, contacts list (via `useRemoteAvatar`), contacts detail (via `useRemoteAvatar`), per-message bubble gutter (both 1:1 and groups), settings profile section (upload + Remove).

#### Changed

- `sendMessage` (`src/jazz/messages.ts`) — new optional `attachments: FileBlob[]` parameter. Empty array is the default for backward compatibility.
- `Composer` (`src/components/composer.tsx`) — paperclip button + clipboard-paste handler + pending tray + tray-aware Send. New `getWriteGroup` prop so the composer can request the author's WriteGroup at upload time. New `onSend(body, attachments)` signature. Error surface is a single `string | null` with 4-second auto-dismiss (the design spec sketched `errors: string[]`; the implemented shape collapses transient pick/upload failures into one banner).
- `MessageBubble` (`src/components/message-bubble.tsx`) — renders `<AttachmentTile mode="sent">` per attachment under the body text; new leading avatar gutter for every bubble (1:1 + group, mine + other). The deleted-message branch also renders the gutter for layout consistency.

#### Fixed

- `Composer` type-only import: `PendingAttachment` re-imported with the `type` modifier to comply with `verbatimModuleSyntax` (the type-erased name was leaking into runtime ESM and failing Vite's module resolution).
- `MessageBubble` lightbox blob-URL leak: revocation moved into a `useEffect` cleanup keyed on `lightboxSrc`, so each new lightbox open revokes the prior URL and bubble unmount revokes the final one. Previously the URL leaked when the bubble unmounted while the lightbox was open or when a second image was opened without explicitly closing the first.

#### Test coverage

- Unit: 107 passing (the 6 net-new Phase-A tests are bundled in the existing 24 files).
- E2E: +11 net-new test executions across 6 specs — `attachment-image`, `attachment-file`, `attachment-multiple`, `attachment-paste` (Chromium only; see Deferred), `attachment-too-large`, `profile-avatar`. 47 e2e passing in total (Chromium + Firefox); 1 skipped (paste on Firefox).
- 3 fixtures committed: `tests/e2e/fixtures/{tiny.png,tiny.pdf,oversized.bin}`.

#### Deferred

- True deletion of body / attachments (orphan-scrub + Jazz local-cache GC investigation) — tracked as **NOX-21**.
- Deduplicate the inline `co.profile({...})` shape in `JazzMessangerAccount.ts` (currently appears in both the schema decl and the migration's create call — adding a field requires editing both) — tracked as **NOX-22**.
- Migrate `Contact.contactAccountID` (string) to `co.ref(JazzMessangerAccount)` and drop the `useRemoteAvatar` hook — tracked as **NOX-23**.
- Extract `pairAccounts` + `startOneToOneChat` e2e helpers (5+ specs copy-paste the same two-account QR-invite + start-chat boilerplate) — tracked as **NOX-24**.
- Drag-and-drop attachment onto window.
- Optimistic send with per-attachment upload progress.
- Link / PDF / text-file previews.
- Cropping at avatar upload.
- Firefox clipboard-paste e2e coverage — synthetic `ClipboardEvent` constructed in the page does not deliver `clipboardData.files` to listeners under Gecko; the spec is `test.skip`-gated on `browserName === "firefox"`. The composer's paste handler itself works in real Firefox use; only the synthetic-event test path is unreachable.

### Post-Slice-4 — Revert archive UI

Manual validation surfaced that post-revoke Jazz semantics hide all conversation
contents from the revoked account: messages, system events, and the title are
all unreadable once `removeMember(me)` lands. The Slice 4 archive view therefore
rendered as an empty "Conversation" page with only the banner — not the
"viewable last-known history" the spec promised.

Decision: drop the archive concept entirely. Conversations the user leaves (or
is kicked from) disappear from their sidebar. An export-before-leaving workflow
may be added later as a distinct feature.

#### Changed

- `leaveConversation` (`src/jazz/conversation.ts`): after writing the `left`
  system event and self-revoking, splices the conversation out of
  `me.root.knownConversations`. The previous Slice-4 behaviour of keeping the
  entry was based on a wrong assumption about Jazz revocation semantics.
- `Sidebar` (`src/components/sidebar.tsx`): drops the Archived section entirely.
  `isArchived` is still used to filter kicked conversations out of the active
  list so they don't render as broken stubs.
- `ConversationDetailRoute` / `MembersRoute`: when `isArchived` is true, both
  routes redirect to `/conversations`. Removes the archived banner, the
  "Remove from archive" link, the composer-hide branch, and the read-only
  member-list gating.

#### Removed

- `removeFromArchive` export (replaced by an internal
  `removeFromKnownConversations` helper used only by `leaveConversation`).
- E2E specs `archive-after-leave.spec.ts`, `archive-after-kick.spec.ts`,
  `archive-remove.spec.ts` — no longer reflect shipped behaviour.

#### Test coverage

- Unit: 98 passing.
- `leave-conversation.spec.ts` reverted to asserting the conversation
  disappears from the sidebar (the pre-Slice-4 behaviour) and Bob still sees
  the `system-event-left` pill.

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
