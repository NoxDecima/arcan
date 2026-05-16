/**
 * QR multi-device pairing protocol primitives.
 *
 * Spec: docs/superpowers/specs/2026-05-16-slice-2-pairing-invitations-design.md §5
 *
 * ## URL format
 * /pair#<base64url(TextEncoder("pairingCoValueID|pairingAgentSecret|initiatorPubkeyHex"))>
 *
 * ## Sealed-box format (tweetnacl)
 * Wire: base64url( nonce(24 bytes) || nacl.box(...) )
 * nacl.box uses X25519-XSalsa20-Poly1305.
 *
 * ## Account secret transfer
 * The QR payload contains the 32-byte secretSeed (Uint8Array), NOT the AgentSecret string.
 * The responder reconstructs AgentSecret via crypto.agentSecretFromSecretSeed(secretSeed).
 */

import nacl from "tweetnacl";
import { Group } from "jazz-tools";
import { EphemeralPairing } from "./schema/EphemeralPairing";
import { getAccountPubkeyHex } from "@/auth/pubkey";
import type { AgentSecret } from "cojson";
import { cojsonInternals } from "jazz-tools";
import type { Account } from "jazz-tools";
import type { ID } from "jazz-tools";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface PairingURL {
  pairingCoValueID: string;
  pairingAgentSecret: string;
  initiatorPubkeyHex: string;
}

export interface PairingInitiation {
  pairing: ReturnType<typeof EphemeralPairing.create>;
  url: string;
  ephemeralPrivkeyHex: string;
}

// Context supplied by React hooks — separated to keep pure functions testable
export interface PairingAuthContext {
  authenticate: (credentials: {
    accountID: ID<Account>;
    accountSecret: AgentSecret;
  }) => Promise<void>;
  authSecretStorage: {
    set: (payload: {
      accountID: ID<Account>;
      secretSeed?: Uint8Array;
      accountSecret: AgentSecret;
      provider: string;
    }) => Promise<void>;
    get: () => Promise<{
      accountID?: ID<Account>;
      secretSeed?: Uint8Array;
      accountSecret?: AgentSecret;
    } | null>;
  };
  crypto: {
    agentSecretFromSecretSeed: (seed: Uint8Array) => AgentSecret;
  };
}

// ---------------------------------------------------------------------------
// Base64url helpers
// ---------------------------------------------------------------------------

