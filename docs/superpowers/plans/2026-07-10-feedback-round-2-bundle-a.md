# Feedback Round 2 — Bundle A (copy & phrasing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the six copy/phrasing fixes from the 2026-07-10 feedback spec (Bundle A) with matching parity-cell and unit-test updates.

**Architecture:** Pure string/copy changes across presenters (`src/ui/screens/`), containers (`src/routes/`), and one overlay component. Every user-visible string that also appears in the parity proto reference (`tests/parity/proto-cells.jsx`) is patched on both sides with an intent-fix note, following the established "proto patched copy" precedent (see `contact-request-screen.tsx` header). The 1:1-delete confirmation copy is **deliberately NOT in this bundle** — it lands with Bundle C's modal migration.

**Tech Stack:** React 19 + TypeScript (strict), Vitest unit tests in `tests/unit/`, parity harness via `npm run parity`.

**Conventions that apply to every task:** all UI copy is lowercase; never touch `data-testid` values; never edit `design/` (gitignored canonical reference).

---

### Task 1: "scan their QR code"

**Files:**
- Modify: `src/ui/screens/add-contact-screen.tsx:48,166,172`
- Modify: `src/routes/contacts/scan.tsx:43`
- Modify: `tests/parity/proto-cells.jsx:734`

- [ ] **Step 1: Update the add-contact button label**

In `src/ui/screens/add-contact-screen.tsx`:

Line 48 (prop-doc comment):
```tsx
  onScan: () => void;                    // "scan their QR code" — "scan-their-code"
```

Line 166 (comment) and 172 (label):
```tsx
          {/* "scan their QR code" primary button — proto:425 (intent-fix, feedback round 2: spell out QR) */}
          <div className="w-full max-w-[300px]">
            <PButton
              primary
              full
              icon="search"
              label="scan their QR code"
              onClick={onScan}
              data-testid={scanBtnTestId}
            />
          </div>
```
(The `data-testid` stays `scan-their-code` — testids are stable identifiers, not copy.)

- [ ] **Step 2: Update the scanner screen title**

In `src/routes/contacts/scan.tsx` line 43:
```tsx
          title="scan their QR code"
```

- [ ] **Step 3: Patch the parity proto cell**

In `tests/parity/proto-cells.jsx` line 734, change the label and leave a marker:
```jsx
          {/* intent-fix (feedback round 2): "scan their code" → "scan their QR code" */}
          <div style={{ width: '100%', maxWidth: 300 }}><PButton s={s} primary full label="scan their QR code" icon="search" onClick={() => {}} /></div>
```

- [ ] **Step 4: Verify no stale occurrences**

Run: `grep -rn "scan their code" src/ tests/`
Expected: no matches (only `design/` may still contain the old string; `design/` is untouched).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` — expected: exit 0.
```bash
git add src/ui/screens/add-contact-screen.tsx src/routes/contacts/scan.tsx tests/parity/proto-cells.jsx
git commit -m "fix(copy): scan their QR code — spell out QR on add-contact + scanner"
```

---

### Task 2: "create conversation" labels

**Files:**
- Modify: `src/routes/conversations/new.tsx:101-106`
- Modify: `src/ui/screens/profile-screen.tsx:43,122`
- Modify: `tests/parity/proto-cells.jsx:346`

- [ ] **Step 1: New-conversation submit label**

In `src/routes/conversations/new.tsx` lines 101–106, only the 1:1 branch changes:
```tsx
  const submitLabel =
    selectedCount === 0
      ? "select contacts"
      : isGroup
        ? `create group · ${selectedCount} members`
        : "create conversation";
```

- [ ] **Step 2: Profile action button label**

In `src/ui/screens/profile-screen.tsx`:

Line 43 (prop-doc comment):
```tsx
  onMessage: () => void;                // primary "create conversation" PButton
```

Line 122:
```tsx
              label="create conversation"
```
(Behavior is unchanged: the handler still find-or-creates and navigates — user decision #5: rename only.)

- [ ] **Step 3: Patch the parity proto cell**

In `tests/parity/proto-cells.jsx` line 346:
```jsx
          {/* intent-fix (feedback round 2): "message" → "create conversation" */}
          <div style={{ width: '100%', maxWidth: 320 }}><PButton s={s} primary full icon="chat" label="create conversation" onClick={() => {}} /></div>
```

- [ ] **Step 4: Verify tests don't assert the old label**

Run: `grep -rn '"message"' tests/unit/ | grep -v placeholder`
Expected: no label assertions (verified during planning — `new.test.tsx` uses testids only). If anything surfaces, update the assertion to `"create conversation"`.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` — expected: exit 0.
```bash
git add src/routes/conversations/new.tsx src/ui/screens/profile-screen.tsx tests/parity/proto-cells.jsx
git commit -m "fix(copy): create conversation — new-convo submit + profile action button"
```

---

### Task 3: invite confirm screen — request phrasing + cancel-to-home

**Files:**
- Test: `tests/unit/routes/invite-confirm.test.tsx:56-61`
- Modify: `src/routes/invite/index.tsx:372-375`
- Modify: `src/ui/screens/contact-request-screen.tsx:3,24-25,88`
- Modify: `tests/parity/proto-cells.jsx:878,890,891`

