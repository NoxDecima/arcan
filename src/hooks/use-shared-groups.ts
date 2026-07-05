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
 *
 * Followup (b): 1:1 conversation names are derived from the contactBook entry
 * for the other member (displayNameLocal), not conv.title which is often null/
 * "Untitled" for direct messages. Same derivation as detail.tsx:357–392.
 */
export function useSharedGroups(otherAccountID: string): SharedGroup[] {
  const me = useAccount(ArcanAccount, {
    resolve: {
      root: {
        knownConversations: { $each: true },
        contactBook: { $each: true },
      },
    },
  });
  if (!me.$isLoaded || !otherAccountID) return [];
  const conversations = Array.from((me.root.knownConversations as any) ?? []);
  const contactBook = Array.from((me.root.contactBook as any) ?? []);
  const myID = (me as any).$jazz?.id as string | undefined;
  const out: SharedGroup[] = [];
  for (const conv of conversations) {
    if (!conv) continue;
    const group = (conv as any).$jazz?.owner;
    if (!group) continue;
    try {
      const members: any[] = group.getDirectMembers?.() ?? [];
      const activeMembers = members.filter((m: any) => {
        const role = m?.role;
        return role === "admin" || role === "writer";
      });
      const ids = new Set(
        activeMembers.map((m: any) => m?.account?.$jazz?.id).filter(Boolean),
      );
      if (!ids.has(otherAccountID)) continue;

      let title = (conv as any).title ?? "Untitled";

      // For 1:1 conversations (exactly 2 active members), derive the display
      // name from the contactBook entry for the other member — conv.title is
      // null/undefined for DMs and would show "Untitled" otherwise.
      if (activeMembers.length === 2) {
        if (!myID) {
          // Can't identify counterpart without our own ID — keep fallback title.
          title = (conv as any).title ?? "Untitled";
        } else {
          const other = activeMembers.find((m: any) => {
            const id = m?.account?.$jazz?.id as string | undefined;
            return id && id !== myID;
          });
          if (other) {
            const otherID = other?.account?.$jazz?.id as string | undefined;
            if (otherID) {
              const contactEntry = contactBook.find(
                (c: any) => c?.contactAccountID === otherID,
              );
              const derivedName = (contactEntry as any)?.displayNameLocal as
                | string
                | undefined;
              if (derivedName) title = derivedName;
            }
          }
        }
      }

      out.push({ id: (conv as any).$jazz.id, title });
    } catch {
      // unresolvable — skip
    }
  }
  return out;
}
