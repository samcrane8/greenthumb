# Reactive Python cells in Greenthumb — scoping doc

*Draft, 2026-07-22. Status: concept scoping, pre-decision.*

## Summary

Add executable Python cells to Greenthumb models so data-leaning analysts can compute anything (correlations, betas, volatility, regressions, custom transforms) that the formula language can't express. The key design decision — the thing that separates a great version from a mess — is that a code cell is **not** an embedded Jupyter REPL. It is a **typed transform node in the same dependency graph as drivers and formula items**: it declares which model series it reads and names the series/tables/scalars it produces, and those outputs are first-class citizens that flow into charts, stats, scenarios, and backtests. Execution is **reactive dataflow** (edit a cell → only the genuinely-downstream cells re-run), not classic top-to-bottom notebook execution with hidden state. This directly closes the biggest gap found in the Bitcoin-liquidity study — that all the real statistics had to be computed outside the tool — without fracturing the declarative engine that makes scenarios and backtesting work.

## Problem & motivation

Greenthumb's formula engine is accounting/pro-forma-oriented (`prior`, `cumulative`, `scurve`, `if`, `max`, `min`). It has no statistical or time-series functions — confirmed directly: `correl()`, `beta()`, and `stdev()` are unknown functions, and a model using them passes `validate_model` but fails at compute time. As a result, an empirical query like "how much does Bitcoin follow liquidity?" has to leave the tool entirely: resampling, log returns, rolling correlation, rolling beta, volatility, drawdown, and the lead/lag regression were all done in Python, then the results were the only thing that could come back in.

Two options exist to close that gap. A **built-in statistics function library** (`correl`, `beta`, `rolling(...)`, `slope`, `r2`, …) is safe, approachable, and works in scenarios natively — but it's bounded and you're forever chasing the next function someone needs. **Python cells** are unbounded and match how the target user already works, but naively embedded they become an opaque black box the engine can't reason about. This doc scopes the Python-cell path in the form that keeps the engine's guarantees.

Target user: the data-leaning financial analyst who is fluent in pandas/numpy and today does this work in Jupyter, then screenshots charts into a deck. The pitch is "your notebook, but the outputs are live model series wired into scenarios, dashboards, and exportable analyses."

## Core design principle

**A code cell is a graph node, not a REPL.** Concretely:

- Each cell has a **declared input set** — the model series, drivers, tables, or scalars it reads — and a **named output set** — the series/tables/scalars it writes back into the model namespace.
- The engine builds a dependency DAG across drivers, formula items, and code cells uniformly. It does not need to parse Python semantics; it needs the cell's declared (or statically-inferred) inputs and outputs.
- A cell's outputs are indistinguishable, downstream, from a formula item's output. A chart, stat tile, or another formula can reference `btc_liq_corr` without knowing it came from Python.

This is the single decision everything else hangs on. Get it right and Python cells inherit scenarios, backtests, charts, and export for free. Get it wrong (opaque imperative cells) and Python logic falls outside all of that.

## How it works

### The cell contract

A cell exposes inputs and outputs explicitly so the engine can wire it into the DAG. Two ways to get the input/output sets, in rough order of preference:

1. **Static inference** — parse the cell for references to a provided namespace handle (e.g. reads of `gt["btc_price"]` and assignments to `gt.out["corr"]`). Cleanest UX; no boilerplate.
2. **Declared header** — an explicit `inputs=[...] , outputs=[...]` declaration when inference is ambiguous.

Sketch of the analyst-facing surface (illustrative, not final):

```python
# inputs inferred from gt[...] reads; outputs from gt.out[...] writes
btc  = gt["btc_price"].weekly()          # model series -> pandas Series
liq  = gt["global_liquidity"].weekly()

ret  = np.log(btc).diff()
corr = ret.rolling(26).corr(np.log(liq).diff())

gt.out["btc_liq_corr"] = corr            # published as a first-class model series
gt.out["latest_corr"]  = float(corr.dropna().iloc[-1])   # scalar stat
```

`btc_liq_corr` is now chartable and referenceable exactly like a formula item; `latest_corr` can back a stat widget.

### Reactive execution

- The engine tracks the DAG of driver → formula → cell → chart dependencies. Editing a cell (or an upstream input) invalidates and re-runs **only** the downstream nodes, in dependency order.
- No hidden state, no out-of-order execution, no "did I run cell 3 after editing cell 1?" This is the property that makes "see it change in real-time" both possible and *correct*. It is the opposite of classic Jupyter's mutable-kernel model.
- Debounce on edit; show per-cell run state (stale / running / fresh / error). Long-running cells run async and stream their fresh outputs when done.

