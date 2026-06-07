> **Historical context (added 2026-06-07):** this document was written when the project was named **jazz-messanger**. The project was renamed to **Arcan** on 2026-06-05; the app rebrand itself is captured as Unit 5 in `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md`. This file is preserved as-is for historical accuracy.
# Slice 7 — Zero-Knowledge Email + Password Auth Design

**Goal.** Replace the 24-word passphrase as the user-facing credential with email + password, without softening the local-first / E2EE threat model. The Jazz seed never leaves the client; the auth server stores only material that requires an offline brute-force attack on the user's password to decrypt anything. The existing 24-word phrase is repurposed as a backup recovery code.

**Scope.** Large slice — ~3 phases of work. New `auth-server/` sibling package (small Node service mounting Better Auth + a custom plugin), client-side KDF + envelope crypto module, redesigned onboarding + new login/recovery routes, password change in settings, and one extra service in the deploy compose stack.

**Tech stack additions.** [`better-auth`](https://better-auth.com) (server + client + React provider), [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) (auth-server DB), [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) for Argon2id (already a transitive dependency of `@scure/bip39`), Web Crypto API for AES-GCM (browser-native, no dep). No new client-bundle dependencies beyond `better-auth/client`.

**Closes:** none of the current Linear backlog (this is net-new functionality, not previously tracked). New followups will be filed as part of the slice.

**Deferred (explicit non-goals):**

- OAuth providers (Google / Apple / GitHub). Better Auth's plugin model accommodates them but they require client-side key material — see §8 for the future OAuth+Passkey design sketch.
- Passkey enrollment / WebAuthn primary auth. Future slice.
- Strict zero-knowledge via PAKE (OPAQUE / SRP) — the server briefly sees the raw password during sign-in/sign-up/change-password requests. Self-host trade. Future slice once a hosted deployment is on the roadmap.
- Email verification flow. The `emailVerified` field exists (Better Auth default) but is unused until notifications ship.
- Account deletion. Cross-cuts conversation ownership and username tombstoning — separate slice.
- Username change.
- Recovery-code rotation. The recovery code is permanently valid for the life of the account. If a user thinks theirs is compromised, the only remedy is delete + recreate.
- Multi-session management UI.
- Password strength meter / breach-database checks. 12-character floor only.
- Migration of existing PassphraseAuth users. Per project CLAUDE.md ("recreating users from scratch is authorized"), existing accounts are wiped on deploy.

---

## 1. Architecture

A third service joins the compose stack from Slice 6. Caddy fronts everything on a single domain; new routes are path-prefixed.

```
                ┌──────────┐  /sync/*       ┌─────────────┐  ┌──────────────┐
                │          │ ──────────────►│ jazz-run    │──┤ sync.sqlite  │
   client ───►  │  Caddy   │                │ sync        │  └──────────────┘
                │          │  /api/auth/*   ┌─────────────┐  ┌──────────────┐
                │  (TLS)   │ ──────────────►│ auth (node) │──┤ auth.sqlite  │
                │          │                └─────────────┘  └──────────────┘
                │          │  /*            (static dist served by Caddy)
                └──────────┘
```

**Separation of concerns:** the `auth` service knows about emails, usernames, passwords, and sessions but knows nothing about Jazz CoValues, conversations, or message content. The `sync` service knows about CoValues but nothing about emails or passwords. The client is the only entity that holds both halves — and even there, the password and seed never leave the browser except in the carefully-bounded shapes documented in §3.

**Why this stays manageable:** OAuth providers slot in later via Better Auth's standard plugin system without rewriting our custom plugin. The auth service is small enough to fit on the same VPS as everything else with no separate ops story.

---

## 2. Auth server

A new top-level `auth-server/` package, sibling to `src/`, `tests/`, and `deploy/`.

### 2.1 Layout

```
auth-server/
├── package.json             ← own deps: better-auth, better-sqlite3, drizzle
├── src/
│   ├── index.ts             ← Hono app, mounts BA router
│   ├── plugin.ts            ← jazzZkPlugin (Better Auth server plugin)
│   ├── db.ts                ← Drizzle + sqlite adapter setup
│   └── env.ts               ← BETTER_AUTH_SECRET, DATABASE_URL, PORT
├── tsconfig.json
├── vitest.config.ts
├── tests/
│   ├── plugin.test.ts
│   └── zero-knowledge.test.ts
└── Dockerfile               ← built into deploy/docker-compose.yml as new service
```

Separate `package.json` keeps server-only deps out of the client bundle and makes the server independently deployable / dockerizable.

### 2.2 Data model

Three tables, all managed by Better Auth's adapter. Schema additions from `jazzZkPlugin`:

```
user
├── id                  BA-managed UUID
├── email               UNIQUE, indexed             ← login identifier
├── username            UNIQUE, indexed             ← public display handle
├── emailVerified       boolean (default false; unused in MVP)
├── passwordHash        bcrypt (BA-managed)
├── kdfSalt             32-byte base64 string       ← OUR field
├── encryptedSeed       base64 AES-GCM envelope     ← OUR field
├── recoveryProofHmac   32-byte base64 string       ← OUR field
├── accountID           Jazz account ID string      ← OUR field
├── createdAt, updatedAt

session                 BA-managed (id, userId, token, expiresAt, ...)
account                 BA-managed (one credential row per user; OAuth rows added later)
```

**What is deliberately absent:** no `secretSeed`, no `accountSecret`, no `passwordResetToken`, no `recoveryCodeHash` in plaintext form. The server has no path to the Jazz keypair without the user's password.

**KDF parameters are not stored.** They are hard-coded constants in `src/auth/kdf.ts` on the client (Argon2id, memory 64 MiB, time 3, parallelism 1, output 32 bytes). Per-user tuning is unnecessary at this stage; if we ever need to upgrade KDF cost, every user must re-authenticate once to re-derive their seed — acceptable cost given how rare KDF upgrades are.

**Why username on the server, not in Jazz Profile:** uniqueness check (Profile.displayName is free-form), and the seed for a future username-based contact-discovery feature. The Jazz Profile's `displayName` becomes a free-form public name; `username` is the immutable unique identifier. Same split GitHub, Discord, etc. use.

**Centralization trade:** username uniqueness is enforced by the central auth server. A different deployment of this app couldn't federate usernames. For Vision X's small-trust-circle model this is fine — we are not building a federated identity layer.

### 2.3 Plugin endpoints

`jazzZkPlugin` (server) exposes:

| Method + path | Purpose |
|---|---|
| (extends) `POST /sign-up` | Better Auth's standard endpoint, augmented to accept and persist `kdfSalt`, `encryptedSeed`, `recoveryProofHmac`, `accountID` from the request body. |
| (extends) `POST /sign-in` | Better Auth's standard endpoint, augmented to return `kdfSalt`, `encryptedSeed`, `accountID` in the response on success. |
| `GET /me/auth-material` | Session-cookie-gated. Returns `{ kdfSalt, encryptedSeed }` for the current user. Used by the password-change flow. |
| `POST /reset-with-recovery` | Body: `{ accountID, proof, newPassword, newKdfSalt, newEncryptedSeed }`. Constant-time compares `proof` against stored `recoveryProofHmac`. On match, atomically updates `kdfSalt`, `encryptedSeed`, and `passwordHash` (= bcrypt of `newPassword`), then rotates all sessions and issues a fresh one. On mismatch: 401 + rate-limit. |
| (extends) `POST /change-password` | Better Auth's standard endpoint, augmented via `after` middleware to also atomically update `kdfSalt` and `encryptedSeed` from the body. Other sessions revoked. |

`jazzZkPluginClient` (browser) mirrors these via Better Auth's plugin protocol so the typed `authClient` exposes them as methods.

### 2.4 Rate limiting

Better Auth ships a built-in rate limiter. Enabled for `/sign-in`, `/sign-up`, `/reset-with-recovery`, and `/change-password`. Conservative defaults — 5 attempts per 15 minutes per IP per email. Tunable via env vars (`AUTH_RATE_LIMIT_WINDOW`, `AUTH_RATE_LIMIT_MAX`).

### 2.5 Cookies & sessions

Better Auth sets an `HttpOnly`, `Secure`, `SameSite=Lax` cookie (`better-auth.session_token`) scoped to the auth domain (which equals the app domain since we share Caddy). 7-day rolling expiry. No "remember me" toggle in MVP.

---

## 3. Client crypto core

### 3.1 `src/auth/kdf.ts` — the only file that does cryptography

This is the only file that performs key derivation or symmetric encryption. Everything else calls into it. Isolating it means one file to review carefully, one file to test against known vectors, one file to swap out if KDF or cipher choice changes.

Final API (no placeholders):

```ts
export type KdfParams = {
  algorithm: "argon2id";
  memoryKiB: 65536;       // 64 MiB
  iterations: 3;
  parallelism: 1;
  outputBytes: 32;
};
export const DEFAULT_KDF_PARAMS: KdfParams;

export async function deriveKey(
  password: string,
  saltBytes: Uint8Array,
  params?: KdfParams,
): Promise<Uint8Array>;  // 32 bytes

export async function encryptSeed(
  seed: Uint8Array,        // 32 bytes (Jazz secretSeed)
  key: Uint8Array,         // from deriveKey
): Promise<string>;        // base64 of [12-byte IV || ciphertext || 16-byte tag]

export async function decryptSeed(
  envelope: string,
  key: Uint8Array,
): Promise<Uint8Array>;    // 32 bytes; throws on AES auth failure
```

Library choice: `@noble/hashes` for Argon2id (pure JS, audited, already transitively present via `@scure/bip39`). Web Crypto API for AES-GCM (browser-native).

### 3.2 `src/auth/recovery-proof.ts`

```ts
export async function recoveryProof(seed: Uint8Array): Promise<string>;
// HMAC-SHA256(seed, "jazz-messanger:recovery-reset") → base64
```

Deterministic; same seed → same proof. Compared in constant time on the server.

**Why HMAC and not bcrypt:** the seed has 256 bits of entropy, so offline brute-force isn't a meaningful threat. HMAC is fast (no need for slow comparison) and deterministic (no per-call salt to manage). bcrypt would be wasted cost.

### 3.3 `src/auth/client.ts` — Better Auth client singleton

```ts
import { createAuthClient } from "better-auth/client";
import { jazzZkPluginClient } from "./plugin-client";

export const authClient = createAuthClient({
  baseURL: "/api/auth",          // relative — Caddy routes
  plugins: [jazzZkPluginClient()],
});
export type AuthClient = typeof authClient;
```

### 3.4 `src/auth/flows.ts` — orchestration

Pure async functions, no React. Each flow is one function, unit-testable without DOM:

```ts
export async function signUp(params: {
  email: string;
  username: string;
  password: string;       // ≥12 chars (validated client-side)
  displayName: string;
  authClient: AuthClient;
}): Promise<{ accountID: string; recoveryCode: string }>;

export async function signIn(params: {
  email: string;
  password: string;
  authClient: AuthClient;
}): Promise<{ accountID: string }>;

export async function recoverWithCode(params: {
  recoveryCode: string;       // 24 words (BIP-39, validated locally)
  authClient: AuthClient;
}): Promise<{ accountID: string; canSetPassword: boolean }>;

export async function setPasswordAfterRecovery(params: {
  newPassword: string;
  seed: Uint8Array;       // already in memory from recoverWithCode
  authClient: AuthClient;
}): Promise<void>;

export async function changePassword(params: {
  currentPassword: string;
  newPassword: string;
  authClient: AuthClient;
}): Promise<void>;

export async function viewRecoveryCode(params: {
  currentPassword: string; // re-auth gate
  authClient: AuthClient;
}): Promise<string>;       // 24 words
```

UI components import only from `flows.ts` — never directly from `kdf.ts` or `better-auth/client`. This keeps the surface narrow.

### 3.5 `src/jazz/provider.tsx` changes

Wrap `JazzReactProvider` with Better Auth's `AuthProvider` so the BA session-cookie cycle is in scope. Pass `authSecretStorageKey` to namespace local Jazz state alongside BA state.

### 3.6 Removal of `usePassphraseAuth`

Jazz's `usePassphraseAuth` hook is no longer used. Our `flows.ts` calls the lower-level handoff that Better Auth's Jazz plugin exposes (`jazzPluginClient.getActions().jazz.setJazzContext` plus our own seed handling). Exact API surface to be verified during Task 1 of the implementation plan against jazz-tools 0.20.18.

---

## 4. End-to-end flows

State machines for the four user-visible flows. See §5 for the UI routes that drive these.

### 4.1 Sign-up

```
welcome
  → credentials                User types: email, username, password, confirm
                               Client-side validation (email format, 12-char floor,
                               username pattern). No server round-trip yet.
  → backup-display             Show generated 24-word recovery code
                               "Continue" enabled after user ticks confirmation
  → backup-confirm             3 random challenge words (existing UI from PassphraseConfirmStep)
  → profile                    displayName + optional avatar
  → [signed in]                On confirm:
                                 1. seed = randomBytes(32)
                                 2. recoveryCode = bip39.encode(seed)
                                 3. kdfSalt = randomBytes(32)
                                 4. key = Argon2id(password, kdfSalt)
                                 5. encryptedSeed = AES-GCM-encrypt(seed, key)
                                 6. proof = HMAC-SHA256(seed, "jazz-messanger:recovery-reset")
                                 7. Create Jazz account locally with seed → accountID
                                      (Jazz session is "signed in" client-side at this
                                       point, but nothing has synced or hit the auth
                                       server yet)
                                 8. POST /api/auth/sign-up
                                      { email, username, password,
                                        kdfSalt, encryptedSeed,
                                        recoveryProofHmac: proof,
                                        accountID }
                                 9. On 200: BA Set-Cookie response installs session
                                     automatically; allow Jazz sync to start
                                10. On 4xx/5xx: roll back local Jazz account (it
                                     hasn't synced yet, no orphan leaks), show error
```

**Why generate seed-first, then derive backup from it:** the recovery code is literally the BIP-39 encoding of the seed. The password is just one way to obtain the seed (via decrypting the envelope); the recovery code is another way (direct decode). Both paths land on the same seed and therefore the same Jazz account. This is A2 mechanics from the brainstorm.

### 4.2 Sign-in

```
login screen (email + password)
  → POST /api/auth/sign-in { email, password }
  → On 200: server's Set-Cookie installs session;
            response body returns { kdfSalt, encryptedSeed, accountID }
  → Client: key  = Argon2id(password, kdfSalt)
            seed = AES-GCM-decrypt(encryptedSeed, key)
  → Hand seed to Jazz (signs in the local Jazz session for accountID;
    Jazz reuses any cached state, syncs missing CoValues as needed)
  → On 401: "Wrong email or password" (intentionally vague — don't leak which emails exist)
```

### 4.3 Recovery (forgot password)

```
"Forgot password?" link on login screen
  → recovery screen (24-word entry)
  → Client:
       1. Validate via @scure/bip39
       2. seed = bip39.decode(recoveryCode)
       3. Hand seed to Jazz (creates or restores the local session for accountID)
  → On Jazz success: prompt "Set a new password to enable email sign-in?"
       ↳ if yes:
            4. newKdfSalt = randomBytes(32)
            5. key = Argon2id(newPassword, newKdfSalt)
            6. encryptedSeed = AES-GCM-encrypt(seed, key)
            7. proof = HMAC-SHA256(seed, "jazz-messanger:recovery-reset")
                       ← same proof as before; sent for server-side verification
            8. POST /api/auth/reset-with-recovery
                 { accountID, proof,
                   newKdfSalt, newEncryptedSeed, newPassword }
            9. On 200: stash session cookie, done
       ↳ if no: user is logged in to Jazz but server-side email/password is
                still broken. Allowed to continue using the app; banner offers
                "Set a password" any time.
```

### 4.4 Logout

```
"Sign out" in settings:
  1. POST /api/auth/sign-out      (BA session invalidated)
  2. useLogOut() from jazz-tools  (local Jazz state cleared)
```

Order matters: clear server session first, then Jazz. If the POST fails (network), still clear local Jazz state — the cookie expires anyway.

### 4.5 Change password (Settings → Account → Change password)

```
modal: current password, new password, confirm new
  → Client:
       1. GET /api/auth/me/auth-material  ← session-gated, returns { kdfSalt, encryptedSeed }
       2. key_old = Argon2id(currentPassword, kdfSalt)
       3. seed    = AES-GCM-decrypt(encryptedSeed, key_old)
            ↳ if decrypt fails → "current password is wrong" (return; no server POST)
       4. newKdfSalt = randomBytes(32)
       5. key_new = Argon2id(newPassword, newKdfSalt)
       6. newEncryptedSeed = AES-GCM-encrypt(seed, key_new)
       7. POST /api/auth/change-password
            { currentPassword, newPassword,
              newKdfSalt, newEncryptedSeed,
              revokeOtherSessions: true }
  → Server (BA built-in + plugin hook):
       8. BA verifies bcrypt(currentPassword) against stored passwordHash → on fail, 401
       9. BA hashes newPassword → updates passwordHash
      10. Our plugin's `after` hook updates kdfSalt + encryptedSeed atomically (same DB tx)
      11. BA revokes all sessions except the current one
      12. 200 OK
  → Client: toast "Password changed", modal closes
```

**What doesn't change in change-password:**

- `recoveryProofHmac` — seed unchanged, so HMAC is unchanged. Recovery code still works.
- `accountID` — seed unchanged, so Jazz account ID unchanged.
- Other devices: their BA session cookies invalidated, but their local Jazz state stays valid (seed unchanged). On next request they get 401, redirect to login, re-enter new password, re-derive same seed, continue with no data loss.

---

## 5. UI restructure

### 5.1 Onboarding (`src/routes/onboarding/`)

Rename + new file set. File renames are physical moves so git history follows.

| Old file | New file | Status |
|---|---|---|
| `welcome-step.tsx` | `welcome-step.tsx` | Unchanged copy |
| — | `credentials-step.tsx` | **NEW** — email + username + password + confirm |
| `passphrase-display-step.tsx` | `backup-display-step.tsx` | Renamed + copy reframed as "recovery code" |
| `passphrase-confirm-step.tsx` | `backup-confirm-step.tsx` | Renamed; UI unchanged (3 challenge words) |
| `profile-step.tsx` | `profile-step.tsx` | Unchanged |
| `restore-step.tsx` | `restore-with-code-step.tsx` | Renamed; logic unchanged |
| — | `restore-choice-step.tsx` | **NEW** — two big buttons: sign-in vs recovery |
| `index.tsx` | `index.tsx` | State machine updated for new step set |

### 5.2 Login & recovery (`src/routes/auth/`)

New directory:

```
src/routes/auth/
├── login.tsx        ← email + password form + "Forgot password?" link
└── recovery.tsx     ← 24-word entry, same component as restore-with-code-step
```

### 5.3 Top-level routing change

Today: if `useIsAuthenticated()` is false, `App` renders `OnboardingRoute`. The "create account" path is the default.

After this slice: if not authenticated, `App` renders `LoginRoute` with an "or create a new account" link that takes the user to `OnboardingRoute`. The "log in" path is now the default since most users will have an existing account.

### 5.4 Settings (`src/routes/settings/`)

Add a new section component alongside the existing `profile-section.tsx`:

```
src/routes/settings/
├── profile-section.tsx          ← EXISTING
└── account-section.tsx          ← NEW
```

`account-section.tsx` contents:

| Subsection | Contents |
|---|---|
| Identity | Read-only: email, username, accountID (monospace) |
| Password | Button: "Change password" → opens modal (§4.5 flow) |
| Recovery code | Button: "View recovery code" → re-auth modal (current password) → displays 24-word code |
| Sign out | Button: "Sign out" → §4.4 flow |

**Why password-gate "view recovery code":** the seed is the recovery code. Anyone with access to an unlocked browser session could otherwise read it and walk away with full account access on a new device. Requiring password re-auth makes it an active confirmation.

### 5.5 What is explicitly NOT in the UI

- No email verification flow (no emails sent in MVP).
- No "Forgot username?" flow (you log in with email).
- No social login buttons (no OAuth).
- No password-strength meter beyond the 12-char floor.
- No multi-session / device-list UI.

---

## 6. Failure modes & error handling

Failure surface is larger than today's PassphraseAuth (which had basically two errors). Enumerated so UI copy can be drafted as part of the implementation plan rather than retrofitted.

### 6.1 Sign-up

| Failure | Where caught | UX |
|---|---|---|
| Email taken | Server (BA constraint) | Inline error on email field |
| Username taken | Server (BA constraint) | Inline error on username field |
| Password too short / mismatched confirm | Client | Inline error, no server round-trip |
| Auth server unreachable | Client (fetch failure) | Banner: "Can't reach the server. Check your connection." Sign-up blocked. |
| Auth server returns 5xx | Client | Same banner |
| POST succeeded but local Jazz account creation failed | Client | "Account created but local setup failed. Reload and sign in to continue." Idempotent on next sign-in because Jazz account ID is deterministic from seed. |
| Local Jazz account created but POST failed | Client | Roll back in-memory Jazz session (Jazz hasn't synced yet, no orphan). Banner: "Sign-up didn't reach the server, please try again." |

### 6.2 Sign-in

| Failure | UX |
|---|---|
| Wrong email or password | "Wrong email or password" (vague — BA default) |
| Account doesn't exist | Same vague error |
| Auth server unreachable | Banner + "Try again". Offer "Sign in with recovery code" as escape hatch. |
| `encryptedSeed` decrypt fails after BA accepts password | "Server data integrity error." Surface clearly; offer recovery-code path. Should be impossible without server tampering. |
| Jazz sync unreachable but auth succeeded | User logged in locally; show existing ConnectionBanner. Same as today. |

### 6.3 Recovery

| Failure | UX |
|---|---|
| Invalid 24-word phrase | Reuse `validatePassphrase` from `src/auth/passphrase.ts` — already returns structured errors |
| Phrase valid but doesn't match any account | Client derives seed → Jazz login returns "account not found" → "This recovery code doesn't match any account" |
| HMAC mismatch on reset-with-recovery | "Recovery code verified but server rejected the reset. Try logging in again." (Implies server/code drift; should be impossible if seed is correct.) |
| Auth server unreachable during reset | User is logged in to Jazz (already happened locally) but server-side login still broken. Banner: "Logged in via recovery code. Set a new password while online to restore email sign-in." Don't block app use. |

### 6.4 Change password

| Failure | UX |
|---|---|
| Wrong current password (client decrypt fails first) | "Current password is wrong" — fast feedback, no POST |
| Wrong current password (server bcrypt fails) | Same error |
| New password too short / mismatch | Client-side inline error |
| Atomic server update fails | BA adapter wraps in tx; full rollback. "Couldn't save changes, try again." |
| Other devices after change | Logged out at next request. Local Jazz state survives. Re-login with new password, no data loss. |

### 6.5 View recovery code

| Failure | UX |
|---|---|
| Wrong password | "Wrong password" |
| Server unreachable | "Can't reach the server. Try again." |

---

## 7. Threat model

### 7.1 What at-rest ZK A2 protects against

| Threat | Protected? | Why |
|---|---|---|
| Passive DB leak (auth.sqlite stolen) | ✅ | Server stores only `bcrypt(password)` + `encryptedSeed` + `recoveryProofHmac`. Attacker must brute-force each user's password through Argon2id (64 MiB × 3 iterations). Infeasible for strong passwords; slow for weak ones. |
| Compromised sync server | ✅ | Sync server never sees passwords or seeds. Slice 6 threat model unchanged. |
| Compromised TLS termination (read-only) | ✅ | Sees encrypted-at-rest blobs in transit; can't decrypt without password. |
| Stolen device with locked browser | ✅ (depends on OS) | OS disk encryption + browser sandbox are the relevant defenses; this slice doesn't add or remove anything on that axis. Local cached BA cookie + Jazz state survive theft as much as they did before. |
| Network MITM with valid TLS | ✅ | Caddy enforces HTTPS; BA cookie is HttpOnly + Secure. |

### 7.2 What it does NOT protect against

| Threat | Why not | Mitigation |
|---|---|---|
| Actively malicious auth server | Server sees raw password during sign-in / sign-up / change-password / reset-with-recovery requests | **You run the server.** Self-host trade. Strict ZK via PAKE is the future path (§8). |
| Forgotten password + lost recovery code + no paired device | No server-mediated reset, period | UI nudges all three escape hatches |
| Phishing | Same as any password system | Browser address bar; no in-product defense |
| Weak password + offline attack on leaked DB | 12-char floor is a low bar | Future: strength meter, mandatory passkey enrollment |
| Compromised recovery code | Code is permanent | "Rotate" = delete + recreate the account (out of scope) |

---

## 8. Out of scope / future work

| Item | Notes |
|---|---|
| **OAuth + Passkey** | Better Auth's OAuth providers slot into our existing plugin. Passkey enrollment becomes the client-side key source. Schema additions: new `passkey` table (BA standard), `account` table populated with OAuth provider rows. The custom `jazzZkPlugin` survives unchanged — passkey-derived material replaces password-derived material in the same Argon2id slot. |
| **Strict ZK via PAKE (OPAQUE)** | Replaces the "server sees password during requests" weakness. ~300 lines of new code (client + server). Worth it when multi-tenant hosting or regulated deployment is on the roadmap. |
| **Email verification** | `emailVerified` field exists, unused. Add mailer + verification flow when email matters (notifications). Password-reset emails would soften ZK and are deliberately off the table. |
| **Account deletion** | Needs: delete BA row, tombstone username so an impersonator can't claim it, revoke Jazz account (group memberships, owned conversations). Cross-cuts Slice 4 archive primitives. |
| **Username change** | Trivial server-side. Open question: do other users see the old username in old messages? Suggests usernames stay server-side-only as identifiers. |
| **Recovery-code rotation** | Really means "derive new seed, migrate all CoValues to new ownership, revoke old account." Not viable as a routine action. Treat as "delete + recreate with data export." |
| **Multi-session UI** | BA `/sessions` endpoint exists; just needs a settings screen listing active devices with revoke buttons. |
| **Password strength meter, breach checks** | zxcvbn for strength feedback; HIBP API for breach checks. Both client-side; no server changes. |
| **Username discoverability** | Centrally-registered usernames enable a future contact-discovery feature (find user by `@alice42` instead of QR). Ties into NOX-23 (Contact-as-Account-ref migration). Schema accommodates it. |

---

## 9. Testing strategy

### 9.1 Client unit tests (`tests/unit/`, Vitest)

| File | What it covers |
|---|---|
| `tests/unit/auth/kdf.test.ts` | NEW. Deterministic vectors: `deriveKey("password", knownSalt)` → known 32 bytes. AES round-trip. Wrong key throws. Tampered envelope (flipped byte) throws. |
| `tests/unit/auth/passphrase.test.ts` | EXISTING — untouched. Same BIP-39 logic backs the recovery code. |
| `tests/unit/auth/recovery-proof.test.ts` | NEW. `recoveryProof(seed)` deterministic; different seed → different proof. |
| `tests/unit/auth/flows.test.ts` | NEW. Each flow with a mocked `authClient` (fetch shim) and mocked Jazz handle. Asserts correct request bodies, correct local state after success/failure, rollback on partial failures. |
| `tests/unit/auth/no-password-leak.test.ts` | NEW. After `signIn()`, the password string is not retained in module-level state, the `authClient` doesn't cache it, `localStorage`/`indexedDB` contain no string matching it. |

### 9.2 Server unit tests (`auth-server/tests/`, Vitest)

| File | What it covers |
|---|---|
| `auth-server/tests/plugin.test.ts` | NEW. BA in-process with in-memory SQLite. POST `/sign-up` with mock body, verify row inserted correctly. GET `/me/auth-material` returns fields. `/reset-with-recovery` with wrong proof → 401; right proof → updates row. `/change-password` → passwordHash + kdfSalt + encryptedSeed updated atomically. |
| `auth-server/tests/zero-knowledge.test.ts` | NEW. After signup, query the user row directly from sqlite and assert no field contains plaintext password, plaintext seed, or anything that decrypts to either without the password. Specifically: `encryptedSeed` ciphertext bytes don't equal seed bytes XOR anything else stored. |

Run from `auth-server/` with its own `vitest.config.ts`. Not added to root `vitest run` — each package owns its tests.

### 9.3 End-to-end tests (`tests/e2e/`, Playwright)

| File | What it covers |
|---|---|
| `tests/e2e/signup-email-password.spec.ts` | NEW. Full onboarding walk-through. Verify user row created in auth-server. |
| `tests/e2e/login-email-password.spec.ts` | NEW. Sign up → log out → log in → same accountID. |
| `tests/e2e/recovery-with-code.spec.ts` | NEW. Sign up → log out → forgot password → enter recovery code → set new password → log out → log in with new password. |
| `tests/e2e/change-password.spec.ts` | NEW. Logged in → change password via settings → log out → old password fails, new works → recovery code still works (seed unchanged). |
| `tests/e2e/invalid-credentials.spec.ts` | NEW. Wrong password, taken email, taken username, weak password, malformed recovery code. |
| `tests/e2e/auth-server-down.spec.ts` | NEW. Stop auth container mid-test → signup shows network error → bring back up → retry succeeds. Validates §6 failure modes don't leak corrupt local state. |
| Existing Slice 1-5 specs | Re-grounded. Shared setup helper changes from "type passphrase" to "sign up via email+password." One helper update covers all of them. |

E2E runs against a real auth-server + sync-server stack. The existing `nix-shell` already has the deps; we add an extra process to the dev/CI setup.

### 9.4 What is explicitly NOT tested

- KDF tuning under load (needs real-browser perf harness; out of scope)
- Cryptographic primitives themselves (`@noble/hashes`, Web Crypto — pre-audited)
- Better Auth's own session / rate-limit logic (their tests)
- Cross-browser passkey behavior (no passkeys in MVP)

---

## 10. Deploy changes

Slice 6's `deploy/` compose stack grows by one service.

### 10.1 New container

`deploy/Dockerfile.auth` (new):

```
node:22-alpine
WORKDIR /app
COPY auth-server/package*.json ./
RUN npm ci --omit=dev
COPY auth-server/dist ./dist
CMD node dist/index.js
```

(`auth-server` is pre-built at image-build time, like the static client.)

### 10.2 `deploy/docker-compose.yml` additions

```yaml
services:
  auth:
    build:
      context: ..
      dockerfile: deploy/Dockerfile.auth
    environment:
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?required}
      BETTER_AUTH_URL: https://${DOMAIN}/api/auth
      DATABASE_URL: file:/data/auth.sqlite
      PORT: "4300"
    volumes:
      - ./auth-data:/data
    restart: unless-stopped
```

No `ports:` block — auth is reachable only via Caddy on the internal Docker network.

### 10.3 Caddyfile additions

```caddyfile
{$DOMAIN} {
    encode zstd gzip
    handle_path /sync/*       { reverse_proxy sync:4200 }
    handle_path /api/auth/*   { reverse_proxy auth:4300 }   ← NEW
    handle {
        root * /usr/share/caddy
        try_files {path} /index.html
        file_server
    }
    log { output stdout; format console }
    tls {$ACME_EMAIL}
}
```

### 10.4 `deploy/.env.example` additions

```
BETTER_AUTH_SECRET=    # generate with: openssl rand -base64 32
```

The README's quick-start instructions gain one step: generate and paste the BA secret.

### 10.5 Data on disk

```
deploy/
├── data/             ← sync server (existing)
└── auth-data/        ← auth server (NEW). Contains auth.sqlite.
```

Both volumes documented in README as "this is your operator state — back it up." Loss of `auth-data/` means every user must re-create their account; loss of `data/` means every user loses message history (Slice 6 status quo).

---

## 11. Phasing

The implementation plan written next will break this into three phases consistent with prior slices:

- **Phase A — Server + crypto core (foundation).** `auth-server/` package, `src/auth/{kdf,recovery-proof,client,flows}.ts`, plugin tests, ZK regression test.
- **Phase B — UI rewire.** New onboarding step set, new `/auth/login` + `/auth/recovery` routes, top-level App routing inversion, settings account section, copy.
- **Phase C — E2E + deploy.** New e2e specs, Slice 1-5 helper migration, Dockerfile + compose + Caddyfile + README updates, smoke-test the deploy stack with all three services.

Each phase is a single subagent dispatch consistent with the Slice 4/5/6 pattern.