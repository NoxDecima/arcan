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
import { Contact } from "./schema/Contact";
import { getAccountPubkeyHex } from "@/auth/pubkey";

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
  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "https://arcan.app";
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
 * Mint a ConnectionRequest CoValue and deliver it to the recipient's Inbox.
 *
 * The request is wrapped in a fresh notification group (same pattern as
 * ConversationNotification in conversation.ts:151-166) so InboxSender can add
 * the recipient as "writer" without any prior role conflict.
 *
 * @param requester         - the account opening the connection
 * @param recipientAccountID - the inviter's account ID (from parseInvitationURL)
 * @param channel           - "qr" | "link" | "group"
 * @param opts.invitationID - the Invitation CoValue ID if channel !== "group"
 * @param opts.expiresAt    - when this request expires (caller sets based on channel TTL)
 * @returns the created ConnectionRequest CoValue
 */
export async function createConnectionRequest(
  requester: Account,
  recipientAccountID: string,
  channel: "qr" | "link" | "group",
  opts: { invitationID?: string; expiresAt: Date },
): Promise<ReturnType<typeof ConnectionRequest.create>> {
  const me = requester as Account & {
    profile?: { displayName?: string; name?: string };
    $jazz: { id: string };
  };

  const displayName =
    me.profile?.displayName ?? me.profile?.name ?? "Anonymous";

  // Fresh notification group — recipient has no prior role here so
  // InboxSender.load() can add them as "writer" without conflict.
  const notificationGroup = Group.create({ owner: requester });

  const request = ConnectionRequest.create(
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
  );

  // Deliver via the recipient's Inbox
  const sender = await InboxSender.load<typeof request>(
    recipientAccountID as any,
    requester,
  );
  await sender.sendMessage(request);

  return request as ReturnType<typeof ConnectionRequest.create>;
}

/**
 * Approve a ConnectionRequest: stamp approvedAt and write the requester as a
 * local Contact in the recipient's contactBook.
 *
 * Idempotent: no-ops if approvedAt is already set.
 *
 * @param recipient - the approving account (me from useAccount)
 * @param request   - the ConnectionRequest CoValue to approve
 */
export async function approveConnectionRequest(
  recipient: Account,
  request: ReturnType<typeof ConnectionRequest.create>,
): Promise<void> {
  const r = request as any;
  if (r.approvedAt) return; // idempotent

  r.$jazz.set("approvedAt", new Date());

  // Write the requester as a local Contact in the recipient's contactBook
  const contact = Contact.create(
    {
      contactAccountID: r.requesterAccountID,
      pinnedFingerprint: r.requesterFingerprint,
      displayNameLocal: r.requesterDisplayName,
      addedAt: new Date(),
    },
    { owner: recipient },
  );

  const contactBook = (recipient as any).root?.contactBook;
  if (contactBook) {
    contactBook.$jazz.push(contact);
  }
}

/**
 * Dismiss a ConnectionRequest: add its CoValue ID to
 * me.root.dismissedRequestIDs. No shared CoValue is mutated.
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
  const root = (recipient as any).root;
  const list = root?.dismissedRequestIDs;
  if (!list) return;

  const id = (request as any).$jazz.id as string;

  // Deduplicate before pushing
  const existing: string[] = Array.from(list as Iterable<string>);
  if (!existing.includes(id)) {
    list.$jazz.push(id);
  }
}

/**
 * Deny a ConnectionRequest: the explicit "no" decision. Removes the request
 * from me.root.incomingRequests, so it leaves every pending surface for good.
 *
 * Also records the ID in dismissedRequestIDs — if the same request ever
 * reappears (e.g. a delivery race re-drains it), the modal stays muted.
 *
 * No shared CoValue is mutated: the requester is not notified, same as
 * dismissal always behaved.
 *
 * @param recipient - the denying account (me from useAccount)
 * @param request   - the ConnectionRequest CoValue to deny
 */
export async function denyConnectionRequest(
  recipient: Account,
  request: ReturnType<typeof ConnectionRequest.create>,
): Promise<void> {
  const root = (recipient as any).root;
  const id = (request as any).$jazz.id as string;

  const incoming = root?.incomingRequests;
  if (incoming && typeof incoming.$jazz?.remove === "function") {
    incoming.$jazz.remove((r: any) => r?.$jazz?.id === id);
  }

  const dismissed = root?.dismissedRequestIDs;
  if (dismissed) {
    const existing: string[] = Array.from(dismissed as Iterable<string>);
    if (!existing.includes(id)) {
      dismissed.$jazz.push(id);
    }
  }
}
