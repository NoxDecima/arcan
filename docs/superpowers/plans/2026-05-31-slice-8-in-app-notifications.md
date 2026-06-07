> **Historical context (added 2026-06-07):** this document was written when the project was named **jazz-messanger**. The project was renamed to **Arcan** on 2026-06-05; the app rebrand itself is captured as Unit 5 in `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md`. This file is preserved as-is for historical accuracy.
# Slice 8 — In-App Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface new-message arrivals via sidebar unread badges, browser tab title prefix, optional sound, and optional foreground OS notifications when the tab is hidden — all driven by the existing Jazz sync data flow with no new server or service worker.

**Architecture:** Single layer of UI hooks on top of two new account-owned `me.root` fields (`lastReadAt: co.map(z.number())`, `notificationPrefs: co.map({ sound, browser })`). A thin `<NotificationManager />` component mounted in `App.tsx` aggregates total unread, drives the tab-title badge, and fans out sound + browser-notification side effects via a callback-based diff hook.

**Tech Stack:** TypeScript strict, React 19, Tailwind v3, jazz-tools 0.20.18. No new npm dependencies. Browser APIs: `Notification`, `Audio`, `document.title`, `Page Visibility API`.

**Authoritative spec:** `docs/superpowers/specs/2026-05-31-slice-8-in-app-notifications-design.md`. When in doubt, re-read the spec; this plan implements it without re-deciding policy.

**Critical reminders for every task:**

1. **NOX-13 footgun.** All Jazz CoValue mutations via `instance.$jazz.set()` / `.push()` / `.remove()`. Never assign properties directly. This slice writes to `me.root.lastReadAt` (per-conversation) and `me.root.notificationPrefs` (per-account) heavily.
2. **Schema migration is in-place** in `JazzMessangerAccount.withMigration(...)`. Existing accounts get the new fields backfilled. Do NOT write a separate migration script. Guard each backfill with `me.root && !(me.root as any).<field>` to keep it idempotent.
3. **No React side effects during render.** `useNewMessageEvents` must do its diff tracking inside a `useEffect`, not in the render body. Spec §3.5 explains why (StrictMode double-render correctness).
4. **Gating discipline.** Sound + browser notification both require `document.hidden === true` AND the corresponding `notificationPrefs.<field> === true`. Browser notification additionally requires `Notification.permission === "granted"`.
5. **Content-blind notification body.** Always `"New message in <conversation name>"` — never sender or preview. Deliberately matches the deferred NOX-30 closed-app push body so users see consistent UX whether the app is open or closed.
6. **Vitest scope.** Unit tests live in `tests/unit/`. E2E lives in `tests/e2e/`. Vitest does NOT pick up `.spec.ts` files outside `tests/unit/`.
7. **Existing e2e testids preserved.** `data-testid="conversation-row-N"` on sidebar rows MUST keep working. The new `data-testid="unread-badge-N"` is additive.
8. **Linear destination.** team=Nox, project=jazz-messanger per project CLAUDE.md.

---

## File Structure

### Phase A — Data + pure logic (foundation)

```
src/jazz/
├── schema/
│   └── JazzMessangerAccount.ts     ← MODIFIED (add 2 fields + backfill)
└── notifications.ts                 ← NEW (getUnreadCount + markRead)

src/hooks/
└── useNewMessageEvents.ts           ← NEW (callback-based diff tracker)

tests/unit/
├── jazz/
│   └── notifications.test.ts        ← NEW
└── hooks/
    └── useNewMessageEvents.test.ts  ← NEW
```

### Phase B — UI surfaces + settings + e2e

```
src/hooks/
└── useTabTitleBadge.ts              ← NEW

src/components/
├── sidebar.tsx                      ← MODIFIED (badge + bold + total unread)
└── notification-manager.tsx         ← NEW

src/routes/
├── settings/
│   ├── index.tsx                    ← MODIFIED (add NotificationsSection)
│   └── notifications-section.tsx    ← NEW
└── conversations/
    └── detail.tsx                   ← MODIFIED (markRead useEffect)

src/App.tsx                          ← MODIFIED (mount NotificationManager,
                                       deepen me resolve)

public/
└── notification.mp3                 ← NEW asset (~5-10 KB, CC-licensed)

tests/unit/
├── hooks/useTabTitleBadge.test.ts   ← NEW
└── components/notification-manager.test.ts ← NEW

tests/e2e/
├── unread-badges.spec.ts            ← NEW
├── unread-cross-device.spec.ts      ← NEW
├── tab-title-badge.spec.ts          ← NEW
└── notification-permission.spec.ts  ← NEW

CHANGELOG.md                         ← MODIFIED (Slice 8 entry + manual checklist)
```

---

# Phase A — Data + pure logic (3 tasks)

## Task A1: Schema additions + migration backfill

**Files:**
- Modify: `src/jazz/schema/JazzMessangerAccount.ts`

The root map gains two new CoMap fields, and the existing `withMigration` hook gains a backfill branch so existing post-Slice-7 accounts pick them up on next load.

- [ ] **Step 1: Add the two fields to `JazzMessangerAccountRoot`**

Replace the `JazzMessangerAccountRoot` declaration (currently lines 30-35) with:

```ts
export const JazzMessangerAccountRoot = co.map({
  contactBook: ContactBook,
  devices: co.list(DeviceRecord),
  invitesIssued: co.list(Invitation),
  knownConversations: co.list(Conversation),
  // Slice 8 — per-conversation read cutoff (ms epoch). Keys are
  // Conversation IDs; absent keys mean "never opened" (all unread).
  lastReadAt: co.map(z.number()),
  // Slice 8 — per-account notification preferences. Both default to
  // false (off) until the user explicitly enables.
  notificationPrefs: co.map({
    sound: z.boolean(),
    browser: z.boolean(),
  }),
});
```

- [ ] **Step 2: Add the new fields to the root-init branch of `withMigration`**

In the existing `if (!me.$jazz.has("root"))` block (currently lines 82-117), the local-variable list creates `contactBook`, `devices`, `invitesIssued`, `knownConversations`. Add two more before the `me.$jazz.set("root", ...)` call:

```ts
    const lastReadAt = co.map(z.number()).create({}, { owner: me });
    const notificationPrefs = co
      .map({ sound: z.boolean(), browser: z.boolean() })
      .create({ sound: false, browser: false }, { owner: me });
```

Then update the `JazzMessangerAccountRoot.create(...)` call to include both new fields:

```ts
    me.$jazz.set(
      "root",
      JazzMessangerAccountRoot.create(
        {
          contactBook,
          devices,
          invitesIssued,
          knownConversations,
          lastReadAt,
          notificationPrefs,
        },
        { owner: me },
      ),
    );
```

- [ ] **Step 3: Add a backfill branch for existing accounts**

Existing post-Slice-7 accounts have `me.root` but no `lastReadAt` / `notificationPrefs`. Add this AFTER the existing `knownConversations` backfill (currently at lines 128-137):

```ts
  // -- 2c. lastReadAt + notificationPrefs backfill (existing accounts) --
  // Both fields are Slice 8 additions; pre-Slice-8 accounts have me.root
  // but neither field. Same guard pattern as the knownConversations
  // backfill — runs only when me.root is a fully-loaded CoMap.
  if (
    me.root &&
    !(me.root as any).lastReadAt &&
    typeof (me.root as any).$jazz?.set === "function"
  ) {
    (me.root as any).$jazz.set(
      "lastReadAt",
      co.map(z.number()).create({}, { owner: me }),
    );
  }
  if (
    me.root &&
    !(me.root as any).notificationPrefs &&
    typeof (me.root as any).$jazz?.set === "function"
  ) {
    (me.root as any).$jazz.set(
      "notificationPrefs",
      co
        .map({ sound: z.boolean(), browser: z.boolean() })
        .create({ sound: false, browser: false }, { owner: me }),
    );
  }
```

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: succeeds. If `co.map(z.number()).create({}, ...)` errors on the empty-object form, try `co.map(z.number()).create({} as Record<string, number>, ...)` or check `docs/jazz-api-notes.md` for the canonical "create empty variable-key map" form. The pattern works in jazz-tools 0.20.18 — this guard is just for unusual TS strictness.

