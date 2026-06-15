/**
 * ResponderStep: drives the responder side of the QR multi-device pairing
 * protocol.
 *
 * State machine phases:
 *   scanning         → show QR scanner (skipped if hash already in URL)
 *   loaded           → URL parsed, show confirm prompt
 *   waiting-approval → pubkey submitted, waiting for initiator to wrap secret
 *   claiming         → claiming the account (raw-secret login in progress)
 *   complete         → account claimed; session active
 *   error            → any fatal error
 *
 * If window.location.hash is set at mount, jump straight to "loaded".
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useJazzContextValue, useAuthSecretStorage } from "jazz-tools/react";
import { QRScanner } from "@/qr/scanner";
import {
  AuthSurface,
  Wordmark,
  AuthTitle,
  AuthSub,
} from "@/components/auth-surface";
import {
  parsePairingURL,
  loadPairingAsAgent,
  respondToPairing,
  claimAccountFromPairing,
  nextPairingPhase,
} from "@/jazz/pairing";
import type { PairingAuthContext } from "@/jazz/pairing";
import type { AgentSecret } from "cojson";
import type { Account, ID } from "jazz-tools";

type Phase =
  | "scanning"
  | "loaded"
  | "waiting-approval"
  | "rejected"
  | "timed-out"
  | "claiming"
  | "complete"
  | "error";

const POLL_INTERVAL_MS = 2000;

export function ResponderStep() {
  const jazzContext = useJazzContextValue();
  const authSecretStorage = useAuthSecretStorage();

  const [phase, setPhase] = useState<Phase>(() => {
    // If the URL hash is already set, skip scanner and go to loaded
    return window.location.hash.length > 1 ? "loaded" : "scanning";
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pairingUrl, setPairingUrl] = useState<string | null>(() => {
    // Pre-populate from hash if present
    if (window.location.hash.length > 1) {
      return `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
    }
    return null;
  });
  const [responderPrivkeyHex, setResponderPrivkeyHex] = useState<string | null>(null);
  const [initiatorNaclPubkeyHex, setInitiatorNaclPubkeyHex] = useState<string | null>(null);
  const [pairingCoValueID, setPairingCoValueID] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pairing, setPairing] = useState<any>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build auth context from hooks
  const getAuthContext = useCallback((): PairingAuthContext & { initiatorNaclPubkeyHex?: string } => {
    if ("guest" in jazzContext) {
      // Guest mode is OK for the responder — we'll authenticate into the new account
      // We still need crypto; in guest mode, jazzContext has a node field
    }
    const node = ("guest" in jazzContext) ? jazzContext.node : (jazzContext as { node: { crypto: unknown } }).node;
    // Use the full CryptoProvider instance — claimAccountFromPairing needs getAgentID
    // (used internally by cojsonInternals.accountHeaderForInitialAgentSecret).
    // Class methods live on the prototype so spreading won't copy them; pass the instance.
    const cryptoInstance = (node as { crypto: { agentSecretFromSecretSeed: (s: Uint8Array) => AgentSecret; [k: string]: unknown } }).crypto;

    return {
      authenticate: async (credentials: { accountID: ID<Account>; accountSecret: AgentSecret }) => {
        await jazzContext.authenticate(credentials);
      },
      authSecretStorage: {
        set: authSecretStorage.set.bind(authSecretStorage),
        get: authSecretStorage.get.bind(authSecretStorage),
      },
      // Pass the crypto instance directly so prototype methods (getAgentID etc.) are accessible
      crypto: cryptoInstance,
      initiatorNaclPubkeyHex: initiatorNaclPubkeyHex ?? undefined,
    };
  }, [jazzContext, authSecretStorage, initiatorNaclPubkeyHex]);

  // Step 1: when we have a URL (either from hash or scanner), parse + submit pubkey
  useEffect(() => {
    if (phase !== "loaded" || !pairingUrl) return;

    let cancelled = false;

    async function submitPubkey() {
      try {
        const parsed = parsePairingURL(pairingUrl!);
        setPairingCoValueID(parsed.pairingCoValueID);
        // pairingAgentSecret in our URL = initiator's nacl ephemeral pubkey hex
        setInitiatorNaclPubkeyHex(parsed.pairingAgentSecret);

        const pairing = await loadPairingAsAgent(
          parsed.pairingCoValueID,
          parsed.pairingAgentSecret,
          "", // syncURL handled by provider
        );

        if (cancelled) return;

        setPairing(pairing);

        const { responderPrivkeyHex: privkey } = await respondToPairing(
          pairing as Parameters<typeof respondToPairing>[0],
        );

        if (cancelled) return;

        setResponderPrivkeyHex(privkey);
        // Reload to pick up fingerprint written by respondToPairing
        const refreshed = await loadPairingAsAgent(parsed.pairingCoValueID, parsed.pairingAgentSecret, "");
        if (!cancelled && refreshed) setPairing(refreshed);
        setPhase("waiting-approval");
        // Polling for wrappedAccountSecret is handled by a dedicated useEffect below
      } catch (err: unknown) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : String(err));
          setPhase("error");
        }
      }
    }

    submitPubkey();
    return () => { cancelled = true; };
  }, [phase, pairingUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 1b: poll for wrappedAccountSecret / rejectedAt / expiresAt while in waiting-approval phase.
  // Separate effect so the cancelled flag doesn't bleed in from submitPubkey.
  useEffect(() => {
    if (phase !== "waiting-approval" || !pairingCoValueID) return;

    const intervalId = setInterval(async () => {
      try {
        const reloaded = await loadPairingAsAgent(pairingCoValueID, "", "");
        if (!reloaded) return;
        const r = reloaded as any;
        const next = nextPairingPhase(r);
        if (next !== "waiting-approval") {
          clearInterval(intervalId);
          setPhase(next);
        }
      } catch {
        // CoValue not ready — keep polling
      }
    }, POLL_INTERVAL_MS);

    pollRef.current = intervalId;
    return () => clearInterval(intervalId);
  }, [phase, pairingCoValueID]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 2: when we reach "claiming", do the actual account claim
  useEffect(() => {
    if (phase !== "claiming" || !pairingCoValueID || !responderPrivkeyHex || !initiatorNaclPubkeyHex) return;

    let cancelled = false;

    async function doClaim() {
      try {
        const pairing = await loadPairingAsAgent(pairingCoValueID!, "", "");
        const authCtx = getAuthContext();

        await claimAccountFromPairing(
          pairing as Parameters<typeof claimAccountFromPairing>[0],
          responderPrivkeyHex!,
          authCtx,
        );

        if (!cancelled) setPhase("complete");
      } catch (err: unknown) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : String(err));
          setPhase("error");
        }
      }
    }

    doClaim();
    return () => { cancelled = true; };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function handleScanned(url: string) {
    setPairingUrl(url);
    setPhase("loaded");
  }

  // --- Render ---

  if (phase === "scanning") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>scan to join</AuthTitle>
        <AuthSub>point your camera at the QR on your other device</AuthSub>
        <QRScanner onUrl={handleScanned} expectedPathPrefix="/pair" />
      </AuthSurface>
    );
  }

  if (phase === "loaded") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>reading pairing link</AuthTitle>
        <AuthSub>verifying the invite…</AuthSub>
      </AuthSurface>
    );
  }

  if (phase === "waiting-approval") {
    const fp = (pairing as any)?.responderFingerprint as string | undefined;
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>waiting for approval</AuthTitle>
        <AuthSub>on your other device, approve this link</AuthSub>
        <div
          data-testid="pair-resp-waiting"
          className="flex flex-col items-center gap-[6px]"
        >
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-dim">
            fingerprint
          </span>
          <span
            data-testid="responder-fingerprint"
            className="rounded-r-3 border border-hairline bg-panel px-4 py-2 font-mono text-[22px] tracking-widest text-text"
          >
            {fp ?? "…"}
          </span>
          <p className="text-[11px] text-dim leading-relaxed text-center">
            match this code with what's shown on your other device before
            tapping approve there.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <span className="h-[7px] w-[7px] rounded-pill bg-arcan-accent" />
          <span className="text-[10.5px] text-dim">waiting…</span>
        </div>
      </AuthSurface>
    );
  }

  if (phase === "rejected") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>request rejected</AuthTitle>
        <AuthSub>
          the other device declined this link. ask them to retry, or start
          over.
        </AuthSub>
        <div data-testid="pair-resp-rejected" />
      </AuthSurface>
    );
  }

  if (phase === "timed-out") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>request timed out</AuthTitle>
        <AuthSub>start a new pairing on your other device.</AuthSub>
        <div data-testid="pair-resp-timed-out" />
      </AuthSurface>
    );
  }

  if (phase === "claiming") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>claiming account</AuthTitle>
        <AuthSub>almost there…</AuthSub>
        <div data-testid="pair-resp-claiming" />
      </AuthSurface>
    );
  }

  if (phase === "complete") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>account paired</AuthTitle>
        <AuthSub>you now have access on this device.</AuthSub>
        <button
          type="button"
          onClick={() => {
            window.location.href = "/";
          }}
          data-testid="pair-resp-complete"
          className="h-10 w-full rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold"
        >
          continue
        </button>
      </AuthSurface>
    );
  }

  if (phase === "error") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>pairing failed</AuthTitle>
        <AuthSub>{errorMsg ?? "unknown error"}</AuthSub>
        <button
          type="button"
          onClick={() => {
            setPhase("scanning");
            setPairingUrl(null);
            setErrorMsg(null);
          }}
          data-testid="pair-resp-error"
          className="h-10 w-full rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
        >
          try again
        </button>
      </AuthSurface>
    );
  }

  return null;
}
