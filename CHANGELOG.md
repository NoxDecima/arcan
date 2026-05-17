# Changelog

## [Unreleased]

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
