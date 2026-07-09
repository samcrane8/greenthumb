# Financial Modeling — Applied Playbooks by Business Type

*The companion to `01_financial_modeling_principles.md`. The governing volume covers the universal craft — technique taxonomy, modeling discipline, backtesting methodology, and the scenario-driven improvement loop. This volume specializes all of it to the kind of business you're modeling, because the drivers, metrics, backtesting targets, and failure modes differ sharply even though the method is the same.*

---

## The fundamental split: where does value live?

Two archetypes, distinguished by a single question — **which financial statement is the engine of value?**

**Operating / profit-driven businesses** (SaaS, software, manufacturing, retail, most "normal" companies) create value on the **income statement**. They convert revenue into cash at a margin; the balance sheet is a support structure. You value them on the cash flows the operation throws off (DCF, EBITDA/revenue multiples). The central question is *how efficiently and durably does this business turn effort into profit?*

**Capital-management vehicles** (Bitcoin/asset treasury companies, insurers, holding companies, BDCs, REITs) create value on the **balance sheet**. They *are* a pool of assets funded by a stack of claims — debt, preferred, and finally common equity. The income statement is largely a *consequence* of the balance sheet (investment income on the pool, financing cost of the stack). You value them on net asset value or book value, not on a P&L multiple. The central question is *what does the asset pool earn, what does the funding cost, and how much leverage sits between the two?*

The distinction is not cosmetic. It changes which drivers you build the model around, which metrics you track, what you backtest against, how you design scenarios, and which risks can kill the company.

| Dimension | Operating / profit-driven (SaaS) | Capital-management vehicle (treasury, insurance) |
|---|---|---|
| Engine of value | Income statement | Balance sheet |
| Core equation | Revenue × margin → free cash flow | Assets − senior claims → NAV / book value |
| Star metric | Growth, margin, FCF, Rule of 40 | NAV/share, book value/share, mNAV, ROE |
| Role of leverage | Modest, incidental | Central and often extreme — the whole point |
| Valuation | DCF; revenue/EBITDA multiples | Price-to-book; NAV × premium; embedded value |
| Primary risk | Growth/margin execution, churn | Solvency, mark-to-market, reserve adequacy, coverage |
| What you backtest | Bookings/revenue vs actuals, cohort retention | NAV tracking error, reserve development, book-value growth |
| Scenario axis | Growth vs margin, CAC efficiency, TAM | Asset-price paths, tail/catastrophe loss, capital adequacy |
| Fatal failure mode | Growth stalls, unit economics never work | Senior claims exceed assets; forced liquidation; premium collapse |

---

# Part A — Operating / profit-driven businesses (SaaS and traditional)

## The value equation

Value flows from operations: `revenue → gross profit → operating profit → free cash flow`, discounted. Everything in the model exists to project how much cash the operation generates, how fast it grows, and how durably. The balance sheet mostly finances working capital and capex; it is not where the value is made.

## Key drivers to build the model around

For a SaaS/subscription business the canonical drivers are:

- **New bookings / new ARR** — the top of the funnel, often a function of sales & marketing spend and its efficiency.
- **Growth rate** — of ARR or revenue; the single most-watched number.
- **Churn / net revenue retention (NRR)** — the leak in the bucket. NRR > 100% means the existing base grows on its own; it is arguably the most important SaaS driver because it compounds.
- **Gross margin** — for software, high (70–85%) and a key part of the story.
- **CAC and LTV** — customer acquisition cost and lifetime value; LTV/CAC and CAC payback period measure whether growth is bought profitably.
- **Sales & marketing efficiency** (magic number), **R&D and G&A** as percents of revenue, showing operating leverage as the business scales.
- **FCF conversion** — how much of profit becomes cash after working capital and capex.

For traditional operating businesses the shape is the same with different labels: units × price, cost of goods, SG&A, capex, working-capital cycle.

## Key metrics and how it's valued

The headline diagnostics: **revenue growth**, **gross/operating margin**, the **Rule of 40** (growth % + FCF-margin % ≥ 40 signals a healthy balance of the two), **NRR**, **LTV/CAC**, **CAC payback**, and **FCF margin**. Valuation is a DCF on the operating free cash flows, cross-checked against revenue or EBITDA multiples of comparable companies. Because a DCF here is most sensitive to the growth trajectory, the terminal growth rate, and the discount rate, those are the first drivers to sensitivity-test.

## What to backtest (operating businesses)

Point the backtesting methodology from the governing volume at *operating* targets:

