# Threat Model — Jazz Messanger

**Date:** 2026-05-15
**Status:** Living document
**Companion:** `docs/superpowers/specs/2026-05-15-jazz-messanger-design.md`

This document is the authoritative statement of what the messenger protects, what it deliberately exposes, and what it does not protect at all. It is intended to be referenced from privacy policy, README, security disclosures, and design discussions.

---

## 1. Purpose and audience

This document answers three questions for any party considering the messenger:

- What is cryptographically guaranteed?
- What metadata exists, and who can see it?
- What is explicitly out of scope, and what should users not assume?

Audience: future maintainers, security reviewers, users who want to make an informed choice, and anyone drafting privacy disclosures.

The threat model intentionally rejects "marketing-grade" claims like "fully private" or "zero-knowledge." It states what is and isn't true so that decisions made on top of it are honest.

---

## 2. The product context this threat model assumes

- Local-first messenger built on Jazz / CoJSON.
- One sync server operated by the project (self-hosted; not Jazz Cloud).
- Audience is small trust circles (≤50-person groups), not large public channels.
- Contact establishment is link-based and out-of-band; strangers cannot reach a user without an explicit invitation handshake.
- Multi-device sync per account is supported.
- No Tor, no sealed-sender, no anonymous-credential layer in v1.
- No per-message forward secrecy in v1.

If any of these change, this document must be revised.

---

## 3. What is cryptographically protected

These are iron-clad properties, derived from Jazz/CoJSON's primitives (XSalsa20-Poly1305 for content, X25519 sealed boxes for key wrapping, Ed25519 for signatures, BLAKE3 for hashing). They hold against the sync server operator, against a fully compromised sync server, and against any network observer.

| Property | Mechanism |
|---|---|
| Message content confidentiality | Sealed under XSalsa20-Poly1305 with conversation-Group readKey; only Group members possess wrapped copies of the readKey |
| File content confidentiality | Same mechanism, applied to BinaryCoStream chunks |
| Profile confidentiality (for accounts you do not share a Group with) | Profile CoValue owned by a Group whose only members are the Account's sessions |
| Account secret keys | Generated on device; never leave it in any flow, including QR pairing (which seals to an ephemeral key the server does not possess) |
| Authorship integrity (cannot be forged or edited by other participants) | Per-author WriteGroups: each Message is owned by a Group whose only writer is the author; validators on every replica reject unauthorized writes |
| Transaction integrity | Every transaction signed with Ed25519; per-session BLAKE3 hash chain; a malicious sync server cannot inject, modify, or undetectably reorder transactions |

These properties depend only on Jazz's cryptographic primitives. They do not depend on operator honesty, server integrity, or network trustworthiness.

---

## 4. What is structurally exposed

The following metadata exists on the sync server. It is the price paid for centralized sync without Tor or sealed-sender. Vision X accepts this exposure as a deliberate trade-off.

### 4.1 Visible to the sync server operator

- The membership graph of every Group: which `accountID`s appear with which roles, when grants happened, who granted them.
- The reference graph between all CoValues: which CoValue points to which.
- Per-transaction metadata: session ID (which device), `madeAt` timestamp, payload size in bytes, signing key.
- IP addresses and connection patterns: when each user is online, which network they connect from.
- The social graph by inference: who participates in which conversations, message frequency, group sizes, conversation lifetimes.
- CoValue type identification (CoMap vs CoList vs CoFeed) via the BLAKE3-hashed header.
- Backup ciphertext for the configured retention window.

### 4.2 Visible to a network observer between client and server

- The fact of a TLS connection from a given IP to the sync server.
- Frame timing and approximate sizes.
- TLS metadata (SNI, certificate chain).

WebSocket payload contents are protected by TLS.

### 4.3 Visible to a random user connecting to the same sync server

This is the critical clarification: **the social graph is NOT trivially extractable by any user**.

Why:
- The CoJSON sync protocol is request-by-ID. There is no "list all CoValues" endpoint and no enumeration API.
- CoValue IDs are 32-byte BLAKE3 hashes; brute-forcing an ID is infeasible.
- Even if a user obtains a CoValue ID by some out-of-band means, they receive only ciphertext unless they are a member of the owning Group.

What a random user can see:
- Public CoValues — those owned by Groups with `EVERYONE = reader`. Used deliberately for the public part of an Account's `Profile` (display name + avatar) so contacts can render correctly. Anyone who knows your `accountID` can fetch your display name; this is by design.
- The shape of their own neighborhood: a user can walk references from CoValues they are a member of, see linked CoValues, and pull them — but only decrypt the ones whose owning Group also has them as a member.

What a random user cannot see:
- Aggregate membership graph of Groups they are not in.
- Conversations they are not party to.
- Other users' contact books, devices, or invites.
- Any metadata about activity outside their own neighborhood.

**Practical consequence:** the social graph is a server-side asset. It is visible to the operator (you) and would be exposed by a server compromise or compelled disclosure. It is not visible to a curious user signing up to the messenger.

---

## 5. What is not protected at all

These are out of scope and must be communicated honestly to users.

