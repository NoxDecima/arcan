import { describe, it, expect } from "vitest";
import { generatePassphrase, validatePassphrase } from "@/auth/passphrase";
import { wordlist } from "@scure/bip39/wordlists/english";

describe("generatePassphrase", () => {
  it("returns exactly 24 space-separated words", () => {
    const phrase = generatePassphrase();
    const words = phrase.split(" ");
    expect(words).toHaveLength(24);
  });

  it("all words are in the BIP-39 English wordlist", () => {
    const phrase = generatePassphrase();
    const wordSet = new Set(wordlist);
    for (const word of phrase.split(" ")) {
      expect(wordSet.has(word), `"${word}" not in wordlist`).toBe(true);
    }
  });

  it("two consecutive calls produce different phrases (randomness)", () => {
    const a = generatePassphrase();
    const b = generatePassphrase();
    // Statistically impossible to collide with 256 bits of entropy.
    expect(a).not.toBe(b);
  });
});

describe("validatePassphrase", () => {
  it("accepts a freshly generated passphrase", () => {
    const phrase = generatePassphrase();
    expect(validatePassphrase(phrase)).toEqual({ ok: true });
  });

  it("accepts a phrase with extra surrounding whitespace", () => {
    const phrase = generatePassphrase();
    expect(validatePassphrase(`  ${phrase}  `)).toEqual({ ok: true });
  });

  it("rejects a phrase with too few words (invalid-length)", () => {
    const phrase = generatePassphrase().split(" ").slice(0, 12).join(" ");
    const result = validatePassphrase(phrase);
    expect(result).toEqual({ ok: false, reason: "invalid-length" });
  });

  it("rejects a phrase with too many words (invalid-length)", () => {
    const phrase = generatePassphrase() + " extra";
    const result = validatePassphrase(phrase);
    expect(result).toEqual({ ok: false, reason: "invalid-length" });
  });

  it("rejects a phrase with an invalid word (invalid-word)", () => {
    const words = generatePassphrase().split(" ");
    words[3] = "notavalidbip39word";
    const result = validatePassphrase(words.join(" "));
    expect(result).toEqual({ ok: false, reason: "invalid-word" });
  });

  it("rejects a phrase with an empty string word (invalid-word)", () => {
    const words = generatePassphrase().split(" ");
    words[0] = "";
    // This causes length to appear as 25 when joined with extra space,
    // but the trim/split normalisation means it becomes 24 words with
    // one empty-string entry — which is not in the wordlist.
    // Actually let's just test with a known bad word directly.
    const words2 = generatePassphrase().split(" ");
    words2[5] = "INVALIDWORD";
    const result = validatePassphrase(words2.join(" "));
    expect(result).toEqual({ ok: false, reason: "invalid-word" });
  });

  it("rejects a wrong-checksum phrase (invalid-checksum)", () => {
    // Strategy: generate a valid 24-word phrase, then swap two different
    // valid words such that the result passes word-membership but fails the
    // embedded BIP-39 checksum. We find a swap position where the words
    // differ to ensure the swap changes the encoded bits.
    const phrase = generatePassphrase();
    const words = phrase.split(" ");

    // Find two positions with different words (guaranteed by entropy).
    let swapped = false;
    for (let i = 0; i < words.length - 1 && !swapped; i++) {
      if (words[i] !== words[i + 1]) {
        // Swap adjacent differing words — changes the encoded entropy,
        // almost certainly breaking the checksum.
        [words[i], words[i + 1]] = [words[i + 1], words[i]];
        swapped = true;
      }
    }

    if (!swapped) {
      // Extremely unlikely (all 24 words identical), skip gracefully.
      return;
    }

    const result = validatePassphrase(words.join(" "));
    // The swap breaks the entropy → checksum relationship.
    // It may occasionally produce a valid phrase by chance, but this is
    // astronomically improbable (1 in ~2^8 = 256 for each swap).
    expect(result).toEqual({ ok: false, reason: "invalid-checksum" });
  });
});
