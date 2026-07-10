/**
 * InvitesSection: pending invitations list in settings.
 *
 * Shows active (non-consumed, non-expired) invitations from me.root.invitesIssued.
 * Each row shows created/expires dates and a Revoke button.
 *
 * Note: "Copy link" is not shown because the agent secret is not stored after
 * creation (it was only in the URL). Users can generate a new invite from the
 * contacts/add page.
 */

import { useAccount } from "jazz-tools/react";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import { revokeInvitation } from "@/jazz/invitations";
import { Button } from "@/components/ui/button";
import { Skel } from "@/components/skeleton";

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function InvitesSection() {
  const me = useAccount(ArcanAccount, {
    resolve: {
      root: { invitesIssued: { $each: true } },
    },
  });

  if (!me.$isLoaded) {
    return (
      <section
        className="rounded-lg border bg-card p-4"
        data-testid="invites-section-loading"
      >
        <h2 className="text-base font-semibold mb-3">pending invitations</h2>
        <Skel w="60%" h={14} />
      </section>
    );
  }

  const now = new Date();
  const pending = me.root.invitesIssued.filter((inv) => {
    if (!inv) return false;
    if ((inv as any).consumed) return false;
    const expiresAt = (inv as any).expiresAt as Date | undefined;
    if (expiresAt && expiresAt < now) return false;
    return true;
  });

  async function handleRevoke(inv: any, _idx: number) {
    try {
      await revokeInvitation(inv);
    } catch (err) {
      console.error("Failed to revoke invitation:", err);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <h2 className="text-base font-semibold">pending invitations</h2>

      {pending.length === 0 ? (
        <p
          data-testid="no-pending-invites"
          className="text-sm text-muted-foreground"
        >
          No pending invitations.
        </p>
      ) : (
        <ul data-testid="pending-invites-list" className="space-y-2">
          {pending.map((inv, i) => (
            <li
              key={(inv as any).$jazz?.id ?? i}
              className="flex items-center justify-between gap-2 rounded-md border p-3"
            >
              <div className="text-sm space-y-0.5">
                <p className="text-text-2">
                  Created:{" "}
                  <span className="font-medium">
                    {formatDate((inv as any).createdAt as Date)}
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">
                  {(inv as any).expiresAt
                    ? `Expires: ${formatDate((inv as any).expiresAt as Date)}`
                    : "no expiry"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                data-testid={`revoke-invite-${i}`}
                onClick={() => handleRevoke(inv, i)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