- **Bookings / revenue forecast vs actuals** — the core track record. How close were prior forecasts to realized revenue, quarter by quarter, and is there a systematic *bias* (chronic sandbagging or chronic optimism)?
- **Cohort retention** — did the retention curves you assumed for past cohorts actually hold as those cohorts aged? This is the highest-leverage backtest in SaaS because retention compounds.
- **Pipeline / funnel conversion** — did assumed lead→opportunity→close rates match what happened?
- **Margin trajectory** — did the operating leverage you projected (opex falling as a % of revenue) actually materialize, or did costs scale with the business?

Score with MAPE for communication, RMSE where a big miss on cash matters, and always track bias — sales forecasts in particular are notoriously biased in one direction.

## Scenario design (operating businesses)

The dominant, uncertain drivers are almost always **growth** and its **cost**. Design scenarios around:

- **Growth vs. margin trade-off** — "grow faster, burn more" against "grow slower, reach profitability sooner." This is the central strategic tension and deserves explicit scenarios.
- **CAC / sales-efficiency** paths — what if acquisition gets more expensive as you saturate the easy market?
- **Retention / churn** paths — a downside where NRR slips below 100% is often the difference between a great and a doomed SaaS business.
- **TAM penetration / growth-decay** — growth rates decay as a business scales; scenario the *shape* of that decay.

## Operating-business pitfalls

- **The hockey stick** — assuming reacceleration with no mechanism. Growth decays with scale; a forecast that bends back up needs a named cause.
- **Ignoring net dilution** — stock comp and new issuance quietly erode per-share value; model shares, not just aggregate value.
- **Retention hand-waving** — small NRR changes compound into huge valuation differences; never treat churn as a static plug.
- **Confusing bookings, billings, revenue, and cash** — subscription businesses recognize these on different schedules; a model that conflates them will misstate both growth and cash.

---

# Part B — Capital-management vehicles

These businesses are not valued on a P&L multiple because the P&L is downstream of a balance-sheet structure. The universal shape:

> **A pool of assets, funded by a stack of claims senior to the common equity, where leverage amplifies the returns (and losses) to the residual equity holder, and where survival is governed by solvency and coverage constraints rather than by profitability.**

Model the *balance sheet first*: what the asset pool is worth, what senior claims sit ahead of common, and therefore what is left for common (the residual). Leverage is not incidental — it is the reason these vehicles exist, and it is what makes them dangerous. Two species share this DNA: **treasury companies** and **insurers**. They differ in what the asset pool is and how the funding is priced.

---

## B1 — Treasury companies (MSTR / Strategy-style)

### The structure

A treasury company holds a single volatile asset (Bitcoin, in the archetypal case) and funds it with a layered capital stack — perpetual preferred, convertible preferred, convertible debt, and common equity. The common shareholder owns the *residual*: the value of the asset pool minus every senior claim. Everything in the model reduces to that residual and the premium the market pays for it.

### Key drivers and metrics

- **Asset price** (BTC) and **holdings** → **reserve** = holdings × price. This is the asset pool and the dominant driver of everything.
- **Senior claims** — preferred notional and debt notional, each with a cost (dividend/coupon).
- **NAV to common** = reserve + cash + other assets − debt − preferred. The residual.
- **NAV per share** = NAV to common ÷ shares.
- **mNAV (multiple of NAV / premium)** = market cap ÷ NAV (or enterprise value ÷ asset value). The market rarely prices these at 1.0× — MSTR has traded well above 2.0× and, in drawdowns, toward 1.1×. **The premium is not a footnote: analysis of MSTR attributes the bulk of both its returns and its volatility to the *premium*, not to Bitcoin directly.**
- **Implied leverage** = reserve ÷ NAV-to-common — how many dollars of asset sit on each dollar of common equity.
- **Dividend coverage** — can ongoing preferred dividends be paid? For MSTR, projected preferred dividends can exceed operating revenue, making coverage *entirely dependent on continued capital-market access*.
- **Asset yield per share** ("Bitcoin yield," sats-per-share) — whether accretive issuance is raising holdings *per share*, the metric management optimizes.

### The accretive-issuance flywheel (the thing to actually model)

The defining mechanic: when the stock trades *above* NAV (mNAV > 1), the company can **issue equity at the premium and buy more of the asset, raising asset-per-share** — accretive dilution. Rising asset prices widen the premium, which enables more issuance, which buys more asset, which… This reflexive flywheel runs in reverse in drawdowns: a falling asset price *both* shrinks NAV *and* collapses the premium *and* chokes off financing, all at once. Management prioritizes financing by accretion impact — perpetual preferred, then convertible preferred, then convertible debt, then common — a *financing waterfall* worth encoding as its own driver logic. A treasury model that omits the premium/flywheel is missing the primary value and risk mechanism.

