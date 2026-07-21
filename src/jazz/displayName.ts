/**
 * Single-source name resolution used by both MessageRow (in detail.tsx) and
 * MembersRoute. Resolution order:
 *
 *   1. self → me.profile.displayName ?? "Me"
 *   2. contacts-record entry keyed by accountID (displayNameLocal)
 *   3. group member whose account.$jazz.id matches, using profile.name then profile.displayName
 *   4. "Unknown"
 *
 * The helper is pure: no async, no Jazz mutations. Inputs are already-loaded
 * Jazz CoValues / proxies.
 */
import { getContact } from "@/jazz/handshake";

export function resolveDisplayName(args: {
  accountID: string;
  me: any;
  group?: any;
}): string {
  const { accountID, me, group } = args;

  const myID = me?.$jazz?.id ?? null;
  if (myID && accountID === myID) {
    return me?.profile?.displayName ?? "Me";
  }

  const contactEntry = getContact(me, accountID);
  if (contactEntry?.displayNameLocal) {
    return contactEntry.displayNameLocal as string;
  }

  if (group?.getDirectMembers) {
    let members: any[] = [];
    try {
      members = group.getDirectMembers();
    } catch {
      members = [];
    }
    for (const m of members) {
      const memberID = m?.account?.$jazz?.id;
      if (memberID === accountID) {
        const name = m.account?.profile?.name;
        if (name) return name as string;
        const displayName = m.account?.profile?.displayName;
        if (displayName) return displayName as string;
      }
    }
  }

  return "Unknown";
}
