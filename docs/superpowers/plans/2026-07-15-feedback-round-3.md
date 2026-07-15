# Feedback Round 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the four approved feedback-round-3 fixes: QR scan opens the camera directly (Android) with a real paste text field, the feedback button gets its Linear deploy wiring plus an honest 404 error, the top back button navigates hierarchically "up" via a central parent map, and the invite-links entry becomes a quiet utility row on the add-contact page.

**Architecture:** A new pure module `src/nav/parents.ts` + thin `useUpNavigation()` hook replace every header `onBack` handler (one source of truth for the screen hierarchy). `QRScanner` auto-launches the native Android scanner on mount with a no-loop cancel fallback. `AddContactScreen` (pure presenter) gains an inline paste reveal and a recessive invite-links row; containers keep all data logic. Deploy config passes Linear env vars through to the api container.

**Tech Stack:** React 19 + TypeScript strict, react-router-dom v7, Jazz 0.20.18, Vitest (`tests/unit/` only), Playwright (`tests/e2e/`), Tailwind v3 tokens (`npm run check-tokens`), kit purity (`npm run check-ui-purity`), parity harness (`npm run parity`).

**Spec:** `docs/superpowers/specs/2026-07-15-feedback-round-3-design.md`

**Environment notes:**
- Work in the existing worktree branch `worktree-feedback-round-3`.
- Enter `nix-shell` for all test runs (provides Node 22 + Playwright browsers).
- Unit tests: `npm test` (or `npx vitest run <path>` for one file). Vitest only picks up `tests/unit/`.
- E2E: `npx playwright test <file>` (the Playwright config manages the dev/sync servers).
- Type gate before every commit: `npm run typecheck`. UI work: also `npm run check-tokens`.

---

### Task 1: Hierarchical parent map (`parentOf`)

**Files:**
- Create: `src/nav/parents.ts`
- Test: `tests/unit/nav/parents.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/nav/parents.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { parentOf } from "@/nav/parents";

describe("parentOf — hierarchical up-navigation map (feedback round 3)", () => {
  test("conversation detail → conversation list", () => {
    expect(parentOf("/conversations/co_zabc")).toBe("/conversations");
  });

  test("members → parent conversation", () => {
    expect(parentOf("/conversations/co_zabc/members")).toBe(
      "/conversations/co_zabc",
    );
  });

  test("new conversation → conversation list", () => {
    expect(parentOf("/conversations/new")).toBe("/conversations");
  });

  test("add contact → contacts tab", () => {
    expect(parentOf("/contacts/add")).toBe("/?tab=contacts");
  });

  test("scan → add contact", () => {
    expect(parentOf("/contacts/scan")).toBe("/contacts/add");
  });

  test("contact detail → contacts tab", () => {
    expect(parentOf("/contacts/co_zbob")).toBe("/?tab=contacts");
  });

  test("another user's profile → contacts tab", () => {
    expect(parentOf("/profile/co_zbob")).toBe("/?tab=contacts");
  });

  test("own profile → settings", () => {
    expect(parentOf("/profile/co_zme", { ownProfile: true })).toBe("/settings");
  });

  test("connections pages → contacts tab", () => {
    expect(parentOf("/connections/pending")).toBe("/?tab=contacts");
    expect(parentOf("/connections/live-invites")).toBe("/?tab=contacts");
  });

  test("settings sub-pages → settings", () => {
    expect(parentOf("/settings/change-password")).toBe("/settings");
    expect(parentOf("/settings/recovery-code")).toBe("/settings");
    expect(parentOf("/settings/feedback")).toBe("/settings");
  });

  test("settings root → home", () => {
    expect(parentOf("/settings")).toBe("/");
  });

  test("unknown route → home", () => {
    expect(parentOf("/what/is/this")).toBe("/");
  });

  test("trailing slashes tolerated", () => {
    expect(parentOf("/conversations/co_zabc/")).toBe("/conversations");
    expect(parentOf("/contacts/add/")).toBe("/?tab=contacts");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/nav/parents.test.ts`
Expected: FAIL — cannot resolve `@/nav/parents`.

- [ ] **Step 3: Write the implementation**

Create `src/nav/parents.ts`:

```ts
// src/nav/parents.ts — hierarchical "up" targets for the top back button.
//
// Feedback round 3 (2026-07-15): the header back button always navigates UP
// (to the screen's structural parent), never back through browser history —
// navigate(-1) caused endless back loops on cross-navigation (conversation →
// profile → conversation → …). Android system/gesture back stays
// history-based (platform up-vs-back convention); only the in-app top button
// is hierarchical.
//
// This map is the single source of truth: when adding a screen with a header
// back button, add its parent here — never navigate(-1) in a header.

export interface UpOptions {
  /** /profile/:id is polymorphic — the container knows whose profile it is. */
  ownProfile?: boolean;
}

export function parentOf(pathname: string, opts: UpOptions = {}): string {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (/^\/conversations\/[^/]+\/members$/.test(path)) {
    return path.slice(0, -"/members".length);
  }
  if (path === "/conversations/new") return "/conversations";
  if (/^\/conversations\/[^/]+$/.test(path)) return "/conversations";
  if (path === "/contacts/scan") return "/contacts/add";
  if (path === "/contacts/add") return "/?tab=contacts";
  if (/^\/contacts\/[^/]+$/.test(path)) return "/?tab=contacts";
  if (/^\/profile\/[^/]+$/.test(path)) {
    return opts.ownProfile ? "/settings" : "/?tab=contacts";
  }
  if (path.startsWith("/connections/")) return "/?tab=contacts";
  if (/^\/settings\/.+/.test(path)) return "/settings";
  if (path === "/settings") return "/";
  return "/";
}
```