### What to backtest (treasury companies)

- **NAV tracking** — did modeled NAV/share track realized NAV/share as the asset price moved? This isolates whether the balance-sheet mechanics are right.
- **Premium (mNAV) behavior** — did the assumed mean-reversion of the premium match how it actually moved? The premium is the hardest thing to forecast and the biggest driver of equity returns, so its backtest matters most.
- **Asset-yield realization** — did accretive issuance actually raise asset-per-share as planned, net of dilution?
- **Coverage under past drawdowns** — during historical declines, would the modeled dividend/coupon coverage have held?

### Scenario design (treasury companies)

The dominant, uncertain driver is the **asset price path**, so scenario it richly — a genuine base, a bull (e.g. a power-law or fair-value trajectory), a bear (steady bleed), and a severe drawdown. Then add the *vehicle-specific* stresses that a pure price model misses:

- **Premium collapse** — mNAV compressing to ~1.0× (or below) independent of the asset price. Because the premium drives most of the equity return, this is often the sharpest downside.
- **Forced liquidation** — a drawdown deep enough that the company must sell the asset to service senior claims, destroying asset-per-share exactly when it hurts most.
- **Solvency of the senior claims** — the probability that asset value falls below the implied backing of the preferred/debt within the horizon (for MSTR-style structures this can be a double-digit annual probability in a bad tape).
- **Capital-market access shutting** — the flywheel requires continuous issuance; a scenario where the market closes halts accumulation and can force dividend suspension, cascading through the stack.
- **Volatility compression** — convertible instruments derive much of their value from optionality; a scenario where implied volatility falls can mark the whole stack down even with a flat asset price.

### Treasury-company pitfalls

- **Modeling the asset but not the premium** — the premium contributes most of the return and volatility; a NAV-only model badly understates both upside and risk.
- **Ignoring reflexivity** — treating asset price, premium, and financing access as independent when they collapse *together* in a drawdown.
- **Forgetting the seniority waterfall** — common equity is the *residual*; in a deep enough drawdown the senior claims can exceed the entire asset pool and the common is wiped, which a naive "levered Bitcoin" model won't show.
- **Assuming permanent capital-market access** — the whole model can rest on the ability to keep issuing; make that access an explicit, stressable assumption.

---

## B2 — Insurance companies

### The structure

An insurer collects premiums today and pays claims later. The gap is **float** — a pool of other people's money the insurer invests for its own account until claims come due (6–18 months for auto, 20–50+ years for life). The insurer earns on *both* sides: an underwriting result (did premiums exceed claims and expenses?) *and* investment income on the float. The common equity holder owns the residual of an asset pool (investments funded by float and capital) against a stack of claims (reserves). This is why Buffett treats insurance as a *capital-deployment machine*, not a service business — it is a way to obtain investable leverage, sometimes at negative cost.

### Key drivers and metrics

- **Premiums** — direct/assumed/ceded written premium; the top line and the source of float.
- **Loss ratio** = claims ÷ earned premium. **Expense ratio** = operating expenses ÷ premium. **Combined ratio** = loss + expense. *Below 100% = underwriting profit; above 100% = underwriting loss.* The combined ratio is the single most important underwriting metric.
- **Float** — the investable pool between premium and claim. **Cost of float** = underwriting result ÷ average float. When the combined ratio is under 100%, the cost of float is *negative* — the insurer is *paid to hold* investable capital.
- **Investment income** = float × investment yield. On a large float this can dwarf underwriting profit itself.
- **Reserves** — *claim reserves* (recognized but unpaid claims, including IBNR — incurred but not reported) and *unearned premium reserves* (premium collected but not yet earned). Reserve adequacy is existential.
- **Book value per share** and **ROE** — the star metrics, because an insurer's value tracks its shareholders' equity far more than any earnings multiple.
- **Solvency / regulatory capital** — solvency ratio, risk-based capital, Solvency II — minimum thresholds that *constrain dividends and thus valuation*.

### How it's valued

Not on a P/E. The standard approaches are **price-to-book value** (value correlates with equity), **embedded value** for life insurers (current net asset value plus the present value of expected future profits on the in-force book), and a **dividend discount model** where sustainable dividends are capped by *regulatory capital requirements* rather than by free cash flow. The model must therefore carry the solvency constraint explicitly — capital adequacy, not cash, gates distributions.

### What to backtest (insurers)

