# Feedback Round 2 — Bundle B Wave 1 (simple behavior fixes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land seven small, independent behavior fixes from the feedback-round-2 spec (Bundle B items 1–5, 7, 11): first-3-words verification, notification sound default, edit-discard guard, verbatim message text, own-timestamp-left, security-code copy button, waiting-screen escape.

**Architecture:** Isolated point changes; only the timestamp item touches the kit (with a matching parity proto-cell patch). No schema shape changes (one default-value change only).

**Tech Stack:** React 19 + TS strict, Vitest, parity harness.

**Conventions:** lowercase copy; never touch data-testids; worktree root for all commands.

---

### Task 1: recovery verification = first 3 words

**Files:**
- Modify: `src/routes/onboarding/backup-confirm-step.tsx`

- [ ] **Step 1: Replace the random index selection**

Current (the `useMemo` block):
```tsx
  // Pick three distinct indices, sorted ascending, generated once per mount.
  const challengeIndices = useMemo<[number, number, number]>(() => {
    const picked: number[] = [];
    while (picked.length < 3) {
      const idx = Math.floor(Math.random() * words.length);
      if (!picked.includes(idx)) picked.push(idx);
    }
    picked.sort((a, b) => a - b);
    return picked as [number, number, number];
  }, [words.length]);
```
New:
```tsx
  // Always verify the first three words (feedback round 2): retyping from
  // the saved copy is much easier when the words are consecutive from the
  // start, and BIP-39 entropy is uniform so the check is equally strong.
  const challengeIndices = useMemo<[number, number, number]>(() => [0, 1, 2], []);
```
Also update the component's header doc comment: replace the sentence about "three distinct indices … chosen once via useMemo" with "the first three words are verified (feedback round 2)". Keep everything else (validation, fields, testids) unchanged.

- [ ] **Step 2: Confirm the e2e helper stays compatible**

Read `tests/e2e/helpers.ts:60-80` — it derives which word to type from the rendered label (`confirm-word-N` + label text), so fixed indices keep working. Do not change it; just confirm there is no hardcoded random-index assumption.

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck` — exit 0.
```bash
git add src/routes/onboarding/backup-confirm-step.tsx
git commit -m "fix(onboarding): verify the first 3 recovery words instead of random ones"
```

---

### Task 2: chat text is sent and edited verbatim + unchanged-edit discards

**Files:**
- Modify: `src/routes/conversations/detail.tsx` (handleSaveEdit ~line 616, handleComposerSend ~line 579)

- [ ] **Step 1: Edit handler — verbatim + discard-if-unchanged**

Current:
```tsx
async function handleSaveEdit(message: any) {
  const trimmed = editText.trim();
  if (!trimmed) return;
  await editMessage(me as any, message, trimmed);
  setEditingMessageId(null);
}
```
New:
```tsx
async function handleSaveEdit(message: any) {
  // Feedback round 2: no whitespace stripping — text is stored verbatim.
  // An unchanged edit discards silently instead of stamping edited/editedAt.
  const next = editText;
  if (!next.trim()) return;
  if (next === message.body) {
    setEditingMessageId(null);
    return;
  }
  await editMessage(me as any, message, next);
  setEditingMessageId(null);
}
```

- [ ] **Step 2: Composer — send verbatim**

In `handleComposerSend`, current:
```tsx
  const trimmed = composerText.trim();
  if (!trimmed && pending.length === 0) return;
```
New:
```tsx
  // Feedback round 2: no whitespace stripping on send — only reject
  // messages that are whitespace-only (and have no attachments).
  const body = composerText;
  if (!body.trim() && pending.length === 0) return;
```
and further down change `await handleSend(trimmed, uploaded);` to `await handleSend(body, uploaded);`. Nothing else in the function changes.

- [ ] **Step 3: Verify existing tests + typecheck**

Run: `npx vitest run tests/unit/routes/conversations/detail-divider.test.tsx tests/unit/routes/conversations/detail-header.test.tsx` — PASS.
Run: `npm run typecheck` — exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/routes/conversations/detail.tsx
git commit -m "fix(chat): send/edit message text verbatim; discard unchanged edits"
```

---

### Task 3: own-message timestamp on the left

**Files:**
- Modify: `src/ui/kit/bubble.tsx` (body row inside `Bubble`)
- Modify: `tests/parity/proto-cells.jsx` (the patched-copy `Bubble` body row, ~line 52-54)

