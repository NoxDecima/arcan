# Slice 2 — QR Multi-Device Pairing + Contact Invitations

**Date:** 2026-05-16
**Status:** Brainstorming complete; awaiting implementation plan
**Slice of:** E1a (MVP) per `docs/superpowers/specs/2026-05-15-jazz-messanger-design.md`
**Builds on:** Slice 1 (foundation + account creation), merged to `main` at commit `2197771`, tag `slice-1-complete`
**Companion docs:** `docs/security/threat-model.md`, `docs/jazz-api-notes.md`

---

## 1. Goal

By the end of Slice 2, three browser contexts on one machine — all using the same local sync server — can:

- Pair a new browser context as a second device of an existing account via QR scan or pasted URL. Both devices then show identical account state (display name, contacts).
- Establish mutual contact between two different accounts via an invite link or QR. Both sides see the other in their sidebar with a real Ed25519-fingerprint-derived safety number.

Slice 2 also retires the two Slice 1 placeholders (`sessionFingerprint`, safety number) by extracting the real underlying Jazz crypto material.

**Slice 2 does NOT create Conversations.** That belongs to Slice 3. `Contact.linkedConversation` is added as an optional field but stays null after invite acceptance.

---

## 2. Scope

### In scope
- Replace `sessionFingerprint` placeholder with a real session-key-derived value
- Replace safety-number placeholder with real Ed25519 pubkey extraction
- Add `Contact.linkedConversation` optional ref field (deferred from Slice 1)
- New `EphemeralPairing` CoValue schema
- QR multi-device pairing protocol and UI (initiator + responder)
- Contact invitation protocol and UI (inviter + recipient)
- Pending invites panel in Settings (list + revoke)
- Adopt `react-router-dom` for real URL routing
- Camera-based QR scanning via `qr-scanner` library, with always-visible paste fallback
- E2E test coverage for both flows

### Out of scope for Slice 2 (Slice 3+)
- Creating `Conversation` CoValues
- Per-author `WriteGroup`s
- Messaging UI of any kind
- "Verify safety number" prompt during first conversation

### Out of scope for Slice 2 (E1.1+)
- Better Auth email-recovery bridge
- Disappearing messages
- Message-request inbox
- Username-searchable contact discovery

---

## 3. Architecture

### 3.1 New files

| Path | Responsibility |
|---|---|
| `src/jazz/schema/EphemeralPairing.ts` | One-shot CoValue for the QR pairing handshake |
| `src/auth/pubkey.ts` | Extract Ed25519 pubkey hex from an Account |
| `src/auth/session.ts` | Derive session fingerprint from current Jazz session |
| `src/qr/encoder.tsx` | Wraps `qrcode.react` for QR display |
| `src/qr/scanner.tsx` | Webcam scanner via `qr-scanner`, with paste-textarea sibling |
| `src/jazz/pairing.ts` | Protocol primitives for QR pairing (create / watch / seal / complete) |
| `src/jazz/invitations.ts` | Protocol primitives for contact invitations (create / watch / accept) |
| `src/routes/pair/index.tsx` | `/pair` route handler — decides initiator vs responder by URL state |
| `src/routes/pair/initiator-step.tsx` | Existing device UI (QR + URL + copy + status) |
| `src/routes/pair/responder-step.tsx` | New device UI (camera + paste, confirm, complete) |
| `src/routes/invite/index.tsx` | `/invite#…` handler with accept/decline UI |
| `src/routes/contacts/add.tsx` | Issue-new-invite UI on the inviter side |
| `src/routes/settings/invites-section.tsx` | Pending invites list |
| `src/components/qr-display.tsx` | Reusable visual QR component for both invite + pair URLs |

### 3.2 Files to modify

| Path | Change |
|---|---|
| `src/jazz/schema/Contact.ts` | Add `linkedConversation` optional field (getter pattern for forward-ref) |
| `src/jazz/schema/JazzMessangerAccount.ts` | Replace `crypto.randomUUID()` with real `sessionFingerprint` derivation |
| `src/routes/settings/account-section.tsx` | Use real pubkey hex via `pubkey.ts` |
| `src/routes/settings/devices-section.tsx` | Add "Link new device" button → `/pair?role=initiator` |
| `src/routes/settings/index.tsx` | Wire the new Invites section |
| `src/components/sidebar.tsx` | Add "+ Add contact" affordance (button in empty state and in header when contacts exist) |
| `src/App.tsx` | Replace state-machine routing with `react-router-dom`; preserve auth gating |
| `docs/jazz-api-notes.md` | Append findings on pubkey/session/sealed-box APIs as they're discovered |

