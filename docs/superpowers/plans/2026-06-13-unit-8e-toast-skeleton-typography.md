# Unit 8e — Toast + skeleton call-sites + section typography pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `useToast()` where action sites still use inline status or silently mutate; swap inline `"Loading…"` strings for the Unit 7 skeleton primitives; project-wide lowercase pass on section/page titles in surfaces this sub-unit owns; and apply the design-aligned welcome-step subtitle + three-CTA layout.

**Architecture:** No new primitives. Reuse `useToast()` (`src/components/toast.tsx`) and the `Skel` / `NavListSkeleton` / `ChatHeaderSkeleton` / `ChatMessagesSkeleton` primitives (`src/components/skeleton.tsx`) shipped by Unit 7. Onboarding welcome step gets a new `onSignInWithPassword` prop and a third CTA row; the parent (`routes/onboarding/index.tsx`) wires it to `navigate("/auth/login")` — reusing the existing path used today by the restore-choice step.

**Tech Stack:** TypeScript strict, React 18, Tailwind v3 utilities mapped to Nox Noir tokens, Vitest 4 + `@testing-library/react` for unit tests, jazz-tools 0.20.18 for the Jazz schema integrations already in the routes.

**Spec / inputs:**

- Audit doc: `docs/superpowers/specs/2026-06-13-unit-8-audit.md`
  - Rows: AUDIT-023, 024, 031, 032, 033, 034, 043, 044
  - Headline observations: #5 (lowercase section titles), #6 (welcome subtitle), #7 (welcome CTAs)
- Design reference: `design/Arcan Prototype.html`, `design/hf-settings.jsx`, `design/hf-flows.jsx`
- Unit 7 conventions: `CLAUDE.md` → "Visual conventions" section (tokens enforced by `scripts/check-tokens.sh`)

**Branch:** `unit-8e-toast-skeleton-typography` off `main` at `f3187a2` (the Phase A audit merge).

**Linear:** team=Nox, project=Arcan.

**Out of scope (do NOT touch in this sub-unit):**

- `src/jazz/provider.tsx` boot-time "Loading…" fallback. Lives outside the React app's ToastProvider/Skel-friendly tree (no token CSS guaranteed until app shell renders). Audit row applies to in-app surfaces only.
- Auth/onboarding/pair surface heading typography beyond the welcome-step subtitle + CTAs. Headings like "Create your account" (`credentials-step.tsx`), "Sign in" (`auth/login.tsx`), "Recover account" (`auth/recovery.tsx`), pair-* headings — all owned by sub-unit 8a (AuthSurface).
- Modal heading typography ("Change password", "View recovery code"). Owned by sub-unit 8c (Modal shell).
- New empty-state copy / CTAs. Owned by sub-unit 8b (EmptyPane).
- Mobile chrome / safe-area fixes carried by the AUDIT-024/032/034/044 mobile rows. Owned by 8d.

---

## Phase structure

| Phase | Purpose |
|---|---|
| 0 | Setup + read-only verification of current state |
| 1 | Toast wiring on settings save / toggle actions |
| 2 | Toast wiring on connection-dismiss + conversation-rename |
| 3 | Contacts copy-toast regression test (already wired; lock it in) |
| 4 | Skeleton swap — sidebar + section-level (settings) |
| 5 | Skeleton swap — full-pane (conversations + members + contacts + profile-view) |
| 6 | Lowercase section title pass — settings sections |
| 7 | Lowercase pass — settings root, contacts standalone, change-password modal (action-button only) |
| 8 | Welcome step subtitle + three-CTA layout |
| 9 | Final verification |

---

## Phase 0 · Setup

### Task 0.1: Create the branch from f3187a2

**Files:** none

- [ ] **Step 1: Verify clean working tree**

```bash
git -C /home/nox/Documents/Projects/Nox/arcan status
```

Expected: `nothing to commit, working tree clean` (or only `.claude/` / planning docs as untracked — those are fine).

- [ ] **Step 2: Create the branch**

```bash
git -C /home/nox/Documents/Projects/Nox/arcan switch -c unit-8e-toast-skeleton-typography f3187a2
```

Expected: `Switched to a new branch 'unit-8e-toast-skeleton-typography'`.

- [ ] **Step 3: Confirm HEAD**

```bash
git -C /home/nox/Documents/Projects/Nox/arcan log --oneline -1
```

Expected: `f3187a2 Merge Unit 8 Phase A: audit`.

### Task 0.2: Confirm the toast + skeleton primitives shape

**Files (read-only):**

- `src/components/toast.tsx`
- `src/components/skeleton.tsx`

- [ ] **Step 1: Confirm the API surface**

Open both files. Confirm the exports below exist as documented — if any signature has drifted, stop and reconcile before continuing.

- `toast.tsx`: exports `ToastProvider`, `useToast()` returning `(opts: { text: string; icon?: string; tone?: "neutral" | "success" | "accent" | "error"; durationMs?: number }) => void`.
- `skeleton.tsx`: exports `Skel({ w, h, r })`, `NavListSkeleton({ rows })`, `ChatHeaderSkeleton()`, `ChatMessagesSkeleton()`.

No code change in this task.

- [ ] **Step 2: Confirm baseline tests are green**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run
```

Expected: all unit tests pass before any edits land.

---

## Phase 1 · Toast wiring on settings save / toggle actions

Sites that currently mutate silently or surface inline status:

- `src/routes/settings/appearance-section.tsx` — `apply({ theme })` / `apply({ accent })`
- `src/routes/settings/notifications-section.tsx` — sound toggle, browser-enable success, browser-disable
- `src/routes/settings/change-password-modal.tsx` — success path uses inline `<p className="text-sm text-green">…`

### Task 1.1: Toast on appearance theme change (TDD)

**Files:**

- Modify: `src/routes/settings/appearance-section.tsx`
- Modify: `tests/unit/routes/settings/appearance-section.test.tsx`

- [ ] **Step 1: Extend the existing test to assert a toast fires on theme click**

Replace the file contents with:

```tsx
import { describe, test, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { ThemeProvider } from "@/styles/use-theme";
import { AccentProvider } from "@/styles/use-accent";
import { ToastProvider } from "@/components/toast";
import { AppearanceSection } from "@/routes/settings/appearance-section";

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    root: {
      settings: {
        appearance: {
          theme: "dark",
          accent: "tokyo",
          $jazz: { set: vi.fn() },
        },
      },
    },
  }),
}));

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ThemeProvider>
        <AccentProvider>{children}</AccentProvider>
      </ThemeProvider>
    </ToastProvider>
  );
}

