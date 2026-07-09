## 1. Scenario binding + operation (core)

- [x] 1.1 Add `priceModels?: Record<string, CommodityPriceBinding>` to `Scenario` in `types.ts`
- [x] 1.2 Add `setScenarioCommodityPrice(model, scenarioId, driverId, binding)` in `operations.ts`: if the scenario is the base, delegate to the base-binding path (update the driver's `priceModel` + regenerate base values); else set `scenario.priceModels[driverId]` and write the generated series into `scenario.overrides[driverId]`. Returns `OpResult` with a `change` summary noting which path (base vs scenario) was taken
- [x] 1.3 Extend `regenerateBoundDrivers` (called by `setPeriods`/`setGranularity`) to also regenerate each scenario's `overrides[driverId]` from its stored `priceModels` params
- [x] 1.4 In `setScenarioValue`, if the driver had a `scenario.priceModels[driverId]` entry, clear it (manual override unbinds the scenario's commodity params); note it in the change summary
- [x] 1.5 In `removeDriver`, also strip `priceModels[driverId]` from every scenario (alongside the existing overrides cleanup)
- [x] 1.6 `validation.ts`: `UNKNOWN_PRICE_MODEL` for a `scenario.priceModels` entry naming a missing commodity/model
- [x] 1.7 Export the op from `index.ts`
- [x] 1.8 Tests: alternate scenario gets a distinct `btc_price` path while base is unchanged; base edit moves the baseline; unset scenario inherits base; timeline resize regenerates a scenario override; manual `setScenarioValue` clears the binding; unknown model → `ok:false`; `pnpm --filter @greenthumb/core build` + `test` green

## 2. Treasury template — re-express scenarios as commodity bindings (core)

- [x] 2.1 Re-express the Drawdown scenario's `btc_price` haircut and the Power-law support scenario as scenario commodity bindings (params) instead of baked value overrides, so the new panel can edit them
- [x] 2.2 Update/confirm treasury tests still pass (drawdown/support still price lower than base)

## 3. API adapter

- [x] 3.1 Add `PUT /models/:id/scenarios/:scenarioId/drivers/:driverId/commodity` and a handler in `EditsController` reusing `#apply` (preview/override/summary)
- [x] 3.2 API tests: alternate-scenario binding diverges from base; base binding moves base; unknown model → 422; `?preview=true` does not persist

## 4. MCP adapter

- [x] 4.1 Add `set_scenario_commodity_price` tool (modelId, scenarioId, driverId, commodity, model, params) with change summary in text
- [x] 4.2 Rebuild `packages/mcp`; live smoke test (create treasury; set an alternate scenario's btc_price to the support band; confirm it diverges from base; trim timeline; confirm the scenario path regenerates) on an isolated port + store

## 5. Web — scenario Commodity panel

- [x] 5.1 Add `api.ts` method `setScenarioCommodityPrice(modelId, scenarioId, driverId, binding)`
- [x] 5.2 Build `CommodityScenarioPanel`: for the active scenario, list commodity-priced drivers; per driver show adjustable params (spot/band/amplitude/cycle) seeded from the scenario's binding or the inherited base, with an "inherited from base" hint; on change, call the API for the active scenario (debounced) and apply the returned model + issues
- [x] 5.3 Mount the panel on the workspace (scenario-scoped, next to the driver panel / dashboard); it follows the existing scenario switcher
- [x] 5.4 Typecheck + web tests green

## 6. Verification & docs

- [x] 6.1 `pnpm typecheck` and all workspace tests green; production `vite build` succeeds
- [x] 6.2 Verify end to end: switch scenarios and confirm the commodity panel + charts reflect each scenario's own BTC path; adjust a param and see the model recompute
- [x] 6.3 Update `docs/Roadmap.md` to note scenario-scoped commodity assumptions
