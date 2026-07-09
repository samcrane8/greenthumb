## Context

The `bitcoin_treasury` template currently produces BTC price with a formula item
`if(prior(btc_price) == 0, btc_start, prior(btc_price) * (1 + btc_growth))` fed by
`btc_start` and `btc_growth` drivers — constant-rate compounding, a straight line in
log space. Bitcoin empirically tracks a **power law** vs. time since the genesis block:
`price ≈ coefficient · days^exponent` (log-log linear). Reproducing that path today is
manual and error-prone (the friction notes flagged the day-count anchoring).

greenthumb's engine is deliberately **date-agnostic**: `computeModel` reads only
`timeline.periods` (a count) and never `timeline.start`/`granularity`. So a price model
that depends on calendar dates cannot live inside the formula evaluator without adding
date awareness to the engine — a large, invasive change. But the timeline *does* carry
`start` (ISO date) and `granularity`, which are enough to compute each period's date
outside the engine. That is the seam this design uses.

## Goals / Non-Goals

**Goals:**
- A first-class, extensible **commodity** concept: a registry of commodities, each with
  price-model generators, mirroring how `TEMPLATES` works — so metals/oil/miners follow
  the same pattern later.
- Bitcoin ships with a **power-law** price model, date-anchored to genesis, with a
  sensible spot-anchor default and support/fair/resistance bands.
- A driver can be **bound** to a commodity model so its series is generated and can be
  regenerated (notably when the timeline changes).
- The `bitcoin_treasury` template uses the power law out of the box.

**Non-Goals:** (see proposal) live feeds, engine date-awareness, other commodities,
stochastic paths.

## Decisions

### D1 — Price models are pure generators over the timeline; generation is not part of compute
A `PriceModel` is `{ id, label, defaultParams, generate(timeline, params): number[] }`.
`generate` computes each period's calendar date from `timeline.start` + `granularity` +
index, derives `days_since_genesis`, and returns the price series. The result is stored
as an ordinary driver `values` array. **Why:** keeps the engine index-based and pure;
dates touch only the generator. **Alternative rejected:** a `powerlaw(period)` formula
built-in — would force calendar semantics into the evaluator and the dependency graph.

### D2 — Bitcoin power law: trend × cyclical oscillation, date- and spot-anchored, banded
The price is a power-law **trend** times a **cyclical oscillation** around it:
`price(t) = trend(t) · band · osc(t)`, where
- `trend(t) = coefficient · days(t)^exponent`, `days(t) = max(1, date(t) − 2009-01-03)`.
- `osc(t) = exp(amplitude · sin(2π · years(t) / cycleYears + φ))` — the halving-cycle
  boom/bust arc above and below fair value (log-space sinusoid, so up and down moves are
  multiplicative and symmetric). A pure power law is monotonic; this is the studied
  oscillation the reference model (`docs/references/asst_model.tsx`) captured discretely
  with its peak → capitulation → bear cycle. We model it as a smooth damped sinusoid
  instead of discrete events.

**Documented central fit, all params overridable** (resolved open question 1): ship
`exponent = 5.8`, `coefficient = 1.0117e-17` (the widely cited Santostasi/Burger
power-law corridor fair-value fit; cite it in code comments), band multipliers
`support = 0.42`, `fair = 1.0`, `resistance = 2.5`, and oscillation defaults
`cycleYears = 4` (halving cycle) and `amplitude = 0.55`. **The amplitude is calibrated to
the reference model's drawdown depth:** `asst_model.tsx` used `drawdownPct = 55` applied
as two compounding −27.5% quarterly haircuts → ~47% realized peak-to-trough. A log
amplitude of 0.55 (oscillation extremes ×1.73 / ×0.58 around trend) yields a ~47% *net
nominal* peak-to-trough over the down-leg once the rising power-law trend cushions it —
matching the reference. (The log amplitude looks smaller than 47% because the secular
trend offsets much of the oscillation over a half-cycle; a naive component-only reading is
~67%.) Optional amplitude damping over long horizons is available. Every param is
overridable.

Two refinements, because a pure fair-value curve rarely equals today's tape (the friction
notes: fair value ≠ the ~$62.85k spot), and because *where in the cycle we start* matters:
- **Spot anchor + phase inference (default on):** if a `spot` param is given, solve for
  the cycle phase `φ` so that `osc(0) = spot / (trend(0) · band)` **on the rising arc**
  (choose the ascending solution of `sin`, i.e. positive cosine). Because today's spot is
  well below fair value, this starts the model in the trough heading up — arcing through
  fair value and then reversing — exactly the behavior asked for. Period 0 then equals the
  supplied spot, and the trend+oscillation carry it forward. If no spot is given, `φ`
  defaults so period 0 sits at fair value on the upswing.
- **Band:** a `band` param (`support` | `fair` | `resistance`) applies a multiplier, so
  the same model expresses the corridor.

