# Unit 9-0 — Connection-request delivery fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a sent connection request reliably arrive in the recipient's incoming-request set, so the contacts-tab pending section + QR-channel pop-up (9-7) can be built and validated end-to-end.

**Architecture:** This is a **diagnosis-first** plan. The delivery path is `createConnectionRequest` (sender mints a `ConnectionRequest`, delivers via `InboxSender.load(recipientID, me).sendMessage`) → recipient's `useIncomingConnectionRequests` (`Inbox.load(me).subscribe(ConnectionRequest, …)`). The failure ("request never shows up") has several candidate causes; Phase 1 is an instrumentation spike that **confirms the actual cause before any fix**. Phase 2 applies the fix matching the diagnosis. Phase 3 adds a regression test.

**Tech Stack:** jazz-tools 0.20.18 (Inbox / InboxSender), React 18 + TS strict, Playwright (e2e, via nix-shell), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-23-unit-9-ia-interaction-design.md` § 9-0.

**Key files:**
- `src/jazz/invitations.ts` — `createConnectionRequest` (~line 214), `approveConnectionRequest`, `dismissConnectionRequest`
- `src/jazz/use-incoming-connection-requests.ts` — the subscription hook
- `src/components/incoming-connection-prompt.tsx` — QR-channel pop-up consumer
- `src/routes/connections/pending.tsx` — pending list surface
- `src/jazz/schema/ConnectionRequest.ts` — the CoValue schema
- `src/jazz/schema/ArcanAccount.ts` — account migration (inbox setup)

---

## Phase 0 · Setup

### Task 0.1: Branch + clean tree + rebuild native deps

```bash
cd /home/nox/Documents/Projects/Nox/arcan
git status --short        # expect only .claude/ + ArcanUI.zip untracked
git checkout main && git pull --ff-only
git checkout -b unit-9-0-connection-delivery
# Native module ABI can drift if Node changed since last install:
nix-shell --run 'cd api && npm rebuild better-sqlite3 && cd .. && npm rebuild better-sqlite3'
```

### Task 0.2: Read the three delivery-path files end to end

- [ ] Read `src/jazz/invitations.ts` lines 197-310 (the ConnectionRequest section).
- [ ] Read `src/jazz/use-incoming-connection-requests.ts` (whole file).
- [ ] Read `src/jazz/schema/ConnectionRequest.ts` and the inbox-setup block in `src/jazz/schema/ArcanAccount.ts` (search `inbox` / `Inbox`).
- [ ] Identify every component that mounts `useIncomingConnectionRequests` (grep). Note whether `/connections/pending` reads from this hook or from somewhere else.

```bash
grep -rn "useIncomingConnectionRequests\|Inbox.load\|InboxSender" src/
```

Write a 3-5 line note in the PR/commit scratch of what consumes the hook today. (This is reconnaissance, not a code change.)

---

## Phase 1 · Diagnosis spike (CHECKPOINT — do not write the fix yet)

The goal: a deterministic two-account reproduction with enough instrumentation to pin the cause to exactly one of the candidate buckets below.

### Task 1.1: Write a throwaway two-account e2e reproduction

**Files:**
- Create (throwaway, deleted in Task 1.4): `tests/e2e/_spike-connection-delivery.spec.ts`

- [ ] **Step 1: Write the repro**

This drives the real two-sided handshake across two browser contexts on the same sync server, with console capture, and asserts the recipient's hook surfaces the request. It is expected to FAIL initially — that failure is the bug.

```typescript
// tests/e2e/_spike-connection-delivery.spec.ts — THROWAWAY (deleted Task 1.4)
import { test, expect } from "@playwright/test";
import { createAccount, readInviteUrl } from "./helpers"; // mirror existing helpers

