# Product Requirements Document — Local Financial Modeling Service

**Working name:** *(TBD — e.g. "Ledger", "Struct", "ModelKit")*
**Author:** Sam Crane
**Status:** Draft v0.1 for review
**Date:** July 9, 2026

---

## 0. A note on how this draft was produced

This PRD was drafted from financial-modeling domain knowledge and the architecture that a "local app + MCP server for structuring models" implies. It could not yet be grounded in your own material: in this session I had no access to prior Claude conversations, and the local **Finance** folder (`/Users/samuelcrane/Claude/Projects/Finance`) was not reachable when I wrote this. Sections that would most benefit from your real models are flagged with **⟢ Validate against your models**. When the folder reconnects, the highest-value edits are: which model *types* to prioritize, your formula and naming conventions, and whether Excel round-tripping is a hard requirement.

---

## 1. Summary

A **local-first application that helps you structure, build, and maintain financial models** through two coordinated interfaces:

1. **A UI** — a human-facing workspace for viewing and editing models directly (a familiar grid, plus structure, driver, scenario, and audit views).
2. **An MCP server** — a machine interface that lets Claude (or any MCP client) create new models and update existing ones conversationally, operating on the *same live model* the UI shows.

The core idea that distinguishes this from a spreadsheet: **models are stored as structured, semantic objects — a graph of drivers, line items, and time-aware calculations — not as an opaque grid of cells.** That structure is what makes a model simultaneously legible to a human, safe to edit programmatically, and reasoned-about by an AI. Excel is a canvas; this is a model *engine* with two front ends.

---

## 2. Problem statement

Financial modeling today lives almost entirely in spreadsheets, which creates recurring friction:

- **Structure is implicit.** The logic of a model lives in cell references and copied formulas. Intent ("this is the hiring plan; it drives opex") is not represented anywhere the machine can see, so models are hard to audit, hard to hand off, and easy to break.
- **AI can't safely touch a spreadsheet.** An LLM asked to "add a downside scenario" to an `.xlsx` is manipulating strings in cells with no guarantee it preserved integrity (balance sheet balances, no broken references, correct sign conventions).
- **Repetitive scaffolding.** Every new model re-creates the same skeleton — timeline, statement structure, scenario plumbing — by hand.
- **Weak provenance.** It's hard to see what changed between versions, or *why* a number is what it is, especially once several people (or an AI) have edited it.

The bet: if a model is a **typed, validated object graph** with a real calculation engine behind it, then (a) humans get structure, auditability, and speed, and (b) an AI can build and modify models through a constrained tool interface that *cannot* silently violate the model's integrity.

---

## 3. Goals and non-goals

### Goals

- Represent financial models as **structured, semantic, version-controllable objects** with a real dependency-aware calculation engine.
- Let a modeler **build and maintain models faster** than in Excel for the structured 80% of the work, with first-class scenarios, drivers, and auditability.
- Expose an **MCP server** that makes Claude a first-class collaborator: it can create models from a prompt, extend them, run analyses, and explain them — with every write validated and reviewable.
- Run **entirely locally by default** — model data never leaves the machine unless the user explicitly connects something.
- Keep models **legible and portable**: a plain, diffable file format and clean Excel export.

### Non-goals (at least initially)

- **Not a general-purpose spreadsheet.** We are not rebuilding Excel's arbitrary-cell canvas; we model *financial* structures.
- **Not a cloud/SaaS multi-tenant platform** in v1. Local-first; team/cloud is a later, opt-in layer.
- **Not real-time market data or trading.** Actuals and drivers, not tick data.
- **Not a BI/reporting suite.** We produce statements, KPIs, and charts sufficient for modeling — not a Tableau replacement.
- **Not fully autonomous AI editing.** The AI proposes and can apply changes, but through validated, reviewable operations — not unattended rewrites of financial logic.

---

## 4. Target users and personas

