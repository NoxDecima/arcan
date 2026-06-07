import { useCallback } from "react";
import {
  useJazzContextValue,
  useAuthSecretStorage,
} from "jazz-tools/react";
import { Account, cojsonInternals } from "jazz-tools";
import type { JazzAuthContext } from "jazz-tools";
import type { AuthSecretStorage } from "jazz-tools";
import { ArcanAccount } from "./schema/ArcanAccount";

/**
 * Bridge between the Jazz-agnostic `src/auth/flows.ts` and the jazz-tools
 * 0.20.18 React context. flows.ts asks for `createJazzAccount(seed)` /
 * `signInToJazz(seed)` callbacks and a way to set the profile display name;
 * this module provides them as React hooks so they can capture the current
 * Jazz context values (authenticate, register, crypto, AuthSecretStorage).
 *
 * Design notes
 * ------------
 *
 * Why hooks rather than singletons: jazz-tools 0.20.18 keeps the
 * authenticate/register/crypto handles inside React context — there is no
 * documented way to reach them from non-React code without re-running
 * JazzContextManager.getNewContext. Reading the values via the existing
 * provider hook is the cheapest correct path; components call the hooks
 * and pass the returned closures into `flows.signUp` / `flows.signIn`.
 *
 * Implementation strategy: we mirror PassphraseAuth's internals
 * (jazz-tools/dist/index.js, the PassphraseAuth class) — derive the
 * accountSecret from the seed via `crypto.agentSecretFromSecretSeed`,
 * compute the accountID via `cojsonInternals.idforHeader`, then call
 * the context's `authenticate(...)` and persist via AuthSecretStorage.
 *
 * The seed is stamped with provider:"better-auth" rather than "passphrase"
 * because the jazzPluginClient (jazz-tools/dist/better-auth/auth/client.js)
 * keys off this string when intercepting future /sign-in/email and
 * /get-session calls — it needs the credentials in the same storage shape
 * its first-party flow would have written.
 */

export type JazzAccountHandle = {
  accountID: string;
  /**
   * Write the credentials into AuthSecretStorage, flipping
   * useIsAuthenticated() to true. Callers MUST call this only after any
   * downstream confirmation step (e.g. Better Auth /sign-up POST) has
   * succeeded — otherwise an error on that step would leave the form
   * component unmounted before the error could be rendered.
   */
  persist?: () => Promise<void>;
  /**
   * Defensive cleanup if a downstream step fails. Safe to call before or
   * after persist; if persist hasn't fired, this is a no-op for storage.
   */
  rollback?: () => Promise<void>;
};

/**
 * Internal: pull the authenticated Jazz context, asserting we're not in
 * guest mode (passphrase / email-password auth is unsupported there).
 */
function useAuthedJazzContext(): JazzAuthContext<Account> {
  const context = useJazzContextValue<Account>();
  if ("guest" in context) {
    throw new Error(
      "Jazz auth bridge requires an authenticated context (got guest mode).",
    );
  }
  return context;
}

/**
 * Persist credentials into the local AuthSecretStorage under the
 * "better-auth" provider tag. Mirrors what jazzPluginClient's
 * authenticateOnJazz does after a /sign-in/email round-trip.
 */
async function persistAuthMaterial(
  storage: AuthSecretStorage,
  accountID: string,
  secretSeed: Uint8Array,
  accountSecret: string,
): Promise<void> {
  await storage.set({
    accountID: accountID as `co_z${string}`,
    secretSeed,
    accountSecret: accountSecret as `sealerSecret_z${string}/signerSecret_z${string}`,
    provider: "better-auth",
  });
}

/**
 * Hook: returns a `createAccountWithSeed(seed)` closure.
 *
 * Creates a brand-new Jazz account whose initial secret is deterministically
 * derived from the supplied seed. Does NOT write to AuthSecretStorage — the
 * returned handle exposes a `persist` closure for that, which the caller
 * (flows.signUp) invokes only after the Better Auth /sign-up POST has
 * confirmed success. This ordering keeps ProfileStep mounted on error so
 * the user sees the failure message (e.g. "Email already taken") rather
 * than getting silently bounced back to the login screen.
 *
 * NB on rollback semantics: the account itself cannot be deleted from Jazz
 * once written to the local node, but clearing AuthSecretStorage (or never
 * having written it) keeps the user un-authenticated. The orphan CoValue
 * lingers locally until indexedDB is cleared but is unreachable to any
 * peer (followup for a proper orphan-CoValue regression test).
 */
