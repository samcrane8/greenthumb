# greenthumb — Roadmap

**Status:** Draft v0.3 · July 22, 2026
**Owner:** Sam Crane

This roadmap turns the [PRD](Financial-Modeling-Service-PRD.md) into an ordered
plan, anchored to what the scaffold already provides. It is organized into
phases (**Foundation → MVP → V1 → V2 → Productization**) plus cross-cutting
tracks (testing, DX, security) that run throughout.

**v0.3 adds §7 — the analysis-engine track**, derived from the 2026-07-22
[analysis-engine assessment](assessments/2026-07-22-analysis-engine-assessment.md)
(running the Bitcoin-vs-liquidity study through greenthumb end to end). It reframes
a strategic gap: greenthumb is a strong *forecasting/valuation* engine but not yet
an *empirical analysis* engine. §7 is the plan to close that.

Legend: ✅ done · 🟡 partial · ⬜ not started.

---

## 0. Where we are today (Foundation — mostly ✅)

The monorepo skeleton is built and verified end-to-end:

- ✅ **Core engine** (`packages/core`): domain types, time-aware formula
  language (now incl. `exp/ln/sqrt/pow/round/floor/clamp/logistic/scurve`),
  dependency-ordered recompute, **iterative solver for intentional
  circularity**, validate-on-write operations, `blank` + `saas` +
  `bitcoin_treasury` templates, statement views, **persisted charts + dashboard
  entities**, and a **read-only analysis layer** (forecast-accuracy metrics,
  sensitivity/tornado, backtesting + walk-forward, calibration — see §2.1a).
  `computeModel` now also returns per-scenario **driver series** so adapters
  resolve item-or-driver refs without duplicating expansion. 99 unit tests
  passing.
- ✅ **AdonisJS API** (`apps/api`): HTTP surface over the engine, JSON model
  store, SQLite via Lucid with **wired actuals ingestion** (+ snapshots),
  single-tenant API-key gate, chart/dashboard edit + chart-data routes,
  timeline/rename/notes/delete edit routes with a `?summary=true` lean-response
  mode, plus **analysis routes** (score / sweep / tornado / backtest /
  walkforward / calibrate / actuals + CSV import / forecast-actual join), plus
  **market-data providers** (pluggable registry — keyless **Yahoo** default
  (real quotes + daily history, no key), BYO-key Alpha Vantage, offline demo —
  that fetch quotes/history and *materialize* them
  into a model's actuals or seed a driver, with provenance; keys stay in local
  config, never in model JSON).
- ✅ **React + shadcn UI** (`apps/web`): model list, scenario switcher, KPI
  tiles, statement grid, editable driver panel, **recharts-based chart renderer
  and an editable dashboard** (add / remove / reorder / resize widgets), a
  **Commodities view** (`/commodities`) with an interactive price-model preview,
  and a **Data Sources** settings page (configure providers, test, import actuals
  from a ticker).

**Market data — adapter-only, materialize-don't-live-compute.** Fetching lives
entirely in the adapters (`packages/core` stays I/O-free); results are written into
the model as actuals (aligned to the timeline) or a seeded driver, so `computeModel`
never touches the network and models stay reproducible. v1 is **backtest-safe**:
price history + current-snapshot quotes only — point-in-time fundamentals are
deferred to avoid lookahead bias. Exposed via `GET /market/providers`,
`/market/:symbol/{quote,history}`, `POST /models/:id/actuals/import-market`,
`PUT /models/:id/drivers/:driverId/seed-from-quote`, and the `list_data_providers` /
`get_quote` / `get_price_history` / `import_market_actuals` / `seed_driver_from_quote`
MCP tools. Imported history feeds the backtesting/calibration loop directly.
  Stat tiles resolve items *and* drivers (e.g. `btc_price`).
- ✅ **MCP server** (`packages/mcp`): **41 tools** over stdio → live API (incl.
  chart + dashboard tools and the **backtesting loop** — `import_actuals` /
  `score_forecast` / `tornado` / `run_backtest` / `walk_forward` / `calibrate`),
  with **server-level instructions** that steer Claude to backtest a model
  against reality before trusting it (validation ≠ a working forecast).
- ✅ **Electron shell** (`apps/desktop`): forks the API locally, loads the UI.

**Toolchain.** The repo targets **Node 25** (`.nvmrc`); `better-sqlite3` is on
**v12** (prebuilt binaries — no local source compile needed).

