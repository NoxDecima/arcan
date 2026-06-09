# Unit 1 — Connection subsystem rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-use `Invitation` flow with a unified connection subsystem: multi-use `Invitation` (qr + link channels) + per-opener `ConnectionRequest` delivered via Inbox, universal recipient approval gate, three entry channels (qr / link / group), bilateral shared-group trust hint, safety-number display, dismiss-is-local, mutual contact append on approve, management surfaces (live invites + pending connections + outgoing requests).

**Architecture:** Two CoValues, one Inbox-delivery protocol, one approval gate. `Invitation` is owned by an "everyone-writer" group (matching the existing pattern) so guest nodes can load it; it's reshaped to drop single-recipient fields + `consumed`, add `channel` + `revokedAt`. `ConnectionRequest` is per-opener, delivered via `InboxSender.load(recipientAccountID, me)` (same pattern as `ConversationNotification`). Approval mutates `approvedAt` on the same CoValue; dismiss is local-only (`me.root.dismissedRequestIDs`). Each side writes its own Contact locally on approve / observed-approval.

**Tech Stack:** TypeScript strict, React 18 + Unit 7 tokens, react-router-dom 7, jazz-tools 0.20.18, Web Crypto API for fingerprints, qrcode.react + qr-scanner for the QR surfaces (already in deps).

**Spec:** `docs/superpowers/specs/2026-06-05-ui-rework-feature-breakdown-design.md` — Unit 1.

---

## Phase 0 · Setup

### Task 0.1: Branch + clean tree

```bash
cd /home/nox/Documents/Projects/Nox/arcan
git status --short
git checkout main && git pull
git checkout -b unit-1-connection-subsystem
```

---

## Phase 1 · `Invitation` schema reshape (multi-use)

### Task 1.1: Failing test

**Files:**
- Create: `tests/unit/jazz/schema/invitation-reshape.test.ts`

```typescript
import { describe, test, expect } from "vitest";
import { Invitation } from "@/jazz/schema/Invitation";

describe("Invitation (reshaped, multi-use)", () => {
  test("schema has channel + revokedAt, no consumed/recipient* fields", () => {
    const shape = (Invitation as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape.channel).toBeDefined();
    expect(shape.revokedAt).toBeDefined();
    expect(shape.consumed).toBeUndefined();
    expect(shape.recipientAccountID).toBeUndefined();
    expect(shape.recipientFingerprint).toBeUndefined();
    expect(shape.recipientDisplayName).toBeUndefined();
    expect(shape.acceptedAt).toBeUndefined();
  });
  test("inviter fields preserved", () => {
    const shape = (Invitation as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape.inviterAccountID).toBeDefined();
    expect(shape.inviterFingerprint).toBeDefined();
    expect(shape.inviterDisplayName).toBeDefined();
  });
});
```

Run — expect FAIL.

### Task 1.2: Reshape

**Files:**
- Modify: `src/jazz/schema/Invitation.ts`

- [ ] **Step 1: Read current**

```bash
cat src/jazz/schema/Invitation.ts
```

- [ ] **Step 2: Replace with the reshape**

```typescript
import { co, z } from "jazz-tools";

/**
 * Invitation — reshaped for Unit 1.
 *
 * Multi-use: one Invitation produces many ConnectionRequests, one per opener.
 * Channel discriminates between in-person QR (short TTL) and async link
 * (1h/24h/7d preset, hard cap 7d).
 *
 * Per the destructive baseline, the legacy single-recipient fields and
 * `consumed` flag are dropped outright.
 */
export const Invitation = co.map({
  inviterAccountID: z.string(),
  inviterFingerprint: z.string(),
  inviterDisplayName: z.string(),
  channel: z.enum(["qr", "link"]),
  createdAt: z.date(),
  expiresAt: z.date(),
  revokedAt: z.date().optional(),
});
```

Re-run test — expect PASS.

### Task 1.3: Commit Phase 1

```bash
git add src/jazz/schema/Invitation.ts tests/unit/jazz/schema/invitation-reshape.test.ts
git commit -m "feat(schema): reshape Invitation for multi-use (channel + revokedAt)

Drops single-recipient fields and the consumed flag. Adds channel
('qr' | 'link') and revokedAt. Per-opener identity moves to the new
ConnectionRequest CoValue (next phase).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 2 · `ConnectionRequest` schema (new)

### Task 2.1: Failing test

**Files:**
- Create: `tests/unit/jazz/schema/connection-request.test.ts`

```typescript
import { describe, test, expect } from "vitest";
import { ConnectionRequest } from "@/jazz/schema/ConnectionRequest";

describe("ConnectionRequest schema", () => {
  test("has the expected field shape", () => {
    const shape = (ConnectionRequest as unknown as { shape: Record<string, unknown> }).shape;
    for (const field of [
      "requesterAccountID",
      "requesterFingerprint",
      "requesterDisplayName",
      "recipientAccountID",
      "channel",
      "invitationID",
      "createdAt",
      "expiresAt",
      "approvedAt",
    ]) {
      expect(shape[field], `missing field: ${field}`).toBeDefined();
    }
  });
  test("does NOT include rejectedAt — dismiss is local-only", () => {
    const shape = (ConnectionRequest as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape.rejectedAt).toBeUndefined();
  });
});
```

### Task 2.2: Create the schema

**Files:**
- Create: `src/jazz/schema/ConnectionRequest.ts`

```typescript
import { co, z } from "jazz-tools";
import { FileBlob } from "./FileBlob";