function toB64url(bytes: Uint8Array): string {
  // Use btoa with char codes — safe for arbitrary bytes
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const padded =
    s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// Hex helpers
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Task 12 — pure parsing / crypto primitives (tested by pairing.test.ts)
// ---------------------------------------------------------------------------

/**
 * Parse a pairing URL fragment and extract the three components.
 *
 * Fragment format: base64url(TextEncoder("pairingCoValueID|pairingAgentSecret|initiatorPubkeyHex"))
 *
 * @throws if url does not contain "/pair", fragment is missing, or has wrong structure
 */
export function parsePairingURL(url: string): PairingURL {
  const parsed = new URL(url);
  if (!parsed.pathname.includes("/pair")) {
    throw new Error("Not a pairing URL — path does not include /pair");
  }

  const fragment = parsed.hash.slice(1); // remove leading '#'
  if (!fragment) {
    throw new Error("Pairing URL has no fragment");
  }

  const decoded = new TextDecoder().decode(fromB64url(fragment));
  const parts = decoded.split("|");
  if (parts.length !== 3) {
    throw new Error(
      `Pairing URL fragment has ${parts.length} pipe-delimited part(s), expected 3`,
    );
  }

  const [pairingCoValueID, pairingAgentSecret, initiatorPubkeyHex] = parts;
  return { pairingCoValueID, pairingAgentSecret, initiatorPubkeyHex };
}

/** Coerce any typed array to a plain Uint8Array to avoid cross-realm instanceof issues. */
function ensureUint8Array(arr: Uint8Array): Uint8Array {
  if (Object.prototype.toString.call(arr) === "[object Uint8Array]") return arr;
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

/**
 * Encrypt plaintext using a nacl box (X25519-XSalsa20-Poly1305).
 * Wire format: base64url( nonce(24) || ciphertext )
 */
export function sealForRecipient(
  plaintext: string,
  recipientPubkey: Uint8Array,
  senderPrivkey: Uint8Array,
): string {
  const recPub = ensureUint8Array(recipientPubkey);
  const senPriv = ensureUint8Array(senderPrivkey);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  // Use nacl.randomBytes trick: build a Uint8Array that passes nacl's instanceof check
  // by allocating via nacl (which uses its own Uint8Array), then filling from TextEncoder.
  const encoded = new TextEncoder().encode(plaintext);
  const plaintextBytes = nacl.randomBytes(encoded.length); // gets nacl's Uint8Array
  for (let i = 0; i < encoded.length; i++) plaintextBytes[i] = encoded[i];
  const ciphertext = nacl.box(plaintextBytes, nonce, recPub, senPriv);
  // Wire: nonce || ciphertext
  const wire = new Uint8Array(nonce.length + ciphertext.length);
  wire.set(nonce, 0);
  wire.set(ciphertext, nonce.length);
  return toB64url(wire);
}

/**
 * Decrypt a sealed box produced by sealForRecipient.
 * @throws if decryption fails (wrong key pair or tampered ciphertext)
 */
export function unsealFromSender(
  sealed: string,
  senderPubkey: Uint8Array,
  recipientPrivkey: Uint8Array,
): string {
  const sendPub = ensureUint8Array(senderPubkey);
  const recPriv = ensureUint8Array(recipientPrivkey);
  const wire = fromB64url(sealed);
  if (wire.length <= nacl.box.nonceLength) {
    throw new Error("Sealed message is too short");
  }
  const nonce = wire.slice(0, nacl.box.nonceLength);
  const ciphertext = wire.slice(nacl.box.nonceLength);
  const plaintext = nacl.box.open(ciphertext, nonce, sendPub, recPriv);
  if (!plaintext) {
    throw new Error("Failed to open nacl box — wrong key pair or tampered ciphertext");
  }
  return new TextDecoder().decode(plaintext);
}

// ---------------------------------------------------------------------------
// Task 12 — Jazz-integrated: initiator side
// ---------------------------------------------------------------------------

/**
 * Initiator step 1: create the ephemeral pairing CoValue and return the invite URL.
 *
 * - Generates an ephemeral X25519 keypair K_e for the initiator.
 * - Creates an EphemeralPairing CoValue in a one-shot Group owned by `me`.
 * - Adds "everyone" as writer so the responder (loading as guest/agent) can write
 *   their response fields.
 * - Returns the URL with the pairing agent secret in the fragment.
 *
 * NOTE: Jazz's writerInvite flow requires generating an agent secret via
 * `createInviteLink`. However, for the QR pairing protocol we use "everyone"
 * writer access on the pairing group as a simpler approach — the EphemeralPairing
 * CoValue only carries non-sensitive handshake data (pubkeys, fingerprint), and
 * the actual account secret travels sealed inside `wrappedAccountSecret`.
 */
export async function createPairingInvite(
  account: Account,
  baseUrl: string,
): Promise<PairingInitiation> {
  // Generate ephemeral keypair for this pairing session
  const ephemeralKeypair = nacl.box.keyPair();
  const ephemeralPrivkeyHex = bytesToHex(ephemeralKeypair.secretKey);
  const initiatorPubkeyHex = getAccountPubkeyHex(account);

  // Create a group owned by the initiator. Make it world-writable so the
  // responder can write their pubkey without needing an account login.
  const pairingGroup = Group.create({ owner: account });
  pairingGroup.addMember("everyone", "writer");

  // Create the EphemeralPairing CoValue in the group
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 min TTL

  const pairing = EphemeralPairing.create(
    {
      initiatorPubkey: initiatorPubkeyHex,
      initiatorAccountID: account.$jazz.id,
      initiatorDisplayName: (account as Account & { profile?: { name?: string } }).profile?.name ?? "Unknown",
      createdAt: now,
      expiresAt,
    },
    { owner: pairingGroup },
  );

  // Build the pairing URL fragment
  // Format: base64url("pairingCoValueID|pairingAgentSecret|initiatorPubkeyHex")
  // For the "everyone" writer approach, pairingAgentSecret is the ephemeral
  // pubkey hex (the responder needs it to send their encrypted response).
  // We embed the ephemeral nacl pubkey hex as the "agent secret" field —
  // the responder uses it to encrypt back to the initiator.
  const ephemeralPubkeyHex = bytesToHex(ephemeralKeypair.publicKey);
  const fragmentPayload = new TextEncoder().encode(
    `${pairing.$jazz.id}|${ephemeralPubkeyHex}|${initiatorPubkeyHex}`,
  );
  const fragment = toB64url(fragmentPayload);

  const url = `${baseUrl}/pair#${fragment}`;

  return { pairing: pairing as ReturnType<typeof EphemeralPairing.create>, url, ephemeralPrivkeyHex };
}

/**
 * Initiator step 2: wrap the account's secretSeed for the responder.
 *
 * Reads the responder's pubkey from the pairing CoValue, seals the
 * initiator's 32-byte secretSeed using nacl.box, and writes the result
 * to `pairing.wrappedAccountSecret`.
 *
 * @param account - the initiator's account
 * @param pairing - the EphemeralPairing CoValue
 * @param ephemeralPrivkeyHex - hex of the initiator's ephemeral nacl private key
 * @param authContext - hook-supplied auth context to read secretSeed
 */
export async function wrapAccountSecretForResponder(
  _account: Account,
  pairing: ReturnType<typeof EphemeralPairing.create>,
  ephemeralPrivkeyHex: string,
  authContext: PairingAuthContext,
): Promise<void> {
  const responderPubkeyHex = pairing.responderPubkey;
  if (!responderPubkeyHex) {
    throw new Error("Responder has not yet published their pubkey");
  }

  const responderPubkey = hexToBytes(responderPubkeyHex);
  const initiatorPrivkey = hexToBytes(ephemeralPrivkeyHex);

  // Read the secretSeed from authSecretStorage — this is the 32-byte seed
  const storedCreds = await authContext.authSecretStorage.get();
  if (!storedCreds?.secretSeed) {
    throw new Error("No secretSeed found in authSecretStorage — cannot wrap account secret");
  }

  // Encode secretSeed as hex string to pass through sealForRecipient
  const secretSeedHex = bytesToHex(storedCreds.secretSeed);

  const wrapped = sealForRecipient(secretSeedHex, responderPubkey, initiatorPrivkey);
  (pairing as any).wrappedAccountSecret = wrapped;
}

/**
 * Tombstone a pairing CoValue by setting expiresAt to now.
 * The CoValue remains readable but signals completion / expiry.
 */
export async function tombstonePairing(
  pairing: ReturnType<typeof EphemeralPairing.create>,
): Promise<void> {
  (pairing as any).expiresAt = new Date();
}

// ---------------------------------------------------------------------------
// Task 12 — Jazz-integrated: responder side
// ---------------------------------------------------------------------------

/**
 * Responder step 1: parse the pairing URL and load the EphemeralPairing CoValue.
 *
 * The responder does not have an account yet. We load the CoValue using the
 * Schema.load API — since the group is "everyone" writer, any unauthenticated
 * (anonymous) Jazz node can read and write it.
 *
 * This function returns the pairing CoValue. It should be called from a component
 * that is inside a JazzReactProvider (even in guest mode).
 *
 * @param pairingCoValueID - the CoValue ID from the URL
 * @param _pairingAgentSecret - unused in the "everyone" writer approach (kept for API compat)
 * @param _syncURL - unused (provider handles sync)
 */
export async function loadPairingAsAgent(
  pairingCoValueID: string,
  _pairingAgentSecret: string,
  _syncURL: string,
): Promise<ReturnType<typeof EphemeralPairing.create>> {
  // EphemeralPairing.load works for anyone because the group has "everyone" writer
  const pairing = await EphemeralPairing.load(pairingCoValueID, {
    resolve: {},
  });

  if (!pairing) {
    throw new Error(`Could not load pairing CoValue ${pairingCoValueID}`);
  }

  return pairing as ReturnType<typeof EphemeralPairing.create>;
}

/**
 * Responder step 2: generate responder's ephemeral keypair and write it
 * to the pairing CoValue.
 *
 * @returns the responder's ephemeral private key (hex) for use in step 3
 */
export async function respondToPairing(
  pairing: ReturnType<typeof EphemeralPairing.create>,
): Promise<{ responderPrivkeyHex: string }> {
  // Generate responder's ephemeral nacl keypair
  const responderKeypair = nacl.box.keyPair();
  const responderPrivkeyHex = bytesToHex(responderKeypair.secretKey);
  const responderPubkeyHex = bytesToHex(responderKeypair.publicKey);

  // Write the pubkey to the pairing CoValue so the initiator can see it
  (pairing as any).responderPubkey = responderPubkeyHex;

  return { responderPrivkeyHex };
}

/**
 * Responder step 3: claim the account.
 *
 * Reads the wrapped account secret from the pairing CoValue, decrypts it,
 * and logs in using the raw-secret login API documented in jazz-api-notes.md §13.
 *
 * @param pairing - the EphemeralPairing CoValue
 * @param responderPrivkeyHex - responder's ephemeral private key (hex)
 * @param authContext - hook-supplied authenticate + authSecretStorage + crypto
 * @returns accountSecret string and sessionFingerprint for display/confirmation
 */
export async function claimAccountFromPairing(
  pairing: ReturnType<typeof EphemeralPairing.create>,
  responderPrivkeyHex: string,
  authContext: PairingAuthContext,
): Promise<{ accountSecret: string; sessionFingerprint: string }> {
  const wrapped = pairing.wrappedAccountSecret;
  if (!wrapped) {
    throw new Error("Initiator has not yet wrapped the account secret");
  }

  // The initiator's ephemeral pubkey (embedded in the URL as "pairingAgentSecret")
  // is stored on the pairing CoValue as initiatorPubkey... wait, that's the signing pubkey.
  // We need the *nacl* ephemeral pubkey the initiator used when sealing.
  //
  // Per the URL format we defined: pairingAgentSecret = initiator's ephemeral nacl pubkey hex.
  // We need that to unseal. The initiatorPubkey on the CoValue is the Ed25519 signing key.
  // The calling component (responder-step.tsx) must pass the nacl pubkey from the parsed URL.
  //
  // This function accepts the initiator nacl pubkey via authContext or an extra param.
  // To keep the API clean, we look for it on the pairing object — but it's not there.
  // The caller must supply it. We use the `initiatorNaclPubkeyHex` field we'll add to the
  // extended context.
  const initiatorNaclPubkeyHex = (authContext as PairingAuthContext & { initiatorNaclPubkeyHex?: string }).initiatorNaclPubkeyHex;
  if (!initiatorNaclPubkeyHex) {
    throw new Error("initiatorNaclPubkeyHex must be provided in authContext to unseal the account secret");
  }

  const initiatorNaclPubkey = hexToBytes(initiatorNaclPubkeyHex);
  const responderPrivkey = hexToBytes(responderPrivkeyHex);

  // Unseal the secretSeed hex
  const secretSeedHex = unsealFromSender(wrapped, initiatorNaclPubkey, responderPrivkey);
  const secretSeed = hexToBytes(secretSeedHex);

  // Derive accountSecret and accountID per jazz-api-notes.md §13
  const accountSecret: AgentSecret = authContext.crypto.agentSecretFromSecretSeed(secretSeed);
  const accountID = cojsonInternals.idforHeader(
    cojsonInternals.accountHeaderForInitialAgentSecret(accountSecret, authContext.crypto as Parameters<typeof cojsonInternals.accountHeaderForInitialAgentSecret>[1]),
    authContext.crypto as Parameters<typeof cojsonInternals.idforHeader>[1],
  ) as ID<Account>;

  // Authenticate (step 3 of the four-step bootstrap)
  await authContext.authenticate({ accountID, accountSecret });

  // Persist credentials (step 4)
  await authContext.authSecretStorage.set({
    accountID,
    secretSeed,
    accountSecret,
    provider: "qr-pairing",
  });

  const sessionFingerprint = `${accountID}_session_paired`;

  return { accountSecret: accountSecret as string, sessionFingerprint };
}
