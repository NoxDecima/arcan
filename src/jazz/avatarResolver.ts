// src/jazz/avatarResolver.ts
/**
 * Resolve the FileBlob for an account's avatar, mirroring resolveDisplayName.
 *
 * Lookup chain:
 *   1. Self (me): me.profile.avatar
 *   2. contactBook entry: contact's referenced Account → profile.avatar
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
