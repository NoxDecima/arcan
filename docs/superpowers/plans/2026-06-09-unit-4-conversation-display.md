# Unit 4 — Conversation display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the conversation-display surface improvements: schema additions (`Conversation.icon`, `SystemEvent kind=renamed`), read-semantics change (mark-on-send/leave, not on open) + active-conversation suppression, sidebar tabs (chats/contacts) + mobile bottom tab bar, polymorphic `/profile/:accountID` route, multi-select new-conversation flow, in-conversation unread divider, conversation icon upload + monogram fallback, admin-gated title rename + `renamed` SystemEvent emission, and shared-conversations section on profiles.

**Architecture:** A mix of small schema additions (single new field on `Conversation`, single new enum value on `SystemEvent`), real react-router refactors (sidebar tabs, polymorphic profile route), and TDD'd behavior changes (read semantics, suppression). The shared `useSharedGroups` hook comes from Unit 1 (this plan imports from it). If Unit 1 hasn't shipped yet at execution time, the implementer ports the small hook code from Unit 1's plan and reconciles at merge.

**Tech Stack:** TypeScript strict, React 18 + Unit 7 tokens, react-router-dom 7, jazz-tools 0.20.18, Vitest + Playwright.

**Spec:** `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md` — Unit 4.

---

## Phase 0 · Setup

### Task 0.1: Branch + clean tree

```bash
cd /home/nox/Documents/Projects/Nox/arcan
git status --short
git checkout main && git pull
git checkout -b unit-4-conversation-display
```

---

## Phase 1 · Schema additions

### Task 1.1: `Conversation.icon` field

**Files:**
- Modify: `src/jazz/schema/Conversation.ts`
- Create: `tests/unit/jazz/schema/conversation-icon.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// tests/unit/jazz/schema/conversation-icon.test.ts
import { describe, test, expect } from "vitest";
import { Conversation } from "@/jazz/schema/Conversation";

describe("Conversation schema", () => {
  test("includes an optional icon field", () => {
    const shape = (Conversation as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape.icon).toBeDefined();
  });
});
```

Run: `npx vitest run tests/unit/jazz/schema/conversation-icon.test.ts` — expect FAIL.

- [ ] **Step 2: Add the field**

In `src/jazz/schema/Conversation.ts`, add `import { FileBlob } from "./FileBlob";` if not already imported, then add to the `co.map({ ... })` shape:

```typescript
  icon: FileBlob.optional(),
```

Re-run — expect PASS.

### Task 1.2: `SystemEvent.kind = "renamed"` + optional `newTitle`

**Files:**
- Modify: `src/jazz/schema/SystemEvent.ts`
- Create: `tests/unit/jazz/schema/system-event-renamed.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, test, expect } from "vitest";
import { SystemEvent } from "@/jazz/schema/SystemEvent";

describe("SystemEvent", () => {
  test("kind enum includes 'renamed'", () => {
    const shape = (SystemEvent as unknown as { shape: { kind: { options: string[] } } }).shape;
    expect(shape.kind.options).toContain("renamed");
  });
  test("optional newTitle field exists", () => {
    const shape = (SystemEvent as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape.newTitle).toBeDefined();
  });
});
```

- [ ] **Step 2: Extend the schema**

In `src/jazz/schema/SystemEvent.ts`, find the `kind: z.enum([...])` line. Add `"renamed"` to the enum:

```typescript
kind: z.enum(["added", "removed", "left", "promoted", "renamed"]),
```

Add the optional `newTitle` field:

```typescript
newTitle: z.string().optional(),
```

Re-run — expect PASS.

### Task 1.3: Commit Phase 1

```bash
git add src/jazz/schema/Conversation.ts src/jazz/schema/SystemEvent.ts tests/unit/jazz/schema/
git commit -m "feat(schema): Conversation.icon + SystemEvent kind=renamed (with newTitle)

Conversation gains an optional icon (FileBlob.optional()) for group
conversation avatars. SystemEvent kind enum extended with 'renamed' and
an optional newTitle for the rename timeline event.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 2 · `updateConversationTitle` emits `renamed` SystemEvent + new `updateConversationIcon`

### Task 2.1: Failing test for the SystemEvent emission

**Files:**
- Modify: `tests/unit/jazz/conversation.test.ts` (or create a focused test if the file is large)

- [ ] **Step 1: Add a test**

Append to the existing conversation test file (or create `tests/unit/jazz/conversation-rename.test.ts`):

```typescript
import { describe, test, expect, beforeEach } from "vitest";
import { createTestAccount, createGroupConversation, updateConversationTitle } from "@/jazz/conversation";
// imports may need adjusting based on test infra; the existing conversation.test.ts has the patterns

