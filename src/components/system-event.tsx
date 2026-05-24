import { resolveDisplayName } from "@/jazz/displayName";

interface SystemEventProps {
  event: {
    kind: "added" | "removed" | "left" | "promoted";
    actorAccountID: string;
    targetAccountID?: string;
    occurredAt: Date;
  };
  me: any;
  group?: any;
}

/**
 * Render a SystemEvent log entry as a pill in the conversation timeline.
 *
 * Display name resolution goes through resolveDisplayName so it matches
 * MessageRow and MembersRoute. The pill text is fully resolved at render
 * time — there's no need to pre-compute names in the parent.
 */
export function SystemEvent({ event, me, group }: SystemEventProps) {
  const actorName = resolveDisplayName({
    accountID: event.actorAccountID,
    me,
    group,
  });
  const targetName = event.targetAccountID
    ? resolveDisplayName({
        accountID: event.targetAccountID,
        me,
        group,
      })
    : undefined;

  let message: string;
  switch (event.kind) {
    case "added":
      message = `${actorName} added ${targetName ?? "someone"} to the chat`;
      break;
    case "removed":
      message = `${actorName} removed ${targetName ?? "someone"} from the chat`;
      break;
    case "left":
      message = `${actorName} left the chat`;
      break;
    case "promoted":
      message = `${actorName} promoted ${targetName ?? "someone"} to admin`;
      break;
  }

  return (
    <div
      className="flex justify-center py-2"
      data-testid={`system-event-${event.kind}`}
    >
      <div className="bg-muted text-xs text-muted-foreground italic px-3 py-1 rounded-full">
        {message}
      </div>
    </div>
  );
}
