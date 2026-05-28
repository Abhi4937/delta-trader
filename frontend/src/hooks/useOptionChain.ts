import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOptionChain, type OptionRow } from "../lib/api";
import { subscribeOptionChain, useChainStore } from "../lib/ws";

export interface UseOptionChainResult {
  rows: OptionRow[];
  isLoading: boolean;
  source: string | null;
}

/**
 * Combines an initial TanStack Query fetch (so the table renders immediately)
 * with live WS updates from the Zustand store. Live rows win once they arrive.
 */
export function useOptionChain(
  underlying: string,
  expiry: string | null,
): UseOptionChainResult {
  const query = useQuery({
    queryKey: ["option-chain", underlying, expiry],
    queryFn: () => getOptionChain(underlying, expiry as string),
    enabled: !!expiry,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (!expiry) return;
    subscribeOptionChain(underlying, expiry);
  }, [underlying, expiry]);

  const liveRows = useChainStore((s) => (expiry ? s.chains[expiry] : undefined));

  const rows = liveRows ?? query.data?.rows ?? [];
  const source = liveRows ? "ws" : (query.data?.source ?? null);

  return {
    rows,
    isLoading: query.isLoading && !liveRows,
    source,
  };
}