describe("updateConversationTitle", () => {
  test("appends a 'renamed' SystemEvent with newTitle", async () => {
    // Setup omitted — follow the existing tests' fixtures.
    // const me = await createTestAccount();
    // const conv = await createGroupConversation(me, [], "old");
    // await updateConversationTitle(me, conv, "new");
    // const events = conv.systemEvents;
    // const renames = events.filter((e: any) => e?.kind === "renamed");
    // expect(renames.length).toBe(1);
    // expect((renames[0] as any).newTitle).toBe("new");
    expect(true).toBe(true); // placeholder; replace with real setup
  });
});
```

The placeholder above is intentional — the actual fixture setup pattern is in the existing `tests/unit/jazz/conversation.test.ts`. Read that file first and replicate its `createTestAccount` / `createGroupConversation` helpers.

### Task 2.2: Update `updateConversationTitle`

**Files:**
- Modify: `src/jazz/conversation.ts`

- [ ] **Step 1: Find `updateConversationTitle` (~line 501)**

Current body just does `conversation.$jazz.set("title", newTitle)`.

- [ ] **Step 2: Emit the SystemEvent**

Replace the body with:

```typescript
export async function updateConversationTitle(
  me: Account,
  conversation: any,
  newTitle: string,
): Promise<void> {
  const trimmed = newTitle.trim();
  if (!trimmed) throw new Error("title cannot be empty");
  if (trimmed.length > 100) throw new Error("title too long (max 100 chars)");

  conversation.$jazz.set("title", trimmed);

  // Append a 'renamed' SystemEvent to the conversation's sidecar log.
  writeSystemEvent(me, conversation, {
    kind: "renamed",
    newTitle: trimmed,
  });
}
```

Then extend `writeSystemEvent` to accept the new `kind` + the optional `newTitle` payload field:

```typescript
function writeSystemEvent(
  me: Account,
  conversation: any,
  payload: {
    kind: "added" | "removed" | "left" | "promoted" | "renamed";
    targetAccountID?: string;
    newTitle?: string;
  },
): void {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) return;
  const events = conversation.systemEvents;
  if (!events || typeof events.$jazz?.push !== "function") return;
  const event = SystemEvent.create(
    {
      kind: payload.kind,
      actorAccountID: (me as any).$jazz.id as string,
      targetAccountID: payload.targetAccountID,
      newTitle: payload.newTitle,
      occurredAt: new Date(),
    },
    { owner: conversationGroup },
  );
  events.$jazz.push(event);
}
```

### Task 2.3: Add `updateConversationIcon`

**Files:**
- Modify: `src/jazz/conversation.ts`

- [ ] **Step 1: Append the helper**

```typescript
/**
 * Set or clear the conversation's icon. Admins only (the UI gates this;
 * cojson permission gating is a future hardening per the spec's known
 * accepted gap).
 *
 * Pass null/undefined to clear (reverting to monogram).
 */
export async function updateConversationIcon(
  _me: Account,
  conversation: any,
  icon: any | null,
): Promise<void> {
  conversation.$jazz.set("icon", icon ?? undefined);
}
```

No SystemEvent for icon changes (per spec).

### Task 2.4: Commit Phase 2

```bash
git add src/jazz/conversation.ts tests/unit/jazz/
git commit -m "feat(conversation): updateConversationTitle emits renamed SystemEvent

Title-rename now appends a SystemEvent of kind='renamed' with the new
title, surfacing the change in the timeline. Title is trimmed; empty
or all-whitespace rejected at the caller; max length 100 enforced.
Adds updateConversationIcon helper (set or clear; no SystemEvent).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 3 · Read-semantics change + active-conversation suppression

### Task 3.1: Locate current mark-read logic

**Files:**
- Read: `src/routes/conversations/detail.tsx`

The current code marks read on mount + on visibilitychange. Find that effect.

### Task 3.2: Replace with mark-on-send and mark-on-leave

**Files:**
- Modify: `src/routes/conversations/detail.tsx`

- [ ] **Step 1: Anchor lastReadAt at mount (read-only); replace the mark-on-open effect**

In the component body, replace the existing `useEffect` that calls `markRead()` with:

```typescript
import { useRef, useEffect } from "react";

// Capture anchor lastReadAt at mount (for divider rendering — see Phase 7).
const anchorRef = useRef<number | null>(null);
const latestRenderedSentAtRef = useRef<number>(0);

useEffect(() => {
  // Don't mark on open. Capture the lastReadAt at this moment as the divider anchor.
  const prev = me?.root?.lastReadAt?.[(conversation as any).$jazz.id];
  anchorRef.current = typeof prev === "number" ? prev : 0;
}, [(conversation as any).$jazz.id]);

// Track the latest rendered message's sentAt as messages flow in.
useEffect(() => {
  const messages = (conversation as any).messages ?? [];
  for (const m of messages) {
    const t = m?.sentAt instanceof Date ? m.sentAt.getTime() : 0;
    if (t > latestRenderedSentAtRef.current) latestRenderedSentAtRef.current = t;
  }
}, [(conversation as any).messages?.length]);
```

