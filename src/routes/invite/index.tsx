/**
 * InviteRoute: recipient UI for accepting or declining a contact invitation.
 *
 * Phases: loading → review → accepting → accepted → declined → error
 *
 * Auth-gate logic:
 * If the user is not authenticated when they visit /invite#…, this component
 * stashes the URL hash in sessionStorage under "pending-invite-fragment" and
 * redirects to "/" (which renders the onboarding flow). After sign-in, the
 * onboarding steps check for this key and replay the invite URL.
 *
 * TOFU pinning: the inviter's safety number is shown for out-of-band verification
 * before the accept button is enabled.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { useIsAuthenticated } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { SafetyNumber } from "@/components/safety-number";
import { Button } from "@/components/ui/button";
import {
  parseInvitationURL,
  loadInvitationAsAgent,
  acceptInvitation,
} from "@/jazz/invitations";

type Phase = "loading" | "review" | "accepting" | "accepted" | "declined" | "error";

const PENDING_INVITE_KEY = "pending-invite-fragment";

export function InviteRoute() {
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();
  const me = useAccount(ArcanAccount, {
    resolve: {
      profile: true,
      root: { contactBook: { $each: true } },
    },
  });

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<any | null>(null);
  const [inviterName, setInviterName] = useState<string>("");
  const [inviterFingerprint, setInviterFingerprint] = useState<string>("");

  // Auth gate: if not authenticated, stash fragment and redirect to onboarding
  useEffect(() => {
    if (!isAuthenticated) {
      const fragment = window.location.hash;
      if (fragment) {
        sessionStorage.setItem(PENDING_INVITE_KEY, fragment);
      }
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Load invitation once authenticated and account loaded
  useEffect(() => {
    if (!isAuthenticated || !me.$isLoaded) return;

    const fragment = window.location.hash;
    if (!fragment) {
      setErrorMsg("No invitation fragment in URL");
      setPhase("error");
      return;
    }

    const url = `${window.location.origin}/invite${fragment}`;

    let parsed: { inviteGroupID: string; inviteAgentSecret: string };
    try {
      parsed = parseInvitationURL(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
      return;
    }

    loadInvitationAsAgent(parsed.inviteGroupID, parsed.inviteAgentSecret, "")
      .then((inv) => {
        // Self-contact guard: catch immediately so the user sees a clear
        // message before ever reaching the accept button.
        if ((inv as any).inviterAccountID === (me as any).$jazz?.id) {
          setErrorMsg("Cannot add yourself as a contact");
          setPhase("error");
          return;
        }
        setInvitation(inv);
        setInviterName((inv as any).inviterDisplayName ?? "Unknown");
        setInviterFingerprint((inv as any).inviterFingerprint ?? "");
        setPhase("review");
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setPhase("error");
      });
  }, [isAuthenticated, me.$isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAccept() {
    if (!invitation || !me.$isLoaded) return;
    setPhase("accepting");
    try {
      await acceptInvitation(me, invitation);
      setPhase("accepted");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  function handleDecline() {
    setPhase("declined");
  }

  // --- Render ---

  if (!isAuthenticated) {
    return null; // redirecting
  }

  if (phase === "loading") {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">Loading invitation…</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex flex-col items-center gap-4 p-6" data-testid="invite-error">
        <p className="text-sm text-red-600">Error: {errorMsg}</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          Go home
        </Button>
      </div>
    );
  }

  if (phase === "accepting") {
    return (
      <div className="flex flex-col items-center gap-4 p-6" data-testid="invite-accepting">
        <p className="text-sm text-muted-foreground">Accepting invitation…</p>
      </div>
    );
  }

  if (phase === "accepted") {
    return (
      <div
        className="flex flex-col items-center gap-4 p-6 text-center"
        data-testid="invite-accepted"
      >
        <p className="text-green font-medium text-lg">
          You are now connected with {inviterName}!
        </p>
        <p className="text-sm text-muted-foreground">
          They have been added to your contacts.
        </p>
        <Button onClick={() => navigate("/")}>Go home</Button>
      </div>
    );
  }

  if (phase === "declined") {
    return (
      <div
        className="flex flex-col items-center gap-4 p-6 text-center"
        data-testid="invite-declined"
      >
        <p className="text-text-2 font-medium">Invitation declined</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          Go home
        </Button>
      </div>
    );
  }

  // phase === "review"
  return (
    <div className="flex flex-col gap-6 p-6 max-w-md mx-auto">
      <h1 className="text-xl font-bold">Contact invitation</h1>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          <strong data-testid="invite-inviter-name">{inviterName}</strong> wants
          to connect with you.
        </p>

        {inviterFingerprint && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">
              Verify their safety number out of band:
            </p>
            <SafetyNumber fingerprintHex={inviterFingerprint} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={handleAccept} data-testid="invite-accept-btn">
          Accept invitation
        </Button>
        <Button
          variant="outline"
          onClick={handleDecline}
          data-testid="invite-decline-btn"
        >
          Decline
        </Button>
      </div>
    </div>
  );
}
