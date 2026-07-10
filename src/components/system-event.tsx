import { resolveDisplayName } from "@/jazz/displayName";

interface SystemEventProps {
  event: {
    kind: "added" | "removed" | "left" | "promoted" | "renamed" | "icon";
    actorAccountID: string;
    targetAccountID?: string;
    newTitle?: string;
    occurredAt: Date;
  };
  me: any;
  group?: any;
}

/**
 * Build the human-readable text for a SystemEvent. Extracted so unit tests
 * can exercise the rename / membership messages without mounting a JSX tree.
 */
export function formatSystemEventMessage(args: {
  kind: SystemEventProps["event"]["kind"] | (string & {});
  actorName: string;
  targetName?: string;
  newTitle?: string;
}): string {
  const { kind, actorName, targetName, newTitle } = args;
  switch (kind) {
    case "added":
      return `${actorName} added ${targetName ?? "someone"} to the chat`;
    case "removed":
      return `${actorName} removed ${targetName ?? "someone"} from the chat`;
    case "left":
      return `${actorName} left the chat`;
    case "promoted":
      return `${actorName} promoted ${targetName ?? "someone"} to admin`;
    case "renamed":
      return `${actorName} renamed the group to "${newTitle ?? "—"}"`;
    case "icon":
      return `${actorName} changed the group picture`;
    default:
      // Forward compat: a newer client may write kinds this build doesn't
      // know. Render something neutral instead of crashing.
      return `${actorName} updated the conversation`;
  }
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

  const message = formatSystemEventMessage({
    kind: event.kind,
    actorName,
    targetName,
    newTitle: event.newTitle,
  });

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
