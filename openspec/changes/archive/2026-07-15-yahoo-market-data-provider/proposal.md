## Why

The keyless default market-data provider (Stooq) has broken upstream and no longer
works from the server: its light-CSV quote endpoint (`/q/l/`) now returns HTTP 404
for every symbol, and its history endpoint (`/q/d/l/`) now serves a JavaScript
proof-of-work bot challenge instead of CSV — unsolvable by a plain `fetch`. Alpha
Vantage requires a key (none configured) and the demo provider is synthetic, so
**every real quote/history call currently fails**. The zero-config promise of the
feature (a keyless provider that returns real data) is violated.

## What Changes

- Add a new keyless provider, `yahoo`, backed by Yahoo Finance's public chart API
  (`query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>`), which returns real quotes
  and daily history and works with a browser `User-Agent` and no key. History uses
  explicit `period1`/`period2` epoch params with `interval=1d` to keep true daily
  granularity (a `range=max` request coerces long spans to quarterly bars).
- Make `yahoo` the default provider (`DEFAULT_PROVIDER`), restoring zero-config real
  market data.
- **Remove the `stooq` provider** entirely — its public CSV endpoints broke upstream
  (quote 404s; history serves a JS proof-of-work bot challenge a server can't solve).
  `alphavantage` (keyed) and `demo` (synthetic) remain registered.
- No change to `packages/core` — the provider layer stays entirely in the API/desktop
  adapters, per the I/O-free-core rule.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `market-data-providers`: the keyless default provider must be a **real** market-data
  source that currently works (not synthetic, not a single fragile endpoint); a working
  keyless provider (Yahoo) is added and made the default.

## Impact

- **Layer:** adapters only. New `apps/api/app/services/market_data/yahoo_provider.ts`
  implementing the `DataProvider` interface (`quote`, `history`); register it in
  `apps/api/app/services/market_data/index.ts` and delete
  `stooq_provider.ts` + its registration; set `DEFAULT_PROVIDER = 'yahoo'` in
  `provider.ts`. `packages/core` untouched.
- **API/MCP surface:** unchanged shapes — the same `GET /api/market/:symbol/quote`,
  `/history`, import, and seed endpoints now resolve to a working default. Provider
  selection via `?provider=` still works for the others.
- **Keys/secrets:** Yahoo is keyless; no new secret handling. Existing key-locality
  guarantees are unchanged.
- **Tests:** add a unit test for the Yahoo response parser (quote + history) using a
  captured fixture (no live network in tests); keep provider-registry tests green with
  the new default.

## Non-goals

- Not building a headless-browser workaround to keep Stooq alive — it is removed.
- Not importing fundamentals — history stays price-only and backtest-safe (unchanged).
- Not changing `packages/core`, the actuals pipeline, or the Data Sources settings
  contract; this only swaps in a working keyless default and adds one provider.
- No integrity/validation impact — this is fetch-layer only; compute stays offline and
  reproducible.
