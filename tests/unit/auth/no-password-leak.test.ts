import { describe, test, expect, vi, beforeEach } from "vitest";
import { signIn } from "@/auth/flows";
import { deriveKey, encryptSeed } from "@/auth/kdf";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  // Reset any global state that might cache strings
  localStorage.clear();
  sessionStorage.clear();
});

describe("password leak regression", () => {
  test("after signIn, password string appears nowhere in storage", { timeout: 30_000 }, async () => {
    const PASSWORD = "uniquepasswordstring42!";
    const seed = new Uint8Array(32).fill(0x42);
    const salt = new Uint8Array(32).fill(0x01);
    const key = await deriveKey(PASSWORD, salt);
    const envelope = await encryptSeed(seed, key);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        user: { id: "u1" },
        jazzZk: {
          accountID: "co_zABC",
          kdfSalt: btoa(String.fromCharCode(...salt)),
          encryptedSeed: envelope,
        },
      }),
    });

    await signIn({
      email: "alice@example.com",
      password: PASSWORD,
      signInToJazz: async () => ({ accountID: "co_zABC" }),
    });

    // Storage scans
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      const v = localStorage.getItem(k) ?? "";
      expect(v).not.toContain(PASSWORD);
      expect(k).not.toContain(PASSWORD);
    }
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)!;
      const v = sessionStorage.getItem(k) ?? "";
      expect(v).not.toContain(PASSWORD);
      expect(k).not.toContain(PASSWORD);
    }
  });
});
