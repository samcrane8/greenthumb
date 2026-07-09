## Why

Commodity-priced drivers (e.g. a treasury model's `btc_price`) currently carry one
price-model binding at the model level — every scenario sees the same commodity path.
But the whole point of scenarios is what-if exploration, and for a Bitcoin treasury
the single biggest lever is the **commodity price path itself**: a bull case is a
higher-amplitude power law, a bear case is the support-band corridor, a shock is a
lower spot. Today you can't express those as scenarios — you'd have to overwrite the
model's base assumptions and lose the comparison.

This change lets commodity assumptions **live within a scenario**: each scenario can
carry its own price-model parameters for a commodity-priced driver, so "Base",
"Drawdown", and a custom "Bull" scenario each generate their own BTC price path and
the model recomputes accordingly. A per-model, scenario-scoped **Commodity** panel
lets you adjust those assumptions (spot, band, amplitude, cycle) for the selected
scenario and see the model respond — turning the commodity model into a first-class
scenario axis.

Per the architecture rule, the scenario-scoped binding + generation lands in
`packages/core` first (reusing the existing `generatePrice` and scenario-override
machinery — no engine change, since generation happens at edit time and is stored as
the scenario's value override), then the API, MCP, and web adapters expose it.

## What Changes

- **Scenario-scoped commodity bindings (core)** — a scenario may carry a price-model
  binding per commodity-priced driver (`Scenario.priceModels`). Setting one generates
  the price series with the scenario's params over the timeline and stores it as the
  scenario's value override for that driver, so the engine computes it unchanged. The
  scenario remembers its params so they can be re-adjusted.
- **Base vs. alternate, unified** — editing commodity assumptions in the **base**
  scenario adjusts the driver's base binding (shifts the whole model); editing in an
  **alternate** scenario sets that scenario's binding only (localized what-if). A
  scenario with no commodity override for a driver inherits the base path.
- **Regeneration on timeline edits** — resizing/re-graining the timeline regenerates
  every scenario's commodity overrides too (their prices depend on dates), alongside
  the base bindings already handled.
- **Adapters** — an op `setScenarioCommodityPrice`, an API route, and an MCP tool
  (`set_scenario_commodity_price`), all returning `{ model, issues, ok }` with preview.
- **Web** — a scenario-aware **Commodity** panel on the model workspace: for the
  selected scenario, list its commodity-priced drivers, show each one's adjustable
  price-model params (seeded from the scenario's binding or the inherited base), and
  on change rebind + regenerate + recompute the model. Distinct from the global,
  read-only `/commodities` registry view.

## Capabilities

### New Capabilities
- `scenario-commodity-assumptions`: Commodity price-model parameters bound per
  scenario, generating that scenario's price path and recomputing the model — with a
  scenario-scoped Commodity editing panel, exposed through core, the API, and MCP.

### Modified Capabilities
<!-- None: this builds on commodity-priced-drivers additively (a scenario-level
     binding beside the existing driver-level one); no existing requirement changes. -->

## Impact

- **Core (first):** `types.ts` (`priceModels?: Record<string, CommodityPriceBinding>`
  on `Scenario`), `operations.ts` (`setScenarioCommodityPrice`; extend timeline-edit
  regeneration to scenario bindings), `validation.ts` (`UNKNOWN_PRICE_MODEL` also for
  scenario bindings), `index.ts` exports. No engine change — generation stays at edit
  time and flows through the existing scenario `overrides`.
- **API:** `PUT /models/:id/scenarios/:scenarioId/drivers/:driverId/commodity`, via
  `EditsController.#apply` (preview/override/summary reused).
- **MCP:** `set_scenario_commodity_price` tool.
- **Web:** a `CommodityScenarioPanel` on the workspace (scenario-scoped) + `api.ts`
  method; reuses the preview/params-control patterns from the commodities view.
- **Integrity:** generated overrides are ordinary per-period values; validation gains
  a scenario-binding check. Costs-negative and `A = L + E` unaffected.

## Non-goals

- **Not rebuilding Excel** (PRD §3): scenario-scoped semantic assumptions, not cells.
- **No new engine date-awareness.** Scenario prices are generated at edit time and
  stored as value overrides; `computeModel` stays index-based.
- **No editing the global registry from the model.** Default params/models live in
  code; a scenario tunes params for *its* path only.
- **No new commodities** — still Bitcoin; the panel renders whatever is bound.
- **No automatic scenario creation.** Adjusting a commodity assumption edits the
  selected scenario; creating scenarios remains a separate action.
