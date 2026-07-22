## Context

The market-data layer (`apps/api/app/services/market_data/`) is a pluggable registry
of `DataProvider`s (`id`, `label`, `requiresKey`, `quote(symbol,key?)`,
`history(symbol,range,key?)`) — Yahoo (keyless default), Alpha Vantage (keyed), demo.
Keys are resolved by `config.ts` (`keyFor`) from `FRED`-style env vars (`ENV_KEYS`
map) or a local `storage/providers.json`, never from model JSON. Results materialize
into a model's actuals or seed a driver via existing controller routes; `packages/core`
never fetches. Adding a provider is a drop-in that inherits all of that.

FRED's REST API (`api.stlouisfed.org/fred/series/observations`) returns JSON
`{ observations: [{date, value}, …] }` for a `series_id`, requires an `api_key`, and
uses `"."` for missing values. This maps cleanly onto `DataProvider`.

## Goals / Non-Goals

**Goals:** source FRED macro series in-tool through the existing provider interface;
BYO-key with the same secret-locality guarantees; deterministic offline parser test.

**Non-Goals:** making FRED the default; point-in-time/vintage (ALFRED) alignment;
resampling/compact returns (§7.4); any `packages/core` or endpoint change.

## Decisions

### Model FRED on the keyed-provider pattern (mirror Alpha Vantage)
`fred_provider.ts` implements `DataProvider` with `requiresKey: true`. `quote` and
`history` throw `FRED requires an API key` when `key` is absent (mirrors AV). Add
`fred: 'FRED_API_KEY'` to `ENV_KEYS`. Register in `index.ts` alongside the others.
No new routes, MCP tools, or core code — the provider-generic surface already covers
list/quote/history/import/seed.

### Symbols are FRED series IDs; quote = latest observation
FRED has no "quote" concept, so `quote(symbol)` requests `sort_order=desc&limit=1` and
returns the single latest observation as `{ symbol, price: Number(value), source:
'fred', asOf: <observation date> }`. `history(symbol,{from,to})` passes
`observation_start`/`observation_end` (FRED accepts `YYYY-MM-DD`) and maps observations
to `PricePoint[]` (`{date, close: Number(value)}`), **skipping `"."`** (missing) and
non-finite values, sorted ascending.

### Pure parsers, fixture-tested (mirror Yahoo)
Export `parseLatest(json, symbol)` and `parseObservations(json, symbol, range)` so the
JSON→domain mapping is unit-tested against a captured `series/observations` fixture with
no live network. A shared `fetchObservations(symbol, key, extraParams)` helper builds
the URL (`file_type=json`, url-encoded `series_id` + `api_key`) and throws
`FRED request failed (<status>)` on non-OK; if FRED returns its JSON error body
(`error_code`/`error_message`), surface `error_message`.

### Backtest caveat is documented, not enforced away
Macro series are revised (M2 for a past month changes as FRED revises). v1 imports
latest-published values — the same simplification price providers make — and the
revision/vintage caveat is documented (proposal + provider doc-comment). True vintage
alignment (ALFRED `realtime_start`) is a deliberate later change, out of scope here.

## Risks / Trade-offs

- [Revised macro series create mild lookahead in backtests] → Documented caveat; v1
  parity with price providers. ALFRED vintages are the future fix, scoped out.
- [FRED value `"."` / empty series] → Skipped; an all-missing or unknown series yields
  a clear `FRED: no history/quote for "<id>"` error (matches sibling providers).
- [Can't live-smoke without a key here] → Parser is fixture-tested; the missing-key
  error path is live-verifiable through the API; a real data smoke needs the user's
  free FRED key.

## Migration Plan

- Additive: one provider file + one `ENV_KEYS` entry + one registration line. No client
  or core change; `?provider=fred` opts in. Rebuild core is unnecessary (adapters only),
  but the API must be restarted to pick up the new registration.
- Rollback: unregister and delete the file; nothing persisted depends on it.