test("connection request reaches recipient pending set", async ({ browser }) => {
  // Bob (recipient) — signs up, opens /contacts/add, exposes invite URL.
  const bobCtx = await browser.newContext();
  const bob = await bobCtx.newPage();
  bob.on("console", (m) => console.log("[BOB]", m.type(), m.text()));
  await createAccount(bob, "bob");
  await bob.goto("/contacts/add");
  const inviteUrl = await readInviteUrl(bob); // [data-testid="qr-url-text"]

  // Alice (requester) — signs up, opens the invite, accepts → mints request.
  const aliceCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  alice.on("console", (m) => console.log("[ALICE]", m.type(), m.text()));
  await createAccount(alice, "alice");
  await alice.goto(inviteUrl);
  await alice.getByTestId("invite-accept-btn").click();
  await alice.getByTestId("invite-sent").waitFor({ timeout: 20_000 });

  // Bob — navigate to the pending surface; the request should appear.
  await bob.goto("/connections/pending");
  await expect(bob.getByTestId("pending-request-row").first()).toBeVisible({
    timeout: 30_000,
  });
});
```

- [ ] **Step 2: Run it (expect FAIL) with full logs**

```bash
nix-shell --run 'npm run audit:capture >/dev/null 2>&1 || true'   # ensures fixtures compile; ignore
nix-shell --run 'npx playwright test tests/e2e/_spike-connection-delivery.spec.ts --project=chromium' 2>&1 | tee /tmp/spike.log
```

Note whether it fails at "invite-sent" (sender side never completes) or at "pending-request-row" (delivery/subscription side).

### Task 1.2: Instrument the delivery path (temporary logging)

**Files:**
- Modify (temporary, reverted in Task 1.4): `src/jazz/invitations.ts`, `src/jazz/use-incoming-connection-requests.ts`

- [ ] **Step 1: Log the sender path**

In `createConnectionRequest`, add temporary `console.log`s around: the recipient account ID resolved, `InboxSender.load(...)` success/throw, and `sender.sendMessage(request)` resolution + the returned request `$jazz.id`.

- [ ] **Step 2: Log the recipient path**

In `useIncomingConnectionRequests`, add temporary `console.log`s for: `Inbox.load(me)` success/throw, the subscribe callback firing (with `req.$jazz.id`), and the post-filter `items` length.

- [ ] **Step 3: Re-run the spike, read the logs**

```bash
nix-shell --run 'npx playwright test tests/e2e/_spike-connection-delivery.spec.ts --project=chromium' 2>&1 | tee /tmp/spike.log
grep -E "\[BOB\]|\[ALICE\]" /tmp/spike.log
```

### Task 1.3: Classify the cause (CHECKPOINT)

Map the logs to exactly one bucket. **Stop and record the finding before proceeding.** Candidate causes and their tells:

| # | Cause | Tell in logs | Fix lives in |
|---|---|---|---|
| **A** | Sender never delivers — `InboxSender.load` throws / `sendMessage` rejects | `[ALICE]` shows an inbox error; no "sent id=…" line | `createConnectionRequest` (invitations.ts) |
| **B** | Recipient inbox not set up — `Inbox.load(me)` throws on the recipient | `[BOB]` shows "inbox subscribe failed" / "account has not set up their inbox" | `ArcanAccount` migration (ensure inbox created) |
| **C** | Subscription races migration — inbox loads but the subscribe callback never fires for a request that WAS sent | `[ALICE]` "sent id=X" present, `[BOB]` no "callback fired id=X" | subscription setup / resolve depth in the hook |
| **D** | Delivered + callback fires, but the request is filtered out before render | `[BOB]` "callback fired id=X" present, but post-filter items length 0 | the filter in `useIncomingConnectionRequests` (approved/expired/dismissed predicate) |
| **E** | Delivered + in state, but no surface consumes the hook | hook items > 0 but `/connections/pending` reads a different source | `pending.tsx` wiring (this overlaps 9-7) |

- [ ] Record the confirmed bucket (single letter) + the specific log evidence in the commit message scratch. This gates Phase 2.

---

## Phase 2 · Fix (apply ONLY the branch matching the Phase 1 diagnosis)

Each branch below is self-contained. Implement the one matching the confirmed bucket. If the diagnosis implicates two buckets (e.g. B+C), do both.

### Task 2.A: Cause A — sender delivery failure

- [ ] In `createConnectionRequest` (`src/jazz/invitations.ts`), make the recipient-account load explicit and fail loudly: `await loadAccountByID(me, recipientID)` (mirror the pattern in `conversation.ts`'s `findOrCreate1to1Conversation`) before `InboxSender.load`, and `await` the send with a try/catch that rethrows a descriptive error instead of swallowing. Ensure the notification group adds the recipient as `writer` (the comment at invitations.ts:229 says this is required so InboxSender can add them without conflict — verify the group is actually `Group.create({ owner: me })` with no pre-added admin role for the recipient).

### Task 2.B: Cause B — recipient inbox not set up

- [ ] In `src/jazz/schema/ArcanAccount.ts` migration, ensure `me.profile.inbox` is created on account setup (search the migration for the inbox block; if it's guarded behind a condition that the fresh-signup path misses, create it unconditionally). The recipient must have a readable Inbox CoValue before anyone can `InboxSender.load` it.

### Task 2.C: Cause C — subscription races migration / wrong setup

- [ ] In `useIncomingConnectionRequests`, ensure `Inbox.load(me)` is awaited only after `me` is fully loaded with the depth the inbox needs (the hook resolves `{ root: { dismissedRequestIDs: true } }` but may need `profile: { inbox: true }`). Add `profile: { inbox: true }` (or whatever depth `Inbox.load` requires) to the resolve. Re-subscribe when the inbox identity changes.

### Task 2.D: Cause D — over-aggressive filter

- [ ] In `useIncomingConnectionRequests`, fix the filter so a freshly-delivered, un-approved, un-expired, un-dismissed request is retained. Check the `expiresAt`/`approvedAt` field access against the actual `ConnectionRequest` schema field names (`.shape` introspection) — a typo'd field reads `undefined` and the predicate may wrongly drop it.

### Task 2.E: Cause E — no surface consumes the hook

- [ ] Defer to 9-7 (pending section). For 9-0, only ensure the hook returns the request; add a minimal `[data-testid="pending-request-row"]` render in `pending.tsx` so the regression test has a target. (Full pending-section design is 9-7.)

### Task 2.x: Commit the fix

```bash
git add src/jazz/ src/routes/connections/
git commit -m "fix(connections): <cause-letter> — connection request now reaches recipient

