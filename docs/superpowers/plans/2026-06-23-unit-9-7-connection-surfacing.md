# Unit 9-7 — Connection-Request Surfacing + Add-Contact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface incoming connection requests in the contacts tab as approve/decline cards, make the live QR pop-up reliable, enrich the invite-accept screen with the inviter's name + avatar on an AuthSurface, and collapse the add-contact copy/share pair into one adaptive button.

**Architecture:** All four sub-features read from the durable foundation shipped in Unit 9-0 (DONE): `me.root.incomingRequests` is a CoList drained by the single app-level subscription `useIncomingConnectionRequestInbox(me)` (already mounted in `App.tsx` — do NOT add another), and `useIncomingConnectionRequests()` is a READ-ONLY hook returning `PendingRequest[]`. We add a new `PendingRequestsSection` component (used inside the contacts tab of `src/components/sidebar.tsx`), keep the existing `/connections/pending` route as the canonical full surface, rework the `confirm` phase of `src/routes/invite/index.tsx`, and replace the two-button copy/share pair in `src/routes/contacts/add.tsx` with one `navigator.share`-feature-detected button.

**Tech Stack:** React 18 + TypeScript (strict), Tailwind v3 with the project token utilities, jazz-tools 0.20.18 (Zod-functional API, `.$jazz.push`/`.$jazz.set`), Vitest (`tests/unit/`), Playwright (`tests/e2e/`). All test/build commands run inside `nix-shell`.

**Dependency note:** Unit 9-7 DEPENDS on Unit 9-0 (DONE). 9-0 provides the durable `me.root.incomingRequests` CoList, the single app-level inbox subscription, and the read-only `useIncomingConnectionRequests()` hook. Do not re-implement the subscription or the durable list.

---

## Pre-flight: foundations to build on (do NOT redo)

These already exist on `main`. Read them before starting; do not duplicate.

- **`src/jazz/use-incoming-connection-requests.ts`** — exports:
  - `useIncomingConnectionRequestInbox(me): void` — the ONLY inbox subscription, mounted once in `App.tsx`. Do not call it again.
  - `useIncomingConnectionRequests(): PendingRequest[]` — read-only. Does its own `useAccount` with `resolve: { root: { dismissedRequestIDs: true, incomingRequests: { $each: true } } }`. Returns `{ request, dismissedLocally }[]`, already filtered to non-approved / non-expired / non-dismissed.
  - `interface PendingRequest { request: any; dismissedLocally: boolean; }`
- **`src/jazz/invitations.ts`** — exports `approveConnectionRequest(me, request)`, `dismissConnectionRequest(me, request)`, `createInvitation(account, channel, linkTtl)`, `parseInvitationURL(url)`, `loadInvitationAsGuest(id)`, `createConnectionRequest(...)`, plus `type LinkTtl = "1h" | "24h" | "7d"`.
- **`src/components/incoming-connection-prompt.tsx`** — `IncomingConnectionPrompt` (mounted in `App.tsx`, authenticated only). It reads `useIncomingConnectionRequests()` and renders a `ModalShell` for the first `channel === "qr"` request. This is a KEPT overlay interrupt.
- **`src/routes/connections/pending.tsx`** — `PendingConnectionsRoute`. Has the `[data-testid="pending-request-row"]` + `[data-pending-request-row="true"]` selectors that `tests/e2e/connection-request-delivery.spec.ts` asserts against. KEEP this route and those selectors intact (see Task 1 reconciliation note).
- **`src/components/qr-display.tsx`** — `QRDisplay` (theme-aware, shipped 9-1). Reuse as-is.
- **`src/components/auth-surface.tsx`** — `AuthSurface`, `Wordmark`, `AuthTitle`, `AuthSub`. Reuse for the invite screen rework.
- **`src/components/avatar.tsx`** — `Avatar` (`size`: `sm`/`md`/`lg`, `rounded-avatar`). `src/jazz/avatarResolver.ts` exports `useRemoteAvatar(accountID)` — reactive remote profile-avatar resolver (returns the FileBlob or undefined).
- **`src/components/sidebar.tsx`** — the contacts tab is the `tab !== "chats"` branch, a `<nav data-testid="sidebar-contacts-list">`. `me` is resolved here; you will extend its resolve and inject the pending section.
- **`src/hooks/use-shared-groups.ts`** — `useSharedGroups(otherAccountID): { id, title }[]`.
- **`src/components/toast.tsx`** — `useToast()` returns `toast({ text, icon?, tone? })`; tones `"neutral" | "success" | "accent" | "error"`.
- **`src/components/empty-pane.tsx`** — `EmptyPane` with `variant: "compact"`, props `title`, `description`, `cta?`, `data-testid?`.
- **`src/components/ui/button.tsx`** — `Button` with `variant: "primary" | "outline" | "ghost"`, `size: "sm"` etc.