- **Content disclosure by participants.** Screenshots, copy-paste, reading the screen over your shoulder, third-party scraping by a participant. Cannot be prevented by any cryptographic system; the same is true of every messenger.
- **Out-of-band identification.** If you know "Anna" socially and you see "Anna" in your contacts, you have linked her real identity to her `accountID`. The system cannot prevent this.
- **Past message content if a device is compromised.** No per-message forward secrecy in v1. The full local cache is readable to whoever holds a decrypted device. This is the most significant gap and is documented as a v2 hardening target (per-message ratchet for 1:1 chats).
- **Endpoint compromise.** A compromised browser, malicious browser extension, or OS-level malware can do anything the user can do. No defense from the messenger side.
- **Lawful intercept of the sync server.** A subpoena to the operator produces the metadata in §4.1 plus all ciphertext. It cannot include message content (the operator does not hold any readKey) but the metadata may be sufficient for many purposes.
- **Lawful intercept of a participant.** A subpoena to a conversation participant compels them to disclose what is on their device. No different from any other messenger.
- **Operator going rogue and forwarding selectively.** The operator cannot inject or modify transactions (signature integrity), but could selectively withhold or delay them. Detectable in principle (gaps in expected message flow), but not prevented.

---

## 6. Adversary breakdown

| Adversary | Sees content? | Sees metadata? | Can forge? | Mitigations in v1 |
|---|---|---|---|---|
| Sync server operator (the project) | No | Yes (§4.1) | No | TLS, minimized logs, jurisdiction choice |
| Sync server compromise (root access) | No | Yes (§4.1) + backup ciphertext | No | Backups encrypted with a separate key |
| Network observer between client and server | No (TLS) | Timing/size + endpoints | No | TLS 1.3 |
| Network observer at server only | No | Per §4.1 | No | Same as compromise |
| Legitimate participant in a conversation | Yes (their conversations only) | Same | No (per-author WriteGroups) | TOFU pinning, structural authorship |
| Stranger (no Group membership with target) | No | No (cannot enumerate; §4.3) | No | Hard-block + client-side whitelist |
| Stranger fabricating membership claim ("§10 attack") | No | Yes, on the server side | Can claim Bob is in their group; Bob's client refuses to sync | Client-side whitelist enforcement before pull |
| Device thief / OS malware on user's device | Full local cache | Full | Yes (until revoked) | Device revocation; passphrase ceremony; no per-message FS in v1 |
| Lawful intercept on operator | No | Per §4.1 | No | Honest documentation; minimal log retention |
| Lawful intercept on participant | Whatever is on their device | Full | Yes if they are forced to act | Out of scope |

---

## 7. Comparison with other messengers

| | Briar | Signal | WhatsApp | iMessage (ADP) | This messenger (Vision X) |
|---|---|---|---|---|---|
| Content E2EE | Yes | Yes | Yes | Yes | Yes |
| Operator sees social graph | No (no operator) | Mostly no (sealed sender) | Yes | Yes (Apple ID match) | Yes (accepted) |
| Per-message forward secrecy | No | Yes | Yes | Yes | No (planned for E2) |
| Local-first / offline | Yes | No (online-required) | No | No | Yes |
| Multi-device with full history | No (per-device) | Linked devices, no history | Linked | Yes | Yes |
| Spam-resistant | Yes (intro-only) | Mostly (requests) | Poor | Mostly | Yes (hard-block) |
| Phone number required | No | Yes (or username) | Yes | Yes (Apple ID) | No |
| Audience | Activists | General | General | Apple ecosystem | Small trust circles |

Honest summary: **better than WhatsApp on operator-trust and identity; worse than Signal on per-message forward secrecy and metadata-hiding; better than both on local-first / offline behavior and multi-device-with-history. Worse than Briar on metadata-hiding; much better on UX.**

---

## 8. Future hardening (not in v1)

These are real gaps that future iterations should address. They are not v1 commitments; they are documented so users know the intended trajectory.

| Gap | Planned mitigation | Target |
|---|---|---|
| No per-message FS | Olm-style ratchet layer over Message CoValue payloads, 1:1 chats only | E2 |
| Account loss with no recovery | Better Auth email-anchor bridge (opt-in) | E1.1 |
| Account loss with no email | Shamir social recovery via contacts | E2 |
| No automatic readKey rotation on device revocation | Auto-rotate on revoke | E1.1 |
| Bearer-token invite link | Optional out-of-band confirmation step before activation | E1.1 |
| Server-side abuse | Per-account quotas, rate limits, anomaly heuristics | E2 |
| No formal audit | Cure53 / Trail of Bits engagement | Before any public launch |

Not on the roadmap (would require a different threat model and product):
- Tor transport
- Sealed-sender CoValue wrapping
- Mixnet-style cover traffic
- Federation across multiple sync servers

---

## 9. How this document is to be used

- **Users:** decide whether the messenger fits your threat model. If you need protections in §5 or §8, this is not the right tool today.
- **Developers:** when adding a feature, check whether it changes any property in §3, §4, or §5. If it does, update this document and the design spec before shipping.
- **Operators:** §4.1 enumerates what your server holds. Treat it accordingly: backups encrypted, jurisdiction chosen deliberately, log retention minimized, access to the database tightly controlled.
- **Security reviewers:** start here. The design document tells you how things are built; this document tells you what they are intended to guarantee. Discrepancies are bugs.

---

## 10. Revision policy

This document is revised whenever:
- A property in §3, §4, or §5 changes.
- The product context in §2 changes.
- A new mitigation in §8 ships and graduates from "future hardening" to "v1 protection."
- A security audit produces findings that affect any of the above.

Each revision keeps prior versions in git history. The current version date is at the top of the file.
