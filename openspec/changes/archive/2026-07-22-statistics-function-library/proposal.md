## Why

Per the [2026-07-22 analysis-engine assessment](../../../docs/assessments/2026-07-22-analysis-engine-assessment.md)
(Roadmap §7.0–§7.1), greenthumb can *host* an empirical analysis but can't *compute*
one: the formula language has no statistical/time-series functions, so every
descriptive statistic in the Bitcoin-vs-liquidity study (log returns, rolling
correlation, rolling beta, annualized vol, drawdown, a lead/lag regression) had to
be done in Python. And `validate_model` gives false confidence — it passes a model
containing `correl()` ("0 issues") which then **500s at compute** with
`Unknown function 'correl()'`, because validation never resolves function names
against the evaluator. This change closes both: a statistics function library, and a
validator that knows which functions exist.

## What Changes

- Add statistical / time-series functions to the formula language
  (`packages/core/src/formula.ts`), built on the existing window pattern
  (`cumulative`/`rolling` already re-evaluate their argument AST across periods):
  - **Returns:** `logret(x)`, `pct_change(x)` (alias of `growth`).
  - **Dispersion (single series, optional trailing window):** `stdev(x[,w])`,
    `var(x[,w])`, `zscore(x[,w])`, `drawdown(x)` (peak-to-current, ≤ 0).
  - **Association (two series, optional window):** `cov(x,y[,w])`,
    `correl(x,y[,w])`, `beta(y,x[,w])`.
  - **Regression (two series, optional window):** `slope(y,x[,w])`,
    `intercept(y,x[,w])`, `r2(y,x[,w])`.
  - **Annualization:** a `periods_per_year()` nullary (reads the timeline
    granularity) so vol/return annualization is composable, e.g.
    `stdev(logret(p)) * sqrt(periods_per_year())`.
  - Lead/lag reuses the existing `lag(x,k)` — e.g. `correl(btc_ret, lag(m2,4), 26)`
    — so no new lag argument is introduced.
- **Windowing convention:** a bare stat is **expanding** (all periods `0..current`,
  matching `cumulative`); pass a trailing `window` to make it rolling (matching
  `rolling`). Windows with < 2 samples return 0. All results follow the engine's
  existing **non-finite → 0** convention (no throws on domain edges).
- **BREAKING (validation contract, in the honest direction):** `validate_model`
  now resolves every formula's function calls against the evaluator's registry and
  emits an `UNKNOWN_FUNCTION` issue for any it can't. A model that referenced a
  non-existent function used to pass validation and then fail at compute; it now
  fails validation with a clear, located issue. "Valid" means "will compute."

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `formula-primitives`: the formula language gains a statistics/time-series function
  family, and validation resolves function names (rejecting unknown functions)
  instead of only checking arithmetic/structural coherence.

## Impact

- **Layer (core only):** `packages/core/src/formula.ts` (new `evalCall` cases, a
  small `periodsPerYear` on `EvalContext`, and an exported `KNOWN_FUNCTIONS` set +
  `referencedFunctions(expression)` helper); `packages/core/src/validation.ts`
  (resolve function names → `UNKNOWN_FUNCTION`); `packages/core/src/engine.ts` (pass
  `periodsPerYear` derived from timeline granularity into the eval context). The API
  and MCP inherit automatically — no adapter changes, no new endpoints.
- **Integrity:** additive to the formula grammar; every existing formula still
  parses and computes identically. The new validation rule can newly *fail* models
  that were silently broken — that is the intended correctness improvement. Balance/
  tie-out invariants are untouched.
- **Docs:** the `list_formula_primitives` / schema-describing surface (if any) and
  the formula help should enumerate the new functions.

## Non-goals

- **No new data** — this is compute only. Sourcing macro series (FRED) is Roadmap
  §7.2, a separate change; sourcing/OHLCV/resampling is §7.4.
- **No new chart types** (scatter+regression, rolling-correlation study, heatmap)
  — Roadmap §7.4; this change makes the *series* computable, which those would plot.
- **No document export** (§7.3).
- Not a full stats package — scope is the functions the assessment's study actually
  needed, plus the obvious neighbors. No p-values, multiple regression, or ARIMA.
- Not rebuilding Excel (PRD §3): these are engine primitives, not a spreadsheet.
