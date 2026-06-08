/**
 * ContactAddRoute: inviter UI for creating a contact invitation.
 *
 * Phases: loading → waiting → accepted → cancelled → error
 *
 * Displays a QR code and copy-URL button while waiting for the recipient to
 * accept the invitation. Polls invitation.acceptedAt to detect acceptance.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { QRDisplay } from "@/components/qr-display";
import { Button } from "@/components/ui/button";
import { createInvitation, acceptInvitationAcceptance } from "@/jazz/invitations";
import type { InvitationIssued } from "@/jazz/invitations";

type Phase = "loading" | "waiting" | "accepted" | "cancelled" | "error";

const POLL_INTERVAL_MS = 2000;

export function ContactAddRoute() {
  const navigate = useNavigate();
  const me = useAccount(ArcanAccount, {
    resolve: {
      profile: true,
      root: { invitesIssued: { $each: true }, contactBook: { $each: true } },
    },
  });

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [issued, setIssued] = useState<InvitationIssued | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Synchronous guard prevents React StrictMode's double-invocation from
  // creating two Invitations before the first setState resolves.
  const creationStartedRef = useRef(false);

  // Step 1: create invitation once account is loaded
  useEffect(() => {
    if (!me.$isLoaded) return;
    if (creationStartedRef.current) return;
    creationStartedRef.current = true;

    const baseUrl = `${window.location.protocol}//${window.location.host}`;

    createInvitation(me, baseUrl)
      .then((inv) => {
        setIssued(inv);
        setPhase("waiting");
      })
      .catch((err: unknown) => {
        creationStartedRef.current = false; // allow retry on error
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setPhase("error");
      });
  }, [me.$isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 2: poll for acceptance
  useEffect(() => {
    if (phase !== "waiting" || !issued) return;

    const invitation = issued.invitation;

    const intervalId = setInterval(() => {
      try {
        if ((invitation as any).acceptedAt) {
          clearInterval(intervalId);
          // Complete the inviter side: add contact + mark consumed
          acceptInvitationAcceptance(me as any, invitation)
            .then(() => setPhase("accepted"))
            .catch((err: unknown) => {
              setErrorMsg(err instanceof Error ? err.message : String(err));
              setPhase("error");
            });
        }
      } catch {
        // CoValue not yet readable — keep polling
      }
    }, POLL_INTERVAL_MS);

    pollRef.current = intervalId;
    return () => clearInterval(intervalId);
  }, [phase, issued]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleCopyUrl() {
    if (!issued) return;
    await navigator.clipboard.writeText(issued.url);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }

  function handleCancel() {
    if (pollRef.current) clearInterval(pollRef.current);
    setPhase("cancelled");
  }

  // --- Render ---

  if (phase === "loading") {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">Creating invitation…</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex flex-col items-center gap-4 p-6" data-testid="add-contact-error">
        <p className="text-sm text-red-600">Error: {errorMsg}</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          Go home
        </Button>
      </div>
    );
  }

  if (phase === "accepted") {
    return (
      <div
        className="flex flex-col items-center gap-4 p-6 text-center"
        data-testid="add-contact-accepted"
      >
        <p className="text-green font-medium text-lg">Contact added!</p>
        <p className="text-sm text-muted-foreground">
          Your invitation was accepted. The contact is now in your contact list.
        </p>
        <Button onClick={() => navigate("/")}>Go home</Button>
      </div>
    );
  }

  if (phase === "cancelled") {
    return (
      <div
        className="flex flex-col items-center gap-4 p-6 text-center"
        data-testid="add-contact-cancelled"
      >
        <p className="text-text-2 font-medium">Invitation cancelled</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          Go home
        </Button>
      </div>
    );
  }

  // phase === "waiting"
  return (
    <div
      className="flex flex-col items-center gap-6 p-6"
      data-testid="add-contact-waiting"
    >
      <h2 className="text-base font-semibold">Share your invite link</h2>
      <p className="text-sm text-muted-foreground text-center">
        Send this link or QR code to the person you want to add as a contact.
        The link expires in 7 days.
      </p>

      {issued && <QRDisplay url={issued.url} size={256} showText />}

      <div className="flex flex-col gap-2 w-full max-w-sm">
        <Button
          variant="outline"
          onClick={handleCopyUrl}
          data-testid="add-contact-copy-btn"
        >
          {copyFeedback ? "Copied!" : "Copy invite link"}
        </Button>

        <Button
          variant="ghost"
          onClick={handleCancel}
          data-testid="add-contact-cancel-btn"
        >
          Cancel
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Waiting for them to accept…
      </p>
    </div>
  );
}
