## Why

greenthumb can score forecasts against actuals and calibrate to them
(`model-actuals`, `backtesting`, `forecast-accuracy`, `model-calibration`) — but the
actuals have to be typed in or CSV-imported by hand. And seeding a model still means
looking up a spot price and share count across disagreeing sources (the MSTR build's
recurring pain: the price page 404'd, StockAnalysis and the company page reported
different share counts). Live market-data access closes both gaps: it is the natural
**fuel for the backtesting/calibration loop** (you can't score a forecast without
observed history) and it makes seeding assumptions a one-call operation with a
recorded source.

The guiding constraint: **`packages/core` is pure with no I/O**, so none of this
touches the engine — market data is entirely an **adapter concern**, exactly like
commodity-price generation. Fetching happens at *edit time* in the API, and results
are **materialized** into the model (as actuals, or as a seeded driver value); the
engine only ever computes over stored numbers. A model never silently changes because
the market moved — a refresh is an explicit action, so models stay reproducible,
local-first artifacts.

## What Changes

- **Pluggable provider registry (API)** — a `DataProvider` interface
  (`quote`, `history`, and optionally `fundamentals`) with a registry mirroring how
  `TEMPLATES`/`COMMODITIES` work. Ship one keyless default (e.g. Stooq EOD) plus a
  BYO-key provider; adding vendors is a registry entry, never a core change.
- **Fetch reads (API + MCP)** — `list_data_providers`, `get_quote(symbol)`, and
  `get_price_history(symbol, range, granularity)`, so a human or Claude can pull data.
- **Materialize into the model, explicitly:**
  - **Import price history → actuals** — fetch a symbol's history, align it to the
    model's timeline periods (same calendar mapping the commodity generator uses),
    and write it through the **existing actuals store** for a chosen item, advancing
    `actualsThrough`. This feeds backtesting/calibration directly.
  - **Seed a driver from a live quote** — fetch the current quote (or shares/holdings)
    and set a driver's value (the BTC spot-anchor pattern, but real).
- **Provenance + caching** — every fetched value is stamped with its `source` and an
  `asOf` timestamp; responses are cached in the existing SQLite DB to respect rate
  limits and stay offline after first fetch.
- **Secrets handling** — provider API keys live in API/desktop config only, never in
  a model's JSON, never in core, never committed. A small **Data Sources** settings
  page lets the user pick a provider and store a key locally.

## Capabilities

### New Capabilities
- `market-data-providers`: A pluggable market-data provider layer in the adapters —
  fetch quotes and price history, materialize history into a model's actuals or seed a
  driver from a live quote, with provenance, caching, and local-only key handling,
  exposed through the API, MCP, and a Data Sources settings page.

### Modified Capabilities
<!-- None. Provider import is an additive new source alongside model-actuals' existing
     CSV/manual ingestion; it writes to the same actuals store without changing any
     model-actuals requirement. -->

## Impact

- **Core:** none — no I/O in core. (At most, reuse the existing calendar helpers via
  the adapter; the engine is untouched.)
- **API:** a `apps/api` market-data service + provider adapters; routes for
  `GET /market/providers`, `GET /market/:symbol/quote`,
  `GET /market/:symbol/history`, `POST /models/:id/actuals/import-market`, and
  `PUT /models/:id/drivers/:driverId/seed-from-quote`. Caching + provenance in SQLite
  (alongside the existing actuals table).
- **MCP:** `list_data_providers`, `get_quote`, `get_price_history`,
  `import_market_actuals`, `seed_driver_from_quote` tools.
- **Web:** a **Data Sources** settings page (choose provider, store key locally, test
  the connection) and an "import actuals from ticker" affordance on a model.
- **Config/secrets:** provider keys in API env / desktop local config; the account
  posture (`/api/info`) can report whether a provider is configured, never the key.
- **Integrity:** imported actuals flow through the existing validate-on-write actuals
  store; nothing new in `A = L + E` or costs-negative. Provenance metadata is
  additive.

## Non-goals

- **Not rebuilding Excel** (PRD §3): a data pipe into semantic models, not a grid.
- **No network access in `computeModel`.** Fetching is explicit and materialized;
  compute stays offline and reproducible.
- **No point-in-time fundamentals in v1.** Price history is split-adjusted and safe to
  backtest against; restated fundamentals (shares, revenue) introduce **lookahead
  bias** if used to "backtest" past forecasts. v1 ships price history + current-snapshot
  quotes; point-in-time fundamentals are a deliberate later capability, and imported
  fundamentals (if any) are clearly labelled "as-of latest".
- **No redistribution of vendor data.** Fetched data is for the user's own models; the
  default provider is chosen to allow personal use. greenthumb ships no data itself.
- **No auto-refresh / streaming.** No background polling or live tickers; refresh is a
  user/Claude action. Real-time quotes are out of scope.
- **No storing secrets in models or the repo.** Keys never enter model JSON or git.
