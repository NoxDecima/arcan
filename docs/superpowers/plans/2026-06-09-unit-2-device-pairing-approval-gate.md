# Unit 2 — Device pairing approval gate enrichments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the existing device-pairing approval gate so the trusted device's approval card shows label + browser/OS + first-seen + cryptographic fingerprint (no location), the responder shows a matching fingerprint screen + Rejected + Timed-out terminals, and any logged-in trusted device on the same account (not just the QR shower) sees pending pairings. Plus the interim "Forget this device" honesty UX in the devices list.

**Architecture:** The state machines already exist (`src/routes/pair/initiator-step.tsx` `awaiting-approval`; `src/routes/pair/responder-step.tsx` `waiting-approval`). The gate's *protocol* is wired — `handleApprove` already calls `wrapAccountSecretForResponder`. This unit fills in the *information* the approval card shows (extending the `EphemeralPairing` schema with 5 optional fields), the responder's missing terminal screens, and switches the initiator from per-session polling to a `me`-scoped subscription so any logged-in trusted device sees the prompt.

**Tech Stack:** TypeScript strict, React 18 + Unit 7 tokens, jazz-tools 0.20.18, Web Crypto API for SHA-256, tweetnacl for sealed boxes (existing).

**Spec:** `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md` — Unit 2.

---

## Phase 0 · Setup

### Task 0.1: Branch + clean tree

- [ ] **Step 1: Confirm clean main + create branch**

```bash
cd /home/nox/Documents/Projects/Nox/arcan
git status --short
git checkout main && git pull
git checkout -b unit-2-device-pairing-approval-gate
```

---

## Phase 1 · Schema additions to `EphemeralPairing`

### Task 1.1: Failing test

**Files:**
- Create: `tests/unit/jazz/schema/ephemeral-pairing-enriched.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, test, expect } from "vitest";
import { EphemeralPairing } from "@/jazz/schema/EphemeralPairing";

describe("EphemeralPairing enriched fields", () => {
  test("schema includes the five new optional fields", () => {
    const shape = (EphemeralPairing as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape.responderUserAgent).toBeDefined();
    expect(shape.responderFirstSeenAt).toBeDefined();
    expect(shape.responderFingerprint).toBeDefined();
    expect(shape.approvedAt).toBeDefined();
    expect(shape.rejectedAt).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/unit/jazz/schema/ephemeral-pairing-enriched.test.ts
```

### Task 1.2: Add the fields

**Files:**
- Modify: `src/jazz/schema/EphemeralPairing.ts`

- [ ] **Step 1: Append the five optional fields**

Find the current `EphemeralPairing = co.map({ ... })` block. Add:

```typescript
  /** Raw User-Agent from the new device; trusted side derives label + OS for the approval card. */
  responderUserAgent: z.string().optional(),
  /** UTC timestamp of when the responder published its present. Rendered as relative time. */
  responderFirstSeenAt: z.date().optional(),
  /** First 8 hex chars of SHA-256(responderPubkey hex). Rendered identically on both sides for eye-verification. */
  responderFingerprint: z.string().optional(),
  /** Set by the trusted device on approve. Audit/state field; responder reacts to wrappedAccountSecret presence. */
  approvedAt: z.date().optional(),
  /** Set by the trusted device on reject (with expiresAt also tombstoned). Responder distinguishes rejected from timed-out. */
  rejectedAt: z.date().optional(),
```

- [ ] **Step 2: Re-run the test — expect PASS**

### Task 1.3: Commit Phase 1

```bash
git add src/jazz/schema/EphemeralPairing.ts tests/unit/jazz/schema/ephemeral-pairing-enriched.test.ts
git commit -m "feat(schema): enrich EphemeralPairing with five optional fields

Adds responderUserAgent, responderFirstSeenAt, responderFingerprint,
approvedAt, rejectedAt — all optional. The fingerprint is the visible
eye-verification signal (matched on both sides); the timestamps power
the responder state machine.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 2 · Pairing helpers + fingerprint derivation

### Task 2.1: Add SHA-256 helper

**Files:**
- Modify: `src/jazz/pairing.ts`

- [ ] **Step 1: Add a helper for the responder fingerprint**

Append near the top-level helpers in `src/jazz/pairing.ts`:

```typescript
/**
 * Derive the 8-char hex display fingerprint from the responder's ephemeral pubkey hex.
 * SHA-256(pubkey hex) → first 8 hex chars, uppercased for the visual block.
 */