/**
 * ConnectionRequest — one per opening of an Invitation (or one per group-channel tap).
 *
 * Owned by a fresh group the requester creates; the recipient is added as `writer`
 * so they can write `approvedAt`. Delivered to the recipient's Inbox via
 * InboxSender.load(recipientAccountID, me).
 *
 * Notably absent:
 *  - No rejectedAt. Recipient's only alternatives to Approve are Dismiss (local-only,
 *    me.root.dismissedRequestIDs) or expiry. Requester can't distinguish dismissed
 *    from forgotten — privacy property.
 *  - No shared-group context field. The hint is dynamic, computed locally by both
 *    sides via useSharedGroups().
 */
export const ConnectionRequest = co.map({
  requesterAccountID: z.string(),
  requesterFingerprint: z.string(),
  requesterDisplayName: z.string(),
  requesterAvatar: FileBlob.optional(),

  recipientAccountID: z.string(),

  channel: z.enum(["qr", "link", "group"]),
  invitationID: z.string().optional(), // present for 'qr' / 'link'; absent for 'group'

  createdAt: z.date(),
  expiresAt: z.date(),
  approvedAt: z.date().optional(),
});
```

Re-run test — expect PASS.

### Task 2.3: Commit Phase 2

```bash
git add src/jazz/schema/ConnectionRequest.ts tests/unit/jazz/schema/connection-request.test.ts
git commit -m "feat(schema): add ConnectionRequest CoValue (per-opener)

Carries the requester's identity (account ID, fingerprint, display name,
optional avatar), the recipient ID, the channel that produced it (qr,
link, or group), an optional invitationID (absent for group channel),
and lifecycle timestamps. No rejectedAt — dismiss is local-only per
Unit 1 Q3 (c).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 3 · `me.root.dismissedRequestIDs`

### Task 3.1: Add the field to ArcanAccountRoot

**Files:**
- Modify: `src/jazz/schema/ArcanAccount.ts`

- [ ] **Step 1: Add a new field**

```typescript
  dismissedRequestIDs: co.list(z.string()).optional(),
```

In the root-init block, initialise it:

```typescript
const dismissedRequestIDs = co.list(z.string()).create([], { owner: me });
```

Add backfill defensively (same pattern as `pendingPairings`).

Pass `dismissedRequestIDs` into `ArcanAccountRoot.create({...})`.

### Task 3.2: Commit Phase 3

```bash
git add src/jazz/schema/ArcanAccount.ts
git commit -m "feat(schema): add me.root.dismissedRequestIDs

A local list of ConnectionRequest CoValue IDs the recipient has
dismissed without taking action. The shared CoValue is never mutated;
the requester sees nothing. Privacy property per Unit 1 Q3 (c).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 4 · `useSharedGroups` hook

(If Unit 4's plan has already shipped this, skip this phase and import from `@/hooks/use-shared-groups`.)

### Task 4.1: Create the hook

**Files:**
- Create: `src/hooks/use-shared-groups.ts`

```typescript
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";

export interface SharedGroup {
  id: string;
  title: string;
}

/**
 * Returns the conversations the local user shares with the given other account.
 *
 * Bilateral, channel-agnostic, computed entirely from local CoJSON state — no schema
 * field carries this hint, so it can't be forged. Each side computes from its own
 * me.root.knownConversations.
 */
export function useSharedGroups(otherAccountID: string): SharedGroup[] {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { knownConversations: { $each: true } } },
  });
  if (!me.$isLoaded || !otherAccountID) return [];
  const conversations = Array.from((me.root.knownConversations as any) ?? []);
  const out: SharedGroup[] = [];
  for (const conv of conversations) {
    if (!conv) continue;
    const group = (conv as any).$jazz?.owner;
    if (!group) continue;
    try {
      const members: any[] = group.getDirectMembers?.() ?? [];
      const ids = new Set(members.map((m) => m?.account?.$jazz?.id).filter(Boolean));
      if (ids.has(otherAccountID)) {
        out.push({
          id: (conv as any).$jazz.id,
          title: (conv as any).title ?? "Untitled",
        });
      }
    } catch {
      // unresolvable — skip
    }
  }
  return out;
}
```

### Task 4.2: Commit Phase 4

```bash
git add src/hooks/use-shared-groups.ts
git commit -m "feat(hooks): useSharedGroups(otherAccountID)

Bilateral, channel-agnostic intersection of conversations the local
user and the other party share. Computed from local knownConversations;
no schema field involved. Powers both Unit 1's approval-card trust
hint and Unit 4's profile shared-conversations section.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 5 · Invitations + ConnectionRequest helpers

### Task 5.1: Rewrite `src/jazz/invitations.ts`

**Files:**
- Modify: `src/jazz/invitations.ts`

The existing file has `createInvitation` / `parseInvitationURL` / `acceptInvitation` etc. that all assume single-use. Rewrite it for the new model.

