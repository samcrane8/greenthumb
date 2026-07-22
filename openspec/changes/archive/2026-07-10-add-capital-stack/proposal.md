## Why

A levered company — a Bitcoin treasury above all — is only understandable through
its **whole capital stack**: senior debt, convertible notes, preferred equity, and
common all have different seniority, cost, and claims on the same assets. Today
greenthumb encodes that structure *implicitly* in ad-hoc formulas: the
`bitcoin_treasury` template hand-writes `senior_debt = debt_notional +
convertible_debt * (1 - convert_as_equity)` and `nav_to_common = reserve + cash +
other_holdings − senior_debt − preferred_notional`. The seniority ordering lives
only in the order of a subtraction; there is no object you can inspect, no waterfall,
no coverage ratio, no per-tranche recovery, no blended cost of capital. You can't ask
"who gets wiped out first in a 60% drawdown?" without re-deriving it by hand.

This change makes the capital stack **first-class**: a stored, ranked set of tranches
with a real **seniority-waterfall analysis**. It reuses the engine rather than
duplicating it — a tranche *references* an existing model series for its notional and
rate (the same overlay pattern as charts), so the structure is a semantic layer on top
of the numbers the model already computes. Analysis derives, per period, the waterfall
against asset value, coverage ratios, residual value to common (and per share), blended
cost of capital, and dilution from in-the-money converts.

Per the architecture rule this lands in `packages/core` first (pure data + pure
analysis), then the API/MCP adapters, then a web Capital Stack view. The
`bitcoin_treasury` template ships a default stack over its existing series, turning its
levered-residual story into an inspectable structure.

## What Changes

- **Capital stack on the model (core)** — an optional `capitalStack: { assetRefs,
  tranches }` on `Model`. A `Tranche` has a name, `kind` (`senior_debt` |
  `subordinated_debt` | `convertible` | `preferred` | `common`), a **seniority** rank,
  a `notionalRef` (name of a model series for its claim/period), an optional coupon/
  dividend `rate`/`rateRef`, and — for common/converts — a `sharesRef` plus conversion
  terms. `assetRefs` names the value series the claims run against (e.g. reserve + cash).
- **Waterfall analysis (core)** — `analyzeCapitalStack(model, scenario)` returns, per
  period: total asset value; each tranche's claim, amount paid, recovery %, and
  cumulative claims-ahead; **coverage ratio** per tranche; **residual to common** and
  **NAV per share**; **blended cost of capital**; **implied leverage**; and dilution
  from in-the-money convertibles. Pure — no engine change; it reads computed series.
- **Validate-on-write ops (core)** — add/update/remove tranche, set the stack's
  `assetRefs`. Validation: every ref resolves, tranche ids/seniority are sane, at most
  one residual (common) tranche.
- **Adapters** — API routes under `/models/:id/capital-stack` (tranche CRUD + assets)
  plus a derived read `/capital-stack/analysis?scenario=`; MCP tools to build and read
  the stack; a web **Capital Stack** view rendering the ranked waterfall (claims vs.
  asset value, coverage, residual-to-common per share).
- **Treasury default stack** — the `bitcoin_treasury` template emits a default
  `capitalStack` referencing its `senior_debt`, `preferred_notional`, reserve/cash, and
  common-share series, so a fresh model has an inspectable stack whose residual-to-common
  ties out to the existing `nav_to_common`.

## Capabilities

### New Capabilities
- `capital-stack`: Store a company's full capital structure as ranked tranches and
  analyze it — seniority waterfall, coverage, residual-to-common (NAV/share), blended
  cost of capital, and convert dilution — as a pure overlay over existing model series,
  exposed through the API, MCP, and a web view, with the treasury template shipping a
  default stack.

### Modified Capabilities
<!-- None. The treasury default-stack is specified as a requirement of the new
     capital-stack capability (additive template behavior), so no existing
     bitcoin-treasury-template requirement changes — avoiding overlap with the
     in-flight treasury-fidelity change. -->

## Impact

- **Core (first):** `types.ts` (`CapitalStack`, `Tranche`, `TrancheKind` +
  optional `capitalStack` on `Model`); a new `capitalstack.ts` (analysis); `operations.ts`
  (tranche/assets ops → `OpResult`); `validation.ts` (ref/seniority integrity);
  `templates.ts` (treasury default stack); `index.ts` exports.
- **API:** `/models/:id/capital-stack` CRUD + `/capital-stack/analysis` read via
  `EditsController.#apply` + a controller read.
- **MCP:** `set_capital_stack` / `add_tranche` / `remove_tranche` / `get_capital_stack_analysis` tools.
- **Web:** a Capital Stack panel/view (ranked tranche table + waterfall + residual-to-common).
- **Integrity:** the stack is an overlay; existing `A = L + E` and costs-negative rules
  are unchanged. New validation only fires when a `capitalStack` is present. The
  analysis is derived, never stored.

## Non-goals

- **Not rebuilding Excel** (PRD §3): a semantic capital structure, not a cap-table grid.
- **No new solver.** The waterfall is a deterministic priority distribution over series
  the engine already computes; `computeModel` is unchanged and does no waterfall.
- **No option-pricing of convertibles.** Converts use a simple in-the-money / face-value
  treatment (a `convertAsEquity` toggle), not Black-Scholes; full convert valuation is
  a later capability.
- **No new balance-sheet enforcement.** The stack does not replace `A = L + E`; it is an
  analytical overlay that can *cross-check* residual-to-common, not a second ledger.
- **No multi-class waterfall beyond one residual.** Multiple preferred/debt tranches are
  supported; a single common (residual) class is assumed in v1.
