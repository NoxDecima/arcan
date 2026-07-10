# Feedback Round 2 — Bundle B Wave 3 (chat behaviors + auth audit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Bundle B items: group-picture system event, conversation-header context menu (delete/leave), last-person-standing delete affordance, right-click/long-press message context, and the auth-surface audit with the sign-in create-account fix.

**Architecture:** The SystemEvent enum gains an `"icon"` kind (emitted from `updateConversationIcon`, rendered with a forward-compatible default branch). The chat header menu and last-person banner live in the detail container using the Bundle-C `useConfirm` dialog and existing `leaveConversation`. Kit `MessageRow` gains an optional, non-visual `onContext` handler (right-click + long-press).

**Tech Stack:** React 19 + TS strict, Jazz 0.20.18 (Zod-based co.map), Vitest, parity harness.

**Conventions:** lowercase copy; keep existing testids; optional kit props defaulting to today's behavior; worktree root.

---

### Task 1: group-picture change emits a system event

**Files:**
- Test: `tests/unit/components/system-event.test.tsx`, `tests/unit/jazz/schema/SystemEvent.test.ts`
- Modify: `src/jazz/schema/SystemEvent.ts`
- Modify: `src/components/system-event.tsx`
- Modify: `src/jazz/conversation.ts` (updateConversationIcon)

- [ ] **Step 1: Extend the tests first (TDD)**

In `tests/unit/components/system-event.test.tsx`, add to the `formatSystemEventMessage` cases:
```tsx
  it("formats icon", () => {
    expect(
      formatSystemEventMessage({ kind: "icon", actorName: "ada" }),
    ).toBe("ada changed the group picture");
  });
```
and a render case following the file's existing pattern (`data-testid="system-event-icon"`).

In `tests/unit/jazz/schema/SystemEvent.test.ts`, extend the kind-enum assertion to include `"icon"` (follow how `system-event-renamed.test.ts` asserts "renamed").

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run tests/unit/components/system-event.test.tsx tests/unit/jazz/schema/SystemEvent.test.ts`
Expected: FAIL (unknown kind).

- [ ] **Step 3: Schema + renderer + emitter**

`src/jazz/schema/SystemEvent.ts`: extend the enum:
```ts
  kind: z.enum(["added", "removed", "left", "promoted", "renamed", "icon"]),
```
and note in the header comment: `"icon" = the conversation picture changed (feedback round 2).`

`src/components/system-event.tsx`:
- Widen the kind unions (`SystemEventProps` and `formatSystemEventMessage` arg) to include `"icon"`.
- Add the switch case and a forward-compatible default:
```tsx
    case "icon":
      return `${actorName} changed the group picture`;
    default:
      // Forward compat: a newer client may write kinds this build doesn't
      // know. Render something neutral instead of crashing.
      return `${actorName} updated the conversation`;
```

`src/jazz/conversation.ts` — `updateConversationIcon` currently ignores its `_me` param and writes no event. Change to:
```ts
export async function updateConversationIcon(
  me: Account,
  conversation: any,
  icon: any | null,
): Promise<void> {
  conversation.$jazz.set("icon", icon ?? undefined);

  // Feedback round 2: picture changes land in the sidecar log like renames.
  writeSystemEvent(me, conversation, { kind: "icon" });
}
```
Also widen `writeSystemEvent`'s payload kind union with `"icon"`. Check `src/routes/conversations/detail.tsx` (~lines 734-752) where system events are mapped into timeline items — widen any written-out kind union there too.

- [ ] **Step 4: Run to verify pass + full unit suite**

Run: `npx vitest run tests/unit/components/system-event.test.tsx tests/unit/jazz/schema/SystemEvent.test.ts` — PASS.
Run: `npx vitest run` — PASS (catches any other exhaustive-switch fallout).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` — exit 0.
```bash
git add src/jazz/schema/SystemEvent.ts src/components/system-event.tsx src/jazz/conversation.ts tests/unit/components/system-event.test.tsx tests/unit/jazz/schema/SystemEvent.test.ts
git commit -m "feat(conversations): 'icon' system event — group-picture changes land in the timeline"
```