**Bitcoin treasury template — fidelity note.** The `bitcoin_treasury` template
models a treasury company (MSTR/Strive-style) as a *levered residual claim* on a
crypto reserve funded by perpetual preferred (reserve, preferred notional +
dividend coverage, cash buffer, common ATM dilution, a native **debt line** —
straight + convertible — subtracting from NAV, NAV-to-common, implied leverage).
It is generic by company: creation now **requires a `ticker`** (the modeled
company, e.g. `MSTR`) which names the price/market-cap items (`${ticker}_price`),
labels the charts, and is stored on `meta.ticker` and shown uppercased in the UI —
no silent placeholder. It is a faithful **first-order** model: preferred issuance
follows an **uncapped** S-curve ramp (notional grows over the horizon; the old
amplification cap was removed), and it tracks **sats-per-share** (BTC-per-share
accretion) as a default KPI; discrete cycle/capitulation events from the reference
are expressed via **scenario overrides** (see the Drawdown scenario), not new
engine control flow. It ships with a curated default dashboard (headline tiles
incl. sats/share, five+ treasury charts incl. a sats-per-share accretion chart, KPI
table). **Premium & solvency fidelity:** mNAV is a
first-class **series** (`mnav_path`) — settable to an observed / non-monotonic
cycle (real MSTR ran 3.4× → 0.74× → 2.1× → ~0.95×), defaulting to the prior
mean-reversion; and convertibles can be treated as **look-through equity**
(`convert_as_equity`), so a deep drawdown where BTC ≈ senior debt doesn't wipe the
common to zero the way face-value debt would.

**Capital stack.** A company's full capital structure is a first-class, ranked
overlay (`Model.capitalStack`): tranches (`senior_debt` / `subordinated_debt` /
`convertible` / `preferred` / `common`) that *reference* existing model series by
name for their claims/rates — never copying them — so the structure sits on top of
the numbers the engine already computes. `analyzeCapitalStack` derives a per-period
**seniority waterfall** (claim → paid → recovery → claims-ahead, senior-before-junior),
coverage ratios, **residual-to-common + NAV/share**, blended cost of capital, implied
leverage, and convert dilution (a simple `convertAsEquity` toggle, not option pricing).
The `bitcoin_treasury` template ships a default stack whose residual-to-common **ties
out** to its `nav_to_common` (a guarded correctness test). Validate-on-write tranche
ops (`add`/`update`/`remove`/`set-assets`) with `DANGLING_STACK_REF` / `BAD_CAPITAL_STACK`
integrity and rename-cascade of refs; exposed via `/models/:id/capital-stack/*` routes,
five MCP tools (`add_tranche` … `get_capital_stack_analysis`), and a scenario-aware
**Capital Stack** panel (ranked tranche table + residual-over-time). It's an analytical
overlay — `computeModel` is unchanged and `A = L + E` still governs.

**Model-editing controls.** Models are editable after creation, not just
appendable: set the timeline period count up **or down** (`setPeriods`, trim
allowed), granularity, and **start date** (`setTimelineStart` / `start` on
create + `set_timeline`, so period labels reflect real history and commodity-bound
drivers regenerate); rename drivers/items/scenarios (renames cascade through
referencing formulas so nothing dangles) and edit their notes; delete drivers
(ref-safe), scenarios (never the last), and whole models; **replay actuals** into
any item (`replayActuals` swaps a formula for an actuals-backed input series and
preserves the original for `restoreItemDefinition`) so real, lumpy history can
drive valuation. Every edit returns a structured `ChangeSummary`, and adapters
offer a `?summary=true` lean response — now the **MCP mutating tools' default**
(opt into the full graph with `full:true`) so iterative editing stays light.

**Display units.** Currency items/drivers carry an optional display **`scale`**
(with a per-model `defaultScale`) so values stored in $millions render at true
magnitude ($51B, not $51K); the statement grid and stat tiles annotate each figure
with a `$` / `%` / `×` / `#` unit hint. Scale is presentation-only — never read by
the engine.

