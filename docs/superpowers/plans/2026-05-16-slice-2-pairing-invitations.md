# Jazz Messanger E1a — Slice 2: QR Pairing + Contact Invitations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can pair a new device to an existing account via QR (or pasted URL), and two accounts can establish mutual contact via an invite link (or QR). Real Ed25519 pubkey extraction replaces the Slice 1 safety-number placeholder; real session-key-derived `sessionFingerprint` replaces the `crypto.randomUUID()` placeholder.

**Architecture:** Two protocols sharing the same Jazz invite-agent pattern (writerInvite role on an ephemeral one-shot group, secret in URL fragment). Pairing uses a new `EphemeralPairing` CoValue with sealed-box account-secret transfer. Contact invitations use the existing `Invitation` schema from Slice 1. Routing migrates from state machine to `react-router-dom` to handle `/pair#…` and `/invite#…` deep links.

**Tech Stack:** Continuing React 18 + Vite + TypeScript + Tailwind v3 + shadcn/ui + jazz-tools 0.20.18. New deps: `react-router-dom`, `qrcode.react`, `qr-scanner` (or equivalent — verify in Task 1).

**Slice scope reminder:** This slice ends when (a) a fresh browser context can pair as a second device of an existing account via paste or QR, and (b) two different accounts can establish mutual contact via invite link or QR. **Conversation creation is explicitly out of scope** — `Contact.linkedConversation` stays null after acceptance; Slice 3 wires conversations on-demand.

**Authoritative spec:** `docs/superpowers/specs/2026-05-16-slice-2-pairing-invitations-design.md`
**Companion docs:** `docs/security/threat-model.md`, `docs/jazz-api-notes.md`

---

## Important notes for the executor

1. **Read the spec first.** Sections 4, 5, 6, 8 of `docs/superpowers/specs/2026-05-16-slice-2-pairing-invitations-design.md` are the protocol-level ground truth. Where this plan differs, the spec wins.

2. **Three API-discovery risks (spec §11).** If any of these turn out not to be exposed by jazz-tools 0.20.18 — (a) extracting account Ed25519 pubkey hex, (b) deriving stable session signing-key fingerprint, (c) logging in via a raw account secret rather than a passphrase — **dispatch a focused research subagent** using the same pattern as the Slice 1 jazz-tools API survey at `docs/jazz-api-notes.md`. Update that doc with findings. Do not invent APIs.

3. **Existing tests must keep passing.** After every routing change (Phase A) and after every modification to existing files, re-run `npm test` and `npm run test:e2e`. The Slice 1 specs cover account creation, persistence, and restore — if any break, fix before continuing.

4. **No conversations.** Where the spec or this plan mentions `Conversation`, it's only in the context of the `linkedConversation` optional field on Contact (which stays null in Slice 2). Do not create Conversation CoValues, ConversationGroups, or per-author WriteGroups in this slice.

5. **The pairing and invitation protocols share an "invite-agent" pattern.** Both use a Jazz `Group` with the inviter/initiator as `admin` and an ephemeral agent as `writerInvite`. The ephemeral agent's secret travels in the URL fragment. The receiving party authenticates as that agent to gain read access. This commonality should drive shared helpers — but don't over-abstract; only DRY-up if both implementations actually share code mechanically.

---

## File structure after Slice 2

```
src/
├── App.tsx                                  # MODIFIED — router-based, replaces state machine
├── auth/
│   ├── fingerprint.ts                       # (unchanged)
│   ├── passphrase.ts                        # (unchanged)
│   ├── pubkey.ts                            # NEW — extract Ed25519 pubkey hex from account
│   └── session.ts                           # NEW — derive session fingerprint
├── components/
│   ├── empty-state.tsx                      # (unchanged)
│   ├── safety-number.tsx                    # (unchanged)
│   ├── sidebar.tsx                          # MODIFIED — Add contact button + real contact list
│   ├── qr-display.tsx                       # NEW — wraps qrcode.react for QR rendering
│   └── ui/
│       └── button.tsx                       # (unchanged)
├── jazz/
│   ├── provider.tsx                         # (unchanged)
│   ├── pairing.ts                           # NEW — pairing protocol primitives
│   ├── invitations.ts                       # NEW — invitation protocol primitives
│   └── schema/
│       ├── Contact.ts                       # MODIFIED — add linkedConversation field
│       ├── Conversation.ts                  # (unchanged)
│       ├── DeviceRecord.ts                  # (unchanged)
│       ├── EphemeralPairing.ts              # NEW — pairing handshake CoValue
│       ├── FileBlob.ts                      # (unchanged)
│       ├── Invitation.ts                    # (unchanged — Slice 1 schema reused)
│       ├── JazzMessangerAccount.ts          # MODIFIED — real sessionFingerprint
│       ├── Message.ts                       # (unchanged)
│       └── Profile.ts                       # (unchanged)
├── lib/
│   └── utils.ts                             # (unchanged)
├── main.tsx                                 # MODIFIED — wrap with BrowserRouter
├── qr/
│   └── scanner.tsx                          # NEW — camera scanner + paste fallback
└── routes/
    ├── contacts/
    │   ├── add.tsx                          # NEW — issue invite UI
    │   └── detail.tsx                       # NEW — contact detail (display name, safety number, remove)
    ├── home/
    │   └── index.tsx                        # (unchanged content; rendered via router)
    ├── invite/
    │   └── index.tsx                        # NEW — accept/decline invite handler
    ├── onboarding/                          # (unchanged Slice 1 components)
    │   ├── index.tsx                        # MODIFIED — on success, replay stashed /invite#… if present
    │   ├── passphrase-confirm-step.tsx
    │   ├── passphrase-display-step.tsx
    │   ├── profile-step.tsx
    │   ├── restore-step.tsx
    │   └── welcome-step.tsx
    ├── pair/
    │   ├── index.tsx                        # NEW — route handler (initiator vs responder)
    │   ├── initiator-step.tsx               # NEW — show QR + waiting + approval
    │   └── responder-step.tsx               # NEW — camera + paste + confirm + finish
    └── settings/
        ├── account-section.tsx              # MODIFIED — use real pubkey via pubkey.ts
        ├── devices-section.tsx              # MODIFIED — add "Link new device" button
        ├── index.tsx                        # MODIFIED — wire invites section
        ├── invites-section.tsx              # NEW — pending invites list
        └── profile-section.tsx              # (unchanged)

tests/
├── e2e/
│   ├── account-creation.spec.ts             # (unchanged Slice 1)
│   ├── account-persistence.spec.ts          # (unchanged Slice 1)
│   ├── contact-invitation.spec.ts           # NEW
│   ├── device-pairing.spec.ts               # NEW
│   ├── helpers.ts                           # MODIFIED — add helpers for new flows
│   ├── invite-before-signin.spec.ts         # NEW
│   └── restore-account.spec.ts              # (unchanged Slice 1)
└── unit/
    ├── auth/
    │   ├── fingerprint.test.ts              # (unchanged)
    │   ├── passphrase.test.ts               # (unchanged)
    │   ├── pubkey.test.ts                   # NEW
    │   └── session.test.ts                  # NEW
    ├── components/
    │   ├── empty-state.test.tsx             # (unchanged)
    │   └── safety-number.test.tsx           # (unchanged)
    ├── jazz/
    │   ├── invitations.test.ts              # NEW
    │   ├── pairing.test.ts                  # NEW
    │   └── schema/
    │       ├── Contact.test.ts              # (unchanged)
    │       ├── Conversation.test.ts         # (unchanged)
    │       ├── DeviceRecord.test.ts         # (unchanged)
    │       ├── EphemeralPairing.test.ts     # NEW
    │       ├── FileBlob.test.ts             # (unchanged)
    │       ├── Invitation.test.ts           # (unchanged)
    │       ├── JazzMessangerAccount.test.ts # (unchanged)
    │       ├── Message.test.ts              # (unchanged)
    │       └── Profile.test.ts              # (unchanged)
    └── sanity.test.ts                       # (unchanged)
```

---

## Task list

Tasks are organized into six phases. The phases are an execution hint — subagent-driven execution should batch trivial phases (A, B, C, F) into single subagent dispatches and run heavier phases (D, E) per-task.

---

## Phase A — Dependencies + Routing Migration

### Task 1: Install Slice 2 npm dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install runtime deps**

```bash
npm install --save-exact react-router-dom qrcode.react
```

- [ ] **Step 2: Install QR scanner library**

There are several reasonable choices; check availability and prefer a maintained, MIT-licensed option that supports WebWorker decoding:

