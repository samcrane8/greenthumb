## 1. Yahoo provider

- [x] 1.1 Create `apps/api/app/services/market_data/yahoo_provider.ts` exporting a `DataProvider` with `id: 'yahoo'`, `label: 'Yahoo Finance (free)'`, `requiresKey: false`.
- [x] 1.2 Implement a shared `fetchChart(symbol, query)` helper hitting `https://query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>?<query>` with header `User-Agent: Mozilla/5.0`; throw `Yahoo request failed (<status>)` on non-OK.
- [x] 1.3 Implement `quote(symbol)` (query `interval=1d&range=5d`): read `result.chart.result[0].meta.regularMarketPrice`; return `{ symbol, price, source: 'yahoo', asOf }` (as-of from `meta.regularMarketTime` when present); throw `Yahoo: no quote for "<symbol>"` on a non-finite price.
- [x] 1.4 Implement `history(symbol, range)` using `interval=1d&period1=<from|0>&period2=<to+1d|now>` epoch params (NOT `range=max`, which coerces to quarterly bars); zip `timestamp[]` (epoch→`YYYY-MM-DD`) with `indicators.adjclose[0].adjclose[]` (fallback `indicators.quote[0].close[]`), drop null closes, filter by `range.from`/`range.to`; throw `Yahoo: no history for "<symbol>"` when empty.

## 2. Registry + default

- [x] 2.1 Register `yahooProvider` in `apps/api/app/services/market_data/index.ts`.
- [x] 2.2 Set `DEFAULT_PROVIDER = 'yahoo'` in `apps/api/app/services/market_data/provider.ts`.
- [x] 2.3 Remove the `stooq` provider entirely: delete `stooq_provider.ts` and its import/registration in `index.ts` (broken upstream, replaced by Yahoo).

## 3. Tests

- [x] 3.1 Capture a small Yahoo chart JSON fixture (one symbol) into the test tree.
- [x] 3.2 Add a unit test for the Yahoo parser: quote returns the expected price/as-of; history returns sorted dated adjusted closes and respects a `from`/`to` filter; a malformed/empty payload throws the clear error. No live network in the test.
- [x] 3.3 Update/confirm provider-registry tests: `yahoo` is listed as keyless and is the default; `alphavantage`/`demo` remain; `stooq` is gone.

## 4. Verify

- [x] 4.1 `pnpm typecheck` (api workspace at minimum).
- [x] 4.2 Run the api functional/unit market-data suites.
- [x] 4.3 Live smoke against the running API: `GET /api/market/MSTR/quote` and `GET /api/market/AAPL/history` return real data with `source: yahoo`; confirm `GET /api/market/providers` shows `yahoo` keyless + default.