- [ ] **Step 1: Kit change**

In `src/ui/kit/bubble.tsx`, the body row currently is:
```tsx
          <div className="flex items-end gap-2">
            <span
              className="flex-1 font-body text-ui-bubble"
              {...(bodyTestId ? { "data-testid": bodyTestId } : {})}
            >
              {m.text}
            </span>
            {m.time && (
              <span
                className="font-mono font-medium text-ui-time text-dim shrink-0 mb-px"
                {...(timeTestId ? { "data-testid": timeTestId } : {})}
              >
                {m.time}
              </span>
            )}
          </div>
```
Replace with (own messages get the time first; `mine` is already in scope):
```tsx
          <div className="flex items-end gap-2">
            {/* intent-fix (feedback round 2): own-message timestamp sits on
                the LEFT of the body; theirs keeps time on the right. */}
            {mine && m.time && (
              <span
                className="font-mono font-medium text-ui-time text-dim shrink-0 mb-px"
                {...(timeTestId ? { "data-testid": timeTestId } : {})}
              >
                {m.time}
              </span>
            )}
            <span
              className="flex-1 font-body text-ui-bubble"
              {...(bodyTestId ? { "data-testid": bodyTestId } : {})}
            >
              {m.text}
            </span>
            {!mine && m.time && (
              <span
                className="font-mono font-medium text-ui-time text-dim shrink-0 mb-px"
                {...(timeTestId ? { "data-testid": timeTestId } : {})}
              >
                {m.time}
              </span>
            )}
          </div>
```

- [ ] **Step 2: Parity proto-cell patch**

In `tests/parity/proto-cells.jsx`, inside the "patched copy: design/proto.jsx:33–71" block, the `Bubble` body row (~line 52-54) currently is:
```jsx
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <span style={{ flex: 1, font: `400 12.5px/1.45 ${s.body}` }}>{m.text}</span>
        {m.time && <span style={{ font: `500 8.5px/1 ${s.font}`, color: p.time, flexShrink: 0, marginBottom: 1 }}>{m.time}</span>}
      </div>
```
Replace with:
```jsx
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        {/* intent-fix (feedback round 2): own-message timestamp on the left */}
        {mine && m.time && <span style={{ font: `500 8.5px/1 ${s.font}`, color: p.time, flexShrink: 0, marginBottom: 1 }}>{m.time}</span>}
        <span style={{ flex: 1, font: `400 12.5px/1.45 ${s.body}` }}>{m.text}</span>
        {!mine && m.time && <span style={{ font: `500 8.5px/1 ${s.font}`, color: p.time, flexShrink: 0, marginBottom: 1 }}>{m.time}</span>}
      </div>
```

- [ ] **Step 3: Targeted parity check**

Run: `nix-shell --run "npm run parity -- --only bubble-own,bubble-theirs,bubble-att,chat-screen"`
Expected: all listed cells PASS. (`chat-screen` includes rendered bubbles; if it isn't a cell id, drop it from the list.)

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck` — exit 0.
```bash
git add src/ui/kit/bubble.tsx tests/parity/proto-cells.jsx
git commit -m "fix(chat): own-message timestamp on the left of the bubble"
```

---

### Task 4: copy button for the security code

**Files:**
- Test: `tests/unit/components/safety-number.test.tsx`
- Modify: `src/components/safety-number.tsx`

- [ ] **Step 1: Update the test file first (TDD)**

`tests/unit/components/safety-number.test.tsx` currently renders `<SafetyNumber>` bare. The component will gain `useToast`, so wrap every `render(...)` with `ToastProvider` (import from `@/components/toast`), and add:
```tsx
it("copies the formatted code and confirms via toast", async () => {
  const writeText = vi.fn(async () => {});
  Object.assign(navigator, { clipboard: { writeText } });
  render(
    <ToastProvider>
      <SafetyNumber fingerprintHex={SAMPLE_HEX} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByTestId("safety-number-copy"));
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(formatSafetyNumber(SAMPLE_HEX)),
  );
});
```
Add the needed imports (`vi`, `fireEvent`, `waitFor`).

- [ ] **Step 2: Run to verify the new test fails**

Run: `npx vitest run tests/unit/components/safety-number.test.tsx`
Expected: FAIL — no `safety-number-copy` testid.

- [ ] **Step 3: Implement the copy affordance**

In `src/components/safety-number.tsx`, keep the invalid-fingerprint branch unchanged. Change the success branch to render the code with an adjacent icon button:
```tsx
import { formatSafetyNumber } from "@/auth/fingerprint";
import { useToast } from "@/components/toast";
import { Icon, tapClass } from "@/ui/kit";
```
component body after `formatted` is computed:
```tsx
  return (
    <div className="flex items-start gap-2">
      <code
        data-testid="safety-number"
        className="block flex-1 font-mono text-sm bg-panel-2 rounded px-3 py-2 tracking-widest text-text-2 break-all"
      >
        {formatted}
      </code>
      <button
        type="button"
        className={`${tapClass} shrink-0 mt-2`}
        aria-label="copy security code"
        data-testid="safety-number-copy"
        onClick={() => {
          void navigator.clipboard.writeText(formatted).then(() =>
            toast({ icon: "check", text: "security code copied", tone: "success" }),
          );
        }}
      >
        <Icon d="copy" size={15} className="text-dim" />
      </button>
    </div>
  );
