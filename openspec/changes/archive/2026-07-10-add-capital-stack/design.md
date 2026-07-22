## Context

The `bitcoin_treasury` template already computes every number a capital-stack analysis
needs — `reserve`, `cash`, `other_holdings`, `senior_debt` (straight + non-equity
convert), `preferred_notional`, `common_shares` — but the *seniority* is implicit in a
single subtraction (`nav_to_common = assets − senior_debt − preferred_notional`). There
is no object to inspect, compare, or stress. greenthumb's engine is pure and
series-based; charts already showed the "reference a model series by name" overlay
pattern works and keeps the engine the single source of truth. This change applies that
pattern to capital structure.

## Goals / Non-Goals

**Goals:**
- A stored, ranked capital stack that any levered model can carry.
- A deterministic seniority waterfall + coverage / residual / blended-cost / dilution
  analysis, derived from series the engine already computes (no engine change).
- The treasury template ships a default stack whose residual ties out to `nav_to_common`.

**Non-Goals:** option-pricing converts, a second ledger, multi-class residual, a new
solver (see proposal).

## Decisions

### D1 — Tranches are an OVERLAY that references model series, not a copy of them
A `Tranche` holds seniority + kind metadata and a `notionalRef` (and optional
`rateRef`/`sharesRef`) naming an existing item/driver by name — never its own copy of
the numbers. `assetRefs` names the value series claims run against. Analysis resolves
each ref to its computed series (per scenario) and runs the waterfall. **Why:** the
notional is already driven by the model's issuance logic; copying it would fork the
source of truth and drift. Same pattern as `ChartSeries.ref`. **Alternative rejected:**
self-contained tranches with embedded series — standalone but duplicative and
desync-prone.

### D2 — The waterfall is a per-period priority distribution
For each period: `assetValue = Σ assetRefs`. Sort tranches by ascending `seniority`
(debt < preferred < common). Walk the ranks, paying each claim tranche `min(remaining,
claim)`; record `paid`, `recovery = paid/claim`, `shortfall`, and `claimsAhead`
(cumulative claim of all more-senior tranches). The **common** tranche is the residual:
`residualToCommon = max(0, assetValue − Σ senior+preferred claims)`. `navPerShare =
residualToCommon / commonShares`. **Coverage ratio** for a tranche = `assetValue /
(claimsAhead + claim)` (how many times over its claim, and everything ahead of it, is
covered). **Why:** this is the standard liquidation/claim waterfall; deterministic,
O(tranches) per period, and it exactly reproduces `nav_to_common` for the treasury,
giving a built-in cross-check test. **Alternative considered:** a going-concern cash
waterfall (coupon service order) — richer but needs a cash-flow model; deferred.

### D3 — Convertibles: a simple equity/debt toggle, not option pricing
A `convertible` tranche carries `conversionPrice?` and `convertAsEquity` (0..1). When
treated as equity (in the money, or the toggle set), it is excluded from senior claims
and instead adds diluted shares (`notional / conversionPrice`) to the common count;
otherwise it is a face-value debt claim at its seniority. **Why:** captures the
first-order "does the convert sit ahead of common or dilute it?" question the treasury
model already toggles, without a pricing model. **Non-goal:** Black-Scholes valuation.

### D4 — Blended cost of capital + implied leverage are analysis outputs
Blended cost = `Σ(claim × rate) / Σ claim` over the interest/dividend-bearing tranches
(debt + preferred), per period, where `rate` is a scalar or a `rateRef` series. Implied
leverage = `assetValue / residualToCommon`. Both are derived, returned in the analysis,
never stored. **Why:** they're the headline "what does this structure cost / how levered
is the residual" numbers; cheap to compute alongside the waterfall.

### D5 — Analysis is derived on demand; the stack stores only definitions
`analyzeCapitalStack(model, scenario, options?)` computes the model (reusing
`computeModel`), resolves refs to series, and returns a `CapitalStackAnalysis`
(per-tranche claim/paid/recovery/coverage arrays + residualToCommon, navPerShare,
blendedCost, impliedLeverage, dilutedShares). Mirrors `getStatement`/`getChartData`. The
stored `capitalStack` holds only definitions. **Why:** no stale cached numbers; one
compute path.

### D6 — Ops + validation follow the established patterns
`addTranche`/`updateTranche`/`removeTranche`/`setCapitalStackAssets` in `operations.ts`
return `OpResult` (validate-on-write, change summary). `validation.ts` adds:
`DANGLING_STACK_REF` (a notional/rate/shares/asset ref that doesn't resolve),
`DUPLICATE_TRANCHE_ID`, and `BAD_CAPITAL_STACK` (e.g. >1 common tranche, or a common
tranche with no `sharesRef`). Only fires when a stack is present. Adapters reuse
`EditsController.#apply` and the MCP `call()` pattern.

### D7 — Treasury default stack references existing series; residual ties out
The template emits `capitalStack = { assetRefs: [reserve, cash, other_holdings],
tranches: [ senior_debt(seniority 10), preferred(seniority 20, rate=div_rate),
common(seniority 100, sharesRef=common_shares) ] }`. A test asserts the analysis's
`residualToCommon` equals the template's existing `nav_to_common` series (within
tolerance) — proving the structured stack reproduces the hand formula. **Why:** makes the
feature immediately real on a fresh model and guards correctness against the known-good
formula.

## Risks / Trade-offs

- **Ref drift** (a referenced item renamed/removed) → rename cascade already rewrites
  formula refs; add stack refs to the same cascade, and `removeItem`/`removeDriver`
  validation surfaces a dangling stack ref. Documented in tasks.
- **Seniority ties / gaps** → sort is stable; equal seniority pays pari-passu (split
  pro-rata across the tie). v1: document pro-rata for ties; simple ranks avoid it.
- **Residual vs. `nav_to_common` divergence** if the template formula and stack drift →
  the tie-out test catches it; the stack is the overlay, the formula stays authoritative
  until a later change optionally replaces it.
- **Converts double-counting** (both a claim and dilution) → the `convertAsEquity` toggle
  is mutually exclusive per period: equity-treated converts leave the claim set and enter
  shares; face-value converts stay a claim and add no shares. Enforced in the analysis.

## Migration Plan

Additive and backward compatible. `capitalStack` is optional on `Model`; existing models
load unchanged and simply have no stack. New analysis/ops/routes/tools/view only; no
stored-model migration. The treasury default stack appears only on newly created treasury
models (existing ones keep their graph, and can add a stack via the ops). Rollback =
revert code; the optional field is ignored by the prior build.

## Open Questions

- Should residual-to-common eventually **replace** the template's `nav_to_common` formula
  (single source), or stay a parallel cross-checked overlay? (Leaning: overlay now, with
  the tie-out test; a later change can collapse them once trusted.)
- Coverage-ratio convention: `assetValue / (claimsAhead + claim)` (through-this-tranche)
  vs. `valueAvailableAtRank / claim` (this-tranche-only)? (Leaning: report both — they
  answer "is the whole stack down to here covered?" vs. "is this tranche covered?")
- Pari-passu ties: split pro-rata (planned) vs. require strict unique seniority?
  (Leaning: allow ties with pro-rata split; it's the realistic case.)
