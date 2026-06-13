import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";

/**
 * Returns the array of "pending" EphemeralPairings: responderPubkey set, not approved,
 * not rejected, not expired.
 *
 * Backed by me.root.pendingPairings — every trusted device on the same account sees
 * the same list.
 */
export function usePendingPairings(): any[] {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { pendingPairings: { $each: true } } },
  });
  if (!me.$isLoaded) return [];
  const list = (me.root as any).pendingPairings as Iterable<any> | undefined;
  if (!list) return [];
  const items = Array.from(list).filter(Boolean);
  const now = Date.now();
  return items.filter((p: any) => {
    if (!p?.responderPubkey) return false;
    if (p?.approvedAt) return false;
    if (p?.rejectedAt) return false;
    if (p?.expiresAt && new Date(p.expiresAt).getTime() < now) return false;
    return true;
  });
}
