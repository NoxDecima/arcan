import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { revokeInvitation } from "@/jazz/invitations";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";

export function LiveInvitesRoute() {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { liveInvitations: { $each: true } } },
  });
  const toast = useToast();
  if (!me.$isLoaded) return null;
  const items = Array.from(((me.root as any).liveInvitations as Iterable<any>) ?? []).filter(Boolean);
  const now = Date.now();
  const active = items.filter(
    (i: any) => !i.revokedAt && (!i.expiresAt || new Date(i.expiresAt).getTime() > now)
  );
  return (
    <div className="p-6 max-w-md mx-auto flex flex-col gap-3">
      <h1 className="text-lg font-semibold text-text">live invites</h1>
      {active.length === 0 ? (
        <p className="text-sm text-text-2">No active invites.</p>
      ) : (
        active.map((inv: any) => {
          const remainingMs = new Date(inv.expiresAt).getTime() - now;
          const remainingMin = Math.max(0, Math.floor(remainingMs / 60000));
          const remainingLabel = remainingMin >= 60
            ? `${Math.floor(remainingMin / 60)}h ${remainingMin % 60}m`
            : `${remainingMin}m`;
          return (
            <div
              key={inv.$jazz.id}
              className="rounded-r-3 border border-hairline bg-panel p-3 flex items-center gap-3"
              data-testid={`invite-${inv.$jazz.id}`}
            >
              <div className="flex-1 text-sm text-text">
                <p className="font-mono text-xs text-dim">{inv.channel}</p>
                <p>expires in {remainingLabel}</p>
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  await revokeInvitation(inv);
                  toast({ icon: "check", text: "invite revoked", tone: "neutral" });
                }}
                data-testid="revoke"
              >revoke</Button>
            </div>
          );
        })
      )}
    </div>
  );
}