export async function deriveResponderFingerprint(pubkeyHex: string): Promise<string> {
  const bytes = new TextEncoder().encode(pubkeyHex);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < 4; i++) {
    hex += view[i].toString(16).padStart(2, "0");
  }
  return hex.toUpperCase();
}
```

### Task 2.2: Failing test for the fingerprint helper

**Files:**
- Create: `tests/unit/jazz/pairing-fingerprint.test.ts`

- [ ] **Step 1: Write**

```typescript
import { describe, test, expect } from "vitest";
import { deriveResponderFingerprint } from "@/jazz/pairing";

describe("deriveResponderFingerprint", () => {
  test("returns 8 uppercase hex chars", async () => {
    const fp = await deriveResponderFingerprint("01020304");
    expect(fp).toMatch(/^[0-9A-F]{8}$/);
  });

  test("is deterministic for the same input", async () => {
    const a = await deriveResponderFingerprint("01020304");
    const b = await deriveResponderFingerprint("01020304");
    expect(a).toBe(b);
  });

  test("changes when the input changes", async () => {
    const a = await deriveResponderFingerprint("01020304");
    const c = await deriveResponderFingerprint("01020305");
    expect(a).not.toBe(c);
  });
});
```

- [ ] **Step 2: Run — should PASS**

```bash
npx vitest run tests/unit/jazz/pairing-fingerprint.test.ts
```

### Task 2.3: Split trusted-side flow into `approvePairing` and `rejectPairing`

**Files:**
- Modify: `src/jazz/pairing.ts`

Currently `wrapAccountSecretForResponder` does the secret-sealing. We split the trusted-side action into two named helpers that set the right state fields and delegate as appropriate.

- [ ] **Step 1: Add the helpers**

```typescript
/**
 * Approve a pending pairing on the trusted side.
 *
 * Writes `approvedAt` then calls wrapAccountSecretForResponder to seal +
 * publish the account secret. Idempotent within the same caller (caller
 * should guard against double-tap).
 */
export async function approvePairing(
  account: Account,
  pairing: ReturnType<typeof EphemeralPairing.create>,
  ephemeralPrivkeyHex: string,
  authContext: PairingAuthContext,
): Promise<void> {
  (pairing as any).$jazz.set("approvedAt", new Date());
  await wrapAccountSecretForResponder(account, pairing, ephemeralPrivkeyHex, authContext);
}

/**
 * Reject a pending pairing on the trusted side. Writes rejectedAt and tombstones expiresAt = now.
 */
export async function rejectPairing(
  pairing: ReturnType<typeof EphemeralPairing.create>,
): Promise<void> {
  (pairing as any).$jazz.set("rejectedAt", new Date());
  (pairing as any).$jazz.set("expiresAt", new Date());
}
```

### Task 2.4: Update the responder side to write the new info on present

**Files:**
- Modify: `src/jazz/pairing.ts` — the `respondToPairing` helper

- [ ] **Step 1: Extend the signature + write the new fields**

Find `respondToPairing` (currently writes only `responderPubkey`). Extend to also write `responderUserAgent`, `responderFirstSeenAt`, `responderFingerprint`:

```typescript
export async function respondToPairing(
  pairing: ReturnType<typeof EphemeralPairing.create>,
): Promise<{ responderPrivkeyHex: string }> {
  const responderKeypair = nacl.box.keyPair();
  const responderPrivkeyHex = bytesToHex(responderKeypair.secretKey);
  const responderPubkeyHex = bytesToHex(responderKeypair.publicKey);

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const fingerprint = await deriveResponderFingerprint(responderPubkeyHex);

  (pairing as any).$jazz.set("responderPubkey", responderPubkeyHex);
  (pairing as any).$jazz.set("responderUserAgent", ua);
  (pairing as any).$jazz.set("responderFirstSeenAt", new Date());
  (pairing as any).$jazz.set("responderFingerprint", fingerprint);

  return { responderPrivkeyHex };
}
```

### Task 2.5: Commit Phase 2

```bash
git add src/jazz/pairing.ts tests/unit/jazz/pairing-fingerprint.test.ts
git commit -m "feat(pairing): approvePairing + rejectPairing helpers + fingerprint derivation

