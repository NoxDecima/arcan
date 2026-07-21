# Contact & Connection Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Amendment (2026-07-21, Task 5 review):** Three review fixes landed that later tasks (6, 8, 9, 14) must build on — do NOT copy the pre-fix patterns:
>
> - **C1 (Critical) — foreign-account fingerprint derivation.** `getAccountPubkeyHex` is NODE-derived (`localNode.getCurrentAgent().currentSignerID()`): on a foreign account loaded `loadAs: me` it returns MY pubkey. `src/auth/pubkey.ts` now has `getForeignAccountPubkeyHex(account)` (target-derived via `account.$jazz.raw.currentAgentID()` + `crypto.getAgentSignerID`), used by `requestConnectionFromGroupMember` and the profile-view fallback. **Task 6's watcher must rely on `counterpartFingerprint` snapshots produced by the FIXED helper** — any group-channel `outgoingRequests` entries created before this fix carry the requester's own fingerprint and must not be trusted as TOFU pins. Never call `getAccountPubkeyHex` on a non-`me` account.
> - **I1 (Important) — present-but-unloaded guard in `sendConnectionRequest`.** Before the already-pending read, `outgoing.$jazz.has(id)` true + null proxy read → `{ outcome: "unavailable" }` (mirrors the `upsertContact` guard; never re-point a record key at a fresh entry while the existing one is unloaded).
> - **I2 (Important) — honest outcome→toast mapping in members.tsx.** `"sent"` is matched explicitly for the success toast; `"unavailable"` (and any unmatched outcome) gets an error-tone "couldn't send — still syncing, try again". Task 9's pending-aware button work must keep this mapping — never let an unmatched outcome fall through to a success toast.

> **Amendment (2026-07-21, Task 6 review):** watcher-style deep resolves must include `$onError: "catch"` at `$each` levels (one bad child otherwise stalls the hook — applies to the pendingNotifications retry hook in Task 11); approve-archival is gated on the upsert result via `resolveApproveOutcome` (unavailable → retry, never archive-without-contact); delivery-ack handlers re-check `archivedAt` after awaits.

> **Amendment (2026-07-21, Task 7 review):** inbox drains must not subscribe before their persistence target exists (consuming marks processed — silent loss); the 2j backfill tolerates unavailable legacy requests via $onError (requests expire; TOFU pins in 2i deliberately do not); approve/deny act on the entire collapsed same-requester group; deep resolves of contacts in App.tsx carry $onError: "catch".

> **Amendment (2026-07-21, FM4-debugging addendum):** two hazards fixed post-Task-14. (1) *Shared processed feed:* jazz-tools `Inbox.subscribe` consumers share ONE processed feed and each receives EVERY message regardless of schema — with two app subscriptions, the conversation drain could consume-and-mark-processed a replayed ConnectionRequest during the connection drain's mount/record-wait gap (sender acked, recipient never persisted — permanent silent loss). Both drains are now handler functions (`handleConversationNotification`, `handleIncomingConnectionRequest`) routed to by the single `useInboxDispatcher` (`src/jazz/use-inbox-dispatcher.ts`), which routes by RAW payload shape (`$jazz.raw.get` — schema proxies hide foreign fields) and extends the Task 7 gate to BOTH persistence targets (`knownConversations` AND `incomingConnectionRequests` must exist before subscribing — consuming marks processed for every payload kind at once). There must never be a second `inbox.subscribe` in the app. (2) *Approver-side silent loss:* `approveConnectionRequest` now runs `upsertContact` FIRST and refuses to stamp `approvedAt` (or touch same-requester dupes) on an "unavailable" upsert, returning `"unavailable"`/`"malformed"`/`"approved"`; all three approve surfaces map outcomes honestly (success toast ONLY on `"approved"`, retry toast on `"unavailable"`) — never stamp what you couldn't write, never toast what you didn't do.

**Goal:** Align every contact/connection handshake to the Jazz convergence canon: duplicate-sensitive facts move from CoLists to keyed `co.record`s, outbound requests become durable account state watched by an app-level hook (killing the tab-lifetime approval poll), sends await end-to-end acks, and existing damage gets a visible (never silent) repair affordance. Closes FM1–FM4, FM7–FM10 from the investigation.

**Architecture:** A new `src/jazz/handshake.ts` module owns the contact fact (`upsertContact` — the only contact writer, TOFU-aware), the single request-creation path (`sendConnectionRequest`, both invite + group channels), and an app-level `useOutgoingRequestWatcher` mounted in `App.tsx` beside the existing inbox drains. The account root gains keyed-record replacements for the fragile CoLists under **new field names** (in-place `co.list`→`co.record` conversion is unsafe in jazz-tools 0.20.18 — see "Migration strategy" below), backfilled by the existing per-field-guard migration in `ArcanAccount.ts`.

**Tech Stack:** TypeScript strict, React 19, jazz-tools 0.20.18 (Zod-based functional schema API: `co.map`/`co.list`/`co.record`), Vitest (`tests/unit/`), Playwright (`tests/e2e/`).

## Migration strategy (locked — resolved by reading code)

- **How the existing migration gates:** `ArcanAccount.ts` `withMigration` runs on **every node startup**; there is **no version number**. Each addition is an independent idempotent backfill gated by field absence (`me.root && !(me.root as any).fieldName && typeof (me.root as any).$jazz?.set === "function"`). New fields follow this exact pattern.
- **Why NOT in-place `co.list` → `co.record` on the same field name:** the root CoMap stores a **ref to an existing CoValue** per field. Existing accounts have a raw CoList at `contactBook`/`incomingRequests`/`dismissedRequestIDs`; redeclaring the field as `co.record` would make the schema wrap that raw CoList as a CoMap — jazz-api-notes documents no support for changing a ref's CoValue class in place, and `ArcanAccount.ts:40-46` records that even making a field *required* broke existing accounts at resolve time. **Locked: new field names, `.optional()`, migration backfill copies + dedups old → new.** Old list fields stay in the schema (writes frozen, reads only inside the migration backfill) and are removed in a later slice once all devices have migrated.
- **New/renamed root fields** (all `.optional()` per the `lastReadAt` lesson):
  - `contacts: co.record(z.string(), Contact)` — key = contact's account ID (replaces `contactBook`)
  - `incomingConnectionRequests: co.record(z.string(), ConnectionRequest)` — key = request CoValue ID (replaces `incomingRequests`)
  - `outgoingRequests: co.record(z.string(), OutgoingConnectionRequest)` — key = counterpart account ID (NEW)
  - `dismissedRequests: co.record(z.string(), z.boolean())` — key = request CoValue ID (replaces `dismissedRequestIDs`)
  - `pendingNotifications: co.record(z.string(), PendingNotification)` — key = `${conversationID}:${accountID}` (NEW)
  - `invitesIssued` — **removed** from schema + migration (dead field, zero readers/writers; stale raw key on old accounts is harmless because the schema no longer declares it)
- **Account IDs for keying:** `me.$jazz.id` for self; `request.requesterAccountID` / `invitation.inviterAccountID` fields for counterparts (verified in schema reads below); contact key = `contact.contactAccountID`.

## File Structure

| Path | Change |
|---|---|
| `src/jazz/schema/ArcanAccount.ts` | New keyed-record root fields, backfill migration, `invitesIssued` removal |
| `src/jazz/schema/Contact.ts` | `fingerprintConflict` + `conflictingFingerprint` optional fields |
| `src/jazz/schema/OutgoingConnectionRequest.ts` | NEW — durable outbound-request entry |
| `src/jazz/schema/PendingNotification.ts` | NEW — outbound notification retry state |
| `src/jazz/handshake.ts` | NEW — `upsertContact`, `sendConnectionRequest`, `useOutgoingRequestWatcher`, `useNotificationRetry`, `pruneHandshakeState` |
| `src/jazz/invitations.ts` | Approve path via `upsertContact`; keyed dismissed/incoming writes |
| `src/jazz/use-incoming-connection-requests.ts` | Drain writes keyed record; per-requester render collapse |
| `src/jazz/conversation.ts` | Notification-send discipline; system-event membership pre-check; group connect via `sendConnectionRequest` |
| `src/jazz/notifications.ts` | Remove orphaned `markRead` self-heal |
| `src/App.tsx` | Mount `useOutgoingRequestWatcher` + `useNotificationRetry` |
| `src/routes/invite/index.tsx` | Already-contacts/pending states, re-validation at Connect, watcher-driven sent screen, poll removed |
| `src/routes/contacts/add.tsx` | Lazy invitation mint on first reveal/share |
| `src/routes/conversations/members.tsx` | Pending-aware connect button |
| `src/components/profile-view.tsx` | Add-to-contacts affordance; TOFU-conflict surfacing |
| `tests/unit/handshake.spec.ts` (via vitest include) | upsertContact, watcher transitions, migration dedup fixtures |
| `tests/e2e/…` | New robustness specs + existing suite updates |

## Design decisions already locked (do not relitigate)

From the spec's decisions log (`docs/superpowers/specs/2026-07-20-contact-robustness-design.md`):

- Scope: FULL robustness slice (all FM1–FM10 + inventory extensions).
- Mechanism: **approval watcher over durable `outgoingRequests`** (rejected: approver-side push — version-coupled; rejected: both — redundant paths).
- Overarching: align to Jazz canon app-wide now (Option A); pair-group authority later (Option B, Unit 6); no server arbiter (Option C — threat-model regression).
- Repair of missing contacts: **visible affordance, never silent re-TOFU**. TOFU conflicts keep the OLD pin + set a conflict flag.
- Out of scope: device-pairing polls (ephemeral by design; only list pruning); email+password device-gate bypass (Unit 6); frozen display names (separate brainstorm); FM5/FM6 stub-path behavior (kept; Bundle-F brainstorm).
- Request expiry: `max(invitationExpiry, sentAt + 7 days)`.
- Historical outbound requests unrecoverable — accepted.

---

## Task 1: New schemas + Contact conflict fields + root record fields

The schema layer first: two new CoValue schemas, the Contact conflict flags, five new optional root fields, and the `invitesIssued` removal. No behavior changes yet — every existing reader/writer keeps working against the old list fields, so the branch stays green.

- [ ] Create `src/jazz/schema/OutgoingConnectionRequest.ts`:

```ts
import { co, z } from "jazz-tools";
import { ConnectionRequest } from "./ConnectionRequest";

/**
 * OutgoingConnectionRequest: durable record of a connection request THIS
 * account sent (contact-robustness slice, FM1/FM3/FM4). Lives in
 * me.root.outgoingRequests, a co.record keyed by counterpart account ID —
 * per-key LWW makes "one pending request per counterpart" structural.
 *
 * The counterpart identity (fingerprint + display name) is snapshotted at
 * send time — from the Invitation (invite channel) or the co-member's live
 * profile + pubkey (group channel) — because the ConnectionRequest CoValue
 * only carries the REQUESTER's identity, and the approval watcher needs the
 * counterpart's identity to write the Contact after approval (TOFU pin at
 * request time, per threat model §6).
 *
 * status lifecycle: pending → approved | denied | expired (terminal), or
 * pending → failed → pending (watcher re-send). archivedAt hides the entry
 * from active watching once terminal.
 */
export const OutgoingConnectionRequest = co.map({
  request: ConnectionRequest,
  counterpartAccountID: z.string(),
  counterpartFingerprint: z.string(),
  counterpartDisplayName: z.string(),
  channel: z.enum(["invite", "group"]),
  sentAt: z.date(),
  // Set when the Inbox end-to-end ack resolved ("delivered" UI state).
  deliveredAt: z.date().optional(),
  status: z.enum(["pending", "approved", "denied", "failed", "expired"]),
  archivedAt: z.date().optional(),
});
```

- [ ] Create `src/jazz/schema/PendingNotification.ts`:

```ts
import { co, z } from "jazz-tools";
import { Conversation } from "./Conversation";

/**
 * PendingNotification: durable retry state for an outbound conversation /
 * member-add inbox notification (contact-robustness slice, §4). Lives in
 * me.root.pendingNotifications, a co.record keyed by
 * `${conversationID}:${targetAccountID}` — an entry exists only while the
 * notification is unacked; it is deleted from the record on ack.
 */
export const PendingNotification = co.map({
  conversation: Conversation,
  targetAccountID: z.string(),
  kind: z.enum(["conversation", "member-add"]),
  createdAt: z.date(),
  attempts: z.number(),
  lastAttemptAt: z.date().optional(),
});
```

- [ ] Edit `src/jazz/schema/Contact.ts` — add the TOFU-conflict fields to the `Contact` map (after `notes`):

```ts
export const Contact = co.map({
  contactAccountID: z.string(),
  pinnedFingerprint: z.string(),
  displayNameLocal: z.string(),
  addedAt: z.date(),
  notes: z.string().optional(),
  // Contact-robustness slice: set (never cleared automatically) when an
  // upsert or the list→record migration observed a fingerprint that differs
  // from pinnedFingerprint. The OLD pin is always kept (TOFU, threat model
  // §6); the profile safety-number section surfaces "identity key changed —
  // verify". conflictingFingerprint records the most recent differing value.
  fingerprintConflict: z.boolean().optional(),
  conflictingFingerprint: z.string().optional(),
  // linkedConversation REMOVED — discovery now uses
  // me.root.knownConversations (Slice 3b spec §5).
});
```

  (Keep the existing file header comments and the `ContactBook = co.list(Contact)` export — the legacy list field still references it.)

- [ ] Edit `src/jazz/schema/ArcanAccount.ts` — in `ArcanAccountRoot`, add the five new fields at the end of the map (all `.optional()` — required refs break resolve for pre-existing accounts, see the `lastReadAt` comment at the top of the map), and delete the `invitesIssued: co.list(Invitation),` line:

```ts
  // ── Contact-robustness slice (2026-07-20) ──────────────────────────────
  // Keyed-record replacements for the fragile CoLists (Jazz canon: duplicate-
  // sensitive facts live in co.records — per-key LWW instead of concurrent-
  // append duplication). NEW FIELD NAMES, not in-place list→record changes:
  // the old fields' refs point at raw CoLists that a co.record schema cannot
  // wrap. Old fields stay (write-frozen) for the migration backfill to read;
  // removal is a later slice. All optional per the lastReadAt lesson above.
  //
  // contacts — THE contact book. Key: contact's account ID.
  contacts: co.record(z.string(), Contact).optional(),
  // incomingConnectionRequests — durable drain target. Key: request CoValue ID
  // (same-key writes from racing drains converge instead of duplicating, FM2).
  incomingConnectionRequests: co.record(z.string(), ConnectionRequest).optional(),
  // outgoingRequests — durable outbound-request memory (FM1/FM3/FM4).
  // Key: counterpart account ID.
  outgoingRequests: co.record(z.string(), OutgoingConnectionRequest).optional(),
  // dismissedRequests — replaces dismissedRequestIDs. Key: request CoValue ID.
  dismissedRequests: co.record(z.string(), z.boolean()).optional(),
  // pendingNotifications — outbound conversation/member-add notification retry
  // state. Key: `${conversationID}:${targetAccountID}`.
  pendingNotifications: co.record(z.string(), PendingNotification).optional(),
```

  Add the imports at the top of the file:

```ts
import { Contact, ContactBook } from "./Contact";
import { OutgoingConnectionRequest } from "./OutgoingConnectionRequest";
import { PendingNotification } from "./PendingNotification";
```

  (`ContactBook` was previously the only import from `./Contact`; `Contact` is now needed for the record definer. Keep the `Invitation` import — `liveInvitations` still uses it.)

