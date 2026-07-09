## Context

A commodity-priced driver stores a `priceModel` binding and generated `values`
(base case). Scenarios override driver *values* per period
(`overrides: Record<driverId, (number|null)[]>`); the engine computes a scenario by
overlaying those onto the base series — it never reads dates or price models
(generation is an edit-time concern, per the commodity-price-models design). The
treasury template already ships a "Drawdown" scenario that overrides `btc_price` with
a hand-scaled path. This change generalizes that: a scenario can carry commodity
*parameters* (not just baked values), so its path is a real, re-adjustable power-law
variant.

## Goals / Non-Goals

**Goals:**
- Commodity assumptions that live per scenario, so different scenarios produce
  different commodity paths and the model recomputes per scenario.
- Re-adjustable: a scenario remembers its params, not just the resulting numbers.
- Zero engine change — reuse the scenario `overrides` mechanism for compute.

**Non-Goals:** engine date-awareness, registry editing from the model, new
commodities, auto scenario creation (see proposal).

## Decisions

### D1 — A scenario stores commodity *params*; generation writes the override values
Add `Scenario.priceModels?: Record<driverId, CommodityPriceBinding>`. Setting a
scenario's commodity price (a) records the binding in `scenario.priceModels[driverId]`
(so it's re-editable) and (b) generates the series over the timeline and writes it to
`scenario.overrides[driverId]`. Compute is unchanged: it just sees the override values.
**Why:** the params must persist to re-adjust, but compute must stay date-agnostic —
storing both the params (for editing) and the generated values (for compute) satisfies
both with no engine work. **Alternative rejected:** teaching `computeModel` to generate
per scenario — pushes calendar/price logic into the engine, the thing we deliberately
kept out.

### D2 — Base scenario edits the base binding; alternates edit their own
`setScenarioCommodityPrice(model, scenarioId, driverId, binding)`:
- If `scenarioId` is the base scenario → delegate to the existing base-binding path
  (update the driver's `priceModel` + regenerate its base `values`). Editing "the
  commodity in Base" moves the whole model's baseline.
- Else → set `scenario.priceModels[driverId]` and write the generated series into
  `scenario.overrides[driverId]`. Localized what-if.

**Why:** a single, intuitive mental model — the base case is the driver's base binding;
an alternate scenario layers its own variant on top. A scenario without an entry for a
driver simply inherits the base path (no override). **Alternative considered:** always
store on the scenario, even base — redundant base overrides equal to the base
generation; rejected as confusing.

### D3 — Timeline edits regenerate scenario bindings too
Extend the existing `regenerateBoundDrivers` (run inside `setPeriods`/`setGranularity`)
to also, for each scenario with `priceModels`, regenerate `scenario.overrides[driverId]`
from the scenario's stored params over the new timeline. **Why:** a scenario's price
path depends on dates just like the base; a resize must keep every scenario's path
correct, not just the base. Scenarios without commodity bindings are untouched.

### D4 — Validation covers scenario bindings
`validation.ts` reports `UNKNOWN_PRICE_MODEL` for a `scenario.priceModels` entry naming
a missing commodity/model, mirroring the driver-level check. Generated overrides are
otherwise ordinary values.

### D5 — Web: a scenario-scoped Commodity panel on the workspace
Add a `CommodityScenarioPanel` shown on the model workspace, driven by the existing
scenario switcher (`scenarioId`). It lists the model's commodity-priced drivers; for
each, it shows adjustable params seeded from `scenario.priceModels[driverId]` if present
else the driver's base binding, with a note when a value is inherited from base.
Adjusting a control calls `setScenarioCommodityPrice` for the active scenario
(debounced), then the workspace recomputes (it already refreshes on model/scenario
change). **Why:** "adjust within a scenario" maps directly onto the scenario switcher
that's already there; a panel beside the driver panel keeps the model in one view.
**Alternative considered:** a separate `/models/:id/commodity` route — rejected; it
would duplicate the scenario switcher and split the model view. Reuses the params
controls + preview approach from the commodities view.

## Risks / Trade-offs

- **Params and generated values can drift** if something writes `scenario.overrides`
  for a bound driver directly (e.g. `set_scenario_value`) → treat a manual per-period
  override as authoritative and, like the base `setAssumption` unbind, clear the
  scenario's `priceModels[driverId]` when a manual scenario override is set for that
  driver. Documented; keeps a single source of truth per (scenario, driver).
- **Base-vs-alternate branching could surprise** → the change summary states which path
  was taken ("base binding" vs "scenario override"), and the panel labels the active
  scenario.
- **A scenario referencing a driver that later loses its binding** → the scenario entry
  is just params; if the driver is deleted, `removeDriver` already strips scenario
  overrides; also strip `priceModels` entries for the removed driver.
- **More regeneration work on resize** → bounded by (#scenarios × #bound drivers), tiny
  in practice; only bound entries regenerate.

## Migration Plan

Additive and backward compatible. `Scenario.priceModels` is optional; existing models
load unchanged (their scenarios simply have baked value overrides, as the Drawdown
scenario does today). New op/route/tool/panel only; no stored-model migration. The
treasury template keeps working as-is (its Drawdown/Support scenarios remain value
overrides; they could later be re-expressed as scenario bindings, but that's not
required). Rollback = revert code.

## Open Questions

- Should the treasury template's existing Drawdown / Power-law support scenarios be
  re-expressed as scenario *commodity bindings* (so they're re-adjustable in the new
  panel), or left as the current baked value overrides? (Leaning: re-express them, so
  the panel can edit them — a small template tweak that makes the feature immediately
  useful on a fresh model.)
- When editing commodity params in an alternate scenario, seed controls from the
  inherited base binding or from empty/defaults? (Leaning: seed from the inherited base
  so a scenario starts as a copy of base and you nudge from there.)
