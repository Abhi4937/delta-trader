import { useMemo, useState } from "react";
import StrategyBuilder from "../../components/paper/StrategyBuilder";
import PaperPositionsTable from "../../components/paper/PaperPositionsTable";
import PaperPositionDetail from "../../components/paper/PaperPositionDetail";
import ClosePositionDialog from "../../components/paper/ClosePositionDialog";
import { usePaperPositions } from "../../hooks/usePaperPositions";
import { useSpotCandles } from "../../hooks/useSpotCandles";
import type { PaperPosition } from "../../lib/paperApi";

const UNDERLYING = "BTC";

export default function PaperTradePage(): JSX.Element {
  const spotClose = useSpotCandles(UNDERLYING);
  const { data: positions = [], isLoading } = usePaperPositions("open");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [closing, setClosing] = useState<PaperPosition | null>(null);

  const selected = useMemo(
    () => positions.find((p) => p.id === selectedId) ?? null,
    [positions, selectedId],
  );

  return (
    <div className="flex flex-col gap-4" data-testid="paper-trade-page">
      <StrategyBuilder spot={spotClose} />

      <section>
        <div className="mb-2 text-xs text-neutral">Open Positions</div>
        <PaperPositionsTable
          positions={positions}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onClose={setClosing}
          isLoading={isLoading}
        />
      </section>

      {selected && (
        <section>
          <PaperPositionDetail position={selected} />
        </section>
      )}

      {closing && (
        <ClosePositionDialog
          position={closing}
          onClose={() => setClosing(null)}
        />
      )}
    </div>
  );
}
