## What changed

## Why

## How to test
```
# commands a reviewer can run
```

## Screenshots (UI changes)

## Checklist
- [ ] Tests added/updated and passing (`pytest -q` / `pnpm test`)
- [ ] Lint + types clean (ruff/mypy, eslint/tsc)
- [ ] No floats in money/PnL/margin paths (Decimal only)
- [ ] No live-order code path without `live_trading_enabled` guard
- [ ] Docs/ADR updated if behavior or design changed
