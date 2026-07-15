## Context

The market-data feature registers three providers in
`apps/api/app/services/market_data/index.ts` — `stooq` (keyless, the default via
`DEFAULT_PROVIDER = 'stooq'` in `provider.ts`), `alphavantage` (key-required), and
`demo` (synthetic). Providers implement a small `DataProvider` interface (`id`,
`label`, `requiresKey`, `quote(symbol, key?)`, `history(symbol, range, key?)`). The
controller (`market_controller.ts`) resolves the provider, wraps calls in a cache,
and materializes results into the actuals store / drivers. All I/O is confined to
this adapter layer; `packages/core` never fetches.

Stooq broke upstream (verified live): the quote CSV endpoint 404s and the history
CSV endpoint now returns a JS proof-of-work challenge. Yahoo Finance's public chart
API still returns real quotes and daily history with no key when called with a
browser `User-Agent`. This change adds a `yahoo` provider and makes it the default.

## Goals / Non-Goals

**Goals:**
- Restore zero-config real market data by adding a working keyless provider and
  making it the default.
- Keep the existing `DataProvider` interface, controller, cache, and actuals
  pipeline unchanged — a drop-in provider.
- Deterministic, offline unit test of the Yahoo parser from a captured fixture.

**Non-Goals:**
- Working around Stooq's bot challenge — Stooq is removed, not repaired.
- Any `packages/core` change, new endpoints, or new secret handling.
- Fundamentals import (history stays price-only).

## Decisions

### Yahoo v8 chart API, one request per call
Use `https://query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>` with `interval=1d`.
For a quote, a short `range=5d` is enough — we read `meta.regularMarketPrice`, not the
bars. Send `headers: { 'User-Agent': 'Mozilla/5.0' }` — without it Yahoo may reject the
request. Symbols pass through as-is (Yahoo uses bare tickers like `MSTR`, `^GSPC`), so
unlike Stooq no `.us` suffixing is needed.
- *Alternative rejected — `query2` host / `v7/finance/download` CSV:* the v7 download
  endpoint now requires a crumb+cookie handshake; the v8 chart JSON is the simplest
  keyless path.

### Parse shape
Quote: `result.chart.result[0].meta.regularMarketPrice` (+ `symbol`, and
`regularMarketTime` for as-of). History: zip `result.chart.result[0].timestamp[]`
(epoch seconds → `YYYY-MM-DD`) with `...indicators.adjclose[0].adjclose[]` (fall back
to `indicators.quote[0].close[]` when adjclose is absent), dropping null closes.
Adjusted closes keep history split/dividend-safe for backtesting, matching the
existing providers. Apply the `range.from`/`range.to` filter after parsing, mirroring
the Alpha Vantage provider.

### History via `period1`/`period2` epoch params, NOT `range`
`history({ from, to })` maps directly to Yahoo's `period1`/`period2` epoch-second
params with `interval=1d`. This is a correctness decision, not a convenience one:
with a `range` param Yahoo silently coerces long spans to a coarse granularity —
`range=max` returns **quarterly** bars (verified: 168 points back to 1984 with
`dataGranularity: 3mo`), which would corrupt any daily backtest. Explicit periods keep
`dataGranularity: 1d` (verified: `period1=0` → 11,488 daily points). `period1` defaults
to `0` (earliest) and `period2` to now when `from`/`to` are absent; `period2` adds one
day so the `to` date is inclusive. `parseHistory` still applies the `[from, to]` filter
as a backstop.

### Default swap; Stooq removed
Set `DEFAULT_PROVIDER = 'yahoo'` and register `yahoo` in `index.ts`. Delete
`stooq_provider.ts` and its registration — its endpoints broke upstream (quote 404s,
history serves a JS PoW challenge) and a keyless replacement now exists, so keeping a
dead provider selectable only invites confusing failures. `alphavantage` and `demo`
remain.

### Errors
Throw clear `Error`s the controller turns into `badRequest`: non-OK HTTP →
`Yahoo request failed (<status>)`; a missing/empty `result` or a non-finite price →
`Yahoo: no quote/history for "<symbol>"`, matching the other providers' phrasing so
the "unknown symbol errors clearly" scenario holds.

## Risks / Trade-offs

- [Yahoo is an unofficial endpoint and could rate-limit or change] → It is the most
  reliable keyless source available today; the registry keeps AV (keyed) and demo as
  fallbacks, and provider selection via `?provider=` still works. If Yahoo later
  breaks, only `DEFAULT_PROVIDER` and one file change again.
- [`User-Agent` requirement is undocumented behavior] → Encapsulated in the provider;
  a single constant. The parser is covered by a fixture test so a shape change surfaces
  as a failing unit test rather than a silent bad import.
- [Coarse `range` + client-side date filtering fetches more than needed] → Negligible
  payload for daily data; keeps the `{ from, to }` contract intact and avoids Yahoo
  date-param quirks.

## Migration Plan

- Additive: new provider file + one-line default change + one registration line. No
  API shape change, no client change required.
- Verify live against a couple of symbols (`MSTR`, `AAPL`) via the API, then rely on
  the fixture-based unit test in CI (no live network in tests).
- Rollback: revert `DEFAULT_PROVIDER` to another provider and drop the registration;
  no persisted data is affected (fetch-layer only).