- [ ] **Step 1: Replace the file's exports**

Sketch (real file should also keep helpers like `parseInvitationURL` and the URL fragment encoding):

```typescript
import { Group, Account, co, InboxSender } from "jazz-tools";
import { Invitation } from "./schema/Invitation";
import { ConnectionRequest } from "./schema/ConnectionRequest";
import { getAccountPubkeyHex } from "@/auth/pubkey";

const LINK_TTL_OPTIONS = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
} as const;
const QR_TTL_MS = 5 * 60 * 1000; // 5 minutes
const GROUP_REQUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type LinkTtl = keyof typeof LINK_TTL_OPTIONS;

/** Create an Invitation. channel='qr' uses a fixed 5-min TTL; channel='link' takes a preset. */
export async function createInvitation(
  account: Account,
  channel: "qr" | "link",
  linkTtl?: LinkTtl,
): Promise<{ invitation: ReturnType<typeof Invitation.create>; url: string }> {
  const now = new Date();
  const ttlMs = channel === "qr" ? QR_TTL_MS : LINK_TTL_OPTIONS[linkTtl ?? "24h"];
  const expiresAt = new Date(now.getTime() + ttlMs);

  const inviteGroup = Group.create({ owner: account });
  inviteGroup.addMember("everyone", "writer");

  const profile = (account as Account & { profile?: { name?: string } }).profile;
  const invitation = Invitation.create(
    {
      inviterAccountID: (account as any).$jazz.id,
      inviterFingerprint: getAccountPubkeyHex(account),
      inviterDisplayName: profile?.name ?? "Unknown",
      channel,
      createdAt: now,
      expiresAt,
    },
    { owner: inviteGroup },
  );

  // URL: /invite#<base64url(invitationCoValueID|inviterAccountID)>
  const fragment = btoa(`${(invitation as any).$jazz.id}|${(account as any).$jazz.id}`)
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const url = `${window.location.origin}/invite#${fragment}`;

  return { invitation: invitation as any, url };
}

/** Mark an invitation revoked. */
export async function revokeInvitation(
  invitation: ReturnType<typeof Invitation.create>,
): Promise<void> {
  (invitation as any).$jazz.set("revokedAt", new Date());
}

/** Parse a /invite#... URL. */
export function parseInvitationURL(url: string): { invitationID: string; inviterAccountID: string } {
  const u = new URL(url);
  if (!u.pathname.includes("/invite")) throw new Error("not an /invite URL");
  const frag = u.hash.slice(1);
  if (!frag) throw new Error("missing fragment");
  const padded = frag.replace(/-/g, "+").replace(/_/g, "/").padEnd(frag.length + ((4 - (frag.length % 4)) % 4), "=");
  const decoded = atob(padded);
  const parts = decoded.split("|");
  if (parts.length !== 2) throw new Error("bad fragment");
  return { invitationID: parts[0], inviterAccountID: parts[1] };
}

/** Load an Invitation as a guest (caller is unauthenticated). */
export async function loadInvitationAsGuest(
  invitationID: string,
): Promise<ReturnType<typeof Invitation.create>> {
  const inv = await Invitation.load(invitationID as any, { resolve: {} });
  if (!inv) throw new Error("could not load invitation");
  return inv as any;
}

/** Create a ConnectionRequest from the requester's side and deliver it to the recipient's Inbox. */
export async function createConnectionRequest(
  requester: Account,
  recipientAccountID: string,
  channel: "qr" | "link" | "group",
  opts: { invitationID?: string; expiresAt: Date },
): Promise<ReturnType<typeof ConnectionRequest.create>> {
  // Owned by a fresh group; recipient added as writer so they can mutate approvedAt.
  const requestGroup = Group.create({ owner: requester });
  // Loading the recipient + adding as writer requires resolving the account by ID.
  // For now we use the inbox-delivery convention: createInboxMessage will add as writer.

  const profile = (requester as Account & { profile?: { name?: string } }).profile;
  const request = ConnectionRequest.create(
    {
      requesterAccountID: (requester as any).$jazz.id,
      requesterFingerprint: getAccountPubkeyHex(requester),
      requesterDisplayName: profile?.name ?? "Unknown",
      recipientAccountID,
      channel,
      invitationID: opts.invitationID,
      createdAt: new Date(),
      expiresAt: opts.expiresAt,
    },
    { owner: requestGroup },
  );

  // Deliver via Inbox.
  try {
    const sender = await InboxSender.load<typeof request>(recipientAccountID as any, requester);
    await sender.sendMessage(request);
  } catch (e) {
    console.warn("[connection-request] inbox delivery failed:", e);
    throw e;
  }

  return request as any;
}

/** Recipient action: write approvedAt + write own Contact. */
export async function approveConnectionRequest(
  recipient: Account,
  request: ReturnType<typeof ConnectionRequest.create>,
): Promise<void> {
  if ((request as any).approvedAt) return; // idempotent

  // 1. Mark approved on the shared CoValue.
  (request as any).$jazz.set("approvedAt", new Date());

  // 2. Write a Contact to recipient's own ContactBook.
  await writeOwnContactFromRequest(recipient, request);
}