deriveResponderFingerprint: SHA-256(pubkey hex) -> first 8 uppercase
hex chars, the eye-verification value shown on both sides.

approvePairing writes approvedAt then seals the secret via the existing
wrapAccountSecretForResponder. rejectPairing writes rejectedAt and
tombstones expiresAt = now.

respondToPairing now also publishes responderUserAgent,
responderFirstSeenAt, and responderFingerprint so the trusted device's
approval card has the info to render.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 3 · Enriched approval card (trusted side)

### Task 3.1: Read the existing initiator step UI

**Files:**
- Read: `src/routes/pair/initiator-step.tsx`

Note the existing `awaiting-approval` render branch + the approve button and its handler. We'll extend that render to show the enriched card.

### Task 3.2: Add a UA → label/OS extractor

**Files:**
- Create: `src/lib/device-info.ts`

- [ ] **Step 1: Write the extractor**

```typescript
/**
 * Tiny User-Agent introspection — produces a human label + OS family.
 * Output is a best-effort display string; not a security signal.
 */
export function deriveDeviceLabel(ua: string): string {
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Browser";
}

export function deriveDeviceOS(ua: string): string {
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown";
}

/** "5 minutes ago" / "just now" — coarse, mono-style. */
export function relativeTime(d: Date | undefined): string {
  if (!d) return "—";
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (diff < 30) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
```

### Task 3.3: Approval card component

**Files:**
- Create: `src/components/device-approval-card.tsx`

- [ ] **Step 1: Write the card**

```tsx
import { Button } from "@/components/ui/button";
import { deriveDeviceLabel, deriveDeviceOS, relativeTime } from "@/lib/device-info";

interface DeviceApprovalCardProps {
  userAgent?: string;
  firstSeenAt?: Date;
  fingerprint?: string;
  onApprove: () => void;
  onDeny: () => void;
  pending?: boolean;
}

export function DeviceApprovalCard({
  userAgent,
  firstSeenAt,
  fingerprint,
  onApprove,
  onDeny,
  pending,
}: DeviceApprovalCardProps) {
  const label = userAgent ? deriveDeviceLabel(userAgent) : "—";
  const os = userAgent ? deriveDeviceOS(userAgent) : "—";
  return (
    <div className="rounded-r-3 border border-hairline bg-panel p-4 flex flex-col gap-3 max-w-sm">
      <h3 className="text-base font-semibold text-text">Approve new device?</h3>
      <p className="text-sm text-text-2">A device wants to link to your account.</p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-dim uppercase tracking-widest font-semibold">Device</dt>
        <dd className="text-text-2 font-mono" data-testid="approval-label">{label} · {os}</dd>
        <dt className="text-dim uppercase tracking-widest font-semibold">First-seen</dt>
        <dd className="text-text-2 font-mono">{relativeTime(firstSeenAt)}</dd>
        <dt className="text-dim uppercase tracking-widest font-semibold">Fingerprint</dt>
        <dd className="text-text font-mono font-semibold tracking-widest" data-testid="approval-fingerprint">
          {fingerprint ?? "—"}
        </dd>
      </dl>
      <p className="text-[11px] text-dim leading-relaxed">
        Match the fingerprint with what the other device shows. Then approve.
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={onApprove} disabled={pending} className="flex-1" data-testid="approve-device">
          {pending ? "approving…" : "Approve"}
        </Button>
        <Button variant="outline" onClick={onDeny} disabled={pending} className="flex-1" data-testid="deny-device">
          Deny
        </Button>
      </div>
    </div>
  );
}
```

### Task 3.4: Replace the initiator's awaiting-approval render branch

**Files:**
- Modify: `src/routes/pair/initiator-step.tsx`

- [ ] **Step 1: Use the new card + add reject handler**

In the existing `phase === "awaiting-approval"` render, replace the current ad-hoc approve button block with:

