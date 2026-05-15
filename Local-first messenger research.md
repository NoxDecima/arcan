# Local-first messengers with end-to-end encryption: a Jazz-centric deep dive

Building a Briar-inspired messenger on a true local-first stack is **feasible today with Jazz/CoJSON**, but the project's success depends on accepting two non-negotiable truths up front: (1) cryptographic group keys can only rotate forward — you cannot _un-see_ messages a removed member already replicated; and (2) even the most metadata-hiding E2EE sync server still leaks the social graph unless you tunnel the transport (Tor, mixnet). This document walks the architectural terrain — verified against Jazz's `permissions.ts`, the encryption docs, recent CHANGELOG entries, and the source-of-truth specifications of Signal, Matrix, Briar, MLS, ElectricSQL, Zero, Triplit, LiveStore, Evolu, SecSync, p2panda, and RxDB — and proposes a pragmatic stack at the end.

The audience is a developer who already understands CRDTs and ciphers. Hedging is kept to the minimum the evidence permits.

---

## 1. What "local-first" means and the spectrum it lives on

The term comes from the 2019 Ink & Switch essay _"Local-first software: You own your data, in spite of the cloud"_ by Kleppmann, Wiggins, van Hardenberg, and McGranaghan. It defines seven ideals: **no spinners** (the primary copy is local, so UI never waits on the network), **work is not trapped on one device** (multi-device sync), **the network is optional** ("Offline is a normal state, not an error state"), **seamless collaboration**, **the Long Now** (data survives the vendor), **security and privacy by default** ("servers only hold encrypted data that they cannot read"), and **ultimate ownership and control**. At Local-First Conf 2024, Kleppmann tightened the working definition to: _"the availability of another computer should never prevent you from working."_

Local-first is a **spectrum**, not a binary. Three reference points:

- **Pure peer-to-peer (Briar)** — no servers exist. Bramble Transport Protocol over Tor when online, Bluetooth and Wi-Fi Direct when not. Contact onboarding via in-person QR. No global identifier registry, hence no social graph anywhere central.
- **Server-relayed E2EE (Jazz/CoJSON)** — a "Jazz Cloud" relay stores and forwards encrypted CoValues. The server sees ciphertext, signatures, sizes, and the public membership graph of every Group, but not content.
- **Server-trusted local-first (Linear, ElectricSQL)** — Postgres on the server is authoritative; clients keep a (partial) IndexedDB mirror, hydrated via `/sync/bootstrap` + WebSocket delta packets. The server reads everything.

A messenger inspired by Briar — censorship-resistant, social-graph-private, end-to-end encrypted — sits naturally between Briar and Jazz. **Briar's transport story (Tor + offline mesh) and Jazz's data story (CRDT-shaped CoValues with cryptographic permissions) are complementary; the hard work is fusing them.**

---

## 2. How local-first sync actually works

Every local-first framework has three components: a **local replica** (SQLite, IndexedDB, OPFS), a **sync engine** that pushes and pulls deltas, and **reactive queries** that re-render the UI when the local replica changes. They differ in what they sync.

Two dominant data models:

**CRDT-state systems** — Automerge, Yjs, Loro, Jazz/CoJSON — store the merged state as the source of truth plus enough history to merge concurrent changes. Merges are deterministic; no server arbiter required. Drawback: every operation lives somewhere in the structure forever (as a tombstone if nothing else).

**Event-log systems** — LiveStore, traditional event sourcing — treat an **append-only log of domain events** as canonical. Read models (SQLite tables, in-memory caches) are derived by replaying events through _materializers_. Schickling's pitch: "Events are the most accurate representation of state. Everything else is a lossy abstraction." Drawback: logs grow unboundedly without compaction, and you write merge semantics yourself.

**Partial replication** is where these frameworks visibly differ:

|Framework|Sync unit|Permission filter|
|---|---|---|
|**Linear**|Workspace bootstrap + `SyncAction` deltas over WS|`subscribedSyncGroups` (user-id + team-ids + roles) gates delta delivery|
|**ElectricSQL**|A **Shape** = `{table, where, columns}` over Postgres, streamed as an HTTP log|Your API gates Shape requests (proxy or gatekeeper pattern)|
|**Zero (Rocicorp)**|A **ZQL query**; server-side IVM over a SQLite replica of Postgres|"Synced Queries" — server constructs queries dynamically from JWT auth|
|**Replicache**|App-defined `pull` returning patches (4 strategies: reset, global version, per-space version, row-version with CVR)|Pull endpoint enforces auth|
|**Triplit**|WebSocket live-query subscription with delta patches|Role-based filter expressions per collection per op; **auto-evicts on permission change**|
|**Jazz/CoJSON**|A **CoValue** (CoMap/CoList/CoFeed) and its referenced CoValues|Cryptographic — non-members literally can't decrypt the ciphertext even if served|

The fundamental Jazz move is that **the permission graph and the data graph are the same graph**. A CoMap is owned by a Group; the Group is itself a CoValue; the readKey is wrapped per-member as a transaction _inside the Group's transaction log_. There is no separate ACL table, no server-side rules engine. This is why Jazz can do partial replication "for free": the server cannot serve a CoValue to a non-member in a useful form, because the non-member can't read it.

---

## 3. The cryptographic core of Jazz / CoJSON

**Verified primitives** (from `jazz.tools/docs/react/reference/encryption` and FAQ): BLAKE3 for incremental hashing, Ed25519 for signing, XSalsa20 for symmetric stream encryption — paired with Poly1305 for AEAD via standard NaCl `secretbox`/`box` constructions. The asymmetric "groupSealer" and "SealerID" types in `permissions.ts` use X25519 + XSalsa20-Poly1305 sealed boxes (the NaCl `crypto_box` construct). Since v0.20.0 (early 2026) the implementation is a **pure native Rust core** compiled to WebAssembly for browsers and Node, and as a native module for React Native via `cojson-core-rn`. The pre-0.20 `PureJSCrypto` (built on `@noble/curves` / `@noble/hashes`) was removed; `RNQuickCrypto` was replaced by `RNCrypto`. The protocol algorithms are unchanged.

A **CoValue ID** is the BLAKE3 hash of its immutable header (CoValue type + owning group), making CoValues content-addressed but mutable through their session logs. A CoValue is composed of one or more **sessions** — one per `(account, device)` pair. Each session is an append-only chain of transactions. After each transaction, the session's running BLAKE3 hash is signed with Ed25519 by the authoring agent. This is the integrity-and-authenticity backbone: a peer who receives a session can replay the hash chain and verify every signature without trusting the sync server.

### Envelope encryption: the wrapped-key pattern

Group content is encrypted under a **symmetric `readKey`**. The readKey is **wrapped per recipient** as additional entries inside the Group's own CoMap. Inspecting `packages/cojson/src/permissions.ts` shows the exact field-naming scheme — every Group CoMap accepts these special key types:

```ts
const change = changes[0] as
  | MapOpPayload<RawAccountID | AgentID | Everyone, Role>
  | MapOpPayload<"readKey", JsonValue>
  | MapOpPayload<"groupSealer", SealerID>
  | MapOpPayload<"profile", CoID<RawProfile>>
  | MapOpPayload<"root", CoID<RawCoMap>>
  | MapOpPayload<`parent_${CoID<RawGroup>}`, CoID<RawGroup>>;

// And, detected by predicates:
// key_<keyID>_for_<accountID>        — readKey sealed for a member's X25519 pubkey
// key_<newKeyID>_for_key<oldKeyID>   — new readKey wrapped under previous readKey (lazy rotation)
// key_<keyID>_sealedFor_sealer<id>   — readKey sealed for a parent group's sealer
// writeKeyFor_<accountID>            — per-member write key for writeOnly access
```

