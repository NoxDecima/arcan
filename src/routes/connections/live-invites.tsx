import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { revokeInvitation, invitationUrl } from "@/jazz/invitations";
import { PCard, PButton, PHeader } from "@/ui/kit";
import { useToast } from "@/components/toast";
import { useUpNavigation } from "@/nav/use-up-navigation";
import { Link } from "react-router-dom";

export function LiveInvitesRoute() {
  const me = useAccount(ArcanAccount, {
    resolve: { root: { liveInvitations: { $each: true } } },
  });
  const toast = useToast();
  const goUp = useUpNavigation();
  if (!me.$isLoaded) return null;
  const myAccountId: string = (me as any).$jazz?.id ?? "";
  const items = Array.from(((me.root as any).liveInvitations as Iterable<any>) ?? []).filter(Boolean);
  const now = Date.now();
  const active = items.filter(
    (i: any) => !i.revokedAt && (!i.expiresAt || new Date(i.expiresAt).getTime() > now)
  );
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="w-full max-w-[600px] mx-auto flex flex-col">
        <PHeader
          title="invite links"
          onBack={() => goUp()}
          backTestId="live-invites-back"
        />
        <div className="px-4 py-4 flex flex-col gap-4">
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
                      icon="copy"
                      label="copy link"
                      onClick={async () => {
                        const url = invitationUrl(inv.$jazz.id, myAccountId);
                        await navigator.clipboard.writeText(url);
                        toast({ icon: "copy", text: "invite link copied", tone: "accent" });
                      }}
                      data-testid="copy-invite-link"
                    />
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
    </div>
  );
}