```tsx
import { DeviceApprovalCard } from "@/components/device-approval-card";
import { rejectPairing } from "@/jazz/pairing";

// inside the component:
async function handleReject() {
  if (!invitation) return;
  try {
    await rejectPairing(invitation.pairing);
    setPhase("error");
    setErrorMsg("Rejected.");
  } catch (e) {
    setPhase("error");
    setErrorMsg(String(e));
  }
}

// in the awaiting-approval render:
if (phase === "awaiting-approval") {
  return (
    <div className="p-6 flex justify-center">
      <DeviceApprovalCard
        userAgent={(invitation?.pairing as any)?.responderUserAgent}
        firstSeenAt={(invitation?.pairing as any)?.responderFirstSeenAt}
        fingerprint={(invitation?.pairing as any)?.responderFingerprint}
        onApprove={handleApprove}
        onDeny={handleReject}
        pending={false}
      />
    </div>
  );
}
```

(The `handleApprove` function already exists — refactor it to call the new `approvePairing` helper that writes `approvedAt` before sealing. Read the current body and adapt.)

### Task 3.5: Commit Phase 3

```bash
git add src/lib/device-info.ts src/components/device-approval-card.tsx src/routes/pair/initiator-step.tsx
git commit -m "feat(pair): enriched approval card with fingerprint match

DeviceApprovalCard renders label + OS + first-seen + fingerprint
(no location). UA → label/OS via a small extractor. Replaces the bare
approve button in initiator-step's awaiting-approval phase. Adds a
handleReject path that calls rejectPairing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 4 · Responder-side state machine — Waiting / Rejected / Timed-out

### Task 4.1: Enrich the existing `waiting-approval` screen

**Files:**
- Modify: `src/routes/pair/responder-step.tsx`

- [ ] **Step 1: Read the file**

```bash
cat src/routes/pair/responder-step.tsx
```

Find the `phase === "waiting-approval"` render block (around line 215). Currently shows a plain message + a continue button.

- [ ] **Step 2: Replace with the fingerprint-match render**

```tsx
import { Lattice } from "@/components/lattice";

// inside the component:
if (phase === "waiting-approval") {
  const fp = (pairing as any)?.responderFingerprint as string | undefined;
  return (
    <div
      data-testid="pair-resp-waiting"
      className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 text-center bg-bg"
    >
      <Lattice size={64} />
      <h2 className="text-lg font-semibold text-text">Waiting for approval</h2>
      <p className="text-sm text-text-2 max-w-xs">
        On your other device, you should see a request to link this one.
      </p>
      <div className="flex flex-col items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-dim font-semibold">Fingerprint</span>
        <span
          data-testid="responder-fingerprint"
          className="font-mono text-2xl tracking-widest text-text bg-panel border border-hairline rounded-r-3 px-4 py-2"
        >
          {fp ?? "…"}
        </span>
        <p className="text-[11px] text-dim max-w-xs leading-relaxed">
          Match this code with what's shown on your other device before tapping Approve there.
        </p>
      </div>
      <div className="flex items-center gap-2 text-text-2 text-sm">
        <span className="w-2 h-2 rounded-full bg-arcan-accent animate-pulse" />
        <span>waiting…</span>
      </div>
    </div>
  );
}
```

### Task 4.2: New `Rejected` terminal state

**Files:**
- Modify: `src/routes/pair/responder-step.tsx`

- [ ] **Step 1: Detect rejectedAt in the polling effect**

The existing useEffect that polls for `wrappedAccountSecret` should also detect `rejectedAt`. Add a new phase `rejected`:

```typescript
type Phase =
  | "scanning"
  | "loaded"
  | "waiting-approval"
  | "rejected"   // <-- NEW
  | "timed-out"  // <-- NEW
  | "claiming"
  | "complete"
  | "error";