Phase 1 diagnosis: <one-line evidence>. <what the fix changed>.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 3 · Regression test + cleanup

### Task 3.1: Promote the spike to a permanent e2e regression test

**Files:**
- Create: `tests/e2e/connection-request-delivery.spec.ts`
- Delete: `tests/e2e/_spike-connection-delivery.spec.ts`

- [ ] **Step 1:** Copy the spike spec to the permanent path, remove the per-page `console.log` listeners, keep the assertion that `pending-request-row` becomes visible.
- [ ] **Step 2: Run it green**

```bash
nix-shell --run 'npx playwright test tests/e2e/connection-request-delivery.spec.ts --project=chromium' 2>&1 | tail -10
```
Expected: 1 passed.

### Task 3.2: Revert all temporary instrumentation

- [ ] Remove every temporary `console.log` added in Task 1.2 from `invitations.ts` + `use-incoming-connection-requests.ts`.
- [ ] Confirm the throwaway spike file is deleted.

```bash
grep -rn "console.log" src/jazz/invitations.ts src/jazz/use-incoming-connection-requests.ts   # expect no temp logs
ls tests/e2e/_spike-connection-delivery.spec.ts 2>&1   # expect: No such file
```

### Task 3.3: Full verification + commit

```bash
nix-shell --run 'npm run check-tokens' 
nix-shell --run 'npx tsc -b --noEmit'
nix-shell --run 'npx vitest run' 2>&1 | tail -5
git add tests/e2e/ src/jazz/
git commit -m "test(connections): e2e regression — connection request delivery

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Self-review checklist

- [ ] Phase 1 produced a single confirmed cause bucket with log evidence (not a guess).
- [ ] Only the matching Phase 2 branch(es) were implemented.
- [ ] All temporary instrumentation reverted; throwaway spike deleted.
- [ ] Permanent e2e regression test passes.
- [ ] `check-tokens` + `tsc -b --noEmit` + `vitest run` all clean.
- [ ] No change to the *UI* of where requests surface (that's 9-7) beyond the minimal test-target row.
