/**
 * AddContactRoute: unified "add a contact" screen.
 *
 * Top half: your invite QR code + copy/share + 1h/24h/7d duration picker.
 * Bottom half: scan their code + paste a link.
 *
 * A fresh Invitation CoValue is created (or regenerated) whenever the
 * selected TTL changes. The QR code and copy/share buttons always reflect
 * the current invitation URL.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { QRDisplay } from "@/components/qr-display";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { createInvitation, withQrChannelMarker, type LinkTtl } from "@/jazz/invitations";

const TTL_PRESETS: LinkTtl[] = ["1h", "24h", "7d"];

export function AddContactRoute() {
  const navigate = useNavigate();
  const me = useAccount(ArcanAccount, {
    // liveInvitations is required so createInvitation() can push the
    // newly-created Invitation CoValue for surfacing on
    // /connections/live-invites. Caught during Unit 8 Phase C-2 (NEW-002)
    // — the silent push-skip meant generated invites never showed up in
    // the management screen.
    resolve: { profile: true, root: { liveInvitations: true } },
  });
  const toast = useToast();

  const [ttl, setTtl] = useState<LinkTtl>("24h");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  // Prevent double-creation in React StrictMode double-invoke
  const creationInProgressRef = useRef(false);

  // Re-create invitation when ttl changes (or on first load)
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
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="p-6 max-w-md mx-auto flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-text">add a contact</h1>
      <p className="text-sm text-text-2">share your code so people can add you</p>

      {/* Your code card */}
      <section
        className="rounded-r-3 border border-hairline bg-panel p-4 flex flex-col items-center gap-3"
        data-testid="add-contact-waiting"
      >
        <p className="text-[10px] uppercase tracking-widest text-dim font-semibold">
          your code
        </p>

        {/* The QR encodes the ?via=qr-marked URL so a scan mints a
            channel="qr" request (→ live pop-up); copy/share use the plain
            URL below (→ channel="link", silent on pending). */}
        {inviteUrl && <QRDisplay url={withQrChannelMarker(inviteUrl)} size={140} />}
        {/* Audit / e2e hooks: invisible URL strings for Playwright extraction.
            qr-url-text = what the QR encodes (marked); copy-url-text = what
            copy/share yields (plain). sr-only = invisible to sighted users. */}
        {inviteUrl && (
          <span data-testid="qr-url-text" className="sr-only">
            {withQrChannelMarker(inviteUrl)}
          </span>
        )}
        {inviteUrl && (
          <span data-testid="copy-url-text" className="sr-only">
            {inviteUrl}
          </span>
        )}

        {accountID && (
          <p className="text-xs text-dim font-mono">
            {accountID.slice(0, 6)}…{accountID.slice(-3)}
          </p>
        )}

        {/*
          Unit 9-7 §2-J: one adaptive action.
          Mobile (navigator.share present) → native share sheet ("share invite").
          Desktop → clipboard copy + toast ("copy link").
        */}
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
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
          }}
          data-testid="add-contact-share-btn"
        >
          {canShare ? "share invite" : "copy link"}
        </Button>

        {/* TTL picker */}
        <div className="w-full flex items-center justify-between gap-2 pt-2 border-t border-hairline mt-2">
          <span className="text-xs text-text-2">link valid for</span>
          <div
            className="flex gap-1 p-0.5 rounded-pill bg-bg border border-hairline"
            data-testid="ttl-picker"
          >
            {TTL_PRESETS.map((t) => {
              const active = ttl === t;
              return (
                <button
                  key={t}
                  className={`px-3 py-1 rounded-pill text-xs font-semibold transition-colors ${
                    active ? "bg-arcan-accent text-on-accent" : "text-text-2"
                  }`}
                  onClick={() => {
                    setInviteUrl(null);
                    setTtl(t);
                  }}
                  data-testid={`ttl-${t}`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="flex items-center gap-2 my-2">
        <div className="flex-1 h-px bg-hairline" />
        <span className="text-[10px] uppercase tracking-widest text-dim font-semibold">
          add someone
        </span>
        <div className="flex-1 h-px bg-hairline" />
      </div>

      <Button
        variant="primary"
        onClick={() => navigate("/pair?role=responder")}
        data-testid="scan-their-code"
      >
        scan their code
      </Button>

      <button
        className="text-xs text-arcan-accent self-center"
        onClick={() => {
          const url = prompt("paste invite link");
          if (url) {
            window.location.assign(url);
          }
        }}
        data-testid="add-contact-cancel-btn"
      >
        or paste a link
      </button>
    </div>
  );
}