describe("AppearanceSection", () => {
  test("clicking 'light' updates the document attribute", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { getByTestId } = render(
      <Wrap>
        <AppearanceSection />
      </Wrap>
    );
    fireEvent.click(getByTestId("theme-light"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  test("clicking an accent swatch updates the document attribute", () => {
    document.documentElement.setAttribute("data-accent", "tokyo");
    const { getByTestId } = render(
      <Wrap>
        <AppearanceSection />
      </Wrap>
    );
    fireEvent.click(getByTestId("accent-violet"));
    expect(document.documentElement.getAttribute("data-accent")).toBe("violet");
  });

  test("clicking 'light' fires an 'appearance updated' toast", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { getByTestId } = render(
      <Wrap>
        <AppearanceSection />
      </Wrap>
    );
    fireEvent.click(getByTestId("theme-light"));
    expect(screen.getByText("appearance updated")).toBeTruthy();
  });

  test("clicking an accent swatch fires an 'appearance updated' toast", () => {
    document.documentElement.setAttribute("data-accent", "tokyo");
    const { getByTestId } = render(
      <Wrap>
        <AppearanceSection />
      </Wrap>
    );
    fireEvent.click(getByTestId("accent-violet"));
    expect(screen.getByText("appearance updated")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run tests/unit/routes/settings/appearance-section.test.tsx
```

Expected: the two new "fires an 'appearance updated' toast" tests fail.

- [ ] **Step 3: Add the toast call in the implementation**

Edit `src/routes/settings/appearance-section.tsx`. Add an import at the top, and call `toast(...)` from the existing `apply()` helper.

Add after the existing `useAccent` import:

```tsx
import { useToast } from "@/components/toast";
```

Inside `AppearanceSection`, add the `useToast` hook below the existing `useAccent` hook:

```tsx
  const toast = useToast();
```

Inside `apply`, after the existing theme + accent writes (i.e. as the last statement of the function), add:

```tsx
    toast({ icon: "check", text: "appearance updated", tone: "success" });
```

- [ ] **Step 4: Run the test, expect pass**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run tests/unit/routes/settings/appearance-section.test.tsx
```

Expected: all four tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add src/routes/settings/appearance-section.tsx tests/unit/routes/settings/appearance-section.test.tsx && git commit -m "feat(unit-8e): toast on appearance theme/accent change"
```

### Task 1.2: Toast on notifications sound toggle + browser enable/disable (TDD)

**Files:**

- Modify: `src/routes/settings/notifications-section.tsx`
- Create: `tests/unit/routes/settings/notifications-section.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routes/settings/notifications-section.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/toast";
import { NotificationsSection } from "@/routes/settings/notifications-section";

let prefsState: { sound: boolean; browser: boolean };
const setSpy = vi.fn();

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    root: {
      settings: {
        notifications: new Proxy(prefsState as any, {
          get(target, prop) {
            if (prop === "$jazz") {
              return {
                set: (k: keyof typeof prefsState, v: boolean) => {
                  setSpy(k, v);
                  (target as any)[k] = v;
                },
              };
            }
            return (target as any)[prop];
          },
        }),
      },
    },
  }),
}));

function Wrap({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("NotificationsSection", () => {
  beforeEach(() => {
    prefsState = { sound: false, browser: false };
    setSpy.mockClear();
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: Object.assign(
        function NotificationCtor() {},
        {
          permission: "default" as NotificationPermission,
          requestPermission: vi.fn(async () => "granted" as NotificationPermission),
        },
      ),
    });
  });

  test("toggling sound fires a 'notifications updated' toast", () => {
    render(
      <Wrap>
        <NotificationsSection />
      </Wrap>
    );
    fireEvent.click(screen.getByTestId("sound-toggle"));
    expect(setSpy).toHaveBeenCalledWith("sound", true);
    expect(screen.getByText("notifications updated")).toBeTruthy();
  });

  test("enabling browser notifications fires a 'notifications updated' toast on grant", async () => {
    render(
      <Wrap>
        <NotificationsSection />
      </Wrap>
    );
    fireEvent.click(screen.getByTestId("enable-browser-notifications"));
    await waitFor(() => {
      expect(setSpy).toHaveBeenCalledWith("browser", true);
    });
    expect(screen.getByText("notifications updated")).toBeTruthy();
  });

  test("disabling browser notifications fires a 'notifications updated' toast", () => {
    prefsState = { sound: false, browser: true };
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: Object.assign(function NotificationCtor() {}, {
        permission: "granted" as NotificationPermission,
        requestPermission: vi.fn(async () => "granted" as NotificationPermission),
      }),
    });
    render(
      <Wrap>
        <NotificationsSection />
      </Wrap>
    );
    fireEvent.click(screen.getByTestId("disable-browser-notifications"));
    expect(setSpy).toHaveBeenCalledWith("browser", false);
    expect(screen.getByText("notifications updated")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run tests/unit/routes/settings/notifications-section.test.tsx
```

Expected: three test failures — `screen.getByText("notifications updated")` throws because no toast is rendered.

- [ ] **Step 3: Add toast calls to NotificationsSection**

Edit `src/routes/settings/notifications-section.tsx`.

Add the import (after the existing `Button` import):

```tsx
import { useToast } from "@/components/toast";
```

Inside `NotificationsSection`, after the existing `useState` for `requestError`, add:

```tsx
  const toast = useToast();
```

Replace `handleSoundToggle` with:

```tsx
  function handleSoundToggle() {
    prefs.$jazz.set("sound", !prefs.sound);
    toast({ icon: "check", text: "notifications updated", tone: "success" });
  }
```

In `handleEnableBrowser`, inside the `if (result === "granted")` branch, after `prefs.$jazz.set("browser", true);`, add:

```tsx
        toast({ icon: "check", text: "notifications updated", tone: "success" });
```

Replace `handleDisableBrowser` with:

```tsx
  function handleDisableBrowser() {
    prefs.$jazz.set("browser", false);
    toast({ icon: "check", text: "notifications updated", tone: "success" });
  }
```

- [ ] **Step 4: Run the test, expect pass**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run tests/unit/routes/settings/notifications-section.test.tsx
```

Expected: all three tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add src/routes/settings/notifications-section.tsx tests/unit/routes/settings/notifications-section.test.tsx && git commit -m "feat(unit-8e): toast on notifications sound + browser toggle"
```

### Task 1.3: Toast on change-password success (TDD)

Background: today the modal renders an inline `<p className="text-sm text-green">…` confirmation. Replace with a toast and auto-close the modal on success.

**Files:**

- Modify: `src/routes/settings/change-password-modal.tsx`
- Create: `tests/unit/routes/settings/change-password-modal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routes/settings/change-password-modal.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/toast";
import { ChangePasswordModal } from "@/routes/settings/change-password-modal";

vi.mock("@/auth/flows", () => ({
  changePassword: vi.fn(async () => undefined),
}));

import { changePassword } from "@/auth/flows";

function Wrap({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("ChangePasswordModal", () => {
  beforeEach(() => {
    (changePassword as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  test("successful submit fires success toast and calls onClose", async () => {
    const onClose = vi.fn();
    render(
      <Wrap>
        <ChangePasswordModal onClose={onClose} />
      </Wrap>
    );

    fireEvent.change(screen.getByTestId("change-password-current"), {
      target: { value: "old-password-123" },
    });
    fireEvent.change(screen.getByTestId("change-password-new"), {
      target: { value: "new-password-1234" },
    });
    fireEvent.change(screen.getByTestId("change-password-confirm"), {
      target: { value: "new-password-1234" },
    });
    fireEvent.click(screen.getByTestId("change-password-submit"));

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText("password changed")).toBeTruthy();
    });
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run tests/unit/routes/settings/change-password-modal.test.tsx
```

Expected: failure — current code sets `done = true` and renders an inline confirmation, never toasts or auto-closes.

- [ ] **Step 3: Update the modal to toast on success and auto-close**

Edit `src/routes/settings/change-password-modal.tsx`.

Add at the top with the other imports:

```tsx
import { useToast } from "@/components/toast";
```

Remove the `done` state and its render branch. Replace the existing file body with:

```tsx
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { changePassword } from "@/auth/flows";
import { useToast } from "@/components/toast";

interface ChangePasswordModalProps {
  onClose: () => void;
}

/**
 * ChangePasswordModal: re-derives the AES key from the current password,
 * decrypts the seed envelope locally, re-encrypts it under the new
 * password's KDF key, and POSTs the new envelope + Better Auth password
 * change in one call. The server-side endpoint revokes other sessions on
 * success.
 *
 * Failure cases:
 * - Wrong current password → decrypt throws locally; no POST is made.
 * - Server rejects new password (e.g. policy) → POST returns 4xx, surfaced.
 *
 * Success surfaces as a toast ("password changed · other devices were
 * signed out") + auto-close. The inline-green confirmation used by Unit 7
 * was replaced as part of Unit 8e.
 */
export function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 12) {
      setError("New password must be at least 12 characters");
      return;
    }
    if (next !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      toast({
        icon: "check",
        text: "password changed",
        tone: "success",
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change password",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="change-password-modal"
    >
      <form
        className="bg-panel rounded-lg p-6 w-full max-w-md space-y-4"
        onSubmit={handleSubmit}
      >
        <h2 className="text-lg font-semibold">Change password</h2>
        <input
          type="password"
          placeholder="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          data-testid="change-password-current"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="password"
          placeholder="New password (≥12 chars)"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          data-testid="change-password-new"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          data-testid="change-password-confirm"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {error && (
          <p
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            data-testid="change-password-error"
          >
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isLoading}
            data-testid="change-password-submit"
            className="flex-1"
          >
            {isLoading ? "Saving…" : "Change password"}
          </Button>
        </div>
      </form>
    </div>
  );
}
```

Note: the `<h2>Change password</h2>` and the "Change password" button label remain capitalized — modal heading typography is sub-unit 8c's territory.

- [ ] **Step 4: Run the test, expect pass**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run tests/unit/routes/settings/change-password-modal.test.tsx
```

Expected: pass.

- [ ] **Step 5: Run the whole settings test directory to check no regression**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run tests/unit/routes/settings/
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add src/routes/settings/change-password-modal.tsx tests/unit/routes/settings/change-password-modal.test.tsx && git commit -m "feat(unit-8e): toast on password change success + auto-close modal"
```

---

## Phase 2 · Toast wiring on connection-dismiss + conversation-rename

### Task 2.1: Toast on connection-request dismiss (TDD)

Background: `approve` already toasts ("contact added"). `dismiss` is silent. Match the design's intent that destructive/dismissive actions still confirm.

**Files:**

- Modify: `src/routes/connections/pending.tsx`
- Create: `tests/unit/routes/connections/pending.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routes/connections/pending.test.tsx`:

```tsx
import { describe, test, expect, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/toast";
import { PendingConnectionsRoute } from "@/routes/connections/pending";

vi.mock("@/jazz/use-incoming-connection-requests", () => ({
  useIncomingConnectionRequests: () => [
    {
      request: {
        $jazz: { id: "req-1" },
        requesterDisplayName: "Bob Audit",
        requesterAccountID: "bob-account",
        requesterFingerprint: "deadbeef".repeat(4),
      },
    },
  ],
}));

vi.mock("@/hooks/use-shared-groups", () => ({
  useSharedGroups: () => [],
}));

const approveSpy = vi.fn(async () => undefined);
const dismissSpy = vi.fn(async () => undefined);

vi.mock("@/jazz/invitations", () => ({
  approveConnectionRequest: (...args: any[]) => approveSpy(...args),
  dismissConnectionRequest: (...args: any[]) => dismissSpy(...args),
}));

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "Alice" },
  }),
}));

function Wrap({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("PendingConnectionsRoute", () => {
  test("dismiss action fires a 'request dismissed' toast", async () => {
    render(
      <Wrap>
        <PendingConnectionsRoute />
      </Wrap>
    );
    fireEvent.click(screen.getByTestId("dismiss"));
    await waitFor(() => expect(dismissSpy).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByText("request dismissed")).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run tests/unit/routes/connections/pending.test.tsx
```

Expected: failure — no "request dismissed" toast in current code.

- [ ] **Step 3: Add the toast call on dismiss**

Edit `src/routes/connections/pending.tsx`. Inside `PendingCard`, replace the dismiss button's `onClick` body:

```tsx
        <Button
          variant="outline"
          className="flex-1"
          onClick={async () => {
            await dismissConnectionRequest(me, request);
            toast({ icon: "check", text: "request dismissed", tone: "neutral" });
          }}
          data-testid="dismiss"
        >dismiss</Button>
```

- [ ] **Step 4: Run the test, expect pass**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run tests/unit/routes/connections/pending.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add src/routes/connections/pending.tsx tests/unit/routes/connections/pending.test.tsx && git commit -m "feat(unit-8e): toast on connection-request dismiss"
```

### Task 2.2: Toast on conversation title save + failure

Background: `saveTitleEdit` in `members.tsx` mutates silently. Icon upload already toasts both sides (verified during planning); leave it.

**Files:**

- Modify: `src/routes/conversations/members.tsx`

- [ ] **Step 1: Locate `saveTitleEdit` in `src/routes/conversations/members.tsx`**

Read lines ~345–360. It currently looks like:

```tsx
  async function saveTitleEdit() {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleEditing(false);
      return;
    }
    setActionInProgress(true);
    try {
      await updateConversationTitle(me as any, conversation, trimmed);
    } finally {
      setActionInProgress(false);
      setTitleEditing(false);
    }
  }
```

- [ ] **Step 2: Replace `saveTitleEdit` with a toast-on-success and toast-on-error variant**

```tsx
  async function saveTitleEdit() {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleEditing(false);
      return;
    }
    setActionInProgress(true);
    try {
      await updateConversationTitle(me as any, conversation, trimmed);
      toast({ icon: "check", text: "title updated", tone: "success" });
    } catch {
      toast({ icon: "alert", text: "couldn't update title", tone: "error" });
    } finally {
      setActionInProgress(false);
      setTitleEditing(false);
    }
  }
```

No new import — `toast` is already in scope via the existing `useToast()` call at line ~151.

- [ ] **Step 3: TypeScript check**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx tsc -b --noEmit
```

Expected: pass.

- [ ] **Step 4: Run the affected test suite**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run tests/unit/routes/conversations/
```

Expected: all green (the existing tests don't assert on toasts so they still pass).

- [ ] **Step 5: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add src/routes/conversations/members.tsx && git commit -m "feat(unit-8e): toast on conversation title save success/failure"
```

---

## Phase 3 · Contacts copy-toast regression test

`/contacts/add` already toasts both copy paths. The audit row AUDIT-023 calls for verifying it fires. We add a regression test so it can't silently regress.

### Task 3.1: Add a regression test for the copy-link toast

**Files:**

- Create: `tests/unit/routes/contacts/add.test.tsx`

- [ ] **Step 1: Write the test**

Create `tests/unit/routes/contacts/add.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { AddContactRoute } from "@/routes/contacts/add";

vi.mock("@/components/qr-display", () => ({
  QRDisplay: ({ url }: { url: string }) => <div data-testid="qr-stub">{url}</div>,
}));

vi.mock("@/jazz/invitations", () => ({
  createInvitation: vi.fn(async () => ({ url: "https://test.example/i/abc" })),
}));

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    $jazz: { id: "alice-account-id" },
    profile: { displayName: "Alice" },
  }),
}));

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ToastProvider>{children}</ToastProvider>
    </MemoryRouter>
  );
}

describe("AddContactRoute copy/share toast", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => undefined) },
    });
  });

  test("copy-link button fires 'invite link copied' toast", async () => {
    render(
      <Wrap>
        <AddContactRoute />
      </Wrap>
    );
    // Wait for the invitation effect to resolve and the button to become wired.
    await waitFor(() => {
      expect(screen.getByTestId("add-contact-copy-btn")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("add-contact-copy-btn"));
    });
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "https://test.example/i/abc",
      );
    });
    await waitFor(() => {
      expect(screen.getByText("invite link copied")).toBeTruthy();
    });
  });

  test("share button falls back to clipboard + 'link copied' toast when navigator.share is unavailable", async () => {
    // Ensure navigator.share is not defined for this test.
    delete (navigator as any).share;
    render(
      <Wrap>
        <AddContactRoute />
      </Wrap>
    );
    await waitFor(() => {
      expect(screen.getByTestId("share-link")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("share-link"));
    });
    await waitFor(() => {
      expect(screen.getByText("link copied")).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run the test, expect pass (no implementation changes — this is a regression-pinning test)**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run tests/unit/routes/contacts/add.test.tsx
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add tests/unit/routes/contacts/add.test.tsx && git commit -m "test(unit-8e): pin copy-link + share toast behaviour in /contacts/add"
```

---

## Phase 4 · Skeleton swap — sidebar + section-level (settings)

Each settings section currently renders `<p className="text-sm text-dim">Loading…</p>` while `useAccount` resolves. Replace with section-shaped skeletons. Same treatment for the sidebar boot.

### Task 4.1: Sidebar loading state → NavListSkeleton

**Files:**

- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Add the import**

At the top of `src/components/sidebar.tsx`, alongside other component imports, add:

```tsx
import { NavListSkeleton } from "@/components/skeleton";
```

- [ ] **Step 2: Replace the boot fallback (around line 134–142)**

Current:

```tsx
  if (!me.$isLoaded) {
    return (
      <aside className="w-full md:w-64 flex flex-col border-r border-hairline bg-panel">
        <div className="p-4 border-b border-hairline">
          <span className="text-sm text-dim">Loading…</span>
        </div>
      </aside>
    );
  }
```

Replace with:

```tsx
  if (!me.$isLoaded) {
    return (
      <aside
        className="w-full md:w-64 flex flex-col border-r border-hairline bg-panel"
        data-testid="sidebar-loading"
      >
        <div className="p-4 border-b border-hairline">
          <NavListSkeleton rows={1} />
        </div>
        <NavListSkeleton rows={5} />
      </aside>
    );
  }
```

- [ ] **Step 3: Token-check + tsc**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npm run check-tokens && npx tsc -b --noEmit
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add src/components/sidebar.tsx && git commit -m "ui(unit-8e): swap sidebar 'Loading…' for NavListSkeleton"
```

### Task 4.2: Settings section loading states → Skel-shaped placeholders

Each settings section's `if (!me.$isLoaded)` branch becomes a panel-shaped Skel block sized to roughly match the rendered content. The lowercase title pass (Phase 6) and this task can land independently — keep the existing capitalized `<h2>` in this task; Phase 6 rewrites them.

**Files:**

- Modify: `src/routes/settings/profile-section.tsx`
- Modify: `src/routes/settings/appearance-section.tsx`
- Modify: `src/routes/settings/notifications-section.tsx`
- Modify: `src/routes/settings/devices-section.tsx`
- Modify: `src/routes/settings/account-section.tsx`
- Modify: `src/routes/settings/invites-section.tsx`

- [ ] **Step 1: profile-section.tsx**

Add the import:

```tsx
import { Skel } from "@/components/skeleton";
```

Replace the loading branch (currently rendering "Loading…") with:

```tsx
  if (!me.$isLoaded) {
    return (
      <section data-testid="profile-section-loading">
        <h2 className="text-base font-semibold text-text mb-2">Profile</h2>
        <div className="w-full p-4 rounded-r-3 border border-hairline bg-panel">
          <Skel w="40%" h={14} />
        </div>
      </section>
    );
  }
```

- [ ] **Step 2: appearance-section.tsx**

Add the import:

```tsx
import { Skel } from "@/components/skeleton";
```

Replace the loading branch with:

```tsx
  if (!me.$isLoaded) {
    return (
      <section data-testid="appearance-section-loading">
        <h2 className="text-base font-semibold text-text mb-2">Appearance</h2>
        <div className="bg-panel rounded-r-3 border border-hairline px-4 py-3 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Skel w="40%" h={14} />
            <Skel w={80} h={24} r={999} />
          </div>
          <div className="flex flex-col gap-2">
            <Skel w="40%" h={14} />
            <div className="flex gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skel key={i} w={28} h={28} r={999} />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }
```

- [ ] **Step 3: notifications-section.tsx**

Add the import:

```tsx
import { Skel } from "@/components/skeleton";
```

Replace the loading branch with:

```tsx
  if (!me.$isLoaded || !(me.root as any)?.settings?.notifications) {
    return (
      <section data-testid="notifications-section-loading">
        <h2 className="text-base font-semibold text-text mb-2">Notifications</h2>
        <div className="bg-panel rounded border border-hairline px-4 py-3 flex flex-col gap-3">
          <Skel w="65%" h={14} />
          <Skel w="50%" h={14} />
          <Skel w={160} h={28} r={6} />
        </div>
      </section>
    );
  }
```

- [ ] **Step 4: devices-section.tsx**

Add the import:

```tsx
import { Skel } from "@/components/skeleton";
```

Replace the loading branch with:

```tsx
  if (!me.$isLoaded) {
    return (
      <section data-testid="devices-section-loading">
        <h2 className="text-base font-semibold text-text mb-2">Devices</h2>
        <ul className="bg-panel rounded border border-hairline divide-y divide-hairline">
          {[0, 1].map((i) => (
            <li key={i} className="px-4 py-3 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <Skel w={140} h={12} />
                <Skel w={90} h={10} />
              </div>
              <Skel w={72} h={28} r={6} />
            </li>
          ))}
        </ul>
      </section>
    );
  }
```

- [ ] **Step 5: account-section.tsx**

Add the import:

```tsx
import { Skel } from "@/components/skeleton";
```

Replace the loading branch with:

```tsx
  if (!me.$isLoaded) {
    return (
      <section data-testid="account-section-loading">
        <h2 className="text-base font-semibold text-text mb-2">Account</h2>
        <div className="bg-panel rounded border border-hairline px-4 py-3 flex flex-col gap-2">
          <Skel w="55%" h={12} />
          <Skel w="80%" h={14} />
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skel key={i} w="100%" h={36} r={6} />
          ))}
        </div>
      </section>
    );
  }
```

- [ ] **Step 6: invites-section.tsx**

Add the import:

```tsx
import { Skel } from "@/components/skeleton";
```

Replace the loading branch with:

```tsx
  if (!me.$isLoaded) {
    return (
      <section
        className="rounded-lg border bg-card p-4"
        data-testid="invites-section-loading"
      >
        <h2 className="text-base font-semibold mb-3">Pending invitations</h2>
        <Skel w="60%" h={14} />
      </section>
    );
  }
```

- [ ] **Step 7: Token-check + tsc + run settings tests**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npm run check-tokens && npx tsc -b --noEmit && npx vitest run tests/unit/routes/settings/
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add src/routes/settings/profile-section.tsx src/routes/settings/appearance-section.tsx src/routes/settings/notifications-section.tsx src/routes/settings/devices-section.tsx src/routes/settings/account-section.tsx src/routes/settings/invites-section.tsx && git commit -m "ui(unit-8e): swap settings-section 'Loading…' strings for Skel placeholders"
```

---

## Phase 5 · Skeleton swap — full-pane (conversations + members + contacts + profile-view)

### Task 5.1: conversations/detail.tsx loading → ChatHeaderSkeleton + ChatMessagesSkeleton

**Files:**

- Modify: `src/routes/conversations/detail.tsx`

- [ ] **Step 1: Add the import**

Alongside the other component imports near the top, add:

```tsx
import { ChatHeaderSkeleton, ChatMessagesSkeleton } from "@/components/skeleton";
```

- [ ] **Step 2: Replace the `!me.$isLoaded` branch (around line 252)**

Current:

```tsx
  if (!me.$isLoaded) {
    return (
      <div className="flex h-screen">
        <div className="hidden md:contents"><Sidebar /></div>
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }
```

Replace with:

```tsx
  if (!me.$isLoaded) {
    return (
      <div className="flex h-screen" data-testid="conversation-detail-loading">
        <div className="hidden md:contents"><Sidebar /></div>
        <main className="flex-1 flex flex-col min-w-0">
          <ChatHeaderSkeleton />
          <ChatMessagesSkeleton />
        </main>
      </div>
    );
  }
```

- [ ] **Step 3: Also replace the `!conversation` branch (the late-resolve one — `<p>Loading…</p>`)**

Find the second `Loading…` branch (after the `conversation === null` check). Replace its body with the same ChatHeader + ChatMessages skeleton pair:

```tsx
  if (!conversation) {
    return (
      <div className="flex h-screen" data-testid="conversation-detail-loading-late">
        <div className="hidden md:contents"><Sidebar /></div>
        <main className="flex-1 flex flex-col min-w-0">
          <ChatHeaderSkeleton />
          <ChatMessagesSkeleton />
        </main>
      </div>
    );
  }
```

- [ ] **Step 4: Token-check + tsc**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npm run check-tokens && npx tsc -b --noEmit
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add src/routes/conversations/detail.tsx && git commit -m "ui(unit-8e): swap conversation-detail 'Loading…' for Chat skeletons"
```

### Task 5.2: conversations/members.tsx loading states → skeletons

**Files:**

- Modify: `src/routes/conversations/members.tsx`

- [ ] **Step 1: Add the import**

Near the other component imports, add:

```tsx
import { ChatHeaderSkeleton, NavListSkeleton } from "@/components/skeleton";
```

- [ ] **Step 2: Replace the two `Loading…` branches**

The `!me.$isLoaded` branch (~line 183):

```tsx
  if (!me.$isLoaded) {
    return (
      <div className="flex h-screen" data-testid="members-route-loading">
        <div className="hidden md:contents"><Sidebar /></div>
        <main className="flex-1 flex flex-col min-w-0">
          <ChatHeaderSkeleton />
          <NavListSkeleton rows={4} />
        </main>
      </div>
    );
  }
```

The `!conversation` "Loading members…" branch (~line 205):

```tsx
  if (!conversation) {
    return (
      <div className="flex h-screen" data-testid="members-route-loading-late">
        <div className="hidden md:contents"><Sidebar /></div>
        <main className="flex-1 flex flex-col min-w-0">
          <ChatHeaderSkeleton />
          <NavListSkeleton rows={4} />
        </main>
      </div>
    );
  }
```

- [ ] **Step 3: Token-check + tsc + targeted tests**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npm run check-tokens && npx tsc -b --noEmit && npx vitest run tests/unit/routes/conversations/
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add src/routes/conversations/members.tsx && git commit -m "ui(unit-8e): swap members-route 'Loading…' for skeleton pair"
```

### Task 5.3: conversations/new.tsx loading → NavListSkeleton

**Files:**

- Modify: `src/routes/conversations/new.tsx`

- [ ] **Step 1: Add the import**

```tsx
import { NavListSkeleton } from "@/components/skeleton";
```

- [ ] **Step 2: Replace the loading branch (around line 96–102)**

```tsx
  if (!me.$isLoaded) {
    return (
      <div className="p-6" data-testid="conversation-new-loading">
        <NavListSkeleton rows={4} />
      </div>
    );
  }
```

- [ ] **Step 3: Token-check + tsc**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npm run check-tokens && npx tsc -b --noEmit
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add src/routes/conversations/new.tsx && git commit -m "ui(unit-8e): swap conversation-new 'Loading…' for NavListSkeleton"
```

### Task 5.4: contacts/index.tsx + contacts/detail.tsx loading → skeletons

**Files:**

- Modify: `src/routes/contacts/index.tsx`
- Modify: `src/routes/contacts/detail.tsx`

- [ ] **Step 1: contacts/index.tsx — add import and replace the one-liner loading**

```tsx
import { NavListSkeleton } from "@/components/skeleton";
```

Replace `if (!me.$isLoaded) return <div className="p-6">Loading…</div>;` with:

```tsx
  if (!me.$isLoaded) {
    return (
      <div className="p-6" data-testid="contacts-route-loading">
        <NavListSkeleton rows={5} />
      </div>
    );
  }
```

- [ ] **Step 2: contacts/detail.tsx — add import and swap**

```tsx
import { Skel } from "@/components/skeleton";
```

Replace the existing `Loading…` branch with:

```tsx
  if (!me.$isLoaded) {
    return (
      <div className="flex flex-col items-center gap-4 p-6" data-testid="contact-detail-loading">
        <Skel w={72} h={72} r={36} />
        <Skel w={140} h={14} />
        <Skel w={90} h={10} />
      </div>
    );
  }
```

- [ ] **Step 3: Token-check + tsc**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npm run check-tokens && npx tsc -b --noEmit
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add src/routes/contacts/index.tsx src/routes/contacts/detail.tsx && git commit -m "ui(unit-8e): swap contacts list + detail 'Loading…' for skeletons"
```

### Task 5.5: profile-view.tsx loading → skeleton

**Files:**

- Modify: `src/components/profile-view.tsx`

- [ ] **Step 1: Add import**

```tsx
import { Skel } from "@/components/skeleton";
```

- [ ] **Step 2: Replace the loading branch (around line 87)**

```tsx
  if (!me.$isLoaded) {
    return (
      <div className="flex flex-col items-center gap-4 p-6" data-testid="profile-loading">
        <Skel w={80} h={80} r={40} />
        <Skel w={140} h={14} />
        <Skel w={90} h={10} />
      </div>
    );
  }
```

Note: keep `data-testid="profile-loading"` (existing test contracts likely depend on it).

- [ ] **Step 3: Token-check + tsc + targeted test sweep**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npm run check-tokens && npx tsc -b --noEmit && npx vitest run tests/unit/components/
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add src/components/profile-view.tsx && git commit -m "ui(unit-8e): swap profile-view 'Loading…' for Skel"
```

---

## Phase 6 · Lowercase pass — settings sections

Per headline observation #5, all settings section `<h2>` labels and the page `<h1>` go lowercase. Touch only the JSX text — no class changes.

### Task 6.1: Lowercase the settings sections (TDD)

**Files:**

- Modify: `src/routes/settings/profile-section.tsx`
- Modify: `src/routes/settings/appearance-section.tsx`
- Modify: `src/routes/settings/notifications-section.tsx`
- Modify: `src/routes/settings/devices-section.tsx`
- Modify: `src/routes/settings/account-section.tsx`
- Modify: `src/routes/settings/feedback-section.tsx`
- Modify: `src/routes/settings/invites-section.tsx`
- Create: `tests/unit/routes/settings/section-titles.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routes/settings/section-titles.test.tsx`:

```tsx
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { ThemeProvider } from "@/styles/use-theme";
import { AccentProvider } from "@/styles/use-accent";
import { ProfileSection } from "@/routes/settings/profile-section";
import { AppearanceSection } from "@/routes/settings/appearance-section";
import { NotificationsSection } from "@/routes/settings/notifications-section";
import { DevicesSection } from "@/routes/settings/devices-section";
import { AccountSection } from "@/routes/settings/account-section";
import { FeedbackSection } from "@/routes/settings/feedback-section";
import { InvitesSection } from "@/routes/settings/invites-section";

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "Alice" },
    root: {
      devices: [],
      invitesIssued: [],
      settings: {
        appearance: { theme: "dark", accent: "tokyo", $jazz: { set: vi.fn() } },
        notifications: { sound: false, browser: false, $jazz: { set: vi.fn() } },
      },
    },
    $jazz: { id: "alice-account-id" },
  }),
  useLogOut: () => vi.fn(),
}));

vi.mock("@/auth/pubkey", () => ({
  getAccountPubkeyHex: () => "deadbeef".repeat(8),
}));

vi.mock("@/auth/session", () => ({
  getCurrentSessionFingerprint: () => null,
}));

vi.mock("@/components/safety-number", () => ({
  SafetyNumber: () => <div data-testid="safety-number-stub" />,
}));

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <ThemeProvider>
          <AccentProvider>{children}</AccentProvider>
        </ThemeProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("settings section titles are lowercase", () => {
  test.each([
    [ProfileSection, "profile"],
    [AppearanceSection, "appearance"],
    [NotificationsSection, "notifications"],
    [DevicesSection, "devices"],
    [AccountSection, "account"],
    [FeedbackSection, "give feedback"],
    [InvitesSection, "pending invitations"],
  ])("renders a lowercase h2 with the expected label", (Section, label) => {
    render(
      <Wrap>
        <Section />
      </Wrap>
    );
    const heading = screen.getByRole("heading", { level: 2, name: label });
    expect(heading.textContent).toBe(label);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run tests/unit/routes/settings/section-titles.test.tsx
```

Expected: all seven cases fail (current titles are Title-case).

- [ ] **Step 3: Lowercase the headings**

For each file, replace the visible heading text. **Both** the loaded and the loading-state heading (where present) must be updated.

`src/routes/settings/profile-section.tsx`:

- `<h2 …>Profile</h2>` → `<h2 …>profile</h2>` (both occurrences).

`src/routes/settings/appearance-section.tsx`:

- `<h2 …>Appearance</h2>` → `<h2 …>appearance</h2>` (both occurrences).

`src/routes/settings/notifications-section.tsx`:

- `<h2 …>Notifications</h2>` → `<h2 …>notifications</h2>` (both occurrences).

`src/routes/settings/devices-section.tsx`:

- `<h2 …>Devices</h2>` → `<h2 …>devices</h2>` (both occurrences).

`src/routes/settings/account-section.tsx`:

- `<h2 …>Account</h2>` → `<h2 …>account</h2>` (both occurrences).

`src/routes/settings/feedback-section.tsx`:

- `<h2 className="text-base font-semibold text-text">Give feedback</h2>` → `<h2 className="text-base font-semibold text-text">give feedback</h2>`.

`src/routes/settings/invites-section.tsx`:

- `<h2 className="text-base font-semibold mb-3">Pending invitations</h2>` → `<h2 className="text-base font-semibold mb-3">pending invitations</h2>` (loading branch).
- `<h2 className="text-base font-semibold">Pending invitations</h2>` → `<h2 className="text-base font-semibold">pending invitations</h2>` (loaded branch).

- [ ] **Step 4: Run the test, expect pass**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run tests/unit/routes/settings/section-titles.test.tsx
```

Expected: all seven cases pass.

- [ ] **Step 5: Full settings test directory check**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run tests/unit/routes/settings/
```

Expected: all green. Watch for any e2e/Playwright tests that hard-code the old labels — those are out of scope for this plan (they live under `tests/e2e/` and run on a different harness), but flag any unit-test regression here.

- [ ] **Step 6: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add src/routes/settings/profile-section.tsx src/routes/settings/appearance-section.tsx src/routes/settings/notifications-section.tsx src/routes/settings/devices-section.tsx src/routes/settings/account-section.tsx src/routes/settings/feedback-section.tsx src/routes/settings/invites-section.tsx tests/unit/routes/settings/section-titles.test.tsx && git commit -m "ui(unit-8e): lowercase settings section titles"
```

---

## Phase 7 · Lowercase pass — settings root + contacts standalone

### Task 7.1: Lowercase the settings root page header + back link

**Files:**

- Modify: `src/routes/settings/index.tsx`

- [ ] **Step 1: Replace the h1**

In `src/routes/settings/index.tsx`, replace:

```tsx
        <h1 className="text-xl font-bold text-text mb-6">Settings</h1>
```

With:

```tsx
        <h1 className="text-xl font-bold text-text mb-6">settings</h1>
```

Leave the `← Home` back link as-is (mobile chrome is sub-unit 8d's domain).

- [ ] **Step 2: tsc**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx tsc -b --noEmit
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add src/routes/settings/index.tsx && git commit -m "ui(unit-8e): lowercase /settings page title"
```

### Task 7.2: Lowercase the `/contacts` standalone-page header + add-contact button

The standalone `/contacts` route is one of the "Other main title instances" surfaced by the grep. Header is `<h2>Contacts</h2>` and the inline CTA is `+ Add contact`.

**Files:**

- Modify: `src/routes/contacts/index.tsx`

- [ ] **Step 1: Replace the heading + button label**

In `src/routes/contacts/index.tsx`, replace:

```tsx
        <h2 className="text-2xl font-semibold">Contacts</h2>
        <Link to="/contacts/add">
          <Button data-testid="add-contact-page-btn">+ Add contact</Button>
        </Link>
```

With:

```tsx
        <h2 className="text-2xl font-semibold">contacts</h2>
        <Link to="/contacts/add">
          <Button data-testid="add-contact-page-btn">+ add contact</Button>
        </Link>
```

Also lowercase the empty-state copy (a tiny matching nit — keep one passable sentence per design):

Replace:

```tsx
          <p>No contacts yet.</p>
          <p className="text-xs mt-2">
            Add your first contact via the + Add contact button.
          </p>
```

With:

```tsx
          <p>no contacts yet.</p>
          <p className="text-xs mt-2">
            add your first contact via the + add contact button.
          </p>
```

Leave the back link `← Conversations` as-is — it's a navigation link target, not a section title; that change belongs with the broader navigation copy pass.

- [ ] **Step 2: tsc**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx tsc -b --noEmit
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add src/routes/contacts/index.tsx && git commit -m "ui(unit-8e): lowercase /contacts standalone page header + CTA"
```

---

## Phase 8 · Onboarding welcome subtitle + three-CTA layout

Per headline observations #6 and #7.

### Task 8.1: Welcome step subtitle + three CTAs (TDD)

**Files:**

- Modify: `src/routes/onboarding/welcome-step.tsx`
- Modify: `src/routes/onboarding/index.tsx`
- Create: `tests/unit/routes/onboarding/welcome-step.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routes/onboarding/welcome-step.test.tsx`:

```tsx
import { describe, test, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { WelcomeStep } from "@/routes/onboarding/welcome-step";

describe("WelcomeStep", () => {
  test("renders the short tagline subtitle", () => {
    render(
      <WelcomeStep
        onCreateAccount={vi.fn()}
        onRestoreAccount={vi.fn()}
        onSignInWithPassword={vi.fn()}
      />
    );
    expect(screen.getByText("local-first · end-to-end encrypted")).toBeTruthy();
    expect(
      screen.queryByText(/recovery code is your escape hatch/i),
    ).toBeNull();
  });

  test("renders three lowercase CTAs and wires each callback", () => {
    const onCreate = vi.fn();
    const onRestore = vi.fn();
    const onSignIn = vi.fn();
    render(
      <WelcomeStep
        onCreateAccount={onCreate}
        onRestoreAccount={onRestore}
        onSignInWithPassword={onSignIn}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "create account" }));
    expect(onCreate).toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "restore from recovery code" }),
    );
    expect(onRestore).toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "already on a device? sign in" }),
    );
    expect(onSignIn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run tests/unit/routes/onboarding/welcome-step.test.tsx
```

Expected: fail — the prop and labels don't exist yet.

- [ ] **Step 3: Rewrite WelcomeStep**

Replace `src/routes/onboarding/welcome-step.tsx` with:

```tsx
import { Button } from "@/components/ui/button";

interface WelcomeStepProps {
  onCreateAccount: () => void;
  /**
   * Restore via 24-word recovery code (offline path — no Better Auth
   * session required). Routed to the restore-with-code step downstream.
   */
  onRestoreAccount: () => void;
  /**
   * "already on a device? sign in" — Better Auth email/password path for
   * users who already have an account and are adding this device.
   */
  onSignInWithPassword: () => void;
}

/**
 * WelcomeStep: first screen in the onboarding flow.
 *
 * Design-aligned layout per Unit 8 audit headline observations #6 + #7:
 *
 * - Short tagline subtitle ("local-first · end-to-end encrypted") — the
 *   Wordmark carries the brand.
 * - Three CTAs in design order:
 *     1. "create account"             — primary
 *     2. "restore from recovery code" — outline (offline path)
 *     3. "already on a device? sign in" — ghost (Better Auth path)
 *
 * The split surfaces the recovery affordance ahead of the email/password
 * fallback. The third CTA was previously labeled "Sign in to existing
 * account" and conflated with the recovery flow; Unit 8e split it out.
 */
export function WelcomeStep({
  onCreateAccount,
  onRestoreAccount,
  onSignInWithPassword,
}: WelcomeStepProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome to Arcan
          </h1>
          <p className="text-muted-foreground">
            local-first · end-to-end encrypted
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            data-testid="create-account-btn"
            onClick={onCreateAccount}
          >
            create account
          </Button>
          <Button
            variant="outline"
            size="lg"
            data-testid="restore-account-btn"
            onClick={onRestoreAccount}
          >
            restore from recovery code
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="signin-existing-btn"
            onClick={onSignInWithPassword}
          >
            already on a device? sign in
          </Button>
        </div>
      </div>
    </div>
  );
}
```

Note: the `Welcome to Arcan` h1 stays capitalized as a brand greeting — out of scope for the lowercase section-title pass (it's a hero, not a section label). Sub-unit 8a may revisit if AuthSurface alters the treatment.

- [ ] **Step 4: Wire the new prop in `onboarding/index.tsx`**

In `src/routes/onboarding/index.tsx`, find the `case "welcome":` block and replace:

```tsx
    case "welcome":
      return (
        <WelcomeStep
          onCreateAccount={() => setStep({ kind: "credentials" })}
          onRestoreAccount={() => setStep({ kind: "restore-choice" })}
        />
      );
```

With:

```tsx
    case "welcome":
      return (
        <WelcomeStep
          onCreateAccount={() => setStep({ kind: "credentials" })}
          onRestoreAccount={() => setStep({ kind: "restore-with-code" })}
          onSignInWithPassword={() => navigate("/auth/login")}
        />
      );
```

Rationale: the audit's design intent surfaces the recovery flow as a direct second CTA. The intermediate `restore-choice` step (which itself asks "password or code?") is the old conflated path. The new third CTA goes straight to `/auth/login` for the password path; the second CTA goes straight to the code-entry step.

The `restore-choice` step file is **not** deleted in this plan — it remains reachable via deep-link and is referenced by the discriminated union. Removing it cleanly is a follow-up; tracked below.

- [ ] **Step 5: Run the failing test, expect pass**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run tests/unit/routes/onboarding/welcome-step.test.tsx
```

Expected: pass.

- [ ] **Step 6: Full unit test sweep + tsc + token-check**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npm run check-tokens && npx tsc -b --noEmit && npx vitest run
```

Expected: all green.

- [ ] **Step 7: Capture the dead-`restore-choice` follow-up**

Use the `followup-tracking` skill to file a Linear issue (team=Nox, project=Arcan) capturing:

- Title: "Unit 8e follow-up: consider removing or repurposing onboarding `restore-choice` step"
- Body: "Unit 8e re-wired the welcome-step CTAs so `restore-choice` is no longer reachable from the welcome screen. The file still exists and still appears in the OnboardingStep discriminated union but has no inbound transition from the new welcome step. Either delete the step + union case + file (preferred: dead code) or repurpose it. Out of scope for 8e; the audit didn't call for the deletion explicitly. Touched by Unit 8e commit `<short SHA>`."
- No URL — internal follow-up.

- [ ] **Step 8: Commit**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git add src/routes/onboarding/welcome-step.tsx src/routes/onboarding/index.tsx tests/unit/routes/onboarding/welcome-step.test.tsx && git commit -m "ui(unit-8e): welcome-step short subtitle + three-CTA layout"
```

---

## Phase 9 · Final verification

### Task 9.1: Verification gauntlet

**Files:** none

- [ ] **Step 1: Tokens guard**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npm run check-tokens
```

Expected: pass (no ad-hoc tailwind color classes introduced).

- [ ] **Step 2: TypeScript whole-project**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx tsc -b --noEmit
```

Expected: pass.

- [ ] **Step 3: Unit tests**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npx vitest run
```

Expected: all green.

- [ ] **Step 4: Manual spot-check**

Boot the app for a manual eyeball:

```bash
cd /home/nox/Documents/Projects/Nox/arcan && npm run dev:all
```

Then in a browser:

- `/contacts/add` — click "copy link" → toast "invite link copied" appears bottom-center. Click "share" (no Web Share API → fallback to clipboard) → toast "link copied" appears.
- `/settings` → "appearance" section: click theme toggle → toast "appearance updated". Click an accent swatch → toast "appearance updated".
- `/settings` → "notifications" section: click sound checkbox → toast "notifications updated". Click "Enable browser notifications" (grant) → toast "notifications updated".
- `/settings` → "account" → "Change password" → fill the form correctly → modal auto-closes, toast "password changed" appears.
- `/settings` page title reads "settings" (lowercase); section h2s read "profile", "appearance", "give feedback", "notifications", "devices", "pending invitations", "account".
- Onboarding welcome (sign out, hit `/onboarding`) — subtitle reads "local-first · end-to-end encrypted"; three CTAs read "create account", "restore from recovery code", "already on a device? sign in" in that order.
- Any in-app loading state visible during sign-in (sidebar, settings sections, conversation detail) shows shimmer skeletons, not plain "Loading…" text.

Stop the dev servers.

- [ ] **Step 5: Push the branch**

```bash
cd /home/nox/Documents/Projects/Nox/arcan && git push -u origin unit-8e-toast-skeleton-typography
```

Expected: branch pushed; no PR created by default (the user creates the PR explicitly).

---

## Self-review checklist (already executed at plan-write time)

- [x] **Spec coverage.** Each row mapped to a task:
  - AUDIT-023 / AUDIT-024 (contacts/add copy-toast) → Task 3.1 (regression test pinning the already-working code paths).
  - AUDIT-031 / AUDIT-032 (live-invites empty) → already wired toast on revoke (verified during planning); empty-state CTA is sub-unit 8b. No work here beyond noting it.
  - AUDIT-033 / AUDIT-034 (settings root) → Phases 1, 4, 6, 7 (toast on save, skeleton on load, lowercase titles).
  - AUDIT-043 / AUDIT-044 (live-invites non-empty) → Task 2 wires the revoke toast (already present per planning grep; no-op confirmed). Captured in the verification sweep.
  - Headline #5 (lowercase) → Phases 6, 7.
  - Headline #6 (welcome subtitle) → Task 8.1 step 3.
  - Headline #7 (welcome CTAs) → Task 8.1 step 3.
- [x] **Placeholder scan.** No "TBD" / "implement later" / "similar to Task N" patterns. Every code block contains the actual text to apply.
- [x] **Type consistency.** `useToast()` shape and `Skel` / `NavListSkeleton` / `ChatHeaderSkeleton` / `ChatMessagesSkeleton` props match `src/components/toast.tsx` and `src/components/skeleton.tsx`. The new `WelcomeStepProps` interface is consistent between `welcome-step.tsx` (Phase 8 Step 3) and the call-site update (Phase 8 Step 4).
- [x] **Out-of-scope items explicitly listed** at the top so a fresh-context executor doesn't drift into 8a/8b/8c/8d territory.
- [x] **Each commit is small and atomic** — one route or one concern per commit, matching the "shotgun" character of this sub-unit.
