## Context

Real-world use — an AI recreating and backtesting the MSTR treasury model —
surfaced six fixable gaps (plus one operational blocker already resolved). They
span three layers: adapter ergonomics (settable start date, lean MCP responses),
presentation + a domain-type field (currency scale), a general engine operation
(actuals-replay), and treasury-template fidelity (cyclical mNAV, drawdown-solvent
NAV). The governing constraint is unchanged: capability lands in `packages/core`
first, then the API + MCP adapters, then the web; validate-on-write and the
A = L + E identity are preserved throughout.

## Goals / Non-Goals

**Goals:**
- A `Timeline.start` that is settable at creation *and* via an edit op, so period
  labels reflect real history; commodity-bound drivers regenerate on change.
- Currency figures that render at the right magnitude ($M reads as billions, not
  thousands) via a scale field on the domain type, applied by the formatter.
- A first-class `replayActuals` op that swaps a formula item to an actuals-backed
  input series and can restore the original formula.
- A treasury template whose mNAV can follow a non-monotonic / observed premium
  path, and whose NAV-to-common stays economically sensible in deep drawdowns.
- MCP mutating tools that return the lean summary by default.

**Non-Goals:**
- No change to stored calc values — scale is display metadata only.
- No new engine control flow for treasury cycles (declarative formulas +
  drivers, per the existing template philosophy).
- Not rebuilding Excel; no Monte Carlo; no connectors.
- The "model vanished across sessions" report is environmental (disk-backed
  `MODELS_DIR`), not addressed here.

## Decisions

### 1. Currency scale is a per-item/-driver magnitude, applied by the formatter
Add an optional `scale?: number` (magnitude multiplier: 1, 1e3, 1e6…) to
`LineItem` and `Driver`, with an optional `ModelMeta.defaultScale` fallback.
Stored values are unchanged; the web `formatNumber(value, unit, scale)` multiplies
by the effective scale before compacting to $/K/M/B, so `reserve = 50956` with
`scale = 1e6` renders `$51.0B`. The statement grid and stat tiles show a unit/scale
hint. Percent stays decimal-in / ×100-out (already correct in the UI); we only
document the convention.
*Why per-item:* models legitimately mix scales — `btc_price` in whole dollars,
`reserve` in $M. A single model-level scale can't express that.
*Alternative rejected:* normalizing all stored values to raw dollars — churns
every template/formula, breaks the reference model's $M convention, and inflates
the numbers authors reason about.

### 2. `setTimelineStart` mirrors the other timeline ops
A core op that clones, sets `timeline.start` (ISO date), calls
`regenerateBoundDrivers` (commodity price generation is the one place calendar
dates are read), and finalizes. `create_model` and `set_timeline` gain a `start`
parameter — core already threads `options.timeline.start` at creation, so this is
pure adapter plumbing plus the one new edit op.

### 3. Actuals-replay swaps formula → input and stashes the original
`replayActuals(model, itemId, values)` sets the item's definition to
`{ kind: "input", values }` and stores the prior definition on the item
(`replacedDefinition?: ItemDefinition`) so `restoreItemDefinition(model, itemId)`
can swap it back. The API seeds `values` from the actuals store for the item; the
op itself is pure (takes the array). Validate-on-write still runs, so if the
replayed actuals break A = L + E the caller sees `BS_IMBALANCE` — that is honest,
not hidden.
*Why keep the original:* the AI lost the engine formula when it hand-converted
items; a stashed definition makes replay reversible.
*Alternative rejected:* a one-way convert with the formula only in version
history — loses the restore affordance the workaround showed we need.

### 4. mNAV becomes a series-backed path, defaulting to today's behavior
Replace the treasury template's monotonic mNAV *formula* with an `mnav` item that
reads a first-class **series** — either a `mnav_path` driver or a per-scenario
series — so a user or AI can drop in observed/cyclical mNAV (3.4× → 0.74× → 2.1×
→ 0.95×). The template ships a default path that reproduces the current
mean-reversion values, so existing behavior is preserved unless overridden. This
mirrors how commodity prices already bind a driver to a series — no engine change.
*Alternative rejected:* a fixed cyclical function (sinusoid) — still can't match
an arbitrary realized premium; a series can.

### 5. Drawdown-solvent NAV via look-through converts (declarative)
Split treasury debt into straight vs. convertible and treat convertibles as
**look-through equity** (excluded from senior claims; their dilution already in
the share count), gated by a driver toggle so the behavior is explicit and
scenario-able. `nav_to_common` then stays positive when BTC ≈ straight debt, and
`asst_price` no longer collapses to 0 in the trough. All formula-level; no engine
control flow. Documented as an explicit modeling assumption in the template.
*Alternative considered:* an option-value floor on `nav_per_share` — more
theoretically pure but needs volatility inputs the first-order template avoids;
look-through matches how MSTR's converts actually resolved (to equity by 2025).

### 6. MCP mutating tools default to the lean summary
Add a shared `responseArg = { full: z.boolean().default(false) }`; mutating tools
send `summary: String(!full)` on the query (the API already honors `?summary=true`).
Default lean, opt into the full graph with `full: true`. No API contract change —
this flips the *adapter default*.

## Risks / Trade-offs

- **Scale set inconsistently with stored values** → renders wrong. Mitigate: the
  template sets `scale` explicitly per item ($M items → 1e6, `btc_price` → 1);
  document the convention; scale is display-only so it can never corrupt a calc.
- **Actuals-replay breaks the balance identity** → validate-on-write surfaces
  `BS_IMBALANCE` rather than silently accepting it; the response carries issues.
- **Template formula changes break `treasury.test.ts`** → default the mNAV series
  and the look-through toggle to reproduce current numbers; update golden
  expectations where the drawdown NAV intentionally changes.
- **`start` change silently shifts commodity price paths** (date-anchored
  generation) → `setTimelineStart` regenerates bound drivers and returns a
  `ChangeSummary`; the preview flow lets the caller see the shift first.
- **Per-item scale adds a field consumers must handle** → optional with a sane
  default (1 / model default); existing models render exactly as before.

## Migration Plan

- Additive, backward-compatible: new optional fields (`scale`,
  `replacedDefinition`, `ModelMeta.defaultScale`) default to prior behavior;
  existing stored models are untouched. Template changes affect newly-created
  `bitcoin_treasury` models only. No data migration. Rollback = revert the code;
  stored models remain valid.

## Open Questions

- Scale granularity: ship per-item `scale` now, or start with a model-level
  `defaultScale` and add per-item override later? Leaning per-item optional with a
  model default (the treasury model genuinely mixes scales).
- mNAV series home: a dedicated `mnav_path` driver vs. reusing the per-scenario
  series-override mechanism? Leaning a driver (visible, nameable, chart-able).
- Look-through converts default: on by default in the template, or a toggle
  defaulting to today's face-value behavior? Leaning a toggle defaulting to the
  new (look-through) behavior for fidelity, with the old behavior one flag away.
