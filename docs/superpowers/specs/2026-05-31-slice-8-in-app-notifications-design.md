# Slice 8 — In-App Notifications Design

**Goal.** Give the user real-time indication that new messages have arrived in their conversations — in the sidebar, in the browser tab title, optionally as a sound, and optionally as a foreground OS notification when the tab is hidden. The slice covers ONLY notifications that fire while the app is open in some tab; closed-app push notifications via Web Push are deferred to NOX-30.

**Scope.** Small slice, ~1.5 days. Two phases. UI work on top of the existing Jazz sync data flow — no new server, no new dependencies, no protocol decisions.

**Tech stack additions.** None. Uses only browser-native APIs (`Notification`, `Audio`, `document.title`, `visibilitychange`).

**Closes:** none of the current Linear backlog directly (this is a brand-new feature). One followup filed during the brainstorm: NOX-30 (closed-app push notifications, deferred).

**Deferred (explicit non-goals):**

- Closed-app push notifications (Web Push, service workers, VAPID). Architecture, threat model, and engineering cost are all worked out in NOX-30.
- Per-conversation muting.
- Do-not-disturb / quiet hours.
- @-mention elevation (no `Message.mentions` field in the schema yet).
- Rich notification body ("Alice: <preview>"). Tied to NOX-30 — the rendering path is shared.
- Read receipts visible to other users.
- Native mobile push (Capacitor/React Native).

---

