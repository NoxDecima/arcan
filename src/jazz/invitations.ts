/**
 * Contact invitation protocol primitives — multi-use Invitation model.
 *
 * Spec: docs/superpowers/plans/2026-06-09-unit-1-connection-subsystem.md §Phase 5
 *
 * ## URL format
 * /invite#<base64url("invitationCoValueID|inviterAccountID")>
 *
 * ## Access model
 * The Invitation CoValue lives in an "everyone writer" group so any recipient
 * can load it without a per-recipient agent secret. It is multi-use: multiple
 * recipients can read it and submit a ConnectionRequest.
 *
 * ## ConnectionRequest delivery
 * Each opener mints a fresh ConnectionRequest in a new notification group and
 * delivers it to the recipient's Inbox via InboxSender — the same pattern used
 * for ConversationNotification in conversation.ts.
 */

import { Group, Account, InboxSender } from "jazz-tools";
import { Invitation } from "./schema/Invitation";
import { ConnectionRequest } from "./schema/ConnectionRequest";
import { getAccountPubkeyHex } from "@/auth/pubkey";
import { getServerOrigin } from "@/platform/server-config";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const LINK_TTL_OPTIONS = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  // "none" = permanent invite; falsy so createInvitation skips expiresAt.
  "none": 0,
} as const;

export const QR_TTL_MS = 5 * 60 * 1000;
export const GROUP_REQUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type LinkTtl = keyof typeof LINK_TTL_OPTIONS;

// ---------------------------------------------------------------------------
// Base64url helpers (plain string variant — no TextEncoder needed)
// ---------------------------------------------------------------------------

function toB64url(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): string {
  const padded = s
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  return atob(padded);
}

// ---------------------------------------------------------------------------
// Inviter side
// ---------------------------------------------------------------------------

/**
 * Derive a shareable /invite#<fragment> URL from a CoValue ID and an account
 * ID. Pure — no side effects.
 *
 * Extracted so live-invites.tsx can reconstruct the URL from a stored
 * Invitation CoValue without re-creating the whole invitation.
 */
export function invitationUrl(coValueId: string, accountId: string): string {
  const fragment = toB64url(`${coValueId}|${accountId}`);
  // getServerOrigin() returns window.location.origin on web (unchanged
  // behavior) and the baked/overridden origin in the Tauri shell — so
  // generated invite URLs point at the correct server rather than
  // tauri.localhost. The no-window fallback keeps the pre-existing
  // placeholder contract (pinned by invitation-no-expiry.test.ts).
  const baseUrl =
    typeof window === "undefined" ? "https://arcan.app" : getServerOrigin();
  return `${baseUrl}/invite#${fragment}`;
}

/**
 * Create a multi-use Invitation CoValue in an everyone-writer group.
 *
 * @param account  - the inviter's account (me from useAccount)
 * @param channel  - "qr" (fixed 5-min TTL) or "link" (TTL from linkTtl)
 * @param linkTtl  - only used when channel === "link"; defaults to "24h".
 *                   Pass "none" for a permanent invite (expiresAt omitted).
 * @returns the Invitation CoValue and a shareable URL
 */
export async function createInvitation(
  account: Account,
  channel: "qr" | "link",
  linkTtl: LinkTtl = "24h",
): Promise<{ invitation: ReturnType<typeof Invitation.create>; url: string }> {
  const me = account as Account & {
    profile?: { displayName?: string; name?: string };
    $jazz: { id: string };
  };

  const now = new Date();
  // "none" maps to 0 (falsy) — permanent invite, no expiresAt.
  const ttlMs = channel === "qr" ? QR_TTL_MS : LINK_TTL_OPTIONS[linkTtl];
  const expiresAt = ttlMs ? new Date(now.getTime() + ttlMs) : undefined;

  const displayName =
    me.profile?.displayName ?? me.profile?.name ?? "Anonymous";

  // Everyone-writer group so any recipient can load the CoValue
  const inviteGroup = Group.create({ owner: account });
  inviteGroup.addMember("everyone", "writer");

  const invitation = Invitation.create(
    {
      inviterAccountID: me.$jazz.id,
      inviterFingerprint: getAccountPubkeyHex(account),
      inviterDisplayName: displayName,
      channel,
      createdAt: now,
      ...(expiresAt ? { expiresAt } : {}),
    },
    { owner: inviteGroup },
  );

  // Track in the user's live invites list for the management screen.
  try {
    const rootAny = (account as any).root;
    if (rootAny?.liveInvitations && typeof rootAny.liveInvitations.$jazz?.push === "function") {
      rootAny.liveInvitations.$jazz.push(invitation);
    }
  } catch (e) {
    console.warn("[invitation] could not push to liveInvitations:", e);
  }

  const url = invitationUrl((invitation as any).$jazz.id, me.$jazz.id);

  return { invitation, url };
}