```

Extend the polling effect to check rejectedAt + expiresAt:

```typescript
useEffect(() => {
  if (phase !== "waiting-approval" || !pairingCoValueID) return;
  const intervalId = setInterval(async () => {
    try {
      const reloaded = await EphemeralPairing.load(pairingCoValueID as any, { resolve: {} });
      if (!reloaded) return;
      const r = reloaded as any;
      if (r.wrappedAccountSecret) {
        clearInterval(intervalId);
        setPhase("claiming");
        return;
      }
      if (r.rejectedAt) {
        clearInterval(intervalId);
        setPhase("rejected");
        return;
      }
      if (r.expiresAt && new Date(r.expiresAt).getTime() < Date.now()) {
        clearInterval(intervalId);
        setPhase("timed-out");
        return;
      }
    } catch {
      /* keep polling */
    }
  }, POLL_INTERVAL_MS);
  return () => clearInterval(intervalId);
}, [phase, pairingCoValueID]);
```

- [ ] **Step 2: Render Rejected**

```tsx
if (phase === "rejected") {
  return (
    <div
      data-testid="pair-resp-rejected"
      className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-bg"
    >
      <Lattice size={48} mono />
      <h2 className="text-lg font-semibold text-text">Request rejected</h2>
      <p className="text-sm text-text-2 max-w-xs">
        The other device declined this link. Ask them to retry, or start over.
      </p>
    </div>
  );
}
```

### Task 4.3: New `Timed-out` terminal state

- [ ] **Step 1: Render Timed-out**

```tsx
if (phase === "timed-out") {
  return (
    <div
      data-testid="pair-resp-timed-out"
      className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-bg"
    >
      <Lattice size={48} mono />
      <h2 className="text-lg font-semibold text-text">Request timed out</h2>
      <p className="text-sm text-text-2 max-w-xs">
        The request wasn't approved in time. Start a new pairing on your other device.
      </p>
    </div>
  );
}
```

### Task 4.4: Test the state machine transitions

**Files:**
- Create: `tests/unit/routes/pair/responder-states.test.tsx`

- [ ] **Step 1: Write a focused test**

```typescript
import { describe, test, expect } from "vitest";

/**
 * The phase transitions in responder-step.tsx form a finite state machine.
 * This test asserts the next-phase derivations for each observable signal.
 */
type Phase = "waiting-approval" | "claiming" | "rejected" | "timed-out";

function nextPhase(r: {
  wrappedAccountSecret?: string;
  rejectedAt?: Date;
  expiresAt?: Date;
}): Phase {
  if (r.wrappedAccountSecret) return "claiming";
  if (r.rejectedAt) return "rejected";
  if (r.expiresAt && new Date(r.expiresAt).getTime() < Date.now()) return "timed-out";
  return "waiting-approval";
}

describe("responder phase transitions", () => {
  test("wrappedAccountSecret -> claiming wins over rejectedAt", () => {
    expect(
      nextPhase({ wrappedAccountSecret: "x", rejectedAt: new Date() })
    ).toBe("claiming");
  });
  test("rejectedAt alone -> rejected", () => {
    expect(nextPhase({ rejectedAt: new Date() })).toBe("rejected");
  });
  test("past expiresAt with no other signal -> timed-out", () => {
    expect(nextPhase({ expiresAt: new Date(Date.now() - 1000) })).toBe("timed-out");
  });
  test("future expiresAt with no other signal -> waiting-approval", () => {
    expect(nextPhase({ expiresAt: new Date(Date.now() + 60_000) })).toBe("waiting-approval");
  });
});
```

- [ ] **Step 2: Extract the inline reducer**

For the test to exercise the real code path, factor the next-phase logic out of `responder-step.tsx` into a named export `nextPairingPhase` and have the test import it instead. Update both files accordingly.

- [ ] **Step 3: Run**

```bash
npx vitest run tests/unit/routes/pair/responder-states.test.tsx
```

Expected: PASS (4 tests).

### Task 4.5: Commit Phase 4

```bash
git add src/routes/pair/responder-step.tsx tests/unit/routes/pair/responder-states.test.tsx
git commit -m "feat(pair): responder-side waiting / rejected / timed-out screens

Enriches waiting-approval with the large mono fingerprint shown
identically on both sides for eye-verification. Adds rejected and
timed-out terminal screens. Polling effect distinguishes the three
non-claiming end states via wrappedAccountSecret / rejectedAt /
expiresAt. State-machine logic extracted as nextPairingPhase for tests.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 5 · Multi-trusted-device prompts (subscription replaces polling)

### Task 5.1: Subscribe `me`-scoped pending pairings

