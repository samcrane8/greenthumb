## 1. Engine — the function registry + validation honesty (do first)

- [x] 1.1 In `packages/core/src/formula.ts`, define a single-source `KNOWN_FUNCTIONS: ReadonlySet<string>` covering every `evalCall` built-in, and export it.
- [x] 1.2 Add `referencedFunctions(node: Node): string[]` (walk the AST, collect `call` node names, dedup) and export it.
- [x] 1.3 In `packages/core/src/validation.ts`, after `parse`, emit an `UNKNOWN_FUNCTION` issue for each referenced function not in `KNOWN_FUNCTIONS` (include the function name + item; position if available).
- [x] 1.4 Add an `UNKNOWN_FUNCTION` code to the issue/validation types if not present.
- [x] 1.5 Guard test: every `KNOWN_FUNCTIONS` entry is dispatchable in `evalCall` and vice-versa (no drift).

## 2. Engine — annualization context

- [x] 2.1 Add optional `periodsPerYear?: number` to `EvalContext` in `formula.ts`; add a `periods_per_year()` nullary in `evalCall` returning it (default sensibly, e.g. 1, if absent).
- [x] 2.2 In `packages/core/src/engine.ts`, derive `periodsPerYear` from the timeline granularity (monthly→12, quarterly→4, annual→1) and pass it into the eval context.

## 3. Engine — statistical & time-series functions

- [x] 3.1 Returns: `logret(x)` (= `ln(x/prior(x))`, 0 if prior ≤ 0) and `pct_change(x)` (alias of `growth`).
- [x] 3.2 Single-series dispersion with optional trailing window (expanding default): `stdev(x[,w])`, `var(x[,w])` (sample, n−1), `zscore(x[,w])`.
- [x] 3.3 `drawdown(x)` = `x/running_max(x, 0..period) − 1` (≤ 0).
- [x] 3.4 Two-series association with optional window: `cov(x,y[,w])` (sample), `correl(x,y[,w])` (Pearson, clamp to [-1,1]), `beta(y,x[,w])` (cov/var).
- [x] 3.5 Regression (dependent-first) with optional window: `slope(y,x[,w])` (= beta), `intercept(y,x[,w])`, `r2(y,x[,w])` (= correl²).
- [x] 3.6 All new functions: expanding when no window; trailing window when given; <2 obs → 0; non-finite → 0 (reuse `finite`). Register every name in `KNOWN_FUNCTIONS`.

## 4. Tests

- [x] 4.1 Golden tests per function vs. hand-computed values on a small fixed series (logret, stdev/var, cov/correl/beta, slope/intercept/r2, zscore, drawdown, periods_per_year).
- [x] 4.2 Windowing: expanding vs. trailing-window results differ as expected; identical series → correl 1; flat series → stdev 0, drawdown 0.
- [x] 4.3 Lead/lag composition: `correl(a, lag(b, k), w)` matches a shifted-series reference computation.
- [x] 4.4 Degenerate inputs return 0 (no NaN/Infinity) and the model still converges.
- [x] 4.5 Validation: a model with `frobnicate(x)` / mistyped `correll(...)` fails with `UNKNOWN_FUNCTION`; a model with valid `correl(a,b,26)` passes and computes (the assessment's exact failure, now caught at validate).
- [x] 4.6 Rebuild core (`pnpm --filter @greenthumb/core build`) and run `pnpm --filter @greenthumb/core test`.

## 5. Docs / surface

- [x] 5.1 Enumerate the new functions wherever built-ins are documented (formula help / any `describe_schema` / MCP tool description that lists primitives), including the windowing convention, argument order (dependent-first regression), and the lag-composition pattern.

## 6. Verify

- [x] 6.1 `pnpm typecheck` across workspaces.
- [x] 6.2 Run core tests and `apps/api` functional tests (validation change flows through the API).
- [x] 6.3 End-to-end acceptance: build a scratch model with two series drivers and formula items reproducing the assessment's study — weekly `logret`, `correl(a,b,26)`, `beta(y,x,26)`, `stdev(logret)*sqrt(periods_per_year())`, `drawdown` — confirm they validate and compute (via API `get_output`/`get_chart_data`), i.e. the exact case that previously returned `Unknown function 'correl()'` now works.
