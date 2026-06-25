# Unit 9-2 — App shell (persistent sidebar + modals→routes) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the design's navigation model: a persistent desktop sidebar on every authenticated screen, and dedicated routes (not modals) for the settings sub-flows — keeping a thin overlay layer only for true interrupts.

**Architecture:** Today each route mounts its own `<Sidebar />` (and several routes — settings, add-contact, profile — mount none, hiding the sidebar on desktop). Introduce an `<AppShell>` layout that renders the sidebar (desktop) + the routed content via react-router's `<Outlet />`, and wrap the authenticated route group in it. Mobile keeps full-screen behavior (sidebar hidden, content full-bleed). Separately, convert the change-password + view-recovery-code modals to routes under `/settings/*`; keep `IncomingConnectionPrompt`, `TrustedDevicePrompt`, and the image lightbox as overlays. **Scope note:** `group-create-dialog` + `contact-picker` are entangled with the new-conversation (9-3) and members (9-6) flows — their modal→route conversion is owned by those sub-units to avoid double-touching. `ModalShell` therefore stays in-tree (used by the kept overlays + the not-yet-converted dialogs).

**Tech Stack:** react-router-dom 7 (layout routes + `<Outlet />`), React 18 + TS strict, Tailwind v3.

**Spec:** `docs/superpowers/specs/2026-06-23-unit-9-ia-interaction-design.md` § 9-2 (2-F + modal architecture).

**Depends on:** 9-1 (radii/avatars) merged — so the shell renders the corrected primitives.

**Current state (verified):**
- `src/App.tsx` declares the authenticated `<Routes>` inline (lines ~135-164); routes render their own sidebar (`conversations/index.tsx:45`, `conversations/detail.tsx:256/268/280` with `hidden md:contents`).
- Modal consumers of `ModalShell`: `change-password-modal.tsx`, `view-recovery-code-modal.tsx`, `group-create-dialog.tsx`, `contact-picker.tsx`, `leave-with-promote-dialog.tsx`, `incoming-connection-prompt.tsx`, `trusted-device-prompt.tsx`.
- `SettingsRoute` (`src/routes/settings/index.tsx`) renders the settings sections; change-password + view-recovery are opened as modals from the account section.

---

## File structure

- Create: `src/components/app-shell.tsx` — layout: desktop sidebar + `<Outlet />`; mobile full-screen.
- Create: `src/routes/settings/change-password-route.tsx` — wraps existing change-password form as a route screen.
- Create: `src/routes/settings/recovery-code-route.tsx` — wraps existing view-recovery-code form as a route screen.
- Modify: `src/App.tsx` — wrap the authenticated routes in `<AppShell>`; add the two settings sub-routes; keep the three overlay prompts at app root.
- Modify: `src/routes/conversations/index.tsx`, `src/routes/conversations/detail.tsx` — stop mounting their own `<Sidebar />` (the shell provides it); keep mobile full-screen behavior.
- Modify: `src/routes/settings/account-section.tsx` — change-password / recovery-code open via `navigate(...)` instead of local modal state.
- Tests: `tests/unit/components/app-shell.test.tsx`, extend `tests/e2e` smoke if cheap.

---

## Phase 0 · Setup

### Task 0.1: Branch

```bash
cd /home/nox/Documents/Projects/Nox/arcan
git checkout main && git pull --ff-only   # includes 9-1
git checkout -b unit-9-2-app-shell
```

### Task 0.2: Inventory sidebar mounts + modal opens

```bash
grep -rn "<Sidebar" src/routes src/components | grep -v "sidebar.tsx"
grep -rn "ChangePasswordModal\|ViewRecoveryCodeModal\|change-password-modal\|view-recovery-code-modal" src/
```
Note every call-site to update. (Reconnaissance.)

---

## Phase 1 · Persistent desktop sidebar shell (2-F)

### Task 1.1: AppShell layout component

**Files:** Create `src/components/app-shell.tsx`, create `tests/unit/components/app-shell.test.tsx`.

- [ ] **Step 1: Failing test**