**Files:**
- Create: `src/jazz/use-pending-pairings.ts`

- [ ] **Step 1: Write the hook**

```typescript
import { useEffect, useState } from "react";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { EphemeralPairing } from "@/jazz/schema/EphemeralPairing";

/**
 * Subscribes to pending EphemeralPairings owned by `me`'s account. A pairing is "pending"
 * iff responderPubkey is set, approvedAt and rejectedAt are unset, and expiresAt is in the future.
 *
 * For Slice 2's current model the initiator's own session creates the EphemeralPairing in a
 * one-shot per-pairing group owned by `me`'s account. Other already-logged-in trusted devices
 * on the same account can discover these via the account-scoped owner.
 *
 * This hook is intentionally minimal — it returns the array of pending pairings; consumers decide
 * how to render (modal vs toast vs banner).
 */
export function usePendingPairings(): Array<ReturnType<typeof EphemeralPairing.create>> {
  const me = useAccount(ArcanAccount, { resolve: {} });
  const [pending, setPending] = useState<Array<ReturnType<typeof EphemeralPairing.create>>>([]);

  useEffect(() => {
    if (!me.$isLoaded) return;

    // The account's own pending pairings live in a list tracked here. For now we don't
    // maintain such a list in the schema — initiator-step creates ephemeral pairings ad-hoc.
    // This hook is the API surface; the actual subscription wires up in Phase 5.2 below
    // where we add `me.root.pendingPairings: co.list(EphemeralPairing)`.

    // Initial empty state. The wire-up happens once me.root.pendingPairings exists.
    const known = (me.root as any)?.pendingPairings;
    if (!known) {
      setPending([]);
      return;
    }
    setPending(Array.from(known).filter(Boolean));
  }, [me.$isLoaded, (me as any).root?.pendingPairings]);

  return pending;
}
```

### Task 5.2: Add `pendingPairings` list to `me.root`

**Files:**
- Modify: `src/jazz/schema/ArcanAccount.ts`

- [ ] **Step 1: Add the new list field**

In `ArcanAccountRoot`, add:

```typescript
  pendingPairings: co.list(EphemeralPairing).optional(),
```

In the root-init block of the migration, initialise it:

```typescript
    const pendingPairings = co.list(EphemeralPairing).create([], { owner: me });
```

Pass `pendingPairings` to `ArcanAccountRoot.create({ ... })`.

Add a defensive backfill block similar to the existing `knownConversations` / `settings` backfills.

### Task 5.3: `createPairingInvite` pushes to `me.root.pendingPairings`

**Files:**
- Modify: `src/jazz/pairing.ts`

- [ ] **Step 1: After creating the EphemeralPairing, push to the list**

In `createPairingInvite`, after `pairing = EphemeralPairing.create(...)`, add:

```typescript
  // Make the pairing discoverable by every logged-in trusted device on this account.
  try {
    const rootAny = (account as any).root;
    if (rootAny?.pendingPairings && typeof rootAny.pendingPairings.$jazz?.push === "function") {
      rootAny.pendingPairings.$jazz.push(pairing);
    }
  } catch (e) {
    console.warn("[pairing] could not push to pendingPairings:", e);
  }
```

Similarly, on approve + reject + completion, the entry can be removed (defensive cleanup):

In `approvePairing` after `wrapAccountSecretForResponder` resolves, and in `rejectPairing`, optionally remove from `pendingPairings`. Skip this if it complicates the flow — the resolver filter handles expired/approved entries anyway.

### Task 5.4: Trusted-side approval modal anywhere in the app

**Files:**
- Create: `src/components/trusted-device-prompt.tsx`

- [ ] **Step 1: Write a global modal that activates when any pending pairing is detected**

