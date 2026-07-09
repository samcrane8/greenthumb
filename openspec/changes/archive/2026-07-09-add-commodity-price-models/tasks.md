## 1. Commodity registry + Bitcoin power law (core)

- [x] 1.1 Add `packages/core/src/commodities.ts`: `PriceModel` (`{ id, label, defaultParams, generate(timeline, params): number[] }`), `Commodity` (`{ id, label, models: PriceModel[] }`), and a `COMMODITIES` registry
- [x] 1.2 Add a `daysSinceGenesis(timeline, index)` calendar helper (start + granularity + index → date → days from 2009-01-03), correct across monthly/quarterly/annual and leap years
- [x] 1.3 Implement `bitcoinPowerLaw` generator as trend × oscillation × band: trend `coefficient · days^exponent` with documented central-fit defaults (`exponent 5.8`, `coefficient 1.0117e-17`; cite the Santostasi/Burger corridor in a comment), band multipliers (`support 0.42`, `fair 1.0`, `resistance 2.5`) — all params overridable
- [x] 1.4 Add the halving-cycle oscillation `exp(amplitude · sin(2π·years/cycleYears + φ))` with defaults `cycleYears 4`, `amplitude 0.55` (calibrated to the reference's ~47% net peak-to-trough drawdown; optional damping); infer phase `φ` from the spot deviation on the **rising arc** so a below-trend spot starts in the trough heading up; `spot` anchor pins period 0
- [x] 1.5 Add `generatePrice(commodityId, modelId, timeline, params): number[]` lookup + a `listCommodities()` accessor
- [x] 1.6 Tests: series length = periods + all finite/positive; series is **non-monotonic** over a full cycle (rises above then below its own trend); below-trend spot pins period 0 and rises through fair value before reversing; support band < fair band; `daysSinceGenesis` correct across monthly/quarterly/annual + leap years; phase inference reproduces the spot at period 0; **peak-to-trough drawdown over a down-leg is ~45–50%** (calibrated to the reference)

## 2. Driver binding + operations (core)

- [x] 2.1 Add `CommodityPriceBinding` type and optional `priceModel?: CommodityPriceBinding` on `Driver` in `types.ts`
- [x] 2.2 Add `setCommodityPrice(model, driverId, binding)` — set binding + generate values; and `generateCommodityPrice(model, driverId)` — regenerate from stored binding; both return `OpResult` with a `change` summary
- [x] 2.3 In `setPeriods` / `setGranularity`, regenerate every driver carrying a `priceModel` binding after mutating the timeline
- [x] 2.4 `validation.ts`: `UNKNOWN_PRICE_MODEL` when a binding names a missing commodity/model; bound values otherwise validate normally
- [x] 2.5 `setAssumption` on a bound driver clears its `priceModel` binding (implicit unbind), recorded in the change summary
- [x] 2.6 Export commodities API + new ops/types from `index.ts`
- [x] 2.7 Tests: bind generates series + persists binding; timeline resize regenerates a bound driver but leaves unbound drivers intact; unknown model → `ok:false`; unbind on manual override

## 3. Treasury template uses the power law (core)

- [x] 3.1 Replace the `btc_price` formula item + `btc_start`/`btc_growth` drivers with a `btc_price` driver bound to `bitcoin`/`powerlaw`, spot-anchored to the starting spot (~$62.85k for 2026 MSTR reality)
- [x] 3.2 Reframe the Drawdown scenario to override `btc_price` with a haircut on the generated path (instead of overriding `btc_growth`), and add a "Power-law support" scenario overriding `btc_price` with the support-band series
- [x] 3.3 Tests: template validates + converges; `btc_price` is the spot-anchored power law (period 0 == spot, strictly increasing); existing leverage/dividend/dashboard tests still pass
- [x] 3.4 `pnpm --filter @greenthumb/core build` + `test` green

## 4. API adapter

- [x] 4.1 Add `GET /api/commodities` (list commodities + models) to a controller
- [x] 4.2 Add `PUT /models/:id/drivers/:driverId/commodity` (bind + generate) and `POST /models/:id/drivers/:driverId/regenerate` via `EditsController.#apply` (preview/override/summary reused)
- [x] 4.3 API tests: bind generates series; unknown model → 422; regenerate after a timeline change; `?preview=true` does not persist

## 5. MCP adapter

- [x] 5.1 Add tools: `list_commodities`, `set_commodity_price` (bind), `regenerate_commodity_price`, following the `call()` + `previewArg` pattern with change summary in text
- [x] 5.2 Rebuild `packages/mcp`; live smoke test (list commodities; create treasury; confirm `btc_price` is power-law; bind a driver; trim timeline and confirm regeneration) against a running API on an isolated port + store

## 6. Verification & docs

- [x] 6.1 `pnpm typecheck` and all workspace tests green
- [x] 6.2 Update `docs/Roadmap.md` to describe commodities + the Bitcoin power law and the path to metals/oil for mining models