```bash
npm view qr-scanner version
npm view @yudiel/react-qr-scanner version
```

Install one. The implementation in Task 11 assumes the `qr-scanner` (nimiq) API. If you pick a different package, adapt the scanner component accordingly.

```bash
npm install --save-exact qr-scanner
```

- [ ] **Step 3: Verify types resolve**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install react-router-dom, qrcode.react, qr-scanner"
```

---

### Task 2: Migrate App.tsx from state machine to react-router-dom

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

The Slice 1 `App.tsx` uses a `view: "home" | "settings"` state machine. Replace with `react-router-dom`. Preserve the auth gate (`if (!me) return <OnboardingRoute />`).

- [ ] **Step 1: Wrap app in BrowserRouter**

Modify `src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { MessangerProvider } from "./jazz/provider.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MessangerProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MessangerProvider>
  </StrictMode>
);
```

- [ ] **Step 2: Rewrite App.tsx with Routes**

```tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { OnboardingRoute } from "@/routes/onboarding";
import { HomeRoute } from "@/routes/home";
import { SettingsRoute } from "@/routes/settings";

export default function App() {
  const me = useAccount(JazzMessangerAccount);

  // /pair#… is allowed without auth (responder is becoming the account).
  // /invite#… without auth is handled by OnboardingRoute (which checks
  // sessionStorage on success and replays).
  if (!me?.$isLoaded) {
    return <OnboardingRoute />;
  }

  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/settings/*" element={<SettingsRoute />} />
      {/* Tasks 13-23 add /pair, /invite, /contacts/add, /contacts/:id */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

Note: the routes for /pair, /invite, /contacts/* are added in later tasks. Wildcard redirect is in place so unknown URLs go home rather than 404.

- [ ] **Step 3: Update Sidebar's settings link to use react-router**

Open `src/components/sidebar.tsx`. The Slice 1 implementation passed a callback for navigation. Replace with `<Link to="/settings">` from `react-router-dom`.

```tsx
// At top:
import { Link } from "react-router-dom";

// Replace the Settings button:
<Link
  to="/settings"
  data-testid="settings-link"
  className="text-sm text-muted-foreground hover:text-foreground"
>
  Settings
</Link>
```

Remove any `onNavigateToSettings` callback prop and the corresponding state handling from App.tsx.

- [ ] **Step 4: Update SettingsRoute back-link**

Open `src/routes/settings/index.tsx`. Replace the "← Home" callback button with a `<Link to="/">`.

```tsx
import { Link } from "react-router-dom";

// Replace back button:
<Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
  ← Home
</Link>
```

- [ ] **Step 5: Verify dev server boots**

```bash
npm run build 2>&1 | tail -5
```

Expected: build succeeds. (Manual dev test possible but optional.)

- [ ] **Step 6: Run Slice 1 e2e tests**

```bash
npm run test:e2e
```

Expected: 6 tests pass (3 specs × 2 browsers). If any fail because the home/settings navigation changed, fix the test or fix the code (selectors should still resolve since `data-testid` attributes are unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/main.tsx src/components/sidebar.tsx src/routes/settings/index.tsx
git commit -m "feat(routing): migrate App from state machine to react-router-dom"
```

---

### Task 3: Verify Slice 1 unit tests after routing migration

**Files:** (none new; verification only)

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: 38 tests pass (Slice 1 baseline). If anything is red, debug before continuing — Phase B touches the same areas.

- [ ] **Step 2: Quick smoke**

```bash
npm run build
```

Expected: clean.

(No commit; verification only.)

---

## Phase B — Placeholder replacement + Schema additions

### Task 4: Implement pubkey extraction (TDD)

**Files:**
- Create: `src/auth/pubkey.ts`, `tests/unit/auth/pubkey.test.ts`

This extracts the Ed25519 public key hex from a loaded Jazz account. **The exact API path is not verified** — investigate before coding.

- [ ] **Step 1: Investigate the Jazz API**

Read `docs/jazz-api-notes.md` for what's already documented. Then inspect Jazz internals:

```bash
grep -r "signingKey\|publicKey\|getCurrentAgent" node_modules/jazz-tools/dist/*.d.ts | head -30
grep -r "verifyingKey\|signingKeyID" node_modules/jazz-tools/dist/*.d.ts | head -20
```

Candidate paths to try, in order:
1. `me.$jazz.localNode.crypto.getAgentSigningKey(me.$jazz.localNode.account)` or similar
2. `me.$jazz.id` parsed for the embedded pubkey (some Jazz versions encode the pubkey in the account ID)
3. A specific `getPublicEd25519Key(me)` helper if one exists

If none of these work, **dispatch a research subagent** (template: Slice 1's `docs/jazz-api-notes.md` survey) with the focused brief "extract Ed25519 public key hex from a jazz-tools 0.20.18 Account instance." Update `docs/jazz-api-notes.md` with findings.

- [ ] **Step 2: Write the failing test**

`tests/unit/auth/pubkey.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createJazzTestAccount } from "jazz-tools/testing";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { getAccountPubkeyHex } from "@/auth/pubkey";

describe("getAccountPubkeyHex", () => {
  it("returns a 64-character hex string for a test account", async () => {
    const { account } = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Test User" },
    });
    const hex = getAccountPubkeyHex(account);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same account", async () => {
    const { account } = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Test User" },
    });
    expect(getAccountPubkeyHex(account)).toBe(getAccountPubkeyHex(account));
  });

  it("differs for different accounts", async () => {
    const a = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Alice" },
    });
    const b = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Bob" },
    });
    expect(getAccountPubkeyHex(a.account)).not.toBe(getAccountPubkeyHex(b.account));
  });
});
```

The exact import path for `createJazzTestAccount` may differ — check `node_modules/jazz-tools/dist/testing.d.ts`. The Slice 1 schema tests have a working example.

- [ ] **Step 3: Run test (expect fail)**

```bash
npm test -- pubkey
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

`src/auth/pubkey.ts`:

```ts
import type { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";

/**
 * Extract the Ed25519 public key hex (32 bytes / 64 hex chars) from a Jazz account.
 *
 * The API path depends on jazz-tools 0.20.18's internals; verified during Slice 2
 * implementation. If the chosen path stops working in a future Jazz release,
 * the test cases above will catch it.
 */
export function getAccountPubkeyHex(account: ReturnType<typeof JazzMessangerAccount.create> | any): string {
  // The actual extraction logic — replace with the verified API path from Step 1.
  // Example placeholder (will not work as-is):
  const signingKey =
    (account as any).$jazz?.localNode?.account?.currentSignerID?.() ??
    (account as any).$jazz?.localNode?.crypto?.getAgentSigningKey?.((account as any).$jazz.localNode.account);

  if (!signingKey) {
    throw new Error("Could not extract signing key from account; check jazz-tools 0.20.18 API");
  }

  // Coerce to 64-char hex. The signing key may be returned as base58, base64, or hex
  // depending on the API path; normalize to lowercase hex without 0x prefix.
  const hex = normalizeToHex64(signingKey);
  return hex;
}

function normalizeToHex64(key: string | Uint8Array): string {
  let bytes: Uint8Array;
  if (typeof key === "string") {
    // Try hex first
    if (/^[0-9a-fA-F]{64}$/.test(key)) return key.toLowerCase();
    // Otherwise assume base64
    bytes = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  } else {
    bytes = key;
  }
  if (bytes.length !== 32) {
    throw new Error(`Expected 32-byte signing key, got ${bytes.length} bytes`);
  }
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}
```

**Replace the placeholder extraction logic with the API path verified in Step 1.** The `normalizeToHex64` helper is reusable regardless.

- [ ] **Step 5: Run test (expect pass)**

```bash
npm test -- pubkey
```

- [ ] **Step 6: Commit**

```bash
git add src/auth/pubkey.ts tests/unit/auth/pubkey.test.ts docs/jazz-api-notes.md
git commit -m "feat(auth): extract Ed25519 pubkey hex from account"
```

---

### Task 5: Implement session fingerprint derivation (TDD)

**Files:**
- Create: `src/auth/session.ts`, `tests/unit/auth/session.test.ts`

Derives a stable per-session fingerprint string.

- [ ] **Step 1: Investigate the Jazz API**

Similar to Task 4. Look for:
- `me.$jazz.localNode.currentSessionID`
- `account.sessionID` or `agent.sessionID`
- Anything exposing per-session signing keys

If unclear, dispatch a research subagent.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createJazzTestAccount } from "jazz-tools/testing";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { getCurrentSessionFingerprint } from "@/auth/session";

describe("getCurrentSessionFingerprint", () => {
  it("returns a non-empty stable string for a session", async () => {
    const { account } = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Test" },
    });
    const fp = getCurrentSessionFingerprint(account);
    expect(typeof fp).toBe("string");
    expect(fp.length).toBeGreaterThan(0);
    expect(getCurrentSessionFingerprint(account)).toBe(fp); // stable
  });
});
```

- [ ] **Step 3: Run (expect fail)**

- [ ] **Step 4: Implement**

`src/auth/session.ts`:

```ts
/**
 * Derive a stable fingerprint for the current Jazz session.
 *
 * Replaces the crypto.randomUUID() placeholder used in JazzMessangerAccount's
 * migration during Slice 1. The fingerprint is stable for the lifetime of a
 * session (one per (account, device) pair).
 */
export function getCurrentSessionFingerprint(account: any): string {
  const sessionID =
    account?.$jazz?.localNode?.currentSessionID ??
    account?.$jazz?.sessionID;

  if (!sessionID) {
    throw new Error("Could not extract session ID; check jazz-tools 0.20.18 API");
  }

  return String(sessionID);
}
```

Same caveat as Task 4: replace the candidate access paths with whatever the investigation in Step 1 verified.

- [ ] **Step 5: Run (expect pass)**

- [ ] **Step 6: Commit**

```bash
git add src/auth/session.ts tests/unit/auth/session.test.ts docs/jazz-api-notes.md
git commit -m "feat(auth): derive stable session fingerprint"
```

---

### Task 6: Update JazzMessangerAccount migration to use real session fingerprint

**Files:**
- Modify: `src/jazz/schema/JazzMessangerAccount.ts`

- [ ] **Step 1: Locate and replace the placeholder**

In `src/jazz/schema/JazzMessangerAccount.ts`, find the line:

```ts
sessionFingerprint: crypto.randomUUID(),
```

and replace with:

```ts
sessionFingerprint: getCurrentSessionFingerprint(me),
```

Add the import at the top:

```ts
import { getCurrentSessionFingerprint } from "@/auth/session";
```

Update the file's comment block explaining the placeholder was used in Slice 1 and is now real.

- [ ] **Step 2: Run unit tests**

```bash
npm test
```

Expected: all schema + utility tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/jazz/schema/JazzMessangerAccount.ts
git commit -m "feat(schema): use real session fingerprint in account migration"
```

---

### Task 7: Update account-section.tsx to use real pubkey

**Files:**
- Modify: `src/routes/settings/account-section.tsx`

- [ ] **Step 1: Replace placeholder**

In `account-section.tsx`, locate the placeholder hex transformation. Replace with:

```tsx
import { getAccountPubkeyHex } from "@/auth/pubkey";
import { formatSafetyNumber } from "@/auth/fingerprint";
import { SafetyNumber } from "@/components/safety-number";
// ... existing imports

export function AccountSection() {
  const me = useAccount(JazzMessangerAccount);
  if (!me?.$isLoaded) return null;

  const fingerprintHex = getAccountPubkeyHex(me);

  return (
    <section className="space-y-2">
      <h3 className="text-lg font-medium">Account</h3>
      <p className="text-sm text-muted-foreground">Your safety number:</p>
      <SafetyNumber fingerprintHex={fingerprintHex} />
    </section>
  );
}
```

Remove the Slice-1-placeholder comment block.

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 3: Run Slice 1 e2e**

```bash
npm run test:e2e -- account-creation
```

Expected: still passes (account creation flow doesn't navigate to settings).

- [ ] **Step 4: Commit**

```bash
git add src/routes/settings/account-section.tsx
git commit -m "feat(settings): use real Ed25519 pubkey for safety number"
```

---

### Task 8: Add `linkedConversation` field to Contact schema

**Files:**
- Modify: `src/jazz/schema/Contact.ts`

- [ ] **Step 1: Add the field with getter pattern**

In `src/jazz/schema/Contact.ts`, add the import and field:

```ts
import { co, z } from "jazz-tools";
import { Conversation } from "./Conversation";

export const Contact = co.map({
  contactAccountID: z.string(),
  pinnedFingerprint: z.string(),
  displayNameLocal: z.string(),
  addedAt: z.date(),
  notes: z.string().optional(),
  get linkedConversation() {
    return Conversation.optional();
  },
});

export const ContactBook = co.list(Contact);
```

If the getter pattern triggers a circular import issue at runtime, fall back to storing the conversation ID as a string:

```ts
linkedConversationID: z.string().optional(),
```

and document the fallback in the commit message.

- [ ] **Step 2: Run schema tests**

```bash
npm test -- Contact
```

Expected: existing Contact test passes.

- [ ] **Step 3: Commit**

```bash
git add src/jazz/schema/Contact.ts
git commit -m "feat(schema): add linkedConversation optional field to Contact"
```

---

### Task 9: Define EphemeralPairing schema (TDD)

**Files:**
- Create: `src/jazz/schema/EphemeralPairing.ts`, `tests/unit/jazz/schema/EphemeralPairing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { EphemeralPairing } from "@/jazz/schema/EphemeralPairing";

describe("EphemeralPairing schema", () => {
  it("is defined and exported", () => {
    expect(EphemeralPairing).toBeDefined();
    expect(typeof EphemeralPairing).toBe("function");
  });
});
```

- [ ] **Step 2: Run (expect fail)**

- [ ] **Step 3: Implement**

`src/jazz/schema/EphemeralPairing.ts`:

```ts
import { co, z } from "jazz-tools";

/**
 * EphemeralPairing: one-shot CoValue mediating QR multi-device pairing.
 *
 * Initiator (existing device) creates this and writes initiatorPubkey,
 * initiatorAccountID, initiatorDisplayName, createdAt, expiresAt.
 *
 * Responder (new device) writes responderPubkey when scanning/pasting the URL.
 *
 * Initiator then writes wrappedAccountSecret (sealed-box of the account secret
 * to the responder's X25519 pubkey) after user approval.
 *
 * Responder writes responderSessionFingerprint after persisting the secret;
 * initiator tombstones the CoValue once this appears.
 *
 * Lifecycle bounded by 5-minute expiry plus tombstone-on-completion;
 * no separate consumed flag (see spec §4.1).
 */
export const EphemeralPairing = co.map({
  initiatorPubkey: z.string(),
  initiatorAccountID: z.string(),
  initiatorDisplayName: z.string(),
  createdAt: z.date(),
  expiresAt: z.date(),
  responderPubkey: z.string().optional(),
  wrappedAccountSecret: z.string().optional(),
  responderSessionFingerprint: z.string().optional(),
});
```

- [ ] **Step 4: Run (expect pass)**

- [ ] **Step 5: Commit**

```bash
git add src/jazz/schema/EphemeralPairing.ts tests/unit/jazz/schema/EphemeralPairing.test.ts
git commit -m "feat(schema): add EphemeralPairing for QR multi-device pairing"
```

---

## Phase C — QR display + scanner components

### Task 10: QR display component

**Files:**
- Create: `src/components/qr-display.tsx`

- [ ] **Step 1: Implement**

```tsx
import { QRCodeSVG } from "qrcode.react";

interface QRDisplayProps {
  url: string;
  size?: number;
  // Visible alt text below the QR for accessibility / sighted manual entry
  showText?: boolean;
}

export function QRDisplay({ url, size = 256, showText = false }: QRDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-3" data-testid="qr-display">
      <div className="rounded-lg border bg-white p-4">
        <QRCodeSVG value={url} size={size} level="M" />
      </div>
      {showText && (
        <code className="break-all text-xs text-muted-foreground" data-testid="qr-url-text">
          {url}
        </code>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/qr-display.tsx
git commit -m "feat(qr): QR display component wrapping qrcode.react"
```

---

### Task 11: QR scanner component with camera + paste fallback

**Files:**
- Create: `src/qr/scanner.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { Button } from "@/components/ui/button";

interface QRScannerProps {
  // Called whenever a valid URL is recognized (from camera or paste)
  onUrl: (url: string) => void;
  // Substring or regex the URL must match for it to be considered valid
  expectedPathPrefix: string;
}

type CameraState = "loading" | "running" | "denied" | "unavailable";

/**
 * QRScanner — webcam scanner with always-visible paste fallback.
 *
 * Both inputs feed onUrl. First valid URL wins (subsequent reads suppressed
 * until parent unmounts). URLs must start with `expectedPathPrefix` to be
 * accepted; this prevents scanning random QRs unrelated to our flow.
 */
export function QRScanner({ onUrl, expectedPathPrefix }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("loading");
  const [pasteValue, setPasteValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const accepted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!videoRef.current) return;

    const scanner = new QrScanner(
      videoRef.current,
      (result: { data: string }) => {
        if (accepted.current) return;
        if (!result.data.includes(expectedPathPrefix)) return;
        accepted.current = true;
        onUrl(result.data);
      },
      { returnDetailedScanResult: true }
    );

    scanner
      .start()
      .then(() => {
        if (cancelled) {
          scanner.stop();
          return;
        }
        scannerRef.current = scanner;
        setCameraState("running");
      })
      .catch(() => {
        if (cancelled) return;
        setCameraState("denied");
      });

    return () => {
      cancelled = true;
      scanner.stop();
      scanner.destroy();
    };
  }, [onUrl, expectedPathPrefix]);

  function handlePasteSubmit() {
    if (accepted.current) return;
    const trimmed = pasteValue.trim();
    if (!trimmed.includes(expectedPathPrefix)) {
      setError(`URL does not look like a valid ${expectedPathPrefix} link.`);
      return;
    }
    accepted.current = true;
    setError(null);
    onUrl(trimmed);
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Scan with camera</h3>
        <div className="aspect-square w-full overflow-hidden rounded-lg border bg-black">
          {(cameraState === "loading" || cameraState === "running") && (
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              data-testid="qr-camera-video"
            />
          )}
          {cameraState === "denied" && (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-white">
              Camera unavailable — paste the link instead.
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Or paste link</h3>
        <textarea
          className="w-full rounded-md border bg-background p-2 text-sm font-mono"
          rows={4}
          value={pasteValue}
          onChange={(e) => {
            setPasteValue(e.target.value);
            setError(null);
          }}
          placeholder={`Paste a link containing "${expectedPathPrefix}"...`}
          data-testid="qr-paste-input"
        />
        {error && (
          <p className="text-sm text-red-600" data-testid="qr-paste-error">
            {error}
          </p>
        )}
        <Button
          onClick={handlePasteSubmit}
          disabled={!pasteValue.trim()}
          data-testid="qr-paste-submit"
        >
          Use this link
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/qr/scanner.tsx
git commit -m "feat(qr): scanner component with camera + always-visible paste fallback"
```

---

## Phase D — Pairing protocol + UI

### Task 12: Pairing protocol primitives (TDD)

**Files:**
- Create: `src/jazz/pairing.ts`, `tests/unit/jazz/pairing.test.ts`

This module exposes the protocol functions used by the initiator and responder UI components.

- [ ] **Step 1: Sketch the interface**

```ts
// src/jazz/pairing.ts (skeleton — fill in during implementation)

export interface PairingURL {
  pairingCoValueID: string;
  pairingAgentSecret: string;
  initiatorPubkeyHex: string;       // K_e.pub
}

export interface PairingInitiation {
  pairing: any;                     // EphemeralPairing CoValue instance
  url: string;                      // /pair#... full URL
  ephemeralPrivkeyHex: string;      // K_e.priv (kept in component state)
}

// Initiator side
export async function createPairingInvite(account: any, baseUrl: string): Promise<PairingInitiation>;
export async function wrapAccountSecretForResponder(
  account: any,
  pairing: any,
  ephemeralPrivkeyHex: string,
): Promise<void>;
export async function tombstonePairing(pairing: any): Promise<void>;

// Responder side
export function parsePairingURL(url: string): PairingURL;
export async function loadPairingAsAgent(
  pairingCoValueID: string,
  pairingAgentSecret: string,
  syncURL: string,
): Promise<any>;
export async function respondToPairing(
  pairing: any,
): Promise<{ responderPrivkeyHex: string }>;
export async function claimAccountFromPairing(
  pairing: any,
  responderPrivkeyHex: string,
): Promise<{ accountSecret: string; sessionFingerprint: string }>;
```

- [ ] **Step 2: Write failing tests**

Cover the round-trip: parsePairingURL ↔ build URL, and the sealed-box wrap/unwrap.

```ts
import { describe, it, expect } from "vitest";
import { parsePairingURL } from "@/jazz/pairing";

describe("parsePairingURL", () => {
  it("round-trips with a constructed URL", () => {
    const url = "https://example.test/pair#" + btoa("a:b:c").replace(/=/g, "");
    const parsed = parsePairingURL(url);
    expect(parsed.pairingCoValueID).toBe("a");
    expect(parsed.pairingAgentSecret).toBe("b");
    expect(parsed.initiatorPubkeyHex).toBe("c");
  });

  it("throws on a non-/pair URL", () => {
    expect(() => parsePairingURL("https://example.test/foo")).toThrow();
  });
});

// Sealed-box round-trip test using @noble/curves directly:
import { x25519 } from "@noble/curves/ed25519";
import { managedNonce } from "@noble/ciphers/webcrypto";
// ... (test the wrap/unwrap helpers if they're factored out)
```

- [ ] **Step 3: Run (expect fail)**

- [ ] **Step 4: Implement**

Implement each function in `src/jazz/pairing.ts`. Key implementation notes:

- **Sealed box** uses NaCl's `crypto_box_seal` semantics. With `@noble/curves`, this is X25519 ECDH + XSalsa20-Poly1305 with the ephemeral public key prepended. Use the libsodium-style sealed box: ephemeral keypair per message → ECDH → XSalsa20-Poly1305 over the plaintext.
- **`createPairingInvite`** generates K_e (X25519 keypair), creates pairingGroup + pairingAgent, creates the EphemeralPairing CoValue.
- **`wrapAccountSecretForResponder`** computes the sealed-box ciphertext and writes to the CoValue.
- **`loadPairingAsAgent`** needs the Jazz API for "authenticate as a specific agent identity using a known secret" — verify against `docs/jazz-api-notes.md` §2.
- **`claimAccountFromPairing`** uses the unsealed account secret to log in. This is the third API-discovery risk from the spec; investigate the Jazz "login from raw secret" pathway.

If any of these API integrations don't work as expected, dispatch a research subagent.

- [ ] **Step 5: Run tests (expect pass)**

- [ ] **Step 6: Commit**

```bash
git add src/jazz/pairing.ts tests/unit/jazz/pairing.test.ts docs/jazz-api-notes.md
git commit -m "feat(jazz): pairing protocol primitives (URL parse, sealed box, claim)"
```

---

### Task 13: Pairing initiator step UI

**Files:**
- Create: `src/routes/pair/initiator-step.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from "react";
import { useAccount } from "jazz-tools/react";
import { Button } from "@/components/ui/button";
import { QRDisplay } from "@/components/qr-display";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import {
  createPairingInvite,
  wrapAccountSecretForResponder,
  tombstonePairing,
  type PairingInitiation,
} from "@/jazz/pairing";

type Phase =
  | { kind: "loading" }
  | { kind: "waiting"; init: PairingInitiation }
  | { kind: "awaiting-approval"; init: PairingInitiation }
  | { kind: "approved" }
  | { kind: "complete" }
  | { kind: "error"; message: string };

export function PairInitiatorStep() {
  const me = useAccount(JazzMessangerAccount);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!me?.$isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const init = await createPairingInvite(me, window.location.origin);
        if (cancelled) return;
        setPhase({ kind: "waiting", init });
      } catch (e) {
        setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, [me]);

  // Subscribe to responderPubkey appearing
  useEffect(() => {
    if (phase.kind !== "waiting") return;
    const interval = setInterval(() => {
      const pairing = phase.init.pairing;
      if (pairing.responderPubkey) {
        setPhase({ kind: "awaiting-approval", init: phase.init });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [phase]);

  async function handleApprove() {
    if (phase.kind !== "awaiting-approval") return;
    setPhase({ kind: "approved" });
    try {
      await wrapAccountSecretForResponder(me, phase.init.pairing, phase.init.ephemeralPrivkeyHex);
      // Wait for responder to write responderSessionFingerprint
      const poll = setInterval(async () => {
        if (phase.init.pairing.responderSessionFingerprint) {
          clearInterval(poll);
          await tombstonePairing(phase.init.pairing);
          setPhase({ kind: "complete" });
        }
      }, 500);
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  if (phase.kind === "loading") {
    return <div className="p-6 text-center">Generating pairing link...</div>;
  }
  if (phase.kind === "error") {
    return <div className="p-6 text-center text-red-600" data-testid="pair-init-error">{phase.message}</div>;
  }
  if (phase.kind === "complete") {
    return (
      <div className="p-6 text-center space-y-4" data-testid="pair-init-complete">
        <h2 className="text-2xl font-semibold">New device linked</h2>
        <Button onClick={() => window.location.assign("/settings")}>Done</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-6 space-y-6">
      <h2 className="text-2xl font-semibold text-center">Link a new device</h2>
      <p className="text-center text-sm text-muted-foreground">
        On your new device, scan this QR or open the link.
      </p>

      {(phase.kind === "waiting" || phase.kind === "awaiting-approval") && (
        <>
          <QRDisplay url={phase.init.url} showText />
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              data-testid="pair-copy-url-btn"
              onClick={() => handleCopy(phase.init.url)}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        </>
      )}

      {phase.kind === "waiting" && (
        <p className="text-center text-sm text-muted-foreground" data-testid="pair-waiting">
          Waiting for new device...
        </p>
      )}

      {phase.kind === "awaiting-approval" && (
        <div className="space-y-3 rounded-lg border border-amber-400 bg-amber-50 p-4 text-center">
          <p className="font-medium" data-testid="pair-approval-prompt">
            A new device wants to link to your account. Approve?
          </p>
          <Button data-testid="pair-approve-btn" onClick={handleApprove}>
            Approve
          </Button>
        </div>
      )}

      {phase.kind === "approved" && (
        <p className="text-center text-sm text-muted-foreground" data-testid="pair-approved">
          Approved — waiting for the new device to finish setup...
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/pair/initiator-step.tsx
git commit -m "feat(pair): initiator step UI (QR + waiting + approval)"
```

---

### Task 14: Pairing responder step UI

**Files:**
- Create: `src/routes/pair/responder-step.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { QRScanner } from "@/qr/scanner";
import {
  parsePairingURL,
  loadPairingAsAgent,
  respondToPairing,
  claimAccountFromPairing,
} from "@/jazz/pairing";

type Phase =
  | { kind: "scanning" }
  | { kind: "loaded"; pairing: any; initiatorDisplayName: string }
  | { kind: "waiting-approval"; pairing: any; responderPrivkeyHex: string }
  | { kind: "claiming" }
  | { kind: "complete" }
  | { kind: "error"; message: string };

const SYNC_URL = import.meta.env.VITE_SYNC_URL ?? "ws://localhost:4200";

export function PairResponderStep() {
  const [phase, setPhase] = useState<Phase>({ kind: "scanning" });

  async function handleUrl(url: string) {
    try {
      const parsed = parsePairingURL(url);
      const pairing = await loadPairingAsAgent(parsed.pairingCoValueID, parsed.pairingAgentSecret, SYNC_URL);
      setPhase({
        kind: "loaded",
        pairing,
        initiatorDisplayName: pairing.initiatorDisplayName,
      });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleContinue() {
    if (phase.kind !== "loaded") return;
    try {
      const { responderPrivkeyHex } = await respondToPairing(phase.pairing);
      setPhase({ kind: "waiting-approval", pairing: phase.pairing, responderPrivkeyHex });

      // Poll for wrappedAccountSecret
      const poll = setInterval(async () => {
        if (phase.pairing.wrappedAccountSecret) {
          clearInterval(poll);
          setPhase({ kind: "claiming" });
          try {
            await claimAccountFromPairing(phase.pairing, responderPrivkeyHex);
            setPhase({ kind: "complete" });
            // Auth state will flip via JazzReactProvider; App.tsx routes to home
            setTimeout(() => window.location.assign("/"), 500);
          } catch (e) {
            setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
          }
        }
      }, 500);
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  // If URL fragment is present at mount, skip scanner UI
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      handleUrl(window.location.href);
    }
  }, []);

  if (phase.kind === "error") {
    return (
      <div className="p-6 text-center text-red-600" data-testid="pair-resp-error">
        {phase.message}
      </div>
    );
  }

  if (phase.kind === "scanning") {
    return (
      <div className="mx-auto max-w-3xl p-6 space-y-6">
        <h2 className="text-2xl font-semibold text-center">Link this device</h2>
        <p className="text-center text-sm text-muted-foreground">
          On your existing device, open <code>Settings → Devices → Link new device</code> and scan the QR.
        </p>
        <QRScanner onUrl={handleUrl} expectedPathPrefix="/pair#" />
      </div>
    );
  }

  if (phase.kind === "loaded") {
    return (
      <div className="mx-auto max-w-md p-6 space-y-6 text-center">
        <h2 className="text-2xl font-semibold">Join {phase.initiatorDisplayName}'s account</h2>
        <p className="text-sm text-muted-foreground">
          You're about to link this device to an existing account. Confirm to continue.
        </p>
        <Button data-testid="pair-resp-continue" onClick={handleContinue}>
          Link this device
        </Button>
      </div>
    );
  }

  if (phase.kind === "waiting-approval") {
    return (
      <div className="p-6 text-center" data-testid="pair-resp-waiting">
        Waiting for the existing device to approve...
      </div>
    );
  }

  if (phase.kind === "claiming") {
    return (
      <div className="p-6 text-center" data-testid="pair-resp-claiming">
        Setting up...
      </div>
    );
  }

  return (
    <div className="p-6 text-center" data-testid="pair-resp-complete">
      Device linked. Redirecting...
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/pair/responder-step.tsx
git commit -m "feat(pair): responder step UI (scan + paste + confirm + claim)"
```

---

### Task 15: Pairing route handler

**Files:**
- Create: `src/routes/pair/index.tsx`
- Modify: `src/App.tsx` (add route)

- [ ] **Step 1: Route handler decides initiator vs responder**

`src/routes/pair/index.tsx`:

```tsx
import { useLocation } from "react-router-dom";
import { PairInitiatorStep } from "./initiator-step";
import { PairResponderStep } from "./responder-step";

export function PairRoute() {
  const { hash, search } = useLocation();
  const params = new URLSearchParams(search);

  // /pair?role=initiator → initiator UI
  // /pair#... → responder UI
  // /pair (bare) → responder UI by default (user scanned and arrived here cold)
  if (params.get("role") === "initiator") {
    return <PairInitiatorStep />;
  }
  return <PairResponderStep />;
}
```

- [ ] **Step 2: Wire route into App.tsx**

Open `src/App.tsx`. In the `Routes`, add:

```tsx
import { PairRoute } from "@/routes/pair";

// ... inside the authenticated <Routes>:
<Route path="/pair" element={<PairRoute />} />
```

**Important:** `/pair` may need to render WITHOUT auth (the responder is becoming the account). Add a special case before the auth gate:

```tsx
import { useLocation } from "react-router-dom";

export default function App() {
  const me = useAccount(JazzMessangerAccount);
  const location = useLocation();

  // /pair is auth-optional (responder has no account yet).
  if (location.pathname === "/pair") {
    return (
      <Routes>
        <Route path="/pair" element={<PairRoute />} />
      </Routes>
    );
  }

  if (!me?.$isLoaded) {
    return <OnboardingRoute />;
  }

  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/settings/*" element={<SettingsRoute />} />
      <Route path="/pair" element={<PairRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 3: Verify build**

- [ ] **Step 4: Commit**

```bash
git add src/routes/pair/index.tsx src/App.tsx
git commit -m "feat(pair): route handler (initiator if ?role=initiator, responder otherwise)"
```

---

### Task 16: "Link new device" button in Devices section

**Files:**
- Modify: `src/routes/settings/devices-section.tsx`

- [ ] **Step 1: Add button**

```tsx
import { useAccount } from "jazz-tools/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";

export function DevicesSection() {
  const me = useAccount(JazzMessangerAccount, { resolve: { root: { devices: { $each: true } } } });
  const devices = me?.root?.devices ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Devices</h3>
        <Link to="/pair?role=initiator">
          <Button size="sm" data-testid="link-new-device-btn">
            Link new device
          </Button>
        </Link>
      </div>
      <ul data-testid="device-list" className="space-y-1">
        {devices.map((d, i) => (
          <li key={i} className="text-sm">
            {d?.label} — added {d?.addedAt?.toLocaleDateString()}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/settings/devices-section.tsx
git commit -m "feat(settings): Link new device button in Devices section"
```

---

## Phase E — Invitation protocol + UI

### Task 17: Invitation protocol primitives (TDD)

**Files:**
- Create: `src/jazz/invitations.ts`, `tests/unit/jazz/invitations.test.ts`

- [ ] **Step 1: Sketch the interface**

```ts
// src/jazz/invitations.ts (skeleton)

export interface InvitationURL {
  inviteGroupID: string;
  inviteAgentSecret: string;
}

export interface InvitationIssued {
  invitation: any;                   // Invitation CoValue instance
  url: string;                        // /invite#... full URL
}

// Inviter side
export async function createInvitation(account: any, baseUrl: string): Promise<InvitationIssued>;
export async function acceptInvitationAcceptance(account: any, invitation: any): Promise<void>;
export async function revokeInvitation(invitation: any): Promise<void>;

// Recipient side
export function parseInvitationURL(url: string): InvitationURL;
export async function loadInvitationAsAgent(
  inviteGroupID: string,
  inviteAgentSecret: string,
  syncURL: string,
): Promise<any>;
export async function acceptInvitation(account: any, invitation: any): Promise<void>;
```

- [ ] **Step 2: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { parseInvitationURL } from "@/jazz/invitations";

describe("parseInvitationURL", () => {
  it("round-trips with a constructed URL", () => {
    const url = "https://example.test/invite#" + btoa("groupID:secret").replace(/=/g, "");
    const parsed = parseInvitationURL(url);
    expect(parsed.inviteGroupID).toBe("groupID");
    expect(parsed.inviteAgentSecret).toBe("secret");
  });

  it("throws on a non-/invite URL", () => {
    expect(() => parseInvitationURL("https://example.test/foo")).toThrow();
  });
});
```

- [ ] **Step 3: Implement**

Implementation parallels `src/jazz/pairing.ts` but uses the existing `Invitation` schema (no new CoValue type). Key points:

- **`createInvitation`** generates invite-agent keypair, creates InviteGroup + Invitation CoValue (with real `inviterFingerprint` via `getAccountPubkeyHex`), appends to `me.root.invitesIssued`.
- **`acceptInvitationAcceptance`** is the inviter-side completion: when `acceptedAt` appears on Invitation, add a new Contact to `me.root.contactBook` with the recipient's accountID + fingerprint.
- **`acceptInvitation`** is the recipient-side action: self-promote via writerInvite role, write recipient fields to Invitation, add a Contact to own ContactBook for the inviter.

- [ ] **Step 4: Run tests (expect pass)**

- [ ] **Step 5: Commit**

```bash
git add src/jazz/invitations.ts tests/unit/jazz/invitations.test.ts
git commit -m "feat(jazz): invitation protocol primitives (create, accept, parse)"
```

---

### Task 18: Inviter UI — "Add contact" page

**Files:**
- Create: `src/routes/contacts/add.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from "react";
import { useAccount } from "jazz-tools/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QRDisplay } from "@/components/qr-display";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import {
  createInvitation,
  acceptInvitationAcceptance,
  revokeInvitation,
  type InvitationIssued,
} from "@/jazz/invitations";

type Phase =
  | { kind: "loading" }
  | { kind: "waiting"; issued: InvitationIssued }
  | { kind: "accepted"; recipientName: string }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

export function ContactAddRoute() {
  const me = useAccount(JazzMessangerAccount);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!me?.$isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const issued = await createInvitation(me, window.location.origin);
        if (cancelled) return;
        setPhase({ kind: "waiting", issued });
      } catch (e) {
        setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, [me]);

  // Poll for acceptance
  useEffect(() => {
    if (phase.kind !== "waiting") return;
    const poll = setInterval(async () => {
      if (phase.issued.invitation.acceptedAt) {
        clearInterval(poll);
        try {
          await acceptInvitationAcceptance(me, phase.issued.invitation);
          setPhase({
            kind: "accepted",
            recipientName: phase.issued.invitation.recipientDisplayName ?? "Contact",
          });
        } catch (e) {
          setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
        }
      }
    }, 500);
    return () => clearInterval(poll);
  }, [phase, me]);

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* unavailable */ }
  }

  async function handleCancel() {
    if (phase.kind !== "waiting") return;
    await revokeInvitation(phase.issued.invitation);
    setPhase({ kind: "cancelled" });
  }

  if (phase.kind === "loading") return <div className="p-6 text-center">Generating invite link...</div>;
  if (phase.kind === "error") return <div className="p-6 text-center text-red-600" data-testid="add-contact-error">{phase.message}</div>;
  if (phase.kind === "cancelled") {
    return (
      <div className="p-6 text-center space-y-4" data-testid="add-contact-cancelled">
        <p>Invite cancelled.</p>
        <Link to="/"><Button>Back to home</Button></Link>
      </div>
    );
  }
  if (phase.kind === "accepted") {
    return (
      <div className="p-6 text-center space-y-4" data-testid="add-contact-accepted">
        <h2 className="text-2xl font-semibold">Added {phase.recipientName} to your contacts</h2>
        <Link to="/"><Button>Back to home</Button></Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-6 space-y-6">
      <h2 className="text-2xl font-semibold text-center">Add a contact</h2>
      <p className="text-center text-sm text-muted-foreground">
        Send this link to the person you want to add. The link expires in 7 days and can only be used once.
      </p>
      <QRDisplay url={phase.issued.url} showText />
      <div className="flex justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          data-testid="add-contact-copy-btn"
          onClick={() => handleCopy(phase.issued.url)}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button variant="outline" size="sm" onClick={handleCancel} data-testid="add-contact-cancel-btn">
          Cancel
        </Button>
      </div>
      <p className="text-center text-sm text-muted-foreground" data-testid="add-contact-waiting">
        Waiting for acceptance...
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Add route**

In `src/App.tsx`, add `<Route path="/contacts/add" element={<ContactAddRoute />} />`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/contacts/add.tsx src/App.tsx
git commit -m "feat(contacts): add-contact page generates invite + QR + copy URL"
```

---

### Task 19: Recipient UI — accept/decline invite

**Files:**
- Create: `src/routes/invite/index.tsx`
- Modify: `src/App.tsx`
- Modify: `src/routes/onboarding/profile-step.tsx` (replay stashed fragment after sign-in)
- Modify: `src/routes/onboarding/restore-step.tsx` (same)

- [ ] **Step 1: Implement /invite handler**

```tsx
import { useEffect, useState } from "react";
import { useAccount } from "jazz-tools/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SafetyNumber } from "@/components/safety-number";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import {
  parseInvitationURL,
  loadInvitationAsAgent,
  acceptInvitation,
} from "@/jazz/invitations";

const SYNC_URL = import.meta.env.VITE_SYNC_URL ?? "ws://localhost:4200";
const STASH_KEY = "pending-invite-fragment";

type Phase =
  | { kind: "loading" }
  | { kind: "review"; invitation: any }
  | { kind: "accepting" }
  | { kind: "accepted"; inviterName: string }
  | { kind: "declined" }
  | { kind: "error"; message: string };

export function InviteRoute() {
  const me = useAccount(JazzMessangerAccount);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  useEffect(() => {
    // If not signed in, stash fragment and redirect
    if (!me?.$isLoaded) {
      sessionStorage.setItem(STASH_KEY, window.location.hash);
      window.location.assign("/");
      return;
    }

    // Otherwise load the invitation
    const hash = window.location.hash.slice(1);
    if (!hash) {
      setPhase({ kind: "error", message: "Invalid invite link" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = window.location.href;
        const parsed = parseInvitationURL(url);
        const invitation = await loadInvitationAsAgent(parsed.inviteGroupID, parsed.inviteAgentSecret, SYNC_URL);
        if (cancelled) return;
        setPhase({ kind: "review", invitation });
      } catch (e) {
        setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, [me]);

  async function handleAccept() {
    if (phase.kind !== "review") return;
    setPhase({ kind: "accepting" });
    try {
      await acceptInvitation(me, phase.invitation);
      setPhase({ kind: "accepted", inviterName: phase.invitation.inviterDisplayName });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  function handleDecline() {
    setPhase({ kind: "declined" });
  }

  if (phase.kind === "loading") return <div className="p-6 text-center">Loading invitation...</div>;
  if (phase.kind === "error") return <div className="p-6 text-center text-red-600" data-testid="invite-error">{phase.message}</div>;
  if (phase.kind === "accepting") return <div className="p-6 text-center" data-testid="invite-accepting">Accepting...</div>;
  if (phase.kind === "declined") {
    return (
      <div className="p-6 text-center space-y-4" data-testid="invite-declined">
        <p>Invitation declined.</p>
        <Link to="/"><Button>Go home</Button></Link>
      </div>
    );
  }
  if (phase.kind === "accepted") {
    return (
      <div className="p-6 text-center space-y-4" data-testid="invite-accepted">
        <h2 className="text-2xl font-semibold">Added {phase.inviterName} to your contacts</h2>
        <Link to="/"><Button>Go home</Button></Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-6 space-y-6">
      <h2 className="text-2xl font-semibold text-center">Add as contact?</h2>
      <p className="text-center" data-testid="invite-inviter-name">
        <strong>{phase.invitation.inviterDisplayName}</strong> wants to add you as a contact.
      </p>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Their safety number:</p>
        <SafetyNumber fingerprintHex={phase.invitation.inviterFingerprint} />
      </div>
      <div className="flex justify-center gap-2">
        <Button variant="outline" onClick={handleDecline} data-testid="invite-decline-btn">
          Decline
        </Button>
        <Button onClick={handleAccept} data-testid="invite-accept-btn">
          Accept
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire route**

In `src/App.tsx`, add `<Route path="/invite" element={<InviteRoute />} />` inside the authenticated routes.

Also: the unauthenticated branch needs to NOT auto-redirect /invite — let InviteRoute handle the stash. So change the auth gate to:

```tsx
if (!me?.$isLoaded) {
  if (location.pathname === "/invite") {
    return <InviteRoute />;  // it'll stash and redirect itself
  }
  return <OnboardingRoute />;
}
```

- [ ] **Step 3: Replay stashed fragment after sign-in**

In both `src/routes/onboarding/profile-step.tsx` (after `auth.registerNewAccount` succeeds) and `src/routes/onboarding/restore-step.tsx` (after `auth.logIn` succeeds), add:

```ts
const stashed = sessionStorage.getItem("pending-invite-fragment");
if (stashed) {
  sessionStorage.removeItem("pending-invite-fragment");
  window.location.assign(`/invite${stashed}`);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/invite/index.tsx src/App.tsx src/routes/onboarding/profile-step.tsx src/routes/onboarding/restore-step.tsx
git commit -m "feat(invite): accept/decline route + replay-after-signin for unauthenticated visits"
```

---

### Task 20: Contact detail page

**Files:**
- Create: `src/routes/contacts/detail.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement minimal contact detail**

```tsx
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { Button } from "@/components/ui/button";
import { SafetyNumber } from "@/components/safety-number";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";

export function ContactDetailRoute() {
  const { contactID } = useParams<{ contactID: string }>();
  const navigate = useNavigate();
  const me = useAccount(JazzMessangerAccount, {
    resolve: { root: { contactBook: { $each: true } } },
  });

  if (!me?.$isLoaded || !me.root?.contactBook) return <div className="p-6">Loading...</div>;

  const contact = me.root.contactBook.find((c: any) => c?.$jazz?.id === contactID);
  if (!contact) {
    return (
      <div className="p-6 text-center">
        <p>Contact not found.</p>
        <Link to="/"><Button>Back</Button></Link>
      </div>
    );
  }

  function handleRemove() {
    if (!confirm("Remove this contact? They will not be notified.")) return;
    // Tombstone the Contact CoValue
    me.root.contactBook.$jazz.delete(contact);
    navigate("/");
  }

  return (
    <div className="mx-auto max-w-md p-6 space-y-6">
      <Link to="/" className="text-sm text-muted-foreground">← Back</Link>
      <h2 className="text-2xl font-semibold" data-testid="contact-detail-name">
        {contact.displayNameLocal}
      </h2>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Safety number:</p>
        <SafetyNumber fingerprintHex={contact.pinnedFingerprint} />
      </div>
      <Button variant="outline" onClick={handleRemove} data-testid="contact-remove-btn">
        Remove contact
      </Button>
    </div>
  );
}
```

(The exact API for tombstoning a CoList entry may differ; verify via `docs/jazz-api-notes.md` §6.)

- [ ] **Step 2: Wire route**

In `src/App.tsx`:

```tsx
<Route path="/contacts/:contactID" element={<ContactDetailRoute />} />
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/contacts/detail.tsx src/App.tsx
git commit -m "feat(contacts): minimal contact detail page with safety number + remove"
```

---

### Task 21: Pending invites Settings section

**Files:**
- Create: `src/routes/settings/invites-section.tsx`
- Modify: `src/routes/settings/index.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useAccount } from "jazz-tools/react";
import { Button } from "@/components/ui/button";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { revokeInvitation } from "@/jazz/invitations";

export function InvitesSection() {
  const me = useAccount(JazzMessangerAccount, {
    resolve: { root: { invitesIssued: { $each: true } } },
  });
  const invites = me?.root?.invitesIssued ?? [];
  const pending = invites.filter((i: any) => i && !i.consumed && new Date(i.expiresAt) > new Date());

  async function handleRevoke(invitation: any) {
    if (!confirm("Revoke this invite?")) return;
    await revokeInvitation(invitation);
  }

  async function handleCopy(invitation: any) {
    // Reconstruct the URL from the InviteGroup ID + inviteAgentSecret.
    // The agent secret is NOT stored on the Invitation; we cannot reconstruct
    // it after the inviter's session ends. So this works only within the
    // session that created the invite. Document the limitation.
    alert("Copy link from the Add Contact page when generating. Re-generate if you've lost the link.");
  }

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-medium">Pending invites</h3>
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="no-pending-invites">No pending invites.</p>
      ) : (
        <ul data-testid="pending-invites-list" className="space-y-2">
          {pending.map((inv: any, i: number) => (
            <li key={i} className="flex items-center justify-between rounded border p-3 text-sm">
              <div>
                <p>Created {new Date(inv.createdAt).toLocaleDateString()}</p>
                <p className="text-muted-foreground">
                  Expires {new Date(inv.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleCopy(inv)}>
                  Copy link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid={`revoke-invite-${i}`}
                  onClick={() => handleRevoke(inv)}
                >
                  Revoke
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Wire into Settings**

In `src/routes/settings/index.tsx`, render `<InvitesSection />` after the existing sections.

- [ ] **Step 3: Commit**

```bash
git add src/routes/settings/invites-section.tsx src/routes/settings/index.tsx
git commit -m "feat(settings): pending invites section with revoke"
```

---

### Task 22: Sidebar updates — Add contact + real contact list

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Update sidebar**

```tsx
import { useAccount } from "jazz-tools/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";

export function Sidebar() {
  const me = useAccount(JazzMessangerAccount, {
    resolve: { profile: true, root: { contactBook: { $each: true } } },
  });

  if (!me?.$isLoaded) return null;

  const contacts = me.root?.contactBook ?? [];

  return (
    <aside className="w-64 border-r border-border flex flex-col">
      <header className="p-4 border-b border-border flex items-center justify-between">
        <p className="text-sm font-medium truncate" data-testid="sidebar-display-name">
          {me.profile?.displayName ?? "Loading..."}
        </p>
        {contacts.length > 0 && (
          <Link to="/contacts/add">
            <Button size="sm" variant="outline" data-testid="add-contact-btn-header">
              +
            </Button>
          </Link>
        )}
      </header>

      <nav className="flex-1 overflow-y-auto p-2" data-testid="contact-list">
        {contacts.length === 0 ? (
          <div className="p-4 text-center space-y-3">
            <p className="text-sm text-muted-foreground">No contacts yet</p>
            <Link to="/contacts/add">
              <Button size="sm" data-testid="add-contact-btn-empty">
                Add contact
              </Button>
            </Link>
          </div>
        ) : (
          contacts.map((c: any, i: number) => (
            <Link
              key={i}
              to={`/contacts/${c?.$jazz?.id}`}
              className="block p-2 hover:bg-accent rounded text-sm"
              data-testid={`contact-row-${i}`}
            >
              {c?.displayNameLocal ?? "..."}
            </Link>
          ))
        )}
      </nav>

      <footer className="p-4 border-t border-border">
        <Link
          to="/settings"
          className="text-sm text-muted-foreground hover:text-foreground"
          data-testid="settings-link"
        >
          Settings
        </Link>
      </footer>
    </aside>
  );
}
```

- [ ] **Step 2: Verify Slice 1 e2e still passes**

```bash
npm run test:e2e
```

Expected: Slice 1's 6 tests still pass (sidebar selectors unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(sidebar): + Add contact button, contact list links to detail page"
```

---

### Task 23: Verify full unit + e2e suite passes

(No new files; verification only)

- [ ] **Step 1: Run all unit tests**

```bash
npm test
```

Expected: all pass (Slice 1's 38 + new ones from Tasks 4, 5, 9, 12, 17 — likely ~50 total).

- [ ] **Step 2: Run all Slice 1 e2e tests**

```bash
npm run test:e2e
```

Expected: 6 tests pass (Slice 1 unaffected).

(No commit; verification only.)

---

## Phase F — E2E tests + docs

### Task 24: E2E test for device pairing

**Files:**
- Create: `tests/e2e/device-pairing.spec.ts`
- Modify: `tests/e2e/helpers.ts` (add helpers)

- [ ] **Step 1: Add helper for capturing the pairing URL**

In `tests/e2e/helpers.ts`, add:

```ts
import type { Page } from "@playwright/test";

/**
 * From a page that has the pair-initiator UI loaded, extract the pairing URL.
 */
export async function getPairingUrl(page: Page): Promise<string> {
  const url = await page.getByTestId("qr-url-text").textContent();
  if (!url) throw new Error("Could not read pairing URL");
  return url.trim();
}
```

- [ ] **Step 2: Write the e2e test**

```ts
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";
import { getPairingUrl } from "./helpers";

test("device pairing flow", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await pageA.goto("/");
  const { displayName } = await createAccount(pageA, "Pair Test User");

  // Navigate to /pair?role=initiator and capture URL
  await pageA.goto("/pair?role=initiator");
  await expect(pageA.getByTestId("qr-display")).toBeVisible({ timeout: 10000 });
  const pairUrl = await getPairingUrl(pageA);

  // Open in a fresh context (responder)
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await pageB.goto(pairUrl);

  // Responder confirms
  await expect(pageB.getByTestId("pair-resp-continue")).toBeVisible({ timeout: 10000 });
  await pageB.getByTestId("pair-resp-continue").click();

  // Initiator approves
  await expect(pageA.getByTestId("pair-approval-prompt")).toBeVisible({ timeout: 10000 });
  await pageA.getByTestId("pair-approve-btn").click();

  // Responder lands on home; sidebar shows same display name
  await expect(pageB.getByTestId("sidebar-display-name")).toHaveText(displayName, { timeout: 15000 });

  // Initiator's Settings → Devices shows 2 devices
  await pageA.goto("/settings");
  const devices = pageA.getByTestId("device-list").locator("li");
  await expect(devices).toHaveCount(2, { timeout: 10000 });

  await ctxA.close();
  await ctxB.close();
});
```

- [ ] **Step 3: Run the test**

```bash
npm run test:e2e -- device-pairing
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/device-pairing.spec.ts tests/e2e/helpers.ts
git commit -m "test(e2e): device pairing flow end-to-end"
```

---

### Task 25: E2E test for contact invitation

**Files:**
- Create: `tests/e2e/contact-invitation.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

test("contact invitation flow", async ({ browser }) => {
  // Alice
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await pageA.goto("/");
  await createAccount(pageA, "Alice");

  // Bob
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await pageB.goto("/");
  await createAccount(pageB, "Bob");

  // Bob navigates to /contacts/add
  await pageB.goto("/contacts/add");
  await expect(pageB.getByTestId("qr-display")).toBeVisible({ timeout: 10000 });
  const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();

  // Alice opens the link
  await pageA.goto(inviteUrl);
  await expect(pageA.getByTestId("invite-inviter-name")).toContainText("Bob", { timeout: 10000 });
  await pageA.getByTestId("invite-accept-btn").click();

  // Both sidebars show the other contact
  await expect(pageA.getByTestId("contact-list")).toContainText("Bob", { timeout: 10000 });
  await expect(pageB.getByTestId("contact-list")).toContainText("Alice", { timeout: 10000 });

  await ctxA.close();
  await ctxB.close();
});
```

- [ ] **Step 2: Run**

```bash
npm run test:e2e -- contact-invitation
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/contact-invitation.spec.ts
git commit -m "test(e2e): contact invitation flow end-to-end"
```

---

### Task 26: E2E test for invite-before-signin replay

**Files:**
- Create: `tests/e2e/invite-before-signin.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

test("invite link opens onboarding then replays after sign-in", async ({ browser }) => {
  // Bob creates account + invite
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await pageB.goto("/");
  await createAccount(pageB, "Bob");
  await pageB.goto("/contacts/add");
  await expect(pageB.getByTestId("qr-display")).toBeVisible({ timeout: 10000 });
  const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();

  // Fresh context, no account yet — opens invite URL
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await pageA.goto(inviteUrl);

  // Should redirect to welcome (onboarding)
  await expect(pageA.getByRole("heading", { name: /Welcome to Jazz Messanger/i })).toBeVisible({ timeout: 10000 });

  // Complete account creation as Alice
  await createAccount(pageA, "Alice");

  // After sign-in, should auto-replay invite URL and land on accept screen
  await expect(pageA.getByTestId("invite-inviter-name")).toContainText("Bob", { timeout: 15000 });

  await ctxA.close();
  await ctxB.close();
});
```

- [ ] **Step 2: Run**

```bash
npm run test:e2e -- invite-before-signin
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/invite-before-signin.spec.ts
git commit -m "test(e2e): invite link triggers onboarding then replays after sign-in"
```

---

### Task 27: Update CHANGELOG for Slice 2

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add Slice 2 section above Slice 1**

Open `CHANGELOG.md` and add at the top of `[Unreleased]`:

```markdown
### Slice 2 — QR Pairing + Contact Invitations

- New `EphemeralPairing` CoValue schema for the QR multi-device pairing handshake.
- Added `linkedConversation` optional field to `Contact` (deferred from Slice 1).
- New `src/auth/pubkey.ts` extracts real Ed25519 pubkey hex from an account.
- New `src/auth/session.ts` derives real session fingerprint; `JazzMessangerAccount` migration now uses it (Slice 1 placeholder retired for new accounts; existing accounts keep their random-UUID values).
- Settings → Account now shows safety number derived from the real Ed25519 pubkey.
- QR multi-device pairing: existing device generates QR + copy URL on `/pair?role=initiator`; new device camera-scans or pastes URL on `/pair#…` and joins the existing account via sealed-box account-secret transfer.
- Contact invitations: inviter generates QR + copy URL on `/contacts/add`; recipient opens `/invite#…` to accept; mutual contact entries created with TOFU-pinned Ed25519 fingerprints.
- Pending invites section in Settings (revoke action).
- Contact detail page with safety number + remove.
- Migrated routing from state machine to `react-router-dom`; `/pair`, `/invite`, `/contacts/add`, `/contacts/:id` all work via direct URL entry.
- New e2e tests: device pairing, contact invitation, invite-before-signin replay.

### Slice 2 known limitations

- Conversations are not yet created on invite acceptance — `Contact.linkedConversation` stays null. Slice 3 adds conversation creation.
- Pending invites' "Copy link" button only works within the original inviter's session (the invite-agent secret isn't stored on the Invitation CoValue; it lives in the URL fragment that was generated at creation). Documented as a known limitation; users should re-generate if they lose the link.
- Session fingerprints for old DeviceRecords created during Slice 1 remain `crypto.randomUUID()` values; they're not retroactively migrated.
```

- [ ] **Step 2: Tag the slice**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog entry for Slice 2"
git tag -a slice-2-complete -m "E1a Slice 2: QR Pairing + Contact Invitations complete"
```

---

## Done definition

Slice 2 is complete when:

- [ ] `npm test` exits 0 (unit tests — Slice 1's 38 + new ones)
- [ ] `npm run test:e2e` exits 0 in Chromium and Firefox (Slice 1's 6 + Slice 2's 3 = 9 specs × 2 browsers = 18 tests)
- [ ] Manual: from a fresh browser context, pair as a second device of an existing account via pasted URL; both contexts show same display name; Settings → Devices shows two entries
- [ ] Manual: from two fresh browser contexts as different accounts, establish mutual contact via copied invite URL; both sidebars show the other; contact detail pages show matching safety numbers
- [ ] Manual: safety number in Settings → Account is derived from the real Ed25519 pubkey
- [ ] Manual: freshly created account's DeviceRecord has a non-UUID `sessionFingerprint`
- [ ] `react-router-dom` is wired; `/settings`, `/contacts/add`, `/invite`, `/pair` all work via direct URL entry
- [ ] `slice-2-complete` tag exists

---

## Notes for Slice 3 author

- `Contact.linkedConversation` field exists; Slice 3 populates it when "Start conversation" is clicked from the contact detail page.
- The invite-agent pattern (Group + writerInvite) is now used by two protocols — if a third use case comes up (e.g., "join group conversation by link"), consider extracting a `src/jazz/invite-agent.ts` helper.
- Contact removal is local-only; Slice 3 should consider how to handle "the other side removed me" gracefully when messaging.
- Pending invites' "Copy link" button is currently a stub — Slice 3 may want to expose a more useful interaction (regenerate, share via Web Share API).
- `react-router-dom` is now the routing primitive; Slice 3 routes for conversations (`/conversations/:id`) plug in naturally.
- The API-discovery work (pubkey, session, raw-secret login) should now be documented in `docs/jazz-api-notes.md`. Slice 3 should reuse these helpers rather than re-discovering.