## 1. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Single layer: in-app indicators driven by existing Jazz sync     │
│                                                                  │
│  Data:                                                           │
│    me.root.lastReadAt: { [conversationID]: number }              │
│    me.root.notificationPrefs: { sound: boolean, browser: boolean }│
│    — both owned by me; sync across MY devices via Jazz           │
│    — never shared with other users (no read-receipt leak)        │
│                                                                  │
│  Trigger sources (BOTH already exist in the codebase):           │
│    1. useCoState on each Conversation in knownConversations      │
│       fires when messages.length grows                           │
│    2. useConversationInboxSubscription fires when new            │
│       conversations are added (wired in App.tsx)                 │
│                                                                  │
│  UI surfaces (all derived from data above):                      │
│    • Sidebar: per-conv unread count badge + bold name            │
│    • Tab title prefix when document.hidden                       │
│    • Sound on new message (off by default, user toggle)          │
│    • Foreground Notification API popup when document.hidden      │
└──────────────────────────────────────────────────────────────────┘
```

**Zero infrastructure additions.** No PWA manifest, no service worker, no VAPID, no Web Push, no auth-server changes, no new tables.

**Trust model unchanged from Slice 7.** `lastReadAt` and `notificationPrefs` are account-owned data stored in `me.root` and sync only between the user's own devices. Other conversation members never see them.

**Existing wiring is sufficient.** `App.tsx` already calls `useConversationInboxSubscription` and resolves `knownConversations` with the messages list. When a new message arrives at a conversation the user is in, React re-renders the sidebar — this slice adds the UI components that surface the unread state, plus a thin parent component (`NotificationManager`) that drives the title/sound/notification hooks. The data plumbing requires no changes.

---

## 2. Data model

### 2.1 Schema additions on `JazzMessangerRoot`

`src/jazz/schema/JazzMessangerAccount.ts` — the root map gains two fields:

```ts
lastReadAt: co.map(z.number()),
notificationPrefs: co.map({
  sound: z.boolean(),
  browser: z.boolean(),
}),
```

`lastReadAt` keys are conversation IDs (strings), values are millisecond timestamps. Jazz `CoMap<string, number>`. Writes via `me.root.lastReadAt.$jazz.set(convID, Date.now())` per NOX-13.

`notificationPrefs` defaults: `{ sound: false, browser: false }`. Writes via `me.root.notificationPrefs.$jazz.set("sound", true)`.

### 2.2 Migration

The schema's `withMigration` hook initializes both fields as empty / default-valued maps on first load for accounts that don't have them. New accounts get them at sign-up via the same migration. No data backfill needed — an absent `lastReadAt` entry for a conversation means "never opened," which the unread derivation treats as "everything unread."

### 2.3 `getUnreadCount(conversation, lastReadAt, myAccountID)`

New helper in `src/jazz/notifications.ts`:

```ts
export function getUnreadCount(
  conversation: Conversation,
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
```

Edge cases handled:

- Empty `messages` → 0
- Missing `lastReadAt` entry → cutoff = 0 → everything counts
- Your own messages don't count toward your unread
- `m.sentAt` may be Date or string depending on cojson serialization — coerce defensively
- Slice 4 `SystemEvents` are stored separately on `conversation.systemEvents` — membership-change events do NOT bump unread count

### 2.4 `markRead(me, conversationID)`

```ts
export function markRead(
  me: JazzMessangerAccount,
  conversationID: string,
): void {
  if (!me?.root?.lastReadAt) return;
  // Clock-skew defense: always advance past the newest known message
  // so a slow local clock doesn't leave items marked unread.
  const conv = (me.root.knownConversations ?? []).find(
    (c: any) => c?.$jazz?.id === conversationID,
  );
  const latestSentAt = conv?.messages?.length
    ? Math.max(...conv.messages.map((m: any) => {
        const t = m?.sentAt;
        return t instanceof Date ? t.getTime() : new Date(t ?? 0).getTime();
      }))
    : 0;
  const cutoff = Math.max(Date.now(), latestSentAt + 1);
  me.root.lastReadAt.$jazz.set(conversationID, cutoff);
}
```

Called from `ConversationDetailRoute` in a `useEffect` that fires when:

- The conversation first mounts and is loaded
- The conversation's `messages.length` grows AND the route is currently active

The "currently active" guard means the `useEffect` runs only on the foreground route (handled implicitly because the route component is only mounted when its URL is active).

### 2.5 Trade-off flagged

`lastReadAt` is a flat `co.map(z.number())`. Grows once per conversation the user has ever opened. For a small-trust-circle messenger (Vision X ≤ 50-person groups, dozens of conversations per user typically), this is fine indefinitely. Jazz CoMaps handle thousands of keys cleanly; no GC needed at this scale.

---

## 3. UI surfaces

### 3.1 Sidebar badges (`src/components/sidebar.tsx`)

Per-row, render a badge if `getUnreadCount > 0`. Existing markup gets two additions:

```tsx
const unread = getUnreadCount(c.conversation, lastReadAt?.[c.conversation.$jazz.id], myID);

<Link
  to={`/conversations/${c.conversation.$jazz.id}`}
  className={`block p-2 hover:bg-accent rounded text-sm flex items-center justify-between ${
    unread > 0 ? "font-semibold" : ""
  }`}
  data-testid={`conversation-row-${i}`}
>
  <span className="truncate">{label}</span>
  {unread > 0 && (
    <span
      data-testid={`unread-badge-${i}`}
      className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-600 text-white"
    >
      {unread > 99 ? "99+" : unread}
    </span>
  )}
</Link>
```

`lastReadAt` comes from deepening the existing `me` resolve in sidebar: `root: { ..., lastReadAt: true }`.

**Sort impact:** sidebar already sorts by `lastMsg.sentAt desc`, so conversations with new activity naturally float to the top. No additional unread-first re-sort.

### 3.2 Tab title prefix (`src/hooks/useTabTitleBadge.ts`)

```ts
export function useTabTitleBadge(totalUnread: number, baseTitle = "Jazz Messanger") {
  useEffect(() => {
    const sync = () => {
      if (document.hidden && totalUnread > 0) {
        document.title = `(${totalUnread > 99 ? "99+" : totalUnread}) ${baseTitle}`;
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

Called once in `App.tsx` (or in the `NotificationManager` sub-component, which is the cleaner home). Total unread aggregated as `Array.from(knownConversations).reduce(...)`.

### 3.3 Sound on new message

When `useNewMessageEvents` invokes the `onNewMessage` callback (see §3.5), the `NotificationManager` plays a short audio cue — gated on the `notificationPrefs.sound` toggle AND `document.hidden`. The "hidden" guard prevents constant pings while the user is actively looking at the app.

**Asset:** `public/notification.mp3`, a ~200ms soft tone, ~5 KB. Source from <https://notificationsounds.com> (CC-licensed) or generate with `ffmpeg`.

**Autoplay policy:** browsers block audio until user interaction. By the time any notification fires, the user has signed in (interaction satisfied). `.catch(() => {})` swallows residual failures.

**User toggle:** `me.root.notificationPrefs.sound`. Per-account, syncs across devices.

### 3.4 Foreground browser notification

When `useNewMessageEvents` invokes `onNewMessage`, the `NotificationManager` shows an OS notification via `new Notification(...)` — gated on `notificationPrefs.browser` AND `Notification.permission === "granted"` AND `document.hidden`. The OS-level `tag` field collapses repeated notifications for the same conversation into a single visible notification.

```ts
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
```

**Notification body deliberately content-blind** ("New message in <conversation name>", not sender or preview) to stay symmetric with NOX-30 when it ships. Users see consistent UX whether the app is open or closed.

### 3.5 `useNewMessageEvents` (`src/hooks/useNewMessageEvents.ts`)

The diff tracker that fans out events to the sound and foreground-notification hooks. Maintains a per-conversation `messageCount` snapshot across renders. When a conversation's `messageCount` grows AND its `getUnreadCount` is > 0, invokes the consumer-supplied `onNewMessage` callback exactly once per detected arrival.

Callback-based API:

```ts
export function useNewMessageEvents(args: {
  conversations: Array<{ id: string; label: string; messageCount: number; unread: number }>;
  onNewMessage: (event: { conversationID: string; conversationLabel: string }) => void;
}): void;
```

**Why callback-based and not array-return:** React StrictMode double-invokes effects in dev, and any "return new events array each render" pattern needs careful referential-stability work to avoid firing twice (StrictMode) or missing fires (when the array reference happens to stay stable). A callback that fires from inside a `useEffect` whose comparison key is the per-conversation `messageCount` map keeps the contract tight: each detected arrival → one callback invocation. The implementer should diff inside a `useEffect`, not during render.

Consumers wire it up at the `NotificationManager` level:

```ts
function NotificationManager({ me, conversations }: Props) {
  const soundEnabled = me.root.notificationPrefs?.sound ?? false;
  const browserEnabled = me.root.notificationPrefs?.browser ?? false;

  const playSound = useCallback(() => {
    if (!soundEnabled || !document.hidden) return;
    void new Audio("/notification.mp3").play().catch(() => {});
  }, [soundEnabled]);

  const showNotification = useCallback((event: { conversationID: string; conversationLabel: string }) => {
    if (!browserEnabled || Notification.permission !== "granted") return;
    if (!document.hidden) return;
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
  }, [browserEnabled]);

  useNewMessageEvents({
    conversations,
    onNewMessage: (event) => {
      playSound();
      showNotification(event);
    },
  });

  useTabTitleBadge(totalUnread);
  return null;
}
```

The sound and browser-notification logic from §3.3 and §3.4 are inlined directly into `NotificationManager`'s `onNewMessage` callback rather than living as separate `useMessageSound` / `useForegroundNotifications` hooks. Tests cover the wiring at the `NotificationManager` level (see §6.1).

### 3.6 Settings — notifications section (`src/routes/settings/notifications-section.tsx`)

A new section in the existing settings page:

```
Notifications
─────────────
[ ] Play sound when new messages arrive  (default: off)

Browser notifications:  ⚪ Not enabled
[ Enable browser notifications ]   ← triggers Notification.requestPermission()
                                     when clicked

Once enabled, you'll see system notifications when a new message
arrives in a conversation while this tab is hidden.
```

State stored in `me.root.notificationPrefs`. The "browser" flag is independent of OS permission state — even if the OS says "granted," the user can toggle our app's use of it off without revoking OS-level permission.

**Permission flow:**

1. User clicks "Enable browser notifications"
2. App calls `Notification.requestPermission()`
3. Browser shows the OS prompt
4. On `"granted"`: set `me.root.notificationPrefs.browser = true`
5. On `"denied"`: show inline message "Notifications blocked at the browser level. Re-enable in your browser settings, then try again."
6. On `"default"` (user dismissed prompt): no state change, button stays clickable

Effective state shown in the toggle row: `Notification.permission === "granted" && me.root.notificationPrefs.browser`.

### 3.7 Routing into the right place

`App.tsx` is the only place all three reactive inputs converge:

- `me.root.knownConversations` (loaded with messages)
- `me.root.lastReadAt`
- `me.root.notificationPrefs`

The two hooks (`useTabTitleBadge`, `useNewMessageEvents`) plus inlined sound / browser-notification fanout all live in a thin `<NotificationManager />` sub-component mounted in `App.tsx`. This keeps `App.tsx` itself tidy and gives the notification stack a single home that can be unit-tested in isolation.

---

## 4. Failure modes & edge cases

| Failure | Handling |
|---|---|
| `me.root.lastReadAt` undefined (fresh account, pre-migration) | `getUnreadCount` treats missing entry as cutoff = 0 → counts all messages. Self-resolves on first `markRead`. |
| Two devices `markRead` same conversation simultaneously | Jazz CoMap `$jazz.set` is last-write-wins per key. Both converge within a sync round-trip. Harmless. |
| Clock skew between devices | `markRead` writes `Math.max(Date.now(), latestSeenMessageSentAt + 1)`. Cutoff always advances past visible messages even if local clock is behind sender. |
| `Notification.permission === "denied"` | Settings button stays clickable; click shows inline "blocked, re-enable in browser settings" message. No re-request (browsers silently ignore re-requests after denial within a session). |
| Pref `browser=true` but OS permission `"default"` | Toggle handler always calls `requestPermission()` first; only flips the pref to `true` if user grants. Persisted state never goes "true with no permission." |
| Conversation loaded but messages not yet resolved | `getUnreadCount` returns 0 for null/undefined messages. Badge appears once messages load. |
| User opens conversation, loses focus before reading | `markRead` fires on mount + on messages-grow regardless of focus. Eye-tracking is out of scope (and ethically questionable). |
| Foreground notification fires for active conversation | `document.hidden` guard suppresses it. Tab visible → no notification. |
| Repeat notifications for the same conversation | `tag: "conv-<id>"` collapses them at the OS level — one visible notification per conversation regardless of how many messages. |
| Audio fails (autoplay policy) | `.catch(() => {})` drops silently. Next message succeeds after user interaction. |
| `Notification` API unavailable (old browser / insecure context) | Settings toggle disables itself with inline "not available in this environment" message. Sidebar badges + tab title still work. |
| User has 0 conversations | All hooks short-circuit. Total unread = 0, tab title plain, no events to fire. |
| System events bumping unread? | Explicitly NOT counted. Joining a group doesn't show a badge for the conversation. If desired later, one-line change to add `conversation.systemEvents` filtering. |

**Deliberate scope cuts (not failures):**

- No do-not-disturb / quiet hours. Users rely on OS-level DND or manual settings toggle.
- No per-conversation muting. Easy follow-up if needed.
- No @-mention elevation. Blocked on a `Message.mentions` schema field that doesn't exist yet.

---

## 5. Threat model

The slice is data-additive only — no new server, no new endpoints, no new client→server traffic, no third-party services. The Slice 7 threat model is unchanged.

The two new fields (`lastReadAt`, `notificationPrefs`) sit inside the existing `me.root` envelope, which is encrypted under the user's Jazz keys and synced only between the user's own devices. From the Jazz sync server's perspective, they're additional opaque bytes inside the existing CoValue stream.

**What this slice does NOT add to the server's knowledge:**

- Whether you've read any particular message
- When you most recently opened a conversation
- Whether you've enabled sound or browser notifications
- Anything about your conversation activity beyond what Slice 1-7 already required to deliver messages

**One small risk worth naming:** the foreground `Notification` API itself, when used, surfaces text to the OS notification surface. On a shared device, anyone with screen access could see "New message in <conversation name>" briefly. The conversation name is what other users in that conversation already see, so this isn't a leak beyond existing exposure. If a user wants to hide even conversation names from a shared screen, they can disable browser notifications entirely (settings toggle).

---

## 6. Testing strategy

### 6.1 Client unit tests (`tests/unit/`, Vitest)

| File | What it covers |
|---|---|
| `tests/unit/jazz/notifications.test.ts` | `getUnreadCount`: empty messages → 0; no `lastReadAt` entry → counts all foreign messages; mine excluded; cutoff = newest → 0. `markRead`: writes `max(now, latestSeen + 1)` even with stale clock; no-op when `me.root.lastReadAt` missing. |
| `tests/unit/hooks/useTabTitleBadge.test.ts` | Mutate `totalUnread`, fire `visibilitychange`. Assert `document.title` matches `(N) Jazz Messanger` when hidden + unread > 0, plain otherwise. Cleanup restores plain title on unmount. |
| `tests/unit/hooks/useNewMessageEvents.test.ts` | First render: baseline established, callback NOT called. Second render with grown messageCount + unread > 0 → callback called exactly once. Same conversation growing again → callback called again. Conversation with grown count but unread = 0 → callback NOT called. StrictMode double-render does NOT cause duplicate callback invocations (diff happens in effect, not render). |
| `tests/unit/components/notification-manager.test.ts` | Mount `<NotificationManager />` with a mock `useNewMessageEvents` that triggers `onNewMessage`. Assert: when `document.hidden` AND `prefs.sound` AND increment, `Audio.prototype.play` is called (mocked). When `document.hidden` AND `prefs.browser` AND `Notification.permission === "granted"`, `new Notification(...)` is called with right title/body/tag (mocked global `Notification`). Negative cases: no `document.hidden`, no permission, no pref → nothing fires. |

Roughly +20 tests. All pure or DOM-only.

### 6.2 E2E tests (`tests/e2e/`, Playwright)

| File | What it covers |
|---|---|
| `tests/e2e/unread-badges.spec.ts` | Two-context: Alice + Bob pair, Alice sends 3 messages, Bob's sidebar shows badge `3` + bold. Bob opens conversation → badge clears, row un-bolds, persists across reload (lastReadAt synced). |
| `tests/e2e/unread-cross-device.spec.ts` | Same account in two contexts. Receive message in A, open conversation in A, assert B's sidebar updates (badge clears) within sync round-trip. |
| `tests/e2e/tab-title-badge.spec.ts` | Force `document.hidden=true` via override. Receive 2 messages, assert `page.title()` matches `(2) Jazz Messanger`. Revert hidden + open conversation → title resets. |
| `tests/e2e/notification-permission.spec.ts` | Context A with `permissions: ["notifications"]` (granted): toggle "Enable" → `notificationPrefs.browser` flips true, toggle reflects "Enabled". Context B with denied permission: clicking "Enable" → inline error visible. |

Roughly +4 specs. Sound and OS-level notification rendering are NOT e2e-tested — Playwright can't reliably reach those subsystems. Their hook-level behavior is unit-tested; rendering is tested manually (see 6.4).

### 6.3 What is explicitly NOT tested

- OS notification rendering itself (browser/OS internal)
- Sound playback fidelity (only that `play()` was called)
- Behavior when page is genuinely OS-backgrounded (Playwright runs headed pages; `document.hidden` is forced via overrides)
- Real cross-device clock skew (logic is unit-tested with mocked time)

### 6.4 Manual verification checklist (added to CHANGELOG)

1. Send a message from a second browser context → OS notification appears
2. Click that notification → main window focuses + navigates to the conversation
3. cmd-tab away from the tab → next message bumps tab title; refocus → title resets
4. Toggle sound off, send another message → no audio plays
5. Toggle browser-notifications off (without changing OS permission) → no OS notifications until re-toggled

---

## 7. Module structure

```
src/
├── jazz/
│   ├── notifications.ts             ← NEW: getUnreadCount, markRead
│   └── schema/
│       └── JazzMessangerAccount.ts  ← MODIFIED: add lastReadAt + notificationPrefs
│
├── hooks/
│   ├── useTabTitleBadge.ts          ← NEW
│   └── useNewMessageEvents.ts       ← NEW (callback-based diff tracker)
│
├── components/
│   ├── sidebar.tsx                  ← MODIFIED: unread badge + bold class
│   └── notification-manager.tsx     ← NEW: calls useTabTitleBadge +
│                                       useNewMessageEvents, inlines the
│                                       sound + browser-notification fanout
│                                       in the onNewMessage callback
│
├── routes/
│   ├── settings/
│   │   ├── index.tsx                ← MODIFIED: render <NotificationsSection />
│   │   └── notifications-section.tsx ← NEW
│   └── conversations/
│       └── detail.tsx               ← MODIFIED: useEffect for markRead
│
└── App.tsx                          ← MODIFIED: mount <NotificationManager />,
                                       deepen me resolve to include lastReadAt
                                       + notificationPrefs

public/
└── notification.mp3                 ← NEW asset (~5 KB)

tests/
├── unit/
│   ├── jazz/notifications.test.ts
│   ├── hooks/{useTabTitleBadge,useNewMessageEvents}.test.ts
│   └── components/notification-manager.test.ts
└── e2e/
    ├── unread-badges.spec.ts
    ├── unread-cross-device.spec.ts
    ├── tab-title-badge.spec.ts
    └── notification-permission.spec.ts

CHANGELOG.md                         ← MODIFIED: Slice 8 entry + manual checklist
```

**No changes:** `auth-server/`, `deploy/`, `tests/e2e/helpers.ts`, Vite/Playwright/Tailwind config. Smallest blast radius since Slice 3c.

---

## 8. Phasing

Two phases consistent with Slices 4-7. Each is a single subagent dispatch.

### Phase A — Data + pure logic (foundation)

- `JazzMessangerAccount.ts` schema additions (`lastReadAt`, `notificationPrefs`) + `withMigration` initialization
- `src/jazz/notifications.ts` (`getUnreadCount`, `markRead`) + unit tests
- `src/hooks/useNewMessageEvents.ts` (diff tracker) + unit test

Ships in isolation. Nothing user-visible, but tests prove the pure logic works.

### Phase B — UI surfaces + settings + e2e

- Sidebar badge/bold rendering
- `<NotificationManager />` + two hooks (`useTabTitleBadge`, `useNewMessageEvents`); sound + browser-notification fanout inlined in `onNewMessage`
- `notifications-section.tsx` settings UI + permission flow
- `conversations/detail.tsx` markRead useEffect
- `public/notification.mp3` asset
- 4 e2e specs
- CHANGELOG with manual-verification checklist

Smaller than Slice 7 Phase B/C combined — no server, no auth touchpoint, no e2e helper migration.

---

## 9. Out of scope / future work

| Item | Where it lives |
|---|---|
| Closed-app push notifications (Web Push + SW + VAPID) | **NOX-30** (full architecture, two outstanding decisions, cost estimate ~1 week) |
| Per-conversation muting | Not filed |
| Do-not-disturb / quiet hours | Not filed |
| @-mention elevation | Blocked on `Message.mentions` schema (not in current Vision X spec) |
| Rich notification body ("Alice: <preview>") | Tied to NOX-30 — rendering path shared |
| Read receipts visible to other users | Not filed; deliberate omission per Vision X privacy model |
| Native mobile push (Capacitor/React Native) | Out of scope long-term per notification brainstorm Q1 |