- [ ] **Step 5: Commit**

```bash
git add src/jazz/schema/JazzMessangerAccount.ts
git commit -m "feat(schema): add lastReadAt + notificationPrefs to account root"
```

---

## Task A2: `getUnreadCount` + `markRead` helpers

**Files:**
- Create: `src/jazz/notifications.ts`
- Create: `tests/unit/jazz/notifications.test.ts`

Pure functions — no React, no Jazz hooks. Easy to unit-test with stub objects.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/jazz/notifications.test.ts`:

```ts
import { describe, test, expect, vi } from "vitest";
import { getUnreadCount, markRead } from "@/jazz/notifications";

// Lightweight mocks — getUnreadCount + markRead are pure functions that
// only read .messages, .sentAt, .$jazz.id from the conversation; we don't
// need the full Jazz machinery.

function mkMsg(sentAt: Date, authorID: string) {
  return {
    sentAt,
    $jazz: { id: `msg-${sentAt.getTime()}-${authorID}` },
    // getAuthorAccountIDFromMessage reads the create-tx signer; for the
    // unit test we stub it via a top-level mock below
    _testAuthor: authorID,
  };
}

vi.mock("@/jazz/messages", () => ({
  getAuthorAccountIDFromMessage: (m: any) => m?._testAuthor,
}));

describe("getUnreadCount", () => {
  const myID = "co_zMe";

  test("returns 0 for empty messages", () => {
    expect(getUnreadCount({ messages: [] } as any, 0, myID)).toBe(0);
  });

  test("returns 0 for null/undefined conversation", () => {
    expect(getUnreadCount(null as any, 0, myID)).toBe(0);
    expect(getUnreadCount(undefined as any, 0, myID)).toBe(0);
  });

  test("missing lastReadAt entry → all foreign messages count", () => {
    const conv = {
      messages: [
        mkMsg(new Date(1000), "co_zBob"),
        mkMsg(new Date(2000), "co_zBob"),
        mkMsg(new Date(3000), myID), // mine — excluded
      ],
    } as any;
    expect(getUnreadCount(conv, undefined, myID)).toBe(2);
  });

  test("excludes my own messages", () => {
    const conv = {
      messages: [
        mkMsg(new Date(1000), myID),
        mkMsg(new Date(2000), myID),
      ],
    } as any;
    expect(getUnreadCount(conv, 0, myID)).toBe(0);
  });

  test("cutoff = newest message → 0", () => {
    const conv = {
      messages: [
        mkMsg(new Date(1000), "co_zBob"),
        mkMsg(new Date(2000), "co_zBob"),
      ],
    } as any;
    expect(getUnreadCount(conv, 2000, myID)).toBe(0);
  });

  test("cutoff between messages → only newer ones count", () => {
    const conv = {
      messages: [
        mkMsg(new Date(1000), "co_zBob"),
        mkMsg(new Date(2000), "co_zBob"),
        mkMsg(new Date(3000), "co_zBob"),
      ],
    } as any;
    expect(getUnreadCount(conv, 1500, myID)).toBe(2);
  });

  test("string sentAt coerces correctly", () => {
    const conv = {
      messages: [
        { sentAt: "2026-05-01T00:00:00Z", _testAuthor: "co_zBob" },
      ],
    } as any;
    expect(getUnreadCount(conv, 0, myID)).toBe(1);
  });
});

