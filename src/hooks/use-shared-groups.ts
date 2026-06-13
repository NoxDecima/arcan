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
      const ids = new Set(members.map((m: any) => m?.account?.$jazz?.id).filter(Boolean));
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
