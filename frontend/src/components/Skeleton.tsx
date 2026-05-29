import clsx from "clsx";

interface SkeletonProps {
  /** number of pulsing bars to render */
  rows?: number;
  className?: string;
}

/**
 * Reusable pulsing-bar skeleton shown during the INITIAL fetch of a list (option
 * chain, positions, strategies) while `isLoading && no data` (Phase 5 §6). Dark
 * only; uses the panel/border tokens.
 */
export default function Skeleton({ rows = 5, className }: SkeletonProps): JSX.Element {
  return (
    <div
      className={clsx("flex flex-col gap-2 p-2", className)}
      data-testid="skeleton"
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-5 animate-pulse rounded bg-[#1f1f1f]"
          style={{ width: `${90 - (i % 3) * 12}%` }}
        />
      ))}
    </div>
  );
}