/** Local-only dismiss: add request ID to me.root.dismissedRequestIDs. */
export async function dismissConnectionRequest(
  recipient: Account,
  request: ReturnType<typeof ConnectionRequest.create>,
): Promise<void> {
  const root = (recipient as any).root;
  const list = root?.dismissedRequestIDs;
  if (!list || typeof list.$jazz?.push !== "function") return;
  const id = (request as any).$jazz.id as string;
  // dedupe
  if (!Array.from(list as Iterable<string>).includes(id)) {
    list.$jazz.push(id);
  }
}

// — internal helpers —

async function writeOwnContactFromRequest(
  me: Account,
  request: ReturnType<typeof ConnectionRequest.create>,
): Promise<void> {
  const r = request as any;
  // Use the existing Contact schema (see src/jazz/schema/Contact.ts)
  const { Contact } = await import("./schema/Contact");
  const contact = Contact.create(
    {
      contactAccountID: r.requesterAccountID,
      pinnedFingerprint: r.requesterFingerprint,
      displayNameLocal: r.requesterDisplayName,
      addedAt: new Date(),
    },
    { owner: me },
  );
  const root = (me as any).root;
  const cb = root?.contactBook;
  if (cb && typeof cb.$jazz?.push === "function") {
    cb.$jazz.push(contact);
  }
}
```

This is a sketch — implementer reads the existing file and reconciles missing imports, types, fingerprint helpers, etc.

### Task 5.2: Tests

**Files:**
- Create: `tests/unit/jazz/invitations.test.ts`

Cover: createInvitation produces a valid URL, revokeInvitation sets revokedAt, parseInvitationURL roundtrips. Add tests for createConnectionRequest (with mocked Inbox), approveConnectionRequest writes a Contact + sets approvedAt, dismissConnectionRequest mutates only local state.

(Test setup follows the patterns in the existing `tests/unit/jazz/conversation.test.ts`.)

### Task 5.3: Commit Phase 5

```bash
git add src/jazz/invitations.ts tests/unit/jazz/invitations.test.ts
git commit -m "feat(invitations): multi-use Invitation + ConnectionRequest helpers

createInvitation(channel, ttlPreset) creates a multi-use Invitation
(qr 5min fixed; link 1h/24h/7d preset). createConnectionRequest mints
a per-opener CoValue and delivers it to the recipient's Inbox.
approveConnectionRequest writes approvedAt + the recipient's local
Contact. dismissConnectionRequest only adds the request ID to
me.root.dismissedRequestIDs — no shared mutation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 6 · Requester-side: load invitation + confirmation screen

### Task 6.1: Rewrite `src/routes/invite/index.tsx`

**Files:**
- Modify: `src/routes/invite/index.tsx`

The current /invite page handles single-use acceptance. Rewrite for the new flow:

1. Parse URL → load Invitation as guest.
2. Show requester confirmation screen with inviter profile + safety number + dynamic shared-group hint.
3. On Connect → user signs in or signs up if not authenticated, then `createConnectionRequest` delivers it.
4. Show "request sent — waiting for approval" state; subscribe to the ConnectionRequest for `approvedAt`.
5. On approve → write own Contact (already handled by approveConnectionRequest on the other side) → navigate to chat list.

Sketch:

```tsx
import { useEffect, useState } from "react";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { parseInvitationURL, loadInvitationAsGuest, createConnectionRequest } from "@/jazz/invitations";
import { SafetyNumber } from "@/components/safety-number";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import { Button } from "@/components/ui/button";
import { Lattice } from "@/components/lattice";

export function InviteRoute() {
  const me = useAccount(ArcanAccount, { resolve: { profile: true } });
  const [invitation, setInvitation] = useState<any | null>(null);
  const [phase, setPhase] = useState<"loading" | "confirm" | "sent" | "approved" | "expired" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);
  const shared = useSharedGroups(invitation?.inviterAccountID ?? "");

  useEffect(() => {
    (async () => {
      try {
        const { invitationID } = parseInvitationURL(window.location.href);
        const inv = await loadInvitationAsGuest(invitationID);
        if (!inv) { setPhase("error"); setErr("invite not found"); return; }
        const exp = (inv as any).expiresAt;
        if (exp && new Date(exp).getTime() < Date.now()) {
          setPhase("expired"); return;
        }
        if ((inv as any).revokedAt) {
          setPhase("expired"); setErr("invite revoked"); return;
        }
        setInvitation(inv);
        setPhase("confirm");
      } catch (e) {
        setPhase("error");
        setErr(String(e));
      }
    })();
  }, []);

  const onConnect = async () => {
    if (!me.$isLoaded || !invitation) return;
    try {
      const req = await createConnectionRequest(
        me as any,
        invitation.inviterAccountID,
        invitation.channel,
        {
          invitationID: (invitation as any).$jazz.id,
          expiresAt: invitation.expiresAt, // inherits parent
        },
      );
      setPhase("sent");
      // subscribe to req for approvedAt
      // ... wire up via setInterval polling or useCoState
    } catch (e) {
      setPhase("error");
      setErr(String(e));
    }
  };

  if (phase === "loading") return <p className="p-6 text-text-2">loading invite…</p>;
  if (phase === "error" || phase === "expired") {
    return (
      <div className="p-6 flex flex-col items-center gap-3">
        <Lattice size={48} mono />
        <p className="text-text">{phase === "expired" ? "this invite has expired" : (err ?? "couldn't load invite")}</p>
      </div>
    );
  }
  if (phase === "sent") {
    return (
      <div className="p-6 flex flex-col items-center gap-3">
        <Lattice size={48} />
        <p className="text-text">request sent — waiting for approval…</p>
      </div>
    );
  }
  // confirm
  const inv = invitation as any;
  return (
    <div className="p-6 max-w-sm mx-auto flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-text">connect with {inv.inviterDisplayName}?</h1>
      <p className="text-sm text-text-2">{inv.inviterDisplayName} wants to connect.</p>
      {shared.length > 0 && (
        <p className="text-xs text-arcan-accent">
          You're both in: {shared.map((s) => s.title).join(" · ")}
        </p>
      )}
      <details className="border border-hairline rounded-r-3 p-3 bg-panel">
        <summary className="cursor-pointer text-sm text-text">view security code</summary>
        <div className="mt-3"><SafetyNumber fingerprintHex={inv.inviterFingerprint} /></div>
        <p className="text-[11px] text-dim text-center mt-3">Compare in person to confirm it's really them.</p>
      </details>
      <div className="flex gap-2">
        <Button variant="primary" onClick={onConnect} className="flex-1">connect</Button>
        <Button variant="outline" onClick={() => window.history.back()} className="flex-1">cancel</Button>
      </div>
    </div>
  );
}
```

