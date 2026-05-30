import { mnemonicToEntropy, entropyToMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { deriveKey, encryptSeed, decryptSeed } from "./kdf";
import { recoveryProof } from "./recovery-proof";

type JazzHandle = {
  accountID: string;
  /** Optional rollback if a downstream step fails before sync. */
  rollback?: () => Promise<void> | void;
};

type SignUpParams = {
  email: string;
  username: string;
  password: string;
  displayName: string;
  /**
   * Inject the Jazz account creation. In production wires to a helper
   * around jazz-tools that creates an Account from a known secretSeed.
   * In tests, a mock returns a stub JazzHandle.
   */
  createJazzAccount: (seed: Uint8Array, displayName: string) => Promise<JazzHandle>;
};

export async function signUp(params: SignUpParams): Promise<{
  accountID: string;
  recoveryCode: string;
}> {
  // 1. Fresh seed
  const seed = crypto.getRandomValues(new Uint8Array(32));
  // 2. Recovery code = BIP-39 of seed
  const recoveryCode = entropyToMnemonic(seed, wordlist);
  // 3. KDF salt
  const kdfSalt = crypto.getRandomValues(new Uint8Array(32));
  // 4. Derive key + encrypt seed
  const key = await deriveKey(params.password, kdfSalt);
  const encryptedSeed = await encryptSeed(seed, key);
  // 5. Recovery proof
  const proof = await recoveryProof(seed);

  // 6. Create Jazz account locally
  const jazz = await params.createJazzAccount(seed, params.displayName);

  // 7. POST to auth server
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("x-jazz-zk", JSON.stringify({
    kdfSalt: bytesToBase64(kdfSalt),
    encryptedSeed,
    recoveryProofHmac: proof,
    accountID: jazz.accountID,
  }));

  let response: Response;
  try {
    response = await fetch("/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: params.email,
        password: params.password,
        name: params.username,
      }),
      credentials: "include",
    });
  } catch (err) {
    await jazz.rollback?.();
    throw new Error(`Network error during sign-up: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    await jazz.rollback?.();
    const body = await safeJson(response);
    throw new Error(body?.message ?? `Sign-up failed (${response.status})`);
  }

  return { accountID: jazz.accountID, recoveryCode };
}

type SignInParams = {
  email: string;
  password: string;
  signInToJazz: (seed: Uint8Array) => Promise<{ accountID: string }>;
};

export async function signIn(params: SignInParams): Promise<{ accountID: string }> {
  const response = await fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: params.email, password: params.password }),
    credentials: "include",
  });
  if (!response.ok) {
    const body = await safeJson(response);
    throw new Error(body?.message ?? `Sign-in failed: invalid credentials`);
  }
  const body = await response.json();
  const zk = body?.jazzZk;
  if (!zk?.kdfSalt || !zk?.encryptedSeed || !zk?.accountID) {
    throw new Error("Server response missing auth material");
  }
  const kdfSalt = base64ToBytes(zk.kdfSalt);
  const key = await deriveKey(params.password, kdfSalt);
  const seed = await decryptSeed(zk.encryptedSeed, key);
  const result = await params.signInToJazz(seed);
  return { accountID: result.accountID };
}

type RecoverParams = {
  recoveryCode: string;
  signInToJazz: (seed: Uint8Array) => Promise<{ accountID: string }>;
};

export async function recoverWithCode(params: RecoverParams): Promise<{ accountID: string }> {
  const normalized = params.recoveryCode.trim().replace(/\s+/g, " ");
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("Invalid recovery code");
  }
  const entropy = mnemonicToEntropy(normalized, wordlist);
  const seed = new Uint8Array(entropy);
  if (seed.length !== 32) {
    throw new Error("Recovery code must encode 32 bytes");
  }
  const result = await params.signInToJazz(seed);
  return { accountID: result.accountID };
}

type SetPasswordAfterRecoveryParams = {
  newPassword: string;
  seed: Uint8Array;
  accountID: string;
};

export async function setPasswordAfterRecovery(
  params: SetPasswordAfterRecoveryParams,
): Promise<void> {
  const newKdfSalt = crypto.getRandomValues(new Uint8Array(32));
  const key = await deriveKey(params.newPassword, newKdfSalt);
  const newEncryptedSeed = await encryptSeed(params.seed, key);
  const proof = await recoveryProof(params.seed);

  const response = await fetch("/api/auth/reset-with-recovery", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      accountID: params.accountID,
      proof,
      newPassword: params.newPassword,
      newKdfSalt: bytesToBase64(newKdfSalt),
      newEncryptedSeed,
    }),
  });
  if (!response.ok) {
    const body = await safeJson(response);
    throw new Error(body?.message ?? `Reset failed (${response.status})`);
  }
}

type ChangePasswordParams = {
  currentPassword: string;
  newPassword: string;
};

export async function changePassword(params: ChangePasswordParams): Promise<void> {
  const materialRes = await fetch("/api/auth/me/auth-material", {
    method: "GET",
    credentials: "include",
  });
  if (!materialRes.ok) {
    throw new Error("Failed to fetch current auth material");
  }
  const material = await materialRes.json() as { kdfSalt: string; encryptedSeed: string };
  const oldSalt = base64ToBytes(material.kdfSalt);
  const oldKey = await deriveKey(params.currentPassword, oldSalt);
  // Decrypt locally first — if this throws, the current password is wrong
  // and we never hit the change-password endpoint.
  const seed = await decryptSeed(material.encryptedSeed, oldKey);

  const newSalt = crypto.getRandomValues(new Uint8Array(32));
  const newKey = await deriveKey(params.newPassword, newSalt);
  const newEnvelope = await encryptSeed(seed, newKey);

  const response = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      currentPassword: params.currentPassword,
      newPassword: params.newPassword,
      revokeOtherSessions: true,
      newKdfSalt: bytesToBase64(newSalt),
      newEncryptedSeed: newEnvelope,
    }),
  });
  if (!response.ok) {
    const body = await safeJson(response);
    throw new Error(body?.message ?? `Change password failed (${response.status})`);
  }
}

type ViewRecoveryCodeParams = {
  currentPassword: string;
};

export async function viewRecoveryCode(
  params: ViewRecoveryCodeParams,
): Promise<string> {
  const materialRes = await fetch("/api/auth/me/auth-material", {
    method: "GET",
    credentials: "include",
  });
  if (!materialRes.ok) {
    throw new Error("Failed to fetch current auth material");
  }
  const material = await materialRes.json() as { kdfSalt: string; encryptedSeed: string };
  const salt = base64ToBytes(material.kdfSalt);
  const key = await deriveKey(params.currentPassword, salt);
  const seed = await decryptSeed(material.encryptedSeed, key);
  return entropyToMnemonic(seed, wordlist);
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(s: string): Uint8Array {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

async function safeJson(response: Response): Promise<{ message?: string } | undefined> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
