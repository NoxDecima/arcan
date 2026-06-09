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
import {
  parsePairingURL,
  loadPairingAsAgent,
  respondToPairing,
  claimAccountFromPairing,
} from "@/jazz/pairing";
import type { PairingAuthContext } from "@/jazz/pairing";
import type { AgentSecret } from "cojson";
import type { Account, ID } from "jazz-tools";

type Phase =
  | "scanning"
  | "loaded"
  | "waiting-approval"
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
  const [initiatorName, setInitiatorName] = useState<string | null>(null);
  const [initiatorNaclPubkeyHex, setInitiatorNaclPubkeyHex] = useState<string | null>(null);
  const [pairingCoValueID, setPairingCoValueID] = useState<string | null>(null);

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

        setInitiatorName((pairing as { initiatorDisplayName?: string }).initiatorDisplayName ?? "Unknown device");

        const { responderPrivkeyHex: privkey } = await respondToPairing(
          pairing as Parameters<typeof respondToPairing>[0],
        );

        if (cancelled) return;

        setResponderPrivkeyHex(privkey);
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

  // Step 1b: poll for wrappedAccountSecret while in waiting-approval phase.
  // Separate effect so the cancelled flag doesn't bleed in from submitPubkey.
  useEffect(() => {
    if (phase !== "waiting-approval" || !pairingCoValueID) return;

    const intervalId = setInterval(async () => {
      try {
        const reloaded = await loadPairingAsAgent(pairingCoValueID, "", "");
        if ((reloaded as { wrappedAccountSecret?: string }).wrappedAccountSecret) {
          clearInterval(intervalId);
          setPhase("claiming");
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
    return (
      <div
        className="flex flex-col items-center gap-4 p-6 text-center"
        data-testid="pair-resp-waiting"
      >
        <h2 className="text-base font-semibold">Waiting for approval…</h2>
        <p className="text-sm text-muted-foreground">
          Your other device ({initiatorName ?? "initiator"}) needs to approve this connection.
        </p>
        <Button
          variant="outline"
          data-testid="pair-resp-continue"
          onClick={() => {
            // Allow manual continue (for paste + skip scanner flow)
            setPhase("claiming");
          }}
        >
          Already approved — continue
        </Button>
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