**Token rule:** never use raw `bg-white`, `text-gray-*`, `border-gray-*`, or font-family literals. Use `bg-panel`, `text-text`, `text-text-2`, `text-dim`, `border-hairline`, `bg-arcan-accent`, `text-on-accent`, `rounded-avatar`, `rounded-r-3`, `rounded-pill`, `font-mono`. Pill buttons via `<Button>`. Run `npm run check-tokens` before each UI commit.

---

## Canonical design references (cite these values)

- **`design/proto.jsx` `AddContactScreen` (~line 398–431):**
  - Heading `add a contact` (18px/700), sub `share your code so people can add you` (11.5px/400 `text-text-2`).
  - Card: max-width 300, padding 16, centered column, gap 11; `// your code` uppercase label (9px/600, letter-spacing .16em, `text-dim`); QR at `size={128}`; truncated account id (`co_z1a8…4f2`) in `text-dim font-mono`.
  - **Action row in the prototype shows two buttons (`copy link` + `share`).** Unit 9-7 §2-J overrides this to a SINGLE adaptive button (see Task 5). Keep the rest of the prototype layout.
  - TTL pills (`'1d','7d','30d','∞'` in proto) — our live TTL set is `1h / 24h / 7d` (`LinkTtl`); keep the live set, do not adopt the prototype's labels.
- **`docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md` (Unit 1, lines 441–480):** the recipient "Pending Connections list" shows incoming requests where `approvedAt` is unset, expiry not passed, and not in `dismissedRequestIDs`; per row: requester identity + dynamic shared-group hint + **Approve** / **Dismiss**; live in-app **toast** on arrival; **immediate modal** for `channel='qr'`. This is exactly what `useIncomingConnectionRequests()` returns and what the existing `PendingCard` renders.

---

## Surface reconciliation decision (state explicitly)

The existing `/connections/pending` route (`PendingConnectionsRoute`) is **KEPT** as the canonical, full-page surface and its `pending-request-row` selectors stay intact (the 9-0 e2e regression `tests/e2e/connection-request-delivery.spec.ts` depends on them).

The contacts-tab section added in this unit **COMPLEMENTS** (does not replace) that route: it gives the user a persistent, in-context entry point to the same requests without leaving the sidebar. Both surfaces read the same `useIncomingConnectionRequests()` hook and call the same `approveConnectionRequest` / `dismissConnectionRequest`, so they never diverge. The contacts-tab rows carry their own `data-testid="pending-section-row"` selector; the e2e test continues to target the full route. The contacts-tab section also links to `/connections/pending` for the full view.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/components/pending-requests-section.tsx` | New. Compact pending-request approve/decline section rendered at the top of the contacts tab. Reads `useIncomingConnectionRequests()`, calls approve/dismiss, links to `/connections/pending`. | Create |
| `src/components/sidebar.tsx` | Inject `<PendingRequestsSection />` at the top of the contacts-tab `<nav>`. | Modify |
| `src/routes/invite/index.tsx` | Rework the `confirm` phase: wrap in `AuthSurface`, show inviter name + avatar distinctly via `useRemoteAvatar`. | Modify |
| `src/routes/contacts/add.tsx` | Replace the copy/share two-button pair with one `navigator.share`-feature-detected adaptive button. | Modify |
| `src/components/incoming-connection-prompt.tsx` | No code change expected; verified by a new e2e assertion that it fires on `/contacts/add`. | Verify only |
| `tests/unit/components/pending-requests-section.test.tsx` | New. Renders the section, asserts approve/dismiss fire + empty state. | Create |
| `tests/unit/routes/invite-confirm.test.tsx` | New. Asserts the reworked confirm phase shows inviter name + avatar on an AuthSurface. | Create |
| `tests/unit/routes/contacts-add-share.test.tsx` | New. Asserts the single adaptive button: `navigator.share` path vs clipboard path. | Create |
| `tests/e2e/connection-request-delivery.spec.ts` | Extend with QR-channel live-prompt-on-`/contacts/add` coverage; keep the existing link-channel `/connections/pending` assertion unchanged. | Modify |

---

## Task 1: PendingRequestsSection component (contacts-tab pending UI)

**Files:**
- Create: `src/components/pending-requests-section.tsx`
- Test: `tests/unit/components/pending-requests-section.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/pending-requests-section.test.tsx`:

```tsx
import { describe, test, expect, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { PendingRequestsSection } from "@/components/pending-requests-section";

const pendingMock = vi.fn();
vi.mock("@/jazz/use-incoming-connection-requests", () => ({
  useIncomingConnectionRequests: () => pendingMock(),
}));

vi.mock("@/hooks/use-shared-groups", () => ({
  useSharedGroups: () => [],
}));

const approveSpy = vi.fn(async () => undefined);
const dismissSpy = vi.fn(async () => undefined);
vi.mock("@/jazz/invitations", () => ({
  approveConnectionRequest: (...a: any[]) => approveSpy(...a),
  dismissConnectionRequest: (...a: any[]) => dismissSpy(...a),
}));

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({ $isLoaded: true, profile: { displayName: "Alice" } }),
}));

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ToastProvider>{children}</ToastProvider>
    </MemoryRouter>
  );
}

