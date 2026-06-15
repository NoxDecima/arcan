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
import { Link } from "react-router-dom";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { QRDisplay } from "@/components/qr-display";
import { DeviceApprovalCard } from "@/components/device-approval-card";
import {
  AuthSurface,
  Wordmark,
  AuthTitle,
  AuthSub,
} from "@/components/auth-surface";
import {
  createPairingInvite,
  approvePairing,
  rejectPairing,
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

  // --- Render ---

  if (phase === "loading") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>preparing link</AuthTitle>
        <AuthSub>creating pairing session…</AuthSub>
      </AuthSurface>
    );
  }

  if (phase === "error") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>something went wrong</AuthTitle>
        <AuthSub>{errorMsg ?? "unknown error"}</AuthSub>
        <div data-testid="pair-init-error" />
        <button
          type="button"
          onClick={() => {
            setPhase("loading");
            setInvitation(null);
            setErrorMsg(null);
          }}
          className="h-10 w-full rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
        >
          retry
        </button>
      </AuthSurface>
    );
  }

  if (phase === "complete") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>new device linked</AuthTitle>
        <div data-testid="pair-init-complete" />
        <Link to="/">
          <button
            type="button"
            data-testid="pair-init-home-btn"
            className="h-10 w-full rounded-r-3 bg-arcan-accent text-on-accent font-mono text-[12.5px] font-semibold"
          >
            back to home
          </button>
        </Link>
      </AuthSurface>
    );
  }

  if (phase === "approved") {
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <AuthTitle>linking device</AuthTitle>
        <AuthSub>transferring account secret…</AuthSub>
        <div data-testid="pair-approved" />
      </AuthSurface>
    );
  }

  if (phase === "awaiting-approval") {
    const p = invitation?.pairing as any;
    return (
      <AuthSurface forceDark w={330}>
        <Wordmark size={20} />
        <div data-testid="pair-approval-prompt">
          <DeviceApprovalCard
            userAgent={p?.responderUserAgent}
            firstSeenAt={p?.responderFirstSeenAt}
            fingerprint={p?.responderFingerprint}
            onApprove={handleApprove}
            onDeny={handleReject}
            pending={false}
          />
        </div>
      </AuthSurface>
    );
  }

  // phase === "waiting"
  return (
    <AuthSurface forceDark w={330}>
      <Wordmark size={20} />
      <AuthTitle>link a new device</AuthTitle>
      <AuthSub>open this link on your other device, or scan it</AuthSub>
      <div className="flex justify-center" data-testid="pair-waiting">
        {invitation && <QRDisplay url={invitation.url} size={132} showText={false} />}
      </div>
      <button
        type="button"
        onClick={handleCopyUrl}
        data-testid="pair-copy-url-btn"
        className="h-10 w-full rounded-r-3 border border-hairline bg-transparent text-text font-mono text-[12.5px] font-semibold"
      >
        {copyFeedback ? "copied!" : "copy link"}
      </button>
      <div className="flex items-center justify-center gap-2 mt-[2px]">
        <span className="h-[7px] w-[7px] rounded-pill bg-arcan-accent" />
        <span className="text-[10.5px] text-dim">waiting for your other device…</span>
      </div>
    </AuthSurface>
  );
}
