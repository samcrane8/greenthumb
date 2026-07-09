## ADDED Requirements

### Requirement: Exponential and logarithmic built-ins

The formula language SHALL provide `exp(x)`, `ln(x)`, `sqrt(x)`, and `pow(base, exp)`
as built-in functions evaluated per period, so that continuous compounding and
logistic curves can be expressed declaratively in item and driver formulas.

#### Scenario: exp evaluates the natural exponential
- **WHEN** a formula `exp(0)` is evaluated
- **THEN** the result is `1`, and `exp(1)` is within `1e-9` of Euler's number

#### Scenario: ln and sqrt guard non-positive inputs
- **WHEN** a formula evaluates `ln(0)`, `ln(-5)`, or `sqrt(-4)`
- **THEN** the evaluator returns `0` rather than `NaN`, `-Infinity`, or throwing, consistent with the existing divide-by-zero convention

#### Scenario: pow matches the caret operator
- **WHEN** `pow(2, 10)` and `2 ^ 10` are each evaluated
- **THEN** both return `1024`

### Requirement: Rounding and clamping built-ins

The formula language SHALL provide `round(x)`, `floor(x)`, and `clamp(x, lo, hi)`
so formulas can bound values (e.g. cap an issuance amount at available headroom).

#### Scenario: clamp bounds a value into range
- **WHEN** `clamp(150, 0, 100)`, `clamp(-10, 0, 100)`, and `clamp(50, 0, 100)` are evaluated
- **THEN** the results are `100`, `0`, and `50` respectively

#### Scenario: round and floor behave conventionally
- **WHEN** `round(2.5)` and `floor(2.9)` are evaluated
- **THEN** the results are `3` and `2`

### Requirement: Logistic and S-curve helpers

The formula language SHALL provide `logistic(x, k, x0)` returning the standard
logistic function `1 / (1 + exp(-k * (x - x0)))`, and `scurve(t, start, peak, ramp)`
returning a start-to-peak ramp shaped by a logistic over `ramp` periods, so that
capital-raise ramps and mean-reversion are expressible without imperative code.

#### Scenario: logistic is centered and bounded
- **WHEN** `logistic(x0, k, x0)` is evaluated for any `k` and `x0`
- **THEN** the result is `0.5`, and the function stays within the open interval `(0, 1)` for all finite inputs

#### Scenario: scurve ramps from start toward peak
- **WHEN** `scurve(t, start, peak, ramp)` is evaluated at `t = 0` and at `t` well beyond `ramp`
- **THEN** the early value is near `start` and the late value approaches `peak`, monotonically increasing for `peak > start`

### Requirement: New built-ins preserve engine guarantees

The new built-ins SHALL be pure, period-local, and total (never throwing on domain
edge cases), so that dependency ordering, the iterative solver, and validate-on-write
behavior are unchanged. Referencing an unknown function name MUST still raise a
`FORMULA_SYNTAX`/unknown-function validation error.

#### Scenario: primitives compose with prior-period recursion
- **WHEN** an item uses `prior(x) * exp(rate)` across the timeline
- **THEN** the engine computes the series and reports `converged === true`

#### Scenario: unknown functions still fail validation
- **WHEN** a formula references a function that is not a built-in (e.g. `frobnicate(x)`)
- **THEN** validation reports an error and the write is rejected unless overridden
