import { describe, test, expect } from "vitest";
import {
  DEFAULT_KDF_PARAMS,
  deriveKey,
  encryptSeed,
  decryptSeed,
} from "@/auth/kdf";

const utf8 = (s: string) => new TextEncoder().encode(s);

describe("kdf", () => {
  test("DEFAULT_KDF_PARAMS matches spec §2.2", () => {
    expect(DEFAULT_KDF_PARAMS).toEqual({
      algorithm: "argon2id",
      memoryKiB: 65536,
      iterations: 3,
      parallelism: 1,
      outputBytes: 32,
    });
  });

  test("deriveKey is deterministic for same password + salt", async () => {
    const salt = utf8("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const k1 = await deriveKey("password123!", salt);
    const k2 = await deriveKey("password123!", salt);
    expect(k1).toEqual(k2);
    expect(k1.length).toBe(32);
  });

  test("deriveKey produces different output for different password", async () => {
    const salt = utf8("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const k1 = await deriveKey("password1!", salt);
    const k2 = await deriveKey("password2!", salt);
    expect(k1).not.toEqual(k2);
  });

  test("deriveKey produces different output for different salt", async () => {
    const k1 = await deriveKey("password123!", utf8("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const k2 = await deriveKey("password123!", utf8("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
    expect(k1).not.toEqual(k2);
  });

  test("encryptSeed/decryptSeed round-trip", async () => {
    const seed = new Uint8Array(32).fill(0x42);
    const key = await deriveKey("password123!", utf8("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const envelope = await encryptSeed(seed, key);
    const decoded = await decryptSeed(envelope, key);
    expect(decoded).toEqual(seed);
  });

  test("encryptSeed output is not the same as the input", async () => {
    const seed = new Uint8Array(32).fill(0x42);
    const key = await deriveKey("password123!", utf8("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const envelope = await encryptSeed(seed, key);
    const decoded = atob(envelope);
    expect(decoded).not.toContain(String.fromCharCode(...seed));
  });

  test("encryptSeed uses fresh IV each call", async () => {
    const seed = new Uint8Array(32).fill(0x42);
    const key = await deriveKey("password123!", utf8("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const e1 = await encryptSeed(seed, key);
    const e2 = await encryptSeed(seed, key);
    expect(e1).not.toEqual(e2);
  });

  test("decryptSeed throws on wrong key", async () => {
    const seed = new Uint8Array(32).fill(0x42);
    const key1 = await deriveKey("password1!", utf8("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const key2 = await deriveKey("password2!", utf8("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const envelope = await encryptSeed(seed, key1);
    await expect(decryptSeed(envelope, key2)).rejects.toThrow();
  });

  test("decryptSeed throws on tampered ciphertext", async () => {
    const seed = new Uint8Array(32).fill(0x42);
    const key = await deriveKey("password123!", utf8("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const envelope = await encryptSeed(seed, key);
    // Flip one byte in the middle (after IV)
    const bytes = Uint8Array.from(atob(envelope), c => c.charCodeAt(0));
    bytes[bytes.length / 2 | 0] ^= 0x01;
    const tampered = btoa(String.fromCharCode(...bytes));
    await expect(decryptSeed(tampered, key)).rejects.toThrow();
  });
});
