# Feedback Round 2 — Bundle D (decline propagation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A declined connection request becomes visible to the requester: `deniedAt` lands on the shared ConnectionRequest CoValue, the waiting screen shows a terminal "declined" state, and the QR popup gains an explicit decline button (closing still = dismiss, per the standing 2026-07-08 decision).

**Architecture:** The recipient already has writer access to the request CoValue (that's how `approvedAt` is stamped by `approveConnectionRequest`), so `denyConnectionRequest` simply also stamps `deniedAt`. Both pending surfaces call `denyConnectionRequest`, so they propagate automatically. The requester's 3s poll in `/invite` checks `deniedAt` alongside `approvedAt`.

---

### Task 1: schema + deny stamps deniedAt

**Files:**
- Test: `tests/unit/jazz/connection-request-actions.test.ts`
- Modify: `src/jazz/schema/ConnectionRequest.ts`
- Modify: `src/jazz/invitations.ts` (denyConnectionRequest)

- [ ] **Step 1: Extend the unit test first (TDD)**

In `tests/unit/jazz/connection-request-actions.test.ts`, the `makeRecipient` fixture requests are plain `{ $jazz: { id } }` objects. Extend the deny tests: give the request object a `$jazz.set` spy and no `deniedAt`, then assert:
```ts
  test("stamps deniedAt on the shared request", async () => {
    const { recipient } = makeRecipient(["req-1"]);
    const setSpy = vi.fn();
    const request = { $jazz: { id: "req-1", set: setSpy } } as any;
    await denyConnectionRequest(recipient as any, request);
    expect(setSpy).toHaveBeenCalledWith("deniedAt", expect.any(Date));
  });

  test("does not re-stamp deniedAt when already set", async () => {
    const { recipient } = makeRecipient(["req-1"]);
    const setSpy = vi.fn();
    const request = {
      deniedAt: new Date(),
      $jazz: { id: "req-1", set: setSpy },
    } as any;
    await denyConnectionRequest(recipient as any, request);
    expect(setSpy).not.toHaveBeenCalled();
  });
```
Also update the existing deny tests' request objects to carry a `set: vi.fn()` so they don't crash. Run the file: new tests FAIL.

- [ ] **Step 2: Schema**

`src/jazz/schema/ConnectionRequest.ts`:
```ts
  approvedAt: z.date().optional(),
  deniedAt: z.date().optional(),
```

- [ ] **Step 3: denyConnectionRequest**

In `src/jazz/invitations.ts`, at the top of `denyConnectionRequest` (before the local cleanup):
```ts
  const r = request as any;
  // Feedback round 2: propagate the decision — the requester's waiting
  // screen watches deniedAt (recipient has writer access to the request
  // CoValue, same mechanism approveConnectionRequest uses for approvedAt).
  if (!r.deniedAt && typeof r.$jazz?.set === "function") {
    r.$jazz.set("deniedAt", new Date());
  }
```
Update the function's doc comment — the "the requester is not notified" sentence is no longer true; describe the new behavior.

- [ ] **Step 4: Verify + commit**

`npx vitest run tests/unit/jazz/connection-request-actions.test.ts` PASS; `npx vitest run` PASS; `npm run typecheck` exit 0.
```bash
git add src/jazz/schema/ConnectionRequest.ts src/jazz/invitations.ts tests/unit/jazz/connection-request-actions.test.ts
git commit -m "feat(connections): denyConnectionRequest stamps deniedAt on the shared request"
```

---

### Task 2: explicit decline button on the QR popup

**Files:**
- Test: `tests/unit/components/incoming-connection-prompt.test.tsx`
- Modify: `src/components/incoming-connection-prompt.tsx`

- [ ] **Step 1: Test first (TDD)**

The test file already mocks `@/jazz/invitations` (approve + dismiss). Extend the mock with `denyConnectionRequest: vi.fn(async () => undefined)` and add:
```tsx
  test("decline button denies the request", async () => {
    pendingMock.mockReturnValue([makeEntry(false)]);
    const { denyConnectionRequest } = await import("@/jazz/invitations");
    render(
      <ToastProvider>
        <IncomingConnectionPrompt />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByTestId("decline"));
    await waitFor(() => expect(denyConnectionRequest).toHaveBeenCalled());
  });
```
Run: FAIL (no decline testid).

- [ ] **Step 2: Component**

In `src/components/incoming-connection-prompt.tsx`:
- import `denyConnectionRequest` alongside the others;
- handler in `Body`:
```tsx
  const onDecline = async () => {
    await denyConnectionRequest(me, request);
    toast({ icon: "close", text: "request declined", tone: "neutral" });
  };
```
- footer becomes three buttons (closing/scrim/Escape still = dismiss — unchanged):
```tsx
        <ModalFooter>
          <PButton
            label="dismiss"
            className="flex-1"
            onClick={onDismiss}
            data-testid="dismiss"
          />
          <PButton
            danger
            label="decline"
            className="flex-1"
            onClick={onDecline}
            data-testid="decline"
          />
          <PButton
            primary
            label="approve"
            className="flex-1"
            onClick={onApprove}
            data-testid="approve"
          />
        </ModalFooter>
```
Update the component's header comment: dismiss mutes; decline is the explicit terminal "no" and now notifies the requester.
(If the toast `icon: "close"` isn't a valid toast icon, use `icon: "check"` like the pending surfaces do.)

- [ ] **Step 3: Verify + commit**

`npx vitest run tests/unit/components/incoming-connection-prompt.test.tsx` PASS (all tests); `npm run typecheck` exit 0.
```bash
git add src/components/incoming-connection-prompt.tsx tests/unit/components/incoming-connection-prompt.test.tsx
git commit -m "feat(connections): explicit decline on the QR popup (close still = dismiss)"
```

---

### Task 3: requester sees "declined"

**Files:**
- Modify: `src/routes/invite/index.tsx`

- [ ] **Step 1: Poll + phase**

- Add `"declined"` to the phase union type (find the `useState<…>` / type for `phase`).
- In the polling effect (~lines 176-206), after the `approvedAt` branch:
```ts
        } else if (r.deniedAt) {
          clearInterval(interval);
          setPhase("declined");
        } else if (r.expiresAt && new Date(r.expiresAt).getTime() < Date.now()) {
```
- Render branch (next to the other terminal phases):
```tsx
    if (phase === "declined") {
      return (
        <InviteStatusScreen
          markSize={48}
          title="request declined"
          sub="they declined your request."
          rootTestId="invite-declined"
          outline={{
            label: "back to app",
            onClick: () => navigate("/"),
          }}
          outlineTestId="invite-declined-home-btn"
        />
      );
    }
```

- [ ] **Step 2: Verify + commit**

`npx vitest run tests/unit/routes/invite-confirm.test.tsx` PASS; `npm run typecheck` exit 0.
```bash
git add src/routes/invite/index.tsx
git commit -m "feat(invite): requester's waiting screen shows a declined state"
```

---

### Task 4: e2e decline round-trip

**Files:**
- Create: `tests/e2e/connection-request-decline.spec.ts`

- [ ] **Step 1: Write the spec**

Model it on `tests/e2e/connection-request-delivery.spec.ts` (two contexts, `createAccount` helper, link-channel invite). Flow:
1. Bob creates an account, opens `/contacts/add`, expose `copy-url-text` invite URL.
2. Alice creates an account, opens the invite URL, clicks `invite-accept-btn`, sees `invite-sent`.
3. Bob navigates to `/connections/pending`, waits for the pending row, clicks the deny button (`data-testid="deny"`).
4. Alice's page (still on the invite tab) shows `invite-declined` within the poll interval:
```ts
    await expect(alice.getByTestId("invite-declined")).toBeVisible({
      timeout: 30_000,
    });
```
Also assert Bob's pending list is empty afterwards (`pending-empty` visible or row count 0).

- [ ] **Step 2: Run it**

Run: `nix-shell --run "npx playwright test tests/e2e/connection-request-decline.spec.ts --project=chromium"` (check `playwright.config.ts` for how e2e boots the sync server/dev server — follow whatever the delivery spec needs). Expected: PASS. If the e2e stack cannot run in this environment, report DONE_WITH_CONCERNS with the exact blocker — do not fake the result.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/connection-request-decline.spec.ts
git commit -m "test(e2e): decline round-trip — deniedAt reaches the requester's waiting screen"
```

---

### Task 5: bundle gates

```bash
npm run typecheck && npm run check-tokens && npm run check-ui-purity && npx vitest run && nix-shell --run "npm run parity"
```
All pass; commit fixes only if needed (`fix(connections): bundle D gate fallout`).