export function useCreateAccountWithSeed() {
  const context = useAuthedJazzContext();
  const authSecretStorage = useAuthSecretStorage();

  return useCallback(
    async (seed: Uint8Array): Promise<JazzAccountHandle> => {
      if (seed.length !== 32) {
        throw new Error(`createAccountWithSeed: seed must be 32 bytes (got ${seed.length})`);
      }
      const crypto = context.node.crypto;
      const accountSecret = crypto.agentSecretFromSecretSeed(seed);
      const accountID = await context.register(accountSecret, {
        name: "",
      });
      // Block until cojson has flushed the newly created account's CoValues
      // to IndexedDB. Without this, persist() below could write the
      // accountID to localStorage while the account itself was still
      // mid-flight to disk — a reload in that window would find a stale
      // pointer in localStorage and fall back to anonymous, orphaning the
      // just-created account. 5s is generous; under normal load this
      // resolves within tens of ms.
      await ArcanAccount.getMe().$jazz.waitForAllCoValuesSync({
        timeout: 5000,
      });
      return {
        accountID,
        persist: async () => {
          await persistAuthMaterial(
            authSecretStorage,
            accountID,
            seed,
            accountSecret,
          );
        },
        rollback: async () => {
          await authSecretStorage.clear();
        },
      };
    },
    [context, authSecretStorage],
  );
}

/**
 * Hook: returns a `setDisplayNameOnMe(handle, displayName)` closure.
 *
 * Sets the profile display name on the currently active Jazz account.
 * Used as the second half of the createJazzAccount callback passed into
 * `flows.signUp`. Uses the NOX-13 `$jazz.set` API on the loaded profile.
 *
 * The handle argument is for symmetry with the plan signature — the
 * implementation just calls Account.getMe() since `register(...)` from
 * the previous step has already made the new account the active one.
 */
export function useSetDisplayNameOnMe() {
  return useCallback(
    async (handle: JazzAccountHandle, displayName: string): Promise<void> => {
      void handle;
      const me = await ArcanAccount.getMe().$jazz.ensureLoaded({
        resolve: { profile: true },
      });
      me.profile.$jazz.set("displayName", displayName);
      me.profile.$jazz.set("name", displayName);
      // Ensure the profile mutations are durably persisted before returning
      // — same reasoning as in useCreateAccountWithSeed. Sign-up resolves to
      // the caller (profile-step → App) only after this completes.
      await me.$jazz.waitForAllCoValuesSync({ timeout: 5000 });
    },
    [],
  );
}

/**
 * Hook: returns a `signInToJazzWithSeed(seed)` closure.
 *
 * Restores an existing Jazz account into the current context using a
 * caller-supplied seed (decrypted from the Better Auth envelope by
 * flows.signIn or decoded from a recovery code by flows.recoverWithCode).
 *
 * Mirrors PassphraseAuth.logIn but skips the BIP-39 decode step.
 */
export function useSignInToJazzWithSeed() {
  const context = useAuthedJazzContext();
  const authSecretStorage = useAuthSecretStorage();

  return useCallback(
    async (seed: Uint8Array): Promise<{ accountID: string }> => {
      if (seed.length !== 32) {
        throw new Error(`signInToJazzWithSeed: seed must be 32 bytes (got ${seed.length})`);
      }
      const crypto = context.node.crypto;
      const accountSecret = crypto.agentSecretFromSecretSeed(seed);
      const accountID = cojsonInternals.idforHeader(
        cojsonInternals.accountHeaderForInitialAgentSecret(accountSecret, crypto),
        crypto,
      ) as `co_z${string}`;
      await context.authenticate({
        accountID,
        accountSecret,
      });
      await persistAuthMaterial(
        authSecretStorage,
        accountID,
        seed,
        accountSecret,
      );
      return { accountID };
    },
    [context, authSecretStorage],
  );
}