/**
 * Insert a `?via=qr` query marker into an invite URL, before the hash
 * fragment. The QR code encodes the marked URL; a copied/shared link uses
 * the plain URL. This is how the recipient's accept flow distinguishes a
 * scanned QR (→ channel="qr", which raises the live add-contact pop-up on
 * the inviter's screen) from a pasted link (→ channel="link", which lands
 * silently on the Pending Connections list).
 *
 * Pure + idempotent (returns the input unchanged if already marked).
 */
export function withQrChannelMarker(url: string): string {
  if (/[?&]via=qr(&|$|#)/.test(url)) return url;
  const hashIdx = url.indexOf("#");
  const base = hashIdx === -1 ? url : url.slice(0, hashIdx);
  const hash = hashIdx === -1 ? "" : url.slice(hashIdx);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}via=qr${hash}`;
}

/**
 * Read the channel a recipient used to open an invite from its query
 * string. QR-scanned URLs carry `?via=qr`; copied/shared links do not.
 * Returns "qr" or "link".
 */
export function readInviteChannel(search: string): "qr" | "link" {
  return new URLSearchParams(search).get("via") === "qr" ? "qr" : "link";
}

/**
 * Revoke an invitation by stamping revokedAt.
 *
 * Consumer routes should treat revokedAt being set as "no longer valid".
 */
export async function revokeInvitation(
  invitation: ReturnType<typeof Invitation.create>,
): Promise<void> {
  (invitation as any).$jazz.set("revokedAt", new Date());
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

/**
 * Parse an /invite URL and extract both CoValue IDs from the fragment.
 *
 * Fragment format: base64url("invitationID|inviterAccountID")
 *
 * @throws if url does not include /invite, fragment is missing, or malformed
 */
export function parseInvitationURL(url: string): {
  invitationID: string;
  inviterAccountID: string;
} {
  const parsed = new URL(url);
  if (!parsed.pathname.includes("/invite")) {
    throw new Error("Not an invitation URL — path does not include /invite");
  }

  const fragment = parsed.hash.slice(1); // remove leading '#'
  if (!fragment) {
    throw new Error("Invitation URL has no fragment");
  }

  const decoded = fromB64url(fragment);
  const parts = decoded.split("|");
  if (parts.length !== 2) {
    throw new Error(
      `Invitation URL fragment has ${parts.length} pipe-delimited part(s), expected 2`,
    );
  }

  const [invitationID, inviterAccountID] = parts;
  return { invitationID, inviterAccountID };
}

// ---------------------------------------------------------------------------
// Recipient side — loading
// ---------------------------------------------------------------------------

/**
 * Load an Invitation CoValue by ID.
 *
 * Works without any agent secret because the owner group has "everyone" writer.
 *
 * @param invitationID - the Invitation CoValue ID (co_z...)
 * @throws if the CoValue cannot be loaded
 */
export async function loadInvitationAsGuest(
  invitationID: string,
): Promise<ReturnType<typeof Invitation.create>> {
  const invitation = await Invitation.load(invitationID as any, {
    resolve: {},
  });

  if (!invitation) {
    throw new Error(`Could not load Invitation CoValue ${invitationID}`);
  }

  return invitation as ReturnType<typeof Invitation.create>;
}

// ---------------------------------------------------------------------------
// ConnectionRequest
// ---------------------------------------------------------------------------

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

/**
 * FM1 group collapse (Task 7 review): the UI collapses pending rows PER
 * REQUESTER (useIncomingConnectionRequests), but approve/deny receive only
 * the single representative CoValue — without converging the rest of the
 * group, the next-latest duplicate from the same person would immediately
 * resurface them (pending rows, badge, modal re-open). Collect the OTHER
 * live entries in me.root.incomingConnectionRequests from the same
 * requester: not the acted-on ID, and skip entries already stamped
 * approved/denied.
 */
function sameRequesterLiveDupes(recipient: Account, acted: any): any[] {
  const record = (recipient as any).root?.incomingConnectionRequests;
  const requesterID = acted?.requesterAccountID;
  if (!record || typeof requesterID !== "string") return [];
  const actedID = acted?.$jazz?.id;
  const dupes: any[] = [];
  for (const entry of Object.values(record as Record<string, any>)) {
    const e = entry as any;
    if (!e?.$jazz?.id || e.$jazz.id === actedID) continue;
    if (e.requesterAccountID !== requesterID) continue;
    if (e.approvedAt || e.deniedAt) continue; // already decided
    dupes.push(e);
  }
  return dupes;
}

/**
 * Approve outcome, for honest caller feedback:
 * - "approved"    — contact write landed (created/unchanged/conflict) and
 *                   approvedAt is stamped (or already was — idempotent).
 * - "unavailable" — the approver's contacts record (or the existing keyed
 *                   entry) isn't loaded yet; NOTHING was stamped. Retryable.
 * - "malformed"   — foreign/garbage payload refused (FM4); NOTHING stamped.
 *                   Never succeeds on retry.
 */
export type ApproveConnectionRequestOutcome =
  | "approved"
  | "unavailable"
  | "malformed";

/**
 * Approve a ConnectionRequest: write the requester as a local Contact in the
 * recipient's contacts record (via upsertContact), THEN stamp approvedAt.
 *
 * ORDER MATTERS (approver-side silent-loss fix, 2026-07-21): approvedAt is
 * the signal the REQUESTER's watcher acts on — it hands the requester their
 * contact and settles the request for good. If the approver's own contact
 * write didn't land (contacts record unloaded at click → "unavailable"),
 * stamping anyway would give the requester the connection while the approver
 * silently gets nothing — and no approve-side retry exists. So on
 * "unavailable" NOTHING is stamped (not the acted request, not the collapsed
 * same-requester dupes) and the caller gets a retryable outcome; the request
 * stays live on every pending surface.
 *
 * Idempotent: returns "approved" without re-stamping if approvedAt is set.
 *
 * @param recipient - the approving account (me from useAccount)
 * @param request   - the ConnectionRequest CoValue to approve
 */
export async function approveConnectionRequest(
  recipient: Account,
  request: ReturnType<typeof ConnectionRequest.create>,
): Promise<ApproveConnectionRequestOutcome> {
  const r = request as any;
  if (r.approvedAt) return "approved"; // idempotent

  // Shape guard (FM4 e2e finding, 2026-07-21): Inbox.subscribe(Schema, …)
  // does NOT filter by schema — every inbox message's payload reaches every
  // subscription. A foreign payload (e.g. a ConversationNotification) read
  // through the ConnectionRequest schema has all fields undefined; stamping
  // approvedAt on it mutates an unrelated CoValue and the contact write
  // below would create a garbage entry keyed `undefined`. The drain guard
  // in use-incoming-connection-requests.ts keeps such payloads out of the
  // record; this is defense in depth for any other call path.
  if (
    typeof r.requesterAccountID !== "string" ||
    typeof r.requesterFingerprint !== "string"
  ) {
    console.warn(
      "[handshake] refusing to approve malformed request:",
      r?.$jazz?.id,
    );
    return "malformed";
  }

  // Contact write FIRST, through the single idempotent writer (FM7): keyed
  // by account ID, TOFU-aware. Approving a duplicate request for an existing
  // contact is a structural no-op ("unchanged"); "conflict" still counts as
  // landed (the pin is kept, the conflict flag is set for the profile
  // safety-number section).
  //
  // Dynamic import ON PURPOSE: handshake.ts statically imports from
  // invitations.ts (mint/deliver, Task 5); a static import here would close
  // an ES-module cycle. The function is already async — the lazy import
  // keeps the dependency edge one-directional at module-init time.
  const { upsertContact } = await import("./handshake");
  const upsertResult = upsertContact(recipient, {
    contactAccountID: r.requesterAccountID,
    fingerprint: r.requesterFingerprint,
    displayName: r.requesterDisplayName,
  });
  if (upsertResult === "unavailable") return "unavailable";

  r.$jazz.set("approvedAt", new Date());

  // Converge the whole collapsed same-requester group: stamp every other
  // live duplicate approved too (idempotent — same person; the contact
  // write stays the single upsert above).
  for (const dupe of sameRequesterLiveDupes(recipient, r)) {
    if (typeof dupe.$jazz?.set === "function") {
      dupe.$jazz.set("approvedAt", new Date());
    }
  }
  return "approved";
}

/**
 * Dismiss a ConnectionRequest: record its CoValue ID in the keyed
 * me.root.dismissedRequests record. No shared CoValue is mutated.
 * Contact-robustness slice: storage moved to the keyed record — same-key
 * sets converge, so dedup is structural.
 *
 * Dismissal is NOT a decision (user decision, 2026-07-08 walkthrough): it only
 * mutes the incoming-connection modal. The request stays on the pending
 * surfaces until the user explicitly approves (approveConnectionRequest) or
 * denies (denyConnectionRequest).
 *
 * Deduplicated: a second call with the same request is a no-op.
 *
 * @param recipient - the dismissing account (me from useAccount)
 * @param request   - the ConnectionRequest CoValue to dismiss
 */
export async function dismissConnectionRequest(
  recipient: Account,
  request: ReturnType<typeof ConnectionRequest.create>,
): Promise<void> {
  const record = (recipient as any).root?.dismissedRequests;
  if (!record || typeof record.$jazz?.set !== "function") return;
  record.$jazz.set((request as any).$jazz.id as string, true);
}

/**
 * Deny a ConnectionRequest: the explicit "no" decision. Deletes the request
 * key from me.root.incomingConnectionRequests, so it leaves every pending
 * surface for good. Contact-robustness slice: storage moved to the keyed
 * records (same-key delete/set converge across racing devices).
 *
 * Also records the ID in dismissedRequests — if the same request ever
 * reappears (e.g. a delivery race re-drains it), the modal stays muted.
 *
 * Feedback round 2: stamps `deniedAt` on the shared CoValue before doing the
 * local cleanup. The recipient already has writer access to the request
 * (same mechanism `approveConnectionRequest` uses for `approvedAt`). The
 * requester's waiting screen polls for `deniedAt` and transitions to a
 * terminal "declined" state when it is set. Idempotent: a second call is a
 * no-op when `deniedAt` is already set.
 *
 * @param recipient - the denying account (me from useAccount)
 * @param request   - the ConnectionRequest CoValue to deny
 */
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
  const dismissed = root?.dismissedRequests;

  // Collect BEFORE deleting the representative (the record iteration must
  // still see a consistent snapshot); acted-on ID is skipped inside.
  const dupes = sameRequesterLiveDupes(recipient, r);

  if (incoming && typeof incoming.$jazz?.delete === "function") {
    incoming.$jazz.delete(id);
  }

  if (dismissed && typeof dismissed.$jazz?.set === "function") {
    dismissed.$jazz.set(id, true);
  }

  // Converge the whole collapsed same-requester group: every other live
  // duplicate gets the exact same treatment as the representative
  // (deniedAt stamp, record delete, dismissed marker), so the next-latest
  // dupe cannot resurface the requester.
  for (const dupe of dupes) {
    if (!dupe.deniedAt && typeof dupe.$jazz?.set === "function") {
      dupe.$jazz.set("deniedAt", new Date());
    }
    const dupeID = dupe.$jazz.id as string;
    if (incoming && typeof incoming.$jazz?.delete === "function") {
      incoming.$jazz.delete(dupeID);
    }
    if (dismissed && typeof dismissed.$jazz?.set === "function") {
      dismissed.$jazz.set(dupeID, true);
    }
  }
}
