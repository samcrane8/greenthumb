## Context

greenthumb already has the *consumers* of market data: `model-actuals` stores observed
actuals (with a SQLite `actuals` table, `actuals_store`, and routes for manual/CSV
ingestion and forecast-vs-actual join), and `backtesting`/`model-calibration`/
`forecast-accuracy` score and tune forecasts against those actuals. What's missing is a
*source* — today actuals are hand-entered or CSV-imported. The commodity work
established the pattern this follows: generation/fetching happens at edit time in an
adapter and is **materialized** into the model; `computeModel` never does I/O and only
reads stored numbers (`packages/core` is pure). The calendar mapping used to place
values on the timeline (`periodDate`) already lives in core and is exported.

## Goals / Non-Goals

**Goals:**
- A pluggable provider layer that fetches quotes + price history, entirely in the
  adapters (core untouched, no I/O in compute).
- Materialize fetched history into the **existing** actuals store, and seed a driver
  from a live quote — both explicit, both stamped with provenance.
- Local-first + reproducible: keys stay local, models never change on their own.

**Non-Goals:** point-in-time fundamentals (v1), streaming/auto-refresh, vendor-data
redistribution, any core change (see proposal).

## Decisions

### D1 — The entire provider layer lives in the API, not core
The `DataProvider` interface and all fetching live in `apps/api` (a `market_data`
service + provider adapters), never in `packages/core` — not even the interface, so
core stays I/O-free by construction. The web/MCP reach it through API routes as usual.
**Why:** the one rule that governs everything is "core is pure"; putting the interface
in core would invite an I/O dependency. **Alternative rejected:** a `packages/marketdata`
package — the MCP already goes through the API, so nothing needs direct package access;
a package adds surface for no gain and risks core importing it.

### D2 — v1 = price history + snapshot quotes; point-in-time fundamentals deferred
Price history is split/dividend-adjusted and safe to backtest against. Restated
fundamentals (shares outstanding, revenue) are **not** point-in-time — using today's
restated numbers to "backtest" a past forecast is lookahead bias, silently inflating
accuracy. So v1 ships: `history` (prices → actuals) and `quote` (current snapshot →
seed a driver). `fundamentals` is optional and, if returned, is labelled `asOf: latest`
and MUST NOT be imported into historical actuals. **Why:** correctness of the
backtesting loop is the whole point; a naive fundamentals import would poison it.
**Confirmed scope** — v1 is price history + snapshot quotes; point-in-time fundamentals are a later capability.

### D3 — Materialize history into the EXISTING actuals store, aligned by calendar
`importMarketActuals(modelId, symbol, itemName, options)`: fetch the symbol's history,
then for each model period compute its date via core's `periodDate(timeline, i)` and
select the provider's close on/nearest-before that date; write the resulting series to
the actuals store for `itemName` and advance `actualsThrough`. **Why:** reuses the
validate-on-write actuals pipeline and the same calendar logic the commodity generator
uses — no parallel storage, no duplicated date math. **Alternative considered:** a
separate market-data table feeding compute — rejected; actuals already are that surface.

### D4 — A provider registry with a keyless default + BYO-key providers
`DataProvider = { id, label, requiresKey, quote(symbol), history(symbol, range) }`, in a
`PROVIDERS` registry. Ship a **keyless EOD default** (e.g. Stooq's public CSV) so the
feature works with zero setup, plus one BYO-key provider (e.g. Alpha Vantage/FMP) for
richer coverage. Provider selection + key come from API/desktop config. **Why:** zero-
config first-run matches local-first; the registry keeps vendors swappable and matches
the `TEMPLATES`/`COMMODITIES` pattern.

### D5 — Provenance + caching in SQLite
Every materialized value carries `{ source, asOf, symbol }`; provider responses are
cached in a `market_cache` table keyed by (provider, symbol, range) with a TTL, so
repeated imports don't re-hit the network and the app works offline after first fetch.
**Why:** rate limits are real, and provenance answers "where did this number come
from?" — the exact reconciliation pain from the MSTR notes.

### D6 — Secrets stay local; posture is reportable, keys are not
Provider keys live in API env / desktop local config (the same place the single-tenant
`API_KEY` lives), never in a model's JSON and never in git. `GET /api/info` (or a
providers endpoint) may report *whether* a provider is configured, never the key value.
The Data Sources settings page writes the key to local config only. **Why:** the safety
rule — never persist secrets in artifacts; and local-first means the user owns their key.

### D7 — Explicit refresh only; compute never fetches
Importing/seeding are user/Claude actions that write into the model. `computeModel`
stays offline. A model is a self-contained artifact whose numbers don't drift with the
market. **Why:** reproducibility and the no-I/O-in-core rule.

## Risks / Trade-offs

- **Lookahead bias via fundamentals** → D2 defers point-in-time fundamentals; price-only
  v1 is backtest-safe; any fundamentals are labelled and blocked from historical actuals.
- **Rate limits / flakiness** → cache with TTL (D5); degrade gracefully (return a clear
  error, keep cached data usable offline).
- **Corporate actions / symbology** (splits, adjusted vs raw) → prefer providers'
  adjusted series; document the adjustment basis; keep the provider interface thin so a
  better-behaved vendor can replace a worse one.
- **Licensing/ToS** → default provider chosen to allow personal use; greenthumb ships no
  data and does not redistribute; document that BYO-key providers carry their own terms.
- **Timeline granularity mismatch** (daily EOD vs quarterly model) → align by
  period-boundary close (D3); document the rule; a coarse model samples the nearest close.
- **Secret leakage** → D6 keeps keys in local config only; add a test asserting keys
  never appear in serialized models or API responses.

## Migration Plan

Additive and backward compatible. New API service/routes, MCP tools, and a settings page
only; no core change, no model-schema change (imported data lands in the existing actuals
store; provenance is additive metadata). Existing models and flows are untouched.
Rollback = revert code; cached market data is disposable.

## Open Questions

_All three resolved (see D2, D4, D3):_
- **v1 scope boundary** → confirmed: price history + snapshot quotes now; point-in-time
  fundamentals are a deliberate later capability (the backtest-safe cut, per D2).
- **Default provider** → confirmed: a keyless EOD source (Stooq) as the zero-config
  default, with BYO-key providers alongside (D4).
- **Seed target** → confirmed: v1 seeds plain driver values only; pinning a
  commodity-priced driver's `spot` (regenerating the power law from a live quote) is a
  small follow-up, not in v1.
