// src/ui/screens/restore-screen.tsx — port of design/hf-flows.jsx:160–180 (ScRestore) chrome.
// Rung 2 (advisory parity): app keeps the textarea IA instead of the hf 24-slot word grid.
// Structural divergence: hf shows per-word inputs + "paste code" button;
// the app uses a single textarea (restore logic depends on it; 24-slot would rearchitect the
// flow — out of scope). Parity cell is advisory (renders both for visual review; never fails).
// Pure presenter: props in / JSX out; no Jazz, no router.

import type { ReactNode, JSX } from "react";
import { AuthSurface, AuthTitle, AuthSub, AuthField, PButton, MuteLink, ArcanMark } from "@/ui/kit";

export function RestoreScreen({
  code,
  onCode,
  onRestore,
  onBack,
  restoring,
  errorSlot,
  codeTestId,
  restoreTestId,
}: {
  /** Textarea value — the pasted/typed 24-word code. */
  code: string;
  onCode: (v: string) => void;
  onRestore: () => void;
  /** When present, renders a two-button back+restore footer (live). */
  onBack?: () => void;
  /** Shows "restoring…" on the primary button while in flight. */
  restoring: boolean;
  /** Rung-4: error line rendered by the container. */
  errorSlot?: ReactNode;
  /** data-testid for the textarea; default "restore-passphrase-input". */
  codeTestId?: string;
  /** data-testid for the restore button; default "restore-btn". */
  restoreTestId?: string;
}): JSX.Element {
  return (
    // USER DECISION 2026-07-06 (walkthrough): `tall` removed — restore content
    // (ArcanMark + title + sub + textarea + buttons + footer) fits within a
    // standard viewport; `tall` caused top-pinning + unwanted scroll. Only
    // the 24-word backup-display screen (genuinely tall) keeps `tall`.
    <AuthSurface w={376}>
      {/* hf:164 — Wordmark size=20; Wordmark=ArcanMark×2.1 → stacked size=42 */}
      <div className="flex justify-center">
        <ArcanMark stacked size={42} />
      </div>
      {/* hf:165 — title */}
      <AuthTitle>restore your account</AuthTitle>
      {/* hf:166 — sub */}
      <AuthSub>paste your 24-word code, or type each word</AuthSub>
      {/* app IA: textarea (structural divergence from hf 24-slot grid — advisory parity) */}
      <AuthField
        as="textarea"
        rows={4}
        label="recovery code"
        mono
        value={code}
        onChange={onCode}
        placeholder="word1 word2 … word24"
        autoFocus
        spellCheck={false}
        autoComplete="off"
        inputTestId={codeTestId}
      />
      {errorSlot}
      {/* hf:178 — restore → / restoring… button; onBack present → two-button row (live) */}
      {onBack ? (
        <div className="flex gap-3">
          <div className="flex-1">
            <PButton full label="back" onClick={onBack} type="button" />
          </div>
          <div className="flex-1">
            <PButton
              primary
              full
              label={restoring ? "restoring…" : "restore →"}
              onClick={onRestore}
              data-testid={restoreTestId}
            />
          </div>
        </div>
      ) : (
        <PButton
          primary
          full
          label={restoring ? "restoring…" : "restore →"}
          onClick={onRestore}
          data-testid={restoreTestId}
        />
      )}
      {/* hf:179 — mute footer */}
      <div className="text-center">
        <MuteLink>keys live on your device — no server reset</MuteLink>
      </div>
    </AuthSurface>
  );
}