The current `readKey` value is set as a top-level entry on the Group CoMap. For every member, a sealed-box copy is stored under `key_<keyID>_for_<accountID>`. **Only `admin`, `manager`, the matching `*Invite` agent, or the affected member doing a self-key-revelation may write these entries**, enforced at the transaction-validation layer.

### Lazy / post-compromise forward secrecy at group level

When a member is removed, Jazz generates a **new** readKey, wraps it for the remaining members (and optionally under the previous readKey for cache continuity), and from that moment forward all new transactions are encrypted under the new key. The official encryption doc puts it plainly: _"removed members can't read new data, but existing data they already had access to remains readable to them."_ CHANGELOG 0.20.8 added group-owned asymmetric keys to make this scale efficiently to nested groups: _"This makes extending groups without having access to the encryption key zero-cost for the parent group."_

**This is not Signal's per-message Double Ratchet.** Jazz has post-compromise security at _group_ granularity (any rotation event heals the group going forward) but no per-message forward secrecy. A device key compromise reveals every message the device was authorized to read at the time of compromise. A messenger that needs Signal-grade FS must layer a ratchet on top of CoValues — see §11.

### Trust-on-first-use is the unsolved part

Jazz gives you account identities (Ed25519 fingerprints, equivalent to a long-term safety number) but does not yet ship a Signal-style "safety number changed" UI. A serious messenger needs a manual pairing flow (QR scan, 60-digit code derived from `BLAKE3(A_pubkey ‖ B_pubkey)`) and pinning logic that breaks loudly if a contact's signing key rotates without out-of-band confirmation. Briar's in-person QR exchange is the gold standard; Signal's safety-number QR is the consumer-grade compromise.

---

## 4. Authentication — how users actually sign in

Local-first authentication is **categorically different from server-trusted auth**. There is no database row to check a password against. An account _is_ an Ed25519 signing keypair plus an X25519 encryption keypair, generated on the device. The "username" is the public key fingerprint. The "password" is whatever bootstraps possession of the private key on a new device.

Jazz exposes three auth modes (per the 2.0 alpha docs, with classic 0.20 equivalents): **`anonymous`** (an ephemeral identity generated on first visit; can subscribe to queries but is structurally denied writes by some apps), **`local-first`** (a real persistent account stored on the device, optionally upgradable), and **`external`** (the account is anchored to a third-party auth provider). Four provider integrations are verified in the docs:

- **Passkey** (`jazz-tools/passkey` and React-Native variant via `react-native-passkey`) — the 32-byte account secret is bound to a WebAuthn credential. Multi-device sync of the _passkey itself_ is handled by iCloud Keychain, Google Password Manager, or 1Password. The Jazz docs candidly warn that platform boundaries are not always visible to users: a passkey created on Safari/macOS may not appear on Chrome/Windows.
- **Passphrase** (`jazz-tools/passphrase`) — the 32-byte account secret is encoded as a **24-word English phrase**, identical in shape to a BIP-39 seed phrase though Jazz uses its own wordlist. The docs are unusually honest: _"The 24 words are just the secret encoded differently, not a password layered over it. There's no hashing, no key-wrapping, no challenge-response: whoever sees the passphrase can sign in as the user."_ Error codes: `invalid-length`, `invalid-word`, `invalid-checksum`.
- **Clerk** (`useClerkAuth`, `JazzReactProviderWithClerk`, Svelte equivalent in 0.19.21) — Clerk issues a JWT whose `sub` maps to a Jazz account; the Jazz sync server verifies it.
- **Better Auth** (`jazz-tools/better-auth`, database adapter package; upgraded to BA 1.4.7 in 0.19.19) — uses Better Auth's JWT plugin with ES256 + JWKS.

There's a notable bridge mechanism for upgrading a local-first identity to an external one without losing data: `db.getLocalFirstIdentityProof({ ttlSeconds: 60, audience: "..." })` mints a short-lived proof that the client owns a given Jazz account; the server-side `verifyLocalFirstIdentityProof(token, audience)` from `jazz-napi` returns `{ ok, id, error }`. Better Auth's database hook then stamps the new user record with the proven Jazz ID, so all future JWTs map to the same account.

**Multi-device synchronization of identity** — the central messenger problem of "how does account A on phone become account A on laptop" — works differently per provider:

|Provider|Mechanism|Cross-platform|
|---|---|---|
|Passkey|Synced via OS keychain|Apple↔Apple, Google↔Google; cross-vendor requires QR cross-device flow|
|Passphrase|User types 24 words on new device; derives same 32 B secret|Universal|
|Clerk / Better Auth|User signs in to provider; JWT carries `sub`|Universal|
|Passkey-backup|Resident WebAuthn credential stores the 32-byte secret as a vault|Browser-only currently|

**Account recovery** is the dark side of holding your own keys. Lose the device _and_ the passphrase _and_ the linked provider, and the account is gone. The docs repeat the warning: _"Lose the secret and you lose the account."_ Compare this to Signal's SVR3, which splits trust across SGX + AWS Nitro + AMD SEV-SNP enclaves to let users recover via a low-entropy PIN without the operator being able to brute-force it.

**Compared with Evolu**: Evolu uses a BIP-39 mnemonic as the sole identity material; everything (ownerId, writeKey, encryptionKey) is derived from it. Recovery = type the mnemonic on a new device. No multi-provider story, no Clerk bridge, no Passkey UX. It's simpler and offers fewer escape hatches. SecSync delegates auth entirely to the application; p2panda is similar.

For a messenger, the realistic auth recipe on Jazz is: **Passkey for the convenient consumer path, Passphrase as the always-available fallback for power users, Better Auth for a self-hosted account-bridging layer if you want an email anchor**. Anonymous mode is useful for "try before signing up" but should not be the durable identity.

---

## 5. Permissions, verified down to the source

Jazz Groups are the unit of access control. From `packages/cojson/src/permissions.ts`, verbatim:

```ts
export type AccountRole =
  /** Can read the group's CoValues */
  | "reader"
  /** Can read and write to the group's CoValues */
  | "writer"
  /** Can read and write to the group, and change group member roles */
  | "admin"
  /** Can read and write, invite and revoke members except admin */
  | "manager"
  /** Can only write to the group's CoValues and read their own changes */
  | "writeOnly";

export type Role =
  | AccountRole
  | "revoked"
  | "managerInvite"
  | "adminInvite"
  | "writerInvite"
  | "readerInvite"
  | "writeOnlyInvite";
```

**All five roles and all five invite variants exist exactly as the user expected.** The capability matrix, derived from `determineValidTransactionsForGroup`:

|Role|Read|Write|Invite|Demote others|Promote to admin|
|---|---|---|---|---|---|
|`admin`|✓|✓|All roles|All non-admins (self-demote allowed)|✓|
|`manager`|✓|✓|Reader, writer, writeOnly only|Non-admins, non-managers|✗ ("Managers can't invite admins/managers")|
|`writer`|✓|✓|✗|✗|✗|
|`writeOnly`|own changes only|✓ (under per-member write key)|✗|✗|✗|
|`reader`|✓|✗|✗|✗|✗|

`isHigherRole` orders roles as `admin > manager > writer > reader`. `writeOnly` is orthogonal (write access without read access). The special pseudo-member `EVERYONE` can only hold `reader`, `writer`, `writeOnly`, or `revoked` (never admin or manager), enforced by validator comment _"Everyone can only be set to reader, writer, writeOnly or revoked."_

### Cryptographic enforcement, not server checks

Permissions are enforced **by encryption and signatures**, not by a server-side gate. The server never refuses to deliver bytes to a non-member; it doesn't need to, because:

