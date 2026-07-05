/**
 * useAccountAvatars — shared live avatar resolver for N account IDs.
 *
 * Extracted from the remoteAvatarMap machinery in use-home-lists.ts (commit
 * ae9ef98). Uses one ArcanAccount.subscribe() per account ID; fires live on
 * remote-profile changes. Returns a ReadonlyMap<accountID, objectURL>.
 *
 * Behaviour:
 *   - Stable dep: sorted, comma-joined accountIDs string — effect re-runs only
 *     when the visible ID set changes.
 *   - Live: re-fires when the remote profile avatar changes (stream ID change).
 *   - Cleanup: unsubscribes all + revokes all object URLs on dep change / unmount.
 *   - No-op until me is loaded (returns empty map, effect bails early).
 *
 * Guard: designed for ≤50-account trust-circle scope — subscription count safe.
 *
 * Surfaces that route through this hook:
 *   - Settings me-row (own accountID)
 *   - 1:1 conversation headers (counterpart accountID)
 *   - Message-row avatars (incoming author accountIDs)
 *   - Home lists: contacts + 1:1 counterparts (use-home-lists.ts)
 */

import { useEffect, useState } from "react";
import { co } from "jazz-tools";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";

export function useAccountAvatars(
  me: unknown,
  accountIDs: string[],
): ReadonlyMap<string, string> {
  const [avatarMap, setAvatarMap] = useState<Map<string, string>>(
    () => new Map(),
  );

  const meLoaded = Boolean((me as any)?.$isLoaded);
  // Stable dep: sorting ensures array-order changes don't re-run the effect.
  const idsDep = meLoaded ? [...accountIDs].sort().join(",") : "";

  useEffect(() => {
    if (!meLoaded || !idsDep) return;
    const ids = idsDep.split(",").filter(Boolean);
    if (!ids.length) return;

    let cancelled = false;
    // Per-account state for URL revocation on avatar change.
    const perAccount = new Map<
      string,
      { streamId: string | null; url: string | null }
    >();
    const createdUrls: string[] = [];
    const unsubscribers: (() => void)[] = [];

    for (const accountId of ids) {
      const state: { streamId: string | null; url: string | null } = {
        streamId: null,
        url: null,
      };
      perAccount.set(accountId, state);

      // ArcanAccount.subscribe mirrors useRemoteAvatar:
      // profile.avatar (FileBlob) loaded one level deep; avatar.data
      // (FileStream) stays a ref we loadAsBlob below.
      const unsub = (ArcanAccount as any).subscribe(
        accountId,
        {
          resolve: { profile: { avatar: true } },
          loadAs: me as any,
        } as any,
        (account: any) => {
          if (cancelled) return;
          const newStreamId: string | null =
            account?.profile?.avatar?.data?.$jazz?.id ?? null;
          if (newStreamId === state.streamId) return; // no change — skip

          state.streamId = newStreamId;

          // Revoke the previous URL and remove from map.
          if (state.url) {
            const old = state.url;
            state.url = null;
            URL.revokeObjectURL(old);
            setAvatarMap((prev) => {
              const next = new Map(prev);
              next.delete(accountId);
              return next;
            });
          }

          if (!newStreamId) return;

          // Async: load stream blob → objectURL → update map.
          void (async () => {
            try {
              const blob = await co
                .fileStream()
                .loadAsBlob(newStreamId, { loadAs: me as any });
              if (cancelled || !blob || state.streamId !== newStreamId) return;
              const url = URL.createObjectURL(blob);
              state.url = url;
              createdUrls.push(url);
              setAvatarMap((prev) => {
                const next = new Map(prev);
                next.set(accountId, url);
                return next;
              });
            } catch {
              // Silent — initials fallback.
            }
          })();
        },
      );

      unsubscribers.push(unsub);
    }

    return () => {
      cancelled = true;
      for (const u of unsubscribers) u();
      for (const u of createdUrls) URL.revokeObjectURL(u);
      setAvatarMap(new Map());
    };
    // `me` intentionally omitted: idsDep captures identity changes.
    // Adding `me` would re-trigger on every Jazz subscription tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsDep, meLoaded]);

  return avatarMap;
}
