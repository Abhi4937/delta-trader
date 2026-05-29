import SpotChart from "./SpotChart";

interface OptionPremiumChartProps {
  /** option symbol, e.g. "C-BTC-75000-290526" — fed to /spot/candles. */
  symbol: string;
}

/**
 * An option's premium history with the same indicator toolbox as the spot
 * chart. It is literally `SpotChart` fed an option symbol: the candles endpoint
 * serves the option's premium OHLC. No live WS tail (option premium is not on
 * the candle WS topic), so `live={false}`.
 */
export default function OptionPremiumChart({
  symbol,
}: OptionPremiumChartProps): JSX.Element {
  return <SpotChart symbol={symbol} live={false} testid="option-premium-chart" />;
}