const oneRequest = [
  {
    request: {
      $jazz: { id: "req-1" },
      requesterDisplayName: "Bob Tester",
      requesterAccountID: "bob-account",
      requesterFingerprint: "deadbeef".repeat(8),
      channel: "link",
    },
    dismissedLocally: false,
  },
];

describe("PendingRequestsSection", () => {
  test("renders nothing when there are no pending requests", () => {
    pendingMock.mockReturnValue([]);
    const { container } = render(
      <Wrap>
        <PendingRequestsSection />
      </Wrap>
    );
    expect(container.querySelector('[data-testid="pending-section"]')).toBeNull();
  });

  test("renders a row per pending request with the requester name", () => {
    pendingMock.mockReturnValue(oneRequest);
    render(
      <Wrap>
        <PendingRequestsSection />
      </Wrap>
    );
    expect(screen.getByTestId("pending-section")).toBeTruthy();
    expect(screen.getAllByTestId("pending-section-row")).toHaveLength(1);
    expect(screen.getByText("Bob Tester")).toBeTruthy();
  });

  test("approve fires approveConnectionRequest + a success toast", async () => {
    pendingMock.mockReturnValue(oneRequest);
    render(
      <Wrap>
        <PendingRequestsSection />
      </Wrap>
    );
    fireEvent.click(screen.getByTestId("pending-section-approve"));
    await waitFor(() => expect(approveSpy).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("contact added")).toBeTruthy());
  });

  test("decline fires dismissConnectionRequest", async () => {
    pendingMock.mockReturnValue(oneRequest);
    render(
      <Wrap>
        <PendingRequestsSection />
      </Wrap>
    );
    fireEvent.click(screen.getByTestId("pending-section-decline"));
    await waitFor(() => expect(dismissSpy).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `nix-shell --run "npx vitest run tests/unit/components/pending-requests-section.test.tsx"`
Expected: FAIL — `Failed to resolve import "@/components/pending-requests-section"`.

- [ ] **Step 3: Write the component**

Create `src/components/pending-requests-section.tsx`:

```tsx
import { Link } from "react-router-dom";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useIncomingConnectionRequests } from "@/jazz/use-incoming-connection-requests";
import {
  approveConnectionRequest,
  dismissConnectionRequest,
} from "@/jazz/invitations";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";

/**
 * Pending connection-request section for the sidebar contacts tab (Unit 9-7,
 * §2-I). Surfaces incoming requests as compact approve/decline cards.
 *
 * Reads the durable, read-only `useIncomingConnectionRequests()` hook (Unit
 * 9-0) — it does NOT open an inbox subscription (that lives once in App.tsx via
 * useIncomingConnectionRequestInbox). Approve/decline call the shared helpers in
 * src/jazz/invitations.ts so this surface and the full /connections/pending
 * route never diverge.
 *
 * Renders nothing when there are no pending requests.
 */
export function PendingRequestsSection() {
  const me = useAccount(ArcanAccount, { resolve: { profile: true } });
  const pending = useIncomingConnectionRequests();

  if (!me.$isLoaded) return null;
  if (pending.length === 0) return null;

  return (
    <section
      data-testid="pending-section"
      className="mb-2 flex flex-col gap-2 rounded-r-3 border border-hairline bg-panel p-2"
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">
          pending requests
        </span>
        <Link
          to="/connections/pending"
          className="text-[10px] text-arcan-accent"
          data-testid="pending-section-see-all"
        >
          see all
        </Link>
      </div>
      {pending.map(({ request }) => (
        <PendingRow key={(request as any).$jazz.id} me={me as any} request={request} />
      ))}
    </section>
  );
}

function PendingRow({ me, request }: { me: any; request: any }) {
  const r = request as any;
  const shared = useSharedGroups(r.requesterAccountID);
  const toast = useToast();

  return (
    <div
      data-testid="pending-section-row"
      data-request-id={r.$jazz.id}
      className="flex flex-col gap-2 rounded-r-3 bg-bg p-2"
    >
      <div className="flex items-center gap-2">
        <Avatar
          initials={r.requesterDisplayName?.[0] ?? "?"}
          size="sm"
          loadAs={me}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-text">
            {r.requesterDisplayName}
          </div>
          <div className="text-xs text-text-2">wants to connect</div>
          {shared.length > 0 && (
            <div className="text-[11px] text-arcan-accent">
              both in: {shared.map((s: any) => s.title).join(" · ")}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          data-testid="pending-section-approve"
          onClick={async () => {
            await approveConnectionRequest(me, request);
            toast({ icon: "check", text: "contact added", tone: "success" });
          }}
        >
          approve
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          data-testid="pending-section-decline"
          onClick={async () => {
            await dismissConnectionRequest(me, request);
            toast({ icon: "check", text: "request dismissed", tone: "neutral" });
          }}
        >
          decline
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `nix-shell --run "npx vitest run tests/unit/components/pending-requests-section.test.tsx"`
Expected: PASS — 4 passed.

- [ ] **Step 5: Run the token guard**

Run: `nix-shell --run "npm run check-tokens"`
Expected: exits 0 (no ad-hoc color/typography classes flagged).

- [ ] **Step 6: Commit**

```bash
git add src/components/pending-requests-section.tsx tests/unit/components/pending-requests-section.test.tsx
git commit -m "feat(unit-9-7): pending-requests section for contacts tab"
```

---

## Task 2: Mount PendingRequestsSection in the contacts tab

**Files:**
- Modify: `src/components/sidebar.tsx`

The contacts-tab branch is the `else` (`tab !== "chats"`) arm rendering `<nav data-testid="sidebar-contacts-list">`. We render `<PendingRequestsSection />` as the first child inside that nav, above the contacts list / empty-pane.

`useIncomingConnectionRequests()` runs its own `useAccount` with its own resolve, so the Sidebar's `me` resolve does NOT need to change for this task.

- [ ] **Step 1: Add the import**

In `src/components/sidebar.tsx`, add to the import block (after the existing `EmptyPane` import on line 13):

```tsx
import { PendingRequestsSection } from "@/components/pending-requests-section";
```

- [ ] **Step 2: Inject the section into the contacts-tab nav**

Find the contacts-tab nav opening (the `else`-branch `<nav … data-testid="sidebar-contacts-list" …>` around lines 341–350) and insert `<PendingRequestsSection />` as its first child, immediately before the `{contacts.length === 0 ? (` expression.

Change:

```tsx
        >
          {contacts.length === 0 ? (
```

to:

```tsx
        >
          <PendingRequestsSection />
          {contacts.length === 0 ? (
```

- [ ] **Step 3: Verify the project type-checks and the existing sidebar test still passes**

Run: `nix-shell --run "npx tsc --noEmit && npx vitest run tests/unit/components/sidebar-separation.test.tsx"`
Expected: tsc clean; sidebar-separation test PASS (the divider treatment is untouched, so this anchor test must stay green).

- [ ] **Step 4: Run the token guard**

Run: `nix-shell --run "npm run check-tokens"`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(unit-9-7): surface pending requests in contacts tab"
```

---

## Task 3: Rework the invite-accept confirm screen (AuthSurface + inviter name/avatar)

**Files:**
- Modify: `src/routes/invite/index.tsx`
- Test: `tests/unit/routes/invite-confirm.test.tsx`

Only the `phase === "confirm"` render block changes (the final `return` at the bottom of `InviteRoute`, currently lines 296–348). All loading/expired/error/sending/sent/approved/signin-required phases and all effect logic stay exactly as-is. We:
1. Wrap the confirm body in `<AuthSurface>` for centered cosmic backdrop.
2. Show the inviter's **avatar** (resolved reactively via `useRemoteAvatar(inv.inviterAccountID)`) and **name** distinctly/separated above the action.
3. Keep the `data-testid="invite-inviter-name"` element (the 9-0 e2e test asserts it contains the inviter name) and the `invite-confirm`, `invite-accept-btn`, `invite-decline-btn` testids.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routes/invite-confirm.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- mocks: keep the component on the "confirm" phase deterministically ---
vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({ $isLoaded: true, profile: { displayName: "Me" }, root: {} }),
  useIsAuthenticated: () => true,
}));

vi.mock("@/jazz/avatarResolver", () => ({
  useRemoteAvatar: () => undefined, // exercises the initials fallback
}));

vi.mock("@/hooks/use-shared-groups", () => ({
  useSharedGroups: () => [],
}));

const loadInvitationAsGuest = vi.fn(async () => ({
  inviterAccountID: "inviter-acct",
  inviterFingerprint: "abcd".repeat(16),
  inviterDisplayName: "Carol Inviter",
  channel: "link",
  $jazz: { id: "inv-1" },
}));

vi.mock("@/jazz/invitations", () => ({
  parseInvitationURL: () => ({ invitationID: "inv-1", inviterAccountID: "inviter-acct" }),
  loadInvitationAsGuest: (...a: any[]) => loadInvitationAsGuest(...a),
  createConnectionRequest: vi.fn(),
}));

import { InviteRoute } from "@/routes/invite";

beforeEach(() => {
  // The route reads window.location for the fragment; jsdom default is fine
  // because parseInvitationURL is mocked. Nothing to set up.
});

describe("InviteRoute confirm phase", () => {
  test("shows inviter name + avatar on an AuthSurface", async () => {
    render(
      <MemoryRouter>
        <InviteRoute />
      </MemoryRouter>
    );
    // Loads async → confirm phase.
    expect(await screen.findByTestId("invite-confirm")).toBeTruthy();
    expect(screen.getByTestId("invite-inviter-name").textContent).toContain(
      "Carol Inviter"
    );
    // Avatar fallback renders the inviter's initial.
    expect(screen.getByTestId("invite-inviter-avatar")).toBeTruthy();
    // AuthSurface backdrop wrapper present.
    expect(document.querySelector("[data-auth-surface]")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `nix-shell --run "npx vitest run tests/unit/routes/invite-confirm.test.tsx"`
Expected: FAIL — `invite-inviter-avatar` not found and/or `[data-auth-surface]` null (the current confirm block has no avatar and is not wrapped in AuthSurface).

- [ ] **Step 3: Add the imports**

In `src/routes/invite/index.tsx`, add to the import block (the component already imports `Lattice`, `Button`, `SafetyNumber`):

```tsx
import { AuthSurface, AuthTitle, AuthSub } from "@/components/auth-surface";
import { Avatar } from "@/components/avatar";
import { useRemoteAvatar } from "@/jazz/avatarResolver";
```

- [ ] **Step 4: Resolve the inviter avatar reactively**

Inside `InviteRoute`, after the existing `const shared = useSharedGroups(...)` line (currently line 94), add:

```tsx
  const inviterAvatar = useRemoteAvatar(invitation?.inviterAccountID ?? null);
```

(`useRemoteAvatar` accepts `null` to skip; it's safe to call unconditionally at the top level — `invitation` is null only during `loading`, which returns early *after* hooks run, so hook order stays stable.)

- [ ] **Step 5: Replace the confirm-phase render block**

Replace the entire final `// phase === "confirm"` block (current lines 296–348, from `const inv = invitation as any;` through the closing `);` and `}`) with:

```tsx
  // phase === "confirm"
  const inv = invitation as any;
  return (
    <AuthSurface w={360}>
      <div
        className="flex flex-col items-center gap-4"
        data-testid="invite-confirm"
      >
        <Avatar
          src={inviterAvatar}
          initials={inv.inviterDisplayName?.[0] ?? "?"}
          size="lg"
          loadAs={me}
          data-testid="invite-inviter-avatar"
        />
        <div className="flex flex-col items-center gap-1 text-center">
          <span
            className="text-lg font-semibold text-text"
            data-testid="invite-inviter-name"
          >
            {inv.inviterDisplayName}
          </span>
          <AuthSub>wants to connect with you on arcan</AuthSub>
        </div>

        {shared.length > 0 && (
          <p className="text-center text-xs text-arcan-accent">
            you're both in: {shared.map((s: any) => s.title).join(" · ")}
          </p>
        )}

        <details className="w-full rounded-r-3 border border-hairline bg-panel p-3">
          <summary className="cursor-pointer text-sm text-text">
            view security code
          </summary>
          <div className="mt-3">
            <SafetyNumber fingerprintHex={inv.inviterFingerprint} />
          </div>
          <p className="mt-3 text-center text-[11px] text-dim">
            compare in person to confirm it's really them.
          </p>
        </details>

        <div className="flex w-full gap-2">
          <Button
            variant="primary"
            onClick={onConnect}
            className="flex-1"
            data-testid="invite-accept-btn"
          >
            connect
          </Button>
          <Button
            variant="outline"
            onClick={() => window.history.back()}
            className="flex-1"
            data-testid="invite-decline-btn"
          >
            cancel
          </Button>
        </div>
      </div>
    </AuthSurface>
  );
}
```

Note: `AuthTitle` is imported for parity with other auth surfaces but the inviter name uses a plain `text-lg font-semibold` span so the testid wraps exactly the name text (the e2e `toContainText("Bob")` assertion). If you prefer the AuthTitle styling, wrap the name in `<AuthTitle>` but keep the `data-testid="invite-inviter-name"` on the element containing only the name. Leaving `AuthTitle` unused will trip `tsc`'s `noUnusedLocals` if enabled — so either use it or drop it from the import. **Decision: drop `AuthTitle` from the import** (we render a plain styled span); keep only `AuthSurface, AuthSub`.

Apply that decision — the import line becomes:

```tsx
import { AuthSurface, AuthSub } from "@/components/auth-surface";
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `nix-shell --run "npx vitest run tests/unit/routes/invite-confirm.test.tsx"`
Expected: PASS — 1 passed.

- [ ] **Step 7: Type-check + token guard**

Run: `nix-shell --run "npx tsc --noEmit && npm run check-tokens"`
Expected: tsc clean (no unused `AuthTitle`); check-tokens exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/routes/invite/index.tsx tests/unit/routes/invite-confirm.test.tsx
git commit -m "feat(unit-9-7): enrich invite-accept screen (AuthSurface + inviter avatar)"
```

---

## Task 4: Collapse add-contact copy/share into one adaptive button (§2-J)

**Files:**
- Modify: `src/routes/contacts/add.tsx`
- Test: `tests/unit/routes/contacts-add-share.test.tsx`

Replace the two-button `<div className="flex gap-2 w-full">` block (current lines 90–123, the `copy link` + `share` buttons) with a single full-width button. Behavior:
- If `navigator.share` exists (mobile): label `share invite`, opens the native share sheet via `navigator.share({ url: inviteUrl })`; swallow the user-cancel rejection.
- Else (desktop): label `copy link`, copies to clipboard and fires `toast({ icon: "copy", text: "invite link copied", tone: "accent" })`.

Feature-detect once at render (`typeof navigator !== "undefined" && !!navigator.share`). Keep the QR, the sr-only `qr-url-text` span, the account-id line, the TTL picker, the divider, `scan their code`, and `or paste a link` exactly as they are.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routes/contacts-add-share.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/toast";

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "Me" },
    root: { liveInvitations: { $jazz: { push: vi.fn() } } },
    $jazz: { id: "co_zMyAccount000000000" },
  }),
}));

const createInvitation = vi.fn(async () => ({
  url: "https://arcan.app/invite#abc",
  invitation: {},
}));
vi.mock("@/jazz/invitations", () => ({
  createInvitation: (...a: any[]) => createInvitation(...a),
}));

vi.mock("@/components/qr-display", () => ({
  QRDisplay: () => <div data-testid="qr-stub" />,
}));

import { AddContactRoute } from "@/routes/contacts/add";

function Wrap() {
  return (
    <MemoryRouter>
      <ToastProvider>
        <AddContactRoute />
      </ToastProvider>
    </MemoryRouter>
  );
}

const origShare = (navigator as any).share;
const origClipboard = navigator.clipboard;

afterEach(() => {
  (navigator as any).share = origShare;
  Object.defineProperty(navigator, "clipboard", {
    value: origClipboard,
    configurable: true,
  });
  vi.clearAllMocks();
});

describe("AddContactRoute adaptive share button", () => {
  test("desktop (no navigator.share): single button copies + toasts", async () => {
    (navigator as any).share = undefined;
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<Wrap />);
    const btn = await screen.findByTestId("add-contact-share-btn");
    expect(btn.textContent).toContain("copy link");
    // there must be exactly ONE adaptive action button (the old pair is gone)
    expect(screen.queryByTestId("share-link")).toBeNull();
    expect(screen.queryByTestId("add-contact-copy-btn")).toBeNull();

    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://arcan.app/invite#abc"));
    await waitFor(() => expect(screen.getByText("invite link copied")).toBeTruthy());
  });

  test("mobile (navigator.share present): single button opens the share sheet", async () => {
    const share = vi.fn(async () => undefined);
    (navigator as any).share = share;

    render(<Wrap />);
    const btn = await screen.findByTestId("add-contact-share-btn");
    expect(btn.textContent).toContain("share invite");

    fireEvent.click(btn);
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({ url: "https://arcan.app/invite#abc" })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `nix-shell --run "npx vitest run tests/unit/routes/contacts-add-share.test.tsx"`
Expected: FAIL — `add-contact-share-btn` not found (still the old `add-contact-copy-btn` + `share-link` pair).

- [ ] **Step 3: Replace the button pair with one adaptive button**

In `src/routes/contacts/add.tsx`, replace the whole two-button block:

```tsx
        <div className="flex gap-2 w-full">
          <Button
            variant="outline"
            className="flex-1"
            onClick={async () => {
              if (!inviteUrl) return;
              await navigator.clipboard.writeText(inviteUrl);
              toast({ icon: "copy", text: "invite link copied", tone: "accent" });
            }}
            data-testid="add-contact-copy-btn"
          >
            copy link
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={async () => {
              if (!inviteUrl) return;
              if (navigator.share) {
                try {
                  await navigator.share({ url: inviteUrl });
                } catch {
                  // user cancelled
                }
              } else {
                await navigator.clipboard.writeText(inviteUrl);
                toast({ icon: "copy", text: "link copied", tone: "accent" });
              }
            }}
            data-testid="share-link"
          >
            share
          </Button>
        </div>
```

with the single adaptive button:

```tsx
        {/*
          Unit 9-7 §2-J: one adaptive action.
          Mobile (navigator.share present) → native share sheet ("share invite").
          Desktop → clipboard copy + toast ("copy link").
        */}
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            if (!inviteUrl) return;
            if (canShare) {
              try {
                await navigator.share({ url: inviteUrl });
              } catch {
                // user cancelled the share sheet — no-op
              }
            } else {
              await navigator.clipboard.writeText(inviteUrl);
              toast({ icon: "copy", text: "invite link copied", tone: "accent" });
            }
          }}
          data-testid="add-contact-share-btn"
        >
          {canShare ? "share invite" : "copy link"}
        </Button>
```

- [ ] **Step 4: Add the feature-detect flag**

In `AddContactRoute`, add this near the other derived values (e.g. right after the `const accountID …` line, current line 59):

```tsx
  const canShare = typeof navigator !== "undefined" && !!navigator.share;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `nix-shell --run "npx vitest run tests/unit/routes/contacts-add-share.test.tsx"`
Expected: PASS — 2 passed.

- [ ] **Step 6: Type-check + token guard**

Run: `nix-shell --run "npx tsc --noEmit && npm run check-tokens"`
Expected: tsc clean; check-tokens exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/routes/contacts/add.tsx tests/unit/routes/contacts-add-share.test.tsx
git commit -m "feat(unit-9-7): single adaptive add-contact share/copy button"
```

---

## Task 5: Verify the QR-channel live pop-up on /contacts/add (e2e)

**Files:**
- Modify: `tests/e2e/connection-request-delivery.spec.ts`

`IncomingConnectionPrompt` already renders the `incoming-connection-prompt` modal for the first `channel === "qr"` request, and it's mounted app-wide in `App.tsx` (authenticated only). It reads the durable read-only hook, so it fires while the recipient sits on `/contacts/add`. No component change is expected — we add an e2e test that proves it, and that the existing link-channel assertion still holds.

We cannot drive a real camera scan in Playwright, so we mint a `qr`-channel `ConnectionRequest` by reusing the same invite flow but asserting the modal appears on `/contacts/add`. The link channel does NOT raise the modal (by design), so the QR assertion needs a `qr`-channel request. The recipient's QR-screen invite is `channel="qr"` only when opened via the QR path; the requester's `createConnectionRequest` channel is taken from `invitation.channel`. To get a `qr` request without a camera, drive both via the existing `/pair` QR flow if available; otherwise assert the prompt path using the link flow's modal-absence as a negative control and document the QR positive as a manual check.

**Decision (keep the suite hermetic):** add an assertion to the EXISTING test that the link-channel request does NOT raise the live modal on `/contacts/add` (negative control — proves the prompt is channel-gated and not spuriously firing), and add a focused positive assertion that the prompt component is mounted and reactive by exercising the QR pairing route. Keep the original link → `/connections/pending` assertion byte-for-byte.

- [ ] **Step 1: Add the negative-control assertion to the existing test**

In `tests/e2e/connection-request-delivery.spec.ts`, inside the existing test, immediately AFTER the `await expect(alice.getByTestId("invite-sent")).toBeVisible(...)` line (current line 46) and BEFORE the `// Bob is sitting on /contacts/add …` block, insert:

```ts
    // Unit 9-7 §2-I negative control: a LINK-channel request must NOT raise the
    // live QR pop-up (the immediate modal is gated to channel="qr"). Bob is on
    // /contacts/add; give the request time to arrive, then assert no prompt.
    await bob.waitForTimeout(2000);
    await expect(bob.getByTestId("incoming-connection-prompt")).toHaveCount(0);
```

- [ ] **Step 2: Run the existing e2e spec to verify it still passes (with the new assertion)**

Run: `nix-shell --run "npx playwright test tests/e2e/connection-request-delivery.spec.ts"`
Expected: PASS — the link-channel request still surfaces on `/connections/pending` (unchanged) and the live modal does not appear for the link channel.

> If the sync server is not already running, start it first in a background shell:
> `nix-shell --run "npm run sync"` (Jazz sync on :4200), and Vite via Playwright's webServer config. Confirm both are up before running the spec.

- [ ] **Step 3: Add the QR-channel positive assertion**

Append a new test to `tests/e2e/connection-request-delivery.spec.ts` that drives the in-person QR pairing flow (the `/pair` route used by `scan their code`) so a `channel="qr"` ConnectionRequest is minted, then asserts the live prompt appears on the recipient's screen:

```ts
test("qr-channel request raises the live prompt on the recipient's screen", async ({
  browser,
}) => {
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();

  try {
    await createAccount(host, "Hank");
    await createAccount(guest, "Gwen");

    // Host exposes a QR-channel invite via the pairing initiator route.
    // (Mirror the /pair?role flow the AddContact "scan their code" button uses.)
    await host.goto("/pair?role=initiator");
    await expect(host.getByTestId("qr-url-text")).toBeVisible({ timeout: 15_000 });
    const qrUrl = (await host.getByTestId("qr-url-text").textContent())!.trim();
    expect(qrUrl).toContain("/invite#");

    // Guest opens it and connects → mints a channel="qr" ConnectionRequest.
    await guest.goto(qrUrl);
    await expect(guest.getByTestId("invite-inviter-name")).toContainText("Hank", {
      timeout: 15_000,
    });
    await guest.getByTestId("invite-accept-btn").click();

    // Host is on the QR/pairing screen — the app-wide IncomingConnectionPrompt
    // must raise the live modal (channel="qr" gate).
    await expect(host.getByTestId("incoming-connection-prompt")).toBeVisible({
      timeout: 30_000,
    });
    await expect(host.getByTestId("incoming-connection-prompt")).toContainText(
      "Gwen"
    );
  } finally {
    await guestCtx.close();
    await hostCtx.close();
  }
});
```

> **Investigation note for the implementer:** confirm that `/pair?role=initiator` exposes a `qr-url-text` testid and that the resulting `Invitation.channel === "qr"`. Read `src/routes/pair/index.tsx` and `src/routes/contacts/add.tsx`'s `scan their code` target (`/pair?role=responder`) first. If the initiator route does not produce a `channel="qr"` invitation with a `qr-url-text` hook, adapt the test to whatever testid/flow the QR initiator screen exposes — the assertion that matters is: **a `channel="qr"` request makes `incoming-connection-prompt` visible on the host while the host sits on the QR screen.** Do not weaken that assertion.

- [ ] **Step 4: Run the new e2e test**

Run: `nix-shell --run "npx playwright test tests/e2e/connection-request-delivery.spec.ts -g 'qr-channel'"`
Expected: PASS — the live prompt appears on the host's screen and names the guest.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/connection-request-delivery.spec.ts
git commit -m "test(unit-9-7): e2e for qr live prompt + link-channel negative control"
```

---

## Task 6: Full regression sweep

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `nix-shell --run "npm run test"`
Expected: all Vitest suites PASS, including the pre-existing `tests/unit/routes/connections/pending.test.tsx` and `tests/unit/components/sidebar-separation.test.tsx`.

- [ ] **Step 2: Run the connection e2e spec end-to-end**

Run: `nix-shell --run "npx playwright test tests/e2e/connection-request-delivery.spec.ts"`
Expected: both tests PASS (link survives navigation to `/connections/pending`; qr raises the live prompt).

- [ ] **Step 3: Type-check + token guard one last time**

Run: `nix-shell --run "npx tsc --noEmit && npm run check-tokens"`
Expected: tsc clean; check-tokens exits 0.

- [ ] **Step 4: Commit (only if anything was touched in this task)**

```bash
git add -A
git commit -m "chore(unit-9-7): regression sweep green" --allow-empty
```

---

## Self-Review Checklist

**1. Spec coverage (§9-7 items 2-G / 2-H / 2-I / 2-J):**
- **2-I pending requests → contacts tab** → Task 1 (component) + Task 2 (mount in `sidebar.tsx` contacts tab). Reads the read-only `useIncomingConnectionRequests()`; approve → `approveConnectionRequest`, decline → `dismissConnectionRequest`. Reconciliation with `/connections/pending` stated explicitly (KEEP route; section COMPLEMENTS, links to it).
- **2-I QR-channel live pop-up** → Task 5 verifies `IncomingConnectionPrompt` fires on `/contacts/add`/QR screen (positive) and is channel-gated (negative control). No component change required.
- **2-H invite-accept screen** → Task 3: AuthSurface-centered, inviter name + avatar shown distinctly via `useRemoteAvatar`, security-code expander + shared-group hint retained.
- **2-J add-contact button** → Task 4: single adaptive `navigator.share`/clipboard button; QR + TTL picker untouched.
- **2-G:** the prompt asks for items 2-G/2-H/2-I/2-J but the scope body only details 2-H/2-I/2-J. If §2-G in the spec names a distinct deliverable not covered above, STOP and confirm with the requester before implementing — this plan does not invent scope. (Flagged here so the gap is visible rather than silently dropped.)

**2. Placeholder scan:** no "TBD"/"add error handling"/"similar to Task N" — every code step shows full code.

**3. Type consistency:** testids are stable across tasks — `pending-section`, `pending-section-row`, `pending-section-approve`, `pending-section-decline`, `pending-section-see-all` (Task 1); `invite-confirm`, `invite-inviter-name`, `invite-inviter-avatar` (Task 3); `add-contact-share-btn` (Task 4); `incoming-connection-prompt` (Task 5, pre-existing). Helper names match their definitions: `approveConnectionRequest`/`dismissConnectionRequest` (from `invitations.ts`), `useIncomingConnectionRequests` (read-only), `useRemoteAvatar` (from `avatarResolver.ts`). The 9-0 e2e selectors `pending-request-row` / `pending-request-row="true"` are NOT renamed (Task 5 keeps the existing route assertion intact).

**4. Foundation respect:** no new inbox subscription added (only `useIncomingConnectionRequestInbox` in `App.tsx` subscribes); `QRDisplay`, `AuthSurface`, `Avatar`, `useToast`, `EmptyPane`, `Button` reused; tokens via `npm run check-tokens`.
