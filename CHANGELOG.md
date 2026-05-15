# Changelog

## [Unreleased]

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