Order matters: the literal routes (`/conversations/new`, `/contacts/scan`, `/contacts/add`) are matched before the `:id` patterns that would otherwise swallow them.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/nav/parents.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/nav/parents.ts tests/unit/nav/parents.test.ts
git commit -m "feat(nav): hierarchical parent map for up-navigation"
```

---

### Task 2: `useUpNavigation` hook + swap every header back handler

**Files:**
- Create: `src/nav/use-up-navigation.ts`
- Modify: `src/components/profile-view.tsx:388,465`
- Modify: `src/routes/contacts/add.tsx:77`
- Modify: `src/routes/contacts/scan.tsx:44`
- Modify: `src/routes/contacts/detail.tsx:107`
- Modify: `src/routes/conversations/new.tsx:139`
- Modify: `src/routes/conversations/detail.tsx:1151`
- Modify: `src/routes/conversations/members.tsx:467`
- Modify: `src/routes/settings/index.tsx:265`
- Modify: `src/routes/settings/feedback-route.tsx:167`

Do NOT touch the `onBack` props in `src/routes/onboarding/*` — those are wizard-step state callbacks, not router navigation.

- [ ] **Step 1: Create the hook**

Create `src/nav/use-up-navigation.ts`:

```ts
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { parentOf, type UpOptions } from "./parents";

/**
 * Returns a function that navigates to the current screen's structural
 * parent (see parents.ts).
 *
 * IMPORTANT: call it as `onBack={() => goUp()}` — never `onBack={goUp}`.
 * Passed directly as an event handler, the click event would be misread
 * as UpOptions.
 */
export function useUpNavigation(): (opts?: UpOptions) => void {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return useCallback(
    (opts?: UpOptions) => navigate(parentOf(pathname, opts)),
    [navigate, pathname],
  );
}
```

- [ ] **Step 2: Swap all ten call sites**

In each file below: add the import `import { useUpNavigation } from "@/nav/use-up-navigation";`, add `const goUp = useUpNavigation();` next to the component's existing `const navigate = useNavigate();` (top level, before any early return), and replace the handler:

| File | Old | New |
|---|---|---|
| `src/components/profile-view.tsx:388` (own) | `onBack={() => navigate(-1)}` | `onBack={() => goUp({ ownProfile: true })}` |
| `src/components/profile-view.tsx:465` (other) | `onBack={() => navigate(-1)}` | `onBack={() => goUp()}` |
| `src/routes/contacts/add.tsx:77` | `onBack={() => navigate(-1)}` | `onBack={() => goUp()}` |
| `src/routes/contacts/scan.tsx:44` | `onBack={() => navigate(-1)}` | `onBack={() => goUp()}` |
| `src/routes/contacts/detail.tsx:107` | `onBack={() => navigate(-1)}` | `onBack={() => goUp()}` |
| `src/routes/conversations/new.tsx:139` | `onBack={() => navigate(-1)}` | `onBack={() => goUp()}` |
| `src/routes/conversations/detail.tsx:1151` | `onBack={isDesktop ? undefined : () => navigate("/conversations")}` | `onBack={isDesktop ? undefined : () => goUp()}` |
| `src/routes/conversations/members.tsx:467` | ``onBack={() => navigate(`/conversations/${id}`)}`` | `onBack={() => goUp()}` |
| `src/routes/settings/index.tsx:265` | `onBack={!isDesktop ? () => navigate(-1) : undefined}` | `onBack={!isDesktop ? () => goUp() : undefined}` |
| `src/routes/settings/feedback-route.tsx:167` | `onBack={() => navigate("/settings")}` | `onBack={() => goUp()}` |

Both profile-view screens live in the same component render, so ONE `const goUp = useUpNavigation();` at the top serves both branches.

- [ ] **Step 3: Typecheck + run the unit suite**

Run: `npm run typecheck && npm test`
Expected: PASS. If any existing test asserts the old chronological destination (e.g. a `navigate(-1)` spy), update the assertion to the hierarchical target from the parent map — the spec is authoritative.

- [ ] **Step 4: Commit**

```bash
git add src/nav/use-up-navigation.ts src/components/profile-view.tsx src/routes
git commit -m "feat(nav): header back buttons navigate hierarchically via useUpNavigation"
```

---

### Task 3: QRScanner — native auto-launch, scan-again fallback, single-line paste input

**Files:**
- Modify: `src/qr/scanner.tsx`
- Test (new): `tests/unit/qr/scanner-native.test.tsx`
- Test (existing, must stay green): `tests/unit/qr/scanner-mismatch.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/qr/scanner-native.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QRScanner } from "@/qr/scanner";
import { scanQrNative } from "@/platform/qr";