**Commodity price models.** Commodities are a first-class, extensible registry
(`COMMODITIES`, mirroring `TEMPLATES`) of pure price-model generators
(`timeline → number[]`); generation is the only place calendar dates are read, so
the engine stays index-based. Bitcoin ships with a **power-law trend × halving-cycle
oscillation** model (Santostasi/Burger corridor fit; `amplitude 0.55` calibrated to
the reference model's ~47% drawdown), date-anchored to genesis, with a spot anchor
that also **infers the cycle phase** (a below-trend spot starts in the trough and
arcs up) and support/fair/resistance bands. A driver can be **bound** to a model
(`priceModel`), so its series is generated and **regenerated on timeline edits**;
the `bitcoin_treasury` template's `btc_price` is bound to it out of the box, with
Drawdown and Power-law support scenarios. Exposed via `GET /commodities`, a `GET /commodities/:c/:m/preview`
read, bind / regenerate routes, and the `list_commodities` / `set_commodity_price` /
`regenerate_commodity_price` MCP tools. A read-only **Commodities view** in the web
app browses the registry with an interactive preview of each model's price path, and
the treasury dashboard plots **BTC price over time** directly. Commodity assumptions
also live **per scenario**: each scenario can carry its own price-model params
(`Scenario.priceModels`), so Base / Drawdown / a custom scenario each generate their
own BTC path — edited in a scenario-scoped **Commodity assumptions** panel on the
model workspace (via `set_scenario_commodity_price` / a scenario-commodity route),
generated at edit time and stored as the scenario's override so the engine is
unchanged. The registry is the path to metals, oil, and other commodities so mining
companies can be modeled the same way.

**What "done" does not yet mean:** the engine has one real template, the UI is
read-mostly, there is no versioning/diff surface, no Excel export, and packaging
is unproven. And — per the 2026-07-22 assessment — greenthumb is a forecasting/
valuation engine, **not yet an empirical analysis engine**: the formula language
has no statistical/time-series functions, there is no macro data provider, and no
document-export call on the tool surface. Those are the next phases (§1–§4) plus
the new **analysis-engine track (§7)**.

---

## 1. MVP — prove the core loop

**Goal (PRD §10):** Claude scaffolds a working, *balancing* model from a prompt,
and you can edit it in the UI. This is the phase that validates the core bet.

### 1.1 Engine — the 3-statement template ⬜ (highest priority)
The single most valuable next artifact. It exercises the parts of the engine
that a SaaS toy model doesn't:
- ⬜ Build a `three_statement` template (IS + BS + CF) that **balances** and uses
  **intentional circularity** (interest ↔ debt ↔ cash) so the iterative solver
  is proven on a real structure.
- ⬜ Golden-file test: assert A = L + E every period and CF ties to Δcash.
- ⬜ Capture Sam's **naming and sign conventions** as the template defaults
  (PRD §6, §11.8 — best calibrated from the Finance folder).

### 1.2 Engine — formula language hardening 🟡
- 🟡 Current ops: `prior/lag/lead/cumulative/rolling/growth/min/max/abs/sum/avg/if`.
- ⬜ Add `spread`/`ramp` over N periods, period-index awareness, and roll-ups
  (monthly→quarterly→annual as views).
- ⬜ Formula error surfacing with position → UI inline validation.
- ⬜ Fuzz/property tests for the parser; golden tests for each operator.

### 1.3 UI — make it truly editable 🟡
Today the grid is read-mostly and only scalar drivers are editable.
- ⬜ **Formula editor** with autocomplete on item/driver names + inline
  validation (PRD §7.1).
- ⬜ Add/edit/remove/regroup line items and drivers from the UI (endpoints
  already exist; wire the UI).
- ⬜ Editable **series** drivers (per-period grid), not just scalars.
- ⬜ Timeline editor: granularity, horizon, actuals/forecast cutover.
- ⬜ Virtualized grid for large models (PRD §12 performance).

### 1.4 MCP — scaffold-from-prompt quality ⬜
- ⬜ Prompt-tune the tool descriptions so Claude reliably builds a balancing
  model in one flow; add a `describe_schema` tool and richer `trace_precedents`.
- ⬜ Integration test: a scripted Claude session that creates the 3-statement
  model and validates clean.

### 1.5 Excel export ⬜
- ⬜ `export_xlsx` (values, and where feasible reconstructed formulas) via
  `exceljs`. Export first; import is a later, harder problem (PRD §12).

**MVP exit criteria:** create a 3-statement model from an MCP prompt → it
balances → edit a driver in the UI → recompute is correct → export to Excel.

---

## 2. V1 — make it a real tool

**Goal (PRD §10):** scenarios, versioning, AI change review, integrity
everywhere, precedent tracing, more templates.

### 2.1 Scenarios & analysis 🟡
- 🟡 Scenario overlays + `compare_scenarios` exist in the engine.
- ⬜ Scenario **manager UI** (create/duplicate/edit overrides, side-by-side view).
- 🟡 **Sensitivity tables** — engine `sweepDriver`/`tornado` + `generateScenarios`
  ship (API `/sweep`, `/tornado`; MCP `tornado`). UI data tables still ⬜.
- ⬜ **Goal seek / solver** — find the driver value that hits a target output.

### 2.1a Backtesting & the model-improvement loop 🟡 (engine + adapters ✅, UI ⬜)
The handbook's core discipline (`docs/references/financial_modeling_handbook/`):
turn a plausible-looking model into a trustworthy one by testing it against
reality. Engine-first, per the architecture rule; the web surface is the only
remaining piece.
- ✅ **Forecast-accuracy metrics** — `accuracy.ts`: MAE, RMSE, MAPE, mean signed
  bias, reported together (one number hides the failure mode). `scoreForecast`
  + API `/score` + MCP `score_forecast`.
- ✅ **First-class actuals** — the dormant `actuals` SQLite table is wired
  (`ActualsStore`): ingest via `POST /actuals`, CSV import with column→item
  mapping, and a `/forecast-actual` join. MCP `import_actuals`.
- ✅ **Point-in-time (as-of) compute** — `computeModel({ asOf, actuals })` freezes
  known history and forecasts forward, with a **look-ahead-bias guard** (a
  forecast that reaches forward to an observed item is rejected).
- ✅ **Backtesting** — `backtest`, out-of-sample **holdout split**, and
  **walk-forward** (anchored + rolling). API `/backtest`, `/walkforward`; MCP
  `run_backtest`, `walk_forward`. The out-of-sample result is the referee.
- ✅ **Calibration** — `calibrate` fits drivers to actuals (bounded grid +
  coordinate descent), returns a **candidate only** (applied via the existing
  assumption preview/accept flow), ranks residuals as a structural to-do list,
  and flags when the structure — not the inputs — is the likely fault. API
  `/calibrate`; MCP `calibrate`.
- ⬜ **UI surface** — forecast-vs-actual chart, tornado chart, calibration diff.
  **Deferred to a dedicated follow-up OpenSpec change** (tracked as task 6.4 of
  `add-backtesting-improvement-loop`): the engine + API + MCP loop is complete and
  fully driveable through Claude today, so the web surface is a standalone
  visualization/UX effort. It rides on the existing recharts renderer
  (`ChartView`) and `/backtest`, `/walkforward`, `/tornado`, `/forecast-actual`,
  `/calibrate` endpoints — no new engine work. Propose it with `/opsx:propose`
  when the loop's MCP ergonomics have been exercised enough to know which views
  matter most (likely: a forecast-vs-actual variance band first).

### 2.2 Versioning, audit & provenance ⬜
Currently only file snapshots exist.
- ⬜ **Change feed / audit log** attributing every change to an actor (you or
  Claude) with timestamp + rationale (SQLite table already anticipated).
- ⬜ **Semantic diff** between versions — what drivers/formulas/structure changed,
  not just cell values.
- ⬜ **AI change review**: preview a `preview:true` diff and **accept/reject**
  before it lands (the API already returns candidate + issues; build the UI).
- ⬜ Comments/annotations on items and drivers.

### 2.3 Trace & explainability 🟡
- ⬜ `trace_precedents/dependents` in the engine (dependency graph already
  computed) → "why is this number what it is" view in the UI + MCP.
- ⬜ Natural-language explanation of a result (MCP tool + UI panel).

### 2.4 Integrity surfaced everywhere 🟡
- 🟡 Balance/dangling-ref/formula-syntax/duplicate-name checks exist.
- ⬜ CF-ties-to-Δcash check, driver bounds/sanity, sign-convention checks.
- ⬜ Surface warnings inline in the grid (not just an issues list).

### 2.5 Templates & import 🟡
- ⬜ Add **DCF/valuation**, **LBO**, **FP&A budget-vs-actual** templates.
- ✅ **CSV import for actuals** with column→item mapping — shipped with the
  backtesting loop (§2.1a): `POST /models/:id/actuals/import` + MCP
  `import_actuals`; the `actuals` SQLite table is now wired via `ActualsStore`.
- ⬜ **Excel import** as best-effort mapping with human confirmation (PRD §12
  risk — do not gate anything on it).

---

## 3. V2 — depth and reach

- ⬜ **Data connectors** (opt-in, local, logged): QuickBooks/Xero/NetSuite
  actuals, Stripe revenue, bank/CSV (PRD §7.8).
- ⬜ **Monte Carlo** — distributions on drivers → distribution of outputs.
- ⬜ Solver enhancements (multi-target, constraints).
- ⬜ **Reporting**: PDF/report export, KPI dashboards, charts (apply the
  `dataviz` conventions).
- ⬜ Google Sheets sync (optional).
- ⬜ Template library / marketplace.

---

## 4. Productization — ship both distributions

The dual desktop + web target has real work beyond the scaffold.

### 4.0 Business model, licensing & monetization ⬜
The revenue shape and the free/paid boundary — full detail in the
[monetization strategy](Monetization-Strategy.md). Summary: **AGPLv3 core +
commercial dual license, monetized primarily through paid cloud services**, with
premium data as the second engine. The desktop client stays fully open and
uncrippled; the money is in what an AGPL client can't give away — hosted
services, a commercial license, and data.
- ⬜ **License + CLA first (do now, cheap now / expensive to retrofit):** AGPLv3
  on the repo; require a contributor **CLA/copyright assignment** before the
  first external PR, or dual licensing becomes impossible later.
- ⬜ **Boundary principle:** free = everything that runs locally on one machine
  (engine, formulas, scenarios, charts, dashboards, backtests, capital stack,
  local data pulls, file export); paid = anything needing a server, a second
  person, or our data/compute (sync, publish/share, collaboration, hosted
  compute, premium data, enterprise governance).
- ⬜ **Ship Publish as the first paid wedge** — share a live analysis via URL;
  rides the analysis/export work and self-markets every time an analysis is
  shared. Then **Sync** (prosumer upsell) and a metered **data add-on**.
- ⬜ **Tiering:** Free (AGPL, local) → Pro (~$10–18/mo: sync, publish, hosted
  compute) → Team (~$25–45/seat: multiplayer, shared libraries, admin) →
  Enterprise (custom + commercial license, SSO/audit/self-host).
- ⬜ Keep cloud backend + commercial-only features as **separate proprietary
  works over an API** so AGPL never reaches the server.

The 4.1–4.3 items below are the *delivery* of this model; the streams they enable
(subscriptions, data, commercial license) are ranked in the strategy doc.

### 4.1 Desktop packaging 🟡
- 🟡 `electron-builder.yml` + main-process fork of the API are wired.
- ⬜ Rebuild `better-sqlite3` against Electron's ABI (`@electron/rebuild` /
  `install-app-deps`); bundle API prod `node_modules`. (Local/API runs use the
  v12 prebuilt on Node 25; Electron still needs an ABI rebuild against its own
  bundled Node.)
