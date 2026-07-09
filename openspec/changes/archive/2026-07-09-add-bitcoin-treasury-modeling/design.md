## Context

The reference `docs/references/asst_model.tsx` is a self-contained React app that
models Strive (ASST) as a levered residual claim on a BTC reserve funded by SATA
perpetual preferred. It bundles four things greenthumb splits across its
architecture: (1) a domain model unique to treasury companies, (2) an imperative
per-quarter calc loop with S-curves and mean-reversion, (3) four recharts figures,
and (4) a bespoke dashboard layout. greenthumb already has a superior calc engine
(dependency-ordered recompute + iterative solver for intentional circularity) and
a validate-on-write operation layer, so the work is not to port the React loop but
to express the same economics in the engine's declarative vocabulary and add the
missing rendering + layout surfaces.

Current state (from code inventory):
- **Engine**: `prior/lag/lead`, `cumulative/rolling/growth`, `min/max/if/abs/sum/avg`,
  operators incl. `^`. Iterative solver handles `prior()`-based recursion and cycles.
  No `exp/ln/sqrt`, so logistic S-curves are not expressible.
- **Templates**: only `blank` and `saas`. `ModelType` reserves seven unused names.
- **Model type**: `{ meta, timeline, items, drivers, scenarios }` — no chart/dashboard.
- **API/MCP**: thin adapters; MCP calls the HTTP API. `EditsController.#apply`
  centralizes the preview / override / `{model,issues,ok}` contract.
- **Web**: `WorkspacePage` hardcodes the layout; `StatementGrid` is the only view;
  `DriverPanel` commits scalar edits via API round-trip. No chart library.

## Goals / Non-Goals

**Goals:**
- Scaffold an MSTR/ASST-class model from a single template that a human or Claude
  can then tune via drivers and scenarios.
- Make S-curve issuance ramps and mNAV mean-reversion expressible **in the engine**,
  not in UI code, so every adapter benefits and results stay reproducible.
- Give the product a first-class, persisted chart concept and an editable dashboard,
  both flowing through core → adapters → web like every other capability.

**Non-Goals:**
- Reproducing the reference's imperative second-order effects (cycle capitulation
  events, ETF-flow feedback) as fully declarative formulas. Those are modeled as
  driver series + scenario overrides, not new engine control flow.
- A free-form drag canvas, a client-side calc engine, live market data, or a
  sensitivity-sweep engine (all Non-goals in the proposal).

## Decisions

### D1 — Model the treasury company as a levered residual claim using existing engine mechanics
The template emits drivers (BTC price, weekly preferred issuance, dividend rate,
ATM issuance, mNAV target, amplification cap) and formula items that compute, per
period: reserve value = `btc_held * btc_price`; `nav_to_common = reserve + cash +
other_holdings - preferred_notional`; `nav_per_share = nav_to_common / common_shares`;
`asst_price = max(nav_per_share, 0) * mnav`; `implied_leverage = reserve /
nav_to_common`; dividend obligation and coverage. Stateful series (`btc_held`,
`preferred_notional`, `common_shares`, `cash`) use `prior(x) + <flow>` recursion,
which the engine already resolves. **Why:** reuses the single source of truth; no
new engine control flow. **Alternative rejected:** a bespoke treasury calc module
in core — violates "one engine," duplicates ordering/solver logic.

### D2 — Add pure, stateless math built-ins to the formula language
Add `exp, ln, sqrt, pow, round, floor, clamp(x,lo,hi)` and a `logistic(x, k, x0)`
(and thin `scurve(period, start, peak, ramp)` sugar over it) to `evalCall` in
`formula.ts`. All are pure and period-local, so they compose with the existing
evaluator, topo-sort, and solver with zero engine changes. **Why:** S-curves and
mean-reversion need `exp`; the rest round out a credible numeric base. **Alternative
rejected:** precomputing S-curve series in the template builder — bakes assumptions
in, defeats the point of tunable drivers, and can't respond to scenario overrides.
**Guardrails:** define domain edge behavior consistent with existing `/`-by-zero
(returns 0): `ln`/`sqrt` of non-positive → 0; `pow` NaN → 0; keep it total, never throw.

### D3 — Charts and dashboards are persisted entities ON the model, not a sidecar store
Extend `Model` with optional `charts: Chart[]` and `dashboard: Dashboard`. A
`Chart` is `{ id, title, kind: 'line'|'area'|'bar'|'composed', scenarioId?, series:
ChartSeries[], options }` where `ChartSeries = { ref: <item|driver name>, label?,
axis?: 'left'|'right', style?, index?: boolean }`. A `Dashboard` is `{ widgets:
Widget[] }` with `Widget = { id, kind: 'chart'|'stat'|'statement'|'note', refId?,
layout: {x,y,w,h}, ... }`. **Why:** keeps single-source-of-truth, persists in the
existing per-model JSON store, versions/diffs with the model, and rides the existing
preview/override machinery for free. **Alternative rejected:** a separate charts
table/store — splits the source of truth and needs its own persistence + sync.

