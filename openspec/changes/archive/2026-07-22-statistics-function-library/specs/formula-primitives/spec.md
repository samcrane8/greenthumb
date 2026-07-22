## ADDED Requirements

### Requirement: Statistical and time-series functions

The formula language SHALL provide statistical and time-series functions so that
descriptive-statistics analyses (returns, dispersion, association, regression,
drawdown) are expressible as formula items and computed by the engine — not only
pro-forma arithmetic. These functions build on the existing period-window model
(`cumulative`/`rolling` re-evaluate their argument AST across periods) and MUST
provide, at minimum:

- **Returns:** `logret(x)` (natural log return vs. the prior period) and
  `pct_change(x)` (an alias of `growth`).
- **Dispersion (single series):** `stdev(x[, window])`, `var(x[, window])`,
  `zscore(x[, window])`, and `drawdown(x)` (current value relative to the running
  peak over history, ≤ 0).
- **Association (two series):** `cov(x, y[, window])`, `correl(x, y[, window])`,
  and `beta(y, x[, window])`.
- **Regression (two series, dependent first):** `slope(y, x[, window])`,
  `intercept(y, x[, window])`, and `r2(y, x[, window])`.
- **Annualization support:** a `periods_per_year()` value derived from the
  timeline granularity, so annualized figures are composable (e.g.
  `stdev(logret(p)) * sqrt(periods_per_year())`).

Windowing SHALL follow the existing convention: a stat with no `window` argument is
**expanding** (all periods `0..current`, like `cumulative`); a trailing `window`
argument makes it a trailing window (like `rolling`). A window with fewer than two
usable observations SHALL return 0. Lead/lag relationships SHALL be expressed by
composing with the existing `lag(x, k)` (e.g. `correl(a, lag(b, 4), 26)`), not a
separate lag parameter. All results SHALL obey the engine's non-finite→0 convention
(no throws on domain edges: zero-variance denominators, empty windows, non-positive
inputs to `logret`).

#### Scenario: log returns and annualized volatility
- **WHEN** an item is `stdev(logret(price)) * sqrt(periods_per_year())` over a price series
- **THEN** the engine computes a finite annualized-volatility series, and a flat price series yields 0

#### Scenario: rolling correlation over a window
- **WHEN** an item is `correl(a, b, 26)` for two series `a` and `b`
- **THEN** each period equals the Pearson correlation of the trailing 26 observations (bounded in [-1, 1]), and identical series yield 1

#### Scenario: rolling beta and regression fit
- **WHEN** items compute `beta(y, x, 26)`, `slope(y, x, 26)`, and `r2(y, x, 26)`
- **THEN** `beta` equals `slope` (cov/var), `r2` equals `correl(y, x, 26)` squared and lies in [0, 1], each defined every period

#### Scenario: drawdown from the running peak
- **WHEN** an item is `drawdown(price)`
- **THEN** each period is `price/running_max − 1` (≤ 0), 0 at a new all-time high and negative below a prior peak

#### Scenario: lead/lag via composition
- **WHEN** an item is `correl(btc_ret, lag(m2_growth, 4), 26)`
- **THEN** it computes the trailing-26 correlation of BTC returns against M2 growth lagged 4 periods, reusing the existing `lag`

#### Scenario: degenerate windows do not throw
- **WHEN** a statistical function is evaluated with fewer than two observations or a zero-variance denominator
- **THEN** it returns 0 rather than NaN/Infinity, and the model still reports `converged === true`

## MODIFIED Requirements

### Requirement: New built-ins preserve engine guarantees

The new built-ins SHALL be pure, period-local (or period-window), and total (never
throwing on domain edge cases), so that dependency ordering, the iterative solver,
and validate-on-write behavior are unchanged. Window/statistical functions that
re-evaluate their arguments across periods MUST collapse non-finite results to 0,
matching the divide-by-zero convention. Validation SHALL resolve every formula's
**function-call names** against the evaluator's registry of built-ins and MUST emit
an `UNKNOWN_FUNCTION` error for any call whose name is not a built-in — so that a
model referencing a non-existent function is rejected at validation time, not
silently passed and then failed at compute. "Valid" means "will compute."

#### Scenario: primitives compose with prior-period recursion
- **WHEN** an item uses `prior(x) * exp(rate)` across the timeline
- **THEN** the engine computes the series and reports `converged === true`

#### Scenario: unknown functions fail validation, not compute
- **WHEN** a formula references a function that is not a built-in (e.g. `frobnicate(x)` or a mistyped `correll(x, y)`)
- **THEN** `validateModel` reports an `UNKNOWN_FUNCTION` error (naming the function) and the write is rejected unless overridden — rather than passing validation and raising `Unknown function` only at compute time

#### Scenario: known statistical functions pass validation and compute
- **WHEN** a model uses `correl(a, b, 26)` and `beta(y, x)` with resolvable references
- **THEN** `validateModel` reports no unknown-function issue and the model computes those series
