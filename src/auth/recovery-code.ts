import { entropyToMnemonic, mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

/**
 * Generate a fresh 32-byte seed and its BIP-39 recovery-code encoding.
 *
 * Used at sign-up time to display the recovery code to the user BEFORE the
 * Better Auth account is created — keeps the seed shown on backup-display
 * identical to the seed handed to flows.signUp's createJazzAccount.
 */
export function generateRecoveryCode(): {
  seedBytes: Uint8Array;
  recoveryCode: string;
} {
  const seedBytes = crypto.getRandomValues(new Uint8Array(32));
  const recoveryCode = entropyToMnemonic(seedBytes, wordlist);
  return { seedBytes, recoveryCode };
}

/**
 * Decode a 24-word BIP-39 recovery code back to its 32-byte seed.
 *
 * Used at recovery time to reconstruct the seed from the user's recovery
 * code, then passed to Jazz `authenticate` to restore credentials.
 *
 * Throws if the mnemonic is invalid (wrong checksum, unknown word, wrong
 * length).
 */
export function decodeRecoveryCode(recoveryCode: string): Uint8Array {
  const normalized = recoveryCode.trim().replace(/\s+/g, " ");
  return new Uint8Array(mnemonicToEntropy(normalized, wordlist));
}
