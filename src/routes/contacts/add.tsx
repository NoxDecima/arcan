/**
 * AddContactRoute: unified "add a contact" screen.
 *
 * Wave C (Unit 10): container renders <AddContactScreen>. All data logic moved
 * verbatim. The QRDisplay, TTL state, and share/copy logic are the container's
 * responsibility; AddContactScreen is pure presentation.
 *
 * Route: /contacts/add
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { QRDisplay } from "@/components/qr-display";
import { useToast } from "@/components/toast";
import { createInvitation, withQrChannelMarker, type LinkTtl } from "@/jazz/invitations";
import { AddContactScreen } from "@/ui/screens/add-contact-screen";

const TTL_PRESETS: LinkTtl[] = ["1h", "24h", "7d"];

export function AddContactRoute() {
  const navigate = useNavigate();
  const me = useAccount(ArcanAccount, {
    // liveInvitations is required so createInvitation() can push the
    // newly-created Invitation CoValue for surfacing on /connections/live-invites.
    resolve: { profile: true, root: { liveInvitations: true } },
  });
  const toast = useToast();

  const [ttl, setTtl] = useState<LinkTtl>("24h");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  // Prevent double-creation in React StrictMode double-invoke.
  const creationInProgressRef = useRef(false);

  // Re-create invitation when ttl changes (or on first load).
  useEffect(() => {
    if (!me.$isLoaded) return;
    if (creationInProgressRef.current) return;
    creationInProgressRef.current = true;

    createInvitation(me as any, "link", ttl)
      .then(({ url }) => {
        setInviteUrl(url);
      })
      .catch(() => {
        // swallow — user can retry by toggling TTL
      })
      .finally(() => {
        creationInProgressRef.current = false;
      });
  }, [me.$isLoaded, ttl]); // eslint-disable-line react-hooks/exhaustive-deps

  const accountID: string = (me as any)?.$jazz?.id ?? "";
  const idShort = accountID
    ? `${accountID.slice(0, 6)}…${accountID.slice(-3)}`
    : "";
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  async function handlePrimary() {
    if (!inviteUrl) return;
    if (canShare) {
      try {
        await navigator.share({ url: inviteUrl });
      } catch {
        // user cancelled the share sheet — no-op
      }
    } else {
      await navigator.clipboard.writeText(inviteUrl);
      toast({ icon: "copy", text: "invite link copied", tone: "accent" });
    }
  }

  return (
    <AddContactScreen
      onBack={() => navigate(-1)}
      idShort={idShort}
      qrSlot={
        inviteUrl ? (
          <QRDisplay url={withQrChannelMarker(inviteUrl)} size={128} />
        ) : undefined
      }
      hiddenUrlSlot={
        inviteUrl ? (
          <>
            <span data-testid="qr-url-text" className="sr-only">
              {withQrChannelMarker(inviteUrl)}
            </span>
            <span data-testid="copy-url-text" className="sr-only">
              {inviteUrl}
            </span>
          </>
        ) : undefined
      }
      ttl={ttl}
      ttlOptions={TTL_PRESETS}
      onTtl={(t) => {
        setInviteUrl(null);
        setTtl(t as LinkTtl);
      }}
      primaryLabel={canShare ? "share invite" : "copy link"}
      onPrimary={() => void handlePrimary()}
      // Scan a contact-invite QR (/invite URLs) — NOT the device-pairing
      // responder, which only accepts /pair URLs (walkthrough fix, 2026-07-08).
      onScan={() => navigate("/contacts/scan")}
      onPaste={() => {
        const url = prompt("paste invite link");
        if (url) {
          window.location.assign(url);
        }
      }}
      // testid carries
      waitingCardTestId="add-contact-waiting"
      ttlPickerTestId="ttl-picker"
      shareBtnTestId="add-contact-share-btn"
      scanBtnTestId="scan-their-code"
      pasteBtnTestId="add-contact-cancel-btn"
    />
  );
}
