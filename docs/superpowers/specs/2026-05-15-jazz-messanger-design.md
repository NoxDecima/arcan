# Jazz Messanger — Design Document

**Date:** 2026-05-15
**Status:** Brainstorming complete; awaiting implementation plan
**Source research:** `Local-first messenger research.md`
**Companion document:** `docs/security/threat-model.md`

---

## 1. Vision and scope

### 1.1 One-line pitch
A local-first, end-to-end-encrypted messenger for small trust circles — friends, family, teams, communities — where contact establishment happens out-of-band and the operator can see who-talks-to-whom but not what is said.

### 1.2 Audience
Privacy-conscious people for whom "WhatsApp owns my social graph and Meta reads my backups" is the wrong trade, but for whom Briar's UX austerity is a non-starter. Small teams, families, friend groups, communities of practice.

**Explicitly not** for journalists in hostile jurisdictions (would need Tor + sealed-sender, which we are not building) or for hosting large public channels (Telegram/Matrix territory).

### 1.3 Position on the local-first spectrum
Between "Vision X" (intimate networks, Briar-style hard-block) and "Vision Y" (Signal-class general-purpose). We accept that the sync server operator can see the social graph as long as message content stays encrypted end-to-end. Tor and sealed-sender are out of scope.

### 1.4 The four committed product axes
| Axis | v1 choice | Future extension |
|---|---|---|
| Contact discovery | Link-only (out-of-band) | Username search (E2) |
| Stranger contact | Hard-block | Message-request inbox (E2) |
| Group ceiling | ≤50 members | Stays small by design |
| Account anchor | Passphrase + QR device-link | Better Auth bridge (E1.1), Shamir social recovery (E2) |

Multi-device sync is **on** from v1 (one identity across devices, QR-link to add a device).

---

## 2. Architecture overview

### 2.1 Five components

| Component | Responsibility |
|---|---|
| Data layer | Jazz CoValue schemas; the eight types in §3 |
| Auth/device subsystem | Passphrase auth, device session manager, QR-link flow |
| Contact subsystem | Invitation issuance, acceptance, ContactBook, TOFU pinning |
| Conversation/group subsystem | Conversation creation, per-author WriteGroups, membership management |
| Sync server | Self-hosted Jazz sync server; local dev + production deploy |

Each component has one purpose and a clean boundary so it can be implemented and tested in isolation.

### 2.2 Tech stack (committed)

- **Frontend:** React 18 + Vite + TypeScript + Tailwind + shadcn/ui + `jazz-tools/react` + PWA service worker
- **Sync server:** Node 22 LTS + `jazz-tools` server module + SQLite (RocksDB later if needed)
- **Crypto:** Jazz native Rust core (WASM in browser, native module on server); no custom primitives
- **Notifications:** Web Push API where supported; document iOS Safari limitations
- **Testing:** Vitest for unit tests; Playwright for end-to-end (two browser instances simulating two users)
- **Deployment:** Local for E1a; Docker-based VPS for E1b (details deferred — see §7)

### 2.3 Jazz version
Target **Jazz 0.20.x** for v1. The 2.0 alpha (relational rewrite) is exciting but should not be a v1 dependency. Pin a specific 0.20.x version; review CHANGELOG before upgrading.

---

## 3. Data model

Eight CoValue types form the entire schema.

### 3.1 Identity layer

```ts
class Profile extends CoMap {
  displayName  = co.string;
  bio          = co.optional.string;
  avatar       = co.optional.ref(FileBlob);
  // Identity (Ed25519 fingerprint) is NOT a field — it IS the Account.
}

class DeviceRecord extends CoMap {
  label              = co.string;       // "Sven's laptop"
  addedAt            = co.Date;
  lastSeenAt         = co.Date;
  sessionFingerprint = co.string;
  revoked            = co.boolean;
}

class Contact extends CoMap {
  contactAccountID    = co.string;
  pinnedFingerprint   = co.string;       // TOFU pin set at pairing
  displayNameLocal    = co.string;       // what *you* call them
  addedAt             = co.Date;
  linkedConversation  = co.optional.ref(Conversation);
  notes               = co.optional.string;
}

class ContactBook extends CoList.of(co.ref(Contact)) {}

class JazzMessangerAccount extends Account {
  profile        = co.ref(Profile);                              // public
  contactBook    = co.ref(ContactBook);                          // private
  devices        = co.ref(CoList.of(co.ref(DeviceRecord)));      // private
  invitesIssued  = co.ref(CoList.of(co.ref(Invitation)));        // private
}
```

Private CoValues are owned by Groups whose only members are the Account's own sessions.

### 3.2 Invite layer

