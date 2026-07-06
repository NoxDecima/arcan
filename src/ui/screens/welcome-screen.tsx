// src/ui/screens/welcome-screen.tsx — node-for-node port of design/proto.jsx:537–548.
// Rung 1 presenter: pure props in / JSX out; no Jazz, no router.
// Kit surface: AuthShell (proto 2-dot surface).

import type { JSX } from "react";
import { AuthShell, ArcanMark, PButton, MuteLink } from "@/ui/kit";

export function WelcomeScreen({
  onCreateAccount,
  onRestore,
  onSignIn,
  createTestId,
  restoreTestId,
  signInTestId,
}: {
  onCreateAccount: () => void;
  onRestore: () => void;
  onSignIn: () => void;
  createTestId?: string;
  restoreTestId?: string;
  signInTestId?: string;
}): JSX.Element {
  return (
    <AuthShell>
      {/* proto:541 — ArcanMark stacked, 64px */}
      <ArcanMark size={64} stacked />

      {/* proto:542 — tagline; v5 sysComment=true → keep "// " prefix */}
      <div className="font-body text-ui-empty-sub leading-normal text-text-2 text-center -mt-1">
        {"// local-first · end-to-end encrypted"}
      </div>

      {/* proto:543 — 8px spacer */}
      <div className="h-2" />

      {/* proto:544 — primary "create account" */}
      <PButton
        primary
        full
        label="create account"
        onClick={onCreateAccount}
        data-testid={createTestId}
      />

      {/* proto:545 — outline "restore from recovery code" */}
      <PButton
        full
        label="restore from recovery code"
        onClick={onRestore}
        data-testid={restoreTestId}
      />

      {/* proto:546 — "already on a device? sign in" row; flex+explicit font-size on button
          locks the button's strut to 10.5px×1 (same as proto), avoiding Tailwind
          preflight line-height:1.5 inflating the button height vs the proto gallery. */}
      <div className="flex justify-center items-center mt-0.5">
        <MuteLink>already on a device? </MuteLink>
        <button
          className="text-ui-sub leading-none p-0 m-0 cursor-pointer [-webkit-tap-highlight-color:transparent]"
          onClick={onSignIn}
          data-testid={signInTestId}
        >
          <MuteLink accent>sign in</MuteLink>
        </button>
      </div>
    </AuthShell>
  );
}