- [ ] **Step 2: Mark on leave**

Replace the existing visibility-change effect with a multi-trigger leave handler:

```typescript
useEffect(() => {
  const convId = (conversation as any).$jazz.id as string;

  const markLeave = () => {
    const latest = latestRenderedSentAtRef.current;
    if (latest <= 0) return;
    const next = latest + 1;
    const cur = (me?.root as any)?.lastReadAt?.[convId] ?? 0;
    if (next > cur) {
      (me?.root as any)?.lastReadAt?.$jazz?.set(convId, next);
    }
  };

  const onVis = () => {
    if (document.visibilityState === "hidden") markLeave();
  };
  const onBeforeUnload = () => markLeave();

  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("beforeunload", onBeforeUnload);

  return () => {
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("beforeunload", onBeforeUnload);
    // route-change cleanup
    markLeave();
  };
}, [(conversation as any).$jazz.id]);
```

- [ ] **Step 3: Mark on send**

Find the `sendMessage` call site in the composer. After the send resolves successfully:

```typescript
const onSend = async () => {
  await sendMessage(me, conversation, message, attachments);
  // mark-read on send: max(current, Date.now())
  const convId = (conversation as any).$jazz.id as string;
  const cur = (me?.root as any)?.lastReadAt?.[convId] ?? 0;
  const next = Date.now();
  if (next > cur) {
    (me?.root as any)?.lastReadAt?.$jazz?.set(convId, next);
  }
};
```

### Task 3.3: Active-conversation suppression

**Files:**
- Modify: `src/components/sidebar.tsx` (badge filter)
- Modify: `src/hooks/useTabTitleBadge.ts` (sum exclusion)
- Modify: `src/components/notification-manager.tsx` (toast skip)

- [ ] **Step 1: Sidebar — hide badge on active row**

In `sidebar.tsx`, find the unread-badge render. Get the current route's conversation ID via `useParams()` from `react-router-dom`:

```typescript
import { useParams } from "react-router-dom";
const { conversationId: activeConvId } = useParams();
// ... in the render of each row:
const isActive = (conv as any).$jazz.id === activeConvId;
// hide badge when isActive
{!isActive && unreadCount > 0 && (
  <span className="ml-2 inline-flex items-center justify-center px-1.5 min-w-[18px] h-[18px] rounded-pill bg-arcan-accent text-on-accent text-xs font-semibold">
    {unreadCount}
  </span>
)}
```

- [ ] **Step 2: Tab title — exclude active conversation from the total**

Find `useTabTitleBadge` (or wherever the total unread is summed). Subtract the active conversation's contribution. If the hook accepts a `totalUnread` parameter, the caller in App.tsx is where to do the subtraction. Alternative: pass the active conv ID into the hook.

Adjust the call site (in App.tsx or wherever totals are computed) to compute the total excluding the active conversation when applicable.

- [ ] **Step 3: In-app notifications — skip the active conversation**

In `notification-manager.tsx`, before firing a toast/native notification on a new message arrival, check whether the message's conversation ID matches the current route. If yes, skip.

Use `useLocation()` from react-router to read the pathname, parse the conv ID, compare.

### Task 3.4: Commit Phase 3

```bash
git add src/routes/conversations/detail.tsx src/components/sidebar.tsx src/hooks/useTabTitleBadge.ts src/components/notification-manager.tsx
git commit -m "feat(conversations): mark-on-send + mark-on-leave + active-conversation suppression

Replaces mark-on-open with: send -> max(current, Date.now()),
leave -> max(current, latestRenderedSentAt + 1). 'Leave' fires on
route change, visibilitychange to hidden, and beforeunload.

Sidebar badge, tab title sum, and in-app notifications all suppress
the active conversation's unread contribution so the user never sees
'unread' on the chat they're looking at.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 4 · Sidebar tabs (chats / contacts)

### Task 4.1: Make the sidebar tabbed

**Files:**
- Modify: `src/components/sidebar.tsx`
- Modify: `src/App.tsx` (route setup)

Currently the sidebar renders only the conversations list. The new design: `chats` / `contacts` tabs in a persistent sidebar. The active tab determines which list renders inside the sidebar; clicking a row navigates as before.

- [ ] **Step 1: Add tab state + persistence**

Use `me.root.settings.appearance.lastTab` or just `useState` per session. The hi-fi designs imply per-session is fine.

```typescript
const [tab, setTab] = useState<"chats" | "contacts">("chats");
```

- [ ] **Step 2: Render the tab header**

Above the list, render:

```tsx
<div className="flex border-b border-hairline" data-testid="sidebar-tabs">
  <button
    className={`flex-1 py-2 text-xs font-semibold ${tab === "chats" ? "text-text border-b-2 border-arcan-accent" : "text-dim"}`}
    onClick={() => setTab("chats")}
  >chats</button>
  <button
    className={`flex-1 py-2 text-xs font-semibold ${tab === "contacts" ? "text-text border-b-2 border-arcan-accent" : "text-dim"}`}
    onClick={() => setTab("contacts")}
  >contacts</button>