```ts
class Invitation extends CoMap {
  inviterAccountID    = co.string;
  inviterFingerprint  = co.string;
  inviterDisplayName  = co.string;
  createdAt           = co.Date;
  expiresAt           = co.Date;          // default: createdAt + 7 days

  recipientAccountID    = co.optional.string;
  recipientFingerprint  = co.optional.string;
  recipientDisplayName  = co.optional.string;
  acceptedAt            = co.optional.Date;

  consumed = co.boolean;
}
```

Lives in an ephemeral `InviteGroup` with the inviter as `admin` and an ephemeral `inviteAgent` as `writerInvite` (see §5).

### 3.3 Conversation layer

```ts
class Conversation extends CoMap {
  title         = co.optional.string;       // null for 1:1
  kind          = co.literal("dm", "group");
  createdAt     = co.Date;
  createdBy     = co.string;                // accountID
  messages      = co.ref(CoList.of(co.ref(Message)));

  // participant accountID → that participant's WriteGroup ID
  authorWriteGroups = co.ref(CoMap.of(co.string, co.string));
}

// Owned by author's WriteGroup. No `author` field; authorship is structural.
class Message extends CoMap {
  sentAt       = co.Date;
  body         = co.string;
  attachments  = co.ref(CoList.of(co.ref(FileBlob)));
  replyTo      = co.optional.ref(Message);
  edited       = co.optional.boolean;
}

class FileBlob extends CoMap {
  mimeType  = co.string;
  size      = co.number;
  filename  = co.optional.string;
  data      = co.ref(BinaryCoStream);
}
```

---

## 4. Authentication and device lifecycle

### 4.1 Account creation
1. Generate 32-byte secret via Jazz RNCrypto; derive Ed25519 + X25519 keypairs.
2. Create the Account CoValue + `Profile`, `ContactBook`, `devices` (one entry), `invitesIssued`.
3. Display the **24-word passphrase** with a strong "no recovery without this" UX. Confirm-by-retyping before proceeding.

### 4.2 Disaster recovery
Type the 24-word passphrase on a fresh device. Jazz's `passphrase` provider validates and surfaces errors (`invalid-length`, `invalid-word`, `invalid-checksum`). Append a new `DeviceRecord` after restore.

### 4.3 Multi-device add via QR (the common path)

Custom one-shot CoValue handshake:

1. Existing device generates ephemeral X25519 keypair `K_e`. Creates `EphemeralPairing` CoValue (5-min expiry) with `initiatorPubkey = K_e.pub`. Displays QR encoding `<pairingCoValueID> || <K_e.priv>`.
2. New device scans QR, parses fragment, connects to sync server, loads `EphemeralPairing`. Generates its own X25519 keypair `K_n`. Writes `responderPubkey = K_n.pub`.
3. Existing device observes `responderPubkey`, computes `blob = sealedBox(accountSecret, to: K_n.pub, from: K_e.priv)`. Writes `wrappedAccount = blob`.
4. New device observes `wrappedAccount`, unseals with `K_n.priv` and `K_e.pub`, persists account secret. Appends `DeviceRecord`.
5. Existing device tombstones `EphemeralPairing`.

The account secret is **never** on the server in plaintext. The seal is to an ephemeral key the server doesn't possess.

### 4.4 Device revocation
Mark `DeviceRecord.revoked = true` from another device. v1: clients refuse to merge transactions from revoked sessions; server uses revocation as a soft block.

**Limitation:** revocation does not retroactively rotate any conversation readKey in v1. A compromised device that already pulled history retains the cleartext. Auto-rotation on revocation is an E1.1 candidate.

---

## 5. Contact establishment

### 5.1 Invitation flow

**Issuance:**
1. Generate ephemeral Ed25519 + X25519 invite-agent keypair.
2. Create `InviteGroup` with `me = admin`, `inviteAgent = writerInvite`.
3. Jazz auto-wraps the readKey for both: `key_<readKey>_for_<myAccountID>` and `key_<readKey>_for_<inviteAgentID>`.
4. Create `Invitation` CoValue owned by `InviteGroup`, populated with my accountID + fingerprint + display name + 7-day expiry.
5. Build invite link: `https://<instance>/invite#<base64url(InviteGroupID || inviteAgentSecret)>`.

**Acceptance:**
1. Recipient opens link. Browser does not send fragment to server.
2. Recipient's client extracts `InviteGroupID` and `inviteAgentSecret`, connects to sync server, pulls `InviteGroup` and `Invitation`.
3. Client temporarily authenticates as the invite agent (using the secret from the URL fragment), unseals the wrapping entry `key_<readKey>_for_<inviteAgentID>`, decrypts the readKey.
4. Client decrypts `Invitation` plaintext; shows "Sven wants to add you as a contact — accept?" UI.
5. On accept, recipient's client uses the `writerInvite` role to add itself as `writer` on `InviteGroup`. Writes acceptance fields (`recipientAccountID`, `recipientFingerprint`, `acceptedAt`) into `Invitation`.

