# greenthumb — Roadmap

**Status:** Draft v0.1 · July 9, 2026
**Owner:** Sam Crane

This roadmap turns the [PRD](Financial-Modeling-Service-PRD.md) into an ordered
plan, anchored to what the scaffold already provides. It is organized into
phases (**Foundation → MVP → V1 → V2 → Productization**) plus cross-cutting
tracks (testing, DX, security) that run throughout.

Legend: ✅ done · 🟡 partial · ⬜ not started.

---

## 0. Where we are today (Foundation — mostly ✅)

The monorepo skeleton is built and verified end-to-end:

- ✅ **Core engine** (`packages/core`): domain types, time-aware formula
  language, dependency-ordered recompute, **iterative solver for intentional
  circularity**, validate-on-write operations, `blank` + `saas` templates,
  statement views. 6 unit tests passing.
- ✅ **AdonisJS API** (`apps/api`): HTTP surface over the engine, JSON model
  store, SQLite via Lucid (actuals/snapshots), single-tenant API-key gate.
- ✅ **React + shadcn UI** (`apps/web`): model list, scenario switcher, KPI
  tiles, statement grid, editable driver panel.
- ✅ **MCP server** (`packages/mcp`): 14 tools over stdio → live API.
- ✅ **Electron shell** (`apps/desktop`): forks the API locally, loads the UI.

**What "done" does not yet mean:** the engine has one real template, the UI is
read-mostly, there is no versioning/diff surface, no Excel export, and packaging
is unproven. Those are the next phases.

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
- ⬜ **Sensitivity tables** (1- and 2-variable data tables) — engine + UI.
- ⬜ **Goal seek / solver** — find the driver value that hits a target output.

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

### 2.5 Templates & import ⬜
- ⬜ Add **DCF/valuation**, **LBO**, **FP&A budget-vs-actual** templates.
- ⬜ **CSV import for actuals** with column→item mapping (SQLite `actuals`
  table + `Actual` model already scaffolded).
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

### 4.1 Desktop packaging 🟡
- 🟡 `electron-builder.yml` + main-process fork of the API are wired.
- ⬜ Rebuild `better-sqlite3` against Electron's ABI (`@electron/rebuild` /
  `install-app-deps`); bundle API prod `node_modules`.
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
- ⬜ **Golden-file suite** for the engine (the calc-correctness moat, PRD §12).
- ⬜ API functional tests (Japa is already set up in `apps/api`).
- ⬜ UI component/e2e tests (Playwright) for the edit→recompute loop.
- ⬜ MCP integration test in CI (the smoke script is the seed).

### Developer experience
- ⬜ CI (lint + typecheck + test across workspaces on PR).
- ⬜ Pre-commit hooks; shared ESLint/Prettier config.
- ⬜ Seed script + fixture models for local dev.

### Security & privacy (PRD §9.6)
- ⬜ Confirm **no network egress** by default; document the trust boundary.
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

---

## Suggested near-term sequence

1. **3-statement template + golden balance test** (§1.1) — proves the engine.
2. **Editable line items + formula editor in the UI** (§1.3).
3. **Excel export** (§1.5).
4. **AI change-review (accept/reject) UI** (§2.2) — the differentiator.
5. **Sensitivity + goal seek** (§2.1).

Everything above (1–4) is the shortest path to the MVP exit criteria; item 5
opens V1.
