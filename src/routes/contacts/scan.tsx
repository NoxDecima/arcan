import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { QRScanner } from "@/qr/scanner";
import { PHeader } from "@/ui/kit";

/**
 * ScanInviteRoute: in-app scanner for contact-invite QR codes (/invite URLs).
 *
 * Route: /contacts/scan
 *
 * Walkthrough fix (user decision, 2026-07-08): the add-contact "scan their
 * code" button previously navigated to /pair?role=responder — the
 * device-pairing responder — whose scanner only accepts /pair URLs and
 * silently ignored contact-invite QRs. This route scans for /invite URLs and
 * re-enters the accept flow locally.
 *
 * The scanned URL's origin is deliberately dropped: a QR carries the
 * inviter's origin, which may be unreachable from this device (e.g. a
 * localhost dev origin). The ?via=qr marker + fragment are origin-independent
 * CoValue IDs, so navigating locally keeps the accept flow on this device's
 * own origin.
 */
export function ScanInviteRoute() {
  const navigate = useNavigate();

  const handleUrl = useCallback(
    (url: string) => {
      try {
        const u = new URL(url);
        navigate(`${u.pathname}${u.search}${u.hash}`);
      } catch {
        // Unreachable in practice: QRScanner only forwards URLs containing
        // the /invite prefix; a non-URL payload would not include it.
      }
    },
    [navigate],
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="w-full max-w-[600px] mx-auto flex flex-col">
        <PHeader
          title="scan their QR code"
          onBack={() => navigate(-1)}
          backTestId="scan-invite-back"
        />
        <div className="px-4 py-4">
          <QRScanner onUrl={handleUrl} expectedPathPrefix="/invite" />
        </div>
      </div>
    </div>
  );
}