vi.mock("@/platform/qr", () => ({
  nativeQrAvailable: () => true,
  scanQrNative: vi.fn(),
}));

const scanMock = vi.mocked(scanQrNative);

describe("QRScanner native auto-launch (feedback round 3)", () => {
  beforeEach(() => {
    scanMock.mockReset();
  });

  test("launches the native scanner immediately on mount — no button step", async () => {
    scanMock.mockResolvedValue(null);
    render(<QRScanner onUrl={vi.fn()} expectedPathPrefix="/invite" />);
    await waitFor(() => expect(scanMock).toHaveBeenCalledTimes(1));
  });

  test("cancel shows the scan-again fallback and does NOT relaunch in a loop", async () => {
    scanMock.mockResolvedValue(null);
    render(<QRScanner onUrl={vi.fn()} expectedPathPrefix="/invite" />);
    await waitFor(() =>
      expect(screen.getByTestId("qr-native-scan")).toBeTruthy(),
    );
    expect(scanMock).toHaveBeenCalledTimes(1);
  });

  test("scan-again re-invokes the native scanner", async () => {
    scanMock.mockResolvedValue(null);
    render(<QRScanner onUrl={vi.fn()} expectedPathPrefix="/invite" />);
    await waitFor(() =>
      expect(screen.getByTestId("qr-native-scan")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("qr-native-scan"));
    await waitFor(() => expect(scanMock).toHaveBeenCalledTimes(2));
  });

  test("a matching scan fires onUrl", async () => {
    const onUrl = vi.fn();
    scanMock.mockResolvedValue("https://example.com/invite?via=qr#frag");
    render(<QRScanner onUrl={onUrl} expectedPathPrefix="/invite" />);
    await waitFor(() =>
      expect(onUrl).toHaveBeenCalledWith("https://example.com/invite?via=qr#frag"),
    );
  });

  test("a wrong-kind scan shows the mismatch hint plus scan-again", async () => {
    const onUrl = vi.fn();
    scanMock.mockResolvedValue("https://example.com/pair#frag");
    render(<QRScanner onUrl={onUrl} expectedPathPrefix="/invite" />);
    await waitFor(() => expect(screen.getByTestId("qr-mismatch")).toBeTruthy());
    expect(onUrl).not.toHaveBeenCalled();
    expect(screen.getByTestId("qr-native-scan")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/qr/scanner-native.test.tsx`
Expected: FAIL — the current component renders an "open camera scanner" button and never calls `scanQrNative` on mount, so the first/fourth/fifth tests fail.

- [ ] **Step 3: Implement in `src/qr/scanner.tsx`**

Add native-phase state below the existing `accepted` ref (line 24):

```tsx
  // Feedback round 3: on Android the camera opens immediately on mount —
  // the old button-first layout read as "another screen before the camera".
  // "launching" = native scanner open (or opening); "idle" = user cancelled /
  // denied / mismatched, show scan-again + paste fallback. Never auto-relaunch
  // from "idle" — that would trap the user in the camera.
  const [nativePhase, setNativePhase] = useState<"launching" | "idle">(
    "launching",
  );
  const nativeLaunched = useRef(false);
```

Replace the existing `handleNativeScan` (lines 26–37) with:

```tsx
  async function handleNativeScan() {
    setNativePhase("launching");
    const data = await scanQrNative();
    if (data === null) {
      setNativePhase("idle"); // cancelled or permission denied
      return;
    }
    if (!data.includes(expectedPathPrefix)) {
      setMismatch(true);
      setNativePhase("idle");
      return;
    }
    if (accepted.current) return;
    accepted.current = true;
    setMismatch(false);
    onUrl(data);
  }
```

Add the auto-launch effect directly above the existing web-camera effect (line 39):

```tsx
  useEffect(() => {
    if (!nativeQrAvailable()) return;
    // Ref-guarded: StrictMode double-invokes effects in dev; the OS camera
    // sheet must open exactly once.
    if (nativeLaunched.current) return;
    nativeLaunched.current = true;
    void handleNativeScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Replace the native branch of the JSX (lines 96–99):

```tsx
        {nativeQrAvailable() ? (
          nativePhase === "launching" ? (
            <p className="text-sm text-dim" data-testid="qr-native-launching">
              opening the camera scanner…
            </p>
          ) : (
            <Button
              onClick={() => void handleNativeScan()}
              data-testid="qr-native-scan"
            >
              scan again
            </Button>
          )
        ) : (
```

(The `qr-native-scan` testid now means "re-open the scanner"; the device checklist covers the real camera behavior.)

Replace the paste `<textarea>` (lines 128–138) with a single-line input — same classes minus `rows`, same testid:

```tsx
        <input
          type="text"
          className="w-full rounded-md border bg-background p-2 text-sm font-mono"
          value={pasteValue}
          onChange={(e) => {
            setPasteValue(e.target.value);
            setError(null);
          }}
          placeholder={`paste a link containing "${expectedPathPrefix}"...`}
          data-testid="qr-paste-input"
        />
```

- [ ] **Step 4: Run the qr unit tests**

Run: `npx vitest run tests/unit/qr/`
Expected: PASS — both `scanner-native.test.tsx` (5 tests) and the untouched `scanner-mismatch.test.tsx` (2 tests, web path: `nativeQrAvailable()` is genuinely false in jsdom there since it does not mock `@/platform/qr`).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/qr/scanner.tsx tests/unit/qr/scanner-native.test.tsx
git commit -m "feat(qr): auto-launch native scanner on Android; scan-again fallback; single-line paste input"
```

---

### Task 4: Add-contact — inline paste reveal replaces `prompt()`

**Files:**
- Modify: `src/ui/screens/add-contact-screen.tsx`
- Modify: `src/routes/contacts/add.tsx`
- Modify: `tests/parity/app-gallery/cells.tsx:567` (prop rename)
- Test: `tests/unit/routes/contacts/add.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/routes/contacts/add.test.tsx`. Also add `useLocation` to the existing `react-router-dom` usage by defining a probe component after the `Wrap` helper:

```tsx
import { useLocation } from "react-router-dom";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search + loc.hash}</div>;
}
```

New describe block:

```tsx
describe("AddContactRoute inline paste-a-link (feedback round 3)", () => {
  test("tapping 'or paste a link' reveals an inline field — no prompt() dialog", async () => {
    render(
      <Wrap>
        <AddContactRoute />
      </Wrap>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("add-contact-cancel-btn")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("add-contact-cancel-btn"));
    expect(screen.getByTestId("paste-invite-input")).toBeTruthy();
  });

  test("invalid input shows an inline error and does not navigate", async () => {
    render(
      <Wrap>
        <AddContactRoute />
        <LocationProbe />
      </Wrap>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("add-contact-cancel-btn")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("add-contact-cancel-btn"));
    fireEvent.change(screen.getByTestId("paste-invite-input"), {
      target: { value: "not a link" },
    });
    fireEvent.click(screen.getByTestId("paste-invite-submit"));
    expect(screen.getByTestId("paste-invite-error")).toBeTruthy();
    expect(screen.getByTestId("loc").textContent).toBe("/");
  });

  test("a valid invite URL navigates locally with the origin dropped", async () => {
    render(
      <Wrap>
        <AddContactRoute />
        <LocationProbe />
      </Wrap>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("add-contact-cancel-btn")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("add-contact-cancel-btn"));
    fireEvent.change(screen.getByTestId("paste-invite-input"), {
      target: { value: "https://other-origin.example/invite?via=qr#co_zfrag" },
    });
    fireEvent.click(screen.getByTestId("paste-invite-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toBe(
        "/invite?via=qr#co_zfrag",
      ),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/routes/contacts/add.test.tsx`
Expected: the three new tests FAIL (no `paste-invite-input` exists); the two existing copy/share tests still PASS.

- [ ] **Step 3: Update the presenter `src/ui/screens/add-contact-screen.tsx`**

Imports (line 16–17): add `useState` and `Icon`:

```tsx
import { useState } from "react";
import type { ReactNode, JSX } from "react";
import { PHeader, Body, PCard, PButton, PQR, Icon, tapClass } from "../kit";
```

Prop changes — in both the destructuring and the type literal: remove `onPaste: () => void;`, add:

```tsx
  /** Feedback round 3: inline paste reveal — container validates + navigates. */
  onPasteSubmit: (value: string) => void;
  /** Inline validation error from the container; null/undefined = none. */
  pasteError?: string | null;
  /** Active (non-revoked, non-expired) invite count for the invite-links row. */
  inviteCount?: number;
```

Add local UI state at the top of the component body (below the `primaryIcon` line):

```tsx
  // Reveal state is pure presentation — the container owns validation/nav.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
```

Replace the "or paste a link" ghost button (lines 181–191) with the reveal:

```tsx
          {/* intent-fix (feedback round 3): proto:426 ghost link → inline
              reveal with a real text field. prompt() is not implemented in
              Tauri's Android WebView, so the dialog approach silently did
              nothing on device. */}
          {!pasteOpen ? (
            <button
              className={tapClass}
              onClick={() => setPasteOpen(true)}
              {...(pasteBtnTestId ? { "data-testid": pasteBtnTestId } : {})}
            >
              <span className="font-body text-ui-sub leading-none text-arcan-accent">
                or paste a link
              </span>
            </button>
          ) : (
            <div className="w-full max-w-[300px] flex flex-col gap-2">
              <input
                autoFocus
                type="text"
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                placeholder="paste an invite link…"
                data-testid="paste-invite-input"
                className="w-full rounded-r-2 border border-hairline bg-panel px-2 py-2 font-mono text-ui-value text-text outline-none focus:border-arcan-accent"
              />
              {pasteError && (
                <p
                  className="font-body text-ui-sub leading-none text-red"
                  data-testid="paste-invite-error"
                >
                  {pasteError}
                </p>
              )}
              <PButton
                full
                label="connect"
                onClick={() => onPasteSubmit(pasteValue)}
                data-testid="paste-invite-submit"
              />
            </div>
          )}
```

(`Icon` import is used in Task 5; adding it now avoids touching the import line twice.)

- [ ] **Step 4: Update the container `src/routes/contacts/add.tsx`**

Add paste state + handler (below the `inviteUrl` state, line 32):

```tsx
  const [pasteError, setPasteError] = useState<string | null>(null);

  // Mirrors ScanInviteRoute.handleUrl: drop the pasted URL's origin — the
  // ?via marker + fragment are origin-independent CoValue IDs, so navigating
  // locally keeps the accept flow on this device's own origin.
  function handlePasteSubmit(value: string) {
    const trimmed = value.trim();
    if (!trimmed.includes("/invite")) {
      setPasteError("that doesn't look like an invite link");
      return;
    }
    try {
      const u = new URL(trimmed);
      setPasteError(null);
      navigate(`${u.pathname}${u.search}${u.hash}`);
    } catch {
      setPasteError("that doesn't look like an invite link");
    }
  }
```

In the JSX, replace the `onPaste` prop (lines 107–112) with:

```tsx
      onPasteSubmit={handlePasteSubmit}
      pasteError={pasteError}
```

- [ ] **Step 5: Update the parity fixture**

In `tests/parity/app-gallery/cells.tsx` line 567, replace `onPaste={() => {}}` with `onPasteSubmit={() => {}}` and extend the cell's patch-note comment (lines 552–554) with:

```
  // feedback round 3: onPaste → onPasteSubmit (inline reveal, closed by
  // default — closed state renders the same ghost link, no pixel change).
```

- [ ] **Step 6: Run tests + gates**

Run: `npx vitest run tests/unit/routes/contacts/add.test.tsx && npm run typecheck && npm run check-tokens && npm run check-ui-purity && npm run parity`
Expected: all PASS. Parity passes because the paste reveal is closed by default — the parity cell renders the identical ghost link.

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens/add-contact-screen.tsx src/routes/contacts/add.tsx tests/parity/app-gallery/cells.tsx tests/unit/routes/contacts/add.test.tsx
git commit -m "feat(contacts): inline paste-a-link field replaces prompt() on add-contact"
```

---

### Task 5: Invite-links quiet row + live-invites header

**Files:**
- Modify: `src/ui/screens/add-contact-screen.tsx` (row placement)
- Modify: `src/routes/contacts/add.tsx` (active count)
- Modify: `src/routes/connections/live-invites.tsx` (PHeader)
- Test: `tests/unit/routes/contacts/add.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Update the `jazz-tools/react` mock at the top of `tests/unit/routes/contacts/add.test.tsx` to include invitations (one active, one revoked):

```tsx
vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    $jazz: { id: "alice-account-id" },
    profile: { displayName: "Alice" },
    root: {
      liveInvitations: [
        { $jazz: { id: "inv-1" }, channel: "link" },
        { $jazz: { id: "inv-2" }, channel: "link", revokedAt: new Date() },
      ],
    },
  }),
}));
```

Append a new test:

```tsx
describe("AddContactRoute invite-links row (feedback round 3)", () => {
  test("quiet row shows the active-invite count and sits above the add-someone divider", async () => {
    render(
      <Wrap>
        <AddContactRoute />
      </Wrap>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("manage-invites-link")).toBeTruthy(),
    );
    // 2 invitations mocked, 1 revoked → 1 active.
    expect(screen.getByTestId("manage-invites-link").textContent).toContain(
      "1 active",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/routes/contacts/add.test.tsx`
Expected: the new test FAILS (`manage-invites-link` currently renders ghost text with no count).

- [ ] **Step 3: Move + restyle the row in the presenter**

In `src/ui/screens/add-contact-screen.tsx`:

Delete the old bottom ghost block (the `{onManageInvites && (…)}` button after the paste section).

Insert the quiet row between the your-code `</PCard>` and the "add someone" divider:

```tsx
          {/* intent-fix (feedback round 3): proto has no invite-links entry;
              the previous ghost text at the page bottom was too small to find.
              User direction: below the QR card, above "add someone", visually
              recessive — must not compete with QR/copy/scan. */}
          {onManageInvites && (
            <button
              onClick={onManageInvites}
              data-testid="manage-invites-link"
              className={`${tapClass} w-full max-w-[300px] flex items-center gap-2 rounded-r-2 border border-hairline bg-panel px-3 py-2`}
            >
              <Icon d="personplus" size={14} className="text-dim" />
              <span className="flex-1 text-left font-body text-ui-sub leading-none text-text-2">
                invite links
              </span>
              {typeof inviteCount === "number" && (
                <span className="font-mono text-ui-value leading-none text-dim">
                  {inviteCount} active
                </span>
              )}
              <Icon d="chev" size={14} className="text-dim" />
            </button>
          )}
```

- [ ] **Step 4: Compute the count in the container**

In `src/routes/contacts/add.tsx`:

Deep-resolve the invitation items — change the `useAccount` resolve (line 27):

```tsx
    resolve: { profile: true, root: { liveInvitations: { $each: true } } },
```

Add the count below the `canShare` line (line 59), same filter as the live-invites route:

```tsx
  const invitations = Array.from(
    ((me as any).root?.liveInvitations as Iterable<any>) ?? [],
  ).filter(Boolean);
  const nowMs = Date.now();
  const inviteCount = invitations.filter(
    (i: any) =>
      !i.revokedAt &&
      (!i.expiresAt || new Date(i.expiresAt).getTime() > nowMs),
  ).length;
```

Pass it in the JSX next to `onManageInvites`:

```tsx
      inviteCount={inviteCount}
```

- [ ] **Step 5: Give the live-invites page a header**

In `src/routes/connections/live-invites.tsx`:

- Imports: add `PHeader` to the kit import, drop `PSectionLabel`; add `import { useUpNavigation } from "@/nav/use-up-navigation";`.
- Add `const goUp = useUpNavigation();` directly below the `useToast()` line (before the `if (!me.$isLoaded) return null;` early return — hooks must run unconditionally).
- Replace the return's outer structure: the `PSectionLabel` line is removed, the header added:

```tsx
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="w-full max-w-[600px] mx-auto flex flex-col">
        <PHeader
          title="invite links"
          onBack={() => goUp()}
          backTestId="live-invites-back"
        />
        <div className="px-4 py-4 flex flex-col gap-4">
          {/* …existing empty-state / invite-card mapping unchanged… */}
        </div>
      </div>
    </div>
  );
```

Keep the existing empty-state and card-mapping JSX exactly as they are inside the inner `div`.

- [ ] **Step 6: Run tests + gates**

Run: `npx vitest run tests/unit/routes/ && npm run typecheck && npm run check-tokens && npm run check-ui-purity && npm run parity`
Expected: all PASS. Parity: the app-gallery add-contact cell passes neither `onManageInvites` nor `inviteCount`, so the row does not render in parity — no pixel change.

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens/add-contact-screen.tsx src/routes/contacts/add.tsx src/routes/connections/live-invites.tsx tests/unit/routes/contacts/add.test.tsx
git commit -m "feat(contacts): quiet invite-links row on add-contact; live-invites gets a header"
```

---

### Task 6: Feedback — honest 404 toast

**Files:**
- Modify: `src/routes/settings/feedback-route.tsx:85`
- Test: `tests/unit/routes/settings/feedback-route.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe("FeedbackRoute FormData contract", …)` block (it already has the `fetchSpy` setup):

```tsx
  it("shows the not-set-up message when the endpoint is missing (404)", async () => {
    fetchSpy.mockResolvedValue(
      new Response("Not Found", { status: 404 }) as any,
    );
    const { getByTestId } = renderRoute();
    fireEvent.change(getByTestId("feedback-message"), {
      target: { value: "hello" },
    });
    fireEvent.click(getByTestId("feedback-submit"));
    await waitFor(() =>
      expect(
        screen.getByText("feedback isn't set up on this server"),
      ).toBeTruthy(),
    );
  });

  it("keeps the generic retry message for other failures (500)", async () => {
    fetchSpy.mockResolvedValue(
      new Response("boom", { status: 500 }) as any,
    );
    const { getByTestId } = renderRoute();
    fireEvent.change(getByTestId("feedback-message"), {
      target: { value: "hello" },
    });
    fireEvent.click(getByTestId("feedback-submit"));
    await waitFor(() =>
      expect(screen.getByText("couldn't send — try again")).toBeTruthy(),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/routes/settings/feedback-route.test.tsx`
Expected: the 404 test FAILS (shows the generic message); the 500 test PASSES already.

- [ ] **Step 3: Implement**

In `src/routes/settings/feedback-route.tsx`, replace line 85 (`if (!res.ok) throw new Error(...)`) with:

```tsx
      if (res.status === 404) {
        // The api registers /api/feedback only when LINEAR_API_TOKEN is set
        // (api/src/index.ts) — a 404 means this server isn't configured for
        // feedback, not a transient failure. Don't suggest retrying.
        toast({
          icon: "alert",
          text: "feedback isn't set up on this server",
          tone: "error",
        });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
```

(The early `return` still runs the `finally` block, so `submitting` resets.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/routes/settings/feedback-route.test.tsx`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings/feedback-route.tsx tests/unit/routes/settings/feedback-route.test.tsx
git commit -m "fix(feedback): honest 'not set up on this server' message on 404"
```

---

### Task 7: Deploy wiring — Linear env vars, README, api env hardening, device checklist

**Files:**
- Modify: `api/src/env.ts:9-11`
- Modify: `deploy/docker-compose.yml:34-41`
- Modify: `deploy/.env.example`
- Modify: `deploy/README.md`
- Modify: `docs/testing/android-device-checklist.md`

No unit-test harness exists for `api/` — verification is `npm run typecheck` (`tsc -b` builds the api package too).

- [ ] **Step 1: Harden `optional()` against empty-string overrides**

Compose passes `${VAR:-}`-style defaults, which set the variable to the EMPTY STRING when absent from `.env` — that must not clobber the baked-in defaults. In `api/src/env.ts`, replace the `optional` helper (lines 9–11):

```ts
function optional(name: string, fallback: string): string {
  const value = process.env[name];
  // Treat empty as unset: docker-compose `${VAR:-}` pass-throughs hand us ""
  // when the operator leaves the var out of .env.
  return value && value.length > 0 ? value : fallback;
}
```

- [ ] **Step 2: Pass the Linear vars through in `deploy/docker-compose.yml`**

Append to the `api` service `environment:` block (after `AUTH_RATE_LIMIT_WINDOW`):

```yaml
      # Feedback → Linear (optional). Empty/unset disables the in-app
      # feedback endpoint — see README § Feedback → Linear.
      LINEAR_API_TOKEN: ${LINEAR_API_TOKEN:-}
      # Optional overrides; empty falls back to the Nox/Arcan defaults
      # baked into api/src/env.ts.
      LINEAR_TEAM_ID: ${LINEAR_TEAM_ID:-}
      LINEAR_PROJECT_ID: ${LINEAR_PROJECT_ID:-}
      LINEAR_LABEL_FEEDBACK_ID: ${LINEAR_LABEL_FEEDBACK_ID:-}
      LINEAR_LABEL_BUG_ID: ${LINEAR_LABEL_BUG_ID:-}
      LINEAR_LABEL_IDEA_ID: ${LINEAR_LABEL_IDEA_ID:-}
      LINEAR_LABEL_QUESTION_ID: ${LINEAR_LABEL_QUESTION_ID:-}
      LINEAR_LABEL_NOTE_ID: ${LINEAR_LABEL_NOTE_ID:-}
```

- [ ] **Step 3: Document in `deploy/.env.example`**

Append:

```bash

# Feedback → Linear (optional). The in-app "give feedback" button POSTs to
# /api/feedback, which files an issue in Linear. Without a token the endpoint
# is disabled and the app shows "feedback isn't set up on this server".
# Create a personal API key: Linear → Settings → Security & access → API keys.
LINEAR_API_TOKEN=

# Optional overrides — only needed when filing into a different Linear
# workspace; defaults target the Nox team / Arcan project:
# LINEAR_TEAM_ID=
# LINEAR_PROJECT_ID=
# LINEAR_LABEL_FEEDBACK_ID=
# LINEAR_LABEL_BUG_ID=
# LINEAR_LABEL_IDEA_ID=
# LINEAR_LABEL_QUESTION_ID=
# LINEAR_LABEL_NOTE_ID=
```

- [ ] **Step 4: Add the README section + troubleshooting row**

In `deploy/README.md`, insert a new section between "Android App Links" and "Troubleshooting":

```markdown
## Feedback → Linear

The in-app "give feedback" button (settings → give feedback) files issues in
Linear via `POST /api/feedback`. The endpoint only exists when the api
container has a Linear API token:

1. Create a personal API key in Linear (Settings → Security & access →
   Personal API keys).
2. Add it to `.env`: `LINEAR_API_TOKEN=lin_api_…`
3. Recreate the api container: `docker compose up -d --build api`

Without the token the api boots fine but logs
`LINEAR_API_TOKEN not set — feedback route disabled`, and the app shows
"feedback isn't set up on this server" on submit. Team, project, and label
IDs default to the Nox/Arcan workspace — override them via the commented-out
vars in `.env.example` if you run a fork against another workspace.
```

Append to the troubleshooting table:

```markdown
| App says "feedback isn't set up on this server" | `LINEAR_API_TOKEN` missing from `.env` (or api container not rebuilt since adding it). See § Feedback → Linear. |
```

- [ ] **Step 5: Extend the device checklist**

Append to `docs/testing/android-device-checklist.md` under "Core flows":

```markdown

## Feedback round 3 (2026-07-15)
- [ ] "scan their QR code" (add contact) opens the native camera scanner
      immediately — no intermediate button screen
- [ ] Device pairing responder scan also opens the camera immediately
- [ ] Cancelling the native scanner shows "scan again" + paste field; the
      camera does NOT relaunch on its own
- [ ] "or paste a link" reveals an inline text field; pasting an invite URL
      opens the accept flow (no browser dialog)
- [ ] Header back from a contact's profile lands on the contacts tab; no
      back-and-forth loop between conversation and profile
- [ ] Feedback submit succeeds against a token-configured server; shows
      "feedback isn't set up on this server" against an unconfigured one
```

- [ ] **Step 6: Typecheck + commit**

```bash
npm run typecheck
git add api/src/env.ts deploy/docker-compose.yml deploy/.env.example deploy/README.md docs/testing/android-device-checklist.md
git commit -m "feat(deploy): wire Linear feedback env vars through compose; document setup"
```

---

### Task 8: E2E coverage + full gate run

**Files:**
- Create: `tests/e2e/back-navigation.spec.ts`
- Create: `tests/e2e/add-contact-paste.spec.ts`

- [ ] **Step 1: Write the back-navigation spec**

Create `tests/e2e/back-navigation.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { createAccount, establishContact } from "./helpers";

// Feedback round 3: the header back button navigates hierarchically (up),
// never chronologically (history) — see src/nav/parents.ts.
test.describe("hierarchical up navigation", () => {
  test("own profile → back lands on settings", async ({ page }) => {
    await createAccount(page, "Nav Own");
    await page.goto("/settings");
    await page.getByTestId("settings-me-row").click();
    await expect(page.getByTestId("profile-view")).toBeVisible();
    await page.getByTestId("profile-back").click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("contact profile → back lands on the contacts tab, not the previous page", async ({
    browser,
  }) => {
    const inviterCtx = await browser.newContext();
    const requesterCtx = await browser.newContext();
    const inviterPage = await inviterCtx.newPage();
    const requesterPage = await requesterCtx.newPage();

    await createAccount(inviterPage, "Nav Inviter");
    await createAccount(requesterPage, "Nav Requester");
    await establishContact(inviterPage, requesterPage, "Nav Inviter");

    // Reach the profile via a DIFFERENT page (home) so history-back and
    // up-navigation disagree — the assertion only means something then.
    await requesterPage.goto("/?tab=contacts");
    await requesterPage.getByTestId("sidebar-contact-row-0").click();
    await expect(requesterPage.getByTestId("profile-view")).toBeVisible();
    await requesterPage.getByTestId("profile-back").click();
    await expect(requesterPage).toHaveURL(/\/\?tab=contacts$/);

    await inviterCtx.close();
    await requesterCtx.close();
  });
});
```

- [ ] **Step 2: Write the paste + invite-row spec**

Create `tests/e2e/add-contact-paste.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

// Feedback round 3: "or paste a link" reveals an inline text field (the old
// prompt() dialog is unimplemented in Tauri's Android WebView), and the
// invite-links entry is a quiet row above the add-someone divider.
test.describe("add-contact paste flow + invite-links row", () => {
  test("inline paste: invalid shows an error; a valid invite URL opens the accept flow", async ({
    browser,
  }) => {
    const inviterCtx = await browser.newContext();
    const pasterCtx = await browser.newContext();
    const inviterPage = await inviterCtx.newPage();
    const pasterPage = await pasterCtx.newPage();

    await createAccount(inviterPage, "Paste Inviter");
    await createAccount(pasterPage, "Paster");

    await inviterPage.goto("/contacts/add");
    const copyUrl = inviterPage.getByTestId("copy-url-text");
    await copyUrl.waitFor({ state: "attached", timeout: 15_000 });
    const inviteUrl = (await copyUrl.textContent())!.trim();

    await pasterPage.goto("/contacts/add");
    await pasterPage.getByTestId("add-contact-cancel-btn").click();
    await pasterPage.getByTestId("paste-invite-input").fill("not a link");
    await pasterPage.getByTestId("paste-invite-submit").click();
    await expect(pasterPage.getByTestId("paste-invite-error")).toBeVisible();

    await pasterPage.getByTestId("paste-invite-input").fill(inviteUrl);
    await pasterPage.getByTestId("paste-invite-submit").click();
    await expect(pasterPage.getByTestId("invite-inviter-name")).toContainText(
      "Paste Inviter",
      { timeout: 15_000 },
    );

    await inviterCtx.close();
    await pasterCtx.close();
  });

  test("invite-links row shows the active count and opens live invites", async ({
    page,
  }) => {
    await createAccount(page, "Inv Row");
    await page.goto("/contacts/add");
    // The page auto-creates one invitation on mount → "1 active".
    await expect(page.getByTestId("manage-invites-link")).toContainText(
      "active",
    );
    await page.getByTestId("manage-invites-link").click();
    await expect(page).toHaveURL(/\/connections\/live-invites/);
    await page.getByTestId("live-invites-back").click();
    await expect(page).toHaveURL(/\/\?tab=contacts$/);
  });
});
```

- [ ] **Step 3: Run the new e2e specs**

Run: `npx playwright test tests/e2e/back-navigation.spec.ts tests/e2e/add-contact-paste.spec.ts`
Expected: PASS (3 tests). If a selector mismatch surfaces (e.g. the contacts tab renders `sidebar-contact-row-0` under a different shell on the default viewport), fix the selector — the behavior under test is the URL assertion.

- [ ] **Step 4: Full gate run**

Run each and confirm green:

```bash
npm run typecheck
npm run check-tokens
npm run check-ui-purity
npm run check-platform-purity
npm run parity
npm test
npx playwright test
```

Expected: all PASS. The full Playwright suite matters here: Task 2 changed every header back button, and any existing spec that relied on chronological back must be updated to the hierarchical expectation (the spec is authoritative; update the test, not the nav).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/back-navigation.spec.ts tests/e2e/add-contact-paste.spec.ts
git commit -m "test(e2e): hierarchical back navigation + inline paste + invite-links row"
```

---

## Out of scope (do not implement)

- Setting `LINEAR_API_TOKEN` on the VPS — manual operator step, documented in the README.
- Hiding the feedback row behind a capability probe (declined in design).
- Android system/gesture back behavior — untouched by design.
- Onboarding `onBack` wizard callbacks — not router navigation.

## Manual follow-ups after merge (operator)

1. On the VPS: add `LINEAR_API_TOKEN` to `deploy/.env`, run `docker compose up -d --build api`.
2. Run the new device-checklist items on the Fairphone (native scanner auto-launch cannot run in CI).