**Primary — the Modeler (you).** Builds 3-statement models, valuations, operating models, and forecasts. Wants speed on the structural work, confidence that the model is internally consistent, and the ability to hand work to an AI without losing control.

**Secondary — the Reviewer / stakeholder.** Opens a model to understand or check it. Cares about traceability ("why is this number what it is?"), scenario comparison, and a clean output view — not about editing formulas.

**First-class non-human user — the AI assistant (Claude via MCP).** Treated as a real actor in the system: it reads model structure, proposes and applies changes through tools, runs analyses, and explains results. Its edits are validated and logged like anyone else's.

⟢ **Validate against your models:** the mix of who actually touches your models (solo vs. shared with partners/clients) shapes how much collaboration and review tooling matters in early phases.

---

## 5. Core use cases

The system should make each of these feel natural, from either the UI or through Claude:

1. **Scaffold a new model from a prompt.** "Build a 3-statement model for a SaaS company, monthly for 3 years, with these starting assumptions." → a populated, internally consistent model appears.
2. **Add and wire a driver.** "Add a hiring plan and flow fully-loaded cost into opex." → a new driver series plus the formulas that consume it.
3. **Create and compare scenarios.** "Make a downside where churn doubles and new-logo growth halves; show me EBITDA and cash runway vs. base."
4. **Explain a result.** "Why is EBITDA negative in FY2?" → a precedent trace back to the drivers responsible.
5. **Fold in actuals.** "Update the model with April actuals from this CSV and re-baseline the forecast."
6. **Extend / restructure.** "Extend the forecast to 5 years." / "Split revenue into three product lines."
7. **Run sensitivity / solve.** "Sensitivity table of gross margin across price and volume." / "What ARR growth gets us to breakeven by Q4?"
8. **Review AI changes.** See exactly what Claude changed (drivers, formulas, structure), with accept/reject before it's committed.
9. **Export & share.** Produce an Excel workbook, a PDF summary, or a JSON snapshot for a colleague.

---

## 6. Domain model — what a "model" *is* in this system

This is the heart of the product; every feature and MCP tool is defined in terms of these objects.

**Model.** The top-level container. Metadata: name, type/template, base currency, unit conventions, fiscal-year configuration, created/modified, version. Holds a timeline, a set of items, a set of drivers, a set of scenarios, and derived outputs.

**Timeline.** The time axis: granularity (monthly / quarterly / annual, or mixed), start and horizon, fiscal calendar, and the boundary between **actuals** (historical, locked) and **forecast** periods. Supports roll-ups (monthly → quarterly → annual as views).

**Line Item (Series).** A named, typed time series — the atomic unit of the model. Each has: a semantic **category** (revenue, COGS, opex, headcount, asset, liability, equity, cash-flow line, KPI…), a **unit** (currency, %, count, ratio, per-unit), and a **definition** that is either an **input** (hard values or a driver reference) or a **formula** over other items. Items carry a stable **name/ID** so references are semantic, not positional.

**Driver / Assumption.** A distinguished input that feeds formulas but isn't itself a statement line — growth rate, price, churn %, hiring plan, DSO/DPO, capex schedule, discount rate. Can be a scalar, a time series, a step/ramp function, or a small table. Drivers are what scenarios override and what sensitivities sweep.

**Formula (time-aware expression).** References other items/drivers by name and supports financial time semantics beyond plain arithmetic: `prior()` / lag / lead, cumulative and rolling windows, YoY/QoQ growth, ramp/spread over N periods, min/max/if, and roll-ups. This small domain-specific language is the calc engine's contract.

**Scenario.** A named overlay of driver values (Base / Bull / Bear / custom). A scenario overrides a subset of drivers; the engine recomputes all dependent outputs per scenario. Base is always present.

**Actuals.** Imported historical values mapped onto items, so a model shows a continuous history-plus-forecast series with a clear cutover.

**Output / Statement.** Derived, structured views over the item graph: Income Statement, Balance Sheet, Cash Flow, plus KPI dashboards and charts. In a well-formed 3-statement model these are *organized views with integrity constraints*, not separately maintained tabs.

