import clsx from "clsx";

interface EmptyStateProps {
  /** primary message */
  title: string;
  /** optional secondary hint */
  hint?: string;
  className?: string;
}

/**
 * Clear, consistent empty state for every list (Phase 5 §3) — never a blank
 * table. Carries `data-testid="empty-state"`.
 */
export default function EmptyState({
  title,
  hint,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center gap-1 px-4 py-8 text-center",
        className,
      )}
      data-testid="empty-state"
    >
      <div className="text-sm text-text">{title}</div>
      {hint && <div className="text-xs text-neutral">{hint}</div>}
    </div>
  );
}