### Types crossing the boundary

Define a small, explicit marshalling contract so the engine and Python agree:

- **Model series ↔ pandas Series/DataFrame**, indexed by the model timeline (with helpers to resample: `.weekly()`, `.monthly()`, `.align_to(timeline)`).
- **Scalars ↔ Python numbers** (for stat widgets and scenario-varied assumptions).
- **Tables ↔ DataFrame** (for statement/table widgets).
- Outputs that don't match the model's timeline granularity must declare their own index; the engine stores series on their native grid and resamples for display.

## Integration with the existing engine

**Scenarios.** This is the payoff of the graph design. Because a cell's inputs are declared model refs, the engine can substitute a scenario's overrides upstream and re-run the cell. Running the Bitcoin analysis under a "Drawdown" scenario recomputes the correlation/beta series with the drawdown price path — automatically. (Caveat: cell code must be a pure function of its declared inputs. See risks.)

**Backtests / walk-forward / scoring.** Cells that consume `actualsThrough`-aware series participate in the existing backtest discipline. A Python-computed signal can be scored the same way a formula forecast is, as long as it respects the actuals cursor (no lookahead). Worth a lint that flags full-sample statistics used in a backtest context.

**Charts & dashboard.** Cell outputs appear in the same series picker as items/drivers. No chart changes required for line/area/bar/composed. New chart types that empirical work wants (scatter-with-regression, rolling-correlation, lead/lag heatmap) are a separate, additive workstream.

**Analysis / narrative (the tabled idea).** A code cell is another block type that *produces* exhibits. The narrative/analysis surface composes cell outputs + prose; the snapshot-at-publish semantics below are what make a notebook-backed analysis reproducible.

## Execution environment

Recommended: a **local Python kernel** on the analyst's machine (Greenthumb is a desktop app).

- **Pros:** full scientific stack (pandas, numpy, statsmodels, scikit-learn) with the user's own packages; no server cost; sidesteps running untrusted user code in our cloud; data stays local.
- **Cons:** environment drift between users (mitigated by pinning — see reproducibility); we depend on a local Python being present (bundle a managed runtime, e.g. a pinned CPython + curated wheels, so it works with zero setup).
- **Alternatives considered:** Pyodide/WASM in-app (great sandboxing and zero-install, but limited packages and slower for heavy stats) — reasonable as a fallback for users without a local kernel. A hosted server kernel (full power, but security/sandboxing/cost and it breaks the "data stays local" story) — deprioritized.

Resource guards regardless of location: per-cell CPU/memory/time limits, cancellation, and a hard timeout with a clear error surfaced on the cell.

## Reproducibility & snapshot semantics

Notebooks are notoriously hard to reproduce; finance analyses are claims you may have to defend. So:

- **Pin the environment** per model: runtime version + a locked package set. Surface it; warn on drift.
- **Publish = freeze.** When a model/analysis is published or exported, snapshot each cell's resolved inputs and computed outputs (and the code + env hash). The live dashboard keeps updating; the published analysis stays internally consistent with the numbers in its prose. ("BTC is up 47% as of July 2026" must not silently become a different number.)
- **Deterministic by default.** Seed RNG; discourage wall-clock/network reads inside cells (lint + optional sandbox that blocks network). Non-deterministic cells are allowed but flagged as non-reproducible.

## UX surface

- Cells live **inside the model**, alongside drivers and formulas; they can be surfaced on a dashboard as a "code" widget (collapsible: show code, show output, or both).
- **Edit → live update** is the headline interaction: change a rolling window from 26 to 13 weeks, watch the correlation chart redraw. This is the "feels like a real analysis" moment and the single strongest reason to build this.
- Per-cell state chip (stale/running/fresh/error), inline error + traceback, and a "what depends on this" affordance so the DAG is legible.
- Keep the code layer **optional and secondary**: an analyst who never opens a cell should see no added complexity. Code cells are progressive disclosure, not the front door.

## Positioning & audience

Keep the **declarative formula model as the spine**; make Python the **optional power layer**. Ship a *small* set of built-in formula stats (`correl`, `stdev`, `pct_change`, `drawdown`, a `rolling(...)` wrapper) for the spreadsheet-native analyst who will never open a code cell, and Python cells for the pandas-native quant. The failure mode to avoid: becoming a slightly-worse Jupyter for quants while intimidating the analysts who liked that Greenthumb felt like a spreadsheet.