**Completion:**
1. Inviter's client (subscribed to `Invitation` updates) sees acceptance. Verifies recipient's signature.
2. Adds the recipient to its `ContactBook` with `pinnedFingerprint` (TOFU).
3. Creates a `ConversationGroup` with both as members; creates `Conversation` (kind `"dm"`); creates per-author `WriteGroups` for both (see §6.3); registers them in `Conversation.authorWriteGroups`.
4. Marks `Invitation.consumed = true`; tombstones `InviteGroup`.
5. Recipient's client, now in the new `ConversationGroup`, syncs the conversation and adds inviter to its own `ContactBook`.

### 5.2 Bearer-token properties and mitigations
- **One-shot consumption:** acceptance flips `consumed`; subsequent acceptance attempts are refused by the inviter's client.
- **Short expiry:** default 7 days, configurable per invite.
- **TOFU pinning:** after acceptance, both parties see the other's safety number; out-of-band verification possible.

### 5.3 Whitelist enforcement
Client-side: any sync attempt for a Group whose admin is not in my `ContactBook` (and which I have not explicitly accepted via an Invitation) is rejected before pulling content. This blocks the §10 "Mallory claims Bob is in her group" attack from costing Bob bandwidth or storage.

---

## 6. Conversation and group lifecycle

### 6.1 1:1 conversation
Created automatically on contact establishment. `ConversationGroup` has both participants as `admin`. `kind = "dm"`. No title.

### 6.2 Group conversation
1. Creator becomes `admin` of new `ConversationGroup`.
2. `Conversation` CoValue created, `kind = "group"`.
3. Per-author `WriteGroup` created for the creator and for each initial member.
4. Members added from `ContactBook`. Some can optionally be promoted to `manager` (can add/remove non-admin members).

### 6.3 Per-author write-Groups (cryptographic authorship integrity)

Each conversation participant has a `WriteGroup_<accountID>`:
- `parent_<ConversationGroupID>` → mapped as `"reader"` (inherits all conversation members as readers).
- Direct member: the named participant as `writer`.

Each `Message` is owned by its author's WriteGroup. Consequence:
- **Other participants cannot edit my messages** (they have only `reader` role on my WriteGroup; the validator on every replica rejects unauthorized writes).
- **Other participants cannot author messages in my name** (creating a Message owned by `WriteGroup_Sven` requires `writer` on that group, which only Sven has).
- The Message rendering layer derives author from the owning WriteGroup, never from a self-declared field.

### 6.4 Membership changes

**Adding a member:**
1. Append to `ConversationGroup` as `writer`. Jazz auto-wraps current readKey.
2. Create their `WriteGroup_<accountID>` (parent = ConversationGroup mapped `"reader"`, direct = them as `writer`).
3. Register in `Conversation.authorWriteGroups`.

The new member can read all prior history (Jazz chains old readKeys via `key_<newKey>_for_key<oldKey>` entries — unavoidable). For threads where this is undesired, create a fresh conversation rather than admitting them to the old one.

**Removing a member:**
1. Set their role on `ConversationGroup` to `revoked`.
2. Jazz rotates: new readKey wrapped for remaining members, sealed under previous readKey for cache continuity.
3. Their WriteGroup can be left in place (no harm; nobody can write there).

**Property:** removed member retains access to messages they already replicated. Forward rotation only. Document this honestly.

---

## 7. Sync server

### 7.1 Local development (E1a target)

For the earliest iteration, everything runs locally:
- Sync server on `localhost:<port>` via `jazz-tools` server module (or `npx jazz-run sync`), backed by an ephemeral SQLite file.
- Frontend on `localhost:5173` (Vite dev server).
- Two users simulated as two browser windows (e.g., Chrome + Firefox, or normal + incognito).
- No TLS, no auth on the sync server, no backups, no monitoring.

This is enough to validate the full architecture end-to-end (account creation, QR pairing, invitation, conversation, multi-device) before any deployment work.

### 7.2 Production deployment (E1b — details deferred)

