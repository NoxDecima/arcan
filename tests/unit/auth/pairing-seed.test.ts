import { describe, it, expect, beforeEach } from "vitest";
import { getPairingSeed, setPairingSeed, clearPairingSeed } from "@/auth/pairing-seed";

// jsdom provides localStorage; reset it before each test so tests are isolated.
beforeEach(() => {
  localStorage.clear();
});

describe("pairing-seed round-trip", () => {
  it("returns null when nothing has been stored", () => {
    expect(getPairingSeed()).toBeNull();
  });

  it("stores and retrieves a 32-byte seed", () => {
    const seed = new Uint8Array(32);
    for (let i = 0; i < 32; i++) seed[i] = i; // 0..31

    setPairingSeed(seed);
    const retrieved = getPairingSeed();

    expect(retrieved).not.toBeNull();
    expect(retrieved!.length).toBe(32);
    expect(Array.from(retrieved!)).toEqual(Array.from(seed));
  });

  it("round-trips arbitrary byte values including 0 and 255", () => {
    const seed = new Uint8Array([0, 1, 127, 128, 254, 255, ...new Array(26).fill(42)]);
    setPairingSeed(seed);
    const retrieved = getPairingSeed();
    expect(Array.from(retrieved!)).toEqual(Array.from(seed));
  });

  it("overwrites an earlier stored seed", () => {
    const seed1 = new Uint8Array(32).fill(1);
    const seed2 = new Uint8Array(32).fill(2);

    setPairingSeed(seed1);
    setPairingSeed(seed2);

    const retrieved = getPairingSeed();
    expect(Array.from(retrieved!)).toEqual(Array.from(seed2));
  });

  it("clearPairingSeed removes the stored value", () => {
    setPairingSeed(new Uint8Array(32).fill(99));
    clearPairingSeed();
    expect(getPairingSeed()).toBeNull();
  });

  it("getPairingSeed returns null if localStorage value is corrupt", () => {
    localStorage.setItem("jazz-messanger.pairing-seed-v1", "!!!not-base64url!!!");
    // Should not throw; should return null gracefully
    expect(getPairingSeed()).toBeNull();
  });
});
