# Feedback Round 2 — Bundle C (confirm() → modal migration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all seven native `confirm()` calls with an app-styled modal confirmation, via one reusable promise-based `useConfirm()` primitive.

**Architecture:** A `ConfirmProvider` (mirroring the `ToastProvider` precedent) exposes `useConfirm(): (opts) => Promise<boolean>` and renders a single `ModalShell`-based dialog for the pending request. Call sites keep their early-return shape: `if (!(await confirmDialog({...}))) return;`. The hook throws only when *invoked* without a provider — components merely rendering it stay test-compatible without wrapping. Confirmation copy is finalized here (all lowercase), including the 1:1-delete phrasing deferred from Bundle A.

**Tech Stack:** React 19 + TypeScript strict, `ModalShell`/`ModalFooter` (`src/components/modal-shell.tsx`), `PButton` from `src/ui/kit`, Vitest.

**Conventions for every task:** all copy lowercase; never remove existing `data-testid`s; new dialog testids follow `confirm-<action>`; run commands from the worktree root.

---

### Task 1: ConfirmProvider + useConfirm primitive

**Files:**
- Create: `src/components/confirm-dialog.tsx`
- Test: `tests/unit/components/confirm-dialog.test.tsx`
- Modify: `src/App.tsx:105` (mount provider)

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/components/confirm-dialog.test.tsx`:

```tsx
import { describe, test, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfirmProvider, useConfirm } from "@/components/confirm-dialog";

function Harness({ onResult }: { onResult: (ok: boolean) => void }) {
  const confirmDialog = useConfirm();
  return (
    <button
      data-testid="trigger"
      onClick={() =>
        void confirmDialog({
          title: "delete thing",
          body: "the thing will be gone.",
          confirmLabel: "delete",
        }).then(onResult)
      }
    >
      go
    </button>
  );
}

