## 1. Layer 1 — Forecast-accuracy metrics (core, quick win)

- [x] 1.1 Add `packages/core/src/accuracy.ts` with pure `mae`, `rmse`, `mape`, `bias` over `(actual, forecast)` arrays; MAPE skips zero actuals and counts scored periods; bias is `mean(forecast − actual)`
- [x] 1.2 Add `scoreForecast(model, itemId, actuals, {scenario})` returning `{ mae, rmse, mape, bias, n }` (read-only, uses existing `computeModel`)
- [x] 1.3 Export the new functions from `packages/core/src/index.ts`
- [x] 1.4 Unit tests in `packages/core/src/accuracy.test.ts` covering the metric math, MAPE zero-skip, bias sign, and equal-length guards
- [x] 1.5 API: `GET /models/:id/score?item=&scenario=` in `models_controller.ts` + route
- [x] 1.6 MCP: `score_forecast` tool wrapping the API; description states it returns the full metric set
- [x] 1.7 `pnpm --filter @greenthumb/core build` + `pnpm typecheck` green

## 2. Layer 2 — Sensitivity analysis (core, quick win)

- [x] 2.1 Add `packages/core/src/sensitivity.ts`: `sweepDriver(model, driverId, values, outputItemId, {scenario})` → `{ value, output }[]` (read-only)
- [x] 2.2 `tornado(model, outputItemId, {atPeriod, deltaPct, scenario})` → drivers ranked by |output change|
- [x] 2.3 `generateScenarios(axes)` (cartesian product of driver-value axes) with an explicit combination cap that reports overflow instead of truncating
- [x] 2.4 Export from `index.ts`; unit tests in `sensitivity.test.ts` (sweep shape, tornado ordering, grid cap overflow)
- [x] 2.5 API routes: `GET /models/:id/tornado`, `GET /models/:id/sweep`; MCP tool `tornado`
- [x] 2.6 `pnpm --filter @greenthumb/core test` + `pnpm typecheck` green

## 3. Layer 3 — First-class actuals + basic backtest

- [x] 3.1 Wire the existing `actuals` table: read/write helpers in an API service (adapter owns SQLite; core stays pure)
- [x] 3.2 API: `POST /models/:id/actuals` (upsert on `(model,item,period)`) with provenance `source`
- [x] 3.3 API: CSV import endpoint with column→item mapping; report unmapped/unparsable columns instead of dropping silently
- [x] 3.4 API: forecast-vs-actual join read `GET /models/:id/forecast-actual?item=` → per-period `{ forecast, actual, residual }`
- [x] 3.5 Core: `backtest(model, itemId, actuals, {window})` → per-period residuals + metric set; errors loudly when the target item has no actuals in the window
- [x] 3.6 API `GET /models/:id/backtest` loads actuals from SQLite and calls core `backtest`
- [x] 3.7 MCP tools `import_actuals` and `run_backtest`
- [x] 3.8 Tests: `backtest.test.ts` (residuals + metrics, no-actuals error); API functional test for actuals ingest + backtest round-trip

## 4. Layer 4 — Point-in-time compute + walk-forward + holdout

- [x] 4.1 Core: add an `asOf: t` option to the compute path (single implementation, not a parallel one): substitute actuals for periods ≤ t, forecast t+1…, forbid reads of post-t periods of actuals-bearing items
- [x] 4.2 Core: surface a look-ahead-bias `ValidationIssue` when a formula reads past the as-of cutover; backtests refuse to run when it trips
- [x] 4.3 Golden test: `asOf = periods-1` on an all-forecast model equals ordinary `computeModel`
- [x] 4.4 Core: per-item actuals coverage; `asOf` clamps to `min(requested t, item coverage)`; `actualsThrough` as default cutover
- [x] 4.5 Core: out-of-sample holdout split — `backtest` reports in-sample and holdout metric sets separately
- [x] 4.6 Core: `walkForward(model, itemId, actuals, {window: 'anchored'|'rolling', step})` → ordered out-of-sample verdicts, each honoring the look-ahead guard
- [x] 4.7 Tests: `asof`/`walkforward` tests (frozen-history correctness, look-ahead rejection, anchored vs rolling, per-item ragged coverage)
- [x] 4.8 API `GET /models/:id/walkforward` + MCP `walk_forward`

## 5. Layer 5 — Calibration + improvement-loop gate

- [x] 5.1 Core: `calibrate(model, driverIds, actuals, metric, {window, bounds})` — bounded grid + coordinate-descent refinement over the in-sample window; values clamp to bounds; no gradient/unbounded search
- [x] 5.2 Core: return best-fit values, in-sample score, per-period residuals, and a ranked list of largest systematic misses
- [x] 5.3 Core: signal "structural fix likely needed" when no in-bounds setting reaches the acceptable-error threshold
- [x] 5.4 Core: calibration returns a candidate only (no auto-commit); document the out-of-sample gate (accepted change must lower holdout error on re-backtest)
- [x] 5.5 API `POST /models/:id/calibrate` (honors `?preview`); returns candidate applied via existing `setAssumption` preview/accept flow
- [x] 5.6 MCP `calibrate` tool; prompt-tune descriptions of `run_backtest`/`walk_forward`/`calibrate` so Claude treats the out-of-sample result as the referee
- [x] 5.7 Tests: `calibrate.test.ts` (bounded fit, clamp at bound, no-fit→structural signal, candidate-not-committed); integration test of the loop sweep→backtest→calibrate→re-backtest

## 6. Documentation & wiring

- [x] 6.1 Update `docs/Roadmap.md` to reflect backtesting/accuracy/calibration as first-class (currently absent)
- [x] 6.2 Note the trust-boundary/local-first posture is unchanged (analysis is read-only; actuals stay local in SQLite)
- [x] 6.3 `pnpm typecheck` across all workspaces green; core test suite green; API functional tests green
- [x] 6.4 (Deferred) web UI surface — backtest forecast-vs-actual chart, tornado chart, calibration diff — captured as a tracked follow-up in `docs/Roadmap.md` §2.1a (propose with `/opsx:propose` when MCP ergonomics have been exercised)