- [ ] Edit `src/jazz/schema/ArcanAccount.ts` — in the root-init branch (`if (!me.$jazz.has("root"))`), delete the `const invitesIssued = co.list(Invitation).create([], { owner: me });` line and the `invitesIssued,` key in the `ArcanAccountRoot.create({...})` call, and add creation of the five new records so fresh accounts start on the new shape:

```ts
    const contacts = co
      .record(z.string(), Contact)
      .create({}, { owner: me });
    const incomingConnectionRequests = co
      .record(z.string(), ConnectionRequest)
      .create({}, { owner: me });
    const outgoingRequests = co
      .record(z.string(), OutgoingConnectionRequest)
      .create({}, { owner: me });
    const dismissedRequests = co
      .record(z.string(), z.boolean())
      .create({}, { owner: me });
    const pendingNotifications = co
      .record(z.string(), PendingNotification)
      .create({}, { owner: me });
```

  and pass all five in the `ArcanAccountRoot.create` init object (alongside the existing fields, `invitesIssued` removed).

- [ ] Run `nix-shell --run 'npm run typecheck'` — expect **PASS** (no consumer imports `invitesIssued`; verified zero readers/writers in the inventory §8).
- [ ] Commit: `git add -A && git commit -m "feat(schema): keyed-record root fields for contact robustness; drop dead invitesIssued"`

## Task 2: Migration backfill (TDD on the pure dedup planner)

The list→record backfills run inside `withMigration` following the existing per-field-absence guard pattern (`ArcanAccount.ts` blocks 2b–2h). The dedup policy — latest-wins per key, EXCEPT contact fingerprint conflicts where the OLDEST pin is kept and flagged — lives in a pure, unit-tested helper. Backfills `ensureLoaded` their source list first and skip (not half-write) on failure, so an interrupted migration retries next startup (guard = new-field absence).

- [ ] Write the failing test `tests/unit/jazz/contact-migration.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import {
  planContactMigration,
  type ContactEntryView,
} from "@/jazz/contact-migration";

function entry(
  contactAccountID: string,
  pinnedFingerprint: string,
  addedAtMs: number,
  index: number,
): ContactEntryView {
  return { contactAccountID, pinnedFingerprint, addedAtMs, index };
}

describe("planContactMigration", () => {
  test("passes unique entries through keyed by account ID", () => {
    const plan = planContactMigration([
      entry("acc-a", "fp-a", 1000, 0),
      entry("acc-b", "fp-b", 2000, 1),
    ]);
    expect(plan.keepIndexByAccountID).toEqual({ "acc-a": 0, "acc-b": 1 });
    expect(plan.conflictByAccountID).toEqual({});
  });

  test("duplicate with SAME fingerprint: latest entry wins, no conflict", () => {
    const plan = planContactMigration([
      entry("acc-a", "fp-a", 1000, 0),
      entry("acc-a", "fp-a", 3000, 1),
      entry("acc-a", "fp-a", 2000, 2),
    ]);
    expect(plan.keepIndexByAccountID).toEqual({ "acc-a": 1 });
    expect(plan.conflictByAccountID).toEqual({});
  });

  test("duplicate with DIFFERENT fingerprints: OLDEST pin kept + conflict flagged (TOFU)", () => {
    const plan = planContactMigration([
      entry("acc-a", "fp-new", 5000, 0),
      entry("acc-a", "fp-old", 1000, 1),
    ]);
    expect(plan.keepIndexByAccountID).toEqual({ "acc-a": 1 });
    expect(plan.conflictByAccountID).toEqual({
      "acc-a": { observedFingerprint: "fp-new" },
    });
  });

  test("conflict records the LATEST differing fingerprint", () => {
    const plan = planContactMigration([
      entry("acc-a", "fp-old", 1000, 0),
      entry("acc-a", "fp-mid", 2000, 1),
      entry("acc-a", "fp-new", 3000, 2),
    ]);
    expect(plan.keepIndexByAccountID).toEqual({ "acc-a": 0 });
    expect(plan.conflictByAccountID).toEqual({
      "acc-a": { observedFingerprint: "fp-new" },
    });
  });

  test("same-timestamp tie: latest-wins uses highest index, oldest-pin uses lowest", () => {
    const same = planContactMigration([
      entry("acc-a", "fp-a", 1000, 0),
      entry("acc-a", "fp-a", 1000, 1),
    ]);
    expect(same.keepIndexByAccountID).toEqual({ "acc-a": 1 });
    const diff = planContactMigration([
      entry("acc-b", "fp-1", 1000, 0),
      entry("acc-b", "fp-2", 1000, 1),
    ]);
    expect(diff.keepIndexByAccountID).toEqual({ "acc-b": 0 });
    expect(diff.conflictByAccountID["acc-b"]).toEqual({
      observedFingerprint: "fp-2",
    });
  });

  test("empty input → empty plan", () => {
    const plan = planContactMigration([]);
    expect(plan.keepIndexByAccountID).toEqual({});
    expect(plan.conflictByAccountID).toEqual({});
  });
});
```

- [ ] Run `nix-shell --run 'npx vitest run tests/unit/jazz/contact-migration.test.ts'` — expect **FAIL** (module `@/jazz/contact-migration` does not exist).
- [ ] Create `src/jazz/contact-migration.ts`:

```ts
/**
 * Pure planning logic for the contactBook (CoList) → contacts (co.record)
 * migration backfill (contact-robustness slice, spec §5).
 *
 * Policy: per account ID, the LATEST entry wins (freshest displayName/notes)
 * — EXCEPT when duplicate entries disagree on pinnedFingerprint: then the
 * entry with the OLDEST pin is kept (TOFU — never upgrade a pin silently,
 * threat model §6) and the latest differing fingerprint is reported as a
 * conflict for the UI to surface.
 *
 * Pure so it is unit-testable without a Jazz runtime; ArcanAccount.ts maps
 * the returned indexes back onto the live Contact CoValues.
 */

export interface ContactEntryView {
  contactAccountID: string;
  pinnedFingerprint: string;
  addedAtMs: number;
  /** Position in the source contactBook list. */
  index: number;
}

export interface ContactMigrationPlan {
  /** accountID → index (into the input array) of the entry to keep. */
  keepIndexByAccountID: Record<string, number>;
  /** accountID → conflict info, only for fingerprint disagreements. */
  conflictByAccountID: Record<string, { observedFingerprint: string }>;
}

export function planContactMigration(
  entries: ContactEntryView[],
): ContactMigrationPlan {
  const byAccount = new Map<string, ContactEntryView[]>();
  for (const e of entries) {
    const group = byAccount.get(e.contactAccountID);
    if (group) group.push(e);
    else byAccount.set(e.contactAccountID, [e]);
  }

  const keepIndexByAccountID: Record<string, number> = {};
  const conflictByAccountID: Record<
    string,
    { observedFingerprint: string }
  > = {};

  for (const [accountID, group] of byAccount) {
    const fingerprints = new Set(group.map((e) => e.pinnedFingerprint));
    // Latest = max addedAtMs, ties broken by higher list index.
    const latest = group.reduce((a, b) =>
      b.addedAtMs > a.addedAtMs || (b.addedAtMs === a.addedAtMs && b.index > a.index)
        ? b
        : a,
    );
    if (fingerprints.size <= 1) {
      keepIndexByAccountID[accountID] = latest.index;
      continue;
    }
    // Fingerprint disagreement: keep the OLDEST pin (min addedAtMs, ties
    // broken by lower list index) and report the latest differing value.
    const oldest = group.reduce((a, b) =>
      b.addedAtMs < a.addedAtMs || (b.addedAtMs === a.addedAtMs && b.index < a.index)
        ? b
        : a,
    );
    keepIndexByAccountID[accountID] = oldest.index;
    const latestDiffering = group
      .filter((e) => e.pinnedFingerprint !== oldest.pinnedFingerprint)
      .reduce((a, b) =>
        b.addedAtMs > a.addedAtMs || (b.addedAtMs === a.addedAtMs && b.index > a.index)
          ? b
          : a,
      );
    conflictByAccountID[accountID] = {
      observedFingerprint: latestDiffering.pinnedFingerprint,
    };
  }

  return { keepIndexByAccountID, conflictByAccountID };
}
```

- [ ] Run `nix-shell --run 'npx vitest run tests/unit/jazz/contact-migration.test.ts'` — expect **PASS** (6 tests).
- [ ] Edit `src/jazz/schema/ArcanAccount.ts` — add the backfill blocks after block 2h (`incomingRequests` backfill), before block 2g (device self-register). Import `planContactMigration` from `./../contact-migration` (i.e. `import { planContactMigration } from "../contact-migration";`):

```ts
  // -- 2i. contacts (list → keyed record) backfill — contact-robustness slice.
  // Guarded by field absence like every other backfill; ensureLoaded the
  // source list first so NotLoaded proxies can't masquerade as empty data.
  // On ANY failure we skip WITHOUT setting the field — the migration reruns
  // on next startup and retries (same recovery contract as block 2g).
  // Dedup policy lives in planContactMigration (unit-tested): latest entry
  // wins per account ID, EXCEPT fingerprint conflicts where the OLDEST pin
  // is kept (TOFU) and the conflict is flagged on the kept Contact.
  if (
    me.root &&
    typeof (me.root as any).$jazz?.set === "function" &&
    !(me.root as any).contacts
  ) {
    try {
      const loaded = await me.$jazz.ensureLoaded({
        resolve: { root: { contactBook: { $each: true } } },
      });
      const entries = Array.from(
        (loaded.root as any).contactBook ?? [],
      ) as any[];
      const views = entries
        .map((c, index) => ({
          contactAccountID: c?.contactAccountID as string,
          pinnedFingerprint: c?.pinnedFingerprint as string,
          addedAtMs: c?.addedAt ? new Date(c.addedAt).getTime() : 0,
          index,
        }))
        .filter(
          (v) =>
            typeof v.contactAccountID === "string" &&
            typeof v.pinnedFingerprint === "string",
        );
      const plan = planContactMigration(views);
      const record = co
        .record(z.string(), Contact)
        .create({}, { owner: me });
      for (const [accountID, index] of Object.entries(
        plan.keepIndexByAccountID,
      )) {
        const kept = entries[index];
        const conflict = plan.conflictByAccountID[accountID];
        if (conflict && typeof kept?.$jazz?.set === "function") {
          kept.$jazz.set("fingerprintConflict", true);
          kept.$jazz.set(
            "conflictingFingerprint",
            conflict.observedFingerprint,
          );
        }
        record.$jazz.set(accountID, kept);
      }
      (me.root as any).$jazz.set("contacts", record);
    } catch (e) {
      console.warn("[migration] contacts backfill skipped (will retry):", e);
    }
  }

  // -- 2j. incomingConnectionRequests (list → keyed record) backfill.
  // Keyed by request CoValue ID — historical drain-race duplicates (FM2)
  // collapse automatically because same-key sets converge.
  if (
    me.root &&
    typeof (me.root as any).$jazz?.set === "function" &&
    !(me.root as any).incomingConnectionRequests
  ) {
    try {
      const loaded = await me.$jazz.ensureLoaded({
        resolve: { root: { incomingRequests: { $each: true } } },
      });
      const record = co
        .record(z.string(), ConnectionRequest)
        .create({}, { owner: me });
      for (const r of Array.from(
        (loaded.root as any).incomingRequests ?? [],
      ) as any[]) {
        const id = r?.$jazz?.id;
        if (typeof id === "string") record.$jazz.set(id, r);
      }
      (me.root as any).$jazz.set("incomingConnectionRequests", record);
    } catch (e) {
      console.warn(
        "[migration] incomingConnectionRequests backfill skipped (will retry):",
        e,
      );
    }
  }

  // -- 2k. dismissedRequests (string list → keyed record) backfill.
  if (
    me.root &&
    typeof (me.root as any).$jazz?.set === "function" &&
    !(me.root as any).dismissedRequests
  ) {
    try {
      const loaded = await me.$jazz.ensureLoaded({
        resolve: { root: { dismissedRequestIDs: true } },
      });
      const record = co
        .record(z.string(), z.boolean())
        .create({}, { owner: me });
      for (const id of Array.from(
        (loaded.root as any).dismissedRequestIDs ?? [],
      ) as string[]) {
        if (typeof id === "string") record.$jazz.set(id, true);
      }
      (me.root as any).$jazz.set("dismissedRequests", record);
    } catch (e) {
      console.warn(
        "[migration] dismissedRequests backfill skipped (will retry):",
        e,
      );
    }
  }

  // -- 2l. outgoingRequests + pendingNotifications init (no historical data
  // exists for either — spec §5 accepts that pre-slice outbound requests are
  // unrecoverable).
  if (
    me.root &&
    typeof (me.root as any).$jazz?.set === "function" &&
    !(me.root as any).outgoingRequests
  ) {
    (me.root as any).$jazz.set(
      "outgoingRequests",
      co.record(z.string(), OutgoingConnectionRequest).create({}, { owner: me }),
    );
  }
  if (
    me.root &&
    typeof (me.root as any).$jazz?.set === "function" &&
    !(me.root as any).pendingNotifications
  ) {
    (me.root as any).$jazz.set(
      "pendingNotifications",
      co.record(z.string(), PendingNotification).create({}, { owner: me }),
    );
  }
```

  Note on multi-device skew (accepted, record in the commit message): a not-yet-updated device keeps writing the OLD lists after another device ran the backfill; those late writes are not re-imported (guard = new-field presence). The user base is small and all-device updates are near-simultaneous; the visible-repair affordance (Task 12) covers any contact that slips through.

- [ ] Run `nix-shell --run 'npm run typecheck'` — expect **PASS**.
- [ ] Run `nix-shell --run 'npx vitest run'` — expect **PASS** (full unit suite; the migration change is additive).
- [ ] Commit: `git add -A && git commit -m "feat(migration): backfill keyed records from legacy CoLists (TOFU-aware contact dedup; accepted multi-device skew window)"`

## Task 3: `upsertContact` — the only contact writer (TDD)

- [ ] Write the failing test `tests/unit/jazz/handshake-upsert-contact.test.ts` (mock style mirrors `tests/unit/jazz/connection-request-actions.test.ts` — plain objects with `$jazz` spies):

