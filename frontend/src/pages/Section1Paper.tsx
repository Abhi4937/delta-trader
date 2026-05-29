import { useEffect, useState } from "react";
import clsx from "clsx";
import ExpirySelector from "../components/ExpirySelector";
import OptionChainTable from "../components/OptionChainTable";
import SpotChart from "../components/SpotChart";
import PaperTradePage from "./paper/PaperTradePage";
import LiveMonitorPage from "./live/LiveMonitorPage";
import { useExpiries } from "../hooks/useExpiries";
import { useOptionChain } from "../hooks/useOptionChain";
import { useSpotCandles } from "../hooks/useSpotCandles";
import { fmt } from "../lib/decimal";

const UNDERLYING = "BTC";

type Tab = "chain" | "trade" | "live";

export default function Section1Paper(): JSX.Element {
  const { data: expiries = [], isLoading: expiriesLoading } = useExpiries(UNDERLYING);
  const [expiry, setExpiry] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chain");

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

      {/* section tabs */}
      <nav className="mb-4 flex gap-1 border-b border-[var(--color-border)]">
        <TabButton
          active={tab === "chain"}
          onClick={() => setTab("chain")}
          testid="tab-chain"
        >
          Option Chain
        </TabButton>
        <TabButton
          active={tab === "trade"}
          onClick={() => setTab("trade")}
          testid="tab-trade"
        >
          Paper Trade
        </TabButton>
        <TabButton
          active={tab === "live"}
          onClick={() => setTab("live")}
          testid="tab-live"
        >
          Live Monitor
        </TabButton>
      </nav>

      {tab === "chain" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">
          <section>
            <div className="mb-2 flex items-center justify-between text-xs text-neutral">
              <span>Option Chain · {UNDERLYING}</span>
              {source && <span>source: {source}</span>}
            </div>
            <OptionChainTable rows={rows} spot={spotClose} isLoading={isLoading} />
          </section>

          <section>
            <div className="mb-2 text-xs text-neutral">BTC Spot (1m candles + indicators)</div>
            <SpotChart symbol="BTCUSD" underlying={UNDERLYING} />
          </section>
        </div>
      )}
      {tab === "trade" && <PaperTradePage />}
      {tab === "live" && <LiveMonitorPage />}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  testid: string;
  children: React.ReactNode;
}
function TabButton({ active, onClick, testid, children }: TabButtonProps): JSX.Element {
  return (
    <button
      className={clsx(
        "-mb-px border-b-2 px-3 py-1.5 text-sm",
        active
          ? "border-green text-text"
          : "border-transparent text-neutral hover:text-text",
      )}
      onClick={onClick}
      data-testid={testid}
    >
      {children}
    </button>
  );
}
