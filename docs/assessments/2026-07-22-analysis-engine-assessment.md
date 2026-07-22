# Greenthumb as an analysis engine — where it shines, where it needs work

*An assessment grounded in actually running the Bitcoin-vs-liquidity study through greenthumb, plus a probe of its modeling and export layers. Written 2026-07-22.*

## TL;DR

Greenthumb is an excellent **forecasting and valuation engine** — timelines, driver-based formula models, scenarios, a capital-stack solver, a bitcoin power-law price model, and a genuinely disciplined backtest/scoring toolkit. It is not yet an **empirical analysis engine**, which is what a query like "how much does Bitcoin follow liquidity?" actually needs. That study is a statistical time-series exercise (rolling correlations, betas, volatility, drawdown, lead/lag regressions), and today none of those can be computed inside greenthumb's formula language, none of the liquidity data can be sourced through its providers, and there is no export-to-HTML/PDF call on the tool surface.

The good news: the primitives to *host* such an analysis already exist (series drivers, charts with dual-axis and rebasing, a 12-column dashboard, and `note` text widgets). The gaps are concentrated in three places — a statistics function library, a macro data provider, and a document export path. Close those three and greenthumb could run and ship this class of analysis end to end.

## What greenthumb is, structurally

A model is a graph: a **timeline** (monthly/quarterly/annual, with a start date and an `actualsThrough` cursor) → **drivers** (scalar / series / step / ramp assumptions) → **line items** (input or formula) → **scenarios** (overrides + attachable commodity price models) → **charts** (line/area/bar/composed, series referenced by name, with `index` rebasing and left/right axes) → a **dashboard** (12-column grid of `stat`, `chart`, `statement`, and `note` widgets). Templates ship for `blank`, `saas`, and `bitcoin_treasury`. Data comes from a keyless Yahoo provider (Alpha Vantage behind a key; a synthetic `demo` source), and bitcoin has a built-in "power law + halving-cycle oscillation" price model.

It's a serious tool. The `bitcoin_treasury` template models an MSTR-style entity as a levered residual claim on BTC — reserve, perpetual preferred, dividend coverage, mNAV, implied leverage — with a drawdown scenario and a capital-stack waterfall. That's conceptually the same "leverage amplifies the trend" story the Bitcoin analysis landed on, just expressed as a pro-forma instead of a statistical study.

## Stage-by-stage: the Bitcoin-liquidity pipeline through greenthumb

### 1. Discovery — worked great
`list_data_providers`, `list_commodities`, `list_templates`, and `list_models` gave clean, structured, immediately-usable inventories. The Yahoo provider is keyless and pre-configured, so there was zero setup friction to start pulling data. Knowing up front that only `bitcoin` has a commodity model, and that three templates exist, made the capability boundary legible.

### 2. Data acquisition — mixed
The strong part: greenthumb reached Yahoo from your device and returned 11 years of daily history in one call, with working `from`/`to` bounds. In a cloud sandbox where Yahoo is firewalled, greenthumb *was* the data bridge — nothing else could have fetched it. That's a real strength and it should be protected.

The friction, all concrete:
- **Payloads are enormous.** A single BTC pull was ~344,000 characters and blew past the tool-result token cap; gold and QQQ were ~238k and ~245k. Each had to be spilled to a file and parsed out of band. For an agent trying to *reason over* the data, that's a wall. There's no server-side resampling (weekly/monthly) or aggregation, so you always pay for full daily granularity even when you want weekly.
- **Close-only.** The series return `{date, close}` — no OHLC, no volume. Fine for return/vol/correlation work, but it forecloses anything volume- or range-based.
- **Symbol coverage is uneven.** `GC=F` (gold) worked; `^IXIC` (Nasdaq Composite) failed with a Yahoo 404 and I had to substitute `QQQ`. Caret-prefixed index tickers appear unsupported or un-normalized.
- **No macro data at all.** This is the big one for *this* query. The entire liquidity side — global M2, central-bank balance sheets, rates — does not exist in any greenthumb provider. I had to leave the tool entirely and pull it from FRED. A "Bitcoin vs liquidity" analysis literally cannot be sourced inside greenthumb today.

### 3. Transformation & statistics — not possible in-tool (the core gap)
Everything that made the analysis an *analysis* — resampling to weekly, log returns, year-over-year growth, 26-week rolling correlation, rolling beta to Nasdaq and gold, annualized volatility, drawdown from peak, and the lead/lag regression with its R² — was done in Python. None of it is expressible in greenthumb's formula language.

I verified this directly. I built a scratch model, added two series drivers, and tried to add formula items using `correl()`, `beta()`, and `stdev()`. Two things happened, both instructive:
- `add_line_item` accepted them and **`validate_model` reported "0 issues — arithmetically sound."**
- But actually computing the model told the truth: `get_chart_data` returned **`Unknown function 'correl()'`** and `get_output` returned a 500.

So the formula engine's function set is accounting/pro-forma-oriented (`prior`, `cumulative`, `scurve`, `if`, `max`, `min`, arithmetic) with no statistical or time-series functions. And separately, **`validate_model` gives false confidence** — it passed a model containing functions that don't exist. "Valid" currently means "structurally/arithmetically coherent," not "will compute."

