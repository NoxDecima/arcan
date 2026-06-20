# Unit 8 — Phase C-2 post-audit (multi-account surfaces unlocked)

Generated 2026-06-20 by the main loop, re-capturing the live app against main at `2712acb`
(post-Phase-B, post-polish merge). Uses a temporary, uncommitted dev-only Jazz seed helper
(`src/jazz/dev-seed.tsx` + a `<DevSeed />` mount in `src/App.tsx`) so the audit fixture can
bypass Unit 1's two-sided ConnectionRequest handshake for `alice-with-bob-1to1` and
`alice-with-group` states. **Helper is uncommitted by design** — reverted from the working
tree after this audit pass; the fixture's `aliceWithBob1to1ViaSeed` / `aliceWithGroupViaSeed`
implementations also revert.

- **Captured:** 48 / 48 surface variants. Zero skipped. First full audit coverage.
- **New surfaces vs Phase C (2026-06-13):** 20 multi-account variants — `conv-list-1to1`,
  `conv-list-group`, `conv-detail-1to1`, `conv-detail-group`, `conv-members-group`, `conv-new`,
  `contacts-list`, `contact-detail`, `profile-own`, `profile-other` (× desktop + mobile).

---

## Helper limitations (deliberate, for context when reading this doc)

The synthetic Bob/Charlie accounts are NOT real Jazz accounts — just stable strings stored in
Contact records. Routes that try to LOAD a foreign account will degrade gracefully (or break,
in the case of `contact-detail`). Specifically:

- The writer group of each seeded conversation contains only Alice. Synthetic-Bob has no read
  access. The chat detail thus shows only Alice's bubbles + the disabled composer ("No one
  else is in this chat" — actual app message).
- `useSharedGroups(bobAccountID)` returns empty because Bob isn't in any conversation's writer
  group. So `profile-other` shows "No shared conversations yet." even though Alice has a
  1:1 conversation titled "Bob (audit)".
- `contact-detail` (`/contacts/:bobContactId`) renders BLANK on the synthetic Bob — see
  NEW-002 below.

Findings here distinguish between "real app drift" (worth fixing) and "helper artifact" (only
visible with synthetic IDs). Helper artifacts are noted but not actionable.

---

## Newly-closed audit rows (multi-account surfaces)

### AUDIT-009 / 010 · `/` `conv-list-1to1` (desktop + mobile) — closed

Sidebar shows the "Bob (audit)" row with `B(` initials (parens captured in initials due to
synthetic display name "Bob (audit)" — this is a fixture artifact, not a real-app bug). Right
pane shows the reading-pane EmptyPane (cosmic backdrop + "select a conversation"). Sidebar
separation Option A holds.

**Status:** closed. **Sub-unit covered:** 8b + 8d.

### AUDIT-011 / 012 · `/conversations/:id` `conv-detail-1to1` (desktop + mobile) — closed

Beautiful chat detail render: header with "← Back" + 32px conversation avatar + "Bob (audit)"
title + "Members" link top-right. 3 Alice-authored message bubbles with timestamps + AL
initials (text-on-accent light bubbles). Composer at bottom with placeholder "No one else is
in this chat" (disabled state since synthetic Bob isn't a writer-group member — actual app
behavior, not a bug).

**Status:** closed. **Sub-unit covered:** 8a/8b primitives + 8d mobile.

### AUDIT-013 / 014 · `/conversations/:id` `conv-detail-group` (desktop + mobile) — closed

Group conversation header: "AT Audit Trip" + Members. SystemEvent renders inline as
italicized centered `Alice Audit renamed the group to "Audit Trip"` — Unit 4 Phase 9's
renamed event working as designed.

**Status:** closed.

### AUDIT-015 / 016 · `/conversations/:id/members` (desktop + mobile) — closed

Members route: header "AT Audit Trip" + edit pencil + "Add member" CTA. Single member row
"Alice Audit (you)" with "admin" badge (helper artifact — only Alice in the group; real
group would show all members). Bottom sticky "Leave conversation" danger button.

**Status:** closed. **Stragglers:** "Add member" and "Leave conversation" are sentence-case;
goes into POST-2 typography sweep.

### AUDIT-017 / 018 · `/conversations/new` (desktop + mobile) — closed

Multi-select new-conversation flow: header "← Back new conversation" + "CONTACTS · ONE = 1:1
· TWO+ = GROUP" mono caps tracking-widest hint + 3 contact rows (Bob, Bob, Charlie — Bob
appears twice because `aliceWithGroup` calls `aliceWithBob1to1` then adds Charlie, both
pushing Bob contacts; pure fixture artifact). Multi-select checkboxes on right edge. Bottom
CTA "select contacts" (disabled state when no selection).

**Status:** closed.

### AUDIT-021 / 022 · `/contacts` `contacts-list` (desktop + mobile) — closed

Sidebar shows 3 contact rows. Reading-pane EmptyPane renders "select a contact / or add a
new one — end-to-end encrypted" — confirming the contacts-tab right-pane copy fix from the
polish pass works correctly with state present.

**Status:** closed.

### AUDIT-025 / 026 · `/profile/:meId` `profile-own` (desktop + mobile) — closed

**Headline win for the helper.** Full AuthSurface cosmic backdrop. "← back" link top-left.
80px circular avatar with blue-circle camera-overlay pencil-edit (Unit 4 affordance). "Alice
Audit" name + edit pencil. Truncated `co_zbo…h2U` id in mono dim. Primary "add a contact"
CTA. "YOUR CONVERSATIONS" caps tracking-widest section listing the 3 seeded conversations.
Collapsible "view security code" panel. "account & settings" link at bottom.

**Status:** closed.

### AUDIT-027 / 028 · `/profile/:bobId` `profile-other` (desktop + mobile) — closed

Same cosmic AuthSurface. 80px "B" initial avatar (no camera overlay since not own). "Bob
(audit)" name (no pencil). Truncated `co_syn…000` id. "message" primary CTA. "SHARED
CONVERSATIONS" section showing "No shared conversations yet." — see helper-limitations note
above. Collapsible "view security code".

**Status:** closed. The "no shared conversations" copy is a helper artifact; with real
accounts it would list the 1:1 + group.

### AUDIT-043 / 044 · `/connections/live-invites` non-empty (desktop + mobile) — unchanged

Still renders the empty state ("no active invites" + create-invitation CTA). See NEW-002
below — the fixture's side-effect (visiting `/contacts/add`) creates an invitation in some
storage but doesn't surface in this route's filter. Likely a real-app bug; tracking
separately.

---

## New findings (multi-account-only surfaces surfacing app behavior)

### NEW-005 · `contact-detail` route renders blank on unresolvable account

Capture: `contact-detail--desktop.png` / `--mobile.png`. The route renders nothing — solid
dark background, no header, no error message, no skeleton, no redirect.

**Real-app trigger:** any Contact whose `contactAccountID` cannot be loaded from the sync
server. This shouldn't normally happen in production (real Contacts always have a loadable
counterpart), but it CAN happen if a contact's account is taken offline, deleted, or hasn't
yet synced.

**Severity:** `fix`. Add a loading skeleton + post-timeout error state to
`src/routes/contacts/detail.tsx`. Could also redirect to `/contacts` after a timeout. ~30
lines.

Worth noting: Unit 4's polymorphic profile route at `/profile/:accountID` survives the same
synthetic ID gracefully — degrading to the Contact's `displayNameLocal` + initials. The
`contact-detail` route doesn't have the same fallback wiring.

### NEW-006 · Members route shows "Add member" / "Leave conversation" sentence-case

Capture: `conv-members-group--desktop.png` / `--mobile.png`. The buttons were missed by the
polish sweep — they live in `src/routes/conversations/members.tsx` which wasn't part of the
POST-001..004 surface set.

**Severity:** `nit`. ~4 lines. Lowercase to "add member" / "leave conversation".

### NEW-007 · Composer "No one else is in this chat" placeholder is real

Capture: `conv-detail-1to1--desktop.png`. Visible in a few captures because of the helper
artifact (Bob isn't actually in the writer group). This is the **actual** app's composer
behavior when only `me` is in a conversation's writer group — e.g. a 1:1 where the other
party has revoked access, or a group everyone else has left.

**Severity:** `defer` / informational. Documenting because this surface only shows up when
audit conditions allow it. Real users may hit this on a stale conversation — worth ensuring
the message reads well. Currently fine: "No one else is in this chat" is clear. Could
optionally lowercase to "no one else is in this chat" for consistency, but it's a stretch.

### NEW-002 (re-flagged from Phase C) · `connections-live-invites` non-empty seed still empty

Same finding as Phase C. The `alice-with-live-invite` seed visits `/contacts/add` (creates an
invitation as a side-effect, pushes to `me.root.liveInvitations`), but
`/connections/live-invites` still renders the empty state.

**Severity:** `fix`. Either:
1. The side-effect doesn't actually push to `liveInvitations` (bug in `/contacts/add`).
2. The `/connections/live-invites` route filters out the kind of invitation the side-effect
   creates.

Worth a 30-min investigation pass on the live app via dev:all to see which.

---

## Closed audit-doc summary (Phase A → Phase C-2)

| Bucket | Phase A | Phase C | Phase C-2 |
|---|---|---|---|
| Surfaces captured | 26 | 28 | **48** |
| Captured + Closed | 22 | 38 | **57+** |
| Capture-deferred | 22 | 20 | **0** |
| New findings | n/a | 4 | 3 (NEW-005..007) + 1 re-flagged (NEW-002) |
| Regressed | n/a | 0 | 0 |

---

## Recommended Phase D path

The first post-audit (Phase C, 2026-06-13) already recommended landing the polish then
tagging. Polish landed (merge `2712acb`). This Phase C-2 audit confirms the polish AND
unlocks the multi-account surfaces without finding any block-severity drift.

**Phase D-blocking? NO.** All findings from Phase C-2 are `fix` or `nit`:

- NEW-005 (contact-detail blank) — could roll into a small follow-up commit (~30 lines)
  before tagging, OR ship `slice-8-complete` and address in `slice-8-polish-2`.
- NEW-006 (members route sentence-case) — 4 lines; trivial to fold in.
- NEW-002 (live-invites empty) — investigate, may be cosmetic or real.

The deferred-fixture rewrite (task #19) remains a separate question — the helper-based
workflow proved viable for the audit but lives outside the source tree by design.

---

## Decision: helper next steps

User confirmed at 2026-06-20: **revert the helper after this audit run**. The pieces to
revert (uncommitted):

1. `src/jazz/dev-seed.tsx` — delete entirely.
2. `src/App.tsx` — revert the `import { DevSeed }` line + the `<DevSeed />` mount.
3. `scripts/audit/fixtures.ts` — revert the `aliceWithBob1to1ViaSeed` /
   `aliceWithGroupViaSeed` block AND restore the original `aliceWithBob1to1` /
   `aliceWithGroup` UI-driven sketches (or remove the seed switch and leave the original
   stubs).

Working-tree verification before any commit: `git status` should show NO modifications to
`src/jazz/dev-seed.tsx`, `src/App.tsx`, or the seed-driven sections of fixtures.ts.

**This commit captures only:**

- The 48 new PNGs in `docs/superpowers/audit/unit-8/live/`.
- The updated `docs/superpowers/audit/unit-8/live/manifest.json`.
- This doc.

---

## Awaiting user input

Per user instruction at 2026-06-18, Phase D does not start without explicit go-ahead. This
doc + the merged polish at `2712acb` are the gates for that decision. Options:

1. **Tag now.** Close `slice-8-complete` immediately. NEW-005, NEW-006 ship as separate
   `slice-8-polish-2` follow-up (or roll into Unit 9).
2. **Land NEW-005 + NEW-006 first, then tag.** ~30-line additional cleanup commit.
3. **Investigate NEW-002 first.** Could be a real-app bug worth fixing in this slice.

Recommendation: option 2. The contact-detail blank screen is a real defect (visible to users
who hit an unresolvable contact) and a 30-line fix won't slow tagging meaningfully.
