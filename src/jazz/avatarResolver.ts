// src/jazz/avatarResolver.ts
import { useCoState } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { getContact } from "@/jazz/handshake";

/**
 * Resolve the FileBlob for an account's avatar, mirroring resolveDisplayName.
 *
 * Lookup chain:
 *   1. Self (me): me.profile.avatar
 *   2. contacts-record entry: contact's referenced Account → profile.avatar
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

  // Contacts record (keyed by account ID; migration-pending fallback lives
  // in getContact — see handshake.ts)
  const contact = getContact(me, accountID);
  if (contact) {
    // contact.$jazz.owner is a Group; the contact's Account is on the
    // group's direct-members. Try the explicit ref path:
    const accountRef = contact?.$jazz?.refs?.account;
    if (accountRef && accountRef?.profile?.avatar) {
      return accountRef.profile.avatar;
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
 * Profiles are publicly readable (see ArcanAccount migration), so any
 * member of the contact's account network can resolve this asynchronously.
 *
 * Pass `null`/`undefined` `accountID` to skip the subscription (e.g. while a
 * contact row is still loading).
 */
export function useRemoteAvatar(accountID: string | null | undefined): any | undefined {
  // Critical: deep-resolve `avatar` (not just `profile: true`). For the
  // SELF profile Jazz eagerly loads everything from the local node, so a
  // shallow profile resolve appears to work — but for REMOTE profiles
  // the FileBlob ref under `profile.avatar` stays NotLoaded until the
  // resolve query explicitly fetches it. Without deep-loading here,
  // `account.profile.avatar` is undefined / a marker, and Avatar.tsx
  // can't read `.data.$jazz.id` to trigger its loadAsBlob.
  //
  // We resolve the FileBlob itself (one level deep). The nested FileStream
  // under `avatar.data` stays a ref; Avatar.tsx's useEffect imperatively
  // loadAsBlob's it once it has the streamID, which works as long as the
  // FileBlob itself is loaded.
  const account = useCoState(
    ArcanAccount,
    accountID as any,
    { resolve: { profile: { avatar: true } } },
  );
  return (account as any)?.profile?.avatar ?? undefined;
}