```tsx
import { useState } from "react";
import { usePendingPairings } from "@/jazz/use-pending-pairings";
import { DeviceApprovalCard } from "@/components/device-approval-card";
import { approvePairing, rejectPairing } from "@/jazz/pairing";
import { useAccount, useJazzContextValue, useAuthSecretStorage } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";

/**
 * Renders a modal whenever a pending pairing is detected. Mounted once at the App root.
 * If multiple pending pairings exist, shows them sequentially (only one card at a time).
 */
export function TrustedDevicePrompt() {
  const pending = usePendingPairings();
  const me = useAccount(ArcanAccount, { resolve: {} });
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const jazzCtx = useJazzContextValue();
  const authSecretStorage = useAuthSecretStorage();

  const visible = pending.find((p) => {
    const r = p as any;
    if (dismissedIds.has(r?.$jazz?.id)) return false;
    if (r?.approvedAt || r?.rejectedAt) return false;
    if (r?.expiresAt && new Date(r.expiresAt).getTime() < Date.now()) return false;
    return !!r?.responderPubkey;
  });

  if (!visible) return null;
  const v = visible as any;

  const onApprove = async () => {
    if (!me.$isLoaded || !jazzCtx || !authSecretStorage) return;
    try {
      const authCtx: any = {
        authenticate: () => Promise.resolve(),
        authSecretStorage,
        crypto: (jazzCtx as any).node.crypto,
        // The trusted device that created the pairing has ephemeralPrivkeyHex; if this device
        // didn't create it, it can't approve via wrapAccountSecretForResponder. The plan glosses
        // over this — implementer should reuse the existing initiator-step logic or extract a
        // shared utility that loads ephemeralPrivkeyHex from session storage.
      };
      const ephHex = sessionStorage.getItem(`arcan-pair-eph-${v.$jazz.id}`) ?? "";
      await approvePairing(me as any, v, ephHex, authCtx);
      setDismissedIds((s) => new Set(s).add(v.$jazz.id));
    } catch (e) {
      console.error("[trusted-prompt] approve failed:", e);
    }
  };

  const onDeny = async () => {
    try {
      await rejectPairing(v);
      setDismissedIds((s) => new Set(s).add(v.$jazz.id));
    } catch (e) {
      console.error("[trusted-prompt] reject failed:", e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <DeviceApprovalCard
        userAgent={v.responderUserAgent}
        firstSeenAt={v.responderFirstSeenAt}
        fingerprint={v.responderFingerprint}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    </div>
  );
}
```