- ⬜ Produce signed DMG / NSIS / AppImage; auto-update channel.
- ⬜ First-run UX: pick a models directory, optional git-init of that directory.

### 4.2 Cloud / subscription (single-tenant) ⬜
Per the decision, each subscriber gets an **isolated single-tenant instance** —
same server + JSON/SQLite storage as local, no multi-tenant data model.
- ⬜ Containerize `apps/api` (+ built web) as one deployable image.
- ⬜ Per-instance provisioning: unique `API_KEY`, persistent volume for
  `MODELS_DIR` + SQLite, backups.
- ⬜ **Billing/subscription** layer (Stripe) — provision/suspend instances on
  subscription state. This is the only place a shared control-plane exists;
  model data never co-mingles.
- ⬜ Auth: the API-key gate is the MVP; consider upgrading to `@adonisjs/auth`
  (already installed) for a login UI on cloud instances.

### 4.3 Sync (later) ⬜
- ⬜ Optional local↔cloud sync of model files (the diffable JSON format makes
  this tractable) with conflict handling — strictly opt-in (PRD §9.6).

---

## 5. Cross-cutting tracks (continuous)

### Testing & correctness
- 🟡 **Engine unit suite** — 99 core tests (incl. accuracy, sensitivity,
  backtest, calibrate, and an as-of ≡ ordinary-compute golden check). A formal
  three-statement **golden-file** (A = L + E, CF ties Δcash) still lands with §1.1.