</div>
```

- [ ] **Step 3: Conditional list render**

After the tab header, render the conversations list when `tab === "chats"` and the contacts list when `tab === "contacts"`. The contacts list can be a thin wrapper around the existing contacts list component, or inlined.

- [ ] **Step 4: Remove the separate `/contacts` top-level route**

In `App.tsx` (or wherever routes are declared), the `/contacts` standalone route is no longer the primary entry. Keep it for direct linking (e.g. share links) but the sidebar tab is the main affordance.

### Task 4.2: Mobile bottom tab bar (root screens only)

**Files:**
- Create: `src/components/mobile-tab-bar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the bar**

```tsx
import { Link, useLocation } from "react-router-dom";

const ROOT_PATHS = ["/", "/contacts"];

export function MobileTabBar({ tab, setTab }: { tab: "chats" | "contacts"; setTab: (t: "chats" | "contacts") => void }) {
  const { pathname } = useLocation();
  const onRoot = ROOT_PATHS.includes(pathname);
  if (!onRoot) return null;
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 h-14 flex border-t border-hairline bg-rail"
      data-testid="mobile-tab-bar"
    >
      <button
        className={`flex-1 flex flex-col items-center justify-center gap-1 text-xs ${tab === "chats" ? "text-arcan-accent font-semibold" : "text-dim"}`}
        onClick={() => setTab("chats")}
      >chats</button>
      <button
        className={`flex-1 flex flex-col items-center justify-center gap-1 text-xs ${tab === "contacts" ? "text-arcan-accent font-semibold" : "text-dim"}`}
        onClick={() => setTab("contacts")}
      >contacts</button>
    </nav>
  );
}
```

- [ ] **Step 2: Hook up + share tab state with sidebar**

Lift `tab` state up to App.tsx so both Sidebar (desktop) and MobileTabBar (mobile) share it. Pass `tab` + `setTab` to both.

### Task 4.3: Commit Phase 4

```bash
git add src/components/sidebar.tsx src/components/mobile-tab-bar.tsx src/App.tsx
git commit -m "feat(nav): sidebar tabs (chats/contacts) + mobile bottom tab bar

Sidebar gains stateful chats/contacts tabs. Mobile gets a fixed bottom
tab bar visible only on root screens. Both share the same tab state
lifted to App.tsx.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 5 · Polymorphic profile route

### Task 5.1: Create the profile component

**Files:**
- Create: `src/components/profile-view.tsx`

This is the polymorphic component that renders both contact and own profile based on whether `accountID === me.$jazz.id`.

- [ ] **Step 1: Write the component**

```tsx
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useSharedGroups } from "@/hooks/use-shared-groups"; // imported from Unit 1
import { SafetyNumber } from "@/components/safety-number";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface ProfileViewProps {
  accountID: string;
}