### 4. Modeling / valuation — strong, but a different job
This is greenthumb's home turf and it's good at it: driver overrides per scenario, commodity price models attachable to a scenario (the `bitcoin` power-law + halving oscillation is genuinely relevant to the *monetization-trend* question), a capital-stack waterfall, and a validation/backtest stack (`validate_model`, `run_backtest`, `walk_forward`, `score_forecast`, `replay_actuals`, `tornado`, `compare_scenarios`). The tooling is refreshingly honest about the difference between a model that balances and a model that's *right* — the validate/backtest messaging actively pushes you toward holdout testing. But this is forecasting machinery. The Bitcoin-liquidity query needed none of it; it needed descriptive statistics on historical series.

### 5. Visualization — capable, but model-bound
The chart layer is good: line/area/bar/composed, dual left/right axes, and `index` rebasing to 100 (which is exactly what the "BTC vs liquidity, indexed" comparison wants). I confirmed a dual-axis indexed chart builds and that `get_chart_data` returns chart-ready rows. Two limits: charts can only plot series that already live in the model (you must first load any external array as a driver), and there's **no chart type for empirical relationships** — no scatter-with-regression, no rolling-correlation study, no lead/lag heatmap. My analysis leaned on precisely those.

### 6. Narrative & assembly — good primitives
`note` widgets hold free text and drop onto the dashboard grid; `set_notes` annotates individual drivers/items (the MSTR model uses this well to document every assumption). So "including the text" is achievable at the dashboard level — you can interleave prose, stat tiles, and charts. This is the part of your goal that's closest to already working.

### 7. Export to HTML/PDF — missing on the tool surface
Across the whole greenthumb tool set there is no export call. `get_output` returns structured statements (income / balance sheet / cash flow / KPI) and `get_chart_data` returns chart rows — data, not a rendered document. So an agent cannot currently produce the shareable HTML/PDF (with narrative) that you're asking for *through the automatable interface*. The desktop app may well have a manual export; if so, the gap is that it isn't exposed to scripting/automation, and note text would need to carry rich formatting into it.

## The three gaps that matter, in priority order

**1. A statistics / time-series function library.** This is the highest-leverage change and the one that unlocks "handle queries like this." Add `correl`, `cov`, `beta`, `var`/`stdev`, `pct_change`/`logret`, `drawdown`, windowed variants (`rolling(window, ...)`), and a small regression primitive (`slope`, `intercept`, `r2`, and a lag argument). Everything the Bitcoin study computed in Python becomes a formula item. Bundle with it a fix so `validate_model` actually compiles formulas and flags unknown functions and NaN-producing ops — right now it will bless a model that can't run.

**2. A macro/econ data provider.** Add FRED (and similar) next to Yahoo so M2, central-bank balance sheets, rates, and FX are first-class series. Without this, any liquidity/rates/macro analysis has to leave the tool at step one.

**3. A document export path.** An `export` call that renders a scenario's dashboard — charts, stat tiles, and note prose — to HTML and PDF, returning a file. That is exactly the "generate in greenthumb, look at it, export as HTML/PDF including the text" workflow. If the desktop already renders this, exposing it to the MCP surface (with markdown-capable notes) is most of the work.

## Secondary improvements

- **Server-side resampling and a compact return mode** on `get_price_history` (weekly/monthly aggregation, columnar/CSV option) so multi-year pulls don't overflow and don't need out-of-band parsing.
- **OHLCV, not close-only**, for range/volume-based work.
- **Symbol normalization / documented symbol classes**, so index tickers like `^IXIC` either work or fail with a clear "use an ETF proxy" hint.
- **Ad-hoc / external data series** that aren't bolted to a pro-forma timeline, plus **study chart types** (scatter + regression line, rolling-correlation, lead/lag heatmap) for empirical relationships.
- **Rich-text / markdown note widgets**, so narrative survives into export with structure.

## What to preserve

The keyless, device-side data bridge; the scenario/override system; the bitcoin power-law + halving price model (directly on-point for monetization-trend work); the capital-stack analysis; and — importantly — the backtest/validate/score discipline and its refusal to conflate "the model balances" with "the model is correct." That honesty is rare and worth keeping front-and-center.

## How you'd run this analysis in greenthumb *today* (the workaround)

It's possible, but only by doing the statistics elsewhere and using greenthumb as a presentation layer:

1. Compute the derived series externally (weekly prices, returns, rolling correlation, beta, vol, drawdown) — as I did in Python.
2. Create a model whose timeline matches the sample (e.g., weekly), and load each finished series as a **series driver** (or via `import_market_actuals` for raw price series).
3. Build **charts** over those drivers — indexed BTC-vs-liquidity, the rolling-correlation lines, the vol/drawdown pair.
4. Add **stat widgets** for the headline numbers and **note widgets** for the narrative and the verdict.
5. Assemble the **dashboard**, then export from the desktop app (until an MCP export exists).

The tell is step 1: the moment the real analytical work happens *outside* greenthumb, you've found the product gap. Move the statistics inside the formula engine and add an export call, and steps 1–5 collapse into a single in-tool workflow.

## Verification notes

Findings above are from live calls, not inference: providers/commodities/templates/models were listed directly; a real `bitcoin_treasury` model graph was inspected to confirm the function set and chart/dashboard structure; and a scratch model was built and then deleted to test statistics and export. The decisive results were `get_chart_data → "Unknown function 'correl()'"` and `get_output → 500` on stat formulas that `validate_model` had already passed as "0 issues." The scratch model (`mdl_0b624115f91d`) was deleted; your three MSTR models were only read, never modified.
