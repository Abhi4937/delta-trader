import { useQuery } from "@tanstack/react-query";
import { listPositions, type PaperPosition, type PositionStatus } from "../lib/paperApi";

/** Fetch paper positions (default open). Refetches periodically as a fallback;
 *  live MTM numbers come from the WS store, not this query. */
export function usePaperPositions(status: PositionStatus | "all" = "open") {
  return useQuery<PaperPosition[]>({
    queryKey: ["paper-positions", status],
    queryFn: () => listPositions(status === "all" ? undefined : status),
    refetchInterval: 5000,
    staleTime: 2000,
  });
}
