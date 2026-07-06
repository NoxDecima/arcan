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
 *
 * Container: wraps kit presenters per the T5 phase→presenter map.
 * All state machines, createPairingInvite/approvePairing/rejectPairing/
 * tombstonePairing, the creationStartedRef StrictMode guard, both poll
 * effects, and getAuthContext are UNTOUCHED.
 *
 * Chrome note: `waiting` uses proto LinkDeviceScreen (PHeader+Body surface)
 * while the status phases use the cosmic AuthSurface. Faithful to the two
 * design refs (proto vs hf-flows); flagged in manifest.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount } from "jazz-tools/react";
import { useJazzContextValue, useAuthSecretStorage } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { QRDisplay } from "@/components/qr-display";
import {
  createPairingInvite,
  approvePairing,
  rejectPairing,
  tombstonePairing,
} from "@/jazz/pairing";
import {
  deriveDeviceLabel,
  deriveDeviceOS,
  relativeTime,
} from "@/lib/device-info";
import type { PairingInitiation } from "@/jazz/pairing";
import type { AgentSecret } from "cojson";
import type { Account, ID } from "jazz-tools";
import {
  LinkDeviceScreen,
  ApproveDeviceScreen,
  InviteStatusScreen,
} from "@/ui/screens";
import type { ApproveDeviceVM } from "@/ui/screens/auth-types";

type Phase =
  | "loading"
  | "waiting"
  | "awaiting-approval"
  | "approved"
  | "complete"
  | "error";

const POLL_INTERVAL_MS = 2000;

export function InitiatorStep() {
  const me = useAccount(ArcanAccount, {
    resolve: { profile: true },
  });

  const jazzContext = useJazzContextValue();
  const authSecretStorage = useAuthSecretStorage();

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<PairingInitiation | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Synchronous guard prevents React StrictMode's double-invocation from
  // creating two EphemeralPairing CoValues before the first setState resolves.
  const creationStartedRef = useRef(false);

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
    if (creationStartedRef.current) return;
    creationStartedRef.current = true;

    const baseUrl = `${window.location.protocol}//${window.location.host}`;

    createPairingInvite(me, baseUrl)
      .then((inv) => {
        setInvitation(inv);
        setPhase("waiting");
      })
      .catch((err: unknown) => {
        creationStartedRef.current = false; // allow retry on error
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
      await approvePairing(
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

  async function handleReject() {
    if (!invitation) return;
    try {
      await rejectPairing(invitation.pairing);
      setPhase("error");
      setErrorMsg("Rejected.");
    } catch (e) {
      setPhase("error");
      setErrorMsg(String(e));
    }
  }

  async function handleCopyUrl() {
    if (!invitation) return;
    await navigator.clipboard.writeText(invitation.url);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }

  // Build approve-device VM from responder metadata
  function buildApproveVM(): ApproveDeviceVM {
    const p = invitation?.pairing as any;
    const ua: string = p?.responderUserAgent ?? "";
    const label = ua ? `${deriveDeviceLabel(ua)} · ${deriveDeviceOS(ua)}` : "—";
    const firstSeen = relativeTime(p?.responderFirstSeenAt);
    const fp: string = p?.responderFingerprint ?? "—";
    return {
      rows: [
        { label: "device", value: label },
        { label: "first-seen", value: firstSeen },
        { label: "fingerprint", value: fp },
      ],
    };
  }

  // --- Render (all phases wrapped in the h-screen scaffold) ---

  function renderPhase() {
    if (phase === "loading") {
      return (
        <InviteStatusScreen
          markSize={48}
          title="preparing link"
          sub="creating pairing session…"
        />
      );
    }

    if (phase === "error") {
      return (
        <InviteStatusScreen
          markSize={48}
          title="something went wrong"
          sub={errorMsg ?? "unknown error"}
          rootTestId="pair-init-error"
          outline={{
            label: "retry",
            onClick: () => {
              setPhase("loading");
              setInvitation(null);
              setErrorMsg(null);
              creationStartedRef.current = false;
            },
          }}
        />
      );
    }

    if (phase === "complete") {
      return (
        <InviteStatusScreen
          markSize={48}
          title="new device linked"
          rootTestId="pair-init-complete"
          primary={{
            label: "back to home",
            onClick: () => { window.location.href = "/"; },
          }}
          primaryTestId="pair-init-home-btn"
        />
      );
    }

    if (phase === "approved") {
      return (
        <InviteStatusScreen
          markSize={48}
          title="linking device"
          sub="transferring account secret…"
          rootTestId="pair-approved"
        />
      );
    }

    if (phase === "awaiting-approval") {
      return (
        <ApproveDeviceScreen
          vm={buildApproveVM()}
          onApprove={handleApprove}
          onDeny={handleReject}
          approving={false}
          promptTestId="pair-approval-prompt"
          cardTestId="device-approval-card"
          approveTestId="approve-device"
          denyTestId="deny-device"
        />
      );
    }

    // phase === "waiting"
    return (
      <LinkDeviceScreen
        linkUrl={invitation?.url ?? ""}
        onCopy={handleCopyUrl}
        copyTestId="pair-copy-url-btn"
        qrSlot={
          invitation ? (
            <div data-testid="pair-waiting">
              <QRDisplay url={invitation.url} size={150} showText={false} />
            </div>
          ) : undefined
        }
        hiddenUrlSlot={
          invitation ? (
            <span data-testid="qr-url-text" className="sr-only">
              {invitation.url}
            </span>
          ) : undefined
        }
        waitingLabel={
          copyFeedback ? "copied!" : "waiting for your other device…"
        }
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col">
      {renderPhase()}
    </div>
  );
}
