import { describe, test, expect, vi, beforeEach } from "vitest";

// Argon2id pure-JS is ~2.5s per derive; changePassword does 2 derives serially.
const SLOW_TIMEOUT = 30_000;
import { signUp, signIn, recoverWithCode, changePassword } from "@/auth/flows";
import { deriveKey, encryptSeed } from "@/auth/kdf";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

describe("signUp", () => {
  test("derives seed via KDF, encrypts envelope, posts to /sign-up with x-jazz-zk header", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: "u1" }, jazzZk: { accountID: "co_zABC" } }),
    });

    const result = await signUp({
      email: "alice@example.com",
      username: "alice",
      password: "correcthorsebattery1",
      displayName: "Alice",
      createJazzAccount: async (seed: Uint8Array) => {
        expect(seed.length).toBe(32);
        return { accountID: "co_zABC" };
      },
    });

    expect(result.accountID).toBe("co_zABC");
    expect(result.recoveryCode.split(" ").length).toBe(24);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    const zk = JSON.parse(headers.get("x-jazz-zk") ?? "{}");
    expect(typeof zk.kdfSalt).toBe("string");
    expect(typeof zk.encryptedSeed).toBe("string");
    expect(typeof zk.recoveryProofHmac).toBe("string");
    expect(zk.accountID).toBe("co_zABC");
  });

  test("rolls back local Jazz account if POST fails", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });

    const rollback = vi.fn();
    await expect(
      signUp({
        email: "alice@example.com",
        username: "alice",
        password: "correcthorsebattery1",
        displayName: "Alice",
        createJazzAccount: async () => ({ accountID: "co_zABC", rollback }),
      }),
    ).rejects.toThrow();

    expect(rollback).toHaveBeenCalledOnce();
  });
});

describe("signIn", () => {
  test("decrypts envelope and hands seed to Jazz", { timeout: SLOW_TIMEOUT }, async () => {
    const seed = new Uint8Array(32).fill(0x42);
    const kdfSalt = new Uint8Array(32).fill(0x01);
    const key = await deriveKey("correcthorsebattery1", kdfSalt);
    const envelope = await encryptSeed(seed, key);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        user: { id: "u1" },
        jazzZk: {
          accountID: "co_zABC",
          kdfSalt: btoa(String.fromCharCode(...kdfSalt)),
          encryptedSeed: envelope,
        },
      }),
    });

    const signInToJazz = vi.fn(async () => ({ accountID: "co_zABC" }));
    const result = await signIn({
      email: "alice@example.com",
      password: "correcthorsebattery1",
      signInToJazz,
    });

    expect(result.accountID).toBe("co_zABC");
    const [givenSeed] = signInToJazz.mock.calls[0];
    expect(Array.from(givenSeed)).toEqual(Array.from(seed));
  });

  test("wraps wrong-password 401 into clear error", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: "Invalid credentials" }),
    });
    await expect(
      signIn({
        email: "alice@example.com",
        password: "wrong",
        signInToJazz: vi.fn(),
      }),
    ).rejects.toThrow(/credentials/i);
  });
});

describe("recoverWithCode", () => {
  test("decodes 24-word recovery code into seed and hands to Jazz", async () => {
    const seed = new Uint8Array(32).fill(0x42);
    const code = entropyToMnemonic(seed, wordlist);
    const signInToJazz = vi.fn(async () => ({ accountID: "co_zABC" }));
    const result = await recoverWithCode({ recoveryCode: code, signInToJazz });
    expect(result.accountID).toBe("co_zABC");
    const [givenSeed] = signInToJazz.mock.calls[0];
    expect(Array.from(givenSeed)).toEqual(Array.from(seed));
  });

  test("rejects malformed recovery code before touching Jazz", async () => {
    const signInToJazz = vi.fn();
    await expect(
      recoverWithCode({ recoveryCode: "not a real phrase", signInToJazz }),
    ).rejects.toThrow();
    expect(signInToJazz).not.toHaveBeenCalled();
  });
});

describe("changePassword", () => {
  test("fetches material, re-encrypts envelope, posts to /change-password", { timeout: SLOW_TIMEOUT }, async () => {
    const seed = new Uint8Array(32).fill(0x42);
    const oldSalt = new Uint8Array(32).fill(0x01);
    const oldKey = await deriveKey("oldpassword12345", oldSalt);
    const oldEnvelope = await encryptSeed(seed, oldKey);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        kdfSalt: btoa(String.fromCharCode(...oldSalt)),
        encryptedSeed: oldEnvelope,
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    await changePassword({
      currentPassword: "oldpassword12345",
      newPassword: "newpassword67890",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[1];
    const body = JSON.parse(init.body as string);
    expect(body.currentPassword).toBe("oldpassword12345");
    expect(body.newPassword).toBe("newpassword67890");
    expect(typeof body.newKdfSalt).toBe("string");
    expect(typeof body.newEncryptedSeed).toBe("string");
    // Sanity: new salt differs from old
    expect(body.newKdfSalt).not.toBe(btoa(String.fromCharCode(...oldSalt)));
  });

  test("throws if current password decrypt fails before hitting server change endpoint", { timeout: SLOW_TIMEOUT }, async () => {
    const seed = new Uint8Array(32).fill(0x42);
    const oldSalt = new Uint8Array(32).fill(0x01);
    const realKey = await deriveKey("oldpassword12345", oldSalt);
    const envelope = await encryptSeed(seed, realKey);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        kdfSalt: btoa(String.fromCharCode(...oldSalt)),
        encryptedSeed: envelope,
      }),
    });

    await expect(
      changePassword({
        currentPassword: "wrongpassword",
        newPassword: "newpassword67890",
      }),
    ).rejects.toThrow();

    // Only one fetch (to /me/auth-material). No /change-password POST.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