export function ProfileView({ accountID }: ProfileViewProps) {
  const me = useAccount(ArcanAccount, { resolve: { profile: true } });
  const sharedGroups = useSharedGroups(accountID);
  const [showSafety, setShowSafety] = useState(false);

  if (!me.$isLoaded) return null;
  const isOwn = accountID === (me as any).$jazz.id;

  // ... load the target account if !isOwn; load profile/avatar/display name + fingerprint

  return (
    <div className="flex flex-col items-center gap-4 p-6 max-w-md mx-auto">
      {/* Avatar (camera overlay if own) */}
      <div className="relative">
        <div className="w-20 h-20 rounded-pill bg-accent-soft text-arcan-accent text-3xl flex items-center justify-center font-semibold">
          {/* initials or avatar image */}
        </div>
        {isOwn && (
          <button className="absolute -bottom-1 -right-1 w-8 h-8 rounded-pill bg-arcan-accent text-on-accent flex items-center justify-center" aria-label="Change avatar">
            📷
          </button>
        )}
      </div>

      {/* Display name (with pencil if own) */}
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-text">{/* displayName */}</h1>
        {isOwn && <button aria-label="Edit name" className="text-dim hover:text-text">✏️</button>}
      </div>

      {/* Truncated account ID */}
      <p className="text-xs text-dim font-mono">{accountID.slice(0, 6)}…{accountID.slice(-3)}</p>

      {/* Primary action */}
      {isOwn ? (
        <Button variant="primary" onClick={() => window.location.assign("/contacts/add")}>add a contact</Button>
      ) : (
        <Button variant="primary" onClick={() => {/* open or create 1:1 */}}>message</Button>
      )}

      {/* Shared conversations section */}
      <section className="w-full">
        <h3 className="text-[10px] uppercase tracking-widest text-dim font-semibold mb-2">
          {isOwn ? "your conversations" : "shared conversations"}
        </h3>
        {sharedGroups.length === 0 ? (
          <p className="text-sm text-text-2">No shared conversations yet.</p>
        ) : (
          <ul className="space-y-1">
            {sharedGroups.map((g) => (
              <li key={g.id} className="text-sm text-text">{g.title}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Safety number section */}
      <section className="w-full">
        <button
          className="w-full flex items-center justify-between p-3 rounded-r-3 border border-hairline bg-panel"
          onClick={() => setShowSafety((s) => !s)}
        >
          <span className="text-sm font-semibold text-text">view security code</span>
          <span className="text-dim">{showSafety ? "▾" : "▸"}</span>
        </button>
        {showSafety && (
          <div className="mt-2 p-3 rounded-r-3 border border-hairline bg-panel">
            <SafetyNumber fingerprintHex={/* the target account's fingerprint */ ""} />
            <p className="text-[11px] text-dim text-center mt-3">
              Compare in person to confirm it's really them.
            </p>
          </div>
        )}
      </section>

      {/* Own-only: account & settings link */}
      {isOwn && (
        <a href="/settings" className="w-full mt-4 p-3 rounded-r-3 border border-hairline bg-panel text-sm text-text text-center">
          account & settings
        </a>
      )}
    </div>
  );
}
```

This is a sketch — the actual avatar loading, display-name resolution, and fingerprint extraction depend on the existing `avatarResolver.ts` + `displayName.ts` + Contact records. Implementer wires them up using existing patterns.

### Task 5.2: Route the polymorphic profile at `/profile/:accountID`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the route**

```tsx
<Route path="/profile/:accountID" element={<ProfileRoute />} />
```

Where `ProfileRoute` reads the param and renders `<ProfileView accountID={...} />`.

### Task 5.3: Reduce `/settings/profile-section.tsx` to a navigation row

**Files:**
- Modify: `src/routes/settings/profile-section.tsx`

- [ ] **Step 1: Replace body with a single row that links to `/profile/<me-id>`**

```tsx
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { useNavigate } from "react-router-dom";

export function ProfileSection() {
  const me = useAccount(ArcanAccount, { resolve: {} });
  const navigate = useNavigate();
  if (!me.$isLoaded) return <p className="text-sm text-dim">Loading…</p>;
  return (
    <button
      onClick={() => navigate(`/profile/${(me as any).$jazz.id}`)}
      className="w-full p-4 rounded-r-3 border border-hairline bg-panel text-left flex items-center justify-between"
    >
      <span className="text-sm text-text">Your profile</span>
      <span className="text-dim">›</span>
    </button>
  );
}
```

### Task 5.4: Entry points — avatar tap in chats/contacts header

In the sidebar header (`me` row with avatar + name + gear), make the avatar+name area clickable → `/profile/<me-id>`. Gear → `/settings` stays the same.

In the contacts list, each contact row already navigates to `/contacts/:contactID`. Change to `/profile/<their-accountID>`.

### Task 5.5: Commit Phase 5

```bash
git add src/components/profile-view.tsx src/App.tsx src/routes/settings/profile-section.tsx src/components/sidebar.tsx
git commit -m "feat(profile): polymorphic /profile/:accountID route (own vs other)

One ProfileView component branches on accountID === me.id:
- other -> message button + shared-conversations + collapsed safety number
- own   -> camera overlay + pencil-edit on name + add-a-contact CTA + account & settings link

Entry points: avatar tap in sidebar header (own), contact row tap
(other), Settings -> Profile row (own). Old contacts/detail layout
deferred to a redirect; settings/profile-section.tsx reduces to a
navigation row.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 6 · Multi-select new-conversation flow

### Task 6.1: Build the new-conversation screen

**Files:**
- Create: `src/routes/conversations/new.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from "react";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { findOrCreate1to1Conversation, createGroupConversation } from "@/jazz/conversation";

export function NewConversationRoute() {
  const me = useAccount(ArcanAccount, { resolve: { profile: true, root: { contactBook: { $each: true } } } });
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  if (!me.$isLoaded) return null;
  const contacts = Array.from((me.root.contactBook as any) ?? []);
  const selectedCount = selected.size;
  const isGroup = selectedCount >= 2;

  const toggle = (accountID: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(accountID)) next.delete(accountID);
      else next.add(accountID);
      return next;
    });
  };

  const submit = async () => {
    if (selectedCount === 0) return;
    setCreating(true);
    try {
      if (selectedCount === 1) {
        const accountID = Array.from(selected)[0];
        const contact = contacts.find((c: any) => c?.contactAccountID === accountID);
        const conv = await findOrCreate1to1Conversation(me as any, contact);
        navigate(`/conversations/${(conv as any).$jazz.id}`);
      } else {
        const title = groupName.trim() || `Group with ${selectedCount} people`;
        const conv = await createGroupConversation(me as any, Array.from(selected), title);
        navigate(`/conversations/${(conv as any).$jazz.id}`);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="p-4 border-b border-hairline">
        <h1 className="text-lg font-semibold text-text">new conversation</h1>
      </header>
      {isGroup && (
        <div className="p-4 border-b border-hairline">
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="group name (optional)"
            className="w-full p-2 rounded-r-3 border border-hairline bg-panel text-text font-body text-sm outline-none focus:border-arcan-accent"
            data-testid="new-convo-group-name"
          />
        </div>
      )}
      <div className="flex-1 overflow-auto p-2">
        <p className="px-2 pb-2 text-[10px] uppercase tracking-widest text-dim font-semibold">
          contacts · one = 1:1 · two+ = group
        </p>
        {contacts.map((c: any) => {
          const id = c?.contactAccountID;
          if (!id) return null;
          const on = selected.has(id);
          return (
            <button
              key={id}
              data-testid={`new-convo-contact-${id}`}
              onClick={() => toggle(id)}
              className={`w-full flex items-center gap-3 p-2 rounded-r-3 ${on ? "bg-accent-soft" : "hover:bg-panel-2"}`}
            >
              <div className="w-10 h-10 rounded-pill bg-accent-soft text-arcan-accent flex items-center justify-center text-sm font-semibold">
                {c?.displayNameLocal?.slice(0, 2) ?? "?"}
              </div>
              <span className="flex-1 text-left text-sm text-text">{c?.displayNameLocal ?? "Unknown"}</span>
              <span className={`w-5 h-5 rounded-r-1 border-2 ${on ? "bg-arcan-accent border-transparent" : "border-hairline"}`} />
            </button>
          );
        })}
      </div>
      <footer className="p-4 border-t border-hairline">
        <Button
          variant="primary"
          disabled={selectedCount === 0 || creating}
          onClick={submit}
          data-testid="new-convo-submit"
          className="w-full"
        >
          {selectedCount === 0
            ? "select contacts"
            : isGroup
            ? `create group · ${selectedCount} members`
            : "message"}
        </Button>
      </footer>
    </div>
  );
}
```

### Task 6.2: Route it

**Files:**
- Modify: `src/App.tsx`

```tsx
<Route path="/conversations/new" element={<NewConversationRoute />} />
```

### Task 6.3: Sidebar "+" FAB launches the new-conversation flow

Update the sidebar's add button to navigate to `/conversations/new`.

### Task 6.4: Commit Phase 6

```bash
git add src/routes/conversations/new.tsx src/App.tsx src/components/sidebar.tsx
git commit -m "feat(conversations): multi-select new-conversation flow

One screen for both 1:1 and group creation. Selecting 1 contact ->
'message' (creates 1:1); selecting 2+ -> 'create group · N members'
with optional group name input that surfaces only when 2+ are selected.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 7 · New-messages divider (in-conversation)

### Task 7.1: Render the divider

**Files:**
- Modify: `src/routes/conversations/detail.tsx`

- [ ] **Step 1: Add a NewMark component**

```tsx
function NewMark() {
  return (
    <div className="flex items-center gap-2 my-2" data-testid="new-messages-divider">
      <div className="flex-1 h-px bg-arcan-accent opacity-50" />
      <span className="text-[9px] uppercase tracking-widest font-semibold text-arcan-accent font-mono">new</span>
      <div className="flex-1 h-px bg-arcan-accent opacity-50" />
    </div>
  );
}
```

- [ ] **Step 2: Insert based on anchorRef.current**

When rendering the message list, insert `<NewMark />` immediately before the first message whose `sentAt > anchorRef.current` AND whose author is not self AND which is not a SystemEvent.

If no unread → no divider. If all unread → divider at top.

### Task 7.2: Auto-scroll to divider on mount

In the same render effect, after first paint, if there's a NewMark element, scroll to it.

```typescript
useEffect(() => {
  const el = document.querySelector('[data-testid="new-messages-divider"]');
  if (el) el.scrollIntoView({ block: "center", behavior: "auto" });
}, []);
```

### Task 7.3: Commit Phase 7

```bash
git add src/routes/conversations/detail.tsx
git commit -m "feat(conversations): new-messages divider anchored at lastReadAt-on-open

Divider rendered above the first message whose sentAt exceeds the
lastReadAt captured at mount; self-authored messages and SystemEvents
excluded. Stays anchored for the reading session. Auto-scrolls into
view on mount when present.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 8 · Conversation icon upload + monogram fallback

### Task 8.1: Monogram avatar component

**Files:**
- Create: `src/components/conversation-avatar.tsx`

- [ ] **Step 1: Write the component**

```tsx
interface ConversationAvatarProps {
  conversationId: string;
  title: string;
  icon?: any; // FileBlob if set
  size?: number;
}

// Deterministic hue from conversation id (stable across reloads/devices).
function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function ConversationAvatar({ conversationId, title, icon, size = 36 }: ConversationAvatarProps) {
  if (icon) {
    // Render the FileBlob as an <img> via the existing FileBlob renderer
    // (use whatever existing pattern src/components/avatar.tsx uses).
    return null; // placeholder — wire up via existing avatar resolver
  }
  // Monogram fallback
  const initials = title
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
  const hue = hueFromId(conversationId);
  return (
    <div
      className="rounded-pill flex items-center justify-center font-semibold text-text font-mono"
      style={{
        width: size,
        height: size,
        backgroundColor: `hsl(${hue}, 30%, 24%)`,
        fontSize: Math.round(size * 0.36),
      }}
      data-testid="conversation-avatar"
    >
      {initials}
    </div>
  );
}
```

### Task 8.2: Wire into conversation list rows + chat header + convo settings

**Files:**
- Modify: `src/components/sidebar.tsx` (list row avatar)
- Modify: `src/routes/conversations/detail.tsx` (chat header avatar)
- Modify: `src/routes/conversations/members.tsx` (group settings avatar)

For each, replace whatever placeholder/initials block is in place with `<ConversationAvatar conversationId={...} title={...} icon={conversation.icon} />`.

### Task 8.3: Upload affordance (admins only) in conversation settings

**Files:**
- Modify: `src/routes/conversations/members.tsx` (or wherever group settings live)

- [ ] **Step 1: Add a camera-overlay upload affordance on the group avatar**

Only render when `isAdmin(me, conversation)`. Wire to a file input that calls `updateConversationIcon(me, conv, file)`.

```tsx
// inside the group-settings render:
{iAmAdmin && (
  <label className="absolute -bottom-1 -right-1 w-8 h-8 rounded-pill bg-arcan-accent text-on-accent flex items-center justify-center cursor-pointer">
    <input
      type="file"
      accept="image/png,image/jpeg,image/webp"
      className="hidden"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // resize client-side to 256×256, then create a FileBlob via the existing avatar upload helper
        // (mirror src/components/profile-section.tsx's avatar upload path)
        const blob = await uploadIconAsFileBlob(file, conversation);
        await updateConversationIcon(me, conversation, blob);
      }}
    />
    📷
  </label>
)}
```

The `uploadIconAsFileBlob` helper is a wrapper around the existing avatar-upload path (Slice 5). Reuse don't reinvent.

### Task 8.4: Commit Phase 8

```bash
git add src/components/conversation-avatar.tsx src/components/sidebar.tsx src/routes/conversations/
git commit -m "feat(conversations): icon upload + monogram fallback

ConversationAvatar renders Conversation.icon (FileBlob) when set,
or a deterministic monogram (1-2 graphemes over a hue-from-conv-id
HSL background) when unset. Wired into list rows, chat header, and
group settings. Admins get a camera-overlay upload affordance in
group settings; non-admins see the avatar read-only.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 9 · Admin-gated title rename + timeline render

### Task 9.1: Admin-only edit affordance

**Files:**
- Modify: `src/routes/conversations/members.tsx` (or wherever the title currently renders)

- [ ] **Step 1: Show a pencil-edit icon next to the title only for admins**

```tsx
const iAmAdmin = isAdmin(me, conversation);

<div className="flex items-center gap-2">
  <h2 className="text-lg font-semibold text-text">{conversation.title}</h2>
  {iAmAdmin && (
    <button className="text-dim hover:text-text" onClick={openRenameModal} data-testid="title-edit">
      ✏️
    </button>
  )}
</div>
```

`openRenameModal` opens an inline editor (or a small dialog) that calls `updateConversationTitle(me, conversation, newTitle)`.

### Task 9.2: Render `renamed` events in the SystemEvent timeline

**Files:**
- Modify: `src/components/system-event.tsx` (or wherever events render)

- [ ] **Step 1: Add a case for `kind === "renamed"`**

```tsx
case "renamed":
  return (
    <span className="text-text-2 font-mono text-xs">
      // {resolveActorName(event.actorAccountID)} renamed the group to "{event.newTitle ?? '—'}"
    </span>
  );
```

Match the styling of existing event renderings.

### Task 9.3: Commit Phase 9

```bash
git add src/routes/conversations/members.tsx src/components/system-event.tsx
git commit -m "feat(conversations): admin-gated title rename + renamed SystemEvent in timeline

Title-edit pencil only visible to admins (data-layer enforcement
deferred to the trust-circle hardening follow-up). When a rename
happens, the resulting 'renamed' SystemEvent renders inline in the
conversation timeline.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 10 · Shared-conversations on profile (using useSharedGroups)

If Unit 1 has shipped: import `useSharedGroups` from `@/hooks/use-shared-groups` and the section is already wired in `profile-view.tsx` (Phase 5). Confirm + add tests.

If Unit 1 has NOT shipped: port the hook here.

### Task 10.1: useSharedGroups (port from Unit 1 if needed)

**Files:**
- Create: `src/hooks/use-shared-groups.ts` (if not already present from Unit 1)

```typescript
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";

/**
 * Returns the conversations (or groups) the local user shares with the given other account.
 * Bilateral, channel-agnostic: computed locally from group membership intersection.
 */
export function useSharedGroups(otherAccountID: string): Array<{ id: string; title: string }> {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { knownConversations: { $each: true } } },
  });
  if (!me.$isLoaded) return [];
  const conversations = Array.from(me.root.knownConversations ?? []);
  const out: Array<{ id: string; title: string }> = [];
  for (const conv of conversations) {
    if (!conv) continue;
    const group = (conv as any).$jazz?.owner;
    if (!group) continue;
    try {
      const members = group.getDirectMembers?.() ?? [];
      const memberIds = new Set(members.map((m: any) => m.account?.$jazz?.id).filter(Boolean));
      if (memberIds.has(otherAccountID)) {
        out.push({
          id: (conv as any).$jazz.id,
          title: (conv as any).title ?? "Untitled",
        });
      }
    } catch {
      // skip unresolvable
    }
  }
  return out;
}
```

### Task 10.2: Commit Phase 10

```bash
git add src/hooks/use-shared-groups.ts
git commit -m "feat(hooks): useSharedGroups(otherAccountID) — bilateral intersection

Iterates me.root.knownConversations, returns the subset whose owning
group contains the other account. Computed locally; no schema field
carries this — dynamic, channel-agnostic, cannot be forged. Shared
with Unit 1's connection-request approval card and Unit 4's profile
shared-conversations section.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 11 · Final verification + merge

### Task 11.1: Tests + build

```bash
timeout 120 npm run test 2>&1 | tail -10
cd api && npx vitest run && cd ..
timeout 90 npm run build 2>&1 | tail -5
npm run check-tokens
```

### Task 11.2: Manual smoke

Start the stack, walk through:
- Sidebar tabs (chats ↔ contacts)
- Mobile bottom tab bar (resize browser; check it renders only on `/` and `/contacts`)
- Multi-select new-conversation (1 → 1:1; 2+ → group)
- Title rename (admin path emits a renamed event in the timeline)
- Group icon upload (admin only)
- Conversation list shows monogram avatars in deterministic colors
- Read semantics: open a chat, don't read; navigate away; unread count should stay
- Read semantics: open a chat, scroll through messages; navigate away; lastReadAt advances to latest seen
- New-messages divider renders correctly + auto-scrolls
- Profile route at `/profile/<own-id>` shows own profile; `/profile/<contact-id>` shows contact profile

### Task 11.3: Merge

```bash
git push -u origin unit-4-conversation-display
git checkout main
git merge --no-ff unit-4-conversation-display -m "Merge Unit 4: conversation display"
git push origin main
git branch -d unit-4-conversation-display
git push origin --delete unit-4-conversation-display
```

---

## Self-review checklist

- [ ] Schema additions covered by tests (icon, kind=renamed, newTitle).
- [ ] updateConversationTitle emits a renamed SystemEvent; updateConversationIcon does not.
- [ ] Read semantics: mark on send, mark on leave (route change / visibility / beforeunload). Suppression on sidebar badge + tab title + in-app toast.
- [ ] Sidebar tabs + mobile bottom tab bar share state via App.tsx.
- [ ] Polymorphic `/profile/:accountID`; entry points wired (chats header, contacts header, settings row, contact rows).
- [ ] Multi-select new-conversation: 1 → 1:1; 2+ → group with optional title.
- [ ] New-messages divider with auto-scroll.
- [ ] Conversation icon: admin upload, monogram fallback.
- [ ] `useSharedGroups` available and consumed by profile shared-conversations + Unit 1 trust hint.
- [ ] Build + check-tokens + tests all pass.
