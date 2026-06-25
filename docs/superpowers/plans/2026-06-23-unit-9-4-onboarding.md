# Unit 9-4 — Onboarding Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the onboarding flow so the welcome screen is the single sign-in-choice surface, the redundant restore-choice intermediate is deleted, the auth/onboarding/pair Arcan mark is bumped to hero size, the recovery-code display step gets vertical breathing room, and the display-name step gains a working camera-overlay avatar upload that becomes the profile picture on account creation.

**Architecture:** Pure front-end changes to the React onboarding route tree (`src/routes/onboarding/*`), the shared `Wordmark` primitive (`src/components/auth-surface.tsx`), and their unit/e2e tests. The display-name avatar upload is *deferred*: the chosen `File` is held in local component state and previewed via an object URL during the (pre-account) profile step, then uploaded through the existing `setProfileAvatar` path immediately after `flows.signUp` creates the Jazz account. No schema, auth-flow, or sync-server changes.

**Tech Stack:** React 18 + TypeScript (strict), Tailwind v3 (token utilities only — `bg-arcan-accent`, `rounded-avatar-lg`, etc.), Vitest + Testing Library (unit, `tests/unit/`), Playwright (e2e, `tests/e2e/`), jazz-tools 0.20.18. All tests run inside `nix-shell`.

**Spec:** `docs/superpowers/specs/2026-06-23-unit-9-feedback-log.md` §1 — items 1.1-A, 1.2-A, 1.2+1.5 unify, 1.3/1.4/1.5-A, 1.4-A, 1.5-A, 1.6/1.7-C. Canonical design: `design/proto.jsx` (`WelcomeScreen` ~line 537) and `design/hf-flows.jsx` (`ScWelcome` ~line 66, `ScProfile` ~line 141, `ScRecovery` ~line 106, `Wordmark` line 7, `AuthSurface` line 12).

---

## Design values harvested from the reference files

Read these before starting; every numeric value below is cited from a file you can open.

- **`Wordmark` primitive** (`src/components/auth-surface.tsx:142-169`) takes `size` and renders `<Lattice size={size} />` + tracked-uppercase "arcan" at `Math.round(size*0.5)`. The design `Wordmark` (`design/hf-flows.jsx:7-9`) renders `ArcanMark` at `size * 2.1`.
- **Lattice tiers** (`src/components/lattice.tsx:5-8`): `full` ≥ 44, `reduced` ≥ 26, `minimal` ≥ 18. A *hero* mark must be ≥ 44 to render the full tier.
- **Current mark sizes (too small per 1.1-A / 1.2-A / 1.6-C):**
  - `src/routes/onboarding/welcome-step.tsx:41` → `size={30}` (reduced tier).
  - `src/routes/auth/login.tsx:50` → `size={22}` (minimal tier).
  - `src/routes/pair/initiator-step.tsx` & `responder-step.tsx` → many `size={20}` (minimal tier).
- **`ScProfile` camera overlay** (`design/hf-flows.jsx:147-152`): a 78×78 avatar tile with a 28×28 round accent badge bottom-right holding a camera icon (`Icon d="camera"`, `border: 2px solid bg`). The live profile step (`profile-step.tsx:91-100`) renders a *decorative* 78×78 placeholder with a non-functional `●` badge — this becomes a real file picker.
- **Own-profile camera-overlay upload pattern** to reuse (`src/components/profile-view.tsx:133-155, 225-256`): a hidden `<input type="file" accept="image/*">` + a round accent button; on change it calls `setProfileAvatar(me, file)` after a `MAX_ATTACHMENT_BYTES` size check.
- **Avatar upload helpers** (`src/jazz/avatar.ts`): `setProfileAvatar(me, file)` (line 12) uploads + assigns; `resizeImageToSquare(file, 256)` (line 36) is the client-side cover-crop resizer. Note: `setProfileAvatar` does **not** resize today — `profile-view.tsx` uploads the raw file. This plan resizes the onboarding avatar to 256² before upload, matching conversation-icon behavior (`avatar.ts:86-98`).
- **`MAX_ATTACHMENT_BYTES`** + `AttachmentTooLargeError` come from `@/jazz/attachments` (imported in `profile-view.tsx:12`).
- **`ScRecovery` spacing** (`design/hf-flows.jsx:106-126`): `AuthSurface w={368} tall`, column `gap: tall ? 11` (`auth-surface.tsx:68`). The live `backup-display-step.tsx` packs warning + 24-word grid + checkbox + buttons into that 11px gap — too compressed per 1.3/1.4/1.5-A. Fix: widen inter-block spacing on this one step.
- **Centering (DEC-2)** already shipped in Unit 9-1 — `AuthSurface` `tall` mode centers via `items-center` + `my-auto` (`auth-surface.tsx:60-63, 97-100`; asserted by `tests/unit/components/auth-surface.test.tsx:48-60`). Do **not** touch centering; the unified welcome inherits it automatically.

## Critical pre-existing-test reconciliation