- 🟡 **API functional tests** (Japa) — suites for editing, charts, commodities,
  info, and the **analysis/backtesting loop** (`analysis.spec.ts`); broaden
  coverage across the rest of the surface.
- ⬜ UI component/e2e tests (Playwright) for the edit→recompute loop.
- ⬜ MCP integration test in CI (the smoke script is the seed).

### Developer experience
- ⬜ CI (lint + typecheck + test across workspaces on PR) — **pin Node 25**
  (repo `.nvmrc`; `better-sqlite3` v12 prebuilds).
- ⬜ Pre-commit hooks; shared ESLint/Prettier config.
- ⬜ Seed script + fixture models for local dev.

### Security & privacy (PRD §9.6)
- ⬜ Confirm **no network egress** by default; document the trust boundary. The
  backtesting loop (§2.1a) does not change this posture: all analysis is
  read-only over the local engine and **actuals stay local in SQLite** alongside
  the model store — nothing is egressed. CSV actuals are ingested locally.
- ⬜ Full audit trail of AI actions (ties to §2.2).
- ⬜ Secrets handling for connectors (§3); per-source opt-in + logging.

---

## 6. Open decisions that reorder this (PRD §11)

These change priority once answered — best grounded in the **Finance folder**:

1. **Which model types first?** → orders §1.1 / §2.5 template work.
2. **Excel round-trip: replacement or occasional export?** → sizes §1.5 vs §2.5.
3. **Models in git? single file vs. project directory?** → affects §2.2 + §4.3.
4. **AI autonomy:** how much can Claude change unattended vs. propose-and-approve?
   → shapes §2.2 AI change review.