For the deployed iteration, the rough shape:
- Single VPS in a privacy-friendly jurisdiction (Netherlands, Iceland, Switzerland).
- Docker Compose stack: sync server + Caddy reverse proxy (auto Let's Encrypt) + backup cron.
- SQLite for v1 (migrate to RocksDB if storage exceeds ~50 GB or write contention shows up).
- Encrypted weekly snapshots to off-site object storage; 4-week retention.
- Per-account quotas: not in v1, add when abuse signals exist.
- Caddy access logs; 7-day retention; no IP-to-account correlation stored.

**Detailed deployment design is deferred.** The above is a forward-looking sketch, not a v1 implementation target. Decisions about specific hosting provider, exact backup tool, monitoring stack, and HA posture come closer to E1b.

### 7.3 Operational principles (for E1b when we get there)
- Physical deletion enabled (1-minute interval).
- TLS 1.3 only.
- Sync server runs as unprivileged user under systemd / Docker restart policy.
- Backup encryption key stored separately from the sync database.

---

## 8. Security posture

Detailed threat model in **`docs/security/threat-model.md`**. Brief summary:

- **Cryptographically protected:** message content, file content, Account secret keys, profile data of accounts you don't share a Group with, message authorship integrity.
- **Structurally exposed (to operator and operator-compromise only, not to other users):** membership graph, CoValue reference graph, per-transaction metadata, IPs, social graph by inference.
- **Not protected:** content disclosure by participants (screenshots), past content on a compromised device (no per-message FS in v1), endpoint compromise.

A random user connecting to the same sync server **cannot enumerate metadata** (no list-all API, IDs are 32-byte hashes, decryption requires Group membership). The social graph is visible to the operator and to a server compromise; not to users at large.

---

## 9. MVP scope and roadmap

### 9.1 E1a — Local-only proof of concept
Target: end-to-end "two browsers on one machine" scenario works.
- All schemas (§3) implemented.
- Account creation + passphrase ceremony.
- QR multi-device pairing flow.
- Contact invitation issuance + acceptance.
- 1:1 conversation with message exchange.
- Group conversation creation + member add/remove.
- Per-author WriteGroups enforced.
- Inline media (≤5 MB).
- Local sync server.

**Done definition:** two browser instances on one machine can complete the full lifecycle — account create, pair a "second device" (third browser instance), exchange invite link, send messages, share an image, create a group with a third user, remove someone.

### 9.2 E1b — VPS deployment
Same feature set as E1a, deployed on a real VPS, accessible from real devices over the internet. Real users can use it.

### 9.3 E1.1 — Hardening + immediate next features
- Disappearing messages (per-conversation TTL; tombstone on expiry).
- Better Auth email recovery bridge (opt-in).
- Read receipts and typing indicators (with privacy settings).
- Message edit/delete UX (mechanism is already in place from per-author WriteGroups).
- Auto-rotation of conversation readKey on device revocation.
- Group conversation polish: member-management UX, admin event log.
- iOS PWA install instructions and graceful degradation.

### 9.4 E2 — Real product investment (conditional on traction)
- Per-message ratchet (Olm-style) for 1:1 chats.
- Shamir social recovery.
- Username-searchable contact discovery.
- Stranger message-request inbox.
- React Native shell + native push notifications.
- Server-side per-account quotas + abuse heuristics.
- Self-hosted instance documentation for users running their own server.

### 9.5 Never in scope
- Tor transport, sealed-sender, mixnet padding (different threat model).
- Public channels, large groups (>500), federation (different product).
- Phone-number identity, server-side message search, server-readable backups (different security posture).

---

## 10. Open risks and known weaknesses

Honest accounting. None fatal; all worth documenting so we don't pretend they're solved.

1. **Bearer-token invite links.** Anyone holding a link can claim it. Mitigated by short expiry + one-shot consumption + TOFU pin. The "screenshot of a friend's phone" case still exists.
2. **Browser-storage persistence is fragile.** PWA storage can be cleared. Need strong "back up your passphrase" warning, especially on mobile.
3. **iOS Safari has degraded functionality.** No proper push outside installed PWA. Document.
4. **Single-device account loss.** Until E1.1's email recovery, lost-device + lost-passphrase = account permanently gone.
5. **No per-message FS in v1.** Device compromise reveals all cached history.
6. **Group history visible on join.** New members see all prior history. Cannot be hidden; design around it.
7. **CRDT edge cases on concurrent admin actions.** LWW resolves but may surprise users. Mitigation: surface admin event log.
8. **Single-server availability.** No HA in v1. Vision X tolerates outages well (offline-first), but extended downtime blocks pairing and delivery.
9. **No quota/rate-limiting in v1.** A determined abuser with many accounts could fill storage. Acceptable while not advertised; launch blocker for public release.
10. **Linkability across devices.** All devices share an accountID; operator knows they're the same user. Accepted in this threat model.
11. **Jazz is pre-1.0.** API surface may shift. Pin version, review CHANGELOG before upgrading.
12. **No formal security audit in v1.** Recommend Cure53 / Trail of Bits engagement (~€15-30k) before any public launch.

---

## 11. References

- `Local-first messenger research.md` — source research the design is built on
- `docs/security/threat-model.md` — companion threat model document
- Jazz docs: <https://jazz.tools/docs>
- Jazz source: <https://github.com/garden-co/jazz>
- `permissions.ts` in `packages/cojson/src/` — authoritative source for the role/invite model
