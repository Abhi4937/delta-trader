---
name: react-trading-ui
description: Use when building React components for the trading platform — option chains, strategy builder, PnL charts, greek panels, live tickers. Covers performance patterns for high-frequency UI updates.
---

# React trading UI patterns

## Performance: throttling live data
Live ticks arrive every ~100ms. The DOM cannot keep up. Apply this hierarchy:

| UI surface | Update cadence | Mechanism |
|---|---|---|
| Live PnL number (single big number) | 4 Hz | `requestAnimationFrame` coalesce |
| Option chain table | 2 Hz | RAF coalesce + `React.memo` rows |
| Greeks panel | 1 Hz | `setInterval` polling Redis snapshot |
| PnL chart | 1 Hz | append to Recharts data + memoize chart |
| Spot candle chart | 1 Hz | Lightweight Charts `.update()` not `.setData()` |

## State for live streams
Use a single WebSocket connection with a Zustand store. Components subscribe to slices via selectors. Never `setState` from inside the WS handler — push to a ref, then flush in RAF.

```ts
// hooks/useDeltaStream.ts pattern
const pending = useRef<Tick[]>([]);
ws.onmessage = (m) => { pending.current.push(parse(m)); };
useEffect(() => {
  let raf: number;
  const tick = () => {
    if (pending.current.length) flush(pending.current.splice(0));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}, []);
```

## Numbers
Always tabular: `font-variant-numeric: tabular-nums` (Tailwind: `tabular-nums`). Color rules:
- Green `#10b981` for positive PnL/delta-positive position.
- Red `#ef4444` for negative.
- Neutral `#737373` for zero / flat.
Format: 2 decimals for PnL in USD, 4 for IV, 6 for greeks small numbers (gamma, theta).

## Strategy builder
Mirror Delta's order ticket: rows of (action: buy/sell, qty, instrument-picker filtered by expiry + type, limit price preview, greek contribution). Net greeks + margin show in a sticky footer. Save as a `Strategy` object before submission.

## Forms
`react-hook-form` + `zod`. Zod schemas live in `lib/schemas/` and are shared between the form and the API call.

## Don'ts
- Don't render lists of >50 rows without virtualization (`@tanstack/react-virtual`).
- Don't put live numbers in component-level state that's read by 20 children — use Zustand.
- Don't use `dayjs` — use `date-fns` (smaller, tree-shakeable).
- Don't import Recharts inside a hot-path component — lazy-load chart pages.