5. **Naming/sign conventions** → bake into §1.1 template defaults.
6. **Python cells — commit or not, and how?** (§7.5, pre-decision) The scoping doc
   is explicit that these are unresolved and gate a P0 spike: input/output discovery
   (static inference vs. explicit declaration vs. both); bundled managed CPython vs.
   bring-your-own runtime; purity enforcement (hard network-off sandbox vs.
   lint-and-warn); how opinionated auto-resampling is on granularity mismatch;
   Python-only vs. also SQL cells feeding Python; and cells model-level-only vs. also
   standalone/scratch. Answering these decides whether §7.5 starts after §7.1–§7.3.

---

## 7. Analysis-engine track — from pro-forma to empirical analysis

Derived from the [2026-07-22 assessment](assessments/2026-07-22-analysis-engine-assessment.md),
which ran a real "how much does Bitcoin follow liquidity?" study through greenthumb.
Verdict: the engine *hosts* such an analysis (series drivers, dual-axis + indexed
charts, a 12-column dashboard, `note` text widgets) but can't yet *compute* one —
the statistical work happened in Python, the liquidity data came from FRED (outside
the tool), and there's no export call. Three gaps, in priority order. **These
augment V1/V2; they don't replace the forecasting roadmap.** Each 7.x is sized to
become its own `/opsx:propose` change, engine-first per the architecture rule.

**Two complementary compute layers (per the [Python-cells scoping doc](assessments/2026-07-22-python-cells-scoping.md)).**
The analysis-engine work deliberately ships *both*: a **built-in formula stats
library** (§7.1) — the approachable, scenario-native spine for the spreadsheet-native
analyst who never writes code — and **reactive Python cells** (§7.5) — the unbounded
power layer for the pandas-native quant. They are not either/or: the formula stats
serve non-coders and always compute inside scenarios/backtests; Python cells handle
anything the function set can't express. The failure mode to avoid is becoming "a
slightly-worse Jupyter for quants while intimidating the analysts who liked that
greenthumb felt like a spreadsheet" — so the declarative formula model stays the
spine and code is progressive disclosure.

### 7.0 Prerequisite — make `validate` honest about formulas ⬜ (cheap; do first)
`validate_model` today passes a model containing functions that don't exist
("0 issues — arithmetically sound"), which then **500s at compute**
(`get_chart_data → "Unknown function 'correl()'"`). Validation checks structure
(balance, dangling refs, capital stack) but never resolves function names against
the evaluator's registry.
- ⬜ In `validation.ts`, compile/resolve every formula's function calls against the
  `formula.ts` function set; emit an `UNKNOWN_FUNCTION` error (and flag obvious
  NaN-producing ops). "Valid" must mean "will compute," not just "arithmetically
  coherent."
- **Acceptance:** a model with `correl()` fails `validate_model` with a clear issue,
  not a compute-time 500.

### 7.1 Statistics / time-series function library ⬜ (highest leverage)
The change that unlocks "handle queries like this." Today's callable set is
pro-forma-oriented (`prior`, `cumulative`, `rolling`, `growth`, `if`, arithmetic,
`exp/ln/sqrt/pow/clamp/scurve/logistic`) — no statistics. Build on the existing
`rolling` window and `growth`.
- ⬜ Reducers: `logret`/`pct_change`, `stdev`/`var`, `cov`, `correl`, `beta`,
  `drawdown`, `zscore`.
- ⬜ Windowed variants (compose with `rolling(window, …)`): rolling correlation,
  rolling beta, rolling vol.
- ⬜ A small regression primitive: `slope`, `intercept`, `r2`, with a `lag`
  argument for lead/lag.
- ⬜ Annualization keyed off timeline granularity (vol × √periods-per-year).
- ⬜ Golden tests per function vs. known series; property tests for windows.
- **Acceptance:** every derived series the Bitcoin study computed in Python (weekly
  log returns, 26-week rolling correlation, rolling beta to an index and to gold,
  annualized vol, drawdown-from-peak, lead/lag regression + R²) is expressible as a
  formula item and computes. Pairs naturally with 7.0.