### D4 — Chart *data* is derived, never stored
Charts store only *definitions* (series refs). A read path computes the referenced
series for a given scenario from the engine and returns chart-ready rows. In core,
add `getChartData(model, scenario, chartId)` alongside `getStatement`. **Why:**
mirrors how statements already work; no stale cached numbers. The API exposes
`GET /models/:id/charts/:chartId/data?scenario=`; MCP adds a read tool.

### D5 — Operations follow the validate-on-write pattern; adapters reuse `#apply`
New ops in `operations.ts` — `addChart, updateChart, removeChart, addWidget,
updateWidget, removeWidget, reorderDashboard` — each `clone → mutate → finalize`
returning `OpResult`. API routes hang under `/models/:id/charts` and
`/models/:id/dashboard` and go through `EditsController.#apply`, so `?preview=true`,
`?override=true`, and the 422-on-invalid behavior come for free. MCP tools follow the
existing `call()` + `previewArg` pattern. **Why:** zero new contract surface; parity
by construction.

### D6 — Validation extends to reference integrity
`validation.ts` adds: every `ChartSeries.ref` resolves to a known item/driver name
(`DANGLING_CHART_REF`); every `Widget.refId` of kind `chart`/`statement` resolves
(`DANGLING_WIDGET_REF`); chart/widget ids unique. **Why:** same guarantee that
protects formulas — neither human nor Claude can persist a dashboard that points at
nothing. Balance-sheet enforcement is unaffected (treasury template has no BS items).

### D7 — Web: add a chart renderer and a dashboard host, recompose `WorkspacePage`
Add a charting dependency (**recharts** — matches the reference, React 19 compatible,
tree-shakeable) and a `ChartView` that maps a `Chart` + computed data to the right
recharts primitive. Introduce a `DashboardView` that renders `dashboard.widgets` in a
CSS-grid, with an edit mode to add/remove/reorder/resize widgets (grid cells, not free
canvas) persisting through the new API. `WorkspacePage` becomes the default dashboard
host; the existing statement grid becomes a `statement` widget. **Why:** the row data
(`values[]` per period) is already chart-shaped; recharts keeps parity with the
reference and minimizes bespoke SVG. **Alternative considered:** hand-rolled SVG —
lower dep weight but far more code for four chart types.

### D8 — Phasing: engine → adapters → web, shippable in slices
Order: (P1) formula primitives, (P2) treasury template, (P3) chart/dashboard core
types + ops + validation, (P4) API routes, (P5) MCP tools, (P6) web chart renderer,
(P7) web dashboard editor. P1–P2 deliver a usable model immediately (viewable in the
existing grid); charts/dashboards layer on without blocking it.

## Risks / Trade-offs

- **Imperative reference logic doesn't fully map to declarative formulas** (cash
  buffer absorbing dividend shortfall, amplification cap clamping issuance, cycle
  capitulation) → Model the first-order economics declaratively; express caps with
  `min`/`clamp`, and represent discrete cycle/drawdown events as scenario overrides
  or step drivers. Document the fidelity gap in the template's notes. Accept that the
  template is a faithful *first-order* model, not a bit-for-bit port.
- **Recursive `prior()` chains + `clamp`/`min` could create convergence edge cases**
  in the iterative solver → keep cross-period recursion first-order where possible;
  add template-level tests asserting `converged === true` over the default horizon.
- **New chart/dashboard fields on `Model` touch every serializer/consumer** → fields
  are optional; existing models without them stay valid, and validation only fires
  when present (backward compatible, no migration needed).
- **recharts bundle weight in the web app** → import only the primitives used; charts
  render lazily within the workspace route.
- **mNAV/price can go non-finite** if `nav_to_common ≤ 0` (leverage → ∞) → clamp price
  at `max(nav_per_share, 0)` (as the reference does) and cap `implied_leverage`;
  covered by D2's total-function math.

## Migration Plan

- Additive only. `charts`/`dashboard` are optional on `Model`; models created before
  this change load unchanged and simply have no dashboard (web falls back to the
  current statement view). No data migration, no store format bump. Rollback = revert
  the code; existing model JSON remains readable because the new fields are optional
  and ignored by the prior build.

## Open Questions

- Default dashboard for the `bitcoin_treasury` template: ship a curated 4-chart +
  tiles + projection-table layout (mirroring the reference) so the template is
  impressive out of the box? (Leaning yes — the builder emits a default `dashboard`.)
- Should `scurve` be a distinct built-in or just documented as `logistic` usage?
  (Leaning: ship both; `scurve` is analyst-friendly sugar.)
- Widget resize granularity — fixed grid columns (e.g. 12-col) vs. free w/h. (Leaning
  12-col grid to bound layout complexity.)
