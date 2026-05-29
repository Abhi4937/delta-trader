import clsx from "clsx";
import type { SlState } from "../../lib/liveApi";

/** Stop-loss state badge. Color-coded; updates live from the WS live_strategy. */
export default function SlBadge({ state }: { state: SlState }): JSX.Element {
  const label = state ?? "OFF";
  return (
    <span
      className={clsx(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        state === null && "bg-neutral/15 text-neutral",
        state === "ARMED" && "bg-green/15 text-green",
        state === "TRIGGERED" && "animate-pulse bg-red/20 text-red",
        state === "CLOSING" && "bg-yellow-500/20 text-yellow-300",
        state === "CLOSED" && "bg-neutral/15 text-neutral",
        state === "FAILED" && "bg-red/20 text-red",
      )}
      data-testid="sl-badge"
      data-sl-state={label}
    >
      {state === null ? "SL off" : `SL ${label}`}
    </span>
  );
}