describe("ConfirmProvider / useConfirm", () => {
  test("resolves true on confirm and closes", async () => {
    const results: boolean[] = [];
    render(
      <ConfirmProvider>
        <Harness onResult={(ok) => results.push(ok)} />
      </ConfirmProvider>,
    );
    fireEvent.click(screen.getByTestId("trigger"));
    expect(await screen.findByTestId("confirm-dialog")).toBeTruthy();
    expect(screen.getByText("the thing will be gone.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(results).toEqual([true]));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  test("resolves false on cancel", async () => {
    const results: boolean[] = [];
    render(
      <ConfirmProvider>
        <Harness onResult={(ok) => results.push(ok)} />
      </ConfirmProvider>,
    );
    fireEvent.click(screen.getByTestId("trigger"));
    fireEvent.click(await screen.findByTestId("confirm-dialog-cancel"));
    await waitFor(() => expect(results).toEqual([false]));
  });

  test("resolves false on backdrop dismiss", async () => {
    const results: boolean[] = [];
    render(
      <ConfirmProvider>
        <Harness onResult={(ok) => results.push(ok)} />
      </ConfirmProvider>,
    );
    fireEvent.click(screen.getByTestId("trigger"));
    fireEvent.click(await screen.findByTestId("modal-shell-backdrop"));
    await waitFor(() => expect(results).toEqual([false]));
  });

  test("rendering useConfirm without a provider does not throw", () => {
    // Invoking would throw; merely rendering must be safe so existing
    // component tests don't need provider wrapping.
    render(<Harness onResult={() => {}} />);
    expect(screen.getByTestId("trigger")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/confirm-dialog.test.tsx`
Expected: FAIL — module `@/components/confirm-dialog` does not exist.

- [ ] **Step 3: Implement the primitive**

Create `src/components/confirm-dialog.tsx`:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ModalShell, ModalFooter } from "@/components/modal-shell";
import { PButton } from "@/ui/kit";

export type ConfirmOptions = {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** Default "cancel". */
  cancelLabel?: string;
  /** Danger styling on the confirm button. Default true (destructive confirms). */
  danger?: boolean;
  /** data-testid on the dialog card. Default "confirm-dialog". */
  testId?: string;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Promise-based confirmation, replacing native confirm() (feedback round 2:
 * all confirmations use the modal style). Resolves false on cancel, Esc, or
 * scrim click. Throws only when INVOKED without a <ConfirmProvider> so that
 * components can render under test without the provider.
 */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  return useCallback<ConfirmFn>(
    (opts) => {
      if (!fn) throw new Error("useConfirm requires <ConfirmProvider>");
      return fn(opts);
    },
    [fn],
  );
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      // Requests can't stack (native confirm() couldn't either); a second
      // request while one is open settles the first as cancelled.
      resolver.current?.(false);
      resolver.current = resolve;
      setPending(opts);
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ModalShell
          open
          onClose={() => settle(false)}
          title={pending.title}
          dataTestId={pending.testId ?? "confirm-dialog"}
          footer={
            <ModalFooter>
              <PButton
                label={pending.cancelLabel ?? "cancel"}
                className="flex-1"
                onClick={() => settle(false)}
                data-testid="confirm-dialog-cancel"
              />
              <PButton
                danger={pending.danger !== false}
                primary={pending.danger === false}
                label={pending.confirmLabel}
                className="flex-1"
                onClick={() => settle(true)}
                data-testid="confirm-dialog-confirm"
              />
            </ModalFooter>
          }
        >
          <div className="font-body text-ui-sub text-dim">{pending.body}</div>
        </ModalShell>
      )}
    </ConfirmContext.Provider>
  );
}
```

Note on testids: the dialog card's testid varies per call site (`opts.testId`), but the confirm/cancel button testids are fixed (`confirm-dialog-confirm` / `confirm-dialog-cancel`) — only one dialog can be open at a time.

- [ ] **Step 4: Mount the provider**

In `src/App.tsx`, the provider stack at lines 103–105 currently ends with `<ToastProvider>`. Add the import and wrap `ToastProvider`'s children with `ConfirmProvider`:

```tsx
import { ConfirmProvider } from "@/components/confirm-dialog";
```

```tsx
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <ConfirmProvider>
              {/* existing children of ToastProvider, unchanged */}
            </ConfirmProvider>
          </ToastProvider>
```
(Close the tag where ToastProvider closes. Do not reorder the other providers.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/components/confirm-dialog.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck` — expected: exit 0.
```bash
git add src/components/confirm-dialog.tsx tests/unit/components/confirm-dialog.test.tsx src/App.tsx
git commit -m "feat(ui): promise-based useConfirm modal primitive"
```

---

### Task 2: migrate profile-view (remove avatar + delete 1:1)

**Files:**
- Modify: `src/components/profile-view.tsx` (~line 224 and ~line 301, plus one import + one hook)

- [ ] **Step 1: Add the hook**

In `src/components/profile-view.tsx`, add to the imports:
```tsx
import { useConfirm } from "@/components/confirm-dialog";
```
and near the other hooks at the top of the component (it already calls `useToast()`):
```tsx
const confirmDialog = useConfirm();
```

- [ ] **Step 2: Migrate remove-avatar (~line 224)**

Current:
```tsx
async function handleAvatarRemove() {
  if (!confirm("remove your profile picture?")) return;
```
New:
```tsx
async function handleAvatarRemove() {
  const ok = await confirmDialog({
    title: "remove profile picture",
    body: "your profile picture will be removed for everyone.",
    confirmLabel: "remove",
    testId: "confirm-remove-avatar",
  });
  if (!ok) return;
```
(rest of the function unchanged)

- [ ] **Step 3: Migrate delete-1:1 with the final phrasing (~line 301)**

This lands the phrasing item deferred from Bundle A: the user must learn that the counterpart sees a "left" event and that the history is gone. Current:
```tsx
async function handleDeleteConversation() {
  if (!convo1to1) return;
  if (!confirm("delete this conversation? your copy is removed for good — messaging them again starts fresh.")) return;
```
New (`contact` is already in scope in this component — it's used by `handleMessage`):
```tsx
async function handleDeleteConversation() {
  if (!convo1to1) return;
  const name = contact?.displayNameLocal ?? "the other person";
  const ok = await confirmDialog({
    title: "delete conversation",
    body: `your copy is deleted for good — you lose this history. ${name} keeps their copy and will see that you left. messaging them again starts fresh.`,
    confirmLabel: "delete conversation",
    testId: "confirm-delete-conversation",
  });
  if (!ok) return;
```
(rest unchanged — `leaveConversation` + toast)

If `contact` is not in scope in this exact function, use the same variable `handleMessage` uses; do not add new data plumbing.

- [ ] **Step 4: Verify existing tests still pass**

Run: `npx vitest run tests/unit/components/profile-view.test.tsx`
Expected: PASS (the component renders `useConfirm` but tests never invoke it; no provider wrap needed).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` — expected: exit 0.
```bash
git add src/components/profile-view.tsx
git commit -m "fix(profile): modal confirmations for avatar removal + 1:1 delete (final phrasing)"
```

---

### Task 3: migrate members route (remove member + leave)

**Files:**
- Modify: `src/routes/conversations/members.tsx` (~lines 308, 324, plus import + hook)

- [ ] **Step 1: Add the hook**

```tsx
import { useConfirm } from "@/components/confirm-dialog";
```
and inside the component:
```tsx
const confirmDialog = useConfirm();
```

- [ ] **Step 2: Migrate remove-member (~line 308)**

Current:
```tsx
async function handleRemove(accountID: string) {
  if (!confirm("Remove this member from the conversation?")) return;
```
New:
```tsx
async function handleRemove(accountID: string) {
  const ok = await confirmDialog({
    title: "remove member",
    body: "they will lose access to this conversation and its messages.",
    confirmLabel: "remove",
    testId: "confirm-remove-member",
  });
  if (!ok) return;
```

- [ ] **Step 3: Migrate leave (~line 324)**

Current:
```tsx
  if (
    !confirm(
      "Leave this conversation? You will lose access to its messages.",
    )
  )
    return;
```
New (the last-admin promote branch above it is unchanged):
```tsx
  const ok = await confirmDialog({
    title: "leave conversation",
    body: "you lose access to its messages. others keep their copies and will see that you left.",
    confirmLabel: "leave",
    testId: "confirm-leave-conversation",
  });
  if (!ok) return;
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `npx vitest run tests/unit/routes/conversations/members-redirect.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` — expected: exit 0.
```bash
git add src/routes/conversations/members.tsx
git commit -m "fix(members): modal confirmations for remove-member + leave"
```

---

### Task 4: migrate settings (forget device + sign out)

**Files:**
- Modify: `src/routes/settings/index.tsx` (~lines 157, 198, plus import + hook)

- [ ] **Step 1: Add the hook**

```tsx
import { useConfirm } from "@/components/confirm-dialog";
```
and inside the component:
```tsx
const confirmDialog = useConfirm();
```

- [ ] **Step 2: Migrate forget-device (~line 157)** — note the function becomes async

Current:
```tsx
function handleRevoke(idx: number) {
  const device = activeDevices[idx];
  if (!device) return;
  const confirmed = confirm(
    "Forget this device? It stays hidden from your list, but anything already synced to it remains readable. Full cryptographic revocation lands in a later release.",
  );
  if (confirmed) (device as any).$jazz.set("revoked", true);
}
```
New:
```tsx
async function handleRevoke(idx: number) {
  const device = activeDevices[idx];
  if (!device) return;
  const ok = await confirmDialog({
    title: "forget device",
    body: "it stays hidden from your list, but anything already synced to it remains readable. full cryptographic revocation lands in a later release.",
    confirmLabel: "forget device",
    testId: "confirm-forget-device",
  });
  if (ok) (device as any).$jazz.set("revoked", true);
}
```
Check the call site(s) of `handleRevoke` in this file: an `onClick={() => handleRevoke(i)}` works unchanged; if it's passed as a bare reference where a sync handler is expected, wrap it as `() => void handleRevoke(i)`.

- [ ] **Step 3: Migrate sign-out (~line 198)**

Current:
```tsx
async function handleSignOut() {
  if (
    !confirm(
      "Sign out? You'll need your password to sign back in. Local data will be cleared.",
    )
  )
    return;
```
New:
```tsx
async function handleSignOut() {
  const ok = await confirmDialog({
    title: "sign out",
    body: "you'll need your password to sign back in. local data on this device is cleared.",
    confirmLabel: "sign out",
    testId: "confirm-sign-out",
  });
  if (!ok) return;
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `npx vitest run tests/unit/routes/settings/settings-index.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` — expected: exit 0.
```bash
git add src/routes/settings/index.tsx
git commit -m "fix(settings): modal confirmations for forget-device + sign-out"
```

---

### Task 5: migrate chat detail (delete message)

**Files:**
- Modify: `src/routes/conversations/detail.tsx` (~line 622, plus import + hook)

- [ ] **Step 1: Add the hook**

```tsx
import { useConfirm } from "@/components/confirm-dialog";
```
and inside the component (it already calls other hooks near the top):
```tsx
const confirmDialog = useConfirm();
```

- [ ] **Step 2: Migrate delete-message (~line 622)**

Current:
```tsx
async function handleDeleteMessage(message: any) {
  if (!confirm("Delete this message for everyone in this chat?")) return;
  await deleteMessage(me as any, message);
}
```
New:
```tsx
async function handleDeleteMessage(message: any) {
  const ok = await confirmDialog({
    title: "delete message",
    body: "this message is deleted for everyone in this chat.",
    confirmLabel: "delete",
    testId: "confirm-delete-message",
  });
  if (!ok) return;
  await deleteMessage(me as any, message);
}
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `npx vitest run tests/unit/routes/conversations/detail-divider.test.tsx tests/unit/routes/conversations/detail-header.test.tsx`
Expected: PASS.

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck` — expected: exit 0.
```bash
git add src/routes/conversations/detail.tsx
git commit -m "fix(chat): modal confirmation for message deletion"
```

---

### Task 6: bundle gates + native-confirm sweep

**Files:** none new — verification only (fix fallout if any).

- [ ] **Step 1: Native-confirm sweep**

Run:
```bash
grep -rn "confirm(" src/ | grep -v "useConfirm\|confirmDialog\|ConfirmProvider\|confirm-dialog\|ConfirmOptions\|ConfirmFn\|onConfirm\|approveConnectionRequest"
```
Expected: no `window.confirm`/bare `confirm(` calls remain. Fix any straggler by the same migration pattern.

- [ ] **Step 2: Full gates**

Run each; all must pass:
```bash
npm run typecheck
npm run check-tokens
npm run check-ui-purity
npx vitest run
nix-shell --run "npm run parity"
```
Expected: exit 0 each; vitest total grows by the 4 new confirm-dialog tests. Parity is unaffected by this bundle (no kit/proto changes) but runs as the bundle convention.

- [ ] **Step 3: Commit any gate fixes**

Only if needed:
```bash
git add -A && git commit -m "fix(ui): bundle C gate fallout"
```
