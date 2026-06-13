/**
 * InviteRoute: requester confirmation screen.
 *
 * Phases: loading → confirm (or expired / error) → signin-required
 *         → sending → sent → approved / expired
 *
 * Auth-gate logic:
 * The route is mounted outside the auth gate in App.tsx so unauthenticated
 * users can land here. If the user is not signed in when they click "connect",
 * we transition to signin-required and show a CTA that takes them to /auth/login
 * with the current URL as the `next` param. After sign-in, the route re-renders
 * with isAuthenticated === true and advances to confirm automatically.
 *
 * TOFU pinning: the inviter's safety number is shown in a collapsible details
 * element for out-of-band verification.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount, useIsAuthenticated } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { ConnectionRequest } from "@/jazz/schema/ConnectionRequest";
import { SafetyNumber } from "@/components/safety-number";
import { Button } from "@/components/ui/button";
import { Lattice } from "@/components/lattice";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import {
  parseInvitationURL,
  loadInvitationAsGuest,
  createConnectionRequest,
} from "@/jazz/invitations";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function writeInviterAsContact(
  me: any,
  inv: {
    inviterAccountID: string;
    inviterFingerprint: string;
    inviterDisplayName: string;
  },
): Promise<void> {
  const { Contact } = await import("@/jazz/schema/Contact");
  const contact = Contact.create(
    {
      contactAccountID: inv.inviterAccountID,
      pinnedFingerprint: inv.inviterFingerprint,
      displayNameLocal: inv.inviterDisplayName,
      addedAt: new Date(),
    },
    { owner: me },
  );
  const cb = me.root?.contactBook;
  if (cb && typeof cb.$jazz?.push === "function") {
    cb.$jazz.push(contact);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase =
  | "loading"
  | "signin-required"
  | "confirm"
  | "sending"
  | "sent"
  | "approved"
  | "expired"
  | "error";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
  const [err, setErr] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<any | null>(null);
  const [request, setRequest] = useState<any | null>(null);

  const shared = useSharedGroups(invitation?.inviterAccountID ?? "");

  // --- Load invitation on mount (works unauthenticated too) ---
  useEffect(() => {
    (async () => {
      try {
        const url = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
        const { invitationID } = parseInvitationURL(url);
        const inv = await loadInvitationAsGuest(invitationID);
        const invAny = inv as any;

        if (invAny.revokedAt) {
          setPhase("expired");
          setErr("invite revoked");
          return;
        }
        if (invAny.expiresAt && new Date(invAny.expiresAt).getTime() < Date.now()) {
          setPhase("expired");
          return;
        }

        setInvitation(invAny);

        if (!isAuthenticated) {
          setPhase("signin-required");
        } else {
          setPhase("confirm");
        }
      } catch (e) {
        setPhase("error");
        setErr(String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Advance from signin-required → confirm once the user signs in
  useEffect(() => {
    if (phase === "signin-required" && isAuthenticated && invitation) {
      setPhase("confirm");
    }
  }, [isAuthenticated, phase, invitation]);

  // Poll the ConnectionRequest for approval once sent
  useEffect(() => {
    if (phase !== "sent" || !request) return;

    const interval = setInterval(async () => {
      try {
        const reloaded = await ConnectionRequest.load(
          (request as any).$jazz.id as any,
          { resolve: {} },
        );
        if (!reloaded) return;
        const r = reloaded as any;
        if (r.approvedAt) {
          clearInterval(interval);
          await writeInviterAsContact(me as any, {
            inviterAccountID: invitation.inviterAccountID,
            inviterFingerprint: invitation.inviterFingerprint,
            inviterDisplayName: invitation.inviterDisplayName,
          });
          setPhase("approved");
        } else if (r.expiresAt && new Date(r.expiresAt).getTime() < Date.now()) {
          clearInterval(interval);
          setPhase("expired");
        }
      } catch {
        // keep polling
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [phase, request, invitation, me]);

  // --- Action ---

  const onConnect = async () => {
    if (!me.$isLoaded || !invitation) return;
    setPhase("sending");
    try {
      const req = await createConnectionRequest(
        me as any,
        invitation.inviterAccountID,
        invitation.channel,
        {
          invitationID: invitation.$jazz?.id,
          expiresAt: invitation.expiresAt,
        },
      );
      setRequest(req);
      setPhase("sent");
    } catch (e) {
      setPhase("error");
      setErr(String(e));
    }
  };

  // --- Render ---

  if (phase === "loading") {
    return (
      <div className="p-6 text-text-2" data-testid="invite-loading">
        loading invite…
      </div>
    );
  }

  if (phase === "signin-required") {
    return (
      <div
        className="p-6 max-w-sm mx-auto flex flex-col items-center gap-3 text-center"
        data-testid="invite-signin-required"
      >
        <Lattice size={48} />
        <p className="text-text">Sign in to connect.</p>
        <Button
          variant="primary"
          onClick={() =>
            navigate(
              `/auth/login?next=${encodeURIComponent(
                window.location.pathname + window.location.hash,
              )}`,
            )
          }
        >
          sign in
        </Button>
      </div>
    );
  }

  if (phase === "expired") {
    return (
      <div
        className="p-6 max-w-sm mx-auto flex flex-col items-center gap-3 text-center"
        data-testid="invite-expired"
      >
        <Lattice size={48} mono />
        <p className="text-text">this invite has expired</p>
        {err && <p className="text-xs text-dim">{err}</p>}
        <Button variant="outline" onClick={() => navigate("/")}>
          go home
        </Button>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div
        className="p-6 max-w-sm mx-auto flex flex-col items-center gap-3 text-center"
        data-testid="invite-error"
      >
        <Lattice size={48} mono />
        <p className="text-text">couldn't load invite</p>
        {err && <p className="text-xs text-dim">{err}</p>}
        <Button variant="outline" onClick={() => navigate("/")}>
          go home
        </Button>
      </div>
    );
  }

  if (phase === "sending") {
    return (
      <div className="p-6 text-text-2" data-testid="invite-sending">
        sending request…
      </div>
    );
  }

  if (phase === "sent") {
    return (
      <div
        className="p-6 max-w-sm mx-auto flex flex-col items-center gap-3 text-center"
        data-testid="invite-sent"
      >
        <Lattice size={48} />
        <p className="text-text">request sent — waiting for approval…</p>
        <p className="text-xs text-dim">
          You can close this tab; you'll be notified when they accept.
        </p>
      </div>
    );
  }

  if (phase === "approved") {
    return (
      <div
        className="p-6 max-w-sm mx-auto flex flex-col items-center gap-3 text-center"
        data-testid="invite-approved"
      >
        <Lattice size={48} />
        <p className="text-text">contact added</p>
        <Button variant="primary" onClick={() => navigate("/")}>
          open Arcan
        </Button>
      </div>
    );
  }

  // phase === "confirm"
  const inv = invitation as any;
  return (
    <div
      className="p-6 max-w-sm mx-auto flex flex-col gap-4"
      data-testid="invite-confirm"
    >
      <h1 className="text-lg font-semibold text-text">
        connect with {inv.inviterDisplayName}?
      </h1>
      <p className="text-sm text-text-2" data-testid="invite-inviter-name">
        {inv.inviterDisplayName} wants to connect.
      </p>

      {shared.length > 0 && (
        <p className="text-xs text-arcan-accent">
          You're both in: {shared.map((s: any) => s.title).join(" · ")}
        </p>
      )}

      <details className="rounded-r-3 border border-hairline p-3 bg-panel">
        <summary className="cursor-pointer text-sm text-text">
          view security code
        </summary>
        <div className="mt-3">
          <SafetyNumber fingerprintHex={inv.inviterFingerprint} />
        </div>
        <p className="text-[11px] text-dim text-center mt-3">
          Compare in person to confirm it's really them.
        </p>
      </details>

      <div className="flex gap-2">
        <Button
          variant="primary"
          onClick={onConnect}
          className="flex-1"
          data-testid="invite-accept-btn"
        >
          connect
        </Button>
        <Button
          variant="outline"
          onClick={() => window.history.back()}
          className="flex-1"
          data-testid="invite-decline-btn"
        >
          cancel
        </Button>
      </div>
    </div>
  );
}