### 7.2 Macro / econ data provider ⬜
Without this, any liquidity/rates/macro analysis leaves the tool at step one.
- ⬜ Add a **FRED** provider next to Yahoo (M2, central-bank balance sheets, policy
  rates, FX) as first-class series; BYO-key in local config (same secret-handling
  contract as Alpha Vantage — keys never in model JSON).
- ⬜ Align fetched macro series to a model timeline (reuse `alignHistoryToTimeline`),
  materialize as actuals or a seeded driver (same as price data).
- **Acceptance:** global M2 and a policy-rate series import in-tool and chart against
  BTC (dual-axis, indexed) with no out-of-band steps.

### 7.3 Document export path ⬜
The shareable deliverable the workflow asks for.
- ⬜ An `export` MCP tool + API route that renders a scenario's dashboard — charts,
  stat tiles, and `note` prose — to **HTML and PDF**, returning a file.
- ⬜ Notes carry **markdown** so narrative survives with structure.
- ⬜ If the desktop already renders a dashboard, factor the renderer so the export
  and the desktop share one path (apply the `dataviz` conventions).
- **Acceptance:** an agent produces a shareable HTML/PDF of a dashboard *including
  the narrative* through the automatable (MCP) surface.

### 7.4 Secondary — data & viz ergonomics ⬜
- ⬜ **Server-side resampling + compact/CSV return** on `get_price_history`
  (weekly/monthly aggregation, columnar mode) so multi-year pulls don't overflow the
  tool-result cap (~344k chars for one BTC pull today) or need out-of-band parsing.
- ⬜ **OHLCV, not close-only**, for range/volume-based work.
- ⬜ **Symbol normalization / documented symbol classes** — `^`-prefixed indices
  (`^IXIC`) either resolve or fail with a clear "use an ETF proxy" hint.
- ⬜ **Ad-hoc external-data series** decoupled from a pro-forma timeline, plus
  **study chart types**: scatter-with-regression, rolling-correlation, lead/lag
  heatmap.
- ⬜ **Rich-text / markdown note widgets** (feeds 7.3 export).

### 7.5 Reactive Python cells — the power layer ⬜ (scoped, pre-decision)
Full scoping in the [Python-cells scoping doc](assessments/2026-07-22-python-cells-scoping.md).
The unbounded complement to §7.1: executable Python for the pandas-native quant, for
anything the formula function set can't express (custom transforms, statsmodels/
sklearn regressions, bespoke signals). **This is the largest single bet in §7** —
sequence it *after* §7.1–§7.3 give it a surface to plug into, and treat it as
multi-phase, not one change.

- **The one decision everything hangs on: a cell is a graph node, not a REPL.** Each
  cell declares its **input set** (model series/drivers/tables it reads) and names its
  **output set** (series/scalars/tables it writes back). The engine builds one
  dependency DAG across drivers, formula items, **and** cells; a cell's outputs are
  indistinguishable downstream from a formula item's — so charts, stats, scenarios,
  backtests, and export come **for free**. Refuse to ship free-floating REPL cells
  whose I/O the engine can't see.
- **Reactive dataflow, not notebook order.** Editing a cell (or an upstream input)
  re-runs only genuinely-downstream nodes, in dependency order — no hidden kernel
  state, no "did I run cell 3 after editing cell 1?" (Marimo/Observable model). This
  is what makes "change the rolling window 26→13, watch the chart redraw" both
  possible *and correct*.
- **Local kernel** (greenthumb is a desktop app): full scientific stack, data stays
  local, no untrusted code in our cloud; bundle a **pinned managed CPython + curated
  wheels** for zero-setup. Pyodide/WASM as a fallback for users without a kernel; a
  hosted kernel is deprioritized (breaks "data stays local").
- **Purity is the crux risk.** Scenario/backtest correctness requires cells be pure
  functions of their declared inputs. Mitigations: purity lint, network-off sandbox
  by default, seeded RNG, an **actuals-cursor lint** (flag full-sample stats in a
  backtest context = lookahead), and per-cell CPU/mem/time limits + cancellation.
