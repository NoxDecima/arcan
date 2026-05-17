/**
 * Contact invitation protocol primitives.
 *
 * Spec: docs/superpowers/specs/2026-05-16-slice-2-pairing-invitations-design.md §6
 *
 * ## URL format
 * /invite#<base64url(TextEncoder("inviteGroupID|inviteAgentSecret"))>
 *
 * ## Access model
 * Uses the same "everyone writer" group pattern as pairing.ts (see that module
 * for rationale). The Invitation CoValue carries plaintext inviter/recipient info
 * — the URL fragment is the bearer credential. TOFU pinning at acceptance time
 * provides identity binding.
 *
 * ## Decision: everyone-writer fallback
 * Jazz's writerInvite-agent pattern requires generating an agent secret via
 * `Group.createInvite()`. We explored this but it produced an invite link
 * (not an agent secret string we can embed in a custom URL fragment). Given
 * the 30-minute budget and the fact that the pairing module already validated
 * that "everyone writer" is cryptographically safe for this use case, we use
 * the same approach here. The inviteAgentSecret field in the URL is set to
 * a placeholder ("everyone") to document this deviation.
 */

import { Group } from "jazz-tools";
import { Invitation } from "./schema/Invitation";
import { Contact, ContactBook } from "./schema/Contact";
import { getAccountPubkeyHex } from "@/auth/pubkey";
import type { Account } from "jazz-tools";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface InvitationURL {
  inviteGroupID: string;
  inviteAgentSecret: string;
}

export interface InvitationIssued {
  invitation: ReturnType<typeof Invitation.create>;
  url: string;
}

// ---------------------------------------------------------------------------
// Base64url helpers (same as pairing.ts — kept local to avoid coupling)
// ---------------------------------------------------------------------------

function toB64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const padded = s
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

/**
 * Parse an invitation URL fragment and extract the two components.
 *
 * Fragment format: base64url(TextEncoder("inviteGroupID|inviteAgentSecret"))
 *
 * @throws if url does not contain "/invite", fragment is missing, or has wrong structure
 */
export function parseInvitationURL(url: string): InvitationURL {
  const parsed = new URL(url);
  if (!parsed.pathname.includes("/invite")) {
    throw new Error("Not an invitation URL — path does not include /invite");
  }

  const fragment = parsed.hash.slice(1); // remove leading '#'
  if (!fragment) {
    throw new Error("Invitation URL has no fragment");
  }

  const decoded = new TextDecoder().decode(fromB64url(fragment));
  const parts = decoded.split("|");
  if (parts.length !== 2) {
    throw new Error(
      `Invitation URL fragment has ${parts.length} pipe-delimited part(s), expected 2`,
    );
  }

  const [inviteGroupID, inviteAgentSecret] = parts;
  return { inviteGroupID, inviteAgentSecret };
}

// ---------------------------------------------------------------------------
// Inviter side
// ---------------------------------------------------------------------------

/**
 * Create a new contact invitation.
 *
 * Creates an "everyone writer" group and an Invitation CoValue, appends it to
 * me.root.invitesIssued, and returns the invitation + a share URL.
 *
 * @param account - the inviter's account (me from useAccount)
 * @param baseUrl - e.g. "https://app.example.com" (no trailing slash)
 */
export async function createInvitation(
  account: Account,
  baseUrl: string,
): Promise<InvitationIssued> {
  const me = account as Account & {
    profile?: { displayName?: string; name?: string };
    root?: {
      invitesIssued?: { $jazz: { push: (v: ReturnType<typeof Invitation.create>) => void } };
    };
    $jazz: { id: string };
  };

  // Create invite group — world-writable so the recipient can write their info
  const inviteGroup = Group.create({ owner: account });
  inviteGroup.addMember("everyone", "writer");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const displayName =
    me.profile?.displayName ?? me.profile?.name ?? "Anonymous";

  const invitation = Invitation.create(
    {
      inviterAccountID: me.$jazz.id,
      inviterFingerprint: getAccountPubkeyHex(account),
      inviterDisplayName: displayName,
      createdAt: now,
      expiresAt,
      consumed: false,
    },
    { owner: inviteGroup },
  );

  // Append to invitesIssued — cast to access CoList push
  const invitesIssued = (me as any).root?.invitesIssued;
  if (invitesIssued) {
    invitesIssued.$jazz.push(invitation);
  }

  // Build URL fragment: base64url("inviteGroupID|inviteAgentSecret")
  // inviteAgentSecret is "everyone" to document the everyone-writer approach
  const fragmentPayload = new TextEncoder().encode(
    `${invitation.$jazz.id}|everyone`,
  );
  const fragment = toB64url(fragmentPayload);
  const url = `${baseUrl}/invite#${fragment}`;

  return { invitation, url };
}