- The transaction content is encrypted under the group's `readKey`. The server doesn't have the readKey; only members do.
- The wrapping entries `key_<keyID>_for_<accountID>` only exist for actual members; a non-member can't extract the readKey from the Group's transaction log.
- Each transaction is signed with the author's Ed25519 key; the validator (running client-side on every replica) rejects transactions authored by accounts not in the Group, or accounts that lacked the required role at the transaction's logical timestamp.

The validator runs the same algorithm on every replica. There is no privileged server. This is what makes Jazz a _true_ end-to-end-encrypted system rather than a "server enforces ACLs over plaintext" system like ElectricSQL or Zero.

### Group inheritance with role overrides

Groups can be members of other groups. From `MemberRoleResolver` in `permissions.ts`:

```ts
getRoleAtTime(member, time) {
  let role = this.memberRoles.get(member);
  for (const [parentGroup, roleMapping] of this.parentGroups.entries()) {
    const parentRole = parentGroup.atTime(time).roleOfInternal(member);
    if (!parentRole || !isInheritableRole(parentRole)) continue;
    const resolvedParentRole =
      roleMapping === "extend" ? parentRole : roleMapping;
    if (isHigherRole(resolvedParentRole, role)) {
      role = resolvedParentRole;
    }
  }
  return role;
}
```

A Group references its parent via a `parent_<groupID>` field, whose value is a `ParentGroupReferenceRole`:

- `"extend"` → inherit the member's exact role from parent (parent admin → child admin).
- A specific role like `"reader"` or `"writer"` → **cap** the inherited role (parent admin → child reader). This is the override pattern.
- `"revoked"` → severs the inheritance edge.

Effective role is the **maximum** of the direct role and all parent-derived roles (after override). Circular references are detected (`isSelfExtension`) and the older bidirectional `child_<groupID>` form is no longer permitted (`"Child extensions are not allowed anymore"`). Only admins/managers may set parent extensions.

### How this compares with non-E2EE frameworks

**ElectricSQL** has no permission model — your API gates Shape requests (proxy or gatekeeper pattern), the server reads everything. **Zero** is moving from a legacy `definePermissions` API (RLS-style ZQL where-expressions evaluated at _build time_ with placeholder AuthData, severely limited to property access) toward "Synced Queries + Custom Mutators" where permissions are just server code that constructs ZQL. **Triplit** ships role-based filter expressions per collection per operation (read/insert/update/postUpdate/delete) and uniquely **auto-evicts data from the client cache when permissions change** — which Jazz cannot do because removed members already have local copies.

The fundamental design distinction: in Zero/Triplit/Electric, the server is trusted and refuses to send forbidden rows. In Jazz, the server is _not_ trusted and _cannot_ refuse usefully — security comes from the impossibility of decrypting without the wrapped key.

---

## 6. Data deletion, the most-misunderstood feature

Tombstones are intrinsic to CRDTs. You cannot remove an operation from a causal history without breaking ordering invariants on peers that haven't seen it yet. Yjs's `INTERNALS.md` says it directly: _"We can't garbage collect deleted structs (tombstones) while ensuring a unique order of the structs."_ When Yjs GC is enabled, deleted Items have their _content_ discarded and the Item is replaced with a `GC` struct — a lightweight tombstone that still occupies an ID slot in the causal graph. Liveblocks' guide is blunter: _"there's no way to delete a Yjs document without deleting the entire room."_

Automerge takes the same line: history is _compressed_, not deleted. The 2.0 binary columnar format gets to "less than one additional byte per character" of text, and Automerge 3.0 (Aug 2025) brought roughly a **10× memory reduction** — pasting Moby Dick into a doc went from 700 MB RAM in v2 to 1.3 MB in v3 — but the history is still there. Loro's "shallow snapshot" can drop historical ops at the cost of losing offline-merge support from before the snapshot. The deletion problem is structural, not lazy engineering.

### What Jazz's "permanent deletion" actually does

CHANGELOG 0.20.0: _"Added permanent CoValue deletion with a new `deleted` loading state."_ The verified mechanics, from `jazz.tools/docs/react/core-concepts/deleting`:

- API: `deleteCoValues(Schema, id, options?)` from `jazz-tools`.
- After deletion, `value.$isLoaded === false` and `value.$jazz.loadingState === "deleted"`.
- Authorization: **admin on the CoValue's group required**. Pre-flight permission check runs over the entire `resolve` tree; if any node fails the whole delete fails.
- **Groups and Accounts are silently skipped** — `deleteCoValues(MusicaAccount, ...)` deletes the account's _contents_ (its child CoValues per the resolve query) but not the account itself. There is currently no API to delete a Jazz account proper.

The honest deletion mechanics, verbatim from the doc:

> _"Deleted values are not deleted from storage immediately, but are marked with a tombstone. To balance performance considerations, the actual physical deletion of the data from storage is done asynchronously in the background, and is dependent on the sync server's configuration. Jazz Cloud and `jazz-run sync` have delete enabled by default on a one minute schedule. If you're running a custom self-hosted sync server, you need to enable this feature. Deleted CoValues stored in Jazz Cloud may persist in back-ups until they are overwritten."_

So the three distinct meanings of "delete" map cleanly to Jazz:

1. **Delete from my view** — purely UI; the local replica still has it. Trivial.
2. **Delete from all replicas** — issue the tombstone transaction; every peer that comes online eventually applies it and drops the content. Removed members who never reconnect still have their old copy forever.
3. **Delete from the underlying log** — the tombstone _is_ a log entry. The encrypted content of pre-tombstone transactions is reclaimed asynchronously by a GC pass on each storage tier. Backups retain it until overwritten.

### Comparison across frameworks

|System|What "delete" means|
|---|---|
|**Jazz**|Tombstone transaction + async storage GC; backups retain; needs admin role; can't delete account itself|
|**Yjs**|Content discarded, tombstone struct retained forever|
|**Automerge**|Operations stay; compression mitigates size|
|**Loro**|Shallow snapshots drop history (trading offline-merge support)|
|**LiveStore**|Events are immutable; deletion is a new event the materializer applies as a soft-delete. **Eventlog compaction is open issue #136, not shipped.**|
|**ElectricSQL / Zero / Triplit**|Standard SQL `DELETE`; server is authoritative|
|**SecSync**|Key rotation + new snapshot; relay can then GC prior encrypted blobs|
|**RxDB**|Replication-level soft-delete via `_deleted: true` (required for sync convergence)|

### GDPR and the right-to-be-forgotten

The European data-protection regime presumes a central controller can purge a record. In a peer-to-peer system where each member already has a local replica, "purge" is best-effort. The compliance posture for a Jazz-based messenger probably needs to be:

- Tombstone the user's data via Group admin action.
- Disable the user's account at the auth provider (so they can't re-sync).
- Document plainly that **offline replicas are outside the controller's reach** and that this is a property of E2EE local-first systems. Briar takes the same view (forums survive even if the originator deletes); WhatsApp gets around it by being server-trusted.
- For sensitive content, prefer **ephemeral messages with a TTL**: the client deletes locally on timer; the tombstone forces remote deletion when peers next sync; cryptographic key rotation makes any pre-tombstone ciphertext that still exists in backups undecryptable by anyone who lost their wrapped key.

### Practical deletion in a messenger