`tests/e2e/account-creation.spec.ts` is **stale** against current `main`:
- Step 2 asserts `page.getByRole("heading", { name: /Welcome to Arcan/i })` — no such heading exists in `welcome-step.tsx` (it renders a `Wordmark` + `AuthSub`, no `<h*>`).
- Step 8 uses `page.locator('label[for="confirm-word-${slot}"]')` + regex `/Word\s+(\d+)/`, but `backup-confirm-step.tsx:68-71` renders `<label>` with **no** `for` attribute and label text `word #NN`.

The working selector logic lives in `tests/e2e/helpers.ts` `createAccount()` (`helpers.ts:42-89`), which reads the confirm label via `xpath=../span` and regex `/#?\s*0*(\d+)/`. **Task 6 repairs `account-creation.spec.ts` to call `createAccount()`** rather than re-deriving stale selectors, so the spec and helper stay in lockstep. Do not invent a "Welcome to Arcan" heading to satisfy the stale assertion.

---

## File Structure

**Modify:**
- `src/components/auth-surface.tsx` — bump default `Wordmark` proportions are unchanged, but callers pass larger sizes; no change to the primitive itself unless Task 1 finds the label scale needs a floor (it does not — `size*0.5` scales fine).
- `src/routes/onboarding/welcome-step.tsx` — hero mark (`size={30}` → `size={56}`); confirm copy/order matches `ScWelcome`.
- `src/routes/onboarding/index.tsx` — remove the `restore-choice` union case + import + render; route `restore-with-code` back-button to `welcome`.
- `src/routes/onboarding/profile-step.tsx` — functional camera-overlay avatar upload (deferred); resize + `setProfileAvatar` after sign-up.
- `src/routes/onboarding/backup-display-step.tsx` — vertical breathing room.
- `src/routes/auth/login.tsx` — hero mark (`size={22}` → `size={56}`).
- `src/routes/pair/initiator-step.tsx` + `src/routes/pair/responder-step.tsx` — hero mark (`size={20}` → `size={48}`).
- `tests/e2e/account-creation.spec.ts` — repair to use `createAccount()` helper.
- `tests/unit/routes/onboarding/welcome-step.test.tsx` — assert hero size + (still) three CTAs.

**Delete:**
- `src/routes/onboarding/restore-choice-step.tsx` — redundant intermediate (1.5-A).

**Create:**
- `tests/unit/routes/onboarding/profile-step.test.tsx` — avatar upload behavior.

---

## Task 1: Bump the auth/onboarding/pair Arcan mark to hero size (1.1-A / 1.2-A / 1.6-C)

**Files:**
- Modify: `src/routes/onboarding/welcome-step.tsx:41`
- Modify: `src/routes/auth/login.tsx:50`
- Modify: `src/routes/pair/initiator-step.tsx` (the `size={20}` near the screen top, line ~255 is the primary mark; bump every standalone top-of-surface mark)
- Modify: `src/routes/pair/responder-step.tsx` (multiple `size={20}`)
- Test: `tests/unit/routes/onboarding/welcome-step.test.tsx`

Hero sizing rationale: the Lattice `full` tier kicks in at ≥ 44 (`lattice.tsx:6`). Use `56` on the two primary entry screens (welcome, login) and `48` on the denser pair screens — both clear the `full` threshold and roughly double the prior visual weight.

- [ ] **Step 1: Write the failing unit test for the hero mark size**

Add this test to `tests/unit/routes/onboarding/welcome-step.test.tsx` inside the existing `describe("WelcomeStep", …)` block (after the last test, before the closing `});`):

```tsx
  test("renders a hero-size Arcan mark (Lattice full tier, ≥44px)", () => {
    const { container } = render(
      <WelcomeStep
        onCreateAccount={vi.fn()}
        onRestoreAccount={vi.fn()}
        onSignInWithPassword={vi.fn()}
      />,
    );
    // Wordmark renders <Lattice> as an svg[role="img"] sized to its `size` prop.
    const mark = container.querySelector("svg[role='img']") as SVGElement | null;
    expect(mark).not.toBeNull();
    expect(Number(mark!.getAttribute("width"))).toBeGreaterThanOrEqual(44);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `nix-shell --run "npx vitest run tests/unit/routes/onboarding/welcome-step.test.tsx -t 'hero-size'"`
Expected: FAIL — the current `Wordmark size={30}` renders `width="30"`, so `30 >= 44` is false (`expected 30 to be greater than or equal to 44`).

- [ ] **Step 3: Bump the welcome-step mark to hero size**

In `src/routes/onboarding/welcome-step.tsx`, change line 41:

```tsx
      <Wordmark size={56} />
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `nix-shell --run "npx vitest run tests/unit/routes/onboarding/welcome-step.test.tsx -t 'hero-size'"`
Expected: PASS — `svg width="56"`, `56 >= 44`.

- [ ] **Step 5: Bump the login + pair marks (no separate test — visual parity)**

In `src/routes/auth/login.tsx` line 50:

```tsx
      <Wordmark size={56} />
```