**Caveat:** Approving from a *different* trusted device than the one that initiated requires either persisting `ephemeralPrivkeyHex` somewhere observable to all trusted devices, OR reworking the seal step. The simplest correct model is: store `ephemeralPrivkeyHex` encrypted on the pairing itself (sealed for `me`'s account agent), so any logged-in trusted device can decrypt it. This is a real protocol extension and may exceed the scope of this unit.

**Pragmatic Slice-2 compromise:** the `TrustedDevicePrompt` only fully approves when the local sessionStorage has the eph priv (i.e. this is the initiating device). On other trusted devices, the modal shows the card but the "Approve" action either:
- (a) routes back to the initiating device (toast "approve on the device that started the pair"), or
- (b) only enables Reject.

Implementer picks the approach during integration. The plan author recommends **(b) — only Reject enabled on non-initiating devices** for v1; encryption-shared eph priv is a future hardening.

### Task 5.5: Mount the prompt in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Mount once in the authenticated tree**

```tsx
import { TrustedDevicePrompt } from "@/components/trusted-device-prompt";

// inside authenticated render:
<TrustedDevicePrompt />
{/* rest of layout */}
```

### Task 5.6: Commit Phase 5

```bash
git add src/jazz/schema/ArcanAccount.ts src/jazz/pairing.ts src/jazz/use-pending-pairings.ts src/components/trusted-device-prompt.tsx src/App.tsx
git commit -m "feat(pair): app-wide trusted-device approval prompt via me.root.pendingPairings

Adds an account-scoped pendingPairings list. createPairingInvite pushes
new pairings into it so any logged-in trusted device on the same
account can subscribe and surface the approval card.

usePendingPairings hook filters the list (responderPubkey set, no
approvedAt/rejectedAt, not expired). TrustedDevicePrompt mounts at
App root and renders a modal with the enriched approval card when any
pending pairing matches.

Cross-device approve is partial: full secret-sealing requires the
ephemeralPrivkeyHex, currently only available on the initiating device's
sessionStorage. Non-initiating devices show the card with Reject
enabled; full approve falls back to the initiating device. Encrypted
shared eph-priv on the pairing itself is a future hardening.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 6 · Interim "Forget this device" UX

### Task 6.1: Relabel + honesty explainer

**Files:**
- Modify: `src/routes/settings/devices-section.tsx`

- [ ] **Step 1: Read current state**

```bash
cat src/routes/settings/devices-section.tsx
```

Note the "Revoke" button + the confirm dialog text.

- [ ] **Step 2: Relabel to "Forget this device"**

Replace every "Revoke" string in the UI with "Forget this device" (or button label "Forget"). The on-click handler still does `device.$jazz.set("revoked", true)` — only the label changes.

- [ ] **Step 3: Add the honesty explainer**

Below the device list, add:

```tsx
<p className="mt-4 text-xs text-dim leading-relaxed max-w-xl">
  Forgetting a device hides it here, but it can still read everything it has already synced.
  Full cryptographic revocation lands in the upcoming overhaul — see NOX-10.
</p>
```

### Task 6.2: Update the confirm-dialog copy

In `handleRevoke` (or wherever the `confirm(...)` lives), update:

```typescript
const confirmed = confirm(
  "Forget this device? It stays hidden from your list, but anything already synced to it remains readable. Full cryptographic revocation lands in a later release."
);
```

### Task 6.3: Commit Phase 6

```bash
git add src/routes/settings/devices-section.tsx
git commit -m "ux(settings): relabel device 'Revoke' -> 'Forget this device' + honesty explainer

Per Unit 2's interim honesty subsection. The mechanism is unchanged
(flips DeviceRecord.revoked to true); the label and confirm dialog now
honestly describe what it does. Explainer paragraph below the device
list points at NOX-10 (Shape 3) as the upcoming real cryptographic
revocation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 7 · Final verification + merge

### Task 7.1: Full test + build

- [ ] **Step 1: Run everything**

```bash
timeout 120 npm run test 2>&1 | tail -10
cd api && npx vitest run && cd ..
timeout 90 npm run build 2>&1 | tail -5
npm run check-tokens
```

Expected: all pass.

### Task 7.2: Manual smoke test

- [ ] **Step 1: Start the stack on Tailscale URL (HTTPS for Web Crypto)**

```bash
LINEAR_API_TOKEN=dev-noop BETTER_AUTH_SECRET=$(head -c 32 /dev/urandom | base64) npm run dev:all &
```

- [ ] **Step 2: Walk the pairing flow**

In two devices/browser profiles (or the same browser, two tabs):
- Sign in on Profile A.
- Start a new pairing — Profile A shows the QR.
- On Profile B (blank), open the URL.
- Profile B presents — Profile A shows the enriched approval card with label + OS + first-seen + fingerprint.
- Profile B shows "Waiting for approval" with the same fingerprint.
- **Eye-verify** the fingerprints match.
- Tap Approve on Profile A.
- Profile B should transition to claiming → complete (logged in).
- Try the Reject path on a fresh pairing.
- Settings → Devices: confirm the button reads "Forget this device" and the explainer is present.

Kill the dev stack.

### Task 7.3: Merge

```bash
git push -u origin unit-2-device-pairing-approval-gate
git checkout main
git merge --no-ff unit-2-device-pairing-approval-gate -m "Merge Unit 2: device pairing approval gate enrichments"
git push origin main
git branch -d unit-2-device-pairing-approval-gate
git push origin --delete unit-2-device-pairing-approval-gate
```

---

## Self-review checklist

- [ ] Schema enriched with 5 optional fields; tests cover their presence.
- [ ] `deriveResponderFingerprint` deterministic, 8 uppercase hex.
- [ ] Approval card shows label · OS · first-seen · fingerprint (no location).
- [ ] Responder waiting screen shows the matching fingerprint.
- [ ] Rejected + Timed-out terminal screens render with `bg-bg` + Lattice.
- [ ] `me.root.pendingPairings` populated by `createPairingInvite`.
- [ ] TrustedDevicePrompt mounted at App root.
- [ ] Cross-device approve limitation honestly documented in code + commit (Reject works everywhere; Approve works fully only on initiating device for v1).
- [ ] Devices section button labelled "Forget this device" + explainer paragraph present.
- [ ] No regressions to other tests.
