## Context

greenthumb computes a model forward: `computeModel(model, scenario)` resolves the
driver→formula→output graph over an index-based timeline and returns per-item
series. There is no channel from realized history back into the model. The
`actuals` SQLite table and `Actual` Lucid model are scaffolded but wired to
nothing; `Timeline.actualsThrough` is an index that only tints statement rows in
the UI. The handbook (`docs/references/financial_modeling_handbook/01_*.md` §3–4)
defines the discipline this change implements: store actuals point-in-time,
score forecast against them with several metrics, sweep drivers to find what
matters, backtest with an out-of-sample holdout and walk-forward, calibrate
drivers to history, and improve under an out-of-sample gate.

The governing constraint is the repo's architecture rule: **capability lands in
`packages/core` (pure, no I/O) first, then the API and MCP adapters expose it.**
Analysis is read-heavy and composes cleanly over the existing `computeModel`;
the only genuinely new machinery is (a) an actuals data ingress and (b) a
point-in-time re-forecast, which is what makes walk-forward honest.

## Goals / Non-Goals

**Goals:**
- A pure `accuracy.ts` giving MAE/RMSE/MAPE/mean-signed-bias and a
  `scoreForecast` that scores a computed series against an actuals series.
- First-class actuals: ingest (CSV + API), store, and join against forecast,
  keyed to `Timeline.actualsThrough` as the forecast cutover.
- Point-in-time / vintage re-forecast: freeze the model's knowledge as of a past
  period `t`, forecast `t+1…`, compare to what actually happened — with a guard
  that a vintage forecast cannot read data after `t` (look-ahead bias).
- Sensitivity: `sweepDriver`, `tornado`, and programmatic scenario/grid
  generation, all composing over `computeModel`.
- Backtest: basic (forecast vs. stored actuals), out-of-sample holdout split,
  and walk-forward (anchored + rolling), each returning per-period residuals and
  the metric triplet plus bias.
- Calibration: fit a chosen set of drivers to history under a metric, report
  residuals ranked as candidate structural fixes, and gate any accepted change
  on out-of-sample error falling. Calibration output flows through the existing
  `preview → accept` review path, never auto-commits.
- Both a human (later UI phase) and Claude (MCP tools) can run the full loop.

**Non-Goals:**
- Monte Carlo / distribution sampling (stays deferred, Roadmap §3 / V2).
- A general econometrics or optimization library; no gradient/Bayesian fitting —
  a bounded grid + local coordinate refinement is enough for scalar drivers.
- Data connectors (QuickBooks/Stripe); actuals arrive via CSV/API only.
- The web UI surface (backtest chart, tornado, calibration diff) — deferred to a
  follow-up phase; the core loop must be complete and driveable through MCP.
- No change to the A = L + E identity, sign conventions, or the validate-on-write
  contract.

## Decisions

