## 1. FRED provider

- [x] 1.1 Create `apps/api/app/services/market_data/fred_provider.ts` exporting a `DataProvider` with `id: 'fred'`, `label: 'FRED (macro/econ, API key)'`, `requiresKey: true`.
- [x] 1.2 Add a shared `fetchObservations(symbol, key, extraParams)` helper hitting `https://api.stlouisfed.org/fred/series/observations?series_id=<enc>&api_key=<enc>&file_type=json[&…]`; throw `FRED requires an API key` when no key, `FRED request failed (<status>)` on non-OK, and surface FRED's JSON `error_message` when present.
- [x] 1.3 Export a pure `parseLatest(json, symbol)`: read `observations[0]` → `{ symbol, price: Number(value), source: 'fred', asOf: date }`; throw `FRED: no quote for "<symbol>"` on missing/`"."`/non-finite.
- [x] 1.4 Export a pure `parseObservations(json, symbol, range)`: map `observations[]` → `PricePoint[]` (`{date, close: Number(value)}`), skip `"."`/non-finite, filter to `range.from`/`range.to`, sort ascending; throw `FRED: no history for "<symbol>"` when empty.
- [x] 1.5 `quote(symbol,key)` = `parseLatest(fetchObservations(symbol,key,{sort_order:'desc',limit:'1'}), symbol)`; `history(symbol,range,key)` = `parseObservations(fetchObservations(symbol,key,{observation_start?,observation_end?}), symbol, range)`.

## 2. Registry + config

- [x] 2.1 Register `fredProvider` in `apps/api/app/services/market_data/index.ts`.
- [x] 2.2 Add `fred: 'FRED_API_KEY'` to the `ENV_KEYS` map in `apps/api/app/services/market_data/config.ts`.

## 3. Tests

- [x] 3.1 Add a captured FRED `series/observations` JSON fixture (a short series incl. a `"."` missing value) under the api unit test tree.
- [x] 3.2 Unit test the parsers: `parseLatest` returns the latest value/as-of; `parseObservations` returns sorted dated closes, skips `"."`, and respects a `from`/`to` filter; a malformed/empty payload throws the clear error. No live network.
- [x] 3.3 Functional/registry test: `GET /api/market/providers` includes `fred` with `requiresKey: true`; a `fred` quote/history with no key configured returns a clear "requires an API key" error (400).

## 4. Verify

- [x] 4.1 `pnpm --filter @greenthumb/api typecheck` (adapters only).
- [x] 4.2 Run the api functional/unit market-data suites.
- [x] 4.3 Live (no key needed): `GET /api/market/providers` shows `fred` keyed + not-configured; `GET /api/market/M2SL/history?provider=fred` returns the clear missing-key error. (A real data fetch needs a free FRED API key in `FRED_API_KEY` / the Data Sources page — note this for the user.)