---

### Task 2: conversation-header context menu

**Files:**
- Modify: `src/ui/screens/chat-screen.tsx` (optional `headerRight` prop → PHeader `right`)
- Modify: `src/routes/conversations/detail.tsx`

- [ ] **Step 1: Presenter pass-through**

`chat-screen.tsx`: add to props:
```tsx
  /** intent-fix (feedback round 2): header overflow menu slot (⋮). Parity
   * cells omit it — PHeader's right slot renders nothing by default. */
  headerRight?: ReactNode;
```
and pass `right={headerRight}` on the `<PHeader …>` call (lines ~71-88).

- [ ] **Step 2: Container menu**

In `src/routes/conversations/detail.tsx`:

(a) state near the other menu state: `const [headerMenuOpen, setHeaderMenuOpen] = useState(false);`

(b) a delete/leave handler (uses the existing `confirmDialog` from Bundle C, `leaveConversation`, `isLastAdmin` — extend the `@/jazz/conversation` import if needed; `counterpartAccountID` already identifies 1:1s in this file; use the toast hook if already imported, otherwise add `useToast`):
```tsx
  async function handleHeaderDelete() {
    setHeaderMenuOpen(false);
    if (!conversation) return;
    const is1to1 = Boolean(counterpartAccountID);
    if (!is1to1 && isLastAdmin(me as any, conversation)) {
      const others = ((conversation as any).$jazz?.owner as any)
        ?.getDirectMembers?.()
        .filter(
          (m: any) =>
            m.account?.$jazz?.id !== (me as any).$jazz?.id &&
            (m.role === "admin" || m.role === "writer"),
        );
      if (others && others.length > 0) {
        // Promote flow lives on the members screen.
        navigate(`/conversations/${convId ?? id}/members`);
        return;
      }
    }
    const ok = await confirmDialog(
      is1to1
        ? {
            title: "delete conversation",
            body: "your copy is deleted for good — you lose this history. they will see that you left. messaging them again starts fresh.",
            confirmLabel: "delete conversation",
            testId: "confirm-delete-conversation",
          }
        : {
            title: "leave conversation",
            body: "you lose access to its messages. others keep their copies and will see that you left.",
            confirmLabel: "leave",
            testId: "confirm-leave-conversation",
          },
    );
    if (!ok) return;
    await leaveConversation(me as any, conversation);
    navigate("/conversations");
  }
```

(c) the menu node (place near `composerElement`; `Icon` and `tapClass` come from `@/ui/kit` — extend that import):
```tsx
  const headerMenu = (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setHeaderMenuOpen((o) => !o)}
        aria-label="conversation actions"
        data-testid="conversation-menu-btn"
        className={`${tapClass} w-8 h-8 justify-center`}
      >
        <Icon d="dots" size={18} className="text-text-2" />
      </button>
      {headerMenuOpen && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setHeaderMenuOpen(false)}
          />
          <div
            data-testid="conversation-menu"
            className="absolute right-0 top-full mt-1 z-20 min-w-[200px] flex flex-col rounded-r-4 border border-hairline bg-panel shadow-bubble overflow-hidden"
          >
            <button
              type="button"
              data-testid="conversation-menu-settings"
              className={`${tapClass} w-full px-3 py-2.5 text-left font-body text-ui-sub text-text`}
              onClick={() => {
                setHeaderMenuOpen(false);
                navigate(`/conversations/${convId ?? id}/members`);
              }}
            >
              conversation settings
            </button>
            <button
              type="button"
              data-testid="conversation-menu-delete"
              className={`${tapClass} w-full px-3 py-2.5 text-left font-body text-ui-sub text-red border-t border-hairline`}
              onClick={() => void handleHeaderDelete()}
            >
              {counterpartAccountID ? "delete conversation" : "leave conversation"}
            </button>
          </div>
        </>
      )}
    </div>
  );
```