```typescript
// tests/unit/components/app-shell.test.tsx
import { describe, test, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/app-shell";

// Sidebar pulls account state; stub it to a marker.
vi.mock("@/components/sidebar", () => ({ Sidebar: () => <div data-testid="sidebar" /> }));

test("AppShell renders the sidebar + outlet content", () => {
  const { getByTestId, getByText } = render(
    <MemoryRouter initialEntries={["/x"]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/x" element={<div>child</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  expect(getByTestId("sidebar")).toBeTruthy();
  expect(getByText("child")).toBeTruthy();
});
```

Run → expect FAIL (module missing).

- [ ] **Step 2: Implement**

```tsx
// src/components/app-shell.tsx
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/sidebar";

/**
 * Authenticated layout shell. Desktop: persistent sidebar + routed pane
 * (the design's HiDesktop = NavColumn + pane, always both). Mobile: the
 * sidebar is hidden (md:flex) so the routed content is full-screen, and
 * the bottom tab bar (mounted in App.tsx) provides nav.
 *
 * Replaces the prior per-route `<Sidebar />` mounts (Unit 9-2 / 2-F).
 */
export function AppShell() {
  return (
    <div className="flex h-screen">
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Test green**

`nix-shell --run 'npx vitest run tests/unit/components/app-shell.test.tsx'` → PASS.

### Task 1.2: Wrap authenticated routes in the shell

**Files:** Modify `src/App.tsx`.

- [ ] **Step 1:** In the authenticated `routeTable`, wrap the inner routes in a layout route:

```tsx
routeTable = (
  <Routes>
    <Route element={<AppShell />}>
      <Route path="/" element={<ConversationsRoute />} />
      <Route path="/conversations" element={<ConversationsRoute />} />
      <Route path="/conversations/new" element={<NewConversationRoute />} />
      <Route path="/conversations/:id" element={<ConversationDetailRoute />} />
      <Route path="/conversations/:id/members" element={<MembersRoute />} />
      <Route path="/settings/*" element={<SettingsRoute />} />
      <Route path="/contacts" element={<Navigate to="/?tab=contacts" replace />} />
      <Route path="/contacts/add" element={<ContactAddRoute />} />
      <Route path="/contacts/:contactID" element={<ContactDetailRoute />} />
      <Route path="/profile/:accountID" element={<ProfileRoute />} />
      <Route path="/connections/pending" element={<PendingConnectionsRoute />} />
      <Route path="/connections/live-invites" element={<LiveInvitesRoute />} />
      <Route path="/auth/recovery" element={<RecoveryRoute />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
```

Import `AppShell`. Note: `/auth/recovery` stays inside the shell only if it should show the sidebar; if recovery stage-2 must stay chromeless, leave it OUTSIDE the `<Route element={<AppShell/>}>` group. **Decision:** keep `/auth/recovery` OUTSIDE the shell (it's an auth-flow stage, not an app screen).

- [ ] **Step 2: Remove per-route sidebar mounts**

In `src/routes/conversations/index.tsx`: delete the `<Sidebar />` + the outer `flex h-screen` wrapper (the shell now provides both); the route returns just its main pane.

In `src/routes/conversations/detail.tsx`: remove the `<div className="hidden md:contents"><Sidebar /></div>` mounts (3 sites) and the surrounding shell flex; keep mobile full-screen behavior (the route content fills the shell's outlet pane). Verify the mobile back-nav still works.

- [ ] **Step 3: tsc + manual smoke**

```bash
nix-shell --run 'npx tsc -b --noEmit'
```
Then `nix-shell --run 'npm run dev:all'` → confirm the sidebar now persists on `/settings`, `/contacts/add`, `/profile/...`, `/connections/...` (desktop), and that mobile still shows full-screen content + bottom tab bar.

- [ ] **Step 4: Commit**

```bash
git add src/components/app-shell.tsx tests/unit/components/app-shell.test.tsx src/App.tsx src/routes/conversations/index.tsx src/routes/conversations/detail.tsx
git commit -m "feat(shell): persistent desktop sidebar via AppShell layout (2-F)

Lifts the sidebar out of per-route mounts into a layout route so it
renders on every authenticated desktop screen. Mobile keeps full-screen
content + bottom tab bar. /auth/recovery stays chromeless.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 2 · Settings modals → routes

Convert the two clearly-settings modals to routes under `/settings`. (Content is ported as-is; the visual rebuild is 9-5. group-create + contact-picker conversion belongs to 9-3/9-6.)

### Task 2.1: change-password route

**Files:** Create `src/routes/settings/change-password-route.tsx`; modify `src/routes/settings/index.tsx` (add nested route) + `account-section.tsx` (navigate instead of modal).

- [ ] **Step 1: Port the form**

Create `change-password-route.tsx` rendering the existing change-password form body (lift the form JSX out of `change-password-modal.tsx`, drop the `ModalShell` wrapper, wrap in a plain screen container that fills the shell pane with a `PaneHeader`-style "change password" title + `← back`). Keep all field `data-testid`s + the `changePassword` flow + the success toast. On success, `navigate("/settings")`.

- [ ] **Step 2: Route it**

In `src/routes/settings/index.tsx`, the settings route is `/settings/*`; add a nested route `change-password` → `<ChangePasswordRoute />`, and ensure the index settings list renders at `/settings`.

- [ ] **Step 3: Open via navigation**

In `account-section.tsx`, the "change password" row → `onClick={() => navigate("/settings/change-password")}` (remove the local modal open-state + the `<ChangePasswordModal>` render).

- [ ] **Step 4: tsc + smoke** — `/settings/change-password` shows the form full-pane with the sidebar present (desktop).

### Task 2.2: recovery-code route

**Files:** Create `src/routes/settings/recovery-code-route.tsx`; modify settings index + `account-section.tsx`.

- [ ] Same pattern: lift the view-recovery-code body (password-confirm stage + the `PassphraseGrid` reveal stage) out of `view-recovery-code-modal.tsx` into a route at `/settings/recovery-code`; account-section row navigates there; keep test-ids + flow.

### Task 2.3: Retire the two modal components

- [ ] Delete `src/routes/settings/change-password-modal.tsx` and `src/routes/settings/view-recovery-code-modal.tsx` once nothing imports them (grep to confirm). Update any tests that referenced the modal components to target the routes instead.

```bash
grep -rn "change-password-modal\|view-recovery-code-modal\|ChangePasswordModal\|ViewRecoveryCodeModal" src/ tests/
```

- [ ] **Commit**

```bash
git add src/routes/settings/ tests/
git commit -m "feat(settings): change-password + recovery-code as routes (not modals)

First slice of the modals→routes conversion (Unit 9-2). Content ported
as-is; visual rebuild is 9-5. group-create/contact-picker conversion is
owned by 9-3/9-6. ModalShell stays for the kept overlay interrupts
(incoming-connection-prompt, trusted-device-prompt, image lightbox).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 3 · Verify + merge

### Task 3.1: Full check

```bash
nix-shell --run 'npm run check-tokens'
nix-shell --run 'npx tsc -b --noEmit'
nix-shell --run 'npx vitest run' 2>&1 | tail -5
nix-shell --run 'timeout 90 npm run build' 2>&1 | tail -5
```

### Task 3.2: Manual smoke (desktop + mobile)

- Desktop: sidebar persists on `/`, `/settings`, `/settings/change-password`, `/settings/recovery-code`, `/contacts/add`, `/profile/<id>`, `/connections/pending`.
- Mobile: content full-screen, bottom tab bar present, no desktop sidebar; change-password/recovery-code render full-screen.
- `/auth/recovery` (stage-2) renders chromeless (no sidebar).

### Task 3.3: Merge

```bash
git push -u origin unit-9-2-app-shell
git checkout main && git merge --no-ff unit-9-2-app-shell -m "Merge Unit 9-2: app shell (persistent sidebar + settings routes)"
git branch -d unit-9-2-app-shell
```

---

## Self-review checklist

- [ ] AppShell renders sidebar (desktop) + outlet; mobile hides sidebar.
- [ ] Every authenticated route except `/auth/recovery` is inside the shell.
- [ ] Per-route `<Sidebar />` mounts removed from conversations index + detail; no double sidebar.
- [ ] change-password + recovery-code are routes; their modal components deleted; account-section navigates.
- [ ] ModalShell still used only by kept overlays + not-yet-converted dialogs (group-create/contact-picker) — documented as 9-3/9-6 scope.
- [ ] check-tokens + tsc + vitest + build clean; desktop + mobile smoke pass.