**Template / Model type.** A starting structure encoding a domain: **3-statement**, **DCF / valuation**, **LBO**, **SaaS / ARR & unit economics**, **FP&A / budget vs. actual**, **project finance**, **real estate**, **cohort / retention**. Templates seed items, drivers, statements, and integrity checks.

⟢ **Validate against your models:** your naming conventions, sign conventions, and the exact statement structures you use should become the defaults. This is the single most valuable thing to calibrate from the Finance folder.

---

## 7. Functional requirements

### 7.1 Model authoring and structure
- Create models from templates or blank; clone and derive models.
- Add / edit / remove / regroup line items and drivers; organize into sections (e.g., revenue build, cost build, working capital, financing).
- Configure the timeline; extend the horizon; set the actuals/forecast cutover.
- A formula editor with **autocomplete on item and driver names** and inline validation.

### 7.2 Calculation engine
- **Dependency graph** with incremental, topologically-ordered recompute (only recalculate what changed).
- **Circular-reference handling:** detect accidental cycles *and* support intentional circularity (e.g., interest expense ↔ debt balance ↔ cash) via an **iterative solver** with convergence controls. (This is essential for real 3-statement models and is where naive engines fail.)
- Time-series operators (prior, lag/lead, cumulative, rolling, growth, ramp/spread) and period roll-ups.
- Unit- and currency-aware arithmetic; FX handling for multi-currency models.

### 7.3 Scenarios and analysis
- **Scenario manager:** define scenarios as driver overlays; switch and compare side by side.
- **Sensitivity tables:** one- and two-variable data tables over any driver(s) and output.
- **Goal seek / solver:** find the driver value that hits a target output.
- **Monte Carlo** (later): distributions on drivers → distribution of outputs.

### 7.4 Validation and integrity
- Continuous integrity checks: **balance sheet balances (A = L + E)**, **cash flow ties to the change in cash**, no dangling references, consistent sign conventions, driver bounds/sanity checks.
- Errors and warnings surfaced in the UI *and* returned to the MCP client, each with a plain-language explanation and a pointer to the offending item.
- **Writes are validated before commit** — neither a human nor the AI can leave the model in a broken state without an explicit override.

### 7.5 Versioning, audit, and provenance
- **Snapshots / version history** with named checkpoints.
- **Diff between versions:** what drivers, formulas, and structure changed (not just cell values).
- **Change feed / audit log** attributing every change to an actor (you, a collaborator, or Claude) with timestamp and rationale.
- **AI change review:** changes proposed via MCP can be previewed as a diff and **accepted or rejected** before they land. (Treat AI edits like a pull request against the model.)
- Comments / annotations on items and drivers.

### 7.6 Trace and explainability
- **Precedent / dependent tracing:** for any number, show what feeds it and what it feeds — the "why is this what it is" view.
- Natural-language explanation of a result, available in the UI and as an MCP tool.

### 7.7 Import / export and interoperability
- **Excel export** (values and, where feasible, reconstructed formulas) — likely a hard requirement for sharing with people who live in Excel.
- **Excel import** with structure mapping (hard problem; phase carefully — see risks).
- **CSV import** for actuals; **Google Sheets** sync (optional).
- **PDF / report export** for outputs and a model summary.
- **JSON model export** for portability, backup, and programmatic use.

### 7.8 Data connectors (later)
- Actuals from accounting systems (QuickBooks, Xero, NetSuite), revenue from Stripe, bank/CSV. All opt-in, all local, all logged.

⟢ **Validate against your models:** whether Excel round-trip is "must share editable workbooks" vs. "occasional export" changes v1 scope materially.

---

## 8. The MCP server — tool surface

The MCP server is how Claude operates the same live model the UI shows. Design principles:

- **Operate on semantic objects,** never cell coordinates. Tools speak in models, items, drivers, scenarios.
- **Validate on write.** Every mutating tool runs integrity checks; it returns success only if the model stays valid (or the caller passed an explicit override).
- **Return structured results *and* a human-readable summary,** so Claude can both act and narrate.
- **Support preview / dry-run.** Mutations can return a diff without committing, enabling the accept/reject review flow.
- **Transactional and idempotent where possible.** A multi-part change applies atomically; re-issuing a create with the same key doesn't duplicate.
- **Bound to localhost.** The server never exposes model data off the machine.

**Illustrative tool set** (grouped; names indicative):

*Discovery / read*
- `list_models`, `get_model`, `describe_schema`
- `get_line_item`, `search_items`, `get_driver`
- `get_output(statement, scenario, periods)` — statements/KPIs as structured data
- `trace_precedents(item, period)` — explainability

*Model lifecycle*
- `create_model(template, timeline, metadata)`, `clone_model`, `delete_model`

*Structure editing*
- `add_line_item`, `update_line_item`, `set_formula`, `remove_item`, `group_items`
- `add_driver`, `set_assumption` (scalar / series / step / ramp)
- `set_timeline`, `extend_periods`

*Scenarios & analysis*
- `create_scenario`, `set_scenario_value`, `compare_scenarios`
- `run_sensitivity(output, drivers[])`, `goal_seek(output, target, driver)`
- `get_kpis`

*Actuals & data*
- `import_actuals(source, mapping)`, `map_actuals`

*Validation & versioning*
- `validate_model` → structured issues + explanations
- `snapshot(label)`, `diff_versions(a, b)`, `list_history`

Every mutating tool takes an optional `preview: true` and returns a diff; the UI subscribes to the same engine so applied changes appear live.

⟢ **Validate against your models:** the exact vocabulary of drivers and statement lines you use should shape tool parameter enums and templates so Claude speaks your dialect.

---

## 9. Technical architecture

### 9.1 Shape
A single **core engine** owns the model state and calculation graph. Both front ends talk to it:

```
        ┌──────────────┐        ┌────────────────────┐
        │      UI       │        │  MCP server         │
        │ (grid, panels)│        │ (Claude / clients)  │
        └──────┬───────┘        └─────────┬──────────┘
               │      same live model      │
               └───────────┬──────────────┘
                    ┌───────▼────────┐
                    │  Core engine    │
                    │  • model store  │
                    │  • calc graph   │
                    │  • validation   │
                    │  • versioning   │
                    └───────┬────────┘
                    ┌───────▼────────┐
                    │  Storage        │
                    │  (files on disk)│
                    └────────────────┘
```

Key property: **one source of truth.** When Claude writes through MCP, the UI updates live (via a subscription/event channel), and vice-versa. No divergent copies.

### 9.2 Storage and file format
- Recommend a **plain-text, human-readable, diff-friendly** primary format (JSON or YAML, schema-validated) so models are **git-versionable**, auditable, and AI-legible. A model is a file (or a small project directory: model + actuals + snapshots).
- Use **SQLite** alongside it for large actuals/time-series where a flat file gets unwieldy.
- This choice directly enables §7.5 (diffs, version history) and makes the audit story strong.

### 9.3 UI
- Options: a **desktop app** (Tauri or Electron) or a **local web app** served on `localhost` and opened in the browser. Tauri gives a smaller, native footprint; Electron is faster to build with; a localhost web app is simplest to iterate. Front end in React (or Svelte) with a virtualized grid component for performance.

### 9.4 Core engine and calc graph
- Language options with trade-offs:
  - **TypeScript/Node** — one type system shared across engine, MCP, and UI; fastest path; adequate performance for most models.
  - **Rust** — best calc performance and correctness guarantees; pairs naturally with Tauri; more upfront cost.
  - **Python** — richest financial/analytics ecosystem (great for Monte Carlo, solvers) but weaker as a always-on local engine.