### 3.3 New npm dependencies

| Package | Why | Approx size |
|---|---|---|
| `react-router-dom` | URL routing for `/pair`, `/invite`, `/contacts/add`, `/settings/*` | ~12 kB gzipped |
| `qrcode.react` | Render QR codes as SVG/canvas | ~6 kB gzipped |
| `qr-scanner` (`@yudiel/react-qr-scanner` is an alternative; verify) | Camera-based QR decoding via WebWorker | ~50 kB gzipped |

Pin exact versions per project convention (`--save-exact`).

---

## 4. Data model changes

### 4.1 New: `EphemeralPairing`

```ts
// src/jazz/schema/EphemeralPairing.ts
import { co, z } from "jazz-tools";

export const EphemeralPairing = co.map({
  // Initiator-set fields (at creation)
  initiatorPubkey: z.string(),         // base64url-encoded X25519 pubkey
  initiatorAccountID: z.string(),
  initiatorDisplayName: z.string(),     // shown to responder during confirm
  createdAt: z.date(),
  expiresAt: z.date(),                  // createdAt + 5 minutes

  // Responder-set fields (after scanning/pasting)
  responderPubkey: z.string().optional(),  // base64url X25519 pubkey

  // Initiator-set fields (after user approves the pairing)
  wrappedAccountSecret: z.string().optional(), // base64url sealed-box ciphertext

  // Responder-set fields (after persisting the secret)
  responderSessionFingerprint: z.string().optional(),
});
```

Owned by an ephemeral `pairingGroup` with `me = admin` and a fresh `pairingAgent = writerInvite` — same invite-agent pattern used for contact invites. The agent's secret is what the responder uses to authenticate.

Lifecycle is bounded by the 5-minute `expiresAt` plus the initiator tombstoning the CoValue after `responderSessionFingerprint` appears. No separate `consumed` flag is needed.

### 4.2 Modified: `Contact`

```ts
// src/jazz/schema/Contact.ts
import { co, z } from "jazz-tools";
import { Conversation } from "./Conversation";  // safe to import here

export const Contact = co.map({
  contactAccountID: z.string(),
  pinnedFingerprint: z.string(),         // real Ed25519 pubkey hex (Slice 2 promotes from placeholder)
  displayNameLocal: z.string(),
  addedAt: z.date(),
  notes: z.string().optional(),

  // Slice 2 addition (deferred from Slice 1).
  // Stays null after invite acceptance; populated by Slice 3 when a conversation is started.
  get linkedConversation() {
    return Conversation.optional();
  },
});
```

Getter pattern is required because of the forward reference to `Conversation`.

---

## 5. QR multi-device pairing protocol

### 5.1 Initiator side (existing device, `/pair?role=initiator`)

1. Generate ephemeral X25519 keypair `K_e` client-side.
2. Generate ephemeral pairing-agent identity (Jazz agent with its own keypair).
3. Create `pairingGroup`: `me = admin`, `pairingAgent = writerInvite`. Jazz auto-wraps the readKey for both.
4. Create `EphemeralPairing` owned by `pairingGroup`, populated with `initiatorPubkey = K_e.pub`, `initiatorAccountID`, `initiatorDisplayName`, 5-minute expiry.
5. Build URL: `${origin}/pair#${base64url(pairingCoValueID || pairingAgentSecret || K_e.priv)}`.
6. Render: QR of URL + URL text + "Copy link" button + "Waiting for new device..." status.
7. Subscribe to `EphemeralPairing.responderPubkey`. When set:
   1. Show confirm dialog: "A new device wants to link to your account. Approve?" with cancel option.
   2. On approve: compute `wrappedAccountSecret = base64url(nacl_sealedbox(accountSecret, to: K_n.pub, from: K_e.priv))`. Write to CoValue.
   3. Wait for `responderSessionFingerprint`. Once set: tombstone the pairing CoValue + group. UI flips to "New device linked".

### 5.2 Responder side (new device, `/pair#…`)

1. Parse fragment → `pairingCoValueID`, `pairingAgentSecret`, `K_e.pub`.
2. Authenticate as the pairing agent (Jazz API: load `Agent` from secret — exact call to verify in implementation).
3. Load `EphemeralPairing` via that agent's read access. Show "Joining {initiatorDisplayName}'s account".
4. Generate ephemeral X25519 keypair `K_n`. Write `responderPubkey = K_n.pub`.
5. Show "Waiting for {initiatorDisplayName} to approve..."
6. When `wrappedAccountSecret` appears: unseal with `K_n.priv` + `K_e.pub` → `accountSecret`.
7. Log in to the existing account using the raw account secret. Same low-level API path that `usePassphraseAuth.logIn` uses for passphrase-derived secrets — needs verification during implementation.
8. Once logged in: derive real `sessionFingerprint` for this device's new session via `src/auth/session.ts`. Append a new `DeviceRecord` to `me.root.devices`.
9. Write that fingerprint back to `EphemeralPairing.responderSessionFingerprint` so the initiator's client knows pairing completed.
10. Navigate to `/`.