- **Reserve development** — the single most important insurance backtest. Compare originally-booked reserves to how claims *actually developed* over subsequent years (the classic loss-development triangle). Chronic under-reserving is the canonical way insurers blow up, and it shows up as adverse development in the backtest.
- **Combined ratio forecast vs actual** — did projected loss and expense ratios match realized experience, by line of business?
- **Investment-return attribution** — did the float earn what the model assumed, and how did asset marks behave in stress?
- **Bias check on reserves** — is there a *systematic* tendency to under- or over-reserve? Directional bias here is a structural red flag.

### Scenario design (insurers)

The dominant, uncertain drivers are **claims experience** and **investment returns**, plus the **capital adequacy** that gates the whole thing:

- **Catastrophe / tail loss** — the defining insurance scenario. A single large event (natural catastrophe, mass-tort, pandemic) can spike the loss ratio far past 100%. Model tail losses explicitly, net of reinsurance.
- **Reserve strengthening** — a scenario where prior reserves prove inadequate and must be topped up, hitting book value directly.
- **Interest-rate / asset shock** — the float is invested, often in fixed income; rate moves and credit events reprice the asset side. Model *asset-liability duration mismatch* — if assets and liabilities have different durations, a rate move hits the residual.
- **Capital adequacy under stress** — the binding scenario: does the solvency ratio stay above its minimum after a bad year? If not, dividends are cut and possibly capital must be raised at the worst time. This is the insurer's analogue of the treasury company's forced-liquidation scenario.
- **Soft-vs-hard market pricing cycles** — premium adequacy swings with the underwriting cycle; scenario the combined ratio across it.

### Insurance pitfalls

- **Reserve inadequacy** — under-reserving flatters current earnings and detonates later; it is *the* classic insurance failure, and it is invisible unless you backtest reserve development.
- **Chasing premium at a bad combined ratio** — growth that runs the combined ratio above 100% with no investment offset is value-destroying; premium growth is not automatically good.
- **Duration mismatch** — investing short-tail float in long-duration assets (or vice-versa) turns a rate move into a solvency event.
- **Treating investment income as free** — it is only "free" when the combined ratio is at or below 100%; underwriting losses raise the cost of float and can exceed investment returns.
- **Ignoring the capital constraint** — modeling dividends off cash rather than off regulatory capital overstates what can actually be distributed.

---

## How the governing loop specializes

The backtesting methodology and the scenario-driven improvement loop from `01_financial_modeling_principles.md` are identical across all three business types — what changes is where you point them:

| Loop step | Operating (SaaS) | Treasury company | Insurer |
|---|---|---|---|
| Sensitivity-rank | Growth, NRR, CAC, margin | Asset price, premium, leverage, coverage | Loss ratio, investment yield, reserves, capital |
| Design scenarios | Growth-vs-margin, churn, TAM decay | Asset-price paths, premium collapse, forced liquidation | Catastrophe/tail, reserve strengthening, rate shock |
| Calibrate vs reality | Revenue & cohort retention vs actuals | NAV tracking & premium behavior vs actuals | Reserve development & combined ratio vs actuals |
| Score with | MAPE/RMSE + forecast bias | NAV tracking error + premium error | Reserve-development error + combined-ratio bias |
| Fatal miss to catch | Retention/churn compounding wrong | Senior claims exceeding assets | Chronic under-reserving |

The method is universal; the judgment is domain-specific. Structure the model cleanly, rank what matters *for this archetype*, backtest against *this archetype's* reality, and iterate under an out-of-sample gate — and a SaaS forecast, a Bitcoin-treasury model, and an insurer's reserving model all get better the same disciplined way.

---

## Sources

- [Bank & Insurance Financial Modeling 101 — Mergers & Inquisitions](https://mergersandinquisitions.com/bank-insurance-modeling-101/)
- [Analyzing Insurance Companies — AnalystPrep (CFA)](https://analystprep.com/study-notes/cfa-level-2/analyzing-insurance-companies/)
- [Insurance Float: Buffett's Favorite Concept — FIG IB Guide](https://ibinterviewquestions.com/guides/fig-investment-banking/insurance-float-buffetts-favorite-concept)
- [The Combined Ratio: Loss Ratio + Expense Ratio Decoded — FIG IB Guide](https://ibinterviewquestions.com/guides/fig-investment-banking/combined-ratio-loss-ratio-expense-ratio)
- [Deconstructing Strategy (MSTR): Premium, Leverage, and Capital Structure — VanEck](https://www.vaneck.com/us/en/blogs/digital-assets/matthew-sigel-deconstructing-strategy-mstr-premium-leverage-and-capital-structure/)
- [What Is mNAV and Why It Decides Treasury Stocks Like MSTR — Phemex](https://phemex.com/academy/what-is-mnav-and-treasury-stocks)
- [How to Value an Insurance Company — Raincatcher](https://raincatcher.com/insurance-company-valuation/)
