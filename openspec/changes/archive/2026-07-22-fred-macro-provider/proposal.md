## Why

Per the [2026-07-22 analysis-engine assessment](../../../docs/assessments/2026-07-22-analysis-engine-assessment.md)
and Roadmap §7.2, greenthumb has no macro/economic data provider — the entire
liquidity side of a query like "how much does Bitcoin follow liquidity?" (global
M2, central-bank balance sheets, policy rates, FX) has to be pulled from FRED
*outside* the tool. The statistics function library (§7.1) can now *compute*
rolling correlation / beta / regression against a liquidity series, but there is
no way to *source* that series in-tool. This adds FRED as a first-class provider so
macro series import and materialize exactly like price data.

## What Changes

- Add a **FRED** market-data provider (Federal Reserve Bank of St. Louis) to the
  pluggable registry, alongside Yahoo / Alpha Vantage / demo. FRED **series IDs are
  the symbols** (e.g. `M2SL` global-ish M2, `WALCL` Fed balance sheet, `FEDFUNDS`
  policy rate, `DTWEXBGS` broad USD index).
- It is a **BYO-key** provider (`requiresKey: true`), key read from local config
  (`FRED_API_KEY` env or `storage/providers.json`) — same secret-locality contract
  as Alpha Vantage; the key never enters model JSON.
- `quote(symbol)` returns the **latest observation**; `history(symbol, {from,to})`
  returns the observation series over the range. Both parse FRED's
  `series/observations` JSON, skipping missing (`"."`) values. Series materialize
  into a model's actuals or seed a driver through the **existing** pipeline — no new
  endpoints, no core change.
- Yahoo stays the keyless default; FRED is selected via `?provider=fred`.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `market-data-providers`: the registry gains a keyed macro/economic provider (FRED)
  exposing econ series as first-class series; the backtest-safe-scope requirement is
  extended to cover macro series (imported as latest-published, a documented caveat).

## Impact

- **Layer (adapters only):** new `apps/api/app/services/market_data/fred_provider.ts`
  implementing the `DataProvider` interface; register it in `index.ts`; add
  `fred: 'FRED_API_KEY'` to the `ENV_KEYS` map in `config.ts`. `packages/core`
  untouched; no new routes or MCP tools (the existing provider-generic ones cover it).
- **Backtest caveat (honest scope):** FRED macro series are **revised** over time
  (the M2 value for a past month shown today differs from what was known then;
  point-in-time vintages live in ALFRED). v1 imports **latest-published** values —
  the same simplification the price providers already make — so a backtest over
  revised macro series carries mild lookahead. This is documented, not hidden; true
  vintage alignment is a later change.
- **Keys/secrets:** one new env-key mapping; existing key-locality guarantees unchanged.
- **Tests:** a unit test for the FRED parser against a captured `series/observations`
  fixture (no live network); registry test asserts `fred` is listed, keyed, and errors
  clearly when unconfigured.

## Non-goals

- Not making FRED the default (Yahoo stays the keyless default).
- Not point-in-time / vintage (ALFRED) macro data — latest-published only in v1.
- Not server-side resampling or a compact return mode (Roadmap §7.4).
- No `packages/core` change, no new endpoints — this is one more provider behind the
  existing market-data surface.
