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
import { Button } from "@/components/ui/button";
import { Lattice } from "@/components/lattice";
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
      <div className="flex flex-col gap-4 p-6">
        <h2 className="text-base font-semibold">Scan the QR code from your other device</h2>
        <QRScanner onUrl={handleScanned} expectedPathPrefix="/pair" />
      </div>
    );
  }

  if (phase === "loaded") {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">Reading pairing link…</p>
      </div>
    );
  }

  if (phase === "waiting-approval") {
    const fp = (pairing as any)?.responderFingerprint as string | undefined;
    return (
      <div
        data-testid="pair-resp-waiting"
        className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 text-center bg-bg"
      >
        <Lattice size={64} />
        <h2 className="text-lg font-semibold text-text">Waiting for approval</h2>
        <p className="text-sm text-text-2 max-w-xs">
          On your other device, you should see a request to link this one.
        </p>
        <div className="flex flex-col items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-dim font-semibold">Fingerprint</span>
          <span
            data-testid="responder-fingerprint"
            className="font-mono text-2xl tracking-widest text-text bg-panel border border-hairline rounded-r-3 px-4 py-2"
          >
            {fp ?? "…"}
          </span>
          <p className="text-[11px] text-dim max-w-xs leading-relaxed">
            Match this code with what's shown on your other device before tapping Approve there.
          </p>
        </div>
        <div className="flex items-center gap-2 text-text-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-arcan-accent" />
          <span>waiting…</span>
        </div>
      </div>
    );
  }

  if (phase === "rejected") {
    return (
      <div
        data-testid="pair-resp-rejected"
        className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-bg"
      >
        <Lattice size={48} mono />
        <h2 className="text-lg font-semibold text-text">Request rejected</h2>
        <p className="text-sm text-text-2 max-w-xs">
          The other device declined this link. Ask them to retry, or start over.
        </p>
      </div>
    );
  }

  if (phase === "timed-out") {
    return (
      <div
        data-testid="pair-resp-timed-out"
        className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-bg"
      >
        <Lattice size={48} mono />
        <h2 className="text-lg font-semibold text-text">Request timed out</h2>
        <p className="text-sm text-text-2 max-w-xs">
          The request wasn't approved in time. Start a new pairing on your other device.
        </p>
      </div>
    );
  }

  if (phase === "claiming") {
    return (
      <div
        className="flex flex-col items-center gap-4 p-6"
        data-testid="pair-resp-claiming"
      >
        <p className="text-sm text-muted-foreground">Claiming account…</p>
      </div>
    );
  }

  if (phase === "complete") {
    return (
      <div
        className="flex flex-col items-center gap-4 p-6 text-center"
        data-testid="pair-resp-complete"
      >
        <p className="text-green font-medium">Account paired!</p>
        <p className="text-sm text-muted-foreground">
          You now have access to your account on this device.
        </p>
        <Button onClick={() => { window.location.href = "/"; }}>
          Continue
        </Button>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div
        className="flex flex-col items-center gap-4 p-6 text-center"
        data-testid="pair-resp-error"
      >
        <p className="text-sm text-red-600">Error: {errorMsg}</p>
        <Button
          variant="outline"
          onClick={() => {
            setPhase("scanning");
            setPairingUrl(null);
            setErrorMsg(null);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  return null;
}