### 5.3 Security properties

- Account secret never appears on the sync server in plaintext. The seal is to `K_n.pub`, which only the responder device possesses.
- The pairing agent secret is in the URL fragment (browsers don't send fragments to the server).
- 5-minute `expiresAt` plus tombstone-on-completion bound the attack window if the QR is photographed.
- Initiator approval gate prevents an attacker who somehow knows the URL from completing the pairing without the existing device's user clicking approve.

---

## 6. Contact invitation protocol

### 6.1 Inviter side (`/contacts/add`)

1. Generate ephemeral Ed25519 + X25519 invite-agent keypair.
2. Create `InviteGroup`: `me = admin`, `inviteAgent = writerInvite`.
3. Create `Invitation` CoValue (Slice 1 schema, unchanged) owned by `InviteGroup`. Populate with: `inviterAccountID`, real `inviterFingerprint` (Ed25519 pubkey hex), `inviterDisplayName`, `createdAt = now`, `expiresAt = now + 7 days`, `consumed: false`.
4. Append the Invitation ref to `me.root.invitesIssued`.
5. Build URL: `${origin}/invite#${base64url(InviteGroupID || inviteAgentSecret)}`.
6. Render: QR of URL + URL text + "Copy link" button + "Waiting for acceptance..." + "Cancel" (tombstones the InviteGroup).
7. Subscribe to Invitation. When `acceptedAt` is set:
   1. Verify recipient signature on the acceptance transaction (validates `recipientAccountID` matches the signing key).
   2. Add a `Contact` to `me.root.contactBook`: `contactAccountID = recipientAccountID`, `pinnedFingerprint = recipientFingerprint` (real Ed25519 pubkey hex), `displayNameLocal = recipientDisplayName` (user can edit later), `addedAt = now`.
   3. Mark Invitation `consumed = true`; tombstone the InviteGroup.
   4. UI flips to "Added {displayName} to your contacts" with "Close" button → `/`.

### 6.2 Recipient side (`/invite#…`)

1. Parse fragment → `InviteGroupID`, `inviteAgentSecret`.
2. **Auth gate:**
   - Signed in → proceed to step 3.
   - Not signed in → stash fragment in `sessionStorage` under a known key, redirect to `/` (onboarding). On first successful sign-in, the auth flow checks for a stashed fragment and replays `/invite#…`.
3. Authenticate as invite agent, load `InviteGroup` + `Invitation`. Show: inviter display name + safety number formatted from `inviterFingerprint`.
4. Show accept / decline buttons.
   - Decline: navigate away. Invitation stays as-is and will expire.
   - Accept: continue.
5. On accept:
   1. Use `writerInvite` role to add self to `InviteGroup` as `writer`.
   2. Write to Invitation: `recipientAccountID`, real `recipientFingerprint`, `recipientDisplayName` (from current user's profile), `acceptedAt = now`.
   3. Add a `Contact` to `me.root.contactBook`: `contactAccountID = inviterAccountID`, `pinnedFingerprint = inviterFingerprint`, `displayNameLocal = inviterDisplayName` (user can edit later), `addedAt = now`.
   4. UI shows "Added {inviterDisplayName} to your contacts" → "Go home" → `/`.

### 6.3 Security and bearer-token properties

- Invite link is bearer-token: anyone with the URL can accept.
- One-shot consumption guards against multiple accepters (the inviter's client refuses subsequent acceptance writes after `consumed = true`).
- 7-day default expiry; pending invites past expiry are visible in Settings → Invites but cannot be accepted.
- Pinned fingerprint locks in the recipient/inviter's Ed25519 identity at first contact (TOFU). Visible in contact detail (Slice 2) and used for verification prompts in Slice 3.

---

## 7. Placeholder replacements

Implemented early in the slice so subsequent code uses the real values.

### 7.1 `src/auth/pubkey.ts`

Extracts the Ed25519 public key hex (32 bytes / 64 hex chars) from a loaded Jazz account. API discovery against jazz-tools 0.20.18 — likely available via `me.$jazz.localNode.crypto` or a similar accessor. Once located:

- `account-section.tsx` switches to `formatSafetyNumber(getAccountPubkeyHex(me))` instead of the hex-transform hack.
- Both invitation and pairing code populate `pinnedFingerprint`, `inviterFingerprint`, `recipientFingerprint` with the real value.

### 7.2 `src/auth/session.ts`

Derives a stable fingerprint of the current device's session signing key. Same discovery path as pubkey extraction. Once located:

- `JazzMessangerAccount.ts` migration replaces `sessionFingerprint: crypto.randomUUID()` with the real value.
- Pairing's responder step writes the real value to `responderSessionFingerprint`.

### 7.3 Migration concern

Existing accounts created during Slice 1 (or earlier Slice 2 dev) have a random-UUID `sessionFingerprint` on their existing `DeviceRecord`. **We do not migrate these.** The Slice 2 CHANGELOG entry must call out that:
- Newly created accounts get real `sessionFingerprint` immediately.
- Newly paired devices (Slice 2 QR flow) write real `sessionFingerprint`.
- Old DeviceRecords retain their random-UUID values; this is harmless until a hypothetical Slice 4+ feature uses sessionFingerprint for revocation matching.

---

## 8. UI surfaces and routing

### 8.1 Entry points

| Entry | Location | Target |
|---|---|---|
| "+ Add contact" | Sidebar empty state + sidebar header when contacts exist | `/contacts/add` |
| "Link new device" | Settings → Devices section, above device list | `/pair?role=initiator` |
| Pending invites | Settings → new "Invites" section | inline |
| Contact detail | Click a contact in sidebar | `/contacts/:contactID` (minimal v1: shows display name + safety number + "Remove contact") |

### 8.2 Routes

Authenticated routes:
- `/` — home
- `/settings/*` — settings (Profile, Devices, Account, Invites)
- `/contacts/add` — issue invite
- `/contacts/:contactID` — contact detail (minimal)
- `/invite` — accept/decline UI (reads fragment for invite payload)
- `/pair` — pairing UI (initiator if `?role=initiator`, responder if a fragment is present)

Unauthenticated routes:
- `/` — onboarding flow
- `/invite` (special) — stash fragment, redirect to `/`, replay after sign-in completes
- `/pair#…` (responder only — no auth needed; responder is becoming the account)

### 8.3 Routing migration

Replace Slice 1's `view: "home" | "settings"` state machine in `App.tsx` with `react-router-dom`. Preserve the auth check: `if (!me) return <OnboardingRoute />` stays at the top of the router tree. The router lives inside the authenticated branch.

Two special URL behaviors:
- `/invite#…` while not signed in: stash fragment to `sessionStorage` (key: `pending-invite-fragment`), redirect to `/`. Onboarding's success handler checks for the key and re-navigates to `/invite#…` after sign-in.
- `/pair#…` while not signed in: render the responder UI directly (no redirect). It will sign the user in once pairing completes.

### 8.4 Camera + paste UX on responder

Single screen showing both a camera viewport and a paste textarea simultaneously — no toggle.

- **Camera viewport:** webcam feed via `qr-scanner`. If permission denied or unavailable: replace with "Camera unavailable — paste the link below instead" placeholder.
- **Paste field:** "Or paste link" textarea with submit button.

Both inputs feed the same URL parser; first valid URL wins.

Layout orientation (side-by-side vs stacked) is the implementer's call, with the constraint that the page must be usable on both desktop and mobile viewports. A responsive layout (stacked on narrow viewports, side-by-side on wide) is the natural fit.

---

## 9. Testing

### 9.1 Unit tests

- `EphemeralPairing.test.ts` — schema smoke test (matches pattern of other schemas)
- `pubkey.test.ts` — derive pubkey from a test account (via `createJazzTestAccount`), assert 64-char hex output, assert deterministic per account
- `session.test.ts` — derive fingerprint, assert non-empty stable string per session
- `pairing.test.ts` — create EphemeralPairing as initiator, simulate responder write (mock or in-memory), assert sealed-box round-trip yields the original secret
- `invitations.test.ts` — create Invitation as inviter, simulate recipient acceptance, assert both ContactBook entries appear with correct fingerprints

### 9.2 E2E tests

- **`tests/e2e/device-pairing.spec.ts`** — page A signs up; navigates to `/pair?role=initiator`; reads displayed URL via `data-testid`; page B opens URL; pairing completes; both pages show same `sidebar-display-name`; page A's Settings → Devices shows two device entries.
- **`tests/e2e/contact-invitation.spec.ts`** — pages A and B sign up as "Alice" and "Bob" in fresh contexts; Bob navigates `/contacts/add`; test reads invite URL via `data-testid`; Alice opens URL, accepts; both sidebars show the other; contact detail pages show matching safety numbers.
- **`tests/e2e/invite-before-signin.spec.ts`** — page A in fresh context opens `/invite#…` (URL captured from a prior account-creation+invite cycle); is redirected to onboarding; completes account creation; lands automatically on `/invite#…` acceptance screen; completes accept.

Camera scanning is not e2e-tested (Playwright camera mocking is brittle). The paste path is the canonical e2e coverage.

### 9.3 Manual verification

- QR scan with a phone camera against a desktop browser session works
- Pasting a URL into the responder's textarea works
- Pending invites section correctly shows pending, removes after acceptance
- Revoking a pending invite tombstones the InviteGroup; subsequent recipient open shows "Invitation no longer valid"
- Camera-denied path: deny permission in browser settings, verify paste-only UI

---

## 10. Done definition

All of the following must be true to mark Slice 2 complete:

- [ ] `npm test` exits 0 (unit tests)
- [ ] `npm run test:e2e` exits 0 in Chromium and Firefox
- [ ] Manual: from a fresh browser context, can pair as a second device of an existing account via pasted URL; sidebar in both contexts shows same display name; Settings → Devices shows two entries
- [ ] Manual: from two fresh browser contexts as different accounts, can establish mutual contact via copied invite URL; both sidebars show the other contact; contact detail pages show matching safety numbers
- [ ] Manual: safety number in Settings → Account is derived from the real Ed25519 pubkey (verifiable by hashing the pubkey externally and comparing)
- [ ] Manual: a freshly created account's DeviceRecord has a non-UUID `sessionFingerprint`
- [ ] `react-router-dom` is wired; `/settings`, `/contacts/add`, `/invite`, `/pair` all work via direct URL entry

---

## 11. Open risks

1. **Account-secret-via-Jazz-API.** The pairing responder must log in using a raw account secret obtained via sealed-box. The exact Jazz 0.20.18 API path for this is unverified; the API survey covered `logIn(passphrase)` but not `logIn(rawSecret)` directly. If this isn't exposed, we may need to convert the secret to a passphrase first, or use a lower-level Jazz internal. The implementation phase should resolve this before committing the protocol code.

2. **Pubkey extraction API.** Jazz 0.20.18 may not expose a clean accessor for the account's Ed25519 pubkey. If discovery turns up no public path, we may need to derive it from the accountID encoding or use a workaround. Document the workaround in `docs/jazz-api-notes.md`.

3. **Session fingerprint API.** Same as above for the session's signing key. Worst case: continue using `crypto.randomUUID()` for now and document as a Slice 2.1 follow-up.

**Mitigation for risks 1-3:** if Phase C / pairing implementation hits a wall on any of these APIs, dispatch a focused research subagent (same pattern as Slice 1's jazz-tools 0.20.18 API survey) to pin down the actual API surface before continuing. Update `docs/jazz-api-notes.md` with the findings. The Slice 1 survey is the template.

4. **Camera permission UX cross-browser.** Firefox, Chrome, Safari all handle camera permission differently. The "permission denied → graceful fallback to paste" path must be tested in each browser used in e2e.

5. **Bearer-token invite leakage.** A user forwarding their invite link via an insecure channel (e.g., a screenshot in a group chat) lets anyone claim it. Mitigated by 7-day expiry + one-shot consumption + TOFU pin verification — but the screenshot-of-friend's-phone case still exists and is documented as a known limitation in the threat model.

6. **Pairing without explicit approval.** The initiator-side approval dialog is the gate; if the user clicks through it without reading, an attacker who learns the pairing URL can complete the pairing. UX must make the approval gate prominent.

7. **`Contact.linkedConversation` forward reference.** Importing `Conversation` from `Contact.ts` was deferred in Slice 1 to avoid circular import. Verify the import order works with the getter pattern; if a circular issue persists, fall back to storing `conversationCoValueID: z.string().optional()` instead.

---

## 12. References

- `docs/superpowers/specs/2026-05-15-jazz-messanger-design.md` — full E1a design (§4.3 QR pairing, §5 contact establishment)
- `docs/superpowers/plans/2026-05-15-e1a-slice-1-foundation-account.md` — Slice 1 plan (completed)
- `docs/security/threat-model.md` — security properties bound by this slice
- `docs/jazz-api-notes.md` — Jazz API surface (will be appended during implementation)
- `Local-first messenger research.md` — source research (Briar-inspired threat model, Jazz primitives)
