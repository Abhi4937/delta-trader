import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getLivePositions,
  getLiveStrategyMtm,
  listLiveStrategies,
  NotConfiguredError,
  type LivePosition,
  type LiveStrategy,
  type SlState,
  type StrategyMtm,
} from "../lib/liveApi";
import { useLiveStore } from "../store/liveStore";

/**
 * Live positions: REST bootstrap (with periodic refetch as a fallback) merged
 * with the WS `live_positions` snapshot. The WS snapshot wins when present.
 * A 503 surfaces as a `NotConfiguredError` so the UI can render the
 * "not configured" panel instead of an empty table.
 */
export function useLivePositions(): {
  positions: LivePosition[];
  isLoading: boolean;
  notConfigured: boolean;
} {
  const query = useQuery<LivePosition[]>({
    queryKey: ["live-positions"],
    queryFn: getLivePositions,
    refetchInterval: 5000,
    staleTime: 2000,
    retry: false,
  });

  const wsPositions = useLiveStore((s) => s.positions);
  const subscribe = useLiveStore((s) => s.subscribePositions);
  const unsubscribe = useLiveStore((s) => s.unsubscribePositions);

  useEffect(() => {
    subscribe();
    return () => unsubscribe();
  }, [subscribe, unsubscribe]);

  const notConfigured = query.error instanceof NotConfiguredError;
  const positions = wsPositions ?? query.data ?? [];

  return { positions, isLoading: query.isLoading, notConfigured };
}

/** Live strategies list with aggregated MTM / SL state. 503 -> notConfigured. */
export function useLiveStrategies(): {
  strategies: LiveStrategy[];
  isLoading: boolean;
  notConfigured: boolean;
} {
  const query = useQuery<LiveStrategy[]>({
    queryKey: ["live-strategies"],
    queryFn: listLiveStrategies,
    refetchInterval: 5000,
    staleTime: 2000,
    retry: false,
  });

  const notConfigured = query.error instanceof NotConfiguredError;
  return {
    strategies: query.data ?? [],
    isLoading: query.isLoading,
    notConfigured,
  };
}

/**
 * Subscribe a strategy to the WS `live_strategy` topic (drives the live SL
 * badge) and fetch its aggregate MTM + history. The 1Hz chart samples the
 * polled REST aggregate; the SL state comes live from the store.
 */
export function useLiveStrategyMtm(id: number): {
  data: StrategyMtm | undefined;
  slState: SlState;
} {
  const query = useQuery<StrategyMtm>({
    queryKey: ["live-strategy-mtm", id],
    queryFn: () => getLiveStrategyMtm(id, true),
    refetchInterval: 1000,
    staleTime: 500,
    retry: false,
  });

  const subscribe = useLiveStore((s) => s.subscribeStrategy);
  const unsubscribe = useLiveStore((s) => s.unsubscribeStrategy);
  const wsSlState = useLiveStore((s) => s.slState[id]);

  useEffect(() => {
    subscribe(id);
    return () => unsubscribe(id);
  }, [id, subscribe, unsubscribe]);

  // WS SL state wins when present (live transitions, e.g. -> TRIGGERED);
  // otherwise fall back to the REST snapshot.
  const slState: SlState =
    (wsSlState as SlState) ?? query.data?.sl_state ?? null;

  return { data: query.data, slState };
}