(d) pass `headerRight={headerMenu}` on the `<ChatScreen …>` call.

- [ ] **Step 3: Verify + commit**

Run: `npx vitest run tests/unit/routes/conversations/detail-header.test.tsx tests/unit/routes/conversations/detail-divider.test.tsx` — PASS (update only if a header snapshot breaks).
Run: `npm run typecheck` — exit 0. Run `npm run check-tokens` — PASS.
```bash
git add src/ui/screens/chat-screen.tsx src/routes/conversations/detail.tsx
git commit -m "feat(chat): header context menu — settings + delete/leave"
```

---

### Task 3: last-person-standing delete affordance

**Files:**
- Modify: `src/routes/conversations/detail.tsx` (composerElement block)

- [ ] **Step 1: Banner above the composer**

Inside the `composerElement` `<div data-testid="composer">`, ABOVE `<ChatComposer …>`, add:
```tsx
    {composerDisabled && (
      <div
        className="flex items-center justify-between gap-3 px-3 py-2 border-t border-hairline"
        data-testid="composer-disabled-banner"
      >
        <span className="font-body text-ui-sub text-dim">
          you're the only one left in this conversation.
        </span>
        <button
          type="button"
          onClick={() => void handleHeaderDelete()}
          data-testid="last-person-delete-btn"
          className="shrink-0 px-2 py-1 font-body text-ui-sub text-red rounded border border-hairline"
        >
          delete conversation
        </button>
      </div>
    )}
```
(`handleHeaderDelete` comes from Task 2 — its group branch's `isLastAdmin` early-exit only triggers when OTHER members exist, so the alone-in-group case falls through to the confirm + leave, which is exactly "delete my copy".)

- [ ] **Step 2: Verify + commit**

Run: `npx vitest run tests/unit/routes/conversations/detail-divider.test.tsx tests/unit/routes/conversations/detail-header.test.tsx` — PASS.
Run: `npm run typecheck` — exit 0.
```bash
git add src/routes/conversations/detail.tsx
git commit -m "feat(chat): last-person banner with delete action when composer is disabled"
```

---

### Task 4: right-click / long-press opens the message menu

**Files:**
- Modify: `src/ui/kit/bubble.tsx` (MessageRow gains optional `onContext`)
- Modify: `src/ui/screens/chat-screen.tsx` (VM type + pass-through)
- Modify: `src/routes/conversations/detail.tsx` (wire to menu state)

- [ ] **Step 1: Kit — non-visual context handler**

In `src/ui/kit/bubble.tsx`, `MessageRow` gains:
```tsx
  /** intent-fix (feedback round 2, non-visual): right-click / long-press
   * opens the message context menu. Rendering is unchanged; parity
   * unaffected (default undefined). */
  onContext?: () => void;
```
Implement on the me/them row wrapper div (the one with `flex gap-2 items-end …`) — add these props when `onContext` is set:
```tsx
      {...(onContext
        ? {
            onContextMenu: (e: React.MouseEvent) => {
              e.preventDefault();
              onContext();
            },
            onPointerDown: (e: React.PointerEvent) => {
              if (e.pointerType === "mouse") return;
              const timer = window.setTimeout(onContext, 500);
              const cancel = () => window.clearTimeout(timer);
              e.currentTarget.addEventListener("pointerup", cancel, { once: true });
              e.currentTarget.addEventListener("pointerleave", cancel, { once: true });
              e.currentTarget.addEventListener("pointermove", cancel, { once: true });
            },
          }
        : {})}
```
Add `import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";` style imports as needed (or inline-type via `React.` if the file already imports React types — match the file's conventions; it currently imports `type { ReactNode }`).

- [ ] **Step 2: VM + presenter pass-through**

`src/ui/screens/chat-screen.tsx`: the timeline item type (where `menuSlot`/`bodyOverride` are declared — either in this file or `./chat-types`) gains `onContext?: () => void;` and the `<MessageRow …>` call passes `onContext={item.onContext}`.

- [ ] **Step 3: Container wiring**

`src/routes/conversations/detail.tsx`, in the timeline-item construction (~line 881-906), add alongside `menuSlot`:
```tsx
  onContext:
    isMine && !isDeleted && !malformed && !isEditing
      ? () => setMenuOpenId(msgId)
      : undefined,
```
(match the exact guard used for `menuSlot`; if `isEditing` isn't in scope there, use the same condition `menuSlot` uses.)

- [ ] **Step 4: Verify + commit**

Run: `npx vitest run` — PASS. `nix-shell --run "npm run parity -- --only bubble-own,bubble-theirs,chat-screen"` (drop invalid ids) — PASS.
Run: `npm run typecheck` — exit 0.
```bash
git add src/ui/kit/bubble.tsx src/ui/screens/chat-screen.tsx src/routes/conversations/detail.tsx
git commit -m "feat(chat): right-click / long-press opens the message menu"
```

---

### Task 5: sign-in create-account button + auth-surface audit

**Files:**
- Modify: `src/ui/screens/sign-in-screen.tsx`
- Possibly: `tests/parity/proto-cells.jsx` (sign-in cell, if one exists)

- [ ] **Step 1: Promote create-account to a visible button**

In `src/ui/screens/sign-in-screen.tsx`: after the primary sign-in `<PButton primary full …/>` (~line 85-91), add an outline button:
```tsx
      {/* intent-fix (feedback round 2): create-account promoted from a
          footer MuteLink to a visible secondary button. */}
      <PButton
        full
        label="create account"
        onClick={onCreate}
        data-testid="signin-create-account"
      />
```
and change the footer (~lines 94-102) to keep only the forgot-password link, centered:
```tsx
      <div className="flex justify-center">
        <button className={tapClass} onClick={onForgot} type="button">
          <MuteLink>forgot password?</MuteLink>
        </button>
      </div>
```
If `onCreate` was only used by the removed footer button, it is now used by the new PButton — the prop stays.

- [ ] **Step 2: Parity check**

Run: `grep -n "sign-in" tests/parity/cells.json`. If a sign-in cell exists, run `nix-shell --run "npm run parity -- --only <cell-id>"`; on FAIL, patch the corresponding proto cell in `tests/parity/proto-cells.jsx` to add the same outline button + footer change with an intent-fix comment, and re-run to PASS. If no cell exists, note that and move on.

- [ ] **Step 3: Audit report (investigation, no code changes)**

Enumerate the auth surface and verify reachability + necessity. Known inventory:
- unauthenticated routes: `/onboarding` (OnboardingRoute), `/auth/login`, `/auth/recovery`, `*` → login
- onboarding steps: welcome → credentials → backup-display → backup-confirm → profile; restore-with-code path
- authenticated: `/auth/recovery` re-registered chromeless

Check each: (a) is it linked from somewhere (grep for navigations to it); (b) does any screen dead-end (no back/escape); (c) are there duplicate/orphaned screens left over from Unit 9-4's unification (e.g. a stray restore-choice remnant). DO NOT delete anything — produce a findings list in your report (screen → status → recommendation).

- [ ] **Step 4: Verify + commit**

Run: `npx vitest run` — PASS (update any sign-in screen test asserting the footer structure). `npm run typecheck` — exit 0.
```bash
git add src/ui/screens/sign-in-screen.tsx
git commit -m "feat(auth): create-account as a visible secondary button on sign-in"
```
(Add proto-cells.jsx / test files if they changed.)

---

### Task 6: wave gates

- [ ] **Step 1: Full gates**

```bash
npm run typecheck
npm run check-tokens
npm run check-ui-purity
npx vitest run
nix-shell --run "npm run parity"
```
All must pass (parity 142/142).

- [ ] **Step 2: Commit any gate fixes**

Only if needed:
```bash
git add -A && git commit -m "fix(ui): bundle B wave 3 gate fallout"
```
