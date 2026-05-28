import { useEffect, useState } from "react";
import ExpirySelector from "../components/ExpirySelector";
import OptionChainTable from "../components/OptionChainTable";
import SpotChart from "../components/SpotChart";
import { useExpiries } from "../hooks/useExpiries";
import { useOptionChain } from "../hooks/useOptionChain";
import { useSpotCandles } from "../hooks/useSpotCandles";
import { fmt } from "../lib/decimal";

const UNDERLYING = "BTC";

export default function Section1Paper(): JSX.Element {
  const { data: expiries = [], isLoading: expiriesLoading } = useExpiries(UNDERLYING);
  const [expiry, setExpiry] = useState<string | null>(null);

  // Default to the nearest (first ascending) expiry once loaded.
  useEffect(() => {
    if (expiry === null && expiries.length > 0) {
      setExpiry(expiries[0].expiry_code);
    }
  }, [expiry, expiries]);

  const spotClose = useSpotCandles(UNDERLYING);
  const { rows, isLoading, source } = useOptionChain(UNDERLYING, expiry);

  return (
    <div className="min-h-screen bg-bg p-4 text-text">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          Delta Trader — Paper (Foundation)
        </h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-neutral">
            Spot{" "}
            <span className="font-mono tabular-nums text-text">
              {fmt(spotClose, 2)}
            </span>
          </span>
          <ExpirySelector
            expiries={expiries}
            value={expiry}
            onChange={setExpiry}
            disabled={expiriesLoading}
          />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">
        <section>
          <div className="mb-2 flex items-center justify-between text-xs text-neutral">
            <span>Option Chain · {UNDERLYING}</span>
            {source && <span>source: {source}</span>}
          </div>
          <OptionChainTable rows={rows} spot={spotClose} isLoading={isLoading} />
        </section>

        <section>
          <div className="mb-2 text-xs text-neutral">BTC Spot (1m close)</div>
          <SpotChart close={spotClose} />
        </section>
      </div>
    </div>
  );
}