describe("markRead", () => {
  test("writes max(now, latestSeen + 1) via $jazz.set", () => {
    const setSpy = vi.fn();
    const oldNow = Date.now;
    Date.now = () => 5000;

    const me = {
      root: {
        lastReadAt: { $jazz: { set: setSpy } },
        knownConversations: [
          {
            $jazz: { id: "conv-X" },
            messages: [
              { sentAt: new Date(1000) },
              { sentAt: new Date(2000) },
            ],
          },
        ],
      },
    } as any;

    markRead(me, "conv-X");
    expect(setSpy).toHaveBeenCalledWith("conv-X", 5000); // now > latestSeen + 1

    Date.now = oldNow;
  });

  test("advances past newest message even if clock is behind", () => {
    const setSpy = vi.fn();
    const oldNow = Date.now;
    Date.now = () => 100; // clock way behind

    const me = {
      root: {
        lastReadAt: { $jazz: { set: setSpy } },
        knownConversations: [
          {
            $jazz: { id: "conv-X" },
            messages: [{ sentAt: new Date(9999) }],
          },
        ],
      },
    } as any;

    markRead(me, "conv-X");
    expect(setSpy).toHaveBeenCalledWith("conv-X", 10000); // 9999 + 1

    Date.now = oldNow;
  });

  test("no-op when me.root.lastReadAt missing", () => {
    expect(() => markRead({ root: {} } as any, "conv-X")).not.toThrow();
    expect(() => markRead({} as any, "conv-X")).not.toThrow();
    expect(() => markRead(null as any, "conv-X")).not.toThrow();
  });

  test("conversation not in knownConversations → writes Date.now()", () => {
    const setSpy = vi.fn();
    const oldNow = Date.now;
    Date.now = () => 5000;

    const me = {
      root: {
        lastReadAt: { $jazz: { set: setSpy } },
        knownConversations: [],
      },
    } as any;

    markRead(me, "conv-X");
    expect(setSpy).toHaveBeenCalledWith("conv-X", 5000);

    Date.now = oldNow;
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/jazz/notifications.test.ts
```

Expected: FAIL, "Cannot find module @/jazz/notifications"

- [ ] **Step 3: Implement `src/jazz/notifications.ts`**

```ts
import type { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import type { Conversation } from "@/jazz/schema/Conversation";
import { getAuthorAccountIDFromMessage } from "@/jazz/messages";

/**
 * Compute the unread message count for a conversation given the user's
 * last-read cutoff. Messages authored by the user are NEVER counted.
 *
 * @param conversation - The conversation (with messages list resolved).
 * @param lastReadAt - Cutoff timestamp (ms epoch). Undefined or missing
 *                    means "never opened" — all foreign messages count.
 * @param myAccountID - The current user's accountID, used to exclude
 *                      messages I sent myself.
 */
export function getUnreadCount(
  conversation: any,
  lastReadAt: number | undefined,
  myAccountID: string,
): number {
  if (!conversation?.messages) return 0;
  const cutoff = lastReadAt ?? 0;
  let count = 0;
  for (const m of conversation.messages) {
    if (!m) continue;
    const sentAt = m.sentAt instanceof Date
      ? m.sentAt.getTime()
      : new Date(m.sentAt).getTime();
    if (sentAt <= cutoff) continue;
    const authorID = getAuthorAccountIDFromMessage(m);
    if (authorID === myAccountID) continue;
    count++;
  }
  return count;
}

/**
 * Mark a conversation as read, advancing the user's lastReadAt cutoff
 * past anything currently visible in the conversation.
 *
 * Clock-skew defense: writes `max(Date.now(), latestSeenMessageSentAt + 1)`.
 * Without the max, a slow local clock could leave items marked unread.
 * Without the latestSeenMessageSentAt + 1 floor, a fast local clock would
 * still mark older messages as read (acceptable behavior actually, but the
 * floor makes the invariant explicit).
 */
export function markRead(
  me: any,
  conversationID: string,
): void {
  if (!me?.root?.lastReadAt?.$jazz?.set) return;
  const conv = (me.root.knownConversations ?? []).find(
    (c: any) => c?.$jazz?.id === conversationID,
  );
  let latestSentAt = 0;
  if (conv?.messages?.length) {
    for (const m of conv.messages) {
      const t = m?.sentAt;
      const ts = t instanceof Date ? t.getTime() : new Date(t ?? 0).getTime();
      if (ts > latestSentAt) latestSentAt = ts;
    }
  }
  const cutoff = Math.max(Date.now(), latestSentAt + 1);
  me.root.lastReadAt.$jazz.set(conversationID, cutoff);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/jazz/notifications.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/jazz/notifications.ts tests/unit/jazz/notifications.test.ts
git commit -m "feat(notifications): add getUnreadCount + markRead helpers"
```

---

## Task A3: `useNewMessageEvents` callback-based diff tracker

**Files:**
- Create: `src/hooks/useNewMessageEvents.ts`
- Create: `tests/unit/hooks/useNewMessageEvents.test.ts`

The diff happens inside `useEffect`, not in the render body. Each detected arrival fires the callback exactly once, even under React StrictMode's double-render.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/hooks/useNewMessageEvents.test.ts`:

```ts
import { describe, test, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNewMessageEvents } from "@/hooks/useNewMessageEvents";

type ConvInput = { id: string; label: string; messageCount: number; unread: number };

describe("useNewMessageEvents", () => {
  test("first render establishes baseline; callback NOT called", () => {
    const onNewMessage = vi.fn();
    renderHook(() =>
      useNewMessageEvents({
        conversations: [{ id: "c1", label: "Alice", messageCount: 5, unread: 5 }],
        onNewMessage,
      }),
    );
    expect(onNewMessage).not.toHaveBeenCalled();
  });

  test("rerender with grown messageCount + unread > 0 → callback called once", () => {
    const onNewMessage = vi.fn();
    const { rerender } = renderHook(
      ({ convs }) =>
        useNewMessageEvents({
          conversations: convs,
          onNewMessage,
        }),
      {
        initialProps: {
          convs: [{ id: "c1", label: "Alice", messageCount: 5, unread: 0 }] as ConvInput[],
        },
      },
    );
    rerender({
      convs: [{ id: "c1", label: "Alice", messageCount: 6, unread: 1 }] as ConvInput[],
    });
    expect(onNewMessage).toHaveBeenCalledTimes(1);
    expect(onNewMessage).toHaveBeenCalledWith({
      conversationID: "c1",
      conversationLabel: "Alice",
    });
  });

  test("rerender with grown messageCount but unread = 0 → callback NOT called", () => {
    const onNewMessage = vi.fn();
    const { rerender } = renderHook(
      ({ convs }) =>
        useNewMessageEvents({
          conversations: convs,
          onNewMessage,
        }),
      {
        initialProps: {
          convs: [{ id: "c1", label: "Alice", messageCount: 5, unread: 0 }] as ConvInput[],
        },
      },
    );
    rerender({
      convs: [{ id: "c1", label: "Alice", messageCount: 6, unread: 0 }] as ConvInput[],
    });
    expect(onNewMessage).not.toHaveBeenCalled();
  });

  test("same convo growing again → callback called each time", () => {
    const onNewMessage = vi.fn();
    const { rerender } = renderHook(
      ({ convs }) =>
        useNewMessageEvents({
          conversations: convs,
          onNewMessage,
        }),
      {
        initialProps: {
          convs: [{ id: "c1", label: "Alice", messageCount: 5, unread: 0 }] as ConvInput[],
        },
      },
    );
    rerender({
      convs: [{ id: "c1", label: "Alice", messageCount: 6, unread: 1 }] as ConvInput[],
    });
    rerender({
      convs: [{ id: "c1", label: "Alice", messageCount: 7, unread: 2 }] as ConvInput[],
    });
    expect(onNewMessage).toHaveBeenCalledTimes(2);
  });

  test("identical rerender → callback NOT called", () => {
    const onNewMessage = vi.fn();
    const convs: ConvInput[] = [{ id: "c1", label: "Alice", messageCount: 5, unread: 1 }];
    const { rerender } = renderHook(
      () => useNewMessageEvents({ conversations: convs, onNewMessage }),
    );
    rerender();
    rerender();
    expect(onNewMessage).not.toHaveBeenCalled();
  });

  test("new conversation appearing (no baseline) → callback NOT called", () => {
    // A conversation that didn't exist on the previous render is a "first
    // sighting" — no baseline, so we can't tell if it grew. Don't fire.
    const onNewMessage = vi.fn();
    const { rerender } = renderHook(
      ({ convs }) =>
        useNewMessageEvents({
          conversations: convs,
          onNewMessage,
        }),
      {
        initialProps: {
          convs: [{ id: "c1", label: "Alice", messageCount: 5, unread: 0 }] as ConvInput[],
        },
      },
    );
    rerender({
      convs: [
        { id: "c1", label: "Alice", messageCount: 5, unread: 0 },
        { id: "c2", label: "Bob", messageCount: 3, unread: 3 },
      ] as ConvInput[],
    });
    expect(onNewMessage).not.toHaveBeenCalled();
  });

  test("multiple convos grow simultaneously → callback called per convo", () => {
    const onNewMessage = vi.fn();
    const { rerender } = renderHook(
      ({ convs }) =>
        useNewMessageEvents({
          conversations: convs,
          onNewMessage,
        }),
      {
        initialProps: {
          convs: [
            { id: "c1", label: "Alice", messageCount: 5, unread: 0 },
            { id: "c2", label: "Bob", messageCount: 3, unread: 0 },
          ] as ConvInput[],
        },
      },
    );
    rerender({
      convs: [
        { id: "c1", label: "Alice", messageCount: 6, unread: 1 },
        { id: "c2", label: "Bob", messageCount: 4, unread: 1 },
      ] as ConvInput[],
    });
    expect(onNewMessage).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/hooks/useNewMessageEvents.test.ts
```

Expected: FAIL, "Cannot find module @/hooks/useNewMessageEvents"

- [ ] **Step 3: Implement `src/hooks/useNewMessageEvents.ts`**

```ts
import { useEffect, useRef } from "react";

/**
 * Diff tracker that detects per-conversation message-count increases and
 * fires a callback for each new arrival.
 *
 * Design notes
 * ------------
 * The diff happens inside useEffect, NOT in the render body. This matters
 * because:
 *   - React StrictMode invokes render twice in dev; doing the diff in
 *     render would either double-fire (mutating prev counts in render)
 *     or miss events (one of the two render-passes already advanced
 *     the snapshot before the other one ran).
 *   - useEffect runs once per committed render, regardless of how many
 *     times render was called.
 *
 * A conversation is considered "new" on its first observation — we have
 * no baseline to compare against, so we don't fire. Only subsequent
 * growth triggers the callback.
 */
export function useNewMessageEvents(args: {
  conversations: Array<{
    id: string;
    label: string;
    messageCount: number;
    unread: number;
  }>;
  onNewMessage: (event: {
    conversationID: string;
    conversationLabel: string;
  }) => void;
}): void {
  const prevCounts = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    for (const c of args.conversations) {
      const prev = prevCounts.current.get(c.id);
      if (prev !== undefined && c.messageCount > prev && c.unread > 0) {
        args.onNewMessage({
          conversationID: c.id,
          conversationLabel: c.label,
        });
      }
      prevCounts.current.set(c.id, c.messageCount);
    }
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/hooks/useNewMessageEvents.test.ts
```

Expected: all 7 tests PASS. If `renderHook` isn't imported correctly, `@testing-library/react` exports it from the top-level package (no separate hooks entry).

- [ ] **Step 5: Run full unit suite + build (regression check)**

```bash
npm test && npm run build
```

Expected: 134 existing tests + new ones all pass; build green.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useNewMessageEvents.ts tests/unit/hooks/useNewMessageEvents.test.ts
git commit -m "feat(notifications): add useNewMessageEvents diff tracker"
```

---

# Phase B — UI surfaces + settings + e2e (6 tasks)

## Task B1: Sidebar unread badges + bold

**Files:**
- Modify: `src/components/sidebar.tsx`

Deepen the existing `me` resolve to pull `lastReadAt`. Render a blue badge with the unread count on each conversation row that has new messages. Apply `font-semibold` to those rows. Existing `data-testid="conversation-row-N"` selectors stay intact; the new `data-testid="unread-badge-N"` is additive.

- [ ] **Step 1: Read current sidebar.tsx**

```bash
cat src/components/sidebar.tsx
```

Identify the `useAccount` call and the conversation-row render loop.

- [ ] **Step 2: Deepen the `useAccount` resolve query**

Find the `useAccount(JazzMessangerAccount, { resolve: ... })` call. Add `lastReadAt: true` to the root resolve. The existing resolve looks roughly like:

```ts
resolve: {
  profile: true,
  root: {
    contactBook: { $each: true },
    knownConversations: { $each: { $onError: "catch" } },
  },
},
```

Change to:

```ts
resolve: {
  profile: true,
  root: {
    contactBook: { $each: true },
    knownConversations: { $each: { $onError: "catch" } },
    lastReadAt: true,
  },
},
```

- [ ] **Step 3: Add the unread badge to each conversation row**

Find the conversation-row `<Link>` render inside the `sortedActive.map(...)`. Compute the per-row unread count and inject the badge + bold class.

Add this import at the top:

```ts
import { getUnreadCount } from "@/jazz/notifications";
```

Then in the `sortedActive.map((c, i) => { ... })` body, before the return, compute:

```ts
const convID = c.conversation.$jazz.id;
const myID = (me as any).$jazz?.id;
const lastReadAt = (me.root as any).lastReadAt?.[convID];
const unread = myID ? getUnreadCount(c.conversation, lastReadAt, myID) : 0;
```

Replace the `<Link>` element with:

```tsx
<Link
  key={i}
  to={`/conversations/${convID}`}
  className={`block p-2 hover:bg-accent rounded text-sm flex items-center justify-between gap-2 ${
    unread > 0 ? "font-semibold" : ""
  }`}
  data-testid={`conversation-row-${i}`}
>
  <span className="truncate flex-1">{label}</span>
  {unread > 0 && (
    <span
      data-testid={`unread-badge-${i}`}
      className="flex-shrink-0 px-2 py-0.5 text-xs rounded-full bg-blue-600 text-white"
    >
      {unread > 99 ? "99+" : unread}
    </span>
  )}
</Link>
```

- [ ] **Step 4: Type-check + run unit suite**

```bash
npm run build && npm test
```

Expected: green. The sidebar change is render-only and doesn't break existing unit tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(sidebar): render per-conversation unread badge + bold"
```

---

## Task B2: `useTabTitleBadge` hook

**Files:**
- Create: `src/hooks/useTabTitleBadge.ts`
- Create: `tests/unit/hooks/useTabTitleBadge.test.ts`

Watches `totalUnread` + `document.visibilityState`, sets `document.title` to either `(N) Jazz Messanger` (when hidden + unread > 0) or the plain `baseTitle`. Cleans up on unmount.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/hooks/useTabTitleBadge.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTabTitleBadge } from "@/hooks/useTabTitleBadge";

describe("useTabTitleBadge", () => {
  let originalTitle: string;

  beforeEach(() => {
    originalTitle = document.title;
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });

  afterEach(() => {
    document.title = originalTitle;
  });

  function setHidden(hidden: boolean) {
    Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  test("title is plain when not hidden, regardless of unread", () => {
    setHidden(false);
    renderHook(() => useTabTitleBadge(5, "Jazz Messanger"));
    expect(document.title).toBe("Jazz Messanger");
  });

  test("title prefixed when hidden + unread > 0", () => {
    setHidden(true);
    renderHook(() => useTabTitleBadge(3, "Jazz Messanger"));
    expect(document.title).toBe("(3) Jazz Messanger");
  });

  test("title stays plain when hidden + unread = 0", () => {
    setHidden(true);
    renderHook(() => useTabTitleBadge(0, "Jazz Messanger"));
    expect(document.title).toBe("Jazz Messanger");
  });

  test("99+ for very large counts", () => {
    setHidden(true);
    renderHook(() => useTabTitleBadge(150, "Jazz Messanger"));
    expect(document.title).toBe("(99+) Jazz Messanger");
  });

  test("visibilitychange re-syncs the title", () => {
    setHidden(false);
    renderHook(() => useTabTitleBadge(4, "Jazz Messanger"));
    expect(document.title).toBe("Jazz Messanger");
    setHidden(true);
    expect(document.title).toBe("(4) Jazz Messanger");
    setHidden(false);
    expect(document.title).toBe("Jazz Messanger");
  });

  test("cleanup restores plain title on unmount", () => {
    setHidden(true);
    const { unmount } = renderHook(() => useTabTitleBadge(5, "Jazz Messanger"));
    expect(document.title).toBe("(5) Jazz Messanger");
    unmount();
    expect(document.title).toBe("Jazz Messanger");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/hooks/useTabTitleBadge.test.ts
```

Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Implement `src/hooks/useTabTitleBadge.ts`**

```ts
import { useEffect } from "react";

/**
 * Sets document.title to `(N) baseTitle` when the tab is hidden AND there
 * are unread messages; otherwise leaves baseTitle plain. Reacts to both
 * totalUnread changes and Page Visibility API events.
 *
 * On unmount, restores the plain baseTitle. This prevents a stale "(3)"
 * prefix from lingering if the notification UI is torn down mid-session.
 */
export function useTabTitleBadge(totalUnread: number, baseTitle = "Jazz Messanger") {
  useEffect(() => {
    const sync = () => {
      if (document.hidden && totalUnread > 0) {
        const shown = totalUnread > 99 ? "99+" : String(totalUnread);
        document.title = `(${shown}) ${baseTitle}`;
      } else {
        document.title = baseTitle;
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      document.title = baseTitle;
    };
  }, [totalUnread, baseTitle]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/hooks/useTabTitleBadge.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTabTitleBadge.ts tests/unit/hooks/useTabTitleBadge.test.ts
git commit -m "feat(notifications): add useTabTitleBadge hook"
```

---

## Task B3: `<NotificationManager />` + sound asset

**Files:**
- Create: `src/components/notification-manager.tsx`
- Create: `tests/unit/components/notification-manager.test.ts`
- Create: `public/notification.mp3` (asset)
- Modify: `src/App.tsx` (deepen resolve, mount the manager)

The single home for the notification stack. Drives the tab title via `useTabTitleBadge` and fans out sound + browser-notification side effects via `useNewMessageEvents` callback.

- [ ] **Step 1: Source the sound asset**

Download a short notification sound (~200ms, ~5-10 KB, CC-licensed). Suggested source: <https://notificationsounds.com> (filter to CC0/CC-BY tones). Place at `public/notification.mp3`.

If sourcing isn't available, generate a sine-wave tone with ffmpeg:

```bash
ffmpeg -f lavfi -i "sine=frequency=880:duration=0.2" -ar 44100 -ac 1 -b:a 64k public/notification.mp3
```

Expected file size: 3-15 KB.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/components/notification-manager.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { NotificationManager } from "@/components/notification-manager";

// Mock the diff tracker so we control when onNewMessage fires.
let mostRecentArgs: any = null;
vi.mock("@/hooks/useNewMessageEvents", () => ({
  useNewMessageEvents: (args: any) => {
    mostRecentArgs = args;
  },
}));
// Stub the title hook — its behavior is tested separately.
vi.mock("@/hooks/useTabTitleBadge", () => ({
  useTabTitleBadge: () => {},
}));

describe("NotificationManager — sound + browser notification fanout", () => {
  let originalAudio: any;
  let originalNotification: any;
  let playSpy: ReturnType<typeof vi.fn>;
  let notifCtor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mostRecentArgs = null;
    originalAudio = (globalThis as any).Audio;
    originalNotification = (globalThis as any).Notification;
    playSpy = vi.fn().mockResolvedValue(undefined);
    (globalThis as any).Audio = vi.fn().mockImplementation(() => ({
      play: playSpy,
    }));
    notifCtor = vi.fn().mockImplementation(() => ({ close: vi.fn() }));
    (notifCtor as any).permission = "granted";
    (notifCtor as any).requestPermission = vi.fn();
    (globalThis as any).Notification = notifCtor;
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
  });

  afterEach(() => {
    (globalThis as any).Audio = originalAudio;
    (globalThis as any).Notification = originalNotification;
  });

  function renderWith(prefs: { sound: boolean; browser: boolean }) {
    const me = {
      $jazz: { id: "co_zMe" },
      root: {
        knownConversations: [{ $jazz: { id: "c1" }, messages: [] }],
        lastReadAt: {},
        notificationPrefs: prefs,
      },
    };
    render(React.createElement(NotificationManager, { me }));
  }

  test("plays sound on new message when sound=true + hidden", () => {
    renderWith({ sound: true, browser: false });
    mostRecentArgs.onNewMessage({ conversationID: "c1", conversationLabel: "Alice" });
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  test("does NOT play sound when sound=false", () => {
    renderWith({ sound: false, browser: false });
    mostRecentArgs.onNewMessage({ conversationID: "c1", conversationLabel: "Alice" });
    expect(playSpy).not.toHaveBeenCalled();
  });

  test("does NOT play sound when document is visible", () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    renderWith({ sound: true, browser: false });
    mostRecentArgs.onNewMessage({ conversationID: "c1", conversationLabel: "Alice" });
    expect(playSpy).not.toHaveBeenCalled();
  });

  test("creates Notification when browser=true + granted + hidden", () => {
    renderWith({ sound: false, browser: true });
    mostRecentArgs.onNewMessage({ conversationID: "c1", conversationLabel: "Alice" });
    expect(notifCtor).toHaveBeenCalledTimes(1);
    const [title, opts] = notifCtor.mock.calls[0];
    expect(title).toBe("Jazz Messanger");
    expect(opts.body).toBe("New message in Alice");
    expect(opts.tag).toBe("conv-c1");
  });

  test("does NOT create Notification when browser=false", () => {
    renderWith({ sound: false, browser: false });
    mostRecentArgs.onNewMessage({ conversationID: "c1", conversationLabel: "Alice" });
    expect(notifCtor).not.toHaveBeenCalled();
  });

  test("does NOT create Notification when permission=denied", () => {
    (notifCtor as any).permission = "denied";
    renderWith({ sound: false, browser: true });
    mostRecentArgs.onNewMessage({ conversationID: "c1", conversationLabel: "Alice" });
    expect(notifCtor).not.toHaveBeenCalled();
  });

  test("does NOT create Notification when document is visible", () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    renderWith({ sound: false, browser: true });
    mostRecentArgs.onNewMessage({ conversationID: "c1", conversationLabel: "Alice" });
    expect(notifCtor).not.toHaveBeenCalled();
  });

  test("audio play() rejection is swallowed silently", async () => {
    playSpy.mockRejectedValueOnce(new Error("autoplay blocked"));
    renderWith({ sound: true, browser: false });
    expect(() =>
      mostRecentArgs.onNewMessage({ conversationID: "c1", conversationLabel: "Alice" }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test -- tests/unit/components/notification-manager.test.ts
```

Expected: FAIL, "Cannot find module".

- [ ] **Step 4: Implement `src/components/notification-manager.tsx`**

```tsx
import { useCallback, useMemo } from "react";
import { useTabTitleBadge } from "@/hooks/useTabTitleBadge";
import { useNewMessageEvents } from "@/hooks/useNewMessageEvents";
import { getUnreadCount } from "@/jazz/notifications";
import { resolveDisplayName } from "@/jazz/displayName";

interface NotificationManagerProps {
  me: any;
}

/**
 * The single home for the in-app notification stack:
 *   • aggregates total unread across all conversations
 *   • drives the tab title via useTabTitleBadge
 *   • fans out sound + browser-notification side effects via the
 *     useNewMessageEvents callback
 *
 * Gating contract (per spec §3.3 / §3.4):
 *   • Sound: requires me.root.notificationPrefs.sound === true
 *            AND document.hidden === true
 *   • Browser notification: requires me.root.notificationPrefs.browser === true
 *            AND Notification.permission === "granted"
 *            AND document.hidden === true
 *
 * Returns null — purely side-effectful, no DOM output.
 */
export function NotificationManager({ me }: NotificationManagerProps): null {
  const myID = me?.$jazz?.id ?? null;
  const knownConversations = me?.root?.knownConversations;
  const lastReadAt = me?.root?.lastReadAt;
  const prefs = me?.root?.notificationPrefs;

  // Aggregate { id, label, messageCount, unread } per conversation for both
  // the title badge (sum unread) and the diff tracker (per-conv arrival).
  const conversations = useMemo(() => {
    if (!myID || !knownConversations) return [];
    const out: Array<{
      id: string;
      label: string;
      messageCount: number;
      unread: number;
    }> = [];
    for (const conv of knownConversations) {
      if (!conv) continue;
      const id = conv.$jazz?.id;
      if (!id) continue;
      const label = deriveLabel(conv, me);
      const messageCount = conv.messages?.length ?? 0;
      const unread = getUnreadCount(conv, lastReadAt?.[id], myID);
      out.push({ id, label, messageCount, unread });
    }
    return out;
  }, [knownConversations, lastReadAt, myID, me]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unread, 0),
    [conversations],
  );

  useTabTitleBadge(totalUnread);

  const onNewMessage = useCallback(
    (event: { conversationID: string; conversationLabel: string }) => {
      // Gate: sound requires pref + hidden
      if (prefs?.sound && document.hidden) {
        void new Audio("/notification.mp3").play().catch(() => {});
      }
      // Gate: browser notification requires pref + permission + hidden
      if (
        prefs?.browser &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        document.hidden
      ) {
        const n = new Notification("Jazz Messanger", {
          body: `New message in ${event.conversationLabel}`,
          tag: `conv-${event.conversationID}`,
          renotify: false,
        });
        n.onclick = () => {
          window.focus();
          window.location.assign(`/conversations/${event.conversationID}`);
          n.close();
        };
      }
    },
    [prefs?.sound, prefs?.browser],
  );

  useNewMessageEvents({ conversations, onNewMessage });

  return null;
}

/**
 * Derive a display label for the conversation — uses explicit title for
 * groups, falls back to the other 1:1 member's display name via the
 * existing resolveDisplayName helper.
 */
function deriveLabel(conversation: any, me: any): string {
  const explicit = conversation?.title;
  if (typeof explicit === "string" && explicit.length > 0) return explicit;

  const myID = me?.$jazz?.id ?? null;
  const group = conversation?.$jazz?.owner;
  if (!group) return "Conversation";
  let members: any[] = [];
  try {
    members = group.getDirectMembers();
  } catch {
    return "Conversation";
  }
  const others = members
    .filter(
      (m: any) =>
        (m.role === "admin" || m.role === "writer") &&
        m.account?.$jazz?.id !== myID,
    )
    .map((m: any) => m.account?.$jazz?.id)
    .filter((id: any) => typeof id === "string") as string[];
  if (others.length === 0) return "Conversation";
  const names = others.map((id) =>
    resolveDisplayName({ accountID: id, me, group }),
  );
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names[0]}, ${names[1]} +${names.length - 2} more`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/unit/components/notification-manager.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 6: Mount `<NotificationManager />` in App.tsx**

Find the `useAccount(JazzMessangerAccount, { resolve: { profile: true, root: { contactBook: { $each: true }, knownConversations: true } } })` call in `src/App.tsx`. Deepen the resolve so `lastReadAt` and `notificationPrefs` reach the manager:

```ts
const me = useAccount(JazzMessangerAccount, {
  resolve: {
    profile: true,
    root: {
      contactBook: { $each: true },
      knownConversations: { $each: { messages: true, $onError: "catch" } },
      lastReadAt: true,
      notificationPrefs: true,
    },
  },
});
```

(Note: `knownConversations` now resolves messages too — needed for the per-conversation `messageCount` aggregation. If this slows down App initial load noticeably, narrow to `messages: { $count: true }` if jazz-tools supports it, otherwise leave as-is.)

Add the import at the top of `App.tsx`:

```ts
import { NotificationManager } from "@/components/notification-manager";
```

Mount the manager — best place is inside the `isAuthenticated` branch, so it only runs when the user is signed in. Find:

```tsx
if (!isAuthenticated) {
  return (
    <Routes>...</Routes>
  );
}

return (
  <Routes>...</Routes>
);
```

Change the second return to:

```tsx
return (
  <>
    {me.$isLoaded && <NotificationManager me={me} />}
    <Routes>...</Routes>
  </>
);
```

- [ ] **Step 7: Run build + smoke**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/notification-manager.tsx tests/unit/components/notification-manager.test.ts public/notification.mp3 src/App.tsx
git commit -m "feat(notifications): add NotificationManager + sound asset + mount in App"
```

---

## Task B4: Settings — notifications section + permission flow

**Files:**
- Create: `src/routes/settings/notifications-section.tsx`
- Modify: `src/routes/settings/index.tsx` (add the section)

A new section in the settings page with two controls: sound toggle and browser-notification enable button.

- [ ] **Step 1: Implement `notifications-section.tsx`**

Create `src/routes/settings/notifications-section.tsx`:

```tsx
import { useState } from "react";
import { useAccount } from "jazz-tools/react";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { Button } from "@/components/ui/button";

/**
 * NotificationsSection: toggles for in-app notification preferences.
 *
 * Sound toggle: simple boolean write to me.root.notificationPrefs.sound.
 *
 * Browser notification enable: a click-to-enable flow that:
 *   1. Calls Notification.requestPermission()
 *   2. On "granted" → sets me.root.notificationPrefs.browser = true
 *   3. On "denied" → shows inline "blocked at browser level" hint
 *   4. On "default" (user dismissed) → no state change
 *
 * The user can independently toggle our app's use of browser notifications
 * off (notificationPrefs.browser = false) without revoking OS permission.
 * Effective state shown: prefs.browser && Notification.permission === "granted".
 */
export function NotificationsSection() {
  const me = useAccount(JazzMessangerAccount, {
    resolve: { root: { notificationPrefs: true } },
  });
  const [permissionState, setPermissionState] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );
  const [requestError, setRequestError] = useState<string | null>(null);

  if (!me.$isLoaded || !me.root.notificationPrefs) {
    return (
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-2">Notifications</h2>
        <p className="text-sm text-gray-400">Loading…</p>
      </section>
    );
  }

  const prefs = (me.root as any).notificationPrefs;
  const apiSupported = typeof Notification !== "undefined";
  const browserEffective = prefs.browser && permissionState === "granted";

  function handleSoundToggle() {
    prefs.$jazz.set("sound", !prefs.sound);
  }

  async function handleEnableBrowser() {
    setRequestError(null);
    if (!apiSupported) {
      setRequestError("Browser notifications are not available in this environment.");
      return;
    }
    if (Notification.permission === "denied") {
      setRequestError(
        "Notifications are blocked at the browser level. Re-enable them in your browser settings, then try again.",
      );
      setPermissionState("denied");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermissionState(result);
      if (result === "granted") {
        prefs.$jazz.set("browser", true);
      } else if (result === "denied") {
        setRequestError(
          "Notifications were declined. Re-enable in your browser settings to try again.",
        );
      }
      // "default" → user dismissed; no state change.
    } catch (err) {
      setRequestError(
        err instanceof Error ? err.message : "Failed to request permission.",
      );
    }
  }

  function handleDisableBrowser() {
    prefs.$jazz.set("browser", false);
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-gray-800 mb-2">Notifications</h2>
      <div className="bg-white rounded border border-gray-200 px-4 py-3 flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="sound-toggle"
            checked={prefs.sound}
            onChange={handleSoundToggle}
          />
          Play sound when new messages arrive
        </label>

        <div className="flex flex-col gap-2">
          <div className="text-sm">
            Browser notifications:{" "}
            <span
              data-testid="browser-status"
              className={browserEffective ? "text-green-700" : "text-gray-500"}
            >
              {browserEffective ? "Enabled" : "Not enabled"}
            </span>
          </div>
          {!browserEffective ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleEnableBrowser()}
              data-testid="enable-browser-notifications"
              disabled={!apiSupported}
              className="self-start"
            >
              Enable browser notifications
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisableBrowser}
              data-testid="disable-browser-notifications"
              className="self-start"
            >
              Disable
            </Button>
          )}
          {requestError && (
            <p
              data-testid="browser-error"
              className="text-sm text-destructive"
            >
              {requestError}
            </p>
          )}
          {!apiSupported && (
            <p className="text-xs text-gray-500">
              Browser notifications aren't available in this environment.
            </p>
          )}
          <p className="text-xs text-gray-500">
            Once enabled, you'll see system notifications when a new message
            arrives in a conversation while this tab is hidden.
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Mount the section in `settings/index.tsx`**

Add the import:

```ts
import { NotificationsSection } from "./notifications-section";
```

In the `<div className="flex flex-col gap-6">` block, add `<NotificationsSection />` in a sensible spot (e.g., after Profile, before Devices):

```tsx
<div className="flex flex-col gap-6">
  <ProfileSection />
  <NotificationsSection />
  <DevicesSection />
  <InvitesSection />
  <AccountSection />
</div>
```

- [ ] **Step 3: Type-check + build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/routes/settings/notifications-section.tsx src/routes/settings/index.tsx
git commit -m "feat(settings): add notifications section with sound + browser toggles"
```

---

## Task B5: `markRead` useEffect in conversations/detail.tsx

**Files:**
- Modify: `src/routes/conversations/detail.tsx`

Fire `markRead(me, id)` when the conversation is loaded AND when its message count grows AND the user is looking at it. The mount of the route already implies "user is here," so no extra focus check needed.

- [ ] **Step 1: Add the import + useEffect**

Find the import block in `src/routes/conversations/detail.tsx`. Add:

```ts
import { markRead } from "@/jazz/notifications";
```

Find the existing `messageCount` declaration (currently around line 58):

```ts
const messageCount = (conversation as any)?.messages?.length ?? 0;
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messageCount]);
```

Add a sibling `useEffect` for `markRead` right after it:

```ts
// Slice 8: mark conversation read on mount + whenever its message count
// grows while the route is mounted. Per spec §2.4: writes
// max(Date.now(), latestSeenMessageSentAt + 1) for clock-skew safety.
useEffect(() => {
  if (me.$isLoaded && conversation && id) {
    markRead(me as any, id);
  }
}, [me.$isLoaded, conversation, id, messageCount]);
```

Also: deepen the `useAccount` resolve in this route to include `lastReadAt` so `markRead` can actually write. Find:

```ts
const me = useAccount(JazzMessangerAccount, {
  resolve: {
    profile: true,
    root: { contactBook: { $each: true }, knownConversations: true },
  },
});
```

Change to:

```ts
const me = useAccount(JazzMessangerAccount, {
  resolve: {
    profile: true,
    root: {
      contactBook: { $each: true },
      knownConversations: true,
      lastReadAt: true,
    },
  },
});
```

- [ ] **Step 2: Type-check + run unit suite**

```bash
npm run build && npm test
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/routes/conversations/detail.tsx
git commit -m "feat(notifications): mark conversation read on open + new message"
```

---

## Task B6: E2E specs + CHANGELOG

**Files:**
- Create: `tests/e2e/unread-badges.spec.ts`
- Create: `tests/e2e/unread-cross-device.spec.ts`
- Create: `tests/e2e/tab-title-badge.spec.ts`
- Create: `tests/e2e/notification-permission.spec.ts`
- Modify: `CHANGELOG.md`

Four new e2e specs covering the user-visible behaviors. Sound + actual OS notification rendering are NOT e2e-tested (Playwright can't reach those subsystems); they're covered by unit tests.

- [ ] **Step 1: Implement `unread-badges.spec.ts`**

Create `tests/e2e/unread-badges.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { createAccount, signIn, getPairingUrl } from "./helpers";

test.describe("unread badges", () => {
  test("badge appears, count grows, clears on open", async ({ browser }) => {
    const ctxAlice = await browser.newContext();
    const ctxBob = await browser.newContext();
    const alice = await ctxAlice.newPage();
    const bob = await ctxBob.newPage();

    // Sign up both
    const aliceCreds = await createAccount(alice, "Alice");
    const bobCreds = await createAccount(bob, "Bob");

    // Pair them via QR pairing (existing flow — see contact-invitation.spec.ts
    // for the canonical sequence). For brevity we assume the helper exists or
    // use the direct contact-add flow.
    await alice.goto("/contacts/add");
    const pairingUrl = await getPairingUrl(alice);

    await bob.goto(pairingUrl);
    // Bob accepts pairing through the responder UI; both end up with each
    // other in their ContactBook. Existing tests document this flow.

    // Open a 1:1 conversation from Alice → Bob (existing sidebar "+" flow)
    await alice.getByTestId("new-chat-btn").click();
    await alice.getByText("Bob").click();

    // Wait for the conversation to land on home
    await alice.getByTestId("conversation-detail").waitFor();

    // Alice sends 3 messages
    for (let i = 1; i <= 3; i++) {
      await alice.locator("[data-testid='composer-input']").fill(`msg ${i}`);
      await alice.locator("[data-testid='send-btn']").click();
    }

    // Bob's sidebar should show an unread badge with count 3 on his
    // conversation row
    await bob.goto("/conversations");
    const badge = bob.getByTestId(/^unread-badge-\d+$/).first();
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toHaveText("3");

    // The conversation row should be bold (font-semibold class)
    const row = bob.getByTestId(/^conversation-row-\d+$/).first();
    await expect(row).toHaveClass(/font-semibold/);

    // Bob opens the conversation → badge clears, row un-bolds
    await row.click();
    await bob.getByTestId("conversation-detail").waitFor();
    await bob.goto("/conversations"); // back to sidebar
    await expect(bob.getByTestId(/^unread-badge-\d+$/)).toHaveCount(0);
    const reReadRow = bob.getByTestId(/^conversation-row-\d+$/).first();
    await expect(reReadRow).not.toHaveClass(/font-semibold/);

    await ctxAlice.close();
    await ctxBob.close();
  });
});
```

- [ ] **Step 2: Implement `unread-cross-device.spec.ts`**

Create `tests/e2e/unread-cross-device.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { createAccount, signIn, getPairingUrl } from "./helpers";

test.describe("unread state syncs across devices", () => {
  test("opening conversation on device A clears badge on device B", async ({ browser }) => {
    const ctxAlice = await browser.newContext();
    const ctxBobA = await browser.newContext();
    const ctxBobB = await browser.newContext();
    const alice = await ctxAlice.newPage();
    const bobA = await ctxBobA.newPage();
    const bobB = await ctxBobB.newPage();

    const aliceCreds = await createAccount(alice, "Alice");
    const bobCreds = await createAccount(bobA, "Bob");

    // Sign Bob in on a second "device" (browser context)
    await signIn(bobB, bobCreds);

    // Pair Alice and Bob (skim — same as unread-badges.spec.ts)
    await alice.goto("/contacts/add");
    const pairingUrl = await getPairingUrl(alice);
    await bobA.goto(pairingUrl);

    // Alice sends 2 messages from a new 1:1 conversation
    await alice.getByTestId("new-chat-btn").click();
    await alice.getByText("Bob").click();
    await alice.getByTestId("conversation-detail").waitFor();
    await alice.locator("[data-testid='composer-input']").fill("ping 1");
    await alice.locator("[data-testid='send-btn']").click();
    await alice.locator("[data-testid='composer-input']").fill("ping 2");
    await alice.locator("[data-testid='send-btn']").click();

    // Both Bob devices show badge with 2
    await bobA.goto("/conversations");
    await bobB.goto("/conversations");
    await expect(bobA.getByTestId(/^unread-badge-\d+$/).first()).toHaveText("2", { timeout: 15_000 });
    await expect(bobB.getByTestId(/^unread-badge-\d+$/).first()).toHaveText("2", { timeout: 15_000 });

    // Bob opens the conversation on device A
    await bobA.getByTestId(/^conversation-row-\d+$/).first().click();
    await bobA.getByTestId("conversation-detail").waitFor();

    // Device B's badge should clear (lastReadAt syncs via Jazz)
    await bobB.reload();
    await expect(bobB.getByTestId(/^unread-badge-\d+$/)).toHaveCount(0, { timeout: 15_000 });

    await ctxAlice.close();
    await ctxBobA.close();
    await ctxBobB.close();
  });
});
```

- [ ] **Step 3: Implement `tab-title-badge.spec.ts`**

Create `tests/e2e/tab-title-badge.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { createAccount, getPairingUrl } from "./helpers";

test.describe("tab title badge", () => {
  test("title gains (N) prefix when hidden + unread > 0", async ({ browser }) => {
    const ctxAlice = await browser.newContext();
    const ctxBob = await browser.newContext();
    const alice = await ctxAlice.newPage();
    const bob = await ctxBob.newPage();

    await createAccount(alice, "Alice");
    await createAccount(bob, "Bob");

    await alice.goto("/contacts/add");
    const pairingUrl = await getPairingUrl(alice);
    await bob.goto(pairingUrl);

    // Force Bob's tab "hidden" before any messages arrive
    await bob.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Alice opens a 1:1 and sends 2 messages
    await alice.getByTestId("new-chat-btn").click();
    await alice.getByText("Bob").click();
    await alice.getByTestId("conversation-detail").waitFor();
    await alice.locator("[data-testid='composer-input']").fill("hi 1");
    await alice.locator("[data-testid='send-btn']").click();
    await alice.locator("[data-testid='composer-input']").fill("hi 2");
    await alice.locator("[data-testid='send-btn']").click();

    // Bob's title should update to (2) Jazz Messanger
    await bob.goto("/conversations");
    await expect.poll(async () => bob.title(), { timeout: 15_000 }).toMatch(/^\(2\) /);

    // Revert "hidden" → title goes back to plain
    await bob.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(async () => bob.title(), { timeout: 5_000 }).toBe("Jazz Messanger");

    await ctxAlice.close();
    await ctxBob.close();
  });
});
```

- [ ] **Step 4: Implement `notification-permission.spec.ts`**

Create `tests/e2e/notification-permission.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

test.describe("notification permission flow", () => {
  test("granted permission flips notificationPrefs.browser true", async ({ browser }) => {
    const ctx = await browser.newContext({
      permissions: ["notifications"], // pre-grant
    });
    const page = await ctx.newPage();
    await createAccount(page, "Alice");
    await page.goto("/settings");

    await page.getByTestId("enable-browser-notifications").click();

    // Status should update to "Enabled"
    await expect(page.getByTestId("browser-status")).toHaveText("Enabled", { timeout: 5_000 });
    // The button switches to "Disable"
    await expect(page.getByTestId("disable-browser-notifications")).toBeVisible();

    await ctx.close();
  });

  test("denied permission shows inline error", async ({ browser }) => {
    // Playwright's default is to deny when not in the permissions list.
    // Browser context with `permissions: []` and an explicit grantPermissions
    // call would be more explicit; here we just don't grant.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await createAccount(page, "Alice");
    await page.goto("/settings");

    // Force-deny via override so the test is deterministic
    await page.evaluate(() => {
      // Chromium-specific: Notification.requestPermission returns the current
      // value if "denied" has been set. We override the static.
      Object.defineProperty(Notification, "permission", {
        configurable: true,
        get: () => "denied",
      });
    });

    await page.getByTestId("enable-browser-notifications").click();
    await expect(page.getByTestId("browser-error")).toBeVisible({ timeout: 5_000 });
    // Status stays "Not enabled"
    await expect(page.getByTestId("browser-status")).toHaveText("Not enabled");

    await ctx.close();
  });

  test("sound toggle writes to notificationPrefs", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await createAccount(page, "Alice");
    await page.goto("/settings");

    const toggle = page.getByTestId("sound-toggle");
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();
    // Round-trip: reload and verify it persisted
    await page.reload();
    await expect(page.getByTestId("sound-toggle")).toBeChecked({ timeout: 10_000 });

    await ctx.close();
  });
});
```

- [ ] **Step 5: Run the new e2e specs**

```bash
npm run test:e2e -- tests/e2e/unread-badges.spec.ts tests/e2e/unread-cross-device.spec.ts tests/e2e/tab-title-badge.spec.ts tests/e2e/notification-permission.spec.ts
```

Expected: all pass on chromium + firefox. The sync + auth + dev servers spin up automatically via `playwright.config.ts` webServer block. If pairing helpers aren't available in `helpers.ts`, adapt the test to use the canonical contact-invitation flow from `contact-invitation.spec.ts`.

- [ ] **Step 6: Full e2e regression sweep**

```bash
npm run test:e2e
```

Expected: all specs pass — including Slice 1-7 specs which should be unaffected by the additive sidebar changes.

- [ ] **Step 7: Update CHANGELOG**

Add a Slice 8 entry at the top of `CHANGELOG.md` (above Slice 7). Use this template:

```markdown
## [Unreleased] — Slice 8: In-App Notifications

### Added
- `me.root.lastReadAt: co.map(z.number())` — per-conversation read cutoff
  synced across the user's own devices via Jazz.
- `me.root.notificationPrefs: co.map({ sound, browser })` — per-account
  preferences for sound + browser-notification opt-in.
- `src/jazz/notifications.ts` — `getUnreadCount` + `markRead` pure helpers
  (clock-skew defense via `max(Date.now(), latestSeenSentAt + 1)`).
- `src/hooks/useNewMessageEvents.ts` — callback-based diff tracker that
  fires `onNewMessage` exactly once per detected arrival (diff runs in
  `useEffect`, not render — StrictMode-safe).
- `src/hooks/useTabTitleBadge.ts` — sets `document.title` to
  `(N) Jazz Messanger` when tab is hidden + unread > 0; cleanup on unmount.
- `src/components/notification-manager.tsx` — single home for the
  notification stack; aggregates total unread, drives the tab title,
  fans out sound + browser-notification side effects.
- `src/components/sidebar.tsx` — per-row unread badge + `font-semibold`.
- `src/routes/settings/notifications-section.tsx` — settings UI with
  sound checkbox + "Enable browser notifications" button + permission flow.
- `src/routes/conversations/detail.tsx` — `markRead` useEffect on mount
  + messages-grow.
- `public/notification.mp3` — short notification sound asset.

### Changed
- `JazzMessangerAccount.withMigration` — backfills `lastReadAt` and
  `notificationPrefs` for existing post-Slice-7 accounts on next load.
- `App.tsx` — deepens `me` resolve to include `lastReadAt` +
  `notificationPrefs`, mounts `<NotificationManager />` for authed users.

### Test coverage
- Unit: +7 tests for `getUnreadCount`/`markRead`, +7 for
  `useNewMessageEvents`, +6 for `useTabTitleBadge`, +7 for
  `NotificationManager` fanout. ~27 new tests.
- E2E: +4 specs — `unread-badges`, `unread-cross-device`,
  `tab-title-badge`, `notification-permission`.

### Manual verification (run on real browser before merging)
1. Open the app in two browser contexts (Alice + Bob).
2. Pair them; have Alice send a message → Bob's sidebar shows a "1" badge
   and the row goes bold.
3. cmd-tab away from Bob's tab. Alice sends another message → Bob's tab
   title becomes "(2) Jazz Messanger". Refocus Bob → title resets.
4. In Bob's Settings → Notifications, toggle "Play sound" on. cmd-tab
   away. Alice sends another message → Bob hears the sound.
5. In Bob's Settings → Notifications, click "Enable browser
   notifications", grant permission. cmd-tab away. Alice sends another
   message → Bob sees an OS-level notification.
6. Click that notification → Bob's main window focuses + navigates to the
   conversation.
7. Toggle sound off + click "Disable" on browser notifications. Repeat
   step 4/5 — neither sound nor OS notification fires.

### Deferred (filed as followups)
- Closed-app push notifications via Web Push (Service Worker + VAPID).
  Full architecture in **NOX-30**.
```

- [ ] **Step 8: Commit**

```bash
git add CHANGELOG.md tests/e2e/unread-badges.spec.ts tests/e2e/unread-cross-device.spec.ts tests/e2e/tab-title-badge.spec.ts tests/e2e/notification-permission.spec.ts
git commit -m "test(e2e): cover unread badges, cross-device sync, tab title, permissions"
```

---

# Plan self-review

**Spec coverage check:**

| Spec section | Implemented by |
|---|---|
| §1 Architecture (single-layer in-app) | Task B3 (NotificationManager mounts in App) |
| §2.1 Schema additions | Task A1 |
| §2.2 Migration | Task A1 (steps 2 + 3) |
| §2.3 `getUnreadCount` | Task A2 |
| §2.4 `markRead` with clock-skew defense | Task A2 + Task B5 |
| §2.5 `lastReadAt` flat-map trade-off | Acknowledged in spec; nothing to implement |
| §3.1 Sidebar badge + bold | Task B1 |
| §3.2 Tab title | Task B2 + Task B3 |
| §3.3 Sound | Task B3 (inlined in NotificationManager.onNewMessage) |
| §3.4 Foreground browser notification | Task B3 (inlined in NotificationManager.onNewMessage) |
| §3.5 useNewMessageEvents callback API | Task A3 |
| §3.6 Settings | Task B4 |
| §3.7 Routing into App.tsx | Task B3 Step 6 |
| §4 Failure modes | Implicitly covered by the gating logic in Task B3 + the rollback paths in markRead/getUnreadCount (Task A2) + the permission denial handling in Task B4 |
| §5 Threat model (no server expansion) | Confirmed — no server-side files touched |
| §6.1 Unit tests | Tasks A2, A3, B2, B3 |
| §6.2 E2E tests | Task B6 (4 specs) |
| §6.3 What's NOT tested | Acknowledged in spec; no plan task needed |
| §6.4 Manual verification checklist | Task B6 Step 7 (in CHANGELOG) |
| §7 Module structure | Plan's File Structure section matches |
| §8 Phasing | Plan structure matches (Phase A then Phase B) |
| §9 Out of scope | NOX-30 already filed; nothing to do |

No gaps.

**Placeholder scan:** no TBDs / TODOs / "implement later" in the plan body. The CHANGELOG template at Task B6 Step 7 is a complete artifact for the engineer to commit verbatim (not a placeholder).

**Type consistency:** `lastReadAt` is consistently `co.map(z.number())` throughout. `notificationPrefs` consistently has `{ sound: boolean, browser: boolean }`. `getUnreadCount(conversation, lastReadAt, myAccountID)` signature stable across all references. `markRead(me, conversationID)` consistent. `useNewMessageEvents({ conversations, onNewMessage })` shape consistent in tests + implementation + consumer.

Existing testids referenced in B6 e2e specs (`composer-input`, `send-btn`, `conversation-detail`, `new-chat-btn`) match patterns used in Slice 5-7 specs.

**One implementation note for the engineer carrying out this plan:** the `getPairingUrl` helper referenced in the e2e specs is real (used by `contact-invitation.spec.ts` and others). The pairing flow itself is multi-step and Bob's responder UI needs to be walked through — see `tests/e2e/device-pairing.spec.ts` for the canonical pattern if the simplified flow in Task B6 Step 1 doesn't compile.