```ts
import { describe, test, expect, vi } from "vitest";

// Stub CoValue creation: Contact.create with a mock owner would throw inside
// jazz-tools. The stub returns the init object so field assertions hold.
// (Same technique as the existing jazz unit tests' schema stubs.)
vi.mock("@/jazz/schema/Contact", () => ({
  Contact: {
    create: (init: Record<string, unknown>) => ({ ...init }),
  },
  ContactBook: {},
}));

import { upsertContact } from "@/jazz/handshake";

function makeMe(existing: Record<string, any> = {}) {
  const setSpy = vi.fn();
  const contacts: any = { ...existing };
  contacts.$jazz = { set: setSpy };
  const me = { $jazz: { id: "me-acc" }, root: { contacts } };
  return { me, setSpy, contacts };
}

const data = {
  contactAccountID: "acc-x",
  fingerprint: "fp-x",
  displayName: "Xenia",
};

describe("upsertContact", () => {
  test("creates a new contact keyed by account ID when absent", () => {
    const { me, setSpy } = makeMe();
    const result = upsertContact(me as any, data);
    expect(result).toBe("created");
    expect(setSpy).toHaveBeenCalledTimes(1);
    const [key, value] = setSpy.mock.calls[0];
    expect(key).toBe("acc-x");
    expect(value).toMatchObject({
      contactAccountID: "acc-x",
      pinnedFingerprint: "fp-x",
      displayNameLocal: "Xenia",
    });
    expect(value.addedAt).toBeInstanceOf(Date);
  });

  test("no-ops when the contact exists with a matching fingerprint", () => {
    const entrySet = vi.fn();
    const { me, setSpy } = makeMe({
      "acc-x": {
        contactAccountID: "acc-x",
        pinnedFingerprint: "fp-x",
        displayNameLocal: "Old Name",
        $jazz: { set: entrySet },
      },
    });
    const result = upsertContact(me as any, data);
    expect(result).toBe("unchanged");
    expect(setSpy).not.toHaveBeenCalled();
    expect(entrySet).not.toHaveBeenCalled(); // display name stays frozen
  });

  test("TOFU: fingerprint mismatch keeps the OLD pin and flags the conflict", () => {
    const entrySet = vi.fn();
    const { me, setSpy } = makeMe({
      "acc-x": {
        contactAccountID: "acc-x",
        pinnedFingerprint: "fp-old",
        displayNameLocal: "Xenia",
        $jazz: { set: entrySet },
      },
    });
    const result = upsertContact(me as any, data);
    expect(result).toBe("conflict");
    expect(setSpy).not.toHaveBeenCalled(); // entry NOT replaced
    expect(entrySet).toHaveBeenCalledWith("fingerprintConflict", true);
    expect(entrySet).toHaveBeenCalledWith("conflictingFingerprint", "fp-x");
    const pinWrites = entrySet.mock.calls.filter(
      ([k]: [string]) => k === "pinnedFingerprint",
    );
    expect(pinWrites).toHaveLength(0); // pin NEVER overwritten
  });

  test("returns 'unavailable' when the contacts record is not loaded", () => {
    const me = { $jazz: { id: "me-acc" }, root: {} };
    expect(upsertContact(me as any, data)).toBe("unavailable");
  });
});
```

- [ ] Run `nix-shell --run 'npx vitest run tests/unit/jazz/handshake-upsert-contact.test.ts'` — expect **FAIL** (`@/jazz/handshake` does not exist).
- [ ] Create `src/jazz/handshake.ts` with the module header + `upsertContact` + the read helpers (`sendConnectionRequest` and the hooks are added in Tasks 4–5):

```ts
/**
 * Handshake module — contact-robustness slice (spec:
 * docs/superpowers/specs/2026-07-20-contact-robustness-design.md).
 *
 * Owns the account-level handshake facts:
 *  - the contact book (me.root.contacts, keyed by account ID) via
 *    upsertContact — the ONLY place a Contact is written;
 *  - outbound connection requests (me.root.outgoingRequests) via
 *    sendConnectionRequest — the ONLY request-creation path (both channels);
 *  - the app-level approval watcher (useOutgoingRequestWatcher) that turns
 *    approvedAt/deniedAt stamps into durable contact/status state — replacing
 *    the tab-lifetime poll in /invite (FM3/FM4).
 */
import { Account } from "jazz-tools";
import { Contact } from "./schema/Contact";

export type UpsertContactResult =
  | "created"
  | "unchanged"
  | "conflict"
  | "unavailable";

export interface ContactData {
  contactAccountID: string;
  fingerprint: string;
  displayName: string;
}

/**
 * Idempotent, TOFU-aware contact write, keyed by account ID.
 *
 * - Absent → create (pin fingerprint now — TOFU at handshake time).
 * - Present, same fingerprint → no-op (displayNameLocal stays frozen at the
 *   original approval; live-name propagation is a separate product decision).
 * - Present, DIFFERENT fingerprint → keep the old pin, set
 *   fingerprintConflict + conflictingFingerprint for the profile safety-number
 *   section to surface. NEVER overwrites pinnedFingerprint (threat model §6).
 */
export function upsertContact(
  me: Account,
  data: ContactData,
): UpsertContactResult {
  const contacts = (me as any).root?.contacts;
  if (!contacts || typeof contacts.$jazz?.set !== "function") {
    return "unavailable";
  }

  const existing = contacts[data.contactAccountID];
  if (existing) {
    if (existing.pinnedFingerprint === data.fingerprint) return "unchanged";
    if (typeof existing.$jazz?.set === "function") {
      existing.$jazz.set("fingerprintConflict", true);
      existing.$jazz.set("conflictingFingerprint", data.fingerprint);
    }
    return "conflict";
  }

  contacts.$jazz.set(
    data.contactAccountID,
    Contact.create(
      {
        contactAccountID: data.contactAccountID,
        pinnedFingerprint: data.fingerprint,
        displayNameLocal: data.displayName,
        addedAt: new Date(),
      },
      { owner: me },
    ),
  );
  return "created";
}

/** All contacts, sorted by addedAt (record iteration order is not stable). */
export function listContacts(me: any): any[] {
  const contacts = me?.root?.contacts;
  if (!contacts) return [];
  return Object.values(contacts as Record<string, any>)
    .filter((c: any) => c && typeof c.contactAccountID === "string")
    .sort(
      (a: any, b: any) =>
        new Date(a.addedAt ?? 0).getTime() - new Date(b.addedAt ?? 0).getTime(),
    );
}

/** Keyed lookup. Returns undefined when absent or not loaded. */
export function getContact(me: any, accountID: string): any | undefined {
  const c = me?.root?.contacts?.[accountID];
  return c && typeof c.contactAccountID === "string" ? c : undefined;
}
```

- [ ] Run `nix-shell --run 'npx vitest run tests/unit/jazz/handshake-upsert-contact.test.ts'` — expect **PASS** (4 tests).
- [ ] Run `nix-shell --run 'npm run typecheck'` — expect **PASS**.
- [ ] Commit: `git add -A && git commit -m "feat(handshake): upsertContact — single TOFU-aware contact writer + keyed read helpers"`

## Task 4: `contacts` record becomes the source of truth (write + read sweep, one commit)

The approve path starts writing through `upsertContact` and EVERY `contactBook` consumer moves to the `contacts` record in the same commit — splitting write-swap from read-swap would leave approved contacts invisible in between. The Task 2 backfill guarantees `contacts` ⊇ deduped `contactBook`, so reads are equivalent.

- [ ] Edit `src/jazz/invitations.ts` — replace the body of `approveConnectionRequest` after the `approvedAt` stamp (delete the `Contact.create` + `contactBook.$jazz.push` block) with:

```ts
  r.$jazz.set("approvedAt", new Date());

  // Contact write goes through the single idempotent writer (FM7): keyed by
  // account ID, TOFU-aware. Approving a duplicate request for an existing
  // contact is now a structural no-op.
  //
  // Dynamic import ON PURPOSE: handshake.ts statically imports from
  // invitations.ts (mint/deliver, Task 5); a static import here would close
  // an ES-module cycle. The function is already async — the lazy import
  // keeps the dependency edge one-directional at module-init time.
  const { upsertContact } = await import("./handshake");
  upsertContact(recipient, {
    contactAccountID: r.requesterAccountID,
    fingerprint: r.requesterFingerprint,
    displayName: r.requesterDisplayName,
  });
```

  Delete the now-unused `import { Contact } from "./schema/Contact";`.

- [ ] Edit `src/App.tsx` line 103 — resolve swap: `contactBook: { $each: true },` → `contacts: { $each: true },`.
- [ ] Edit `src/jazz/avatarResolver.ts` lines 30-32 — replace:

```ts
  const contactBook = (me as any)?.root?.contactBook;
  if (contactBook) {
    for (const contact of contactBook as Iterable<any>) {
```

  with:

```ts
  const contactBook = (me as any)?.root?.contacts;
  if (contactBook) {
    for (const contact of Object.values(contactBook as Record<string, any>)) {
```

- [ ] Edit `src/jazz/displayName.ts` lines 25-27 — replace the loop with a keyed lookup:

```ts
  const contactEntry = me?.root?.contacts?.[accountID];
  if (contactEntry?.displayNameLocal) {
    return contactEntry.displayNameLocal as string;
  }
```

  (delete the old `contactBook` loop including its closing braces; keep the subsequent group-member fallback).
- [ ] Edit `src/hooks/use-shared-groups.ts` — line 26 resolve swap `contactBook: { $each: true },` → `contacts: { $each: true },`; line 34 `const contactBook = Array.from((me.root.contactBook as any) ?? []);` → `const contactBook = listContacts(me);` with `import { listContacts } from "@/jazz/handshake";` added (line 69's `contactBook.find(...)` keeps working on the returned array).
- [ ] Edit `src/components/contact-picker.tsx` — line 16 resolve swap to `contacts: { $each: true }`; line 22 `const allContacts = Array.from(me.root?.contactBook ?? []);` → `const allContacts = listContacts(me);` (+ import).
- [ ] Edit `src/components/use-home-lists.ts` — line 148 resolve swap to `contacts: { $each: true },`; lines 214, 251, 296, 435: replace each `Array.from(me.root?.contactBook ?? [])` with `listContacts(me)` (+ import). Signatures stay identical (array in, array out); the existing null-filters downstream are harmless belts.
- [ ] Edit `src/routes/conversations/new.tsx` — line 27 resolve swap to `contacts: { $each: true },`; line 56 `const rawContacts = Array.from((me.root.contactBook as any) ?? []);` → `const rawContacts = listContacts(me);` (+ import).
- [ ] Edit `src/routes/conversations/members.tsx` — line 173 resolve swap to `contacts: { $each: true },`; line 278 `Array.from(((me as any).root?.contactBook as Iterable<any>) ?? [])` → `listContacts(me)` (+ import).
- [ ] Edit `src/routes/contacts/detail.tsx` — line 30 resolve swap to `contacts: { $each: true },`; line 35 `me.root.contactBook.find((c) => (c as any).$jazz?.id === contactID)` → `listContacts(me).find((c: any) => c?.$jazz?.id === contactID)` (+ import); lines 94-96 removal becomes a keyed delete:

```ts
  function handleRemove() {
    const accountID = (contact as any)?.contactAccountID;
    if (accountID) (me as any).root.contacts.$jazz.delete(accountID);
```

  (`$jazz.delete(key)` is verified for record-like CoMaps — jazz-tools 0.20.18 `coMap.d.ts:273-280`: "For record-like CoMaps (created with `co.record`), any string key can be deleted.")
- [ ] Edit `src/components/profile-view.tsx` — line 45 resolve swap to `contacts: { $each: true },`; lines 78-82 contact lookup → `const contact = me.$isLoaded ? getContact(me, accountID) : undefined;` with `import { getContact } from "@/jazz/handshake";`; lines 302-304 `(me as any).root.contactBook.$jazz.remove((c: any) => c?.$jazz?.id === contactJazzId);` → `(me as any).root.contacts.$jazz.delete(accountID);` (the `contactJazzId` guard above it can be deleted too — the keyed delete needs only `accountID`, which is the component prop).
- [ ] Edit `src/routes/invite/index.tsx` — line 96 resolve swap `root: { contactBook: { $each: true } }` → `root: { contacts: { $each: true } }`. (The `writeInviterAsContact` helper still pushes to `contactBook` — it is DELETED in Task 8; until then it writes to the legacy list, which nothing reads anymore, and the watcher (Task 6) performs the real contact write. Interim behavior is correct because Task 8 lands before this slice merges.)

  CORRECTION to keep every intermediate commit green (the requester-side contact write must not regress between Task 4 and Task 6): instead of leaving `writeInviterAsContact` writing to the dead list, edit it NOW to delegate:

```ts
async function writeInviterAsContact(
  me: any,
  inv: {
    inviterAccountID: string;
    inviterFingerprint: string;
    inviterDisplayName: string;
  },
): Promise<void> {
  const { upsertContact } = await import("@/jazz/handshake");
  upsertContact(me, {
    contactAccountID: inv.inviterAccountID,
    fingerprint: inv.inviterFingerprint,
    displayName: inv.inviterDisplayName,
  });
}
```

- [ ] Edit `src/routes/conversations/detail.tsx` — line 321 resolve swap `contactBook: { $each: true },` → `contacts: { $each: true },`; replace the 1:1-contact lookup at lines 595-601:

```ts
          const contactBook = (me as any).root?.contactBook;
          if (!contactBook || !otherID) return null;
          return (
            (Array.from(contactBook).find(
              (ct: any) => ct?.contactAccountID === otherID,
            ) as any) ?? null
          );
```

  with:

```ts
          if (!otherID) return null;
          return getContact(me, otherID) ?? null;
```

  (+ `import { getContact } from "@/jazz/handshake";`; update the stale `contactBook` mentions in the file-header comment lines 23 and 28 to say `contacts`).
- [ ] Run `nix-shell --run "grep -rn 'contactBook' src/ --include='*.ts' --include='*.tsx' | grep -v 'schema/' | grep -v 'contact-migration'"` — expect **zero hits** (only `src/jazz/schema/ArcanAccount.ts` migration blocks and `src/jazz/schema/Contact.ts` may reference it).
- [ ] Run `nix-shell --run 'npm run typecheck'` — expect **PASS**.
- [ ] Run `nix-shell --run 'npx vitest run'` — expect **PASS**.
- [ ] Run `nix-shell --run 'npx playwright test tests/e2e/contact-invitation.spec.ts'` — expect **PASS** (the webServer auto-starts; the approve→contact path now flows through `contacts`).
- [ ] Commit: `git add -A && git commit -m "feat(contacts): keyed contacts record is the source of truth (approve via upsertContact + full read sweep)"`

## Task 5: `sendConnectionRequest` — the single creation path (TDD)

- [ ] Edit `src/jazz/invitations.ts` — split `createConnectionRequest` into mint (local, durable) and deliver (network) so the durable-intent-first ordering is possible. Replace the whole function with:

```ts
/**
 * Mint a ConnectionRequest CoValue locally (no network). Split from delivery
 * (contact-robustness slice) so sendConnectionRequest can persist a durable
 * outgoingRequests entry BEFORE any network attempt.
 */
export function mintConnectionRequest(
  requester: Account,
  recipientAccountID: string,
  channel: "qr" | "link" | "group",
  opts: { invitationID?: string; expiresAt: Date },
): ReturnType<typeof ConnectionRequest.create> {
  const me = requester as Account & {
    profile?: { displayName?: string; name?: string };
    $jazz: { id: string };
  };

  const displayName =
    me.profile?.displayName ?? me.profile?.name ?? "Anonymous";

  // Fresh notification group — recipient has no prior role here so
  // InboxSender.load() can add them as "writer" without conflict.
  const notificationGroup = Group.create({ owner: requester });

  return ConnectionRequest.create(
    {
      requesterAccountID: me.$jazz.id,
      requesterFingerprint: getAccountPubkeyHex(requester),
      requesterDisplayName: displayName,
      recipientAccountID,
      channel,
      invitationID: opts.invitationID,
      createdAt: new Date(),
      expiresAt: opts.expiresAt,
    },
    { owner: notificationGroup },
  ) as ReturnType<typeof ConnectionRequest.create>;
}

/**
 * Deliver a minted ConnectionRequest to the recipient's Inbox. Resolves on
 * the Inbox's end-to-end ack (receiver durably marked it processed) — with
 * NO upstream timeout; callers wrap it (handshake.ts REQUEST_ACK_TIMEOUT_MS).
 * Safe to call again with the same request: the receiver drain dedups by
 * request CoValue ID.
 */
export async function deliverConnectionRequest(
  requester: Account,
  recipientAccountID: string,
  request: ReturnType<typeof ConnectionRequest.create>,
): Promise<void> {
  const sender = await InboxSender.load<typeof request>(
    recipientAccountID as any,
    requester,
  );
  await sender.sendMessage(request);
}
```

  Delete the old `createConnectionRequest` entirely and update its one remaining caller inline: in `src/routes/invite/index.tsx`, `onConnect` temporarily becomes (full Task 8 rework comes later; this keeps the branch green now):

```ts
      const req = mintConnectionRequest(
        me as any,
        invitation.inviterAccountID,
        openedChannel,
        {
          invitationID: invitation.$jazz?.id,
          expiresAt: invitation.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      );
      await deliverConnectionRequest(me as any, invitation.inviterAccountID, req);
      setRequest(req);
      setPhase("sent");
```

  (import swap: `createConnectionRequest` → `mintConnectionRequest, deliverConnectionRequest`).

- [ ] Write the failing test `tests/unit/jazz/handshake-send-request.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from "vitest";

const mintSpy = vi.fn();
const deliverSpy = vi.fn();
vi.mock("@/jazz/invitations", () => ({
  mintConnectionRequest: (...args: unknown[]) => mintSpy(...args),
  deliverConnectionRequest: (...args: unknown[]) => deliverSpy(...args),
  GROUP_REQUEST_TTL_MS: 30 * 24 * 60 * 60 * 1000,
}));
vi.mock("@/jazz/schema/OutgoingConnectionRequest", () => ({
  OutgoingConnectionRequest: {
    create: (init: Record<string, unknown>) => {
      const entry: any = { ...init };
      entry.$jazz = {
        set: vi.fn((k: string, v: unknown) => {
          entry[k] = v;
        }),
      };
      return entry;
    },
  },
}));
vi.mock("@/jazz/schema/Contact", () => ({
  Contact: { create: (init: Record<string, unknown>) => ({ ...init }) },
  ContactBook: {},
}));

import { sendConnectionRequest, REQUEST_MIN_TTL_MS } from "@/jazz/handshake";

const COUNTERPART = {
  accountID: "acc-inviter",
  fingerprint: "fp-inviter",
  displayName: "Ida",
};

function makeMe(opts: {
  contacts?: Record<string, any>;
  outgoing?: Record<string, any>;
} = {}) {
  const outgoingSet = vi.fn();
  const outgoing: any = { ...(opts.outgoing ?? {}) };
  outgoing.$jazz = { set: outgoingSet };
  const contacts: any = { ...(opts.contacts ?? {}) };
  contacts.$jazz = { set: vi.fn() };
  const me = { $jazz: { id: "me-acc" }, root: { contacts, outgoingRequests: outgoing } };
  return { me, outgoingSet };
}

beforeEach(() => {
  mintSpy.mockReset().mockReturnValue({
    $jazz: { id: "req-1" },
    expiresAt: new Date(Date.now() + REQUEST_MIN_TTL_MS),
  });
  deliverSpy.mockReset().mockResolvedValue(undefined);
});

describe("sendConnectionRequest", () => {
  test("short-circuits when already a contact — nothing minted or sent", async () => {
    const { me, outgoingSet } = makeMe({
      contacts: { "acc-inviter": { contactAccountID: "acc-inviter" } },
    });
    const result = await sendConnectionRequest(me as any, COUNTERPART, {
      channel: "invite",
      requestChannel: "link",
    });
    expect(result.outcome).toBe("already-contact");
    expect(mintSpy).not.toHaveBeenCalled();
    expect(outgoingSet).not.toHaveBeenCalled();
  });

  test("short-circuits when a live pending entry exists", async () => {
    const pendingEntry = {
      status: "pending",
      request: { expiresAt: new Date(Date.now() + 60_000) },
    };
    const { me } = makeMe({ outgoing: { "acc-inviter": pendingEntry } });
    const result = await sendConnectionRequest(me as any, COUNTERPART, {
      channel: "invite",
      requestChannel: "link",
    });
    expect(result.outcome).toBe("already-pending");
    expect(mintSpy).not.toHaveBeenCalled();
  });

  test("happy path: durable entry written BEFORE delivery; ack sets deliveredAt", async () => {
    const { me, outgoingSet } = makeMe();
    const result = await sendConnectionRequest(me as any, COUNTERPART, {
      channel: "invite",
      requestChannel: "link",
      invitationID: "inv-1",
    });
    expect(result.outcome).toBe("sent");
    expect(outgoingSet).toHaveBeenCalledTimes(1);
    const [key, entry] = outgoingSet.mock.calls[0];
    expect(key).toBe("acc-inviter");
    expect(entry.status).toBe("pending");
    expect(entry.channel).toBe("invite");
    expect(entry.counterpartFingerprint).toBe("fp-inviter");
    // durable intent first: the record write happened before delivery started
    expect(outgoingSet.mock.invocationCallOrder[0]).toBeLessThan(
      deliverSpy.mock.invocationCallOrder[0],
    );
    expect(entry.deliveredAt).toBeInstanceOf(Date);
  });

  test("delivery failure marks the durable entry failed (watcher retries)", async () => {
    deliverSpy.mockRejectedValue(new Error("offline"));
    const { me, outgoingSet } = makeMe();
    const result = await sendConnectionRequest(me as any, COUNTERPART, {
      channel: "invite",
      requestChannel: "link",
    });
    expect(result.outcome).toBe("send-failed");
    const entry = outgoingSet.mock.calls[0][1];
    expect(entry.status).toBe("failed");
    expect(entry.deliveredAt).toBeUndefined();
  });

  test("invite-channel TTL: request expiry is max(invitationExpiry, sentAt + 7d)", async () => {
    const { me } = makeMe();
    const shortExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 h link
    await sendConnectionRequest(me as any, COUNTERPART, {
      channel: "invite",
      requestChannel: "link",
      invitationExpiresAt: shortExpiry,
    });
    const mintOpts = mintSpy.mock.calls[0][3] as { expiresAt: Date };
    expect(mintOpts.expiresAt.getTime()).toBeGreaterThanOrEqual(
      Date.now() + REQUEST_MIN_TTL_MS - 1000,
    );
  });

  test("group channel uses the 30-day group TTL", async () => {
    const { me } = makeMe();
    await sendConnectionRequest(me as any, COUNTERPART, {
      channel: "group",
      requestChannel: "group",
    });
    const mintOpts = mintSpy.mock.calls[0][3] as { expiresAt: Date };
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(mintOpts.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + thirtyDays - 60_000,
    );
  });
});
```

- [ ] Run `nix-shell --run 'npx vitest run tests/unit/jazz/handshake-send-request.test.ts'` — expect **FAIL** (`sendConnectionRequest` not exported).
- [ ] Edit `src/jazz/handshake.ts` — add below `getContact`:

```ts
import {
  mintConnectionRequest,
  deliverConnectionRequest,
  GROUP_REQUEST_TTL_MS,
} from "./invitations";
import { OutgoingConnectionRequest } from "./schema/OutgoingConnectionRequest";

/** App-side ack timeout — Inbox sendMessage has NONE upstream (canon §2a). */
export const REQUEST_ACK_TIMEOUT_MS = 15_000;
/** Request expiry floor: 7 days from send, decoupled from invitation TTL (FM9). */
export const REQUEST_MIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export interface CounterpartSnapshot {
  accountID: string;
  fingerprint: string;
  displayName: string;
}

export interface SendConnectionRequestOpts {
  /** Which app flow initiated this ("invite" screen or "group" members). */
  channel: "invite" | "group";
  /** ConnectionRequest.channel — how the recipient's UI surfaces it. */
  requestChannel: "qr" | "link" | "group";
  invitationID?: string;
  invitationExpiresAt?: Date;
}

export type SendConnectionRequestResult =
  | { outcome: "already-contact" }
  | { outcome: "already-pending"; entry: any }
  | { outcome: "sent"; entry: any }
  | { outcome: "send-failed"; entry: any }
  | { outcome: "unavailable" };

/**
 * THE single connection-request creation path (both channels — FM1/FM8):
 * 1. contactBook check → "already-contact" (no send);
 * 2. live pending entry check → "already-pending" (no send);
 * 3. mint locally + write the durable pending entry FIRST;
 * 4. deliver via Inbox, awaiting the end-to-end ack under an app timeout;
 * 5. ack → deliveredAt; failure/timeout → status "failed" (watcher retries).
 */
export async function sendConnectionRequest(
  me: Account,
  counterpart: CounterpartSnapshot,
  opts: SendConnectionRequestOpts,
): Promise<SendConnectionRequestResult> {
  const outgoing = (me as any).root?.outgoingRequests;
  if (!outgoing || typeof outgoing.$jazz?.set !== "function") {
    return { outcome: "unavailable" };
  }

  if (getContact(me, counterpart.accountID)) {
    return { outcome: "already-contact" };
  }

  const existing = outgoing[counterpart.accountID];
  if (existing && existing.status === "pending" && !existing.archivedAt) {
    const expMs = existing.request?.expiresAt
      ? new Date(existing.request.expiresAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (expMs > Date.now()) {
      return { outcome: "already-pending", entry: existing };
    }
  }

  const now = new Date();
  const expiresAt =
    opts.channel === "group"
      ? new Date(now.getTime() + GROUP_REQUEST_TTL_MS)
      : new Date(
          Math.max(
            opts.invitationExpiresAt
              ? new Date(opts.invitationExpiresAt).getTime()
              : 0,
            now.getTime() + REQUEST_MIN_TTL_MS,
          ),
        );

  const request = mintConnectionRequest(
    me,
    counterpart.accountID,
    opts.requestChannel,
    { invitationID: opts.invitationID, expiresAt },
  );

  const entry = OutgoingConnectionRequest.create(
    {
      request,
      counterpartAccountID: counterpart.accountID,
      counterpartFingerprint: counterpart.fingerprint,
      counterpartDisplayName: counterpart.displayName,
      channel: opts.channel,
      sentAt: now,
      status: "pending",
    },
    { owner: me },
  );
  // Durable intent FIRST: a crash/reload between here and the ack leaves a
  // pending entry the watcher can observe and retry — never a silent loss.
  outgoing.$jazz.set(counterpart.accountID, entry);

  try {
    await withTimeout(
      deliverConnectionRequest(me, counterpart.accountID, request),
      REQUEST_ACK_TIMEOUT_MS,
    );
    (entry as any).$jazz.set("deliveredAt", new Date());
    return { outcome: "sent", entry };
  } catch (e) {
    console.warn("[handshake] request delivery failed — will retry:", e);
    (entry as any).$jazz.set("status", "failed");
    return { outcome: "send-failed", entry };
  }
}
```

- [ ] Run `nix-shell --run 'npx vitest run tests/unit/jazz/handshake-send-request.test.ts'` — expect **PASS** (6 tests).
- [ ] Edit `src/jazz/conversation.ts` — rewrite `requestConnectionFromGroupMember` (lines 264-270) to route through the single path with a counterpart snapshot (fingerprint pinned from the co-member's loaded account, display name from their live profile):

```ts
/**
 * Group-channel: request a connection from a co-member of a conversation.
 * Routes through handshake.sendConnectionRequest — the single creation path —
 * so the durable outgoingRequests entry exists and the approval watcher can
 * write the contact on BOTH sides (FM4: previously the requester never got
 * the approver as a contact).
 */
export async function requestConnectionFromGroupMember(
  me: Account,
  targetAccountID: string,
): Promise<SendConnectionRequestResult> {
  const target = await loadAccountByID(me, targetAccountID);
  if (!target) {
    throw new Error(`Cannot load account ${targetAccountID}`);
  }
  let fingerprint = "";
  try {
    fingerprint = getAccountPubkeyHex(target as any);
  } catch {
    // fall through to the guard below
  }
  if (!fingerprint) {
    throw new Error(
      `Cannot derive fingerprint for ${targetAccountID} — refusing unpinned request`,
    );
  }
  const displayName =
    (target as any).profile?.displayName ??
    (target as any).profile?.name ??
    "Unknown";
  return sendConnectionRequest(
    me,
    { accountID: targetAccountID, fingerprint, displayName },
    { channel: "group", requestChannel: "group" },
  );
}
```

  Imports to add in `conversation.ts`: `import { sendConnectionRequest, type SendConnectionRequestResult } from "./handshake";` and `import { getAccountPubkeyHex } from "@/auth/pubkey";`. `GROUP_REQUEST_TTL_MS` stays imported from `./invitations` if other references remain; otherwise remove it here (it moved into the handshake TTL logic).
- [ ] Edit `src/routes/conversations/members.tsx` `handleRequestConnection` (lines 362-369) to surface the new outcomes:

```ts
  async function handleRequestConnection(accountID: string) {
    try {
      const result = await requestConnectionFromGroupMember(me as any, accountID);
      if (result.outcome === "already-pending") {
        toast({ icon: "check", text: "request already pending", tone: "neutral" });
      } else if (result.outcome === "already-contact") {
        toast({ icon: "check", text: "already a contact", tone: "neutral" });
      } else if (result.outcome === "send-failed") {
        toast({ icon: "alert", text: "couldn't send — will retry", tone: "error" });
      } else {
        toast({ icon: "check", text: "request sent", tone: "accent" });
      }
    } catch {
      toast({ icon: "alert", text: "couldn't send request", tone: "error" });
    }
  }
```

- [ ] Run `nix-shell --run 'npm run typecheck'` — expect **PASS**.
- [ ] Run `nix-shell --run 'npx vitest run'` — expect **PASS**.
- [ ] Commit: `git add -A && git commit -m "feat(handshake): sendConnectionRequest — durable-intent-first single send path for both channels"`

## Task 6: Outgoing-request watcher (TDD transitions + app-level hook)

- [ ] Write the failing test `tests/unit/jazz/handshake-watcher.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { computeOutgoingAction } from "@/jazz/handshake";

const NOW = 1_800_000_000_000;

describe("computeOutgoingAction", () => {
  test("approval stamp on a pending entry → approve", () => {
    expect(
      computeOutgoingAction(
        { status: "pending", approvedAtMs: NOW - 1000 },
        NOW,
      ),
    ).toBe("approve");
  });

  test("denial stamp on a pending entry → deny", () => {
    expect(
      computeOutgoingAction({ status: "pending", deniedAtMs: NOW - 1000 }, NOW),
    ).toBe("deny");
  });

  test("approval wins over concurrent denial (matches recipient-side approve-wins)", () => {
    expect(
      computeOutgoingAction(
        { status: "pending", approvedAtMs: NOW - 1000, deniedAtMs: NOW - 500 },
        NOW,
      ),
    ).toBe("approve");
  });

  test("pending entry past request expiry → expire", () => {
    expect(
      computeOutgoingAction(
        { status: "pending", expiresAtMs: NOW - 1 },
        NOW,
      ),
    ).toBe("expire");
  });

  test("approval stamp beats expiry (approved late still counts)", () => {
    expect(
      computeOutgoingAction(
        { status: "pending", approvedAtMs: NOW - 1000, expiresAtMs: NOW - 1 },
        NOW,
      ),
    ).toBe("approve");
  });

  test("archived entries are inert", () => {
    expect(
      computeOutgoingAction(
        { status: "approved", archivedAtMs: NOW - 1000, approvedAtMs: NOW - 2000 },
        NOW,
      ),
    ).toBe("none");
  });

  test("failed entries are not reactive transitions (retry is launch/reconnect-driven)", () => {
    expect(computeOutgoingAction({ status: "failed" }, NOW)).toBe("none");
  });

  test("live pending entry with no stamps → none", () => {
    expect(
      computeOutgoingAction(
        { status: "pending", expiresAtMs: NOW + 1000 },
        NOW,
      ),
    ).toBe("none");
  });
});
```

- [ ] Run `nix-shell --run 'npx vitest run tests/unit/jazz/handshake-watcher.test.ts'` — expect **FAIL**.
- [ ] Edit `src/jazz/handshake.ts` — add the pure transition function and the watcher hook (new imports at top: `import { useEffect, useRef } from "react";` and `import { useAccount } from "jazz-tools/react";` and `import { ArcanAccount } from "./schema/ArcanAccount";`):

```ts
export interface OutgoingEntryStamps {
  status: "pending" | "approved" | "denied" | "failed" | "expired";
  archivedAtMs?: number;
  approvedAtMs?: number;
  deniedAtMs?: number;
  expiresAtMs?: number;
}

export type OutgoingAction = "approve" | "deny" | "expire" | "none";

/**
 * Pure state machine for a durable outgoing entry. Priority:
 * archived → inert; approval stamp → approve (wins over denial + expiry,
 * mirroring pairing's approve-wins rule); denial stamp → deny; past request
 * expiry → expire. "failed" is NOT handled here — re-sends run on
 * launch/reconnect, never as a reactive transition (no hot retry loops).
 */
export function computeOutgoingAction(
  entry: OutgoingEntryStamps,
  nowMs: number,
): OutgoingAction {
  if (entry.archivedAtMs !== undefined) return "none";
  if (entry.status !== "pending") return "none";
  if (entry.approvedAtMs !== undefined) return "approve";
  if (entry.deniedAtMs !== undefined) return "deny";
  if (entry.expiresAtMs !== undefined && entry.expiresAtMs <= nowMs) {
    return "expire";
  }
  return "none";
}

/**
 * App-level approval watcher — mounted ONCE in App.tsx beside the inbox
 * drains. Replaces the /invite route's 3-second component-lifetime poll
 * (FM3) and gives the group channel its missing requester-side contact
 * write (FM4). Subscribes via its own useAccount (App.tsx's resolve stays
 * shallow by convention — see the comment above App's useAccount).
 *
 * Transitions are idempotent: computeOutgoingAction returns "none" once the
 * status/archivedAt writes land, so the render-reactive effect settles.
 */
export function useOutgoingRequestWatcher(): void {
  const me = useAccount(ArcanAccount, {
    resolve: {
      root: {
        contacts: { $each: true },
        outgoingRequests: { $each: { request: true } },
      },
    },
  });
  const retriedThisLaunch = useRef(false);

  // 1. Reactive transitions (approve/deny/expire) — runs on every render of
  // the resolved graph; cheap and settles to no-ops.
  useEffect(() => {
    if (!me.$isLoaded) return;
    const outgoing = (me as any).root?.outgoingRequests;
    if (!outgoing) return;
    const nowMs = Date.now();
    for (const entry of Object.values(outgoing as Record<string, any>)) {
      if (!entry || typeof entry.$jazz?.set !== "function") continue;
      const req = entry.request;
      const action = computeOutgoingAction(
        {
          status: entry.status,
          archivedAtMs: entry.archivedAt
            ? new Date(entry.archivedAt).getTime()
            : undefined,
          approvedAtMs: req?.approvedAt
            ? new Date(req.approvedAt).getTime()
            : undefined,
          deniedAtMs: req?.deniedAt
            ? new Date(req.deniedAt).getTime()
            : undefined,
          expiresAtMs: req?.expiresAt
            ? new Date(req.expiresAt).getTime()
            : undefined,
        },
        nowMs,
      );
      if (action === "none") continue;
      if (action === "approve") {
        upsertContact(me as any, {
          contactAccountID: entry.counterpartAccountID,
          fingerprint: entry.counterpartFingerprint,
          displayName: entry.counterpartDisplayName,
        });
        entry.$jazz.set("status", "approved");
      } else if (action === "deny") {
        entry.$jazz.set("status", "denied");
      } else {
        entry.$jazz.set("status", "expired");
      }
      entry.$jazz.set("archivedAt", new Date());
    }
  });

  // 2. Failed-send retry — once per launch + on browser reconnect (spec §2).
  useEffect(() => {
    if (!me.$isLoaded) return;

    const retryFailed = () => {
      const outgoing = (me as any).root?.outgoingRequests;
      if (!outgoing) return;
      for (const entry of Object.values(outgoing as Record<string, any>)) {
        if (!entry || entry.archivedAt) continue;
        const undelivered =
          entry.status === "failed" ||
          (entry.status === "pending" && !entry.deliveredAt);
        if (!undelivered) continue;
        const req = entry.request;
        if (!req?.$jazz?.id) continue;
        const expMs = req.expiresAt
          ? new Date(req.expiresAt).getTime()
          : Number.POSITIVE_INFINITY;
        if (expMs <= Date.now()) continue; // expiry transition handles it
        void (async () => {
          try {
            await withTimeout(
              deliverConnectionRequest(
                me as any,
                entry.counterpartAccountID,
                req,
              ),
              REQUEST_ACK_TIMEOUT_MS,
            );
            entry.$jazz.set("deliveredAt", new Date());
            entry.$jazz.set("status", "pending");
          } catch (e) {
            console.warn("[handshake] retry delivery failed:", e);
            entry.$jazz.set("status", "failed");
          }
        })();
      }
    };

    if (!retriedThisLaunch.current) {
      retriedThisLaunch.current = true;
      retryFailed();
    }
    window.addEventListener("online", retryFailed);
    return () => window.removeEventListener("online", retryFailed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.$isLoaded]);
}
```

- [ ] Run `nix-shell --run 'npx vitest run tests/unit/jazz/handshake-watcher.test.ts'` — expect **PASS** (8 tests).
- [ ] Edit `src/App.tsx` — mount the watcher after line 114 (`useIncomingConnectionRequestInbox(me);`):

```ts
  // Contact-robustness slice: durable outgoing-request watcher (approval,
  // denial, expiry, failed-send retry). Owns the requester-side contact
  // write for BOTH channels — the /invite screen is now a pure view of this
  // hook's state. Uses its own deep useAccount internally (App resolve stays
  // shallow by convention).
  useOutgoingRequestWatcher();
```

  with `import { useOutgoingRequestWatcher } from "@/jazz/handshake";`.
- [ ] Run `nix-shell --run 'npm run typecheck'` — expect **PASS**.
- [ ] Run `nix-shell --run 'npx vitest run'` — expect **PASS**.
- [ ] Commit: `git add -A && git commit -m "feat(handshake): app-level outgoing-request watcher — approval/denial/expiry transitions + launch/reconnect retry"`

## Task 7: Receive-path rekeying (`incomingConnectionRequests` + `dismissedRequests`)

The drain writes into the keyed record (same-key writes from racing devices converge — FM2 dies structurally), the read hook collapses rows per requester (FM1 belt), and deny/dismiss move to the new records.

- [ ] Rewrite `src/jazz/use-incoming-connection-requests.ts` — full replacement file:

```ts
import { useEffect } from "react";
import { useAccount } from "jazz-tools/react";
import { Inbox } from "jazz-tools";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { ConnectionRequest } from "@/jazz/schema/ConnectionRequest";

export interface PendingRequest {
  request: any;
  dismissedLocally: boolean;
}

/**
 * App-level inbox subscription — the ONLY place that calls
 * `inbox.subscribe(ConnectionRequest, …)` (Unit 9-0 one-shot semantics; see
 * git history for the full diagnosis).
 *
 * Contact-robustness slice: the drain target moved from the incomingRequests
 * CoList to the incomingConnectionRequests co.record, KEYED BY REQUEST
 * COVALUE ID. Two sessions racing the drain now issue same-key sets that
 * converge by LWW instead of concurrent list appends that both survive
 * (FM2) — the three-layer dedup the CoList needed is structural here.
 */
export function useIncomingConnectionRequestInbox(me: any): void {
  useEffect(() => {
    if (!me?.$isLoaded) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const inbox = await Inbox.load(me);
        if (cancelled) return;
        unsubscribe = inbox.subscribe(
          ConnectionRequest,
          async (request: any) => {
            try {
              const id = request?.$jazz?.id;
              if (!id) return;

              // Guard: $jazz.set is only available when the record is a
              // fully-loaded CoMap (it is, per the resolve in App.tsx).
              const record = me?.root?.incomingConnectionRequests;
              if (!record || typeof (record as any).$jazz?.set !== "function") {
                return;
              }
              if ((record as any)[id]) return; // cheap same-session skip
              (record as any).$jazz.set(id, request);
            } catch (e) {
              console.warn(
                "[connection-requests] Failed to persist incoming request:",
                e,
              );
            }
          },
        );
      } catch (e) {
        console.warn("[connection-requests] inbox subscribe failed:", e);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.$isLoaded, (me as any)?.$jazz?.id]);
}

/**
 * Read-only hook over the durable record. Filters approved/denied/expired,
 * then collapses rows PER REQUESTER (latest createdAt wins — FM1 belt:
 * duplicate real requests from the same person render as one row). Sorted
 * by createdAt so ordering is stable (records have no insertion order).
 *
 * Locally-dismissed requests are NOT filtered out (user decision, 2026-07-08
 * walkthrough): they return with `dismissedLocally: true` — the prompt skips
 * them, the pending surfaces keep showing them.
 */
export function useIncomingConnectionRequests(): PendingRequest[] {
  const me = useAccount(ArcanAccount, {
    resolve: {
      root: {
        dismissedRequests: true,
        incomingConnectionRequests: { $each: true },
      },
    },
  });

  if (!me.$isLoaded) return [];

  const dismissed =
    ((me as any).root?.dismissedRequests as Record<string, boolean>) ?? {};
  const incoming = Object.values(
    ((me as any).root?.incomingConnectionRequests as Record<string, any>) ?? {},
  );

  const live = incoming.filter(
    (r: any) =>
      r &&
      !r.approvedAt &&
      !r.deniedAt &&
      (!r.expiresAt || new Date(r.expiresAt).getTime() > Date.now()),
  );

  const latestByRequester = new Map<string, any>();
  for (const r of live) {
    const key = (r.requesterAccountID as string) ?? r.$jazz.id;
    const prev = latestByRequester.get(key);
    if (
      !prev ||
      new Date(r.createdAt ?? 0).getTime() >
        new Date(prev.createdAt ?? 0).getTime()
    ) {
      latestByRequester.set(key, r);
    }
  }

  return Array.from(latestByRequester.values())
    .sort(
      (a: any, b: any) =>
        new Date(a.createdAt ?? 0).getTime() -
        new Date(b.createdAt ?? 0).getTime(),
    )
    .map((r: any) => ({
      request: r,
      dismissedLocally: !!dismissed[r.$jazz.id],
    }));
}
```

- [ ] Edit `src/jazz/invitations.ts` — replace `dismissConnectionRequest` and `denyConnectionRequest` bodies (docstrings stay, with a one-line note that storage moved to keyed records):

```ts
export async function dismissConnectionRequest(
  recipient: Account,
  request: ReturnType<typeof ConnectionRequest.create>,
): Promise<void> {
  const record = (recipient as any).root?.dismissedRequests;
  if (!record || typeof record.$jazz?.set !== "function") return;
  record.$jazz.set((request as any).$jazz.id as string, true);
}

export async function denyConnectionRequest(
  recipient: Account,
  request: ReturnType<typeof ConnectionRequest.create>,
): Promise<void> {
  const r = request as any;
  if (!r.deniedAt && typeof r.$jazz?.set === "function") {
    r.$jazz.set("deniedAt", new Date());
  }

  const root = (recipient as any).root;
  const id = r.$jazz.id as string;

  const incoming = root?.incomingConnectionRequests;
  if (incoming && typeof incoming.$jazz?.delete === "function") {
    incoming.$jazz.delete(id);
  }

  const dismissed = root?.dismissedRequests;
  if (dismissed && typeof dismissed.$jazz?.set === "function") {
    dismissed.$jazz.set(id, true);
  }
}
```

- [ ] Edit `src/App.tsx` resolve — `incomingRequests: true,` → `incomingConnectionRequests: true,`.
- [ ] Rewrite `tests/unit/jazz/connection-request-actions.test.ts` for the record shape — full replacement:

```ts
import { describe, test, expect, vi } from "vitest";
import {
  denyConnectionRequest,
  dismissConnectionRequest,
} from "@/jazz/invitations";

function makeRecipient(incomingIDs: string[], dismissedIDs: string[] = []) {
  const deleteSpy = vi.fn();
  const setDismissedSpy = vi.fn();
  const incoming: Record<string, any> = {};
  for (const id of incomingIDs) incoming[id] = { $jazz: { id } };
  (incoming as any).$jazz = { delete: deleteSpy };
  const dismissed: Record<string, any> = {};
  for (const id of dismissedIDs) dismissed[id] = true;
  (dismissed as any).$jazz = { set: setDismissedSpy };
  const recipient = {
    root: {
      incomingConnectionRequests: incoming,
      dismissedRequests: dismissed,
    },
  };
  return { recipient, deleteSpy, setDismissedSpy };
}

describe("denyConnectionRequest", () => {
  test("deletes the request key from incomingConnectionRequests", async () => {
    const { recipient, deleteSpy } = makeRecipient(["req-1", "req-2"]);
    await denyConnectionRequest(recipient as any, {
      $jazz: { id: "req-1", set: vi.fn() },
    } as any);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith("req-1");
  });

  test("records the ID in dismissedRequests (modal stays muted)", async () => {
    const { recipient, setDismissedSpy } = makeRecipient(["req-1"]);
    await denyConnectionRequest(recipient as any, {
      $jazz: { id: "req-1", set: vi.fn() },
    } as any);
    expect(setDismissedSpy).toHaveBeenCalledWith("req-1", true);
  });

  test("stamps deniedAt on the shared request", async () => {
    const { recipient } = makeRecipient(["req-1"]);
    const setSpy = vi.fn();
    await denyConnectionRequest(recipient as any, {
      $jazz: { id: "req-1", set: setSpy },
    } as any);
    expect(setSpy).toHaveBeenCalledWith("deniedAt", expect.any(Date));
  });

  test("does not re-stamp deniedAt when already set", async () => {
    const { recipient } = makeRecipient(["req-1"]);
    const setSpy = vi.fn();
    await denyConnectionRequest(recipient as any, {
      deniedAt: new Date(),
      $jazz: { id: "req-1", set: setSpy },
    } as any);
    expect(setSpy).not.toHaveBeenCalled();
  });
});

describe("dismissConnectionRequest", () => {
  test("only records the ID — does NOT touch incomingConnectionRequests", async () => {
    const { recipient, deleteSpy, setDismissedSpy } = makeRecipient(["req-1"]);
    await dismissConnectionRequest(recipient as any, {
      $jazz: { id: "req-1" },
    } as any);
    expect(setDismissedSpy).toHaveBeenCalledWith("req-1", true);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] Rewrite `tests/unit/jazz/use-incoming-connection-requests.test.ts` — full replacement:

```ts
import { describe, test, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIncomingConnectionRequests } from "@/jazz/use-incoming-connection-requests";

const accountMock = vi.fn();
vi.mock("jazz-tools/react", () => ({
  useAccount: () => accountMock(),
}));

const FUTURE = new Date(Date.now() + 60_000);
const PAST = new Date(Date.now() - 60_000);

function makeRequest(id: string, overrides: Record<string, unknown> = {}) {
  return {
    $jazz: { id },
    requesterDisplayName: "Bob",
    requesterAccountID: "bob-account",
    createdAt: new Date(Date.now() - 10_000),
    expiresAt: FUTURE,
    ...overrides,
  };
}

function withRoot(incoming: any[], dismissedIDs: string[] = []) {
  const record: Record<string, any> = {};
  for (const r of incoming) record[r.$jazz.id] = r;
  const dismissed: Record<string, boolean> = {};
  for (const id of dismissedIDs) dismissed[id] = true;
  accountMock.mockReturnValue({
    $isLoaded: true,
    root: {
      incomingConnectionRequests: record,
      dismissedRequests: dismissed,
    },
  });
}

describe("useIncomingConnectionRequests", () => {
  test("returns a pending request with dismissedLocally=false", () => {
    withRoot([makeRequest("req-1")]);
    const { result } = renderHook(() => useIncomingConnectionRequests());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].dismissedLocally).toBe(false);
  });

  test("locally-dismissed requests STAY in the list, flagged dismissedLocally", () => {
    withRoot([makeRequest("req-1")], ["req-1"]);
    const { result } = renderHook(() => useIncomingConnectionRequests());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].dismissedLocally).toBe(true);
  });

  test("approved, denied, and expired requests are filtered out", () => {
    withRoot([
      makeRequest("req-approved", { approvedAt: new Date() }),
      makeRequest("req-denied", { deniedAt: new Date() }),
      makeRequest("req-expired", { expiresAt: PAST }),
      makeRequest("req-live"),
    ]);
    const { result } = renderHook(() => useIncomingConnectionRequests());
    expect(result.current.map((p) => (p.request as any).$jazz.id)).toEqual([
      "req-live",
    ]);
  });

  test("collapses duplicate requests per requester — latest createdAt wins (FM1 belt)", () => {
    withRoot([
      makeRequest("req-old", { createdAt: new Date(Date.now() - 60_000) }),
      makeRequest("req-new", { createdAt: new Date(Date.now() - 1_000) }),
      makeRequest("req-other", {
        requesterAccountID: "carol-account",
        createdAt: new Date(Date.now() - 30_000),
      }),
    ]);
    const { result } = renderHook(() => useIncomingConnectionRequests());
    expect(result.current.map((p) => (p.request as any).$jazz.id)).toEqual([
      "req-other",
      "req-new",
    ]);
  });
});
```

- [ ] Run `nix-shell --run 'npx vitest run tests/unit/jazz/connection-request-actions.test.ts tests/unit/jazz/use-incoming-connection-requests.test.ts'` — expect **PASS** (9 tests).
- [ ] Run `nix-shell --run "grep -rn 'incomingRequests\|dismissedRequestIDs' src/ --include='*.ts' --include='*.tsx' | grep -v schema/"` — expect **zero hits** outside `src/jazz/schema/ArcanAccount.ts`.
- [ ] Run `nix-shell --run 'npm run typecheck'` — expect **PASS**.
- [ ] Run `nix-shell --run 'npx vitest run'` — expect **PASS**.
- [ ] Commit: `git add -A && git commit -m "feat(requests): keyed incoming/dismissed records — drain-race duplication structurally impossible; per-requester render collapse"`

## Task 8: Invite screen — pure view of watcher-owned state

Kills the 3-second poll and the tab-lifetime contact write; adds `already contacts` / `request pending` gates (FM8), Connect-time re-validation, and honest sent-screen states. All existing testids (`invite-sent`, `invite-approved`, `invite-declined`, `invite-expired`, `invite-accept-btn`, …) are preserved so the e2e suites keep passing.

- [ ] Edit `src/routes/invite/index.tsx`:
  1. Delete the `writeInviterAsContact` helper (lines 47-69) entirely.
  2. Delete the approval-poll effect (the `useEffect` starting `// Poll the ConnectionRequest for approval once sent`, lines 177-210) and the `const [request, setRequest] = useState<any | null>(null);` line.
  3. Imports: remove `ConnectionRequest`, `mintConnectionRequest`, `deliverConnectionRequest` (Task 5 interim); add `import { sendConnectionRequest, getContact } from "@/jazz/handshake";` and `import { useRef } from "react";` (extend the existing react import).
  4. Resolve becomes:

