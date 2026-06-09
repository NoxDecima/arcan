/**
 * EmptyState: centered placeholder for when a list or panel has no content.
 *
 * Used by the home main area when there are no conversations.
 */
interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
      <h2 className="text-lg font-semibold text-text-2">{title}</h2>
      <p className="text-sm text-dim max-w-xs">{description}</p>
    </div>
  );
}
