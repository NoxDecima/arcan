/**
 * InviteRoute: requester confirmation screen — a pure VIEW of watcher-owned
 * durable handshake state.
 *
 * Phases: loading → confirm (or expired / error) → signin-required
 *         → sending → sent
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
 * The 3-second approval poll and the writeInviterAsContact helper are GONE
 * (contact-robustness Task 8): the screen writes NOTHING contact-related.
 * Connect goes through sendConnectionRequest (durable-intent-first, invitation
 * re-validated at click time), and every post-send state — sending / delivered
 * / failed-will-retry / approved / declined / expired — renders from the
 * me.root.outgoingRequests entry that the app-level useOutgoingRequestWatcher
 * owns and transitions. Local phase only marks that the action finished.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount, useIsAuthenticated } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { SafetyNumber } from "@/components/safety-number";
import { HAv } from "@/ui/kit/hav";
import { useAccountAvatars } from "@/components/use-account-avatars";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import {
  parseInvitationURL,
  loadInvitationAsGuest,
  readInviteChannel,
} from "@/jazz/invitations";
import { sendConnectionRequest, getContact, withTimeout, REQUEST_ACK_TIMEOUT_MS } from "@/jazz/handshake";
import {
  ContactRequestScreen,
  InviteStatusScreen,
} from "@/ui/screens";
import type { ContactRequestVM } from "@/ui/screens/auth-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase =
  | "loading"
  | "signin-required"
  | "confirm"
  | "sending"
  | "sent"
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
      root: {
        // $onError: "catch" at $each levels (Task 6 review amendment): one
        // unavailable child must not stall the whole resolve.
        contacts: { $each: { $onError: "catch" } },
        outgoingRequests: { $each: { request: true, $onError: "catch" } },
      },
    },
  });

  const [phase, setPhase] = useState<Phase>("loading");
  const [err, setErr] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<any | null>(null);
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

  // Durable handshake state (watcher-owned) — the screen is a VIEW of it.
  const inviterID: string | undefined = invitation?.inviterAccountID;
  const isContact =
    me.$isLoaded && inviterID ? !!getContact(me, inviterID) : false;
  const outEntry: any =
    me.$isLoaded && inviterID
      ? (me as any).root?.outgoingRequests?.[inviterID]
      : undefined;
  const connectBusyRef = useRef(false);

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

  // --- Action ---

  const onConnect = async () => {
    // In-flight guard (FM1): a double-tap must not mint twice.
    if (!me.$isLoaded || !invitation || connectBusyRef.current) return;
    connectBusyRef.current = true;
    setPhase("sending");
    try {
      // Re-validate at Connect time — a parked confirm screen can outlive
      // revocation/expiry (inventory §5); the mount-time check is not enough.
      // Bounded by REQUEST_ACK_TIMEOUT_MS (15 s) — same constant as delivery
      // — to prevent an unbounded await stalling the handshake flow (#54).
      const fresh = (await withTimeout(
        loadInvitationAsGuest(invitation.$jazz.id),
        REQUEST_ACK_TIMEOUT_MS,
      )) as any;
      if (fresh.revokedAt) {
        setPhase("expired");
        setErr("invite revoked");
        return;
      }
      if (
        fresh.expiresAt &&
        new Date(fresh.expiresAt).getTime() < Date.now()
      ) {
        setPhase("expired");
        return;
      }

      const result = await sendConnectionRequest(
        me as any,
        {
          accountID: invitation.inviterAccountID,
          fingerprint: invitation.inviterFingerprint,
          displayName: invitation.inviterDisplayName,
        },
        {
          channel: "invite",
          // Channel reflects how THIS recipient opened the invite (scanned
          // QR vs pasted link) — the same invitation serves both.
          requestChannel: openedChannel,
          invitationID: invitation.$jazz?.id,
          invitationExpiresAt: invitation.expiresAt
            ? new Date(invitation.expiresAt)
            : undefined,
        },
      );
      if (result.outcome === "unavailable") {
        setPhase("error");
        setErr("account not ready — try again");
        return;
      }
      // "already-contact" renders from isContact; every send outcome
      // ("sent" / "already-pending" / "send-failed") renders from the
      // durable entry. Local phase only marks that we finished the action.
      setPhase("sent");
    } catch (e) {
      setPhase("error");
      const msg = String(e);
      setErr(
        msg.includes("timed out")
          ? "couldn't verify the invite — check your connection and try again"
          : msg,
      );
    } finally {
      connectBusyRef.current = false;
    }
  };

  // --- Render ---

  return (
    <div className="h-app w-app flex flex-col">
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

    // ── Durable-entry-driven states (watcher-owned) ──────────────────────
    const entryLive =
      outEntry &&
      !outEntry.archivedAt &&
      (outEntry.status === "pending" || outEntry.status === "failed");

    if (phase === "sent" || (phase === "confirm" && entryLive)) {
      // Terminal states first — the watcher may have transitioned the entry
      // while this screen sat open.
      if (outEntry?.status === "approved" || (phase === "sent" && isContact)) {
        return (
          <InviteStatusScreen
            markSize={48}
            title="contact added"
            rootTestId="invite-approved"
            primary={{ label: "open Arcan", onClick: () => navigate("/") }}
          />
        );
      }
      if (outEntry?.status === "denied") {
        return (
          <InviteStatusScreen
            markSize={48}
            title="request declined"
            sub="they declined your request."
            rootTestId="invite-declined"
            outline={{ label: "back to app", onClick: () => navigate("/") }}
            outlineTestId="invite-declined-home-btn"
          />
        );
      }
      if (outEntry?.status === "expired") {
        return (
          <InviteStatusScreen
            markSize={48}
            title="this request has expired"
            rootTestId="invite-expired"
            outline={{ label: "go home", onClick: () => navigate("/") }}
          />
        );
      }
      // Honest delivery states (spec §6): delivered only after the Inbox
      // end-to-end ack; failed announces the automatic retry.
      const sub =
        outEntry?.status === "failed"
          ? "couldn't deliver yet — we'll retry automatically. you can close this tab."
          : outEntry?.deliveredAt
            ? "delivered. you can close this tab — the contact appears once they accept."
            : "sending…";
      return (
        <InviteStatusScreen
          markSize={48}
          title="request sent — waiting for approval…"
          sub={sub}
          rootTestId="invite-sent"
          outline={{ label: "back to app", onClick: () => navigate("/") }}
          outlineTestId="invite-sent-home-btn"
        />
      );
    }

    // Already connected (FM8): no silent re-mint from a parked/permanent link.
    if (phase === "confirm" && isContact) {
      return (
        <InviteStatusScreen
          markSize={48}
          title="you're already contacts"
          sub={invitation?.inviterDisplayName ?? undefined}
          rootTestId="invite-already-contact"
          primary={{ label: "open Arcan", onClick: () => navigate("/") }}
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
        // Gate the CTA on the account graph being loaded. The confirm screen
        // renders from the GUEST invitation load and can appear before `me`
        // resolves (contacts + outgoingRequests deep resolve — slower once the
        // account has prior handshakes); onConnect silently no-ops on an
        // unloaded account, so an enabled button here would EAT the tap and
        // strand the user (and the e2e helper) on a confirm screen that never
        // advances. Disabled-until-loaded makes the early tap impossible
        // instead of silently dropped.
        acceptDisabled={!me.$isLoaded}
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
