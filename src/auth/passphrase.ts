import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToEntropy,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

/**
 * The expected word count for a 256-bit BIP-39 mnemonic (maximum security).
 * Jazz uses 24-word passphrases when calling generateRandomPassphrase().
 */
const WORD_COUNT = 24;

/**
 * generatePassphrase(): returns a fresh 24-word BIP-39 mnemonic.
 *
 * Uses the same English wordlist that jazz-tools/usePassphraseAuth uses
 * internally. The strength of 256 bits produces exactly 24 words.
 */
export function generatePassphrase(): string {
  return generateMnemonic(wordlist, 256);
}

export type ValidatePassphraseResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid-length" | "invalid-word" | "invalid-checksum";
    };

/**
 * validatePassphrase(): validates a passphrase before passing it to Jazz.
 *
 * Returns a structured result rather than throwing, giving the UI layer
 * specific error reasons for better UX. Jazz's own logIn() only throws
 * a generic Error("Invalid passphrase") without distinguishing causes.
 *
 * Validation order:
 *   1. Word count — must be exactly 24 (256-bit entropy).
 *   2. Word membership — every word must appear in the English BIP-39 list.
 *   3. Checksum — the final bits encode a SHA-256 checksum; wrong-checksum
 *      phrases fail even if all words are valid.
 */
export function validatePassphrase(phrase: string): ValidatePassphraseResult {
  const words = phrase.trim().split(/\s+/);

  // 1. Length check
  if (words.length !== WORD_COUNT) {
    return { ok: false, reason: "invalid-length" };
  }

  // 2. Word membership check (before checksum so we report the right reason)
  const wordSet = new Set(wordlist);
  for (const word of words) {
    if (!wordSet.has(word)) {
      return { ok: false, reason: "invalid-word" };
    }
  }

  // 3. Checksum check — validateMnemonic verifies the BIP-39 checksum bits
  //    embedded in the last word. mnemonicToEntropy would throw on failure,
  //    but validateMnemonic returns a boolean which is cleaner here.
  const normalized = words.join(" ");
  if (!validateMnemonic(normalized, wordlist)) {
    return { ok: false, reason: "invalid-checksum" };
  }

  // Confirm entropy can be decoded (belt-and-suspenders; should not throw
  // after passing validateMnemonic above).
  try {
    mnemonicToEntropy(normalized, wordlist);
  } catch {
    return { ok: false, reason: "invalid-checksum" };
  }

  return { ok: true };
}
