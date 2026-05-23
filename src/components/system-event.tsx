interface SystemEventProps {
  kind: "left" | "added";
  targetName: string;
  actorName?: string;
}

export function SystemEvent({ kind, targetName, actorName }: SystemEventProps) {
  const message =
    kind === "left"
      ? `${targetName} left the chat`
      : `${actorName ?? "Someone"} added ${targetName} to the chat`;

  return (
    <div
      className="flex justify-center py-2"
      data-testid={`system-event-${kind}`}
    >
      <div className="bg-muted text-xs text-muted-foreground italic px-3 py-1 rounded-full">
        {message}
      </div>
    </div>
  );
}