```ts
  const me = useAccount(ArcanAccount, {
    resolve: {
      profile: true,
      root: {
        contacts: { $each: true },
        outgoingRequests: { $each: { request: true } },
      },
    },
  });
```

  5. Add the durable-state derivation after the `useSharedGroups`/avatar hooks:

```ts
  // Durable handshake state (watcher-owned) — the screen is a VIEW of it.
  const inviterID: string | undefined = invitation?.inviterAccountID;
  const isContact =
    me.$isLoaded && inviterID ? !!getContact(me, inviterID) : false;
  const outEntry: any =
    me.$isLoaded && inviterID
      ? (me as any).root?.outgoingRequests?.[inviterID]
      : undefined;
  const connectBusyRef = useRef(false);
```

  6. Replace `onConnect` entirely:

```ts
  const onConnect = async () => {
    // In-flight guard (FM1): a double-tap must not mint twice.
    if (!me.$isLoaded || !invitation || connectBusyRef.current) return;
    connectBusyRef.current = true;
    setPhase("sending");
    try {
      // Re-validate at Connect time — a parked confirm screen can outlive
      // revocation/expiry (inventory §5); the mount-time check is not enough.
      const fresh = (await loadInvitationAsGuest(invitation.$jazz.id)) as any;
      if (fresh.revokedAt) {
        setPhase("expired");
        setErr("invite revoked");
        return;
      }
      if (
        fresh.expiresAt &&
        new Date(fresh.expiresAt).getTime() < Date.now()
      ) {
        setPhase("expired");
        return;
      }

      const result = await sendConnectionRequest(
        me as any,
        {
          accountID: invitation.inviterAccountID,
          fingerprint: invitation.inviterFingerprint,
          displayName: invitation.inviterDisplayName,
        },
        {
          channel: "invite",
          // Channel reflects how THIS recipient opened the invite (scanned
          // QR vs pasted link) — the same invitation serves both.
          requestChannel: openedChannel,
          invitationID: invitation.$jazz?.id,
          invitationExpiresAt: invitation.expiresAt
            ? new Date(invitation.expiresAt)
            : undefined,
        },
      );
      if (result.outcome === "unavailable") {
        setPhase("error");
        setErr("account not ready — try again");
        return;
      }
      // "already-contact" renders from isContact; every send outcome
      // ("sent" / "already-pending" / "send-failed") renders from the
      // durable entry. Local phase only marks that we finished the action.
      setPhase("sent");
    } catch (e) {
      setPhase("error");
      setErr(String(e));
    } finally {
      connectBusyRef.current = false;
    }
  };
```

  7. In `renderPhase()`, replace the `if (phase === "sent")` block AND extend the confirm branch. Insert this block BEFORE the `if (phase === "sent")` position (replacing it):