### Task 6.2: Commit Phase 6

```bash
git add src/routes/invite/index.tsx
git commit -m "feat(invite): requester confirmation screen with shared-group + safety-number

Loading state -> confirm card showing inviter display name + safety
number (collapsed) + dynamic shared-group hint -> Connect creates
the ConnectionRequest and delivers via Inbox -> sent state.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 7 · Unified Add-Contact screen

### Task 7.1: Replace `src/routes/contacts/add.tsx` with the unified layout

**Files:**
- Modify: `src/routes/contacts/add.tsx`

```tsx
import { useState, useEffect } from "react";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { QRDisplay } from "@/components/qr-display";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { createInvitation, type LinkTtl } from "@/jazz/invitations";
import { useNavigate } from "react-router-dom";

const TTL_PRESETS: LinkTtl[] = ["1h", "24h", "7d"];

export function AddContactRoute() {
  const me = useAccount(ArcanAccount, { resolve: { profile: true } });
  const navigate = useNavigate();
  const toast = useToast();
  const [ttl, setTtl] = useState<LinkTtl>("24h");
  const [invitation, setInvitation] = useState<{ url: string; id: string } | null>(null);

  useEffect(() => {
    if (!me.$isLoaded) return;
    (async () => {
      const { invitation: inv, url } = await createInvitation(me as any, "link", ttl);
      setInvitation({ url, id: (inv as any).$jazz.id });
    })();
  }, [me.$isLoaded, ttl]);

  if (!me.$isLoaded) return null;
  const accountID = (me as any).$jazz.id as string;

  return (
    <div className="p-6 max-w-md mx-auto flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-text">add a contact</h1>
      <p className="text-sm text-text-2">share your code so people can add you</p>

      {/* Your code card */}
      <section className="rounded-r-3 border border-hairline bg-panel p-4 flex flex-col items-center gap-3">
        <p className="text-[10px] uppercase tracking-widest text-dim font-semibold">your code</p>
        {invitation && <QRDisplay value={invitation.url} size={140} />}
        <p className="text-xs text-dim font-mono">{accountID.slice(0, 6)}…{accountID.slice(-3)}</p>
        <div className="flex gap-2 w-full">
          <Button
            variant="outline"
            className="flex-1"
            onClick={async () => {
              if (!invitation) return;
              await navigator.clipboard.writeText(invitation.url);
              toast({ icon: "copy", text: "invite link copied", tone: "accent" });
            }}
          >copy link</Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={async () => {
              if (!invitation) return;
              if (navigator.share) {
                try { await navigator.share({ url: invitation.url }); } catch {}
              } else {
                await navigator.clipboard.writeText(invitation.url);
                toast({ icon: "copy", text: "link copied", tone: "accent" });
              }
            }}
          >share</Button>
        </div>
        <div className="w-full flex items-center justify-between gap-2 pt-2 border-t border-hairline mt-2">
          <span className="text-xs text-text-2">link valid for</span>
          <div className="flex gap-1 p-0.5 rounded-pill bg-bg border border-hairline">
            {TTL_PRESETS.map((t) => {
              const on = ttl === t;
              return (
                <button
                  key={t}
                  className={`px-3 py-1 rounded-pill text-xs font-semibold ${on ? "bg-arcan-accent text-on-accent" : "text-text-2"}`}
                  onClick={() => setTtl(t)}
                  data-testid={`ttl-${t}`}
                >{t}</button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="flex items-center gap-2 my-2">
        <div className="flex-1 h-px bg-hairline" />
        <span className="text-[10px] uppercase tracking-widest text-dim font-semibold">add someone</span>
        <div className="flex-1 h-px bg-hairline" />
      </div>

      <Button variant="primary" onClick={() => navigate("/pair?role=responder")} data-testid="scan-their-code">
        scan their code
      </Button>
      <button
        className="text-xs text-arcan-accent self-center"
        onClick={() => {
          const url = prompt("paste invite link");
          if (url) {
            window.location.assign(url);
          }
        }}
      >or paste a link</button>
    </div>
  );
}
```

### Task 7.2: Commit Phase 7

```bash
git add src/routes/contacts/add.tsx
git commit -m "feat(invite): unified Add-Contact screen

Single screen replaces the prior split between 'create invite' and
'accept invite'. Top: your QR code + copy/share + duration picker
(1h/24h/7d). Bottom: scan their code (camera scanner) + paste-a-link.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 8 · Inbox subscription + Pending Connections list

### Task 8.1: Inbox subscription wiring

**Files:**
- Modify: `src/jazz/conversation.ts` (where the existing inbox subscription lives) OR create a parallel subscription hook
- Create: `src/jazz/use-incoming-connection-requests.ts`

Decide which is cleaner; both should subscribe to incoming `ConnectionRequest`s on `me`'s Inbox.

Sketch:

```typescript
// src/jazz/use-incoming-connection-requests.ts
import { useEffect, useState } from "react";
import { useAccount } from "jazz-tools/react";
import { Inbox } from "jazz-tools";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { ConnectionRequest } from "@/jazz/schema/ConnectionRequest";

export interface PendingRequest {
  request: ReturnType<typeof ConnectionRequest.create>;
  dismissedLocally: boolean;
}

/**
 * Subscribes to incoming ConnectionRequests via the Inbox and exposes the
 * non-dismissed, non-approved, non-expired set as React state.
 */
export function useIncomingConnectionRequests(): PendingRequest[] {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { dismissedRequestIDs: { $each: true } } },
  });
  const [items, setItems] = useState<Array<ReturnType<typeof ConnectionRequest.create>>>([]);

  useEffect(() => {
    if (!me.$isLoaded) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const inbox = await Inbox.load(me as any);
        if (cancelled) return;
        unsub = inbox.subscribe(ConnectionRequest, (req: any) => {
          setItems((cur) => {
            // dedupe by $jazz.id
            const id = req?.$jazz?.id;
            if (!id) return cur;
            if (cur.some((c) => (c as any)?.$jazz?.id === id)) return cur;
            return [...cur, req];
          });
        });
      } catch (e) {
        console.warn("[connection-requests] inbox subscribe failed:", e);
      }
    })();
    return () => { cancelled = true; unsub?.(); };
  }, [me.$isLoaded]);

  // Filter against dismissed set + status
  const dismissed = new Set(
    Array.from(((me as any).root?.dismissedRequestIDs as Iterable<string>) ?? [])
  );
  return items
    .filter((r: any) => !r?.approvedAt && (!r?.expiresAt || new Date(r.expiresAt).getTime() > Date.now()))
    .map((r: any) => ({ request: r, dismissedLocally: dismissed.has(r.$jazz.id) }))
    .filter((p) => !p.dismissedLocally);
}
```

### Task 8.2: Pending Connections list UI

**Files:**
- Create: `src/routes/connections/pending.tsx`
- Modify: `src/App.tsx` (route)
- Modify: `src/components/sidebar.tsx` (link / surface unread count badge)

Sketch:

```tsx
import { useIncomingConnectionRequests } from "@/jazz/use-incoming-connection-requests";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { approveConnectionRequest, dismissConnectionRequest } from "@/jazz/invitations";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import { SafetyNumber } from "@/components/safety-number";

export function PendingConnectionsRoute() {
  const me = useAccount(ArcanAccount, { resolve: { profile: true } });
  const pending = useIncomingConnectionRequests();
  const toast = useToast();
  if (!me.$isLoaded) return null;
  return (
    <div className="p-6 max-w-md mx-auto flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-text">pending connections</h1>
      {pending.length === 0 ? (
        <p className="text-sm text-text-2">No pending requests.</p>
      ) : (
        pending.map(({ request }) => <PendingCard key={(request as any).$jazz.id} me={me} request={request} toast={toast} />)
      )}
    </div>
  );
}

function PendingCard({ me, request, toast }: any) {
  const r = request as any;
  const shared = useSharedGroups(r.requesterAccountID);
  return (
    <section className="rounded-r-3 border border-hairline bg-panel p-4 flex flex-col gap-3" data-testid={`pending-${r.$jazz.id}`}>
      <h3 className="text-base font-semibold text-text">{r.requesterDisplayName}</h3>
      <p className="text-sm text-text-2">wants to connect</p>
      {shared.length > 0 && (
        <p className="text-xs text-arcan-accent">You're both in: {shared.map((s: any) => s.title).join(" · ")}</p>
      )}
      <details className="border border-hairline rounded-r-3 p-3 bg-bg">
        <summary className="cursor-pointer text-sm text-text">view security code</summary>
        <div className="mt-3"><SafetyNumber fingerprintHex={r.requesterFingerprint} /></div>
      </details>
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          onClick={async () => {
            await approveConnectionRequest(me, request);
            toast({ icon: "check", text: "contact added", tone: "success" });
          }}
          data-testid="approve"
        >approve</Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={async () => {
            await dismissConnectionRequest(me, request);
          }}
          data-testid="dismiss"
        >dismiss</Button>
      </div>
    </section>
  );
}
```

Route: `<Route path="/connections/pending" element={<PendingConnectionsRoute />} />`.

Sidebar link to the route + badge with the count of pending entries.

### Task 8.3: Commit Phase 8

```bash
git add src/jazz/use-incoming-connection-requests.ts src/routes/connections/pending.tsx src/App.tsx src/components/sidebar.tsx
git commit -m "feat(connections): Pending Connections list + Inbox subscription

Subscribes to incoming ConnectionRequests via Inbox.load(me).
Renders pending (not approved, not expired, not locally dismissed)
requests with the shared-group hint above and the safety number
collapsed below. Approve writes Contact + approvedAt; Dismiss writes
only to me.root.dismissedRequestIDs.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 9 · Requester side — observe approval

### Task 9.1: When requester is online, watch their ConnectionRequest

**Files:**
- Modify: `src/routes/invite/index.tsx` (extend the existing useState flow)

After `createConnectionRequest` resolves, poll/subscribe to the request CoValue until `approvedAt` appears or `expiresAt` passes. On approve, write the requester's local Contact mirroring the recipient's view (so the relationship is mutual locally) and navigate to the chat list.

```typescript
useEffect(() => {
  if (phase !== "sent" || !request) return;
  const interval = setInterval(async () => {
    try {
      const reloaded = await ConnectionRequest.load((request as any).$jazz.id as any, { resolve: {} });
      if (!reloaded) return;
      if ((reloaded as any).approvedAt) {
        clearInterval(interval);
        // Write the requester's own Contact entry for the recipient.
        await writeRecipientAsContact(me as any, invitation as any);
        setPhase("approved");
      } else if ((reloaded as any).expiresAt && new Date((reloaded as any).expiresAt).getTime() < Date.now()) {
        clearInterval(interval);
        setPhase("expired");
      }
    } catch {/* keep polling */}
  }, 3000);
  return () => clearInterval(interval);
}, [phase, request, invitation, me]);
```

`writeRecipientAsContact` is a helper that creates a Contact entry on the requester's side using the inviter info from the Invitation (already loaded).

### Task 9.2: Commit Phase 9

```bash
git add src/routes/invite/index.tsx src/jazz/invitations.ts
git commit -m "feat(invite): requester observes approvedAt and writes own Contact

After sending the ConnectionRequest, the requester polls the CoValue
for approvedAt. When set, the requester writes the recipient as a
Contact locally (mirroring what the recipient already did on approve).
This closes the mutual-append loop without cross-account writes.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 10 · Live Invites management screen

### Task 10.1: List + revoke + regenerate UI

**Files:**
- Create: `src/routes/connections/live-invites.tsx`
- Modify: `src/App.tsx`

Render `me.root.knownInvitations` or maintain a small `me.root.liveInvitations: co.list(Invitation)` per the spec.

Since the existing schema doesn't track this, add `me.root.liveInvitations: co.list(Invitation).optional()`. `createInvitation` pushes new entries; revokeInvitation marks the entry as revokedAt; regenerate creates a new one and (optionally) marks the old one revoked.

Sketch:

```tsx
export function LiveInvitesRoute() {
  const me = useAccount(ArcanAccount, { resolve: { root: { liveInvitations: { $each: true } } } });
  if (!me.$isLoaded) return null;
  const items = Array.from((me.root.liveInvitations as any) ?? []) as any[];
  const active = items.filter((i) => i && !i.revokedAt && (!i.expiresAt || new Date(i.expiresAt).getTime() > Date.now()));
  return (
    <div className="p-6 max-w-md mx-auto flex flex-col gap-3">
      <h1 className="text-lg font-semibold text-text">live invites</h1>
      {active.length === 0 ? (
        <p className="text-sm text-text-2">No active invites.</p>
      ) : (
        active.map((inv) => (
          <div key={inv.$jazz.id} className="rounded-r-3 border border-hairline bg-panel p-3 flex items-center gap-3">
            <div className="flex-1 text-sm text-text">
              <p>expires {new Date(inv.expiresAt).toLocaleString()}</p>
            </div>
            <button onClick={() => revokeInvitation(inv)} className="text-xs text-red">revoke</button>
          </div>
        ))
      )}
    </div>
  );
}
```

### Task 10.2: Commit Phase 10

```bash
git add src/jazz/schema/ArcanAccount.ts src/jazz/invitations.ts src/routes/connections/live-invites.tsx src/App.tsx
git commit -m "feat(connections): Live Invites management surface

me.root.liveInvitations list tracks the user's outstanding invitations.
The screen lists active (not revoked, not expired) entries with
expiry timestamps and a revoke action. Regenerate is a follow-up
(creates a new invite with the same TTL preset).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 11 · In-person QR + immediate-modal approval

### Task 11.1: QR-channel invitations + modal

**Files:**
- Modify: `src/routes/contacts/add.tsx` (add a "show in-person QR" affordance)
- Modify: `src/components/trusted-device-prompt.tsx` (or analog) to also handle in-person QR contact requests

When the recipient is online AND the channel is `qr`, the approval card should pop as an immediate modal (matching the device-pairing prompt model).

Reuse the same prompt component from Unit 2 OR build a parallel `IncomingConnectionPrompt` that listens to `useIncomingConnectionRequests()` and pops the topmost qr-channel request as a modal.

### Task 11.2: Commit Phase 11

```bash
git add src/components src/routes/contacts/add.tsx
git commit -m "feat(connections): in-person QR + immediate-modal approval

QR-channel ConnectionRequests trigger an immediate modal on the
recipient's side (both physically present, waiting on the tap).
Reuses the same approval card UI as the Pending Connections list,
just wrapped in a modal scrim.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 12 · Group-channel: request from member list

### Task 12.1: Add a "Request connection" affordance to member rows

**Files:**
- Modify: `src/routes/conversations/members.tsx` (or wherever member rows render)
- Modify: `src/jazz/conversation.ts` (add helper)

For each member who is **not already a Contact**, render a "request connection" button. On tap, call `createConnectionRequest(me, theirAccountID, "group", { expiresAt: createdAt + 30d })`.

### Task 12.2: Commit Phase 12

```bash
git add src/routes/conversations/members.tsx src/jazz/conversation.ts
git commit -m "feat(connections): group-channel — request connection from member list

In a conversation's member list, members who aren't already in the
user's ContactBook get a 'request connection' affordance. Tap creates
a ConnectionRequest with channel='group', expiresAt = createdAt + 30d.
Delivered 1:1 to the target's Inbox — the rest of the group sees nothing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 13 · Offline-conversation acceptance test

### Task 13.1: Playwright e2e — conversation created during requester offline window is detected on return

**Files:**
- Create: `tests/e2e/connection-offline-conversation.spec.ts`

Walk:

1. Alice (page A) and Bob (page B) sign up.
2. Alice opens her Add-Contact page, gets a link.
3. Bob opens the link → sends ConnectionRequest.
4. Bob closes the page.
5. Alice approves the request in her Pending Connections list.
6. Alice creates a 1:1 conversation with Bob and sends a message.
7. Bob re-opens the app, signs back in.
8. **Assert:** Bob's sidebar shows the conversation with Alice, and the message is visible.

This is the explicit acceptance test from the spec's "Eventual-consistency decision."

### Task 13.2: Commit Phase 13

```bash
git add tests/e2e/connection-offline-conversation.spec.ts
git commit -m "test(e2e): offline-conversation acceptance test for Unit 1

Walks the Alice/Bob flow where the conversation is created while the
requester is offline; asserts the requester picks it up on next sync.
Non-regression guard for the connection subsystem rework.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 14 · Final verification + merge

### Task 14.1: Tests + build

```bash
timeout 120 npm run test 2>&1 | tail -10
cd api && npx vitest run && cd ..
timeout 90 npm run build 2>&1 | tail -5
npm run check-tokens
npx playwright test tests/e2e/connection-offline-conversation.spec.ts
```

### Task 14.2: Manual smoke

Two browser profiles, walk through:
- Profile A: open Add Contact, copy link.
- Profile B (fresh): open the link → confirmation screen → connect.
- Profile A: Pending Connections list shows the request → Approve.
- Profile B: confirmation screen flips to "approved" → contact appears.
- Repeat the dismiss path: Profile A dismisses → Profile B never sees a signal, eventually times out.
- Group flow: from a group member list, tap a non-contact member → request → recipient's pending list.

### Task 14.3: Merge

```bash
git push -u origin unit-1-connection-subsystem
git checkout main
git merge --no-ff unit-1-connection-subsystem -m "Merge Unit 1: connection subsystem rework"
git push origin main
git branch -d unit-1-connection-subsystem
git push origin --delete unit-1-connection-subsystem
```

---

## Self-review checklist

- [ ] Invitation reshaped (multi-use, channel, revokedAt, no consumed / recipient*).
- [ ] ConnectionRequest CoValue with the documented fields, including no `rejectedAt`.
- [ ] `me.root.dismissedRequestIDs` added + initialized + backfilled.
- [ ] `useSharedGroups` hook exists (or imported from Unit 4 if that landed first).
- [ ] `createInvitation`, `createConnectionRequest`, `approveConnectionRequest`, `dismissConnectionRequest` all implemented + tested.
- [ ] Requester confirmation screen + sent + approved + expired states.
- [ ] Unified Add-Contact page with QR + copy + share + ttl picker + scan + paste.
- [ ] Pending Connections list filters by approvedAt + expiresAt + dismissedRequestIDs.
- [ ] Approve writes own Contact + approvedAt; Dismiss writes only local.
- [ ] Requester observes approvedAt + writes its own Contact mirror.
- [ ] Live Invites management screen with revoke.
- [ ] In-person QR pops an immediate modal on the recipient.
- [ ] Group-channel request available from member list (non-contact members only).
- [ ] Offline-conversation acceptance test passes.
- [ ] Full test + build + check-tokens green.
