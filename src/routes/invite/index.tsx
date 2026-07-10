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
 * TOFU pinning: the inviter's safety number is shown in a collapsible section
 * for out-of-band verification.
 *
 * ALL phase logic + the pending-invite-fragment sessionStorage stash +
 * openedChannel capture + the approval poll + writeInviterAsContact are
 * kept verbatim. Only the render tree swaps to kit presenters.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount, useIsAuthenticated } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { ConnectionRequest } from "@/jazz/schema/ConnectionRequest";
import { SafetyNumber } from "@/components/safety-number";
import { HAv } from "@/ui/kit/hav";
import { useAccountAvatars } from "@/components/use-account-avatars";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import {
  parseInvitationURL,
  loadInvitationAsGuest,
  createConnectionRequest,
  readInviteChannel,
} from "@/jazz/invitations";
import {
  ContactRequestScreen,
  InviteStatusScreen,
} from "@/ui/screens";
import type { ContactRequestVM } from "@/ui/screens/auth-types";

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
  // Captured at mount so it survives a sign-in round-trip: a QR-scanned
  // URL carries ?via=qr; a pasted/shared link does not. Drives the
  // ConnectionRequest channel (qr → live pop-up; link → silent pending).
  const [openedChannel] = useState<"qr" | "link">(() =>
    typeof window !== "undefined"
      ? readInviteChannel(window.location.search)
      : "link",
  );

  // Security code expansion state (new in T6 — replaces <details> with
  // the ContactRequestScreen's controlled expandable cluster).
  const [securityOpen, setSecurityOpen] = useState(false);

  const shared = useSharedGroups(invitation?.inviterAccountID ?? "");
  const inviterAvatarMap = useAccountAvatars(
    me,
    invitation?.inviterAccountID ? [invitation.inviterAccountID] : [],
  );

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
          // Stash the invite fragment so the post-auth flow can replay it: the
          // login screen, the onboarding profile step, and recovery all read
          // `pending-invite-fragment` and re-open `/invite#…` after the user
          // authenticates. (The pre-9-7 InviteRoute stashed here; the rework
          // dropped it, orphaning those readers — restored.)
          try {
            sessionStorage.setItem(
              "pending-invite-fragment",
              window.location.hash,
            );
          } catch {
            // sessionStorage unavailable — degrade to no replay.
          }
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
        // Channel reflects how THIS recipient opened the invite (scanned QR
        // vs pasted link), not how the invitation was minted — the same
        // invitation is shared through both channels.
        openedChannel,
        {
          invitationID: invitation.$jazz?.id,
          // Permanent invites (no expiresAt) still mint expiring requests so
          // the pending-list timeout logic works. Fall back to 30 days.
          expiresAt: invitation.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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

  return (
    <div className="h-screen w-screen flex flex-col">
      {renderPhase()}
    </div>
  );

  function renderPhase() {
    if (phase === "loading") {
      return (
        <InviteStatusScreen
          markSize={48}
          title="loading invite…"
          rootTestId="invite-loading"
        />
      );
    }

    if (phase === "signin-required") {
      return (
        <InviteStatusScreen
          markSize={48}
          title="sign in to connect"
          rootTestId="invite-signin-required"
          primary={{
            label: "sign in",
            onClick: () =>
              navigate(
                `/auth/login?next=${encodeURIComponent(
                  window.location.pathname + window.location.hash,
                )}`,
              ),
          }}
        />
      );
    }

    if (phase === "expired") {
      return (
        <InviteStatusScreen
          markSize={48}
          title="this invite has expired"
          sub={err ?? undefined}
          rootTestId="invite-expired"
          outline={{
            label: "go home",
            onClick: () => navigate("/"),
          }}
        />
      );
    }

    if (phase === "error") {
      return (
        <InviteStatusScreen
          markSize={48}
          title="couldn't load invite"
          sub={err ?? undefined}
          rootTestId="invite-error"
          outline={{
            label: "go home",
            onClick: () => navigate("/"),
          }}
        />
      );
    }

    if (phase === "sending") {
      return (
        <InviteStatusScreen
          markSize={48}
          title="sending request…"
          rootTestId="invite-sending"
        />
      );
    }

    if (phase === "sent") {
      return (
        <InviteStatusScreen
          markSize={48}
          title="request sent — waiting for approval…"
          sub="You can close this tab; you'll be notified when they accept."
          rootTestId="invite-sent"
          outline={{ label: "back to app", onClick: () => navigate("/") }}
          outlineTestId="invite-sent-home-btn"
        />
      );
    }

    if (phase === "approved") {
      return (
        <InviteStatusScreen
          markSize={48}
          title="contact added"
          rootTestId="invite-approved"
          primary={{
            label: "open Arcan",
            onClick: () => navigate("/"),
          }}
        />
      );
    }

    // phase === "confirm"
    const inv = invitation as any;
    const vm: ContactRequestVM = {
      name: inv?.inviterDisplayName ?? "",
      initials: (inv?.inviterDisplayName ?? "?")?.[0] ?? "?",
      idShort: "",
    };

    const avatarSlot = (
      <HAv
        txt={vm.initials}
        src={inviterAvatarMap.get(inv?.inviterAccountID ?? "")}
        size={96}
      />
    );

    const sharedSlot =
      shared.length > 0 ? (
        <p className="text-center text-xs text-arcan-accent">
          you're both in: {shared.map((s: any) => s.title).join(" · ")}
        </p>
      ) : undefined;

    const safetySlot = inv?.inviterFingerprint ? (
      <SafetyNumber fingerprintHex={inv.inviterFingerprint} />
    ) : undefined;

    return (
      <ContactRequestScreen
        vm={vm}
        avatarSlot={avatarSlot}
        sharedSlot={sharedSlot}
        securityOpen={securityOpen}
        onToggleSecurity={() => setSecurityOpen((o) => !o)}
        safetySlot={safetySlot}
        onAccept={onConnect}
        onDecline={() => navigate("/")}
        acceptLabel="request to become contacts"
        declineLabel="cancel"
        rootTestId="invite-confirm"
        nameTestId="invite-inviter-name"
        avatarTestId="invite-inviter-avatar"
        acceptTestId="invite-accept-btn"
        declineTestId="invite-decline-btn"
      />
    );
  }
}