```ts
    // ── Durable-entry-driven states (watcher-owned) ──────────────────────
    const entryLive =
      outEntry &&
      !outEntry.archivedAt &&
      (outEntry.status === "pending" || outEntry.status === "failed");

    if (phase === "sent" || (phase === "confirm" && entryLive)) {
      // Terminal states first — the watcher may have transitioned the entry
      // while this screen sat open.
      if (outEntry?.status === "approved" || (phase === "sent" && isContact)) {
        return (
          <InviteStatusScreen
            markSize={48}
            title="contact added"
            rootTestId="invite-approved"
            primary={{ label: "open Arcan", onClick: () => navigate("/") }}
          />
        );
      }
      if (outEntry?.status === "denied") {
        return (
          <InviteStatusScreen
            markSize={48}
            title="request declined"
            sub="they declined your request."
            rootTestId="invite-declined"
            outline={{ label: "back to app", onClick: () => navigate("/") }}
            outlineTestId="invite-declined-home-btn"
          />
        );
      }
      if (outEntry?.status === "expired") {
        return (
          <InviteStatusScreen
            markSize={48}
            title="this request has expired"
            rootTestId="invite-expired"
            outline={{ label: "go home", onClick: () => navigate("/") }}
          />
        );
      }
      // Honest delivery states (spec §6): delivered only after the Inbox
      // end-to-end ack; failed announces the automatic retry.
      const sub =
        outEntry?.status === "failed"
          ? "couldn't deliver yet — we'll retry automatically. you can close this tab."
          : outEntry?.deliveredAt
            ? "delivered. you can close this tab — the contact appears once they accept."
            : "sending…";
      return (
        <InviteStatusScreen
          markSize={48}
          title="request sent — waiting for approval…"
          sub={sub}
          rootTestId="invite-sent"
          outline={{ label: "back to app", onClick: () => navigate("/") }}
          outlineTestId="invite-sent-home-btn"
        />
      );
    }

    // Already connected (FM8): no silent re-mint from a parked/permanent link.
    if (phase === "confirm" && isContact) {
      return (
        <InviteStatusScreen
          markSize={48}
          title="you're already contacts"
          sub={invitation?.inviterDisplayName ?? undefined}
          rootTestId="invite-already-contact"
          primary={{ label: "open Arcan", onClick: () => navigate("/") }}
        />
      );
    }
```

  8. Delete the old standalone `approved` / `declined` phase blocks (they are unreachable now — those phases are never set; remove `"approved"` and `"declined"` from the `Phase` union).
  9. Update the file-header comment (lines 17-19): the poll + `writeInviterAsContact` are gone; the screen renders watcher-owned durable state.
- [ ] Run `nix-shell --run 'npm run typecheck'` — expect **PASS**.
- [ ] Run `nix-shell --run 'npx playwright test tests/e2e/contact-invitation.spec.ts tests/e2e/connection-request-decline.spec.ts tests/e2e/invite-before-signin.spec.ts'` — expect **PASS** (approve path now watcher-driven; decline path entry-driven; testids unchanged).
- [ ] Commit: `git add -A && git commit -m "feat(invite): confirm screen gates on contacts/pending, revalidates at Connect, renders watcher-owned sent states (poll removed)"`

## Task 9: Members screen — pending-aware connect button

- [ ] Edit `src/routes/conversations/members.tsx`:
  1. Resolve (line 173): add `outgoingRequests: { $each: true },` beside `contacts`.
  2. Below the `knownContactIDs` set (line ~276-281), add:

```ts
  // Contact-robustness: live pending outgoing requests, keyed by counterpart
  // account ID — drives the disabled "request pending" state (spec §6).
  const pendingOutgoingIDs = new Set(
    Object.values(
      ((me as any).root?.outgoingRequests as Record<string, any>) ?? {},
    )
      .filter((e: any) => e && e.status === "pending" && !e.archivedAt)
      .map((e: any) => e.counterpartAccountID as string),
  );
```

  3. Thread a new boolean prop `requestPending` into the `MemberKebabMenu` sub-component (add it to the component's prop list and its call site, passing `pendingOutgoingIDs.has(member.accountID)`).
  4. Edit the "request connection" menu item (the `<button>` with `data-testid={`request-connection-${member.accountID}`}`, lines 117-122): add `disabled={requestPending}`, append `disabled:opacity-50 disabled:cursor-default` to its existing className string, and replace the `request connection` label text with `{requestPending ? "request pending" : "request connection"}`. Keep the existing onClick handler unchanged (the single-path `sendConnectionRequest` makes a stray click on a stale menu harmless anyway — it returns "already-pending").
- [ ] Run `nix-shell --run 'npm run typecheck'` — expect **PASS**.
- [ ] Run `nix-shell --run 'npm run check-tokens'` — expect **PASS** (only opacity/cursor utilities added).
- [ ] Run `nix-shell --run 'npx playwright test tests/e2e/group-member-management.spec.ts'` — expect **PASS**.
- [ ] Commit: `git add -A && git commit -m "feat(members): connect button reflects durable pending state"`

## Task 10: Add-contact screen — lazy invitation minting (FM10)

Invitations are minted on first QR-reveal or share/copy — never on mount or TTL toggle. Five e2e touchpoints open `/contacts/add` and read the sr-only URL spans; each gets a reveal click.

- [ ] Edit `src/routes/contacts/add.tsx`:
  1. Delete the mount/TTL `useEffect` (lines 58-74) and the comment above it.
  2. Add `const [revealed, setRevealed] = useState(false);` beside the other state, and replace the invitation-creation logic with:

```ts
  // Prevent double-creation (StrictMode double-invoke + rapid clicks).
  const creationInProgressRef = useRef(false);

  // FM10: invitations are minted LAZILY — on first QR reveal or share/copy,
  // never on mount. Each /contacts/add visit no longer leaks an
  // everyone-writer Invitation nobody ever saw.
  async function mintInvitation(nextTtl: LinkTtl): Promise<string | null> {
    if (creationInProgressRef.current) return null;
    creationInProgressRef.current = true;
    try {
      const { url } = await createInvitation(me as any, "link", nextTtl);
      setInviteUrl(url);
      return url;
    } catch {
      toast({ icon: "alert", text: "couldn't create invite — try again", tone: "error" });
      return null;
    } finally {
      creationInProgressRef.current = false;
    }
  }

  async function handleReveal() {
    if (!me.$isLoaded) return;
    setRevealed(true);
    if (!inviteUrl) await mintInvitation(ttl);
  }
```

  3. Replace `handlePrimary` with a lazy-minting version:

```ts
  async function handlePrimary() {
    const url = inviteUrl ?? (await mintInvitation(ttl));
    if (!url) return;
    setRevealed(true);
    if (canShare) {
      try {
        await navigator.share({ url });
      } catch {
        // user cancelled the share sheet — no-op
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast({ icon: "copy", text: "invite link copied", tone: "accent" });
    }
  }
```

  4. Replace the `onTtl` prop with:

```ts
      onTtl={(t) => {
        setInviteUrl(null);
        setTtl(t as LinkTtl);
        // Re-mint immediately only if the QR is already revealed (the user
        // has shown intent); otherwise stay lazy (FM10).
        if (revealed) void mintInvitation(t as LinkTtl);
      }}
```

  5. Replace the `qrSlot` prop with:

```tsx
      qrSlot={
        inviteUrl ? (
          <QRDisplay url={withQrChannelMarker(inviteUrl)} size={128} />
        ) : (
          <button
            type="button"
            onClick={() => void handleReveal()}
            data-testid="add-contact-reveal-btn"
            className="flex h-32 w-32 items-center justify-center rounded-r-2 border border-dashed border-hairline p-2 text-center font-body text-ui-sub text-dim hover:bg-panel-2"
          >
            tap to reveal QR
          </button>
        )
      }
```

  (the `hiddenUrlSlot` already renders only when `inviteUrl` exists — unchanged.)
- [ ] Edit `tests/e2e/helpers.ts` `establishContact` — insert after line 197 (`await inviterPage.goto("/contacts/add");`):

```ts
  // Invitations are minted lazily (contact-robustness FM10): reveal first.
  await inviterPage.getByTestId("add-contact-reveal-btn").click();
```

- [ ] Edit `tests/e2e/add-contact-paste.spec.ts` — insert the same reveal click after line 19 (`await inviterPage.goto("/contacts/add");`):

```ts
    await inviterPage.getByTestId("add-contact-reveal-btn").click();
```

- [ ] Edit `tests/e2e/invite-before-signin.spec.ts` — insert after line 31 (`await pageB.goto("/contacts/add");`):

```ts
    await pageB.getByTestId("add-contact-reveal-btn").click();
```

- [ ] Edit `tests/e2e/connection-request-delivery.spec.ts` — insert the reveal click after BOTH `/contacts/add` gotos (lines 35 and 105):

```ts
    await bob.getByTestId("add-contact-reveal-btn").click();
```

```ts
    await host.getByTestId("add-contact-reveal-btn").click();
```

- [ ] Edit `tests/e2e/connection-request-decline.spec.ts` — insert after line 30 (`await bob.goto("/contacts/add");`):

```ts
    await bob.getByTestId("add-contact-reveal-btn").click();
```

- [ ] Run `nix-shell --run 'npm run typecheck'` and `nix-shell --run 'npm run check-tokens'` — expect **PASS**.
- [ ] Run `nix-shell --run 'npx playwright test tests/e2e/add-contact-paste.spec.ts tests/e2e/contact-invitation.spec.ts tests/e2e/connection-request-delivery.spec.ts'` — expect **PASS**.
- [ ] Commit: `git add -A && git commit -m "feat(add-contact): mint invitations lazily on reveal/share, not on mount or TTL toggle"`

## Task 11: Notification-send discipline + system-event pre-check (spec §4)

Conversation-creation and member-add notifications get durable retry state; the `"added"` system event gets a membership pre-check so concurrent admin adds cannot double-log or silently overwrite a role. No new unit tests here by design: the task is thin I/O orchestration over primitives already unit-tested (record semantics, timeout wrapper) — behavior is covered by `conversation-auto-discovery` + `group-member-management` e2e.

- [ ] Edit `src/jazz/handshake.ts` — export the timeout helper (change `function withTimeout` to `export function withTimeout`).
- [ ] Edit `src/jazz/conversation.ts` — add imports (`import { withTimeout, REQUEST_ACK_TIMEOUT_MS } from "./handshake";`, `import { PendingNotification } from "./schema/PendingNotification";`, and extend the existing react/jazz-react imports with `useRef` / `useAccount` / `ArcanAccount` if not already present), then add the two functions and the retry hook near `useConversationInboxSubscription`:

```ts
/**
 * Send a conversation/member-add inbox notification with durable retry
 * state (contact-robustness spec §4). The pendingNotifications entry is
 * written BEFORE the network attempt and deleted only on the Inbox
 * end-to-end ack; useNotificationRetry re-sends survivors on
 * launch/reconnect. Re-delivery is safe: the receive side is the hardened
 * three-layer knownConversations drain (raw-ID dedup).
 */
export async function sendConversationNotification(
  me: Account,
  conversation: any,
  targetAccountID: string,
  kind: "conversation" | "member-add",
): Promise<void> {
  const conversationID = conversation.$jazz.id as string;
  const pending = (me as any).root?.pendingNotifications;
  const key = `${conversationID}:${targetAccountID}`;
  if (pending && typeof pending.$jazz?.set === "function" && !pending[key]) {
    pending.$jazz.set(
      key,
      PendingNotification.create(
        {
          conversation,
          targetAccountID,
          kind,
          createdAt: new Date(),
          attempts: 0,
        },
        { owner: me },
      ),
    );
  }
  await attemptNotificationDelivery(me, conversationID, targetAccountID);
}

/**
 * One delivery attempt for a pending notification. Ack → entry deleted;
 * failure/timeout → entry survives with bumped attempt bookkeeping.
 */
export async function attemptNotificationDelivery(
  me: Account,
  conversationID: string,
  targetAccountID: string,
): Promise<void> {
  const pending = (me as any).root?.pendingNotifications;
  const key = `${conversationID}:${targetAccountID}`;
  const entry = pending?.[key];
  try {
    if (entry && typeof entry.$jazz?.set === "function") {
      entry.$jazz.set("attempts", (entry.attempts ?? 0) + 1);
      entry.$jazz.set("lastAttemptAt", new Date());
    }
    // Fresh notification group — the target has no prior role here, so
    // InboxSender's add-as-writer call won't conflict with their role on
    // the conversation group itself.
    const notificationGroup = Group.create({ owner: me });
    const notification = ConversationNotification.create(
      { conversationID },
      { owner: notificationGroup },
    );
    const sender = await InboxSender.load<typeof notification>(
      targetAccountID as any,
      me,
    );
    await withTimeout(sender.sendMessage(notification), REQUEST_ACK_TIMEOUT_MS);
    if (pending && typeof pending.$jazz?.delete === "function") {
      pending.$jazz.delete(key);
    }
  } catch (e) {
    console.warn(
      `[inbox] notification to ${targetAccountID} failed (will retry):`,
      e,
    );
  }
}

/**
 * App-level retry for unacked conversation/member-add notifications —
 * mounted once in App.tsx beside the other drains. Once per launch + on
 * browser reconnect (same policy as the outgoing-request watcher).
 */
export function useNotificationRetry(): void {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { pendingNotifications: { $each: true } } },
  });
  const retriedThisLaunch = useRef(false);

  useEffect(() => {
    if (!me.$isLoaded) return;

    const retry = () => {
      const pending = (me as any).root?.pendingNotifications;
      if (!pending) return;
      for (const [key, entry] of Object.entries(
        pending as Record<string, any>,
      )) {
        if (!entry?.targetAccountID) continue;
        const conversationID = key.split(":")[0];
        void attemptNotificationDelivery(
          me as any,
          conversationID,
          entry.targetAccountID,
        );
      }
    };

    if (!retriedThisLaunch.current) {
      retriedThisLaunch.current = true;
      retry();
    }
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.$isLoaded]);
}
```

- [ ] Edit `src/jazz/conversation.ts` — replace the three inline fire-and-forget send blocks with the disciplined path:
  1. `findOrCreate1to1Conversation` (lines 176-190, the whole `void (async () => { … })();` block) →

```ts
  void sendConversationNotification(me, conversation, otherAccountID, "conversation");
```

  2. `createGroupConversation` (lines 234-255, the `for (const accountID of participantAccountIDs) { void (async () => { … })(); }` loop) →

```ts
  for (const accountID of participantAccountIDs) {
    void sendConversationNotification(me, conversation, accountID, "conversation");
  }
```

  3. `addMemberToConversation` (lines 410-430, the `void (async () => { … })();` block) →

```ts
  void sendConversationNotification(me, conversation, newAccountID, "member-add");
```

  (the `const conversationID = conversation.$jazz.id as string;` lines above each block become unused — delete them.)
- [ ] Edit `src/jazz/conversation.ts` `addMemberToConversation` — membership pre-check before the system event, and a result the UI can surface:

```ts
export async function addMemberToConversation(
  me: Account,
  conversation: any,
  newAccountID: string,
  role: "admin" | "writer" = "writer",
): Promise<"added" | "already-member"> {
  const conversationGroup = conversation.$jazz?.owner as Group | undefined;
  if (!conversationGroup) {
    throw new Error("Conversation has no owning group");
  }

  // Membership pre-check (spec §4): a concurrent admin add must not
  // double-log "added" — and a silent role overwrite (addMember on an
  // existing member re-assigns the role) is surfaced instead of swallowed.
  const existingRole = conversationGroup.getRoleOf(newAccountID as any);
  if (existingRole) return "already-member";

  const newAccount = await loadAccountByID(me, newAccountID);
  if (!newAccount) {
    throw new Error(`Cannot load account ${newAccountID}`);
  }

  writeSystemEvent(me, conversation, {
    kind: "added",
    targetAccountID: newAccountID,
  });

  conversationGroup.addMember(newAccount, role);

  void sendConversationNotification(me, conversation, newAccountID, "member-add");
  return "added";
}
```

- [ ] Edit `src/routes/conversations/members.tsx` — in `handleAddMembers` (lines 290-297), capture and surface the pre-check result:

```ts
      for (const contact of contacts) {
        const result = await addMemberToConversation(
          me as any,
          conversation,
          contact.contactAccountID as string,
          "writer",
        );
        if (result === "already-member") {
          toast({
            icon: "check",
            text: `${contact.displayNameLocal ?? "that person"} is already a member`,
            tone: "neutral",
          });
        }
      }
```

- [ ] Edit `src/App.tsx` — mount the retry hook after `useOutgoingRequestWatcher();`:

```ts
  // Contact-robustness slice: re-send unacked conversation/member-add
  // notifications (durable pendingNotifications entries) on launch/reconnect.
  useNotificationRetry();
```

  (import `useNotificationRetry` from `@/jazz/conversation`.)
- [ ] Run `nix-shell --run 'npm run typecheck'` — expect **PASS**.
- [ ] Run `nix-shell --run 'npx vitest run'` — expect **PASS**.
- [ ] Run `nix-shell --run 'npx playwright test tests/e2e/conversation-auto-discovery.spec.ts tests/e2e/group-member-management.spec.ts'` — expect **PASS**.
- [ ] Commit: `git add -A && git commit -m "feat(notifications): durable outbound retry records + membership pre-check on the added system event"`

## Task 12: Pruning + dead-code removal (TDD on the prune predicate)

- [ ] Write the failing test `tests/unit/jazz/handshake-prune.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import {
  shouldPruneIncomingRequest,
  SETTLED_REQUEST_RETENTION_MS,
} from "@/jazz/handshake";

const NOW = 1_800_000_000_000;
const OLD = NOW - SETTLED_REQUEST_RETENTION_MS - 1000;
const RECENT = NOW - 1000;

describe("shouldPruneIncomingRequest", () => {
  test("recently approved → kept", () => {
    expect(shouldPruneIncomingRequest({ approvedAtMs: RECENT }, NOW)).toBe(false);
  });
  test("approved >30 days ago → pruned", () => {
    expect(shouldPruneIncomingRequest({ approvedAtMs: OLD }, NOW)).toBe(true);
  });
  test("denied >30 days ago → pruned", () => {
    expect(shouldPruneIncomingRequest({ deniedAtMs: OLD }, NOW)).toBe(true);
  });
  test("expired >30 days ago (never acted on) → pruned", () => {
    expect(shouldPruneIncomingRequest({ expiresAtMs: OLD }, NOW)).toBe(true);
  });
  test("recently expired → kept (grace window)", () => {
    expect(shouldPruneIncomingRequest({ expiresAtMs: RECENT }, NOW)).toBe(false);
  });
  test("live pending request → kept", () => {
    expect(
      shouldPruneIncomingRequest({ expiresAtMs: NOW + 1000 }, NOW),
    ).toBe(false);
  });
});
```

- [ ] Run `nix-shell --run 'npx vitest run tests/unit/jazz/handshake-prune.test.ts'` — expect **FAIL**.
- [ ] Edit `src/jazz/handshake.ts` — add:

```ts
/** Retention for settled/expired incoming requests (spec §5). */
export const SETTLED_REQUEST_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function shouldPruneIncomingRequest(
  req: { approvedAtMs?: number; deniedAtMs?: number; expiresAtMs?: number },
  nowMs: number,
): boolean {
  const settledAtMs = req.approvedAtMs ?? req.deniedAtMs;
  if (settledAtMs !== undefined) {
    return nowMs - settledAtMs > SETTLED_REQUEST_RETENTION_MS;
  }
  if (req.expiresAtMs !== undefined && req.expiresAtMs <= nowMs) {
    return nowMs - req.expiresAtMs > SETTLED_REQUEST_RETENTION_MS;
  }
  return false;
}

/**
 * Startup pruning (spec §5): settled incoming requests past retention,
 * expired pairing ceremonies, and revoked/expired invitations. All
 * single-writer state — no cross-device coordination needed.
 */
export function pruneHandshakeState(me: any): void {
  const nowMs = Date.now();

  const incoming = me?.root?.incomingConnectionRequests;
  if (incoming && typeof incoming.$jazz?.delete === "function") {
    for (const [id, r] of Object.entries(incoming as Record<string, any>)) {
      if (id === "$jazz" || !r) continue;
      const prune = shouldPruneIncomingRequest(
        {
          approvedAtMs: r.approvedAt
            ? new Date(r.approvedAt).getTime()
            : undefined,
          deniedAtMs: r.deniedAt ? new Date(r.deniedAt).getTime() : undefined,
          expiresAtMs: r.expiresAt
            ? new Date(r.expiresAt).getTime()
            : undefined,
        },
        nowMs,
      );
      if (!prune) continue;
      incoming.$jazz.delete(id);
      const dismissed = me?.root?.dismissedRequests;
      if (
        dismissed?.[id] &&
        typeof dismissed.$jazz?.delete === "function"
      ) {
        dismissed.$jazz.delete(id);
      }
    }
  }

  const pairings = me?.root?.pendingPairings;
  if (pairings && typeof pairings.$jazz?.remove === "function") {
    pairings.$jazz.remove(
      (p: any) => p?.expiresAt && new Date(p.expiresAt).getTime() < nowMs,
    );
  }

  const invites = me?.root?.liveInvitations;
  if (invites && typeof invites.$jazz?.remove === "function") {
    invites.$jazz.remove(
      (i: any) =>
        !!i?.revokedAt ||
        (i?.expiresAt && new Date(i.expiresAt).getTime() < nowMs),
    );
  }
}
```

- [ ] Edit `useOutgoingRequestWatcher` in `src/jazz/handshake.ts` — extend the hook's resolve so the pruned collections are loaded:

```ts
    resolve: {
      root: {
        contacts: { $each: true },
        outgoingRequests: { $each: { request: true } },
        incomingConnectionRequests: { $each: { $onError: "catch" } },
        dismissedRequests: true,
        pendingPairings: { $each: { $onError: "catch" } },
        liveInvitations: { $each: { $onError: "catch" } },
      },
    },
```

  and call `pruneHandshakeState(me);` inside the launch-retry effect, right after the `retryFailed();` call in the `if (!retriedThisLaunch.current)` branch.
- [ ] Run `nix-shell --run 'npx vitest run tests/unit/jazz/handshake-prune.test.ts'` — expect **PASS** (6 tests).
- [ ] Remove the orphaned `markRead` self-heal: run `nix-shell --run "grep -rn 'markRead' src/"` — expect the definition in `src/jazz/notifications.ts` plus the stale comment in `src/hooks/useNewMessageEvents.ts` only (inventory §7: zero call sites). Then delete the `markRead` function (lines 48-86 of `src/jazz/notifications.ts`, including its docstring) and reword the `useNewMessageEvents.ts` line-14 comment to `*   - Opening the conversation advances the lastReadAt cutoff → unread`.
- [ ] Edit `tests/unit/jazz/notifications.test.ts` — remove the `markRead` import (line 2 becomes `import { getUnreadCount } from "@/jazz/notifications";`), the co.record stub block (lines ~22 onward) if it exists solely for markRead, and the whole `describe("markRead", …)` block (lines 137-193).
- [ ] Run `nix-shell --run 'npx vitest run'` — expect **PASS**.
- [ ] Run `nix-shell --run 'npm run typecheck'` — expect **PASS**.
- [ ] Commit: `git add -A && git commit -m "feat(hygiene): startup pruning of settled requests/pairings/invitations; drop orphaned markRead"`

## Task 13: Visible repair affordance + TOFU-conflict surfacing (spec §5)

Never silent: a 1:1 whose counterpart is missing from `contacts` gets an explicit "add to contacts" action (profile view + conversation banner); a `fingerprintConflict` flag renders a warning in the profile safety-number section.

- [ ] Edit `src/ui/screens/profile-screen.tsx` — add an optional slot to the props interface (after `safetySlot?: ReactNode;`):

```ts
  // intent-fix: contact-robustness repair affordance (2026-07-20 spec §5) —
  // no proto reference; renders container-provided secondary action under
  // the message button.
  secondarySlot?: ReactNode;
```

  destructure `secondarySlot` alongside the other props, and render it immediately after the element containing the `onMessage` PButton (line ~123):

```tsx
          {secondarySlot && (
            <div className="w-full max-w-[320px] mt-2">{secondarySlot}</div>
          )}
```

- [ ] Edit `src/components/profile-view.tsx`:
  1. Add `import { getContact, upsertContact } from "@/jazz/handshake";` (getContact already imported in Task 4 — extend it).
  2. Add the handler after `handleMessage`:

```ts
  // Visible repair (spec §5): a conversation exists but the counterpart is
  // missing from contacts (pre-slice FM3/FM4 damage, or intentional stub
  // messaging). The user explicitly re-adds — pinning the counterpart's
  // CURRENT key after an explicit confirm. Silent auto-repair would re-TOFU
  // without the user noticing (rejected in the design).
  async function handleAddToContacts() {
    if (isOwn || contact) return;
    if (!fingerprintHex || fingerprintHex.length !== 64) {
      toast({
        icon: "alert",
        text: "can't read their identity key yet — try again shortly",
        tone: "error",
      });
      return;
    }
    const ok = await confirmDialog({
      title: "add to contacts",
      body: "this pins their current identity key. compare security codes in person if you want to be certain it's really them.",
      confirmLabel: "add contact",
      testId: "confirm-add-to-contacts",
    });
    if (!ok) return;
    const result = upsertContact(me as any, {
      contactAccountID: accountID,
      fingerprint: fingerprintHex,
      displayName: remoteDisplayName ?? "unknown",
    });
    if (result === "created") {
      toast({ icon: "check", text: "contact added", tone: "success" });
    }
  }
```

  3. In the `<ProfileScreen>` JSX, add:

```tsx
          secondarySlot={
            !contact ? (
              <PButton
                full
                label="add to contacts"
                onClick={() => void handleAddToContacts()}
                disabled={busy}
                data-testid="profile-add-to-contacts-btn"
              />
            ) : undefined
          }
```

  4. Replace the other-branch `safetySlot` prop value with the conflict-aware version:

```tsx
          safetySlot={
            <>
              {contact?.fingerprintConflict && (
                <p
                  className="mb-2 text-center text-xs text-red"
                  data-testid="fingerprint-conflict-warning"
                >
                  identity key changed — verify in person before trusting this
                  contact.
                </p>
              )}
              {fingerprintHex && fingerprintHex.length === 64 ? (
                <SafetyNumber fingerprintHex={fingerprintHex} />
              ) : (
                <p className="text-xs text-dim">Security code not available.</p>
              )}
            </>
          }
```

- [ ] Edit `src/routes/conversations/detail.tsx` — inside `composerElement`, insert between the `composerDisabled` banner block and `<ChatComposer`:

```tsx
      {counterpartAccountID && !contact && (
        <div
          className="flex items-center justify-between gap-3 px-3 py-2 border-t border-hairline"
          data-testid="not-a-contact-banner"
        >
          <span className="font-body text-ui-sub text-dim">
            not in your contacts.
          </span>
          <button
            type="button"
            onClick={() => navigate(`/profile/${counterpartAccountID}`)}
            data-testid="not-a-contact-add-btn"
            className="shrink-0 px-2 py-1 font-body text-ui-sub text-arcan-accent rounded border border-hairline"
          >
            view profile to add
          </button>
        </div>
      )}
```

  (`counterpartAccountID`, `contact`, and `navigate` all already exist in the component; the markup mirrors the adjacent `composer-disabled-banner`.)
- [ ] Run `nix-shell --run 'npm run typecheck'`, `nix-shell --run 'npm run check-tokens'`, `nix-shell --run 'npm run check-ui-purity'` — expect **PASS** for all three (the presenter change is a pure ReactNode slot).
- [ ] Run `nix-shell --run 'npm run parity'` — expect **142/142** (optional prop, undefined in all parity fixtures).
- [ ] Commit: `git add -A && git commit -m "feat(repair): visible add-to-contacts affordance for contact-less 1:1s + TOFU-conflict warning in the safety section"`

## Task 14: Robustness e2e suite

Two-device drain-race duplication is deliberately NOT e2e'd — it cannot be raced deterministically; the keyed-record convergence is covered at unit level (Tasks 2/7). The denial path keeps its existing spec (`connection-request-decline.spec.ts`, now watcher-driven under the same testids).

- [ ] Create `tests/e2e/connection-robustness.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import {
  createAccount,
  establishContact,
  createConversation,
  openMembers,
  memberAccountID,
  memberAction,
  openMemberMenu,
} from "./helpers";

/**
 * Contact-robustness slice e2e (spec §7).
 *
 * Covers: double-tap Connect mints exactly one request (FM1); the requester
 * gets the contact even after closing the tab before approval (FM3 — the
 * app-level watcher, not the old tab-lifetime poll); the group channel
 * produces contacts on BOTH sides (FM4); a revoked invite is blocked at
 * Connect time, not just at mount (inventory §5).
 */

async function revealInviteUrl(page: Page): Promise<string> {
  await page.goto("/contacts/add");
  // Invitations mint lazily (FM10) — reveal first.
  await page.getByTestId("add-contact-reveal-btn").click();
  const copyUrl = page.getByTestId("copy-url-text");
  await copyUrl.waitFor({ state: "attached", timeout: 15_000 });
  return (await copyUrl.textContent())!.trim();
}

test("double-tap Connect mints exactly one request", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const alice = await ctxA.newPage();
  const ctxB = await browser.newContext();
  const bob = await ctxB.newPage();
  try {
    await bob.goto("/");
    await createAccount(bob, "Bob");
    await alice.goto("/");
    await createAccount(alice, "Alice");

    const inviteUrl = await revealInviteUrl(bob);

    await alice.goto("/");
    await alice.goto(inviteUrl);
    await expect(alice.getByTestId("invite-inviter-name")).toContainText(
      "Bob",
      { timeout: 15_000 },
    );
    // Two rapid activations — the in-flight guard + durable outgoing entry
    // must collapse them into ONE ConnectionRequest.
    await alice.getByTestId("invite-accept-btn").dblclick();
    await expect(alice.getByTestId("invite-sent")).toBeVisible({
      timeout: 30_000,
    });

    await expect(async () => {
      await bob.goto("/connections/pending");
      await expect(bob.getByTestId("approve").first()).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 30_000 });
    await expect(bob.getByTestId("approve")).toHaveCount(1);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test("requester who closed the tab gets the contact on next launch (FM3)", async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const alice = await ctxA.newPage();
  const ctxB = await browser.newContext();
  const bob = await ctxB.newPage();
  try {
    await bob.goto("/");
    await createAccount(bob, "Bob");
    await alice.goto("/");
    await createAccount(alice, "Alice");

    const inviteUrl = await revealInviteUrl(bob);

    await alice.goto("/");
    await alice.goto(inviteUrl);
    await expect(alice.getByTestId("invite-inviter-name")).toContainText(
      "Bob",
      { timeout: 15_000 },
    );
    await alice.getByTestId("invite-accept-btn").click();
    await expect(alice.getByTestId("invite-sent")).toBeVisible({
      timeout: 30_000,
    });
    // The old poll died with the tab. The durable outgoingRequests entry
    // must not.
    await alice.close();

    await expect(async () => {
      await bob.goto("/connections/pending");
      await bob.getByTestId("approve").first().click({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });

    // Fresh page, same storage — the launch watcher sees approvedAt and
    // writes the contact.
    const alice2 = await ctxA.newPage();
    await alice2.goto("/?tab=contacts");
    await expect(alice2.getByTestId("sidebar-contacts-list")).toContainText(
      "Bob",
      { timeout: 30_000 },
    );
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test("group-channel connect produces contacts on BOTH sides (FM4)", async ({
  browser,
}) => {
  const ctxRoot = await browser.newContext();
  const root = await ctxRoot.newPage();
  const ctxBran = await browser.newContext();
  const bran = await ctxBran.newPage();
  const ctxCass = await browser.newContext();
  const cass = await ctxCass.newPage();
  try {
    await root.goto("/");
    await createAccount(root, "Root");
    await bran.goto("/");
    await createAccount(bran, "Bran");
    await cass.goto("/");
    await createAccount(cass, "Cass");

    // Root is mutual contacts with both; Bran and Cass are strangers.
    await establishContact(bran, root, "Bran");
    await establishContact(cass, root, "Cass");

    await createConversation(root, ["Bran", "Cass"], "trio");

    // Bran auto-discovers the group and requests a connection to Cass.
    await expect(async () => {
      await bran.goto("/");
      await bran.getByText("trio", { exact: false }).first().click();
      await expect(bran.getByTestId("conversation-detail")).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 30_000 });
    await openMembers(bran);
    const cassID = await memberAccountID(bran, "Cass");
    await memberAction(bran, cassID, "request-connection");

    // The kebab item now reflects the durable pending state.
    await openMemberMenu(bran, cassID);
    await expect(
      bran.getByTestId(`request-connection-${cassID}`),
    ).toContainText("request pending", { timeout: 10_000 });
    await expect(
      bran.getByTestId(`request-connection-${cassID}`),
    ).toBeDisabled();

    // Cass approves from the pending surface.
    await expect(async () => {
      await cass.goto("/connections/pending");
      await cass.getByTestId("approve").first().click({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });

    // BOTH sides converge on mutual contacts (previously only the approver).
    await cass.goto("/?tab=contacts");
    await expect(cass.getByTestId("sidebar-contacts-list")).toContainText(
      "Bran",
      { timeout: 15_000 },
    );
    await bran.goto("/?tab=contacts");
    await expect(bran.getByTestId("sidebar-contacts-list")).toContainText(
      "Cass",
      { timeout: 30_000 },
    );
  } finally {
    await ctxRoot.close();
    await ctxBran.close();
    await ctxCass.close();
  }
});

test("revoked invite is blocked at Connect time (parked confirm screen)", async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const alice = await ctxA.newPage();
  const ctxB = await browser.newContext();
  const bob = await ctxB.newPage();
  try {
    await bob.goto("/");
    await createAccount(bob, "Bob");
    await alice.goto("/");
    await createAccount(alice, "Alice");

    const inviteUrl = await revealInviteUrl(bob);

    // Alice parks on the confirm screen…
    await alice.goto("/");
    await alice.goto(inviteUrl);
    await expect(alice.getByTestId("invite-inviter-name")).toContainText(
      "Bob",
      { timeout: 15_000 },
    );

    // …while Bob revokes the invitation.
    await bob.goto("/connections/live-invites");
    await bob.getByTestId("revoke").first().click();

    // Connect must re-validate and refuse — no request is sent.
    await alice.getByTestId("invite-accept-btn").click();
    await expect(alice.getByTestId("invite-expired")).toBeVisible({
      timeout: 15_000,
    });
    await bob.goto("/connections/pending");
    await expect(bob.getByTestId("approve")).toHaveCount(0);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
```

- [ ] Run `nix-shell --run 'npx playwright test tests/e2e/connection-robustness.spec.ts'` — expect **4 passed**.
- [ ] Commit: `git add -A && git commit -m "test(e2e): contact-robustness suite — double-tap, closed-tab approval, group channel, revoked-at-connect"`

## Task 15: Full sweep, docs, finish

- [ ] Run the full gate battery — every one must pass:
  - `nix-shell --run 'npm run typecheck'` — expect **PASS**
  - `nix-shell --run 'npm run check-tokens'` — expect **PASS**
  - `nix-shell --run 'npm run check-ui-purity'` — expect **PASS**
  - `nix-shell --run 'npx vitest run'` — expect **PASS** (all suites incl. the ~24 new tests)
  - `nix-shell --run 'npm run parity'` — expect **142/142**
  - `nix-shell --run 'npx playwright test'` — expect **PASS** (full e2e; webServer auto-starts; the invite/connection/group/pairing suites all exercise the reworked paths)
- [ ] Edit `/home/nox/Documents/Projects/Nox/arcan/CLAUDE.md` — append to the UI-rework status list (after the CI VPS deploy line):

```md
- Contact & connection robustness (2026-07-20) — implemented + merged (`--no-ff`). Jazz-canon
  alignment: duplicate-sensitive root state moved to keyed co.records under NEW field names
  (`contacts` / `incomingConnectionRequests` / `outgoingRequests` / `dismissedRequests` /
  `pendingNotifications`) with a TOFU-aware migration backfill — in-place list→record is
  unsafe in jazz-tools 0.20.18, so the legacy CoList fields remain in the schema
  write-frozen (removal is a follow-up slice). Single send path `sendConnectionRequest`
  (durable-intent-first, acked, both channels) + app-level `useOutgoingRequestWatcher`
  replaced the /invite 3-second poll; notification sends carry durable retry records;
  invitations mint lazily; repair is a visible add-to-contacts affordance (never silent
  re-TOFU). Spec: `docs/superpowers/specs/2026-07-20-contact-robustness-design.md`.
```

- [ ] Commit: `git add -A && git commit -m "docs: contact-robustness slice status in CLAUDE.md"`
- [ ] Finishing task: use the **superpowers:finishing-a-development-branch** skill. Present the integration options to the user; per repo convention the expected outcome is a `--no-ff` merge to `main` (slice structure stays visible in git log — do NOT fast-forward, do NOT tag: `v*` tags deploy production and need explicit user confirmation). Remind the user that followups **#27–#32** in the TaskList are queued to be triaged after this slice lands (run the `followup-tracking` triage flow; Linear destination: team=Nox project=Arcan).

## Spec → task coverage

| Spec item | Task(s) |
|---|---|
| §1 `contactBook` → keyed record (FM7) | 1, 2, 4 |
| §1 `incomingRequests` → keyed record (FM2) + per-requester collapse (FM1 belt) | 1, 2, 7 |
| §1 `outgoingRequests` NEW record | 1, 2, 5 |
| §1 `dismissedRequestIDs` → record | 1, 2, 7 |
| §1 `pendingNotifications` NEW record | 1, 2, 11 |
| §1 `liveInvitations`/`pendingPairings` stay lists, pruned | 12 |
| §1 `invitesIssued` removed | 1 |
| §2 `upsertContact` (only writer, TOFU-aware, conflict flag) | 3, 4 |
| §2 `sendConnectionRequest` (5-step single path, both channels) | 5 |
| §2 `useOutgoingRequestWatcher` (approve/deny/expire/failed-retry; poll killed) | 6, 8 |
| §3 keyed drain + render collapse | 7 |
| §3 approve keeps per-request guard, writes via upsertContact | 4 |
| §3 invite re-validation at Connect | 8, 14 |
| §3 request expiry `max(invitationExpiry, sentAt + 7d)` | 5 |
| §4 notification discipline (entry before send, clear on ack, retry) | 11 |
| §4 system-event "added" membership pre-check | 11 |
| §5 migration dedup (latest-wins; oldest-pin TOFU + conflict flag) | 2 |
| §5 visible repair affordance (profile + conversation banner), no silent re-TOFU | 13 |
| §5 pruning (settled requests >30d, expired pairings, revoked/expired invites) | 12 |
| §5 dead code: `invitesIssued`, orphaned `markRead` | 1, 12 |
| §6 invite confirm: already-contacts / request-pending states (FM8) | 8 |
| §6 sent screen: sending… / delivered / failed—will retry | 8 |
| §6 denied → requester sees declined | 6, 8 |
| §6 members connect button pending state | 9 |
| §6 lazy invitation minting (FM10) | 10 |
| §7 unit: upsertContact idempotency + TOFU | 3 |
| §7 unit: watcher transitions | 6 |
| §7 unit: migration dedup fixtures incl. fingerprint conflict | 2 |
| §7 unit: drain-race coverage (two-device — not e2e-able) | 2, 7 |
| §7 e2e: double-tap / closed-tab / denial / group-channel / revoked-at-connect / suites stay green | 14 (+8, 10) |
