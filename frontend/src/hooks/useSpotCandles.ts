import { useEffect } from "react";
import { subscribeCandles, useChainStore } from "../lib/ws";

/** Subscribe to the spot candle stream; returns the latest close (string|null). */
export function useSpotCandles(underlying: string): string | null {
  useEffect(() => {
    subscribeCandles(underlying);
  }, [underlying]);

  return useChainStore((s) => s.spotClose);
}
