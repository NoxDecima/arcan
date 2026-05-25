// src/jazz/avatarResolver.ts
import { useCoState } from "jazz-tools/react";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";

/**
 * Resolve the FileBlob for an account's avatar, mirroring resolveDisplayName.
 *
 * Lookup chain:
 *   1. Self (me): me.profile.avatar
 *   2. contactBook entry: contact's referenced Account → profile.avatar
 *      (Note: Contact schema stores accountID as a plain string, not a ref,
 *       so this branch is currently a no-op — use useRemoteAvatar for
 *       contact-list surfaces.)
 *   3. group direct member: member.account → profile.avatar
 *   4. undefined → caller's <Avatar> falls back to initials
 */
export function resolveAvatarFileBlob(args: {
  accountID: string;
  me: any;
  group?: any;
}): any | undefined {
  const { accountID, me, group } = args;

  // Self
  if ((me as any)?.$jazz?.id === accountID) {
    return (me as any)?.profile?.avatar ?? undefined;
  }

  // Contact book
  const contactBook = (me as any)?.root?.contactBook;
  if (contactBook) {
    for (const contact of contactBook as Iterable<any>) {
      if (contact?.contactAccountID === accountID) {
        // contact.$jazz.owner is a Group; the contact's Account is on the
        // group's direct-members. Try the explicit ref path:
        const accountRef = contact?.$jazz?.refs?.account;
        if (accountRef && accountRef?.profile?.avatar) {
          return accountRef.profile.avatar;
        }
        break;
      }
    }
  }

  // Group direct member
  if (group) {
    try {
      const members = group.getDirectMembers() as any[];
      for (const m of members) {
        if (m?.account?.$jazz?.id === accountID) {
          const avatar = m?.account?.profile?.avatar;
          if (avatar) return avatar;
        }
      }
    } catch {
      // ignored
    }
  }

  return undefined;
}

/**
 * Reactive hook: loads a remote account by ID and returns its profile.avatar
 * FileBlob (or undefined while loading / when no avatar is set).
 *
 * Used by surfaces that need to display avatars for accounts the local user
 * only knows by ID — primarily the contacts list/detail where the Contact
 * schema stores `contactAccountID: string` rather than an Account ref.
 *
 * Profiles are publicly readable (see JazzMessangerAccount migration), so any
 * member of the contact's account network can resolve this asynchronously.
 *
 * Pass `null`/`undefined` `accountID` to skip the subscription (e.g. while a
 * contact row is still loading).
 */
export function useRemoteAvatar(accountID: string | null | undefined): any | undefined {
  const account = useCoState(
    JazzMessangerAccount,
    accountID as any,
    { resolve: { profile: true } },
  );
  return (account as any)?.profile?.avatar ?? undefined;
}
