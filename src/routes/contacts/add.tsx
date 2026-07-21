/**
 * AddContactRoute: unified "add a contact" screen.
 *
 * Wave C (Unit 10): container renders <AddContactScreen>. All data logic moved
 * verbatim. The QRDisplay, TTL state, and share/copy logic are the container's
 * responsibility; AddContactScreen is pure presentation.
 *
 * Route: /contacts/add
 */

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useUpNavigation } from "@/nav/use-up-navigation";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { QRDisplay } from "@/components/qr-display";
import { useToast } from "@/components/toast";
import { createInvitation, withQrChannelMarker, type LinkTtl } from "@/jazz/invitations";
import { AddContactScreen } from "@/ui/screens/add-contact-screen";

const TTL_PRESETS: LinkTtl[] = ["1h", "24h", "7d", "none"];

export function AddContactRoute() {
  const navigate = useNavigate();
  const goUp = useUpNavigation();
  const me = useAccount(ArcanAccount, {
    // liveInvitations is required so createInvitation() can push the
    // newly-created Invitation CoValue for surfacing on /connections/live-invites.
    resolve: { profile: true, root: { liveInvitations: { $each: true } } },
  });
  const toast = useToast();

  const [ttl, setTtl] = useState<LinkTtl>("24h");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  // Mirrors ScanInviteRoute.handleUrl: drop the pasted URL's origin — the
  // ?via marker + fragment are origin-independent CoValue IDs, so navigating
  // locally keeps the accept flow on this device's own origin.
  function handlePasteSubmit(value: string) {
    const trimmed = value.trim();
    if (!trimmed.includes("/invite")) {
      setPasteError("that doesn't look like an invite link");
      return;
    }
    try {
      const u = new URL(trimmed);
      setPasteError(null);
      navigate(`${u.pathname}${u.search}${u.hash}`);
    } catch {
      setPasteError("that doesn't look like an invite link");
    }
  }

  // Prevent double-creation (StrictMode double-invoke + rapid clicks).
  const creationInProgressRef = useRef(false);

  // FM10: invitations are minted LAZILY — on first QR reveal or share/copy,
  // never on mount. Each /contacts/add visit no longer leaks an
  // everyone-writer Invitation nobody ever saw.
  async function mintInvitation(nextTtl: LinkTtl): Promise<string | null> {
    if (creationInProgressRef.current) return null;
    creationInProgressRef.current = true;
    try {
      const { url } = await createInvitation(me as any, "link", nextTtl);
      setInviteUrl(url);
      return url;
    } catch {
      toast({ icon: "alert", text: "couldn't create invite — try again", tone: "error" });
      return null;
    } finally {
      creationInProgressRef.current = false;
    }
  }

  async function handleReveal() {
    if (!me.$isLoaded) return;
    setRevealed(true);
    if (!inviteUrl) await mintInvitation(ttl);
  }

  const accountID: string = (me as any)?.$jazz?.id ?? "";
  const idShort = accountID
    ? `${accountID.slice(0, 6)}…${accountID.slice(-3)}`
    : "";
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  const invitations = Array.from(
    ((me as any).root?.liveInvitations as Iterable<any>) ?? [],
  ).filter(Boolean);
  const nowMs = Date.now();
  const inviteCount = invitations.filter(
    (i: any) =>
      !i.revokedAt &&
      (!i.expiresAt || new Date(i.expiresAt).getTime() > nowMs),
  ).length;

  async function handlePrimary() {
    const url = inviteUrl ?? (await mintInvitation(ttl));
    if (!url) return;
    setRevealed(true);
    if (canShare) {
      try {
        await navigator.share({ url });
      } catch {
        // user cancelled the share sheet — no-op
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast({ icon: "copy", text: "invite link copied", tone: "accent" });
    }
  }

  return (
    <AddContactScreen
      onBack={() => goUp()}
      idShort={idShort}
      qrSlot={
        inviteUrl ? (
          <QRDisplay url={withQrChannelMarker(inviteUrl)} size={128} />
        ) : (
          <button
            type="button"
            onClick={() => void handleReveal()}
            data-testid="add-contact-reveal-btn"
            className="flex h-32 w-32 items-center justify-center rounded-r-2 border border-dashed border-hairline p-2 text-center font-body text-ui-sub text-dim hover:bg-panel-2"
          >
            tap to reveal QR
          </button>
        )
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
        // Re-mint immediately only if the QR is already revealed (the user
        // has shown intent); otherwise stay lazy (FM10).
        if (revealed) void mintInvitation(t as LinkTtl);
      }}
      primaryLabel={canShare ? "share invite" : "copy link"}
      onPrimary={() => void handlePrimary()}
      // Scan a contact-invite QR (/invite URLs) — NOT the device-pairing
      // responder, which only accepts /pair URLs (walkthrough fix, 2026-07-08).
      onScan={() => navigate("/contacts/scan")}
      onPasteSubmit={handlePasteSubmit}
      pasteError={pasteError}
      onManageInvites={() => navigate("/connections/live-invites")}
      inviteCount={inviteCount}
      // testid carries
      waitingCardTestId="add-contact-waiting"
      ttlPickerTestId="ttl-picker"
      shareBtnTestId="add-contact-share-btn"
      scanBtnTestId="scan-their-code"
      pasteBtnTestId="add-contact-cancel-btn"
    />
  );
}
