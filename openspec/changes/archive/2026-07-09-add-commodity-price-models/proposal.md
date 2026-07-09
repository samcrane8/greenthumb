## Why

Bitcoin-treasury companies (and, later, miners) live or die on a **commodity price
path**. Today the `bitcoin_treasury` template fakes BTC's trajectory with a naive
`btc_start * (1 + btc_growth)^t` compounding item — a straight line in log space that
ignores Bitcoin's well-documented **power-law** behavior (price ≈ a · days^n since the
2009 genesis block). The MSTR build friction notes called this out directly: the
power-law path had to be reasoned about by hand, off a manually anchored day count.

There's no first-class notion of a *commodity* or a *price model* in the engine, so
every treasury or resource model re-derives its price series ad hoc. This change makes
**Bitcoin a commodity with a built-in power-law price model**, behind an extensible
registry (mirroring `TEMPLATES`) so metals, oil, and other commodities — each with
their own price models — can slot in later and let mining companies be modeled the
same way. The Bitcoin power law is wired into the `bitcoin_treasury` template to seed
BTC price, and price generation is exposed through the API and MCP.

Everything lands in `packages/core` first (a `commodities` registry of pure
generators + a persisted driver binding), then the adapters expose it, per the
architecture rule. Price generation is a pure, generation-time function
(`timeline → number[]`); the engine stays date-agnostic — dates are only read when
producing the series, never in `computeModel`.

## What Changes

- **Commodity registry (core)** — a `COMMODITIES` registry, like `TEMPLATES`. Each
  commodity (`bitcoin` to start) exposes one or more **price models**, each a pure
  generator `(timeline, params) → number[]` producing a per-period price series.
- **Bitcoin power-law model with cyclical oscillation** — a power-law *trend*
  `coefficient · days_since_genesis(t)^exponent` (date-anchored to the 2009-01-03 genesis
  block) times a **halving-cycle oscillation** around it: `price = trend ·
  exp(amplitude · sin(2π·t/cycle + φ))`, the studied boom/bust arc above and below fair
  value that the reference model (`docs/references/asst_model.tsx`) captured with its
  peak/capitulation/bear cycle. The starting **phase is inferred from the spot deviation**:
  because today's spot sits well below fair value, the model starts in the trough on the
  upswing — arcing up through fair value and then reversing over the cycle. Ships with an
  optional **spot anchor** (period 0 equals a supplied current spot; here it also sets the
  cycle phase) and a **band** selector (support / fair / resistance multiplier).
- **Commodity-priced drivers** — a driver may carry an optional `priceModel` binding
  (`{ commodity, model, params }`); binding it generates the driver's `values` from the
  model over the current timeline, and the binding persists so the series can be
  **regenerated** — including automatically when the timeline is resized or re-grained
  (dates change), so the power-law path stays correct after a trim.
- **Treasury template uses the power law** — `btc_price` becomes a commodity-priced
  driver bound to the Bitcoin power-law model (replacing the `btc_start`/`btc_growth`
  compounding item and its formula). The Drawdown scenario applies a haircut to the
  generated path. **BREAKING** for the treasury template's exact item/driver set;
  additive to the engine.
- **Adapters** — a `list_commodities` read plus a bind/generate operation exposed via
  new API routes and MCP tools, honoring `?preview=true` / `{ model, issues, ok }`.

## Capabilities

### New Capabilities
- `commodity-price-models`: A core registry of commodities and their price-model
  generators — pure functions that turn a timeline into a price series — shipping with
  Bitcoin's power law and built to extend to metals, oil, etc.
- `commodity-priced-drivers`: A persisted binding that marks a driver as priced by a
  commodity model, generates and regenerates its series (including on timeline edits),
  and is exposed through the API and MCP.

### Modified Capabilities
- `bitcoin-treasury-template`: Seed `btc_price` from the Bitcoin power-law commodity
  model via a commodity-priced driver, replacing the compounding-growth price item.

## Impact

- **Core (first):** new `commodities.ts` (registry + `bitcoinPowerLaw` generator +
  `daysSinceGenesis` calendar helper), `types.ts` (`CommodityPriceBinding` +
  optional `priceModel` on `Driver`), `operations.ts` (`setCommodityPrice` /
  `generateCommodityPrice`, and regenerate bound drivers inside `setPeriods` /
  `setGranularity`), `templates.ts` (treasury binds `btc_price`), `index.ts` exports.
- **API:** `GET /commodities`, `PUT /models/:id/drivers/:driverId/commodity` (bind +
  generate), `POST /models/:id/drivers/:driverId/regenerate`, via `EditsController`.
- **MCP:** `list_commodities`, `set_commodity_price`, `regenerate_commodity_price`.
- **Web:** none required here; a commodity picker on the driver panel can follow.
- **Integrity:** generated series are ordinary driver values, so existing validation
  and the `{ model, issues, ok }` contract are unchanged; a bound driver whose model
  or params are unknown is a validation error. Costs-negative and `A = L + E` rules
  are untouched.

## Non-goals

- **Not rebuilding Excel** (PRD §3): commodities generate semantic driver series, not
  free-form cells.
- **No live/market price feeds.** The spot anchor is a user-supplied number; there is
  no network data source. Power-law params are assumptions, not a live fit.
- **No date awareness in the formula language or `computeModel`.** Dates are used only
  at generation time to build the series; the engine stays index-based.
- **No new commodities beyond Bitcoin in this change.** Metals, oil, etc. are enabled
  by the registry but not implemented here.
- **No stochastic/Monte-Carlo price paths.** The power law is deterministic; scenarios
  remain the mechanism for up/down cases (e.g. the Drawdown haircut).