In `src/routes/pair/initiator-step.tsx`, change **every** `<Wordmark size={20} />` to `<Wordmark size={48} />` (lines ~174, 184, 206, 225, 237, 255). In `src/routes/pair/responder-step.tsx`, change **every** `<Wordmark size={20} />` to `<Wordmark size={48} />` (lines ~216, 227, 238, 270, 284, 295, 306, 326).

Run this to confirm none are left behind:

Run: `grep -rn 'Wordmark size={20}' src/routes/pair/`
Expected: no output (exit code 1).

- [ ] **Step 6: Run token guard + full unit suite to confirm no regressions**

Run: `nix-shell --run "npm run check-tokens && npx vitest run tests/unit/routes/onboarding/welcome-step.test.tsx tests/unit/components/auth-surface.test.tsx"`
Expected: check-tokens passes (no ad-hoc color/type classes added); both unit files PASS.

- [ ] **Step 7: Commit**

```bash
git add src/routes/onboarding/welcome-step.tsx src/routes/auth/login.tsx src/routes/pair/initiator-step.tsx src/routes/pair/responder-step.tsx tests/unit/routes/onboarding/welcome-step.test.tsx
git commit -m "ui(unit-9-4): hero-size Arcan mark on auth/onboarding/pair surfaces"
```

---

## Task 2: Confirm the unified welcome screen matches the prototype (1.2 + 1.5 unify)

The live `welcome-step.tsx` already renders the unified surface the prototype `WelcomeScreen` (`proto.jsx:537-548`) / `ScWelcome` (`hf-flows.jsx:66-77`) describes: mark + tagline + "create account" (primary) + "restore from recovery code" (outline) + inline "already on a device? sign in". This task locks that contract with a test and reconciles the one remaining divergence: the prototype's CTA order and the inline sign-in being part of the *same* surface (already true). No structural change is expected beyond what Task 1 did — this task exists to *prove* the unification with a test so the discriminated-union cleanup in Task 3 is safe.

**Files:**
- Test: `tests/unit/routes/onboarding/welcome-step.test.tsx`
- Modify (only if test fails): `src/routes/onboarding/welcome-step.tsx`

- [ ] **Step 1: Write the failing test for the single-surface CTA contract**

Add to `tests/unit/routes/onboarding/welcome-step.test.tsx` inside the `describe` block:

```tsx
  test("is a single surface: create + restore + inline sign-in, in design order", () => {
    render(
      <WelcomeStep
        onCreateAccount={vi.fn()}
        onRestoreAccount={vi.fn()}
        onSignInWithPassword={vi.fn()}
      />,
    );
    // All three affordances live on one surface — no intermediate choice screen.
    const create = screen.getByTestId("create-account-btn");
    const restore = screen.getByTestId("restore-account-btn");
    const signin = screen.getByTestId("signin-existing-btn");
    expect(create.textContent).toBe("create account");
    expect(restore.textContent).toBe("restore from recovery code");
    expect(signin.textContent).toBe("sign in");
    // Design order: create precedes restore precedes the inline sign-in.
    expect(
      create.compareDocumentPosition(restore) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      restore.compareDocumentPosition(signin) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
```

- [ ] **Step 2: Run the test to verify it passes (or fails)**

Run: `nix-shell --run "npx vitest run tests/unit/routes/onboarding/welcome-step.test.tsx -t 'single surface'"`
Expected: PASS immediately — the current `welcome-step.tsx:44-70` already renders these three testids in this order. (If it FAILS, the welcome step diverged; align `welcome-step.tsx` to the testids/order above, then re-run.)

- [ ] **Step 3: Commit (test-only lock-in)**

```bash
git add tests/unit/routes/onboarding/welcome-step.test.tsx
git commit -m "test(unit-9-4): lock welcome screen as single sign-in-choice surface"
```

---

## Task 3: Remove the redundant restore-choice intermediate screen (1.5-A)