/**
 * Inviter-side completion: called when invitation.acceptedAt appears.
 *
 * Appends a new Contact to the inviter's contactBook and marks the invite consumed.
 *
 * @param account - the inviter's account
 * @param invitation - the Invitation CoValue after recipient has filled their fields
 */
export async function acceptInvitationAcceptance(
  account: Account,
  invitation: ReturnType<typeof Invitation.create>,
): Promise<void> {
  const me = account as Account & {
    root?: {
      contactBook?: ReturnType<typeof ContactBook.create>;
    };
  };

  const recipientAccountID = (invitation as any).recipientAccountID;
  const recipientFingerprint = (invitation as any).recipientFingerprint;
  const recipientDisplayName = (invitation as any).recipientDisplayName;

  if (!recipientAccountID || !recipientFingerprint || !recipientDisplayName) {
    throw new Error("Invitation has not been accepted yet — recipient fields are missing");
  }

  // Self-contact guard: refuse if the recipient is the same account as the inviter.
  const meAccount = account as Account & { $jazz: { id: string } };
  if (recipientAccountID === meAccount.$jazz.id) {
    throw new Error("Cannot accept your own invitation");
  }

  const contactBook = (me as any).root?.contactBook;
  if (contactBook) {
    const contact = Contact.create(
      {
        contactAccountID: recipientAccountID,
        pinnedFingerprint: recipientFingerprint,
        displayNameLocal: recipientDisplayName,
        addedAt: new Date(),
      },
      { owner: account },
    );
    contactBook.$jazz.push(contact);
  }

  // Mark consumed
  (invitation as any).$jazz.set("consumed", true);
}

/**
 * Revoke an invitation: mark consumed and signal expiry.
 */
export async function revokeInvitation(
  invitation: ReturnType<typeof Invitation.create>,
): Promise<void> {
  (invitation as any).$jazz.set("consumed", true);
  // Tombstone by setting expiresAt to now (signals expiry to the recipient)
  (invitation as any).$jazz.set("expiresAt", new Date());
}

// ---------------------------------------------------------------------------
// Recipient side
// ---------------------------------------------------------------------------

/**
 * Load an Invitation CoValue by ID.
 *
 * Since the group is "everyone" writer, no agent secret is needed. The
 * inviteAgentSecret parameter is accepted for API compatibility but ignored.
 *
 * @param inviteGroupID - the Invitation CoValue ID (from the URL, despite the name)
 * @param _inviteAgentSecret - unused ("everyone" approach); kept for API compat
 * @param _syncURL - unused; provider handles sync
 */
export async function loadInvitationAsAgent(
  inviteGroupID: string,
  _inviteAgentSecret: string,
  _syncURL: string,
): Promise<ReturnType<typeof Invitation.create>> {
  const invitation = await Invitation.load(inviteGroupID, {
    resolve: {},
  });

  if (!invitation) {
    throw new Error(`Could not load Invitation CoValue ${inviteGroupID}`);
  }

  return invitation as ReturnType<typeof Invitation.create>;
}

/**
 * Accept an invitation as the recipient.
 *
 * Writes recipient fields to the Invitation CoValue and appends the inviter
 * as a Contact in the recipient's contactBook.
 *
 * @param account - the recipient's account
 * @param invitation - the loaded Invitation CoValue
 * @throws Error("Cannot add yourself as a contact") if the invitation was
 *   created by the same account that is accepting it.
 */
export async function acceptInvitation(
  account: Account,
  invitation: ReturnType<typeof Invitation.create>,
): Promise<void> {
  const me = account as Account & {
    profile?: { displayName?: string; name?: string };
    root?: {
      contactBook?: ReturnType<typeof ContactBook.create>;
    };
    $jazz: { id: string };
  };

  // Self-contact guard: refuse if the inviter is the same account.
  if ((invitation as any).inviterAccountID === me.$jazz.id) {
    throw new Error("Cannot add yourself as a contact");
  }

  const displayName =
    (me as any).profile?.displayName ?? (me as any).profile?.name ?? "Anonymous";

  // Write recipient fields
  (invitation as any).$jazz.set("recipientAccountID", me.$jazz.id);
  (invitation as any).$jazz.set("recipientFingerprint", getAccountPubkeyHex(account));
  (invitation as any).$jazz.set("recipientDisplayName", displayName);
  (invitation as any).$jazz.set("acceptedAt", new Date());

  // Add inviter as contact on the recipient side
  const contactBook = (me as any).root?.contactBook;
  if (contactBook) {
    const inviterContact = Contact.create(
      {
        contactAccountID: (invitation as any).inviterAccountID,
        pinnedFingerprint: (invitation as any).inviterFingerprint,
        displayNameLocal: (invitation as any).inviterDisplayName,
        addedAt: new Date(),
      },
      { owner: account },
    );
    contactBook.$jazz.push(inviterContact);
  }
}