### 1. Actuals live in SQLite, not the model JSON — but scoring reads a plain array
The `actuals` table (`model_id, item_id, period, value, source`, unique on the
triple) already exists for exactly this reason (bulky, range-queried time series
that shouldn't bloat the diffable model JSON). We wire it up rather than move
actuals into the model. **But the core `accuracy`/`backtest` functions stay pure**
by taking a plain `actuals: (number|null)[]` (or a `Map<itemId, (number|null)[]>`)
argument. The API adapter is responsible for loading rows from SQLite and handing
core an array. This preserves "core has no I/O" while keeping the storage
decision where it belongs (the adapter).
*Alternative rejected:* actuals in model JSON — simpler wiring, but violates the
PRD §9.2 storage split and bloats git diffs with time-series noise.

### 2. Point-in-time re-forecast = "actuals-substituted, horizon-clipped" compute
Walk-forward needs to forecast *as if standing at period `t`*. We implement this
without a new engine by adding a compute option: `asOf: t`. Under it,
`computeModel` (a) substitutes stored actuals into every item's series for periods
`≤ t` (locking known history), and (b) forbids any formula from reading a period
`> t` of an item that has actuals — the look-ahead guard, surfaced as a
validation issue if violated. Everything `> t` computes forward from the frozen
state. This is a thin, well-contained addition to the existing recompute; it does
not touch the dependency solver.
*Alternative rejected:* cloning/truncating the model to `t` periods and
re-extending — lossy, mangles `actualsThrough`, and can't express "known history
before `t`, forecast after."

### 3. `actualsThrough` becomes load-bearing; add a per-item actuals availability
Today `actualsThrough` is a single timeline-wide index. Real actuals arrive
per-item and ragged (revenue known through Q3, headcount through Q4). We keep
`actualsThrough` as the *default* cutover for display/backtest convenience but let
the actuals join be **per-item** (an item's actual coverage = the periods it has
rows for). `asOf` clamps to the min of the requested `t` and each item's coverage.
This is a `timeline-editing` spec modification (the cutover gains meaning) but not
a breaking type change — `actualsThrough` stays.

### 4. Metrics: report the triplet + bias, never a single number
Per handbook §3, `scoreForecast` returns `{ mae, rmse, mape, bias, n }` together.
MAPE skips periods where `actual == 0` (documented, counted in `n`) to avoid the
divide-by-zero blow-up; bias is mean signed error `mean(forecast − actual)` so its
sign is meaningful. Callers choose which to optimize; the object always carries
all four so a failure mode isn't hidden behind one metric.

### 5. Sensitivity composes over `computeModel`; no engine change
`sweepDriver(model, driverId, values[], outputItemId, {scenario})` runs
`computeModel` once per value and returns `{ value, output: number[] }[]`.
`tornado(model, outputItemId, {atPeriod, deltaPct})` perturbs each driver ±delta
one-at-a-time, ranks by |output change|. Scenario generation is a pure producer:
given `{driverId, values[]}[]` axes it yields the cartesian product as generated
`Scenario` objects (capped, with an explicit count guard so a 5×5×5 grid doesn't
silently explode). These are read-only analyses — they never mutate the stored
model.

### 6. Calibration: bounded grid + coordinate descent, output as a preview
`calibrate(model, driverIds, actuals, metric, {window, bounds})` searches driver
values to minimize the metric over an *in-sample* window: coarse grid over the
bounded range per driver, then coordinate-descent local refinement. It returns
`{ bestValues, inSampleScore, residuals, ranked misses }`. It **does not commit** —
it returns a candidate the caller applies through the existing `setAssumption`
`preview → accept` flow, and the residuals (largest systematic misses) are surfaced
as the "structural to-do list" the handbook §4 step 3 describes. The out-of-sample
gate (§4 step 4) is enforced at the *loop* level: `backtest` on the holdout must
improve or the change is overfitting.
*Alternative rejected:* gradient descent / autodiff — the formula graph isn't
differentiable cheaply and drivers are low-dimensional; a bounded grid is robust,
explainable, and cannot wander outside sane bounds (handbook's "beware
spurious precision" / fragility tells).

### 7. Adapters mirror core 1:1
API: `POST /models/:id/actuals` (+ CSV upload with column→item mapping),
`GET /models/:id/score`, `GET /models/:id/tornado`, `GET /models/:id/backtest`,
`GET /models/:id/walkforward`, `POST /models/:id/calibrate` (returns candidate,
honors `?preview`). MCP tools: `import_actuals`, `score_forecast`, `tornado`,
`run_backtest`, `walk_forward`, `calibrate` — descriptions prompt-tuned so Claude
treats the **out-of-sample** result as the referee, not the in-sample fit.

## Risks / Trade-offs

- **Look-ahead bias leaking through formulas** → the `asOf` guard rejects any
  read of a post-`t` period of an actuals-bearing item as a validation issue;
  backtests refuse to run if the guard trips. Tested explicitly.
- **Ragged / sparse actuals** → per-item coverage; metrics count `n` and skip
  nulls; a backtest over a period with no actual for the target item errors
  loudly rather than scoring against zero.
- **Calibration overfitting** (handbook's central warning) → fitting is always
  in-sample; the accept gate is out-of-sample backtest improvement; grid bounds
  cap parameter freedom; residual fragility (score collapses when a value is
  nudged) is reported so the caller can reject a brittle fit.
- **MAPE instability near zero** → documented skip + fall back to MAE/RMSE for
  near-zero series; never report MAPE alone.
- **Compute cost of walk-forward / grids** → many `computeModel` calls; mitigate
  with an explicit combination cap + `log`-style count in responses (no silent
  truncation), and keep analyses read-only so nothing persists mid-sweep.
- **`asOf` compute path divergence** → risk that vintage compute and normal
  compute drift; mitigate by making `asOf` a single option on the *same*
  `computeModel`, not a parallel code path, with a golden test that `asOf =
  periods-1` on an all-forecast model equals the normal compute.

## Migration Plan

- Additive only. New core files (`accuracy.ts`, `sensitivity.ts`, `backtest.ts`,
  `calibrate.ts`) and a compute option; no changes to existing model JSON on
  disk. The `actuals` table already exists — no new migration unless we add a
  `vintage`/`as_of` column (decide in Open Questions); if added, it's a forward
  migration with a nullable column, no backfill needed.
- Rollback: remove the new routes/tools and files; the engine and stored models
  are unchanged, so there is nothing to revert in user data.

## Open Questions

- Do we need a `vintage`/`as_of` column on `actuals` (to store *restated*
  values point-in-time), or is a single latest value per `(model,item,period)`
  enough for v1? Leaning: single value for v1 (simpler; restatement handling is a
  later refinement), and document it as a known limitation vs. true point-in-time
  data.
- Should `tornado` rank by impact on a single output at a single period, or by an
  aggregate (e.g. NPV of the series)? Leaning: default to a caller-supplied
  `atPeriod`, allow an aggregate mode later.
- Where does the improvement-loop *orchestration* live — a core helper that runs
  sweep→backtest→calibrate→re-backtest, or is it left to the MCP agent to
  sequence the primitives? Leaning: ship the primitives first; a thin
  `improveLoop` helper can follow once the tools prove out.