## Prior art to study

- **Marimo** — reactive Python notebook that eliminates hidden state by parsing cells into a dataflow DAG. Closest existing model to the execution semantics proposed here.
- **Hex / Count** — notebook cells wired into a DAG that publishes to a report or an infinite canvas; strong reference for notebook→shareable-artifact.
- **Observable** — reactive-by-default notebooks; the gold standard for edit→live-update UX (JS, but the reactivity model transfers).
- **Deepnote / Mode** — notebook→report workflows and collaboration patterns.

The novel part Greenthumb owns: fusing a reactive notebook with a **scenario + forecast + capital-stack engine**. None of the above have that; it's the moat.

## Phased delivery

**Phase 0 — spike (1–2 wks).** Local kernel + one cell that reads a model series and writes one output series that renders in an existing chart. Prove the round-trip and the marshalling contract. No reactivity yet.

**Phase 1 — MVP.** Static input/output inference; single-cell reactivity (edit → recompute → chart updates); series + scalar outputs; error surfacing; bundled pinned runtime. Ships the core "compute stats in-tool and see them live" value.

**Phase 2 — graph + scenarios.** Multi-cell reactive DAG; cell outputs participate in scenario recompute; DataFrame/table outputs; backtest/actuals-cursor awareness with lookahead lint.

**Phase 3 — analysis & reproducibility.** Snapshot-at-publish; env pinning + drift warnings; code widget on dashboards; empirical chart types (scatter+regression, rolling-corr, lead/lag heatmap).

**Phase 4 — polish.** Package management UX, templates/snippets (a "market study" starter that reproduces the Bitcoin-liquidity analysis), sharing/versioning.

## Risks & mitigations

- **Opaque cells fracture the engine.** *Mitigation:* the entire graph-node design; refuse to ship free-floating REPL cells whose I/O the engine can't see.
- **Impure cells break scenarios.** A cell that reads global/network/random state won't recompute correctly per scenario. *Mitigation:* purity lint, network-off sandbox by default, seeded RNG, and flagging impure cells as non-scenario-safe.
- **Lookahead in backtests.** Full-sample statistics silently leak the future. *Mitigation:* actuals-cursor-aware series handles and a lint that warns when a backtested cell reads beyond the cursor.
- **Reproducibility drift.** Different package versions → different numbers. *Mitigation:* pinned runtime, env hash on published analyses, snapshotted outputs.
- **Audience bifurcation / intimidation.** *Mitigation:* code layer is optional/progressive; keep formula stats for non-coders.
- **Security of executing user code.** *Mitigation:* local kernel keeps it on the user's machine; resource limits and cancellation; optional sandbox.
- **Performance on large series / heavy stats.** *Mitigation:* async execution, debounce, per-cell limits, cache unchanged upstream results.

## Non-goals

- Not a general-purpose IDE or a replacement for the user's real Jupyter/research environment.
- Not server-side hosted compute (at least initially).
- Not arbitrary side-effecting scripts (DB writes, external API mutations) — cells compute model series, they don't run operations.
- Not a rewrite of the formula engine; formulas remain the primary, approachable surface.

## Open questions / decisions needed

- **Input/output discovery:** static inference vs. explicit declaration vs. both? (Leaning both, inference-first.)
- **Runtime:** bundle a managed CPython, or require/allow the user's own interpreter, or offer both?
- **Purity enforcement:** hard sandbox (block network by default) vs. soft lint-and-warn?
- **Granularity mismatch:** how opinionated should auto-resampling be when a cell's output index doesn't match the model timeline?
- **Language scope:** Python only, or leave room for SQL cells (data pull) feeding Python cells — a common analyst pattern?
- **Where cells live:** model-level only, or also standalone/scratch cells not attached to a scenario?

## Success signals

- Analysts run empirical studies (correlation/beta/vol/regression) **inside** Greenthumb instead of exporting to Jupyter — i.e., the "step 1 happens outside the tool" tell from the Bitcoin study disappears.
- Edit→live-update is used iteratively (window/param sweeps), not just once.
- Code-cell outputs show up in scenarios and published analyses, not just ad-hoc charts.
- Non-coding analysts are unaffected (no drop in formula-model usage or increase in confusion).
