import { argon2id } from "@noble/hashes/argon2";

export type KdfParams = {
  algorithm: "argon2id";
  memoryKiB: 65536;
  iterations: 3;
  parallelism: 1;
  outputBytes: 32;
};

/**
 * Argon2id parameters used everywhere in this app.
 *
 * Memory: 64 MiB. Iterations: 3. Parallelism: 1. Output: 32 bytes.
 *
 * These are hard-coded and not stored per-user. If we ever need to change
 * them, every user re-derives their seed on next sign-in (one extra round
 * of the new KDF) — acceptable cost given how rare KDF migrations are.
 */
export const DEFAULT_KDF_PARAMS: KdfParams = {
  algorithm: "argon2id",
  memoryKiB: 65536,
  iterations: 3,
  parallelism: 1,
  outputBytes: 32,
};

const IV_BYTES = 12;       // AES-GCM standard
const TAG_BITS = 128;      // AES-GCM standard

/**
 * deriveKey: Argon2id password → 32-byte symmetric key.
 *
 * Output is the same for the same password + salt + params; differs for any
 * change. This is the ONLY place Argon2id is called in the codebase.
 *
 * @noble/hashes argon2id is synchronous (pure JS); we still expose an
 * async signature so all callers stay future-compatible if we ever swap to
 * a WASM-backed implementation.
 */
export async function deriveKey(
  password: string,
  saltBytes: Uint8Array,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<Uint8Array> {
  return argon2id(new TextEncoder().encode(password), saltBytes, {
    m: params.memoryKiB,
    t: params.iterations,
    p: params.parallelism,
    dkLen: params.outputBytes,
  });
}

/**
 * encryptSeed: AES-GCM-encrypt the 32-byte Jazz seed under a key from deriveKey.
 *
 * Envelope layout (returned as base64): [12-byte IV || ciphertext || 16-byte auth tag]
 * A fresh IV is generated on every call.
 */
export async function encryptSeed(
  seed: Uint8Array,
  key: Uint8Array,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: TAG_BITS }, cryptoKey, seed),
  );
  const envelope = new Uint8Array(iv.length + ciphertext.length);
  envelope.set(iv, 0);
  envelope.set(ciphertext, iv.length);
  return btoa(String.fromCharCode(...envelope));
}

/**
 * decryptSeed: reverse of encryptSeed. Throws on wrong key or tampered envelope
 * (AES-GCM authentication-tag mismatch).
 */
export async function decryptSeed(
  envelope: string,
  key: Uint8Array,
): Promise<Uint8Array> {
  const bytes = Uint8Array.from(atob(envelope), c => c.charCodeAt(0));
  if (bytes.length < IV_BYTES + (TAG_BITS / 8)) {
    throw new Error("envelope too short");
  }
  const iv = bytes.slice(0, IV_BYTES);
  const ciphertext = bytes.slice(IV_BYTES);
  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: TAG_BITS },
    cryptoKey,
    ciphertext,
  );
  return new Uint8Array(plaintext);
}