**Why:** the oscillation is the empirically dominant feature over a 2–4 year modeling
horizon (a treasury model that ignores it misses the whole boom/bust that drives mNAV and
leverage); inferring phase from spot means the model honestly reflects that we're below
trend today. **Alternative rejected:** discrete peak/capitulation events like the
reference — data-fits one path but is brittle and hard to tune; a parameterized sinusoid
generalizes and still reproduces the arc.

**Why:** anchoring to a real spot makes the starting reserve honest while still
projecting along the power law; bands capture the empirical corridor without a second
model. **Alternative considered:** pure fair-value only — simpler but starts the model
at a price that contradicts the tape, exactly the friction we're removing.

### D3 — Commodity binding lives on the Driver; generation fills its values
Add optional `priceModel?: CommodityPriceBinding` to `Driver`, where
`CommodityPriceBinding = { commodity: string; model: string; params: Record<string,
number> }`. `setCommodityPrice(model, driverId, binding)` sets the binding and generates
`values`; `generateCommodityPrice(model, driverId)` re-runs generation from the stored
binding. **Why:** a driver already *is* "a named input series"; a commodity-priced
driver is just one whose series is generated. No new top-level entity, minimal type
surface, and scenarios can still override a bound driver per period (overrides layer on
top of generated base values). **Alternative rejected:** a top-level `commodities: []`
on `Model` binding driverIds — more structure for no gain; the binding is 1:1 with a
driver.

### D4 — Timeline edits regenerate bound drivers
Because the power law depends on each period's date, changing the period count or
granularity changes the correct prices. `setPeriods` and `setGranularity` (from the
timeline-editing capability) SHALL, after mutating the timeline, regenerate every driver
that carries a `priceModel` binding. **Why:** keeps a bound price series correct after a
trim/re-grain — directly closing the friction where re-graining silently desynced the
day-count. Non-bound drivers are untouched (still non-destructive).

### D5 — Validation guards bindings
`validation.ts` adds: a driver whose `priceModel.commodity`/`model` is not in the
registry is an error (`UNKNOWN_PRICE_MODEL`). Generated values are otherwise ordinary,
so all existing checks apply unchanged. **Why:** same guarantee as elsewhere — a
persisted binding can't reference a model that doesn't exist.

### D6 — Treasury template binds `btc_price`
Replace the `btc_price` formula item and the `btc_start`/`btc_growth` drivers with a
`btc_price` **driver** bound to `bitcoin`/`powerlaw` (spot anchored to the current
`btc_start` default, ~$62.85k for the 2026 MSTR reality). Formulas already reference
`btc_price` by name, so `reserve = btc_held * btc_price / 1e6` still resolves (now to a
driver). The Drawdown scenario overrides `btc_price` with a haircut on the generated
path instead of overriding `btc_growth`, and the template **also ships a "Power-law
support" scenario** (resolved open question 2) that overrides `btc_price` with the
`support`-band series — mirroring how Drawdown works, so the corridor is one click away.
**Why:** the template gets the empirically grounded path for free and demonstrates the
capability end to end.

### D7 — `setAssumption` on a bound driver implicitly unbinds it
Resolved open question 3: manually setting a bound driver's values via `setAssumption`
**clears its `priceModel` binding**, so the manual series is authoritative and later
timeline edits never overwrite it. The change summary records the implicit unbind so the
caller isn't surprised. **Why:** a hand override and an auto-regenerated series can't both
own the same values; the last explicit human action wins, transparently.

## Risks / Trade-offs

- **Power-law params are opinionated** → ship canonical defaults, expose `coefficient`/
  `exponent`/`band`/`spot` as params, and document that they are assumptions, not a live
  fit. Scenarios still express up/down cases.
- **Spot anchor vs. pure fair value could confuse** → default to spot-anchored (matches
  intent) but make the mode explicit in params and in the change summary detail.
- **Regeneration on timeline edit could clobber a hand-edited bound series** → only
  drivers that *carry a binding* regenerate; unbinding (or `setAssumption`) leaves a
  plain series that timeline edits never overwrite. Documented.
- **Genesis-relative day count needs correct date math** across granularities → a single
  `daysSinceGenesis(timeline, index)` helper with unit tests (monthly/quarterly/annual,
  leap years) is the one place calendar logic lives.
- **Treasury template shape change is BREAKING** → additive to the engine; existing
  saved models keep their stored graph, only newly created treasury models get the
  bound `btc_price` driver.

## Migration Plan

Additive and backward compatible. `priceModel` is optional on `Driver`; existing models
load unchanged and have no bound drivers. New registry, ops, routes, and tools only. The
treasury change affects only newly created treasury models. No stored-model migration;
rollback = revert code (persisted JSON stays readable — the optional field is ignored by
the prior build).

## Open Questions

_All three prior open questions are resolved (see D2, D6, D7):_
- **Power-law params** → documented central fit (`exponent 5.8`, `coefficient 1.0117e-17`,
  bands 0.42 / 1.0 / 2.5), all overridable (D2).
- **Bands as scenarios** → yes; the treasury template ships a "Power-law support" scenario
  alongside Drawdown (D6).
- **`setAssumption` on a bound driver** → implicit unbind, recorded in the change summary
  (D7).