- **Reproducibility: publish = freeze.** Snapshot each cell's resolved inputs,
  computed outputs, code, and env hash at publish/export, so a defended claim ("BTC up
  47% as of July 2026") doesn't silently drift. Pin the env per model; warn on drift.

  Phased delivery (maps onto our phases; each phase is its own OpenSpec change):
  - ⬜ **P0 spike** — local kernel + one cell reading a model series and writing one
    output series that renders in an existing chart. Proves the round-trip + marshalling
    contract. No reactivity.
  - ⬜ **P1 MVP** — static input/output inference (reads of `gt[...]`, writes to
    `gt.out[...]`); single-cell reactivity (edit→recompute→chart updates); series +
    scalar outputs; error/traceback surfacing; bundled pinned runtime.
  - ⬜ **P2 graph + scenarios** — multi-cell reactive DAG; cell outputs participate in
    scenario recompute; DataFrame/table outputs; backtest/actuals-cursor awareness +
    lookahead lint.
  - ⬜ **P3 analysis & reproducibility** — snapshot-at-publish; env pinning + drift
    warnings; a "code" dashboard widget; the empirical chart types from §7.4
    (scatter+regression, rolling-corr, lead/lag heatmap).
  - ⬜ **P4 polish** — package-management UX; templates/snippets (a "market study"
    starter that reproduces the Bitcoin-liquidity analysis); sharing/versioning.

- **Open decisions to resolve before committing** (from the scoping doc — it is
  explicitly *pre-decision*): input/output discovery (inference vs. declaration vs.
  both — leaning both, inference-first); bundled vs. bring-your-own runtime; purity
  enforcement (hard sandbox vs. lint-and-warn); how opinionated auto-resampling should
  be on granularity mismatch; whether to allow SQL cells feeding Python; and whether
  cells are model-level only or also standalone/scratch. These fold into §6 (open
  decisions).
- **The moat:** none of Marimo/Hex/Count/Observable fuse a reactive notebook with a
  *scenario + forecast + capital-stack* engine. That fusion is the differentiator —
  and the reason the graph-node discipline (not an embedded REPL) is non-negotiable.

### Preserve (don't regress) — the assessment's explicit keep-list
The keyless, device-side data bridge (in a firewalled sandbox greenthumb *was* the
only way to reach Yahoo); the scenario/override system; the bitcoin power-law +
halving price model (directly on-point for monetization-trend work); the
capital-stack analysis; and the backtest/validate/score discipline's refusal to
conflate "the model balances" with "the model is correct."

### Sequencing
**7.0 → 7.1 → 7.2 → 7.3**, with 7.4 ergonomics riding alongside. 7.0 is a fast
prerequisite that pairs with 7.1; 7.1 unlocks the class of query; 7.2 unblocks
macro sourcing; 7.3 ships the deliverable. The tell from the assessment: the moment
the real analytical work happens *outside* greenthumb, you've found the product gap
— 7.1 + 7.2 + 7.3 collapse the current 5-step "compute-in-Python, present-in-tool"
workaround into a single in-tool workflow.

**§7.5 (Python cells) comes after this foundation**, not before it. It's the largest
bet in the track and it *plugs into* the surface 7.1–7.3 build (its outputs are
"just" more model series that flow into the same charts, scenarios, backtests, and
export). Shipping 7.1 first also de-risks 7.5: the formula stats prove demand and
serve the non-coder audience regardless of whether/when Python cells land. Start 7.5
at its **P0 spike** only once the open decisions above are resolved.

---

## Suggested near-term sequence

1. **3-statement template + golden balance test** (§1.1) — proves the engine.
2. **Editable line items + formula editor in the UI** (§1.3).
3. **Excel export** (§1.5).
4. **AI change-review (accept/reject) UI** (§2.2) — the differentiator.
5. **Backtesting/analysis UI** (§2.1a/§2.1) — surface the shipped engine
   (forecast-vs-actual, tornado, calibration diff); then **goal seek**.

Everything above (1–4) is the shortest path to the MVP exit criteria; item 5
opens V1. The backtesting/sensitivity/calibration **engine + API + MCP** already
landed (§2.1a) — item 5 is the web surface over it, not new engine work.

**Analysis-engine track (§7) — the new near-term thread.** Given the 2026-07-22
assessment, the highest-leverage engine work is now §7.0 → §7.1: make `validate`
honest, then add the statistics/time-series function library. It's engine-first
(pure `packages/core`), independent of the MVP UI work above, and it's the single
change that turns "handle empirical queries like Bitcoin-vs-liquidity" from
impossible into a formula item. Sequence for implementation:

1. **§7.0** — `validate` resolves function names (fast prerequisite; also a
   correctness fix on its own).
2. **§7.1** — statistics/time-series functions (`logret`, `stdev`, `correl`,
   `beta`, `drawdown`, rolling variants, a regression primitive).
3. **§7.2** — FRED macro provider.
4. **§7.3** — HTML/PDF dashboard export.

Each is a self-contained `/opsx:propose` change. Start with §7.0+§7.1 as one or
two changes (they're tightly coupled).
