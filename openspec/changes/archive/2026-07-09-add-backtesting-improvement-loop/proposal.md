## Why

greenthumb is a deterministic forward calculator: drivers → formulas → outputs,
with hand-authored scenario overlays and structural validation. The financial
modeling handbook (`docs/references/financial_modeling_handbook/`) makes the
*craft* of modeling — §3 backtesting and §4 the scenario-driven improvement loop
— the thing that turns a plausible-looking model into a trustworthy one. Today
that entire layer is missing: there is no way to store observed actuals as
first-class data, no forecast-vs-actual comparison, no accuracy metric, no
sensitivity sweep, no backtest, and no calibration. "Iterate to improve"
currently means "edit until validation passes and the projected numbers look
right" — with no quantitative accuracy signal to optimize against, for either a
human or the MCP agent. The `Timeline.actualsThrough` cutover index and the
`actuals` SQLite table are scaffolded but inert. This change adds the feedback
channel from reality that the handbook is built around.

## What Changes

Everything lands in `packages/core` first (pure, no I/O), then is exposed
through the API and MCP adapters — never duplicated in an adapter.

- **Forecast-accuracy metrics** — pure `mae/rmse/mape/bias(actual[], forecast[])`
  functions and a `scoreForecast(model, itemId, actuals)` that scores a computed
  series against an actuals series. The objective function everything else uses.
- **First-class actuals** — wire the dormant `actuals` table into an ingestion
  path (`POST /models/:id/actuals`, CSV import with column→item mapping), a
  read/join against forecast, and honor `Timeline.actualsThrough` as the
  forecast cutover. Add **point-in-time / vintage** support so knowledge can be
  frozen as of a past period and re-forecast forward (the precondition for
  honest walk-forward testing).
- **Sensitivity analysis** — `sweepDriver` (one driver across a range),
  `tornado` (rank all drivers by output impact), and programmatic
  **scenario generation** (parameter grids) over the existing engine. Handbook
  §4 step 1: find what actually moves the answer.
- **Backtesting** — `backtest` (forecast vs. stored actuals over the cutover),
  an **out-of-sample holdout split**, and **walk-forward** (anchored and rolling
  windows) producing many independent out-of-sample verdicts. Guards against
  look-ahead bias by construction (a vintage forecast may only read data known
  as of its as-of period).
- **Model calibration** — `calibrate(model, driverIds, actuals, metric)` fits
  drivers to history under a chosen metric and reports residuals as a ranked
  to-do list of likely structural fixes, with the improvement loop **gated on
  out-of-sample error falling** (in-sample fit is never the referee).
- **Adapters** — new MCP tools (`score_forecast`, `import_actuals`,
  `run_backtest`, `walk_forward`, `tornado`, `calibrate`) and matching API
  routes, so both a human (via the UI, in a later phase) and Claude can run the
  full loop: sweep → generate scenarios → backtest → score → read residuals →
  apply a structural change → re-validate out-of-sample.

**Layer order (ship value early):** accuracy metrics + sensitivity are quick
wins with no new data model; actuals ingestion + basic backtest come next;
walk-forward + calibration (the point-in-time work) is the hard, differentiating
finale.

## Capabilities

### New Capabilities
- `forecast-accuracy`: metrics (MAE, RMSE, MAPE, mean signed bias) and a
  forecast-vs-actual scoring operation over a model's computed series.
- `model-actuals`: first-class storage, CSV ingestion, and forecast-vs-actual
  join for observed historical values, including point-in-time / vintage
  freezing keyed to the timeline cutover.
- `sensitivity-analysis`: single-driver sweeps, tornado ranking of drivers by
  output impact, and programmatic scenario/parameter-grid generation.
- `backtesting`: out-of-sample holdout split and walk-forward (anchored and
  rolling) evaluation of forecast against actuals, with look-ahead-bias guards.
- `model-calibration`: fitting drivers to historical actuals under a scoring
  metric, residual reporting, and the improvement-loop gate on out-of-sample
  accuracy.

### Modified Capabilities
- `timeline-editing`: `actualsThrough` becomes a load-bearing forecast cutover
  (read by backtest/calibration and the actuals join) rather than only a display
  marker; the as-of/vintage concept extends the timeline's point-in-time meaning.

## Impact

- **`packages/core`** (source of truth, changes first): new `accuracy.ts`,
  `sensitivity.ts`, `backtest.ts`, `calibrate.ts`; new operations that read
  actuals; possible `Timeline`/vintage type additions. No change to the
  A = L + E balance identity or the validate-on-write contract — these are
  read/analysis operations plus one new data ingress; they do not mutate the
  model graph except calibration, which proposes driver values through the
  existing preview/accept flow.
- **`apps/api`**: wire the existing `actuals` table + `Actual` model (currently
  unused); new analysis + ingestion routes; CSV upload handling.
- **`packages/mcp`**: new tools listed above, prompt-tuned so Claude runs the
  loop with the out-of-sample result as the referee.
- **`apps/web`**: a later phase adds the human surface (backtest forecast-vs-
  actual view, tornado chart, calibration diff); not required for the core loop
  to work through MCP.
- **Non-goals**: not rebuilding Excel or a general econometrics/stats package
  (PRD §3); **Monte Carlo / distribution sampling is out of scope here** and
  stays deferred (Roadmap §3, V2) — this change is the deterministic
  backtest-and-calibrate loop only; no data connectors (QuickBooks/Stripe) —
  actuals arrive via CSV/API for now; the web UI surface is deferred to a
  follow-up phase.
