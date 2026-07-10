import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { revokeInvitation } from "@/jazz/invitations";
import { PCard, PButton, PSectionLabel } from "@/ui/kit";
import { useToast } from "@/components/toast";
import { Link } from "react-router-dom";

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
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="w-full max-w-[600px] mx-auto px-4 py-4 flex flex-col gap-4">
        <PSectionLabel>live invites</PSectionLabel>
        {active.length === 0 ? (
          <div
            className="px-4 py-8 text-center flex flex-col gap-3 items-center"
            data-testid="live-invites-empty"
          >
            <span className="font-body text-ui-sub text-dim">
              no active invites — create a QR code or share link to invite someone to connect.
            </span>
            <Link to="/contacts/add">
              <PButton label="create invitation" data-testid="create-invite-empty-cta" />
            </Link>
          </div>
        ) : (
          active.map((inv: any) => {
            const expiresAt: Date | undefined = inv.expiresAt;
            const expiryLabel = (() => {
              if (!expiresAt) return "no expiry";
              const remainingMs = new Date(expiresAt).getTime() - now;
              const remainingMin = Math.max(0, Math.floor(remainingMs / 60000));
              return remainingMin >= 60
                ? `expires in ${Math.floor(remainingMin / 60)}h ${remainingMin % 60}m`
                : `expires in ${remainingMin}m`;
            })();
            return (
              <PCard key={inv.$jazz.id} data-testid={`invite-${inv.$jazz.id}`}>
                <div className="px-3.5 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-ui-value text-dim">{inv.channel}</div>
                    <div className="font-body text-ui-sub text-dim">
                      {expiryLabel}
                    </div>
                  </div>
                  <PButton
                    danger
                    label="revoke"
                    onClick={async () => {
                      await revokeInvitation(inv);
                      toast({ icon: "check", text: "invite revoked", tone: "neutral" });
                    }}
                    data-testid="revoke"
                  />
                </div>
              </PCard>
            );
          })
        )}
      </div>
    </div>
  );
}