- **Delete a message for everyone**: tombstone the message CoValue (the conversation's CoFeed/CoList entry). Sender or admin authority. Peers apply the tombstone on next sync. Pre-tombstone copies on offline replicas persist until they come online.
- **Delete a conversation**: tombstone the Group + the conversation root CoValue. Same caveats. Messages already cached for "infinite scroll" are still on members' disks until storage GC reclaims them.
- **Delete your account**: not directly supported. Practical workaround: tombstone all CoValues you own, leave all Groups (an admin must demote/revoke you), revoke the auth provider, rotate any shared groups so your key wrapping is no longer valid. The Ed25519 account public key is permanently part of the signed transaction history of every Group you touched; you cannot remove that without breaking the signature chain.

### What gets retained even after "deletion"

Even after a successful tombstone + GC pass: the Group's transaction log still contains your role grants and key-wrapping entries (your `accountID` is part of the public membership graph); the BLAKE3 hash chain references the deleted transactions' positions; backup tier may hold ciphertext for some retention window; any peer that was offline at the time of deletion still has the original. **The sync server's view of "who was a member of group G at time T" is essentially permanent metadata.**

---

## 7. What happens when permissions change

This is the area where local-first systems most often surprise developers. The TL;DR: keys rotate forward; data already replicated stays readable to whoever already had it.

**Adding a member.** An admin or manager (or appropriate `*Invite` agent) writes a `key_<currentReadKey>_for_<newMemberAccountID>` entry to the Group CoMap, sealed with the new member's X25519 pubkey. The new member can now decrypt the current readKey and therefore all subsequent transactions. **They can also decrypt all historical transactions** in the Group, because those are encrypted under previous readKeys, which themselves are chained via `key_<newKeyID>_for_key<oldKeyID>` entries. So adding a member reveals the full history. (If you don't want this in a messenger — i.e., new members shouldn't see old messages — you must put each conversation segment under a fresh Group and only admit them to the newer one.)

**Removing a member.** The admin issues a removeMember transaction. CHANGELOG 0.20.0: _"`removeMember` now throws when the caller is unauthorized."_ Jazz then rotates: generates a new readKey, writes `key_<newKey>_for_<eachRemainingMember>` entries, and writes `key_<newKey>_for_key<oldKey>` so remaining members' caches can transition. From that moment forward, all new transactions are encrypted under the new readKey. The removed member: cannot decrypt new transactions (no wrapped copy of the new key); **can still decrypt every historical transaction they replicated** (they retain the old readKey locally). This is the unavoidable property: forward rotation, no retroactive un-seeing.

**Role demotion (admin → reader).** Immediately revokes the demoted member's authority to write to the Group's permission state (any future transaction authored by them attempting role changes is rejected by the client-side validator on every peer). Crucially, the demoted member's _read_ access remains until they're removed entirely, and any keys they already hold remain valid. They can still read messages.

**Role promotion (reader → admin).** Takes effect on the next transaction the promoted member authors. They can now write, invite, and (if admin) rotate keys. No key rotation is needed; their existing wrapped readKey is sufficient.

**The permission-check flow** runs client-side on every replica, every time a transaction is appended: validate signature; compute the author's role at the transaction's logical timestamp via `MemberRoleResolver.getRoleAtTime(member, time)`, walking parent groups for inheritance; reject if the role doesn't permit the operation. A malicious server that _omits_ transactions still cannot inject invalid ones, because clients verify signatures end-to-end.

### How traditional messengers compare

- **Signal** rotates Sender Keys when a member leaves a group (Groups v2), but its real strength is **per-message ratcheting** in 1:1 chats via Double Ratchet — even instantaneous compromise of a device's current state only exposes a single message before the next ratchet step rolls the chain forward. Jazz does not have this property.
- **MLS (RFC 9420)** uses TreeKEM: every Commit creates a new epoch with fresh group secrets in O(log n) operations, providing both forward secrecy (past epoch secrets are deleted) and post-compromise security (any member can heal the group by issuing a Commit). The hard part is **offline members**: their TreeKEM tree leaf is stale and delays group healing. The Quarantined-TreeKEM construction (CCS 2024) addresses this but isn't deployed yet.
- **WhatsApp** uses Signal's group model; metadata visible to Meta is the dominant concern, not crypto.
- **Matrix Megolm** has forward secrecy _within_ a session but PCS only when sessions are rotated, which is not automatic. Decentralized MLS is in active development for Matrix.

For a Jazz-based messenger, the realistic security posture against device compromise is roughly **MLS-class minus per-message FS** — better than Megolm without rotation, worse than Signal Double Ratchet, comparable to MLS without continuous Commits.

---

## 8. Data growth over time — does it just keep ballooning?

Naive CRDT and event-log implementations grow without bound. The frameworks differ enormously in how aggressively they fight this.

**Automerge** retains operation history but compresses brutally. Pre-binary JSON was ~1300 bytes per character of text; columnar binary is "less than one byte per character" on average (1.1 B/op in Kleppmann's experiment), with gzip getting whole traces close to plain-text size. Automerge 3.0's 10× memory reduction (Aug 2025) makes loading documents with very long histories from 17 hours to 9 seconds. **History is never deleted, only made cheap.**

**Yjs** has GC: deleted content is dropped, tombstone IDs remain. For most workloads this is enough, but documents that churn heavily (insert-then-delete cycles) accumulate tombstone structs forever.

**Loro** offers an explicit "shallow snapshot" that drops historical ops but loses the ability to merge with peers whose state predates the snapshot.

**Jazz/CoJSON** has no published compaction blog post, but several signals from the source and changelog point to the architecture:

- Each transaction carries fixed crypto overhead: Ed25519 signature (64 B), BLAKE3 incremental hash state contribution (32 B per state position), per-transaction metadata (madeAt, author agent ID, key generation pointer), and the encrypted payload. Even an empty operation is **roughly >100 bytes** of crypto overhead. This is a meaningful floor for high-churn use cases like typing indicators or cursor positions; you don't want to model those as CoValue transactions.
- Recent CHANGELOG entries — _"merged transactions"_ referenced in `permissions.ts` (the validator handles `meta.madeAt` being changed by merging), and dependency-aware GC where parent CoValues wait for dependents before being collected — indicate Jazz is actively building compaction primitives. Self-hosted sync servers must opt in.
- Per-session signatures cannot be discarded without breaking integrity. Unlike LiveStore's planned key-callback compaction, Jazz preserves the signed chain — bulk log compaction is structurally harder.
- The sync server has been optimized to not load CoValues into memory unless there's content to sync, and to use cached read-key indices instead of iterating all wrapping entries (CHANGELOG 0.20.6). This is server-side memory mitigation, not on-disk compaction.

**LiveStore** is the most upfront: eventlog compaction is _open issue #136_, not shipped. Schickling's proposal is a per-mutation key callback so writing a new event for the same logical key supersedes prior events. Until this ships, LiveStore stores wins **literally everything** the user ever did.

**Linear's storage tiering** is the model to copy for a messenger: per-workspace IndexedDB DBs, **lazy hydration** (only currently-needed models in RAM, the rest on disk), `subscribedSyncGroups` filters server-sent deltas by access scope, `firstSyncId`/`lastSyncId` cursors mark snapshot boundaries. The pattern: keep recent and frequently-accessed data hot on device, older data fetched on demand from the server. For a local-first messenger, this looks like: full local copy of last N days/messages per chat; older messages stored encrypted on Jazz Cloud and fetched on scroll-back; offline access degrades gracefully.

### The "infinite scroll history" problem in messengers

Real consumer messengers handle this in pragmatic ways:

- **WhatsApp** stores everything locally in a SQLite `ChatStorage.sqlite` (often 5–20 GB after years), with **optional** iCloud/Google Drive backups (E2EE backups since Oct 2021; the key is held in WhatsApp's HSM-based Backup Key Vault or by the user as a 64-digit recovery code).
- **Signal** is device-local-only for chat history; no cloud archive of message content. Disappearing messages with per-chat timers are a first-class feature. Multi-device only syncs keys, not history (a deliberate constraint).
- **iMessage** synced via Messages-in-iCloud, end-to-end encrypted only when Advanced Data Protection is on (default off, opt-in since Dec 2022, withdrawn in the UK in 2025 under the Investigatory Powers Act).
- **Telegram** stores normal chats unencrypted on its servers; only Secret Chats are device-local and E2EE.

For a Jazz-based messenger on a 128–256 GB Android device with roughly 30–80 GB of free user storage, realistic budgets are: **a few GB for the messenger total**, **per-conversation budget on the order of tens to hundreds of MB**, with aggressive eviction of media to server (still encrypted) once it's older than some threshold. The trade-off space is honest: keep everything (full privacy + full offline access) vs aggressive compaction (storage efficiency + faster initial sync); messengers historically choose recency-biased eviction because users almost never scroll back two years.

---

## 9. What the server knows vs what it doesn't — the threat model that matters

For a messenger this is the section the user will re-read. Two explicit lists for Jazz Cloud (or any equivalent E2EE local-first sync server) follow, derived from `permissions.ts`, the encryption docs, and the WebSocket sync protocol.

**The server CAN see:**

- Account IDs (Ed25519 public keys) of every user connecting.
- The complete public membership structure of every Group: which `accountID`s appear, with what role, set when, by whom (the role-grant transactions are validated against signatures, so the server can read role transitions even though it can't read message content).
- Parent-group links (`parent_<groupID>`) and inheritance edges, since these are validated and propagated.
- The full graph of CoValue references — which CoValue points to which — since referenced CoValue IDs are stored in transaction payloads' structural metadata even when encrypted.
- Every transaction's metadata: session ID (which is `agentID + nonce`, leaking which device authored it), `madeAt` timestamp, transaction size in bytes, the Ed25519 signature.
- The number of transactions per CoValue, sync frequency, online/offline pattern of every account.
- IP address and connection metadata of every peer (unless tunneled via Tor or a VPN).
- Who syncs with whom and when — the social graph metadata.
- Backup ciphertext and tombstone-deletion lag for some retention window.
- CoValue IDs themselves are content-addressed via BLAKE3 of headers, leaking type information (CoMap vs CoList vs CoFeed) and the owning Group ID.

**The server CANNOT see:**

- Actual message content, file contents, profile fields, or any data inside a transaction's encrypted payload — sealed under XSalsa20-Poly1305 with a readKey it doesn't possess.
- The readKey itself; only members' wrapped copies (`key_*_for_<accountID>`) exist, sealed to X25519 pubkeys the server doesn't hold private keys for.
- Any account's signing or encryption private keys — they never leave the device.
- Decrypted CoValue content even ephemerally; the server processes only ciphertext.
- The semantic content of a transaction (e.g., whether it's a typed message or a reaction) beyond what can be inferred from size and CoValue type.

### Implications for the messenger threat model

The Jazz Cloud sync server is **a malicious-but-honest-curious adversary's dream for social-graph analysis and a complete failure for content surveillance**. Anyone compelled to produce records (lawful intercept, hack, insider) sees who talks to whom, when, how often, and roughly how much — but not what is said.

This is roughly the same threat model as **Signal without sealed sender + private contact discovery** (Signal's mitigations push the social graph behind SGX enclaves and per-message sender anonymity, but they still see IP/timing). It is **worse than Briar**, where there is literally no central observer because there is no server — Tor hides the social graph entirely from anyone outside the conversation itself. It is **better than WhatsApp/Matrix/iMessage** where social-graph metadata is collected, retained, and (for WhatsApp/iMessage default) monetized or backed up in less-protected forms.

### Comparison with major messengers, ranked by social-graph hiding

|Stack|Identifier|Social graph|Group membership|Message content|Hides metadata?|
|---|---|---|---|---|---|
|**Briar**|None (no registration)|**Hidden** (Tor + no directory)|Hidden|Hidden|**Yes — only system that truly hides social graph**|
|**Signal**|Phone # / username|Hidden via SGX + sealed sender (caveats: IP, timing leak)|Hidden via KVAC anonymous credentials|Hidden|Best-in-class among centralized|
|**Jazz Cloud-based messenger**|Ed25519 pubkey|**Visible to sync server**|**Visible**|**Hidden**|E2EE on content; metadata-leaky|
|**iMessage (with ADP)**|Apple ID / phone #|Visible to Apple (contact match)|Visible|Hidden in transit and backup|Poor; ADP improves backup|
|**WhatsApp**|Phone #|**Visible** (contact upload, no SGX)|**Visible**|Hidden|Poor — Meta collects/monetizes|
|**Matrix**|@user:homeserver|**Visible** to homeservers + federation peers|**Visible**|Hidden (if E2EE on)|Poor; federation amplifies|

### What you'd add on top of Jazz to match Briar's privacy properties

1. **Tor for all sync transport**. Run the sync WebSocket over a SOCKS5 proxy through Tor. The server then sees Tor exit IPs, not user IPs. Combined with rolling onion-service identities, you defeat IP-level social-graph correlation.
2. **Sealed sender at the CoValue layer**. Currently every transaction is Ed25519-signed by the author and the server can read that. You'd need to wrap the signature in a layer that only group members can decrypt to learn the author identity, while keeping integrity verifiable. This is non-trivial — it conflicts with Jazz's validator running server-side knowledge of who-may-write.
3. **Cover traffic / padding** to defeat ciphertext-size and timing analysis. Constant-rate dummy messages, padded message sizes.
4. **Out-of-band contact establishment** like Briar's QR-only-in-person or "mutual introduction by an existing contact" patterns. No directory of `accountID`s on the server.
5. **Optional Bluetooth / Wi-Fi Direct transport** for offline-mesh operation. Jazz today is WebSocket-only via `cojson-transport-ws`; you'd need a custom transport (the architecture allows it but no implementation exists).
6. **Per-message forward secrecy** by layering a ratchet (Olm-style or per-message ephemeral keys) over CoValue payloads in the message channel. Group state changes (membership, profile) stay on the standard CoJSON envelope; only the high-volume message stream gets the ratchet.

Layers 1, 4, and 6 are the highest-leverage additions for a Briar-class threat model. Layer 5 is the most distinctive feature of Briar and the most engineering-heavy to add.

---

## 10. Abuse, DoS, and resource exhaustion — the unprotected attack surface

The cryptographic guarantees in §3 and §5 protect **confidentiality and authenticity**: nobody can read what they shouldn't, nobody can forge another user's signature, nobody can tamper with the history undetected. They do **not** protect **availability**. A malicious client with valid credentials of their own can exhaust resources and weaponise the sync server against victims in ways that the protocol alone has no answer for. This is the most under-discussed attack surface in local-first E2EE systems and the one most likely to bite a real messenger deployment.

### What's structurally prevented

Mallory holds her own signing key and nothing else. She cannot:

- Forge transactions authored by Bob (she lacks his Ed25519 private key).
- Promote herself in a group she's not already admin/manager of (validators reject role-grant transactions whose author lacked the required role at the transaction's logical timestamp).
- Decrypt content of groups she's not a member of (no wrapped readKey for her).
- Tamper with existing history without detection (the BLAKE3 hash chain plus per-session Ed25519 signatures are end-to-end verified by every peer).
- Impersonate Bob or any other account.

These are the cryptographic guarantees and they hold absolutely.

### What's not prevented

- **Unlimited CoValue creation in groups she owns.** Mallory can spin up a million Groups where she's the sole member and fill each with gigabytes of garbage transactions, all properly signed. The server has no way to distinguish "legitimate work" from "abuse" because the content is opaque ciphertext. This is pure storage-and-bandwidth exhaustion of the sync server.
    
- **Claiming other users are members of her groups.** This is the subtle one. Mallory creates a Group, makes herself admin, then publishes a perfectly valid signed transaction: `add Bob (accountID 0x...) as reader; key_<keyID>_for_<bobAccountID> = seal(readKey, bob_pubkey)`. The transaction is cryptographically valid — Mallory is admin of her own group, so she has authority to add members under CoJSON's rules. The sync server stores it. Bob never consented, never received any protocol-level notification, doesn't know it exists. **From the server's perspective, Bob is now in Mallory's group.** There is no consent transaction required by the CoJSON protocol — the membership claim is unilateral. Mallory only needs Bob's public account ID, which is by design discoverable.
    
- **Weaponising the sync server against victims.** This follows directly from the previous point and depends on the _application-level_ discovery model. If the messenger app implements "auto-subscribe to any group I'm a member of" (the naive UX, since otherwise how does Bob discover new conversations?), then Mallory has just turned the sync server into a push channel into Bob's device. She creates a group, fills it with 10 GB of junk transactions, and Bob's client pulls the entire payload on next sync. Repeat across a botnet of accounts and you have a targeted DoS that costs Mallory essentially nothing — every CoValue is just a handful of signed bytes from her side — and costs Bob his data plan, storage, and battery.
    
- **Inbox spam.** Many Jazz apps implement an "inbox" pattern — a CoFeed or CoMap on each Account that's writable by anyone or by `writeOnly`-role accounts in a public group. If that's how your messenger handles "stranger sends first message," it's exactly as spam-vulnerable as email, except without the ~30 years of anti-spam infrastructure email has built up.
    
- **Metadata pollution / reputation attacks.** Membership in Mallory's "extremely offensive group name" — or the bare fact of a public membership edge between Bob and Mallory — is visible to anyone with sync server access (§9). Even if Bob's client never pulls the data, the metadata claim that Bob is associated with that group exists in the public membership graph the server can see, and may exist on backup tiers indefinitely.
    

### Why this is structural, not a Jazz bug

This attack class is intrinsic to any system that combines (a) public-key identities that anyone can derive cheaply and (b) a server that can't read content to make moderation decisions. The server cannot distinguish "Alice legitimately adding Bob to a real conversation" from "Mallory falsely claiming Bob is in her spam group" without breaking the E2EE property. Comparable systems:

- **Signal** had exactly this problem for years — anyone could add anyone to a group without consent. Signal added join-request flows for Groups v2 only after sustained abuse; the underlying KVAC anonymous credentials are specifically designed so the server can do this gating without learning group membership.
- **Matrix** has the same property; federation makes it worse because malicious homeservers can amplify it.
- **Email** has it; the entire spam-filtering industry exists because the SMTP protocol cannot prevent it.
- **Briar** is the only system in the comparison set that fully prevents this attack class, by requiring mutual in-person introduction before any communication is possible. It eliminates the spam vector by eliminating the discoverability vector — at the cost of being effectively unusable for non-paranoid users.

### Mitigations, in order of leverage

1. **Server-side quotas and rate limits.** Every account gets N MB of storage and M transactions per hour; exceed it and writes are throttled or rejected. Caps the damage of a single compromised or abusive account. Doesn't stop a botnet but makes individual attackers economically uninteresting. **Jazz Cloud and `jazz-run sync` do not ship these out of the box** — implementing them is the deployer's responsibility.
    
2. **Don't auto-replicate groups based on membership claims.** This is the single most important client-side discipline. Bob's client should only sync a group after Bob has _explicitly acknowledged_ it — either because Bob initiated the conversation, because someone in his contact list invited him (whitelist check before pull), or because Bob tapped "accept invitation" in a deliberately separate UI surface. Until then, the group exists on the server, claims Bob as a member, and is completely invisible to Bob's device. The sync server carries the cost; Bob does not.
    
3. **Consent / handshake transactions.** Treat a Group as "real" only once the new member's client has signed an acknowledgment transaction into it. Until then, the group is in a pending state and Bob's client filters it out. This is effectively adding a TCP-handshake-style ACK to the CoJSON membership model. Implementable as application convention with the standard primitives — no protocol changes required.
    
4. **Contact list as whitelist.** Adopt Briar's posture: Bob's client only surfaces invitations from accounts in his contact list. Strangers can publish "I want to talk to Bob" transactions all day, but they sit in a separate "requests from strangers" bucket Bob can review or ignore in bulk. This is the messenger analog of email's "sender unknown" folder, except enforced _before_ the data is pulled to the device.
    
5. **Cost imposition on account / group creation.** Make account creation cost something (paid messenger, invite-only signup, proof-of-work, existing-contact vouch). Each has UX costs. Briar's "you can only contact someone if a mutual contact introduces you" is the strongest version and the most disruptive.
    
6. **Server-side anomaly heuristics.** Even though the server can't read content, it can see structural patterns: Account X just created 10,000 groups in an hour with no other activity; flag for rate limiting or review. Fuzzy heuristic territory, but well-trodden in anti-abuse.
    
7. **Storage-tier pressure.** A self-hosted server can drop CoValues whose admin hasn't connected in N days, apply per-group storage quotas, or charge for storage beyond a free tier. Jazz Cloud likely won't do this for you; a homegrown sync server can.
    

### Honest framing for your messenger

The attacks described here **don't compromise security, only resources**. Mallory can fill the server with junk and burn Bob's data plan, but she can't read Alice and Bob's messages, can't impersonate them, can't tamper with their history. This is a DoS-class threat, not a confidentiality-class threat. **DoS threats are mitigated by economics, rate limits, and application-layer discipline; confidentiality threats are mitigated by cryptography.** Jazz gives you the cryptography for free; the availability hardening is your engineering, and it's where most local-first messengers will live or die in practice.

Don't ship without (a) quotas on your self-hosted sync server, (b) a strict whitelist-based contact model so strangers can't push data to Bob's device, and (c) explicit accept/reject UX for first-contact attempts. The combination of **Tor transport + Briar-style mutual introduction + contact-list-as-whitelist + server-side quotas** is what gives you Briar-class spam resistance on top of Jazz's cryptographic primitives. None of it is in the box; all of it is application-layer work.

---

## 11. Framework comparison

|Framework|E2EE|Permission model|Deletion|Auth|Sync|License|Status 2025–2026|
|---|---|---|---|---|---|---|---|
|**Jazz / CoJSON**|Yes — XSalsa20-Poly1305 + X25519 sealed boxes + Ed25519 + BLAKE3, group readKey envelope|Cryptographic; 5 roles + 5 invite variants + revoked; group inheritance with overrides|Tombstone + async server GC; admin required; can't delete accounts|Passkey, Passphrase, Clerk, Better Auth, Anonymous|WebSocket; partial via permission-bearing CoValues|MIT|Very active; 0.20.11 + 2.0 alpha (relational rewrite)|
|**Evolu**|Yes by default — BIP-39 mnemonic-derived keys; SLIP-21 hardware support; cipher not loudly documented|Per-owner (no fine-grained ACL)|Soft delete via auto columns; `resetAppOwner` for full wipe|Mnemonic only; pluggable|Client–server relay (run your own); **Evolu Protocol with Range-Based Set Reconciliation + SQL skiplists**|MIT|Very active; major Protocol rewrite landed 2025; one maintainer|
|**SecSync**|Yes — XChaCha20-Poly1305-IETF + Ed25519; libsodium|Optional via `hasAccess` callbacks on server|Key rotation + new snapshot; relay GCs prior ciphertext|Per-document shared secret; key mgmt explicitly out of scope|WebSocket relay; layers over Yjs/Automerge|MIT|Beta; sporadic activity; used by Serenity Notes; NLnet funded|
|**p2panda**|Yes (new `p2panda-encryption` crate) — Double Ratchet + DCGKA-derived group encryption with PCS + optional FS; BLAKE3, Ed25519, QUIC/TLS via iroh|New `p2panda-auth` crate for decentralized per-member permissions|Append-only logs with prefix-deletion + ephemeral payloads|App-defined; Ed25519 signed operations|Pure p2p via iroh; gossip + bootstrap nodes|MIT/Apache-2.0 dual|Very active; pre-1.0; audit pending; multi-NLnet-funded|
|**RxDB**|At-rest field encryption only (crypto-js or Web Crypto Premium); **not protocol E2EE**|None at framework level|Soft delete `_deleted: true` for sync convergence|None built-in; transport handles it|HTTP/WS; many adapters (CouchDB, GraphQL, Supabase, Firestore, WebRTC, Drive/OneDrive)|Apache-2.0 core; SSPL server; commercial premium|Very active; v17 March 2026|
|**LiveStore**|No|None built-in; `validatePayload` on sync session|Soft delete via events; **eventlog compaction = open issue #136**|JWT-validated sync session|Git-style push/pull eventlog; central backend enforces total order|Apache-2.0|Beta pre-1.0; very active|
|**ElectricSQL**|No|Proxy or gatekeeper via your API; no built-in rules|Standard Postgres deletes|None built-in|Postgres logical replication → HTTP Shape logs (CDN-friendly)|Apache-2.0|BETA→1.x, production at Trigger.dev, Supabase, others|
|**Zero (Rocicorp)**|No|JWT + Synced Queries (server code) or legacy `definePermissions` RLS-style (deprecated)|SQL via mutators, server-authoritative|JWT-based|Query-driven (ZQL) with IVM on SQLite replica of Postgres|Apache-2.0|1.x API-stable; production at Productlane, Plot, others|
|**Triplit**|No|Roles + JWT + per-collection filter expressions per op; **auto-evicts on permission change**|Property-level CRDT delete|JWT-based; Clerk/Supabase guides|WebSocket subscriptions to live queries; CRDT with property-level conflict resolution|**AGPL-3.0**|1.0 since March 2025; stable|
|**Replicache**|No|BYO at push/pull endpoints|KV delete via mutator|BYO|Mutator push/pull (KV) with 4 strategies|BSL/source-available (free)|**Maintenance mode — migrate to Zero**|
|**TanStack DB**|No|Adapter-dependent|Adapter-dependent|Adapter-dependent|Reactive client store atop adapters (Electric, PowerSync, etc.) with differential dataflow|MIT|Beta; v0.6 March 2026 (added SQLite persistence + nested includes)|

The honest summary: **Jazz/CoJSON is the only mature framework that ships true E2EE permissions with the user-facing primitives a messenger needs**. SecSync is sound but a layer, not a system. p2panda is the most ambitious and most experimental. Everything else (Electric, Zero, Triplit, LiveStore, Replicache, TanStack DB) is server-trusted.

---

## 11. Mapping a messenger onto local-first primitives

The cleanest Jazz schema for a messenger places **one Group per conversation**, with the Group's members being exactly the conversation participants. Groups can be nested — e.g., a "Workspace" Group as a parent of many "Channel" Groups, with role overrides controlling whether workspace admins are also channel admins.

```ts
// Conversation (1:1 or group chat)
class Conversation extends CoMap {
  title = co.string;
  participants = co.ref(GroupOfAccounts); // the permission scope
  messages = co.ref(CoList.of(co.ref(Message)));
  readState = co.ref(CoMap.of(co.ref(ReadCursor)));
  typing = co.ref(CoFeed.of(co.ref(TypingSignal))); // ephemeral
}

// Message: owned by the same group as the conversation
class Message extends CoMap {
  author = co.ref(Account);
  sentAt = co.Date;
  body = co.string; // or co.ref(EncryptedRichText)
  attachments = co.ref(CoList.of(co.ref(FileBlob)));
  replyTo = co.optional.ref(Message);
}

// FileBlob: large attachments as separate CoValues so they're lazy-loaded
class FileBlob extends CoMap {
  mimeType = co.string;
  size = co.number;
  data = co.ref(BinaryCoStream);
}
```

**Features that map cleanly:**

- **1:1 chat** = Group with two members (both admin or one admin + one writer).
- **Group chat** = Group with the conversation's members; admin promotes/demotes; the manager role gives moderators authority over membership without authority to remove admins.
- **Channels** = nested Group structure (workspace parent → channel child with `"extend"` or capped role mapping).
- **Read receipts** = per-member `ReadCursor` CoMap entries; last-write-wins.
- **Typing indicators** = CoFeed (a CRDT stream with bounded retention) — but be careful, every signal is a signed transaction; you'll want to throttle aggressively to avoid the >100-byte-per-tx floor multiplying.
- **File attachments** = separate CoValues so they're lazily resolved; the server holds encrypted bytes, the client decrypts on demand.
- **Multi-device** = same account, multiple sessions; the cross-device pairing is whatever the auth provider gives you (Passkey across iCloud Keychain, or Passphrase recovery).
- **Offline composing** = native — the local replica accepts writes; sync resumes when connected.

**Features that need custom work:**

- **Ephemeral / disappearing messages**: implement client-side TTL on the message CoValue + automatic tombstone after expiry. Pre-tombstone copies on offline peers persist until they reconnect. For high-assurance ephemeral, rotate the conversation's readKey on a schedule so old messages become undecryptable to anyone whose wrapped copy hasn't been refreshed.
- **Read-receipts privacy**: by default the read state is in the Group's CoMap and visible to all members. If you want one-way receipts (sender sees, recipient hides), you need to put `ReadCursor` under a sub-Group that excludes the sender.
- **Spam / abuse**: without a server-side gate, blocking is per-recipient (filter at decryption time). You'd want a layer of "introductions only via existing contact" similar to Briar.
- **Sealed-sender-style author hiding**: Jazz transactions are signed by author publicly; the server sees who authored what. This needs custom crypto on top.
- **Group consistency**: Jazz Groups are CRDTs — concurrent admin actions (e.g., two admins simultaneously promoting/demoting the same member) resolve last-write-wins. For high-stakes operations you may want explicit locking via a CoFeed of "pending operations" approved by a quorum.

**The hard parts re-emphasized:**

1. The **forward-secrecy tension**: Jazz gives you group-level PCS but not per-message FS. Sensitive 1:1 conversations should consider layering an Olm-class ratchet over CoValue payloads.
2. **Metadata privacy** is unsolved by Jazz alone. The sync server's view of "who's a member of conversation G at time T" is permanent. Tor transport is the minimum credible mitigation.
3. **Spam / abuse without server gates** requires invite-only or social-graph-based contact establishment. Briar's mutual-introduction model is the design to copy.
4. **Group consistency** under concurrent admin operations needs careful UX: Jazz's CRDT semantics will not raise conflicts, but the resolved state may surprise users if not surfaced clearly.

---

## 12. A pragmatic stack for a Briar-inspired messenger

**Off-the-shelf choices:**

- **CoJSON + jazz-tools** for the data and permissions layer. The role model, group inheritance, key rotation, and envelope encryption are all the right primitives. Schema in TypeScript via `co.*` builders.
- **Better Auth + Passphrase** for authentication. Better Auth provides an email anchor and SSO bridges; Passphrase ensures the user can always recover without depending on a third party. Avoid Passkey-as-primary on Android/Linux until the cross-platform story is unified (the docs explicitly warn about this).
- **Self-hosted Jazz sync server** (`npx jazz-tools@alpha server`, SQLite or RocksDB storage). Run it on a VPS in a jurisdiction you trust. Enable physical deletion (it's off by default on self-hosted servers).
- **React Native with Expo** for the Android target. Jazz's RNCrypto (since 0.20) ships as a native Rust module; the toolchain is mature.

**Custom-build choices:**

1. **Tor transport for sync**. Wrap `cojson-transport-ws` to dial through a local Tor SOCKS5 proxy. On Android, embed the Tor daemon (via Orbot or a bundled Tor process). The sync server runs as an onion service. This is the single highest-leverage privacy addition.
2. **Out-of-band contact pairing**. Two flows: in-person QR (each device displays an `accountID` + ephemeral nonce; the other scans and signs a mutual-acknowledgment transaction into both Accounts' contact lists) and "Briar link" (a shareable URL containing accountID + invite secret to a one-shot pairing Group). No global directory.
3. **Per-message ratchet for 1:1 chats**. Layer an Olm-style Double Ratchet over message CoValue payloads; rotate per message. Group chats stay on the standard CoJSON envelope (TreeKEM-class would be ideal but writing your own MLS implementation is out of scope).
4. **TOFU pinning with "safety number changed" UX**. Pin each contact's Ed25519 public key on first interaction. Block sends to a contact whose pinned key has changed until the user re-verifies via QR.
5. **Ephemeral message TTLs** with key rotation on the readKey schedule. Default the messenger to "messages disappear after 30 days unless starred."
6. **Bluetooth/Wi-Fi Direct transport** — defer to phase 2. Implement only if you genuinely need the offline-mesh use case Briar has. The engineering cost is large; the audience is small.

**Threat model considerations and what to add for each tier:**

|Threat|Mitigation|
|---|---|
|Server reads message content|E2EE — already provided by Jazz|
|Server reads social graph|Tor transport; sealed-sender CoValue wrapping (custom)|
|Network observer correlates traffic|Tor + cover traffic / padding (custom)|
|Member device compromise reveals message history|Per-message ratchet for 1:1 (custom Olm layer); aggressive ephemeral TTLs|
|Removed member retains old messages|Inherent — disclose to users; minimize history retained by recently-admitted members via fresh-Group-per-segment pattern|
|Account loss|Passphrase (always available); Better Auth as optional recovery anchor|
|Spam / abuse|Invite-only contact establishment; per-recipient client-side blocking|
|Lawful intercept of sync server|Self-host in jurisdiction of choice; Tor transport; minimize log retention; encourage on-device-only backup|

**Pragmatic scope cuts** for an MVP:

- Skip Bluetooth/Wi-Fi-Direct transport in v1. Tor + WebSocket gets you ~80% of Briar's threat model with ~20% of the work.
- Skip cover traffic / padding in v1. Document the timing-correlation gap honestly.
- Skip per-message ratchet for group chats. Keep it for 1:1 only.
- Skip a custom MLS-class group key agreement. Jazz's group-level PCS plus aggressive ephemeral TTLs is a defensible position.
- Self-host the sync server from day one. Do not depend on Jazz Cloud for your threat model.

---

## 13. Conclusion: honest assessment

Jazz/CoJSON is **the strongest local-first foundation available today for an E2EE messenger**, full stop. Its group-based permission model is the only one in the comparison set that enforces access cryptographically rather than via server gates. Its primitives (BLAKE3, Ed25519, XSalsa20-Poly1305, X25519 sealed boxes) are the right algorithms, implemented in a Rust core that compiles to web, Node, and React Native. Active development through 2025–2026 has shipped permanent deletion, group-key revelations, async deletion GC, and a 2.0 alpha with a relational query layer.

But Jazz is not a messenger framework, and there are three structural gaps no amount of careful schema design will close:

1. **Per-message forward secrecy doesn't exist** in CoJSON. A device compromise reveals every cached message. Sensitive conversations need a custom ratchet layer.
2. **Metadata is exposed to the sync server** the same way it's exposed to Signal's server without sealed sender — and Jazz has no sealed-sender equivalent. Tor transport is the only credible mitigation.
3. **Deletion is best-effort across replicas you don't control**. This is a property of all E2EE local-first systems, not a Jazz bug. Disclose it to users plainly.

For a Briar-inspired messenger, the realistic delivery path is: **Jazz for the data and permissions layer, Better Auth + Passphrase for identity, Tor for the transport, custom out-of-band pairing, and a per-message ratchet over message CoValues for 1:1 chats**. Skip the Bluetooth-mesh until you have users who genuinely need it. Self-host the sync server in a jurisdiction you trust, with physical deletion enabled.

The novel insight buried in all of this: **the Ink & Switch principles ask for both "privacy by default" and "ownership and control"**, but in a pure-CRDT world these conflict — you can't have full content ownership _and_ the right to retroactively un-share. The honest answer is to acknowledge the asymmetry, use forward key rotation aggressively, use Tor to hide the social graph, and design the UX around an explicit model of "messages are committed to the people who saw them." That's the same posture Briar takes. Jazz makes it achievable for a single Dutch freelancer in Amsterdam, building on Linux and Android, without writing a CRDT or a sealed-box implementation from scratch — which is, frankly, the point of local-first.

---

### Reference index

**Jazz / CoJSON**: https://github.com/garden-co/jazz · `packages/cojson/src/permissions.ts` · https://jazz.tools/docs/react/reference/encryption · https://jazz.tools/docs/react/core-concepts/deleting · https://jazz.tools/docs/react/reference/faq · https://github.com/garden-co/jazz/blob/main/CHANGELOG.md · https://jazz.tools/llms-full.txt

**Ink & Switch**: https://www.inkandswitch.com/essay/local-first/ · Riffle paper https://groups.csail.mit.edu/sdg/pubs/2023/riffle-uist-23.pdf · Local-First Conf https://www.youtube.com/@localfirstconf

**Automerge / Yjs / Loro**: https://automerge.org/blog/automerge-3/ · https://automerge.org/automerge-binary-format-spec/ · https://github.com/yjs/yjs/blob/main/INTERNALS.md · https://loro.dev/docs/performance

**Other E2EE frameworks**: https://www.evolu.dev · https://www.evolu.dev/blog/scaling-local-first-software · https://github.com/serenity-kit/secsync · https://www.secsync.com/docs/specification · https://p2panda.org · https://p2panda.org/2025/02/24/group-encryption.html · https://rxdb.info/encryption.html

**Non-E2EE frameworks**: https://livestore.dev · https://github.com/livestorejs/livestore/issues/136 · https://electric-sql.com/docs/guides/shapes · https://zero.rocicorp.dev/docs/queries · https://triplit.dev · https://doc.replicache.dev/strategies/overview · https://tanstack.com/db · https://github.com/wzhudev/reverse-linear-sync-engine

**Messenger threat models**: https://signal.org/docs/specifications/doubleratchet/ · https://signal.org/blog/sealed-sender/ · https://signal.org/blog/private-contact-discovery/ · https://signal.org/blog/secure-value-recovery/ · https://signal.org/blog/spqr/ · https://eprint.iacr.org/2019/1416.pdf · https://engineering.fb.com/2021/07/14/security/whatsapp-multi-device/ · https://engineering.fb.com/2021/09/10/security/whatsapp-e2ee-backups/ · https://briarproject.org/how-it-works/ · https://code.briarproject.org/briar/briar-spec · https://gitlab.matrix.org/matrix-org/olm/blob/master/docs/megolm.md · https://security.apple.com/blog/imessage-pq3/ · https://datatracker.ietf.org/doc/html/rfc9420 · https://daveprotocol.com/

**Key verification**: https://signal.org/blog/verified-safety-number-updates/ · https://en.wikipedia.org/wiki/Trust_on_first_use