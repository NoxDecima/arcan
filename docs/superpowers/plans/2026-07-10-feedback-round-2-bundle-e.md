# Feedback Round 2 — Bundle E (invite-link management) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permanent ("no expiry") invite links, a reachable live-invites management screen (linked from add-contact and settings), and per-invite copy-link for reusing old links.

**Architecture:** `Invitation.expiresAt` becomes optional; "none" joins the TTL options and is special-cased in `createInvitation`. A shared `invitationUrl()` helper makes links reconstructable on the management screen. Surfacing is via an optional presenter prop (parity-safe) + a settings row.

**Approved decision (user, feedback-round-2 Q&A #4):** permanent links are acceptable before blocking exists because the management screen allows revocation.

---

### Task 1: "no expiry" option end-to-end

**Files:**
- Modify: `src/jazz/schema/Invitation.ts` (expiresAt optional)
- Modify: `src/jazz/invitations.ts` (LinkTtl union, createInvitation, extract `invitationUrl()`)
- Modify: `src/routes/contacts/add.tsx` (TTL_PRESETS)
- Modify: `src/routes/invite/index.tsx` (undefined-expiry handling)
- Test: extend existing invitation unit tests (grep `createInvitation` in tests/unit; follow their account-setup pattern) or add `tests/unit/jazz/invitations-permanent.test.ts`

- [ ] **Step 1: Failing test first** — assert that `createInvitation(account, "link", "none")` produces an invitation with `expiresAt === undefined` and a URL containing `/invite#`. Follow the account-creation pattern of existing jazz unit tests (e.g. `tests/unit/jazz/conversation.test.ts`). Run it: FAIL (type error / expiresAt set).

- [ ] **Step 2: Schema**

`src/jazz/schema/Invitation.ts`:
```ts
  expiresAt: z.date().optional(),
```
(comment: `// optional since feedback round 2: "none" TTL = permanent invite, revocable from /connections/live-invites`)

- [ ] **Step 3: invitations.ts**

- `export type LinkTtl = keyof typeof LINK_TTL_OPTIONS | "none";` (adjust the existing definition; LINK_TTL_OPTIONS map itself is unchanged).
- In `createInvitation`:
```ts
  const ttlMs =
    channel === "qr"
      ? QR_TTL_MS
      : linkTtl === "none"
        ? null
        : LINK_TTL_OPTIONS[linkTtl];
  const expiresAt =
    ttlMs === null ? undefined : new Date(now.getTime() + ttlMs);
```
(`expiresAt` is passed into `Invitation.create` as before — now possibly undefined.)
- Extract the URL construction into an exported helper and use it in `createInvitation`:
```ts
/** Rebuild the shareable URL for an invitation (used by createInvitation and
 * the live-invites management screen for copy/reuse). */
export function invitationUrl(invitation: any): string {
  const fragment = toB64url(
    `${invitation.$jazz.id}|${invitation.inviterAccountID}`,
  );
  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "https://arcan.app";
  return `${baseUrl}/invite#${fragment}`;
}
```
NOTE: `createInvitation` currently builds the fragment from `me.$jazz.id` — `invitation.inviterAccountID` is the same value; verify and reuse.

- [ ] **Step 4: Undefined-expiry sweep**

`grep -n "expiresAt" src/routes/invite/index.tsx src/jazz/invitations.ts src/routes/connections/live-invites.tsx src/jazz/use-incoming-connection-requests.ts` and fix every place that assumes an invitation `expiresAt` exists:
- Any invitation-expired check must treat `undefined` as NOT expired (`inv.expiresAt && new Date(inv.expiresAt).getTime() < Date.now()`).
- In `src/routes/invite/index.tsx`, `createConnectionRequest(..., { invitationID, expiresAt: invitation.expiresAt })` — connection REQUESTS keep a finite lifetime even for permanent invites:
```ts
          expiresAt:
            invitation.expiresAt ??
            // permanent invite: the minted request still expires (7d)
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
```
(ConnectionRequest.expiresAt stays required.)

- [ ] **Step 5: TTL presets**

`src/routes/contacts/add.tsx`: `const TTL_PRESETS: LinkTtl[] = ["1h", "24h", "7d", "none"];` — the presenter renders options verbatim (testid `ttl-none` auto-derives). Check the `ttl-picker` segment layout still fits 4 options (it's a flex row of segments; if it overflows the 300px column, shrink per-segment padding minimally and note it).

- [ ] **Step 6: Verify + commit**

Tests pass (Step-1 test green); `npx vitest run` PASS; `npm run typecheck` exit 0; targeted parity `--only add-contact-screen` — if the 4th segment shifts pixels, patch the proto cell's TTL row to match with an intent-fix comment and re-run.
```bash
git add -A && git commit -m "feat(invites): permanent 'none' TTL — optional invitation expiry"
```

---

### Task 2: live-invites screen — no-expiry label + copy link

**Files:**
- Modify: `src/routes/connections/live-invites.tsx`

- [ ] **Step 1: Handle missing expiry + copy button**

In the `active.map((inv) => …)` row:
- remaining label:
```tsx
            const remainingLabel = inv.expiresAt
              ? (() => {
                  const remainingMs = new Date(inv.expiresAt).getTime() - now;
                  const remainingMin = Math.max(0, Math.floor(remainingMs / 60000));
                  return remainingMin >= 60
                    ? `expires in ${Math.floor(remainingMin / 60)}h ${remainingMin % 60}m`
                    : `expires in ${remainingMin}m`;
                })()
              : "no expiry";
```
and render `{remainingLabel}` (drop the hardcoded "expires in " prefix from the JSX).
- add a copy button before the revoke button (import `invitationUrl` from `@/jazz/invitations`):
```tsx
                  <PButton
                    label="copy link"
                    onClick={async () => {
                      await navigator.clipboard.writeText(invitationUrl(inv));
                      toast({ icon: "copy", text: "invite link copied", tone: "accent" });
                    }}
                    data-testid="copy-invite-link"
                  />
```

- [ ] **Step 2: Verify + commit**

`npm run typecheck` exit 0; `npx vitest run` PASS.
```bash
git add src/routes/connections/live-invites.tsx
git commit -m "feat(invites): live-invites shows no-expiry + copy-link for reuse"
```

---

### Task 3: surface the management screen

**Files:**
- Modify: `src/ui/screens/add-contact-screen.tsx` (optional manage link)
- Modify: `src/routes/contacts/add.tsx` (pass handler)
- Modify: `src/routes/settings/index.tsx` (settings row)

- [ ] **Step 1: Add-contact link (parity-safe optional prop)**

`add-contact-screen.tsx`: new optional prop
```tsx
  /** intent-fix (feedback round 2): entry to /connections/live-invites.
   * Omitted in parity cells. */
  onManageInvites?: () => void;
```
rendered directly below the "or paste a link" ghost button, same ghost style:
```tsx
          {onManageInvites && (
            <button className={tapClass} onClick={onManageInvites} data-testid="manage-invites-link">
              <span className="font-body text-ui-sub leading-none text-dim">
                manage invite links
              </span>
            </button>
          )}
```
`add.tsx`: pass `onManageInvites={() => navigate("/connections/live-invites")}`.

- [ ] **Step 2: Settings row**

In `src/routes/settings/index.tsx`, find the section list the `SettingsScreen` presenter receives (the same structure as the devices rows) and add a row in the most natural section (near devices or account):
label `invite links`, sub `manage & revoke your invites`, navigating to `/connections/live-invites`, testid `settings-invite-links`. Follow the exact row-shape the presenter expects (mirror an adjacent row's fields; use an icon the rows support, e.g. `share` or `key`).

- [ ] **Step 3: Verify + commit**

`npx vitest run` PASS; `npm run typecheck` exit 0; targeted parity `--only add-contact-screen,settings-screen` — patch proto cells only if a cell FAILS (settings proto cell may need the new row mirrored with an intent-fix comment; the add-contact cell omits the optional prop and must pass unchanged).
```bash
git add -A && git commit -m "feat(invites): surface live-invites from add-contact + settings"
```

---

### Task 4: bundle gates

```bash
npm run typecheck && npm run check-tokens && npm run check-ui-purity && npx vitest run && nix-shell --run "npm run parity"
```
All pass; commit fixes only if needed (`fix(invites): bundle E gate fallout`).
