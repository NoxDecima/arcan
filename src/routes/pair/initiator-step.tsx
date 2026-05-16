/**
 * InitiatorStep: drives the initiator side of the QR multi-device pairing
 * protocol.
 *
 * State machine phases:
 *   loading        → creating the pairing CoValue
 *   waiting        → QR shown, waiting for responder's pubkey
 *   awaiting-approval → responder's pubkey received; initiator must approve
 *   approved       → initiator approved; wrapping account secret
 *   complete       → secret transferred; pairing done
 *   error          → any fatal error
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount } from "jazz-tools/react";
import { useJazzContextValue, useAuthSecretStorage } from "jazz-tools/react";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { QRDisplay } from "@/components/qr-display";
import { Button } from "@/components/ui/button";
import {
  createPairingInvite,
  wrapAccountSecretForResponder,
  tombstonePairing,
} from "@/jazz/pairing";
import type { PairingInitiation } from "@/jazz/pairing";
import type { AgentSecret } from "cojson";
import type { Account, ID } from "jazz-tools";

type Phase =
  | "loading"
  | "waiting"
  | "awaiting-approval"
  | "approved"
  | "complete"
  | "error";

const POLL_INTERVAL_MS = 2000;

export function InitiatorStep() {
  const me = useAccount(JazzMessangerAccount, {
    resolve: { profile: true },
  });

  const jazzContext = useJazzContextValue();
  const authSecretStorage = useAuthSecretStorage();

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<PairingInitiation | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derived auth context (reading secretSeed from authSecretStorage)
  const getAuthContext = useCallback(() => {
    if ("guest" in jazzContext) throw new Error("Cannot pair in guest mode");
    const crypto = jazzContext.node.crypto;
    return {
      authenticate: async (credentials: { accountID: ID<Account>; accountSecret: AgentSecret }) => {
        await jazzContext.authenticate(credentials);
      },
      authSecretStorage: {
        set: authSecretStorage.set.bind(authSecretStorage),
        get: authSecretStorage.get.bind(authSecretStorage),
      },
      crypto: {
        agentSecretFromSecretSeed: crypto.agentSecretFromSecretSeed.bind(crypto),
      },
    };
  }, [jazzContext, authSecretStorage]);

  // Step 1: create pairing invite once account is loaded
  useEffect(() => {
    if (!me.$isLoaded) return;
    if (invitation) return; // already created

    const baseUrl = `${window.location.protocol}//${window.location.host}`;

    createPairingInvite(me, baseUrl)
      .then((inv) => {
        setInvitation(inv);
        setPhase("waiting");
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setPhase("error");
      });
  }, [me.$isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 2: poll the pairing CoValue for the responder's pubkey
  useEffect(() => {
    if (phase !== "waiting" || !invitation) return;

    const pairing = invitation.pairing;

    const intervalId = setInterval(() => {
      try {
        if (pairing.responderPubkey) {
          clearInterval(intervalId);
          setPhase("awaiting-approval");
        }
      } catch {
        // CoValue not yet readable — keep polling
      }
    }, POLL_INTERVAL_MS);

    pollRef.current = intervalId;
    return () => clearInterval(intervalId);
  }, [phase, invitation]);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleApprove() {
    if (!invitation) return;
    setPhase("approved");
    try {
      const authCtx = getAuthContext();
      await wrapAccountSecretForResponder(
        me as unknown as Account,
        invitation.pairing,
        invitation.ephemeralPrivkeyHex,
        authCtx,
      );
      await tombstonePairing(invitation.pairing);
      setPhase("complete");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  async function handleCopyUrl() {
    if (!invitation) return;
    await navigator.clipboard.writeText(invitation.url);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }

  // --- Render ---

  if (phase === "loading") {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">Creating pairing session…</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex flex-col items-center gap-4 p-6" data-testid="pair-init-error">
        <p className="text-sm text-red-600">Error: {errorMsg}</p>
        <Button
          variant="outline"
          onClick={() => {
            setPhase("loading");
            setInvitation(null);
            setErrorMsg(null);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (phase === "complete") {
    return (
      <div
        className="flex flex-col items-center gap-4 p-6 text-center"
        data-testid="pair-init-complete"
      >
        <p className="text-green-700 font-medium">Device paired successfully!</p>
        <p className="text-sm text-muted-foreground">
          The new device now has access to your account.
        </p>
      </div>
    );
  }

  if (phase === "approved") {
    return (
      <div
        className="flex flex-col items-center gap-4 p-6"
        data-testid="pair-approved"
      >
        <p className="text-sm text-muted-foreground">Transferring account secret…</p>
      </div>
    );
  }

  if (phase === "awaiting-approval") {
    return (
      <div
        className="flex flex-col gap-4 p-6"
        data-testid="pair-approval-prompt"
      >
        <h2 className="text-base font-semibold">Approve new device?</h2>
        <p className="text-sm text-muted-foreground">
          A new device wants to join your account. Approve to grant full
          account access.
        </p>
        <Button onClick={handleApprove} data-testid="pair-approve-btn">
          Approve
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            if (invitation) await tombstonePairing(invitation.pairing);
            setPhase("error");
            setErrorMsg("Pairing rejected by initiator");
          }}
        >
          Reject
        </Button>
      </div>
    );
  }

  // phase === "waiting"
  return (
    <div className="flex flex-col items-center gap-6 p-6" data-testid="pair-waiting">
      <h2 className="text-base font-semibold">Scan on your new device</h2>
      {invitation && <QRDisplay url={invitation.url} size={256} showText={false} />}
      <div className="flex gap-2 w-full max-w-sm">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleCopyUrl}
          data-testid="pair-copy-url-btn"
        >
          {copyFeedback ? "Copied!" : "Copy link"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Waiting for the new device to scan…
      </p>
    </div>
  );
}
