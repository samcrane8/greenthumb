## Context

The formula evaluator (`packages/core/src/formula.ts`) dispatches functions in
`evalCall` by name; window functions (`cumulative`, `rolling`) loop over periods and
re-evaluate their argument AST at each period via `at(node, p)`. Unknown names throw
`FormulaError('Unknown function …')` at eval time (line ~476). `EvalContext` exposes
`resolve(name, period)` and `periods`.

`validateModel` (`validation.ts`) parses each formula (`parse`) and checks referenced
item/driver **names** (`referencedNames`) for dangling refs — but it never inspects
**function** names, and the parser accepts any call syntax. So `correl(x, y)` parses,
its refs resolve, validation passes, and the model 500s at compute. The existing
`formula-primitives` spec already requires unknown functions to fail validation
(scenario "unknown functions still fail validation"); the implementation never
honored it. This change adds the statistics functions and closes that gap.

## Goals / Non-Goals

**Goals:** make the assessment's Bitcoin-vs-liquidity statistics expressible as
formula items; make `validate` reject unknown functions with a located issue. Core
only; adapters inherit.

**Non-Goals:** new data (FRED §7.2), new chart types (§7.4), export (§7.3), a full
stats package (no p-values, multiple regression, ARIMA).

## Decisions

### Two-series stats fit the existing window loop
`correl`/`cov`/`beta`/`slope`/`intercept`/`r2` evaluate **both** argument ASTs across
the window (`at(args[0], p)`, `at(args[1], p)`), collect paired observations, and
reduce. This is the same mechanism as `rolling`, just with two series and a
statistical reducer instead of a sum. No new evaluator machinery — just new
`evalCall` cases.

### Windowing: expanding by default, trailing window optional
A bare `stdev(x)` / `correl(x, y)` is **expanding** over `0..period` (like
`cumulative`); an optional trailing integer `window` makes it a trailing window (like
`rolling`, `max(0, period-window+1)..period`). This matches existing precedent and
lets `correl(a, b)` mean "correlation to date" while `correl(a, b, 26)` means
"trailing 26." Fewer than two observations → 0.

### Argument order: dependent-first for regression, symmetric for correlation
`correl(x, y)` / `cov(x, y)` are symmetric. `beta(y, x)`, `slope(y, x)`,
`intercept(y, x)`, `r2(y, x)` take the **dependent** series first, **independent**
second (standard regression convention: y ~ x). `beta` ≡ `slope` ≡ cov(y,x)/var(x);
`r2` ≡ correl(y,x)². Documented in the function help.

### Lead/lag by composition, not a new parameter
Reuse the existing `lag(x, k)`: `correl(btc_ret, lag(m2, 4), 26)`. Keeps the surface
small and orthogonal; no per-function `lag` arg to specify or validate.

### Annualization via `periods_per_year()`, not a magic `annualize()`
Add an optional `periodsPerYear?: number` to `EvalContext`, derived by the engine
from the timeline granularity (monthly→12, quarterly→4, annual→1; weekly→52 if/when
weekly exists). Expose it as a nullary `periods_per_year()`. Annualization stays
explicit and correct per quantity type — vol scales by `sqrt(ppy)`, mean return by
`ppy` — rather than hiding a √ inside an ambiguous `annualize()`.
- *Alternative rejected — `annualize(x)`:* ambiguous (returns vs. vol scale
  differently); composition is clearer and teaches the math.

### Validation resolves function names (the honesty fix)
Export from `formula.ts`: `KNOWN_FUNCTIONS: ReadonlySet<string>` (single source of
truth, also used by `evalCall`'s dispatch so they can't drift) and
`referencedFunctions(node): string[]` (walk the AST collecting `call` node names).
In `validation.ts`, after `parse`, emit an `UNKNOWN_FUNCTION` issue for any
referenced function not in `KNOWN_FUNCTIONS`. Keep arity out of scope for now (the
assessment's finding is name resolution); `requireArgs` still guards arity at eval.
- To prevent drift, derive `evalCall` dispatch and `KNOWN_FUNCTIONS` from one list
  where practical, or add a test asserting every `KNOWN_FUNCTIONS` entry evaluates
  and every `evalCall` case is listed.

## Risks / Trade-offs

- [Numerical convention: sample vs. population variance] → Use **sample** (n−1) for
  `var`/`stdev`/`cov`, standard for finance; `beta`/`correl`/`r2` are ratio-invariant
  to the choice. Document it.
- [The new validation rule fails models that previously "passed"] → Intended — those
  models were broken (would 500 at compute). It's a correctness improvement; the
  existing preview/override flow still lets a user force a write if needed.
- [`KNOWN_FUNCTIONS` drifting from `evalCall`] → Single-source the list and add a
  guard test (every listed function evaluates; every case is listed).
- [Expanding-window cost on long horizons] → Same O(period) as `cumulative`, already
  in use; acceptable for model sizes here.

## Migration Plan

- Purely additive to the grammar; all existing formulas parse and compute
  identically. Rebuild core (`pnpm --filter @greenthumb/core build`) before the API.
- The only behavioral break is validation newly rejecting unknown-function models —
  no data migration; surfaces as a clear issue.
- Rollback: revert the change; no persisted state depends on it.