The `restore-choice` step (`restore-choice-step.tsx`) is unreachable from welcome (welcome's `onRestoreAccount` goes straight to `restore-with-code` — `index.tsx:47`), but it is still reachable as the *back* target from `restore-with-code` (`index.tsx:126`). Deleting it requires re-pointing that back button to `welcome`.

**Files:**
- Delete: `src/routes/onboarding/restore-choice-step.tsx`
- Modify: `src/routes/onboarding/index.tsx`

- [ ] **Step 1: Write the failing test for the welcome→restore-with-code→welcome routing**

Create `tests/unit/routes/onboarding/restore-routing.test.tsx`:

```tsx
import { describe, test, expect } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OnboardingRoute } from "@/routes/onboarding/index";

describe("OnboardingRoute restore routing", () => {
  test("welcome → restore-with-code → back lands on welcome (no restore-choice)", () => {
    render(
      <MemoryRouter>
        <OnboardingRoute />
      </MemoryRouter>,
    );
    // Welcome surface is shown first.
    fireEvent.click(screen.getByTestId("restore-account-btn"));
    // We are now on the restore-with-code step.
    expect(screen.getByTestId("restore-passphrase-input")).toBeTruthy();
    // The intermediate "how would you like to sign in?" choice is gone.
    expect(screen.queryByTestId("restore-choice-signin")).toBeNull();
    expect(screen.queryByTestId("restore-choice-code")).toBeNull();
    // Back returns to the welcome surface (not an intermediate screen).
    const backBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent === "back");
    expect(backBtn).toBeTruthy();
    fireEvent.click(backBtn!);
    expect(screen.getByTestId("create-account-btn")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `nix-shell --run "npx vitest run tests/unit/routes/onboarding/restore-routing.test.tsx"`
Expected: FAIL — clicking back on `restore-with-code` currently routes to `restore-choice` (`index.tsx:126`), so `getByTestId("create-account-btn")` after back throws "Unable to find" (the choice screen renders `restore-choice-signin` instead).

- [ ] **Step 3: Remove the restore-choice case from the onboarding router**

In `src/routes/onboarding/index.tsx`:

1. Delete the import (line 8):

```tsx
import { RestoreChoiceStep } from "./restore-choice-step";
```

2. Remove the `restore-choice` member from the `OnboardingStep` union (line 28). The union becomes:

```tsx
type OnboardingStep =
  | { kind: "welcome" }
  | { kind: "credentials" }
  | { kind: "backup-display"; credentials: Credentials; recoveryCode: string }
  | { kind: "backup-confirm"; credentials: Credentials; recoveryCode: string }
  | { kind: "profile"; credentials: Credentials; recoveryCode: string }
  | { kind: "restore-with-code" };
```

3. Delete the entire `case "restore-choice":` block (lines 114-121).

4. Re-point the `restore-with-code` back button (line 126) to `welcome`:

```tsx
    case "restore-with-code":
      return (
        <RestoreWithCodeStep
          onBack={() => setStep({ kind: "welcome" })}
        />
      );
```

5. Update the doc-comment flow diagram (lines 12-21) so it no longer mentions `restore-choice`:

```tsx
/**
 * Discriminated union for the onboarding step state machine.
 *
 * Sign-up path:
 *   welcome → credentials → backup-display → backup-confirm → profile
 * Restore path:
 *   welcome → restore-with-code (24-word recovery code)
 *   welcome → /auth/login (via navigate, "already on a device? sign in")
 */
```

- [ ] **Step 4: Delete the restore-choice step file**

```bash
git rm src/routes/onboarding/restore-choice-step.tsx
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `nix-shell --run "npx vitest run tests/unit/routes/onboarding/restore-routing.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Confirm no dangling references + typecheck**

Run: `grep -rn 'restore-choice\|RestoreChoiceStep' src tests`
Expected: no output (exit 1).

Run: `nix-shell --run "npx tsc --noEmit"`
Expected: no errors (the deleted union case removes the only `RestoreChoiceStep` consumer; `index.tsx` still compiles because the switch is now exhaustive over the narrowed union).

- [ ] **Step 7: Commit**

```bash
git add src/routes/onboarding/index.tsx tests/unit/routes/onboarding/restore-routing.test.tsx
git commit -m "feat(unit-9-4): delete redundant restore-choice onboarding screen (1.5-A)"
```

---

## Task 4: Functional camera-overlay avatar upload on the display-name step (1.4-A)

The Jazz account does **not** exist during profile-step — it is created inside `handleFinish` by `flows.signUp` (`profile-step.tsx:49-82`). So the avatar upload is *deferred*: capture the chosen `File` in local state, preview it via an object URL on the 78×78 tile, and after `createAccountWithSeed` + `setDisplayNameOnMe` succeed (inside the existing `createJazzAccount` callback), resize and call `setProfileAvatar(me, file)` before `signUp` resolves. On any avatar error we do **not** fail account creation — the account is already created; we surface a non-blocking note and proceed.

**Files:**
- Modify: `src/routes/onboarding/profile-step.tsx`
- Create: `tests/unit/routes/onboarding/profile-step.test.tsx`

### Task 4a: Avatar picker UI + client-side preview (no upload yet)

- [ ] **Step 1: Write the failing test for the avatar picker + preview**

Create `tests/unit/routes/onboarding/profile-step.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// The Jazz hooks the step imports require a provider; stub them so the
// component renders standalone. We only exercise the avatar-picker UI here.
vi.mock("@/jazz/createAccountFromSeed", () => ({
  useCreateAccountWithSeed: () => vi.fn(),
  useSetDisplayNameOnMe: () => vi.fn(),
}));
vi.mock("@/auth/flows", () => ({ signUp: vi.fn() }));

import { ProfileStep } from "@/routes/onboarding/profile-step";

const credentials = { email: "a@b.dev", password: "correcthorsebattery1!" };
const recoveryCode = "x".repeat(10);

beforeEach(() => {
  // jsdom lacks createObjectURL; the component uses it for the preview.
  (URL as any).createObjectURL = vi.fn(() => "blob:preview");
  (URL as any).revokeObjectURL = vi.fn();
});

describe("ProfileStep avatar picker", () => {
  test("clicking the camera badge opens the hidden file input", () => {
    render(
      <MemoryRouter>
        <ProfileStep
          credentials={credentials}
          recoveryCode={recoveryCode}
          onBack={vi.fn()}
        />
      </MemoryRouter>,
    );
    const input = screen.getByTestId(
      "onboarding-avatar-input",
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    fireEvent.click(screen.getByTestId("onboarding-avatar-change"));
    expect(clickSpy).toHaveBeenCalled();
  });

  test("selecting an image previews it on the avatar tile", async () => {
    render(
      <MemoryRouter>
        <ProfileStep
          credentials={credentials}
          recoveryCode={recoveryCode}
          onBack={vi.fn()}
        />
      </MemoryRouter>,
    );
    const input = screen.getByTestId(
      "onboarding-avatar-input",
    ) as HTMLInputElement;
    const file = new File(["x"], "me.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      const img = screen.getByTestId("onboarding-avatar-preview");
      expect(img.getAttribute("src")).toBe("blob:preview");
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `nix-shell --run "npx vitest run tests/unit/routes/onboarding/profile-step.test.tsx"`
Expected: FAIL — `getByTestId("onboarding-avatar-input")` throws "Unable to find an element by: [data-testid='onboarding-avatar-input']" (the current tile is a static placeholder).

- [ ] **Step 3: Implement the avatar picker UI + preview state**

In `src/routes/onboarding/profile-step.tsx`, replace the imports block (lines 1-9) with:

```tsx
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { signUp } from "@/auth/flows";
import { decodeRecoveryCode } from "@/auth/recovery-code";
import {
  useCreateAccountWithSeed,
  useSetDisplayNameOnMe,
} from "@/jazz/createAccountFromSeed";
import { setProfileAvatar, resizeImageToSquare } from "@/jazz/avatar";
import { MAX_ATTACHMENT_BYTES } from "@/jazz/attachments";
import { AuthSurface, Steps, AuthTitle } from "@/components/auth-surface";
import type { Credentials } from "./credentials-step";
```

Add avatar state + handlers inside the component, immediately after the existing `const [error, setError] = useState<string | null>(null);` (line 42):

```tsx
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build/tear down the object-URL preview whenever the picked file changes.
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  function handleAvatarPick() {
    fileInputRef.current?.click();
  }

  function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(
        `${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB. max 5 MB.`,
      );
      return;
    }
    setError(null);
    setAvatarFile(file);
  }
```

Replace the decorative avatar block (lines 89-100, the comment + the `<div className="flex justify-center mt-[2px]">…</div>`) with the functional picker. Design source: `ScProfile` camera overlay (`hf-flows.jsx:147-152`) + own-profile pattern (`profile-view.tsx:225-256`):

```tsx
      {/* Avatar tile + camera overlay — picks a file now, uploaded after the
          account is created in handleFinish (the Jazz account does not exist
          yet on this step). Design: hf-flows.jsx ScProfile lines 147-152. */}
      <div className="flex justify-center mt-[2px]">
        <div className="relative">
          <div className="flex h-[78px] w-[78px] items-center justify-center overflow-hidden rounded-avatar-lg border border-hairline bg-accent-soft font-mono text-[26px] font-semibold text-arcan-accent">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt=""
                data-testid="onboarding-avatar-preview"
                className="h-full w-full object-cover"
              />
            ) : (
              "?"
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
            data-testid="onboarding-avatar-input"
          />
          <button
            type="button"
            onClick={handleAvatarPick}
            aria-label="Add a profile picture"
            data-testid="onboarding-avatar-change"
            className="absolute -bottom-[2px] -right-[2px] flex h-7 w-7 items-center justify-center rounded-pill border-2 border-bg bg-arcan-accent text-on-accent text-[13px]"
          >
            ⌖
          </button>
        </div>
      </div>
```

(`⌖` stands in for the design's camera glyph — the codebase uses inline glyphs/SVGs elsewhere; keep it a single accent glyph to match the `●`/`✎` pattern already in `profile-view.tsx`. If the team has a camera icon component, swap it in during review.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `nix-shell --run "npx vitest run tests/unit/routes/onboarding/profile-step.test.tsx"`
Expected: PASS — both picker tests green.

- [ ] **Step 5: Token guard + typecheck**

Run: `nix-shell --run "npm run check-tokens && npx tsc --noEmit"`
Expected: check-tokens passes (`rounded-avatar-lg`, `bg-accent-soft`, `bg-arcan-accent`, `rounded-pill`, `border-bg` are all token utilities); tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/routes/onboarding/profile-step.tsx tests/unit/routes/onboarding/profile-step.test.tsx
git commit -m "feat(unit-9-4): avatar picker + preview on onboarding display-name step (1.4-A)"
```

### Task 4b: Upload the picked avatar after account creation

- [ ] **Step 1: Write the failing test for deferred upload**

Append to `tests/unit/routes/onboarding/profile-step.test.tsx` (add a new `describe` after the existing one). This test replaces the module mocks with spies that let us assert `setProfileAvatar` is called with the resized file after `signUp` runs its `createJazzAccount` callback:

```tsx
import * as flows from "@/auth/flows";
import * as avatar from "@/jazz/avatar";

vi.mock("@/jazz/avatar", async (orig) => {
  const actual = (await orig()) as typeof import("@/jazz/avatar");
  return {
    ...actual,
    setProfileAvatar: vi.fn(async () => {}),
    resizeImageToSquare: vi.fn(async (f: File) => f),
  };
});
vi.mock("@/auth/recovery-code", () => ({
  decodeRecoveryCode: () => new Uint8Array(32),
}));

describe("ProfileStep deferred avatar upload", () => {
  test("uploads the picked avatar after the Jazz account is created", async () => {
    // signUp invokes its createJazzAccount callback, then resolves.
    const signUpSpy = vi
      .spyOn(flows, "signUp")
      .mockImplementation(async (args: any) => {
        await args.createJazzAccount(args.seed, args.displayName);
      });

    render(
      <MemoryRouter>
        <ProfileStep
          credentials={credentials}
          recoveryCode={recoveryCode}
          onBack={vi.fn()}
        />
      </MemoryRouter>,
    );

    // Pick an avatar.
    const input = screen.getByTestId(
      "onboarding-avatar-input",
    ) as HTMLInputElement;
    const file = new File(["x"], "me.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    // Fill the name and finish.
    fireEvent.change(screen.getByTestId("display-name-input"), {
      target: { value: "Alice" },
    });
    fireEvent.click(screen.getByTestId("finish-onboarding-btn"));

    await waitFor(() => {
      expect(signUpSpy).toHaveBeenCalled();
      expect(avatar.resizeImageToSquare).toHaveBeenCalled();
      expect(avatar.setProfileAvatar).toHaveBeenCalled();
    });
  });
});
```

Note: the `vi.mock("@/jazz/createAccountFromSeed", …)` from Task 4a Step 1 returns `vi.fn()` factories that resolve to `undefined`; the callback under test (`createJazzAccount`) calls `createAccountWithSeed(seed)` → `undefined`, then `setDisplayNameOnMe(handle, name)`, then our avatar upload. Make the createAccountFromSeed mock's inner fns return a resolved value so the callback's `await`s don't throw. Update that mock (top of file) to:

```tsx
vi.mock("@/jazz/createAccountFromSeed", () => ({
  useCreateAccountWithSeed: () => vi.fn(async () => ({ accountID: "co_zTEST" })),
  useSetDisplayNameOnMe: () => vi.fn(async () => {}),
}));
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `nix-shell --run "npx vitest run tests/unit/routes/onboarding/profile-step.test.tsx -t 'deferred avatar'"`
Expected: FAIL — `expect(avatar.setProfileAvatar).toHaveBeenCalled()` fails because `handleFinish`'s `createJazzAccount` callback does not yet upload an avatar.

- [ ] **Step 3: Wire the deferred upload into handleFinish**

In `src/routes/onboarding/profile-step.tsx`, modify the `createJazzAccount` callback inside `handleFinish` (currently `profile-step.tsx:60-65`) so it uploads the picked avatar after the account + display name are set. The account becomes the active `me` via `ArcanAccount.getMe()` once `createAccountWithSeed` returns (see `createAccountFromSeed.ts:119, 166`). Replace the callback with:

```tsx
        createJazzAccount: async (s, name) => {
          const handle = await createAccountWithSeed(s);
          await setDisplayNameOnMe(handle, name);
          // Deferred avatar upload: the account exists now. Resize to 256²
          // (matching conversation-icon behavior) and assign. A failure here
          // must NOT abort sign-up — the account is already created — so we
          // surface a non-blocking note and continue.
          if (avatarFile) {
            try {
              const { ArcanAccount } = await import(
                "@/jazz/schema/ArcanAccount"
              );
              const me = await ArcanAccount.getMe().$jazz.ensureLoaded({
                resolve: { profile: true },
              });
              const resized = await resizeImageToSquare(avatarFile, 256);
              await setProfileAvatar(me as any, resized);
            } catch {
              setError(
                "account created, but the profile picture didn't upload — you can add it later in your profile.",
              );
            }
          }
          return handle;
        },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `nix-shell --run "npx vitest run tests/unit/routes/onboarding/profile-step.test.tsx"`
Expected: PASS — all picker + deferred-upload tests green.

- [ ] **Step 5: Typecheck + token guard + full onboarding unit run**

Run: `nix-shell --run "npx tsc --noEmit && npm run check-tokens && npx vitest run tests/unit/routes/onboarding/"`
Expected: tsc clean; check-tokens passes; all onboarding unit specs PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/onboarding/profile-step.tsx tests/unit/routes/onboarding/profile-step.test.tsx
git commit -m "feat(unit-9-4): upload onboarding avatar after account creation (1.4-A)"
```

---

## Task 5: Vertical breathing room on the recovery-code display step (1.3/1.4/1.5-A)

The backup-display step inherits the `tall`-mode column gap of `11px` (`auth-surface.tsx:68`) — too tight for the warning + 24-word grid + checkbox + buttons. Add explicit vertical spacing between the major blocks without touching `AuthSurface` (which other steps share). Use a token-friendly approach: wrap the children in a flex column with a larger gap, or add `mt-*` to the dense blocks. We choose explicit margins so the column's own gap still governs incidental spacing.

**Files:**
- Modify: `src/routes/onboarding/backup-display-step.tsx`
- Test: `tests/unit/routes/onboarding/backup-display-step.test.tsx` (create)

- [ ] **Step 1: Write the failing test asserting the breathing-room spacing hooks**

Create `tests/unit/routes/onboarding/backup-display-step.test.tsx`:

```tsx
import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { BackupDisplayStep } from "@/routes/onboarding/backup-display-step";

const PHRASE = Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(" ");

describe("BackupDisplayStep spacing", () => {
  test("renders a roomy variant marker for the recovery-code step", () => {
    const { container } = render(
      <BackupDisplayStep
        phrase={PHRASE}
        onBack={() => {}}
        onContinue={() => {}}
      />,
    );
    // The step opts into extra vertical breathing room (1.3/1.4/1.5-A) via a
    // data hook so the spacing intent is testable and not silently dropped.
    const roomy = container.querySelector('[data-roomy="recovery"]');
    expect(roomy).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `nix-shell --run "npx vitest run tests/unit/routes/onboarding/backup-display-step.test.tsx"`
Expected: FAIL — no `[data-roomy="recovery"]` element exists yet.

- [ ] **Step 3: Add vertical breathing room**

In `src/routes/onboarding/backup-display-step.tsx`, wrap the warning + grid + checkbox in a roomier flex column and tag it. Replace the JSX between `<AuthTitle>save your recovery code</AuthTitle>` (line 31) and the button `<div className="flex gap-3">` (line 61) with:

```tsx
      <AuthTitle>save your recovery code</AuthTitle>

      {/* Extra vertical breathing room for the dense recovery-code step
          (1.3/1.4/1.5-A). The shared AuthSurface column gap is 11px (tall
          mode) — too tight here, so this block uses gap-5. */}
      <div data-roomy="recovery" className="flex flex-col gap-5">
        {/* Warning callout — same warn-amber palette as the design's
            recovery scene (hf-flows.jsx lines 108-118). */}
        <div className="flex items-start gap-2 rounded-r-3 border border-amber/40 bg-amber/10 px-3 py-[9px]">
          <span className="font-mono text-[12px] font-semibold text-amber leading-snug">
            ⚠
          </span>
          <span className="text-[10.5px] leading-relaxed text-amber">
            this 24-word code is the only way to recover your account. nox
            cannot reset it.
          </span>
        </div>

        <PassphraseGrid phrase={phrase} withCopyButton />

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            data-testid="passphrase-saved-checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-[2px] h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent)]"
          />
          <span className="text-[11px] text-text-2 leading-relaxed">
            i have saved my recovery code in a secure location and understand it
            cannot be recovered if lost.
          </span>
        </label>
      </div>
```

Leave the existing button row and `step 2 of 4` footer unchanged below this block.

- [ ] **Step 4: Run the test to verify it passes**

Run: `nix-shell --run "npx vitest run tests/unit/routes/onboarding/backup-display-step.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Token guard + typecheck**

Run: `nix-shell --run "npm run check-tokens && npx tsc --noEmit"`
Expected: check-tokens passes (`gap-5` is a spacing utility, not a color/type literal); tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/routes/onboarding/backup-display-step.tsx tests/unit/routes/onboarding/backup-display-step.test.tsx
git commit -m "ui(unit-9-4): add breathing room to recovery-code display step (1.3/1.4/1.5-A)"
```

---

## Task 6: Repair the e2e onboarding compatibility (helpers + account-creation spec)

The e2e helper `createAccount()` (`helpers.ts:42-89`) already walks the unchanged step structure by testid (welcome `create-account-btn` → credentials → backup-display → backup-confirm → profile → home). **None of this plan's changes alter those testids or step order**, so `createAccount()` keeps working as-is. But the *standalone* `account-creation.spec.ts` re-derives selectors that are already stale (see "Critical pre-existing-test reconciliation" above). Repair it to delegate to the helper.

**Files:**
- Modify: `tests/e2e/account-creation.spec.ts`
- Verify (no change expected): `tests/e2e/helpers.ts`

- [ ] **Step 1: Confirm the helper still matches the (unchanged) step structure**

Run: `grep -n 'create-account-btn\|credentials-continue\|passphrase-display-continue\|confirm-passphrase-btn\|display-name-input\|finish-onboarding-btn' tests/e2e/helpers.ts`
Expected: all six testids present (lines 52, 58, 63, 78, 81, 82) — proving the helper's walk is intact. No edit needed to `helpers.ts`.

- [ ] **Step 2: Rewrite account-creation.spec.ts to use the helper**

Replace the entire contents of `tests/e2e/account-creation.spec.ts` with:

```ts
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

/**
 * E2E: Full account creation flow.
 *
 * Walks the onboarding path via the shared createAccount() helper:
 *   welcome → credentials → backup-display → backup-confirm → profile → home
 *
 * The helper is the single source of truth for onboarding selectors (see
 * tests/e2e/helpers.ts). This spec asserts the end-to-end outcome: a 24-word
 * recovery code was shown and the new account's display name lands in the
 * sidebar.
 */
test("account creation flow", async ({ page }) => {
  const { recoveryCode, displayName } = await createAccount(page, "Test User");

  // The helper already waited for home-main. Verify the captured recovery
  // code is a full 24-word mnemonic.
  expect(recoveryCode.split(" ")).toHaveLength(24);
  for (const word of recoveryCode.split(" ")) {
    expect(word.trim().length).toBeGreaterThan(0);
  }

  // Sidebar shows the chosen display name.
  await expect(page.getByTestId("home-main")).toBeVisible();
  await expect(page.getByTestId("sidebar-display-name")).toHaveText(displayName);
});
```

- [ ] **Step 3: Typecheck the spec (lint-level; full e2e needs the dev+sync servers)**

Run: `nix-shell --run "npx tsc --noEmit -p tsconfig.json"`
Expected: no errors. (The Playwright runtime run in Step 4 is the real verification.)

- [ ] **Step 4: Run the onboarding e2e specs end-to-end**

Prereq: in two background shells, `nix-shell --run "npm run sync"` (Jazz sync on :4200) and `nix-shell --run "npm run dev"` (Vite on :5173) must be running.

Run: `nix-shell --run "npx playwright test account-creation recovery-with-code --reporter=line"`
Expected: both specs PASS. `account-creation` exercises the full sign-up; `recovery-with-code` exercises `createAccount()` then the recovery path — confirming the deleted restore-choice screen and re-pointed back button didn't break the recovery e2e.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/account-creation.spec.ts
git commit -m "test(unit-9-4): repair account-creation e2e to use createAccount helper"
```

---

## Task 7: Full-suite verification + final review

- [ ] **Step 1: Run the complete unit suite**

Run: `nix-shell --run "npx vitest run"`
Expected: all unit tests PASS (especially `tests/unit/routes/onboarding/*` and `tests/unit/components/auth-surface.test.tsx`).

- [ ] **Step 2: Typecheck + token guard across the repo**

Run: `nix-shell --run "npx tsc --noEmit && npm run check-tokens"`
Expected: both clean. No `bg-white`/`text-gray-*`/`border-gray-*`/font-family literals introduced; only token utilities used.

- [ ] **Step 3: Run the onboarding + auth + pair e2e specs**

Prereq: sync + dev servers running (see Task 6 Step 4).

Run: `nix-shell --run "npx playwright test account-creation recovery-with-code login-email-password signup-email-password device-pairing --reporter=line"`
Expected: all PASS — proves the hero-mark bumps on login/pair, the restore-choice deletion, and the avatar/spacing changes left every auth surface functional.

- [ ] **Step 4: Manual spot-check checklist (visual — run `npm run dev`)**

Walk `/onboarding` in the browser and confirm:
- Welcome: single surface, hero mark (visibly ~2× prior), three CTAs in order (create / restore / inline sign-in), vertically centered.
- "restore from recovery code" → goes straight to the 24-word restore screen; its "back" returns to welcome (no intermediate choice screen).
- Recovery-code display step: warning, grid, checkbox, buttons have comfortable vertical spacing (not cramped).
- Display-name step: tapping the camera badge opens a file picker; selecting an image previews it on the 78×78 tile; finishing creates the account and the picture appears on the profile (`/profile`).
- `/auth/login` and the pairing screens show the larger hero mark.

- [ ] **Step 5: Commit any spot-check tweaks (if needed) and finish**

```bash
git add -A
git commit -m "chore(unit-9-4): onboarding restructure spot-check tweaks"
```

(If the spot-check found nothing to change, skip this commit.)

---

## Self-Review Checklist (run after writing — already applied)

**Spec coverage:**
- 1.2 + 1.5 unify → Task 2 (locked; already implemented on `main`, proven by test).
- 1.5-A remove restore-choice → Task 3 (delete file + union case + re-point back button).
- 1.4-A avatar upload at display-name → Task 4a (picker/preview) + 4b (deferred upload via `setProfileAvatar` + `resizeImageToSquare`).
- 1.1-A / 1.2-A / 1.6-C larger logo → Task 1 (welcome/login `size={56}`, pair `size={48}`; full Lattice tier ≥ 44).
- 1.3/1.4/1.5-A breathing room → Task 5 (recovery-code display step `gap-5` block).
- DEC-2 centering → verified (Task 7 Step 4), not re-implemented — inherited from `AuthSurface` (9-1).
- e2e helper `createAccount()` compat → Task 6 (helper unchanged + verified; stale `account-creation.spec.ts` repaired to delegate to it).

**Type consistency:** `setProfileAvatar` / `resizeImageToSquare` signatures match `src/jazz/avatar.ts:12, 36`. `MAX_ATTACHMENT_BYTES` from `@/jazz/attachments` matches `profile-view.tsx:12`. `OnboardingStep` union after Task 3 is exhaustive over the switch in `index.tsx`. Testids introduced (`onboarding-avatar-input`, `onboarding-avatar-change`, `onboarding-avatar-preview`) are used consistently across impl + tests.

**Placeholder scan:** every code step contains real, complete code. No TBD/TODO/"handle edge cases" left.
