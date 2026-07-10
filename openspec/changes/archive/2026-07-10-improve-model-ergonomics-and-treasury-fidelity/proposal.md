## Why

An AI recreated the MSTR/Strategy Bitcoin-treasury model in greenthumb and
backtested it against real history (2020–2026). It got a working, validating
model — but hit a set of concrete friction points and template-fidelity limits
that made the exercise harder than it should be and forced manual workarounds.
This change fixes the ones that are real product gaps, engine-first per the
architecture rule. (The one hard blocker it also hit — a stale API process on
Node 22 vs. a Node-25 `better-sqlite3` build — was operational and is already
resolved by restarting the API; it needs no spec.)

## What Changes

Everything lands in `packages/core` first, then the API + MCP adapters, then the
web — never duplicating model logic in an adapter.

- **Settable timeline start date.** `create_model` pins `start` to `2026-01-01`
  and `set_timeline` only exposes `periods`/`granularity`, so a model spanning
  real history from Q3 2020 renders labels "2026-Q1…" — off by ~5.5 years. Core
  already honors `start` at creation (`defaultTimeline` spreads a
  `Partial<Timeline>`); expose it: a `setTimelineStart` core op that regenerates
  commodity-bound drivers (price generation reads calendar dates), plus a `start`
  parameter on the `create_model` and `set_timeline` API routes and MCP tools.
- **Lean MCP responses by default.** Every mutating MCP tool echoes the *entire*
  model graph back — token-heavy for iterative editing (20 items × 17 drivers ×
  32 periods per edit). The API already supports `?summary=true` (a lean
  `ChangeSummary`). Make the MCP mutating tools request summary by default, with
  an opt-in to return the full model when needed.
- **Currency scale + unit clarity.** Template currency items are stored in
  **$millions**, but the web formatter assumes raw dollars — `reserve = 50956`
  ($M) renders as "$51.0K" instead of ~$51B, wrong by 10⁶. The `Unit` type
  carries no scale. Add a **currency scale/magnitude** to the domain type,
  annotate the statement grid and stat tiles with unit/scale hints, and make it
  legible that percent drivers are stored as decimal fractions (0.105 = 10.5%).
  This is presentation plus a domain-type field — **not** a change to stored
  calc values.
- **Actuals-replay for chosen items.** The treasury engine funds BTC via a smooth
  S-curve issuance + scalar ATM, which can't reproduce lumpy discretionary
  accumulation (the 195K-coin Q4'24 jump). The AI had to hand-convert
  `btc_held`/`common_shares`/`preferred_notional` from formulas to input series.
  Add a first-class operation to **replay actuals** for a chosen item — swap a
  formula item to an actuals-backed input series (seeded from the stored actuals)
  — so real balance-sheet history drives valuation while the original engine
  formula is preserved for restore.
- **Cyclical/observed mNAV path (treasury template).** The template models mNAV
  as monotonic mean-reversion, which can only move one direction; real MSTR mNAV
  is U-shaped (3.4× → 0.74× → 2.1× → ~0.95×). Support a **non-monotonic premium
  path** — an mNAV bound to an observed/assumption series (or a cyclical driver)
  — so the premium cycle can be represented and backtested.
- **Drawdown-solvent NAV (treasury template).** With debt at face value,
  `nav_to_common` goes negative in the 2022 trough and
  `asst_price = max(nav_per_share,0) × mnav` collapses to 0 — but real MSTR
  retained option-like equity. Provide a modeling path (look-through-equity
  treatment of convertibles, or an option-value floor) so NAV-to-common stays
  economically sensible in deep drawdowns.

## Capabilities

### New Capabilities
- `unit-display`: a currency scale/magnitude on the domain type and unit/scale
  annotation of rendered values, so $M-denominated figures read correctly and
  percent-as-decimal is unambiguous.
- `actuals-replay`: a core operation to swap a chosen formula item to an
  actuals-backed input series (and restore it), so real history drives outputs
  without hand-editing formulas.

### Modified Capabilities
- `timeline-editing`: add a settable timeline **start date** (create + edit),
  regenerating commodity-bound drivers on change.
- `edit-response-summaries`: MCP mutating tools **default to the lean summary
  response**, with an explicit opt-in for the full model.
- `bitcoin-treasury-template`: mNAV may follow a **non-monotonic / observed**
  premium path, and NAV-to-common stays economically sensible in deep drawdowns
  (look-through equity / option-value floor) instead of collapsing to zero.

## Impact

- **`packages/core`** (changes first): a `Timeline.start` edit op
  (`setTimelineStart`) with bound-driver regeneration; a `currencyScale` (or
  equivalent magnitude) field on `LineItem`/`Driver` or `ModelMeta`; an
  `actuals-replay` operation (formula → input, restore); `templates.ts` changes to
  the `bitcoin_treasury` mNAV and NAV-to-common formulas. All remain
  validate-on-write; **the A = L + E identity, sign conventions, and the
  `{ model, issues, ok }` + `?preview` contract are preserved** (the unit-scale
  field is metadata, not a calc input).
- **`apps/api`**: `start` on create + a set-start route; a replay-actuals route;
  no change to the actuals store schema (replay seeds from existing actuals).
- **`packages/mcp`**: `start` params on `create_model`/`set_timeline`; a
  `replay_actuals` tool; mutating tools default to `summary`.
- **`apps/web`**: unit/scale-aware `formatNumber` + statement grid / stat-tile
  annotations; correct labels once `start` is real.
- **Non-goals**: rebuilding Excel; the "model vanished across sessions" report is
  an environment artifact (models persist to disk in `MODELS_DIR`; likely a
  cloud-sandbox / differing `MODELS_DIR`, not a local bug) — out of scope; source
  data-quality traps are research guidance, not code; no new Monte Carlo or
  connectors. The Node-25 / `better-sqlite3` restart blocker is operational and
  already fixed — not part of this change.