- [ ] **Step 1: Update the unit test first (TDD)**

In `tests/unit/routes/invite-confirm.test.tsx` lines 56–61, update the expected labels:
```tsx
    // Accept + decline buttons present with expected labels.
    expect(screen.getByTestId("invite-accept-btn").textContent).toContain(
      "request to become contacts",
    );
    expect(screen.getByTestId("invite-decline-btn").textContent).toContain(
      "cancel",
    );
```
Read the surrounding file first — if it also asserts decline navigation via `window.history.back`, change that assertion to expect navigation to `/` (the route uses react-router's `useNavigate`; the test file's existing router mock/harness shows the pattern to follow).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/routes/invite-confirm.test.tsx`
Expected: FAIL — labels still "accept & add contact" / "decline".

- [ ] **Step 3: Update the container**

In `src/routes/invite/index.tsx` lines 372–375:
```tsx
        onAccept={onConnect}
        onDecline={() => navigate("/")}
        acceptLabel="request to become contacts"
        declineLabel="cancel"
```
(`navigate` is already in scope — used by the expired/error/approved phases. Cancel must land in the base app, not `history.back()`, which strands users who opened the link in a fresh tab.)

- [ ] **Step 4: Update the presenter defaults + sub-line**

In `src/ui/screens/contact-request-screen.tsx`:

Line 3 (header comment): append ` Copy updated 2026-07-10 (feedback round 2): "request to become contacts"/"cancel"; sub-line "invited you to connect" — proto cells patched to match.`

Lines 24–25 (prop defaults):
```tsx
  acceptLabel = "request to become contacts",
  declineLabel = "cancel",
```

Line 88 (the flow is: the viewer is about to SEND a request, so "wants to connect with you" was backwards):
```tsx
            invited you to connect
```

- [ ] **Step 5: Patch the parity proto cells**

In `tests/parity/proto-cells.jsx`:

Line 878:
```jsx
          <div style={{ marginTop: 6, font: `400 11.5px/1.4 ${s.body}`, color: c.text2 }}>invited you to connect</div>
```

Lines 890–891:
```jsx
      {/* intent-fix (feedback round 2): request/cancel phrasing */}
      <PButton s={s} primary full label="request to become contacts" onClick={() => {}} />
      <PButton s={s} danger full label="cancel" onClick={() => {}} />
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/unit/routes/invite-confirm.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/unit/routes/invite-confirm.test.tsx src/routes/invite/index.tsx src/ui/screens/contact-request-screen.tsx tests/parity/proto-cells.jsx
git commit -m "fix(invite): request-to-become-contacts phrasing; cancel returns to the app"
```

---

### Task 4: incoming-request popup — name on its own line

**Files:**
- Test: `tests/unit/components/incoming-connection-prompt.test.tsx`
- Modify: `src/components/incoming-connection-prompt.tsx:81-84`

- [ ] **Step 1: Extend the unit test first (TDD)**

In `tests/unit/components/incoming-connection-prompt.test.tsx`, inside the first test (`renders the modal for an undismissed qr request…`), after the existing avatar assertion add:
```tsx
    // Feedback round 2: display name is its own line, separated from the
    // "wants to connect" sentence.
    expect(screen.getByText("Bob Tester")).toBeTruthy();
    expect(screen.getByText("wants to connect")).toBeTruthy();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/components/incoming-connection-prompt.test.tsx`
Expected: FAIL — `getByText("Bob Tester")` finds no exact match (current text is "Bob Tester wants to connect" in one node).

- [ ] **Step 3: Split the title in the component**

In `src/components/incoming-connection-prompt.tsx`, replace lines 81–84:
```tsx
        <AuthTitle>{r.requesterDisplayName}</AuthTitle>
        <p className="font-body text-ui-empty-sub leading-[1.4] text-text-2 text-center">
          wants to connect
        </p>
        <p className="font-body text-ui-sub text-dim text-center">
          scanned your QR code in person
        </p>
```
(Also lowercases the old "Scanned your code in person." per the lowercase convention and spells out QR. The `text-ui-empty-sub text-text-2` role mirrors the same secondary line on `contact-request-screen.tsx`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/components/incoming-connection-prompt.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add tests/unit/components/incoming-connection-prompt.test.tsx src/components/incoming-connection-prompt.tsx
git commit -m "fix(connections): popup shows requester name on its own line"
```

---

### Task 5: bundle gates + stale-string sweep

**Files:** none new — verification only (fix fallout if any).

- [ ] **Step 1: Stale-string sweep**

Run:
```bash
grep -rn -e "scan their code" -e "accept & add contact" -e "wants to connect with you" src/ tests/
```
Expected: no matches. Fix any stragglers (same patterns as Tasks 1–4) and amend the relevant commit.

- [ ] **Step 2: Full gates**

Run each; all must pass:
```bash
npm run typecheck
npm run check-tokens
npm run check-ui-purity
npx vitest run
npm run parity
```
Expected: exit 0 each. `npm run parity` validates the patched proto cells against the kit screens — if a cell diff fails, the kit change and proto-cell patch are out of sync; align the proto cell with the exact new copy.

- [ ] **Step 3: Commit any gate fixes**

Only if Step 1/2 required changes:
```bash
git add -A && git commit -m "fix(copy): bundle A gate fallout"
```