```
with `const toast = useToast();` at the top of the component (before the try/catch — hooks must be unconditional).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/components/safety-number.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` — exit 0. Also check `src/components/safety-number.tsx` isn't imported anywhere that lacks ToastProvider: `grep -rn "SafetyNumber" src/` — all render sites live under the app's ToastProvider (main branch and the /invite,/pair early-return branches all mount it).
```bash
git add src/components/safety-number.tsx tests/unit/components/safety-number.test.tsx
git commit -m "feat(profile): copy button for the security code"
```

---

### Task 5: notification sound default + waiting-screen escape

**Files:**
- Modify: `src/jazz/schema/ArcanAccount.ts` (~lines 152 and ~269)
- Modify: `src/routes/invite/index.tsx` (~lines 312-320)

- [ ] **Step 1: Sound default on (both creation and backfill)**

Both blocks currently read:
```ts
          notifications: co
            .map({ sound: z.boolean(), browser: z.boolean() })
            .create({ sound: false, browser: false }, { owner: me }),
```
Change BOTH occurrences to:
```ts
          notifications: co
            .map({ sound: z.boolean(), browser: z.boolean() })
            .create({ sound: true, browser: false }, { owner: me }),
```
(`browser` stays false — it is gated on a browser permission prompt and cannot meaningfully default on. Decision from the feedback-round-2 Q&A.)

- [ ] **Step 2: "back to app" on the waiting screen**

In `src/routes/invite/index.tsx`, the `sent` phase currently renders:
```tsx
    if (phase === "sent") {
      return (
        <InviteStatusScreen
          markSize={48}
          title="request sent — waiting for approval…"
          sub="You can close this tab; you'll be notified when they accept."
          rootTestId="invite-sent"
        />
      );
    }
```
Add an outline button (the `outline` prop already exists on `InviteStatusScreen`):
```tsx
    if (phase === "sent") {
      return (
        <InviteStatusScreen
          markSize={48}
          title="request sent — waiting for approval…"
          sub="You can close this tab; you'll be notified when they accept."
          rootTestId="invite-sent"
          outline={{ label: "back to app", onClick: () => navigate("/") }}
          outlineTestId="invite-sent-home-btn"
        />
      );
    }
```

- [ ] **Step 3: Verify tests + typecheck**

Run: `npx vitest run tests/unit/jazz/schema/arcan-account-settings.test.ts tests/unit/routes/invite-confirm.test.tsx` — PASS.
Run: `npm run typecheck` — exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/jazz/schema/ArcanAccount.ts src/routes/invite/index.tsx
git commit -m "fix(settings,invite): sound notifications default on; waiting screen gets back-to-app"
```

---

### Task 6: wave gates

- [ ] **Step 1: Full gates**

Run each; all must pass:
```bash
npm run typecheck
npm run check-tokens
npm run check-ui-purity
npx vitest run
nix-shell --run "npm run parity"
```
Expected: exit 0 each (vitest grows by the new safety-number test; parity stays 142/142 with the patched bubble cells).

- [ ] **Step 2: Commit any gate fixes**

Only if needed:
```bash
git add -A && git commit -m "fix(ui): bundle B wave 1 gate fallout"
```