- The engine implements the dependency graph, incremental recompute, the iterative solver for intentional circularity, and the validation rules.

### 9.5 MCP server
- Runs locally, exposing the engine over MCP. Support **stdio** transport (for Claude Desktop / Cowork) and optionally local **HTTP/SSE**. It is a thin, well-typed adapter over the core engine's API — the same operations the UI uses — plus preview/diff support.

### 9.6 Security and privacy
- **Local-only by default;** no network egress of model data. MCP server bound to localhost. Connectors and any cloud sync are explicit opt-in, per-source, and logged. Full audit trail of AI actions.

⟢ **Validate against your models / your preferences:** language and UI-shell choices should bend to what you're comfortable maintaining and any existing tooling in the Finance folder.

---

## 10. Phasing and roadmap

**MVP — prove the core loop.**
Core engine + calc graph (incl. iterative solver) · plain-text file format · one or two templates (likely **3-statement** and/or **SaaS/ARR** — TBD from your models) · basic grid UI + driver panel · Base scenario · MCP tools for create/read/update items and drivers, `get_output`, `validate_model` · Excel export. *Success test:* Claude scaffolds a working, balancing model from a prompt and you can edit it in the UI.

**V1 — make it a real tool.**
Full scenario manager + comparison · sensitivity tables · versioning + diff + audit feed · **AI change review (accept/reject)** · integrity checks surfaced everywhere · precedent tracing UI · Excel import (mapped) · multiple templates · goal seek.

**V2 — depth and reach.**
Data connectors (QuickBooks / Stripe / bank) · Monte Carlo · solver enhancements · optional team/cloud sync · template library/marketplace · richer reporting/PDF.

---

## 11. Open questions (decisions needed from you)

1. **Model types to prioritize** — which do you build most (3-statement, DCF, LBO, SaaS, FP&A, project finance, real estate)? Drives template order. *⟢ Best answered from the Finance folder.*
2. **Excel interoperability** — replacement, or must models round-trip to editable Excel for colleagues/clients?
3. **File format & version control** — do you want models to live in git? Single file vs. project directory?
4. **UI shell** — desktop app (Tauri/Electron) vs. localhost web app?
5. **Engine language** — TypeScript (fastest to ship, unified types), Rust (performance/correctness), or Python (analytics ecosystem)?
6. **Single-user vs. eventual team use** — how much collaboration/review tooling belongs early?
7. **AI autonomy** — how much should Claude change on its own vs. always propose-and-approve?
8. **Naming/sign conventions** — adopt your existing conventions as defaults. *⟢ From the Finance folder.*

---

## 12. Risks and mitigations

- **Excel import fidelity** is genuinely hard (arbitrary layouts, volatile formulas). *Mitigation:* treat import as best-effort mapping with human confirmation; don't gate MVP on it; nail export first.
- **Calc-engine correctness**, especially circularity and edge cases. *Mitigation:* iterative solver with convergence controls; a strong golden-file test suite; validate-on-write.
- **Scope creep toward "rebuild Excel."** *Mitigation:* hold the line on §3 non-goals; model financial structures, not an arbitrary grid.
- **UI ↔ MCP state divergence.** *Mitigation:* single core engine as source of truth with a subscription channel; no second copy of state.
- **AI making subtly wrong edits.** *Mitigation:* validated tools, preview/diff, accept-reject review, and a full audit trail — AI edits reviewed like a pull request.
- **Performance on large models.** *Mitigation:* incremental recompute, virtualized grid, SQLite for big series.

---

## 13. What sharpens this next

The fastest way to make this PRD concrete is to reconnect the **Finance** folder so I can read a few representative models. From those I can (a) pick the MVP template(s), (b) capture your naming/sign/formula conventions as defaults, (c) confirm whether Excel round-trip is a hard requirement, and (d) turn the illustrative MCP tool list into a precise, typed contract in your vocabulary. If you'd rather, point me at specific files in Drive or paste a model's structure, and I'll fold it in.
