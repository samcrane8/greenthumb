/**
 * Model templates (PRD §6 "Template / Model type").
 *
 * A template seeds items, drivers, scenarios, and integrity expectations for a
 * domain. Templates are the defaults Claude scaffolds from and the modeler
 * starts from. Start with `blank` and `saas`; more (3-statement, DCF, LBO…)
 * slot into the same registry.
 */

import { generatePrice } from "./commodities.js";
import { newId } from "./id.js";
import type {
  Chart,
  Dashboard,
  Driver,
  LineItem,
  Model,
  ModelType,
  Scenario,
  Timeline,
  Widget,
} from "./types.js";

export interface CreateModelOptions {
  name: string;
  type?: ModelType;
  baseCurrency?: string;
  timeline?: Partial<Timeline>;
  /**
   * Ticker of the company being modeled — used by ticker-aware templates (e.g.
   * `bitcoin_treasury`) to name the price/market-cap items and label charts.
   * Defaults to a neutral placeholder (`CO`) when omitted, so a model is never
   * silently attributed to a specific company.
   */
  ticker?: string;
}

const now = () => new Date().toISOString();

/**
 * A monotonic mean-reversion path `start -> target` at reversion speed `k`,
 * materialized as a series. Used to seed the default treasury mNAV path so the
 * template reproduces its prior behavior while the premium is now an editable
 * series (settable to a non-monotonic / observed cycle).
 */
function meanReversionPath(start: number, target: number, k: number, periods: number): number[] {
  const out: number[] = [];
  let prev = start;
  for (let i = 0; i < periods; i++) {
    const v = i === 0 ? start : prev + (target - prev) / k;
    out.push(v);
    prev = v;
  }
  return out;
}

function defaultTimeline(overrides?: Partial<Timeline>): Timeline {
  return {
    granularity: "monthly",
    start: "2026-01-01",
    periods: 36,
    fiscalYearStartMonth: 1,
    actualsThrough: -1,
    ...overrides,
  };
}

function baseScenario(): Scenario {
  return { id: newId("scn"), name: "Base", overrides: {} };
}

function shell(options: CreateModelOptions, type: ModelType): Model {
  const ts = now();
  return {
    id: newId("mdl"),
    meta: {
      name: options.name,
      type,
      baseCurrency: options.baseCurrency ?? "USD",
      createdAt: ts,
      modifiedAt: ts,
      version: 1,
    },
    timeline: defaultTimeline(options.timeline),
    items: [],
    drivers: [],
    scenarios: [baseScenario()],
  };
}

/** An empty model: a timeline and a Base scenario, nothing else. */
export function blankModel(options: CreateModelOptions): Model {
  return shell(options, "blank");
}

/**
 * A minimal but coherent SaaS / ARR model: a customer build driven by new-logo
 * adds and churn, MRR/ARR, gross margin, opex, and EBITDA — plus a Downside
 * scenario. Demonstrates drivers, time-aware formulas, and scenario overlays.
 */
export function saasModel(options: CreateModelOptions): Model {
  const model = shell(options, "saas");
  const periods = model.timeline.periods;

  const driver = (
    name: string,
    unit: Driver["unit"],
    shape: Driver["shape"],
    values: number[],
  ): Driver => ({ id: newId("drv"), name, unit, shape, values });

  // new_customers period 0 folds in the 100-customer starting base (100 + 20).
  const newCustomers = [120, ...new Array(Math.max(0, periods - 1)).fill(20)];

  const drivers: Driver[] = [
    driver("new_customers", "count", "series", newCustomers),
    driver("monthly_churn", "percent", "scalar", [0.02]),
    driver("arpa", "currency", "scalar", [500]),
    driver("gross_margin", "percent", "scalar", [0.8]),
    driver("opex_per_month", "currency", "scalar", [40000]),
  ];

  const item = (
    name: string,
    category: LineItem["category"],
    unit: LineItem["unit"],
    expression: string,
    section?: string,
  ): LineItem => ({
    id: newId("itm"),
    name,
    category,
    unit,
    section,
    definition: { kind: "formula", expression },
  });

  const items: LineItem[] = [
    item(
      "customers",
      "kpi",
      "count",
      "prior(customers) * (1 - monthly_churn) + new_customers",
      "revenue_build",
    ),
    item("mrr", "revenue", "currency", "customers * arpa", "revenue_build"),
    item("arr", "kpi", "currency", "mrr * 12", "revenue_build"),
    item("cogs", "cogs", "currency", "-mrr * (1 - gross_margin)", "cost_build"),
    item("gross_profit", "kpi", "currency", "mrr + cogs", "cost_build"),
    item("opex", "opex", "currency", "-opex_per_month", "cost_build"),
    item("ebitda", "kpi", "currency", "gross_profit + opex", "cost_build"),
  ];

  const churn = drivers.find((d) => d.name === "monthly_churn")!;
  const newLogo = drivers.find((d) => d.name === "new_customers")!;
  const downside: Scenario = {
    id: newId("scn"),
    name: "Downside",
    overrides: {
      [churn.id]: new Array(periods).fill(0.04), // churn doubles
      [newLogo.id]: newCustomers.map((v) => v / 2), // new-logo growth halves
    },
  };

  model.drivers = drivers;
  model.items = items;
  model.scenarios = [...model.scenarios, downside];
  return model;
}

/**
 * A Bitcoin treasury company (e.g. Strategy/MSTR, Strive/ASST) modeled as a
 * LEVERED RESIDUAL CLAIM on a BTC reserve funded by perpetual preferred stock.
 *
 * The common equity's NAV = reserve + cash + other holdings − preferred notional.
 * Because the preferred claim is fixed, common NAV moves faster than BTC in both
 * directions (implied leverage > 1x). Preferred issuance follows an S-curve ramp
 * (uncapped — notional keeps growing over the horizon); its dividend is a cash
 * leak; common ATM issuance dilutes shares. mNAV (the premium/discount on the
 * levered claim) mean-reverts toward a target. Quarterly, 4-year horizon.
 *
 * Monetary series are in $millions; share counts in millions; prices in $.
 * This is a faithful FIRST-ORDER model — discrete cycle/capitulation events from
 * the reference are expressed via scenario overrides, not engine control flow.
 */
export function bitcoinTreasuryModel(options: CreateModelOptions): Model {
  const model = shell(options, "bitcoin_treasury");
  model.timeline = defaultTimeline({
    granularity: "quarterly",
    periods: 16,
    ...options.timeline,
  });
  const periods = model.timeline.periods;

  // The modeled company's identity. Defaults to a neutral placeholder so the
  // model is never silently attributed to a specific company. The lower-cased
  // ticker names the price/market-cap items (referenced by name elsewhere); the
  // upper-cased ticker labels charts and stat widgets.
  const ticker = (options.ticker ?? "CO").trim() || "CO";
  const tickerUpper = ticker.toUpperCase();
  const tickerLower = ticker.toLowerCase();
  const priceName = `${tickerLower}_price`;
  const mcapName = `${tickerLower}_mcap`;
  // Store the resolved ticker so adapters can display the company identity
  // (e.g. uppercase the item-name prefix in tiles/rows) without re-deriving it.
  model.meta.ticker = tickerUpper;

  const driver = (
    name: string,
    unit: Driver["unit"],
    shape: Driver["shape"],
    values: number[],
    notes?: string,
  ): Driver => ({ id: newId("drv"), name, unit, shape, values, notes });

  const drivers: Driver[] = [
    // Starting balance-sheet state (ASST @ May 2026, from 8-K filings).
    driver("btc_held_start", "count", "scalar", [16500], "BTC on the treasury at start"),
    driver("preferred_start", "currency", "scalar", [576], "Perpetual preferred notional at start ($M)"),
    driver("cash_start", "currency", "scalar", [93], "Cash buffer at start ($M)"),
    driver("other_holdings", "currency", "scalar", [50], "Genuine other holdings, e.g. STRC ($M), held flat"),
    driver("debt_notional", "currency", "scalar", [0], "Straight debt notional ($M); subtracts from common NAV at face value"),
    driver("convertible_debt", "currency", "scalar", [0], "Convertible debt notional ($M)"),
    driver("convert_as_equity", "ratio", "scalar", [1],
      "1 = convertibles treated as LOOK-THROUGH EQUITY: excluded from senior claims, so NAV-to-common isn't wiped in a drawdown. This first-order model does NOT auto-add conversion shares — reflect the dilution in the share count (raise shares_start, or replay actual shares). 0 = face-value debt (subtracts at par)."),
    driver("shares_start", "count", "scalar", [75.77], "Common shares outstanding at start (M)"),
    // Market + capital-raise assumptions (the tunable levers).
    driver("issuance_start", "currency", "scalar", [910], "Preferred issuance at start of ramp ($M/qtr)"),
    driver("issuance_peak", "currency", "scalar", [4550], "Preferred issuance at peak of ramp ($M/qtr)"),
    driver("issuance_ramp", "count", "scalar", [7], "S-curve ramp length (quarters)"),
    driver("div_rate", "percent", "scalar", [0.13], "Preferred dividend rate (annual)"),
    driver("atm_raise", "currency", "scalar", [390], "Common ATM issuance ($M/qtr)"),
    // mNAV is a first-class SERIES so the premium can follow a non-monotonic /
    // observed path (real MSTR mNAV is U-shaped: 3.4x -> 0.74x -> 2.1x -> ~0.95x).
    // The default reproduces the prior monotonic mean-reversion (1.63 -> 1.5 target,
    // reversion speed 5), and can be overwritten with observed quarterly mNAV.
    driver("mnav_path", "ratio", "series", meanReversionPath(1.63, 1.5, 5, periods),
      "Common mNAV premium per period — settable to an observed/cyclical path"),
  ];

  // BTC price is a COMMODITY-PRICED driver: the Bitcoin power-law trend plus
  // halving-cycle oscillation, spot-anchored to today's spot (~$62.85k, below the
  // power-law fair value — so the path starts in the trough and arcs up). Binding
  // it means resizing the timeline regenerates the price for the new horizon.
  const BTC_SPOT = 62850;
  const btcParams = { spot: BTC_SPOT, band: "fair" } as const;
  const btcPriceValues = generatePrice("bitcoin", "powerlaw", model.timeline, btcParams);
  drivers.push({
    id: newId("drv"),
    name: "btc_price",
    unit: "currency",
    shape: "series",
    values: btcPriceValues,
    notes: "BTC price — power-law trend + halving-cycle oscillation, spot-anchored",
    priceModel: { commodity: "bitcoin", model: "powerlaw", params: { ...btcParams } },
  });

  const item = (
    name: string,
    category: LineItem["category"],
    unit: LineItem["unit"],
    definition: LineItem["definition"],
    section?: string,
  ): LineItem => ({ id: newId("itm"), name, category, unit, section, definition });

  const f = (
    name: string,
    category: LineItem["category"],
    unit: LineItem["unit"],
    expression: string,
    section?: string,
  ): LineItem => item(name, category, unit, { kind: "formula", expression }, section);

  // period_index: 0,1,2,… as data, so scurve(period_index, …) can shape the ramp.
  // Category "other" keeps it out of every statement view.
  const periodIndex = Array.from({ length: periods }, (_, i) => i);

  const items: LineItem[] = [
    item("period_index", "other", "count", { kind: "input", values: periodIndex }, "_internal"),

    // btc_price is a commodity-priced driver (see above), referenced by name here.
    // Reserve value in $M. Depends on btc_held (same period) -> solved iteratively.
    f("reserve", "kpi", "currency", "btc_held * btc_price / 1000000", "reserve"),

    // Preferred issuance follows the S-curve ramp, floored at zero and UNCAPPED —
    // a treasury keeps raising perpetual preferred, so notional grows over time.
    f("preferred_raise_target", "other", "currency",
      "scurve(period_index, issuance_start, issuance_peak, issuance_ramp)", "financing"),
    f("prev_preferred", "other", "currency",
      "if(prior(preferred_notional) == 0, preferred_start, prior(preferred_notional))", "financing"),
    f("preferred_raise", "other", "currency",
      "max(0, preferred_raise_target)", "financing"),
    f("preferred_notional", "kpi", "currency", "prev_preferred + preferred_raise", "financing"),
    f("preferred_dividend", "kpi", "currency", "preferred_notional * div_rate / 4", "financing"),
    f("div_coverage", "kpi", "ratio",
      "if(preferred_dividend == 0, 0, preferred_raise / preferred_dividend)", "financing"),

    // Cash buffer absorbs any dividend shortfall (cumulative, so it never resets).
    f("dividend_shortfall", "other", "currency", "max(0, preferred_dividend - preferred_raise)", "financing"),
    f("cash", "kpi", "currency", "max(0, cash_start - cumulative(dividend_shortfall))", "reserve"),

    // BTC purchases from net preferred capital + ATM, both buying at spot.
    f("net_preferred_capital", "other", "currency", "max(0, preferred_raise - preferred_dividend)", "reserve"),
    f("btc_bought", "other", "count",
      "(net_preferred_capital + atm_raise) * 1000000 / btc_price", "reserve"),
    f("btc_held", "kpi", "count",
      "if(prior(btc_held) == 0, btc_held_start, prior(btc_held)) + btc_bought", "reserve"),

    // Common share dilution from the ATM (raise $M / price $ = shares in millions).
    f("new_shares", "other", "count", `atm_raise / max(${priceName}, 1)`, "equity"),
    f("common_shares", "kpi", "count",
      "if(prior(common_shares) == 0, shares_start, prior(common_shares)) + new_shares", "equity"),
    // BTC-per-share accretion metric, in SATS per share (1 BTC = 100M sats). Shares
    // are in millions, so btc_held/common_shares is BTC per million shares; ×100
    // converts to sats/share — a legible integer that grows when issuance is accretive.
    f("sats_per_share", "kpi", "count", "btc_held * 100 / common_shares", "equity"),

    // The levered residual claim. Senior (straight) debt and face-value converts
    // are separate claims: converts rank JUNIOR to senior debt (a subordinated
    // tranche in the capital stack) and only bite when NOT treated as look-through
    // equity — so a deep drawdown where BTC ≈ senior debt doesn't wipe the common's
    // option-like value the way face-value debt would.
    f("senior_debt", "other", "currency", "debt_notional", "equity"),
    f("convert_claim", "other", "currency",
      "convertible_debt * (1 - convert_as_equity)", "equity"),
    f("nav_to_common", "kpi", "currency",
      "reserve + cash + other_holdings - senior_debt - convert_claim - preferred_notional", "equity"),
    f("nav_per_share", "kpi", "currency", "nav_to_common / common_shares", "equity"),
    // mNAV reads the first-class premium path (default: mean-reversion; overridable
    // to an observed cyclical series). No longer a monotonic recurrence.
    f("mnav", "kpi", "ratio", "mnav_path", "equity"),
    f(priceName, "kpi", "currency", "max(nav_per_share, 0) * mnav", "equity"),
    f(mcapName, "kpi", "currency", `${priceName} * common_shares`, "equity"),
    // Treasury "implied leverage" is the reference metric: crypto reserve per dollar
    // of common equity (handbook B1). The capital-stack panel additionally shows a
    // broader total-assets ÷ residual leverage — a different, generic measure.
    f("implied_leverage", "kpi", "ratio",
      "if(nav_to_common <= 0, 99, reserve / nav_to_common)", "equity"),
  ];

  const byName = (n: string) => drivers.find((d) => d.name === n)!;
  const btcId = byName("btc_price").id;

  // Alternate BTC paths are expressed as SCENARIO COMMODITY BINDINGS (re-adjustable
  // in the model's commodity panel), not baked haircuts. Both price off the power
  // law's SUPPORT corridor (~0.42× fair, no spot anchor — so the path stays below the
  // spot-anchored base that mean-reverts up to fair): Support is the corridor itself,
  // Drawdown adds a deep cyclical crash (higher amplitude). The generated series is
  // stored as the scenario's override so the engine computes it unchanged.
  const scenarioPrice = (params: Record<string, number | string>) => ({
    params: { ...params },
    values: generatePrice("bitcoin", "powerlaw", model.timeline, params),
  });
  const draw = scenarioPrice({ band: "support", amplitude: 0.9 });
  const supp = scenarioPrice({ band: "support" });

  // Drawdown / bear scenario: lower BTC spot plus a par-break that throttles
  // preferred issuance. Both push the levered common price well below the base case.
  const drawdown: Scenario = {
    id: newId("scn"),
    name: "Drawdown",
    overrides: {
      [btcId]: draw.values,
      [byName("issuance_start").id]: new Array(periods).fill(300),
      [byName("issuance_peak").id]: new Array(periods).fill(900),
    },
    priceModels: { [btcId]: { commodity: "bitcoin", model: "powerlaw", params: draw.params } },
  };

  // Power-law support: price the reserve off the support corridor (the lower bound of
  // the power law) — a structural bear case.
  const support: Scenario = {
    id: newId("scn"),
    name: "Power-law support",
    overrides: {
      [btcId]: supp.values,
    },
    priceModels: { [btcId]: { commodity: "bitcoin", model: "powerlaw", params: supp.params } },
  };

  model.drivers = drivers;
  model.items = items;
  model.scenarios = [...model.scenarios, drawdown, support];

  // Display scale: the treasury model is denominated in $millions, so currency
  // values render at that magnitude by default. The per-share and whole-dollar
  // figures (nav_per_share, the ticker's price) and the btc_price driver are in
  // whole dollars — tag them scale 1 so they don't inherit the $M default.
  model.meta.defaultScale = 1_000_000;
  for (const it of model.items)
    if (it.name === "nav_per_share" || it.name === priceName || it.name === "sats_per_share") it.scale = 1;
  for (const d of model.drivers) if (d.name === "btc_price") d.scale = 1;

  // Capital stack (overlay): the same reserve/cash/senior-debt/preferred/common
  // series the NAV formula uses, now as ranked tranches. Its residual-to-common
  // ties out to nav_to_common (see the tie-out test). Common's per-share uses the
  // diluted common_shares series.
  model.capitalStack = {
    assetRefs: ["reserve", "cash", "other_holdings"],
    tranches: [
      { id: newId("trn"), name: "Senior debt", kind: "senior_debt", seniority: 10, notionalRef: "senior_debt" },
      // Face-value convertibles rank junior to senior debt, senior to preferred.
      // `convert_claim` is zero when converts are look-through equity, so this
      // tranche only bites when `convert_as_equity = 0`.
      {
        id: newId("trn"),
        name: "Convertible (face value)",
        kind: "subordinated_debt",
        seniority: 15,
        notionalRef: "convert_claim",
      },
      {
        id: newId("trn"),
        name: "Preferred",
        kind: "preferred",
        seniority: 20,
        notionalRef: "preferred_notional",
        rateRef: "div_rate",
      },
      { id: newId("trn"), name: "Common", kind: "common", seniority: 100, sharesRef: "common_shares" },
    ],
  };

  // Curated default dashboard: headline tiles, four treasury charts, KPI table.
  // The ticker names the price item and labels the common-equity charts/tiles.
  attachTreasuryDashboard(model, priceName, tickerUpper);
  return model;
}

/** Build the default charts + dashboard for the treasury template. */
function attachTreasuryDashboard(model: Model, priceName: string, ticker: string): void {
  const chart = (
    title: string,
    kind: Chart["kind"],
    series: Chart["series"],
  ): Chart => ({ id: newId("cht"), title, kind, series });

  const btcPriceChart = chart("BTC price over time — power law + halving-cycle oscillation", "line", [
    { ref: "btc_price", label: "BTC price" },
  ]);
  const priceChart = chart(`${ticker} common — levered residual claim on BTC`, "line", [
    { ref: priceName, label: `${ticker} price` },
    { ref: "nav_per_share", label: "NAV / share", style: "line" },
  ]);
  const indexChart = chart(`${ticker} vs BTC — leverage amplifies both directions (indexed)`, "line", [
    { ref: priceName, label: ticker, index: true },
    { ref: "btc_price", label: "BTC", index: true },
  ]);
  const coverageChart = chart("Preferred dividend coverage — raise vs. obligation", "composed", [
    { ref: "preferred_dividend", label: "Preferred dividend ($M)", style: "bar" },
    { ref: "preferred_raise", label: "Preferred raise ($M)", style: "bar" },
    { ref: "div_coverage", label: "Coverage (x)", style: "line", axis: "right" },
  ]);
  const leverageChart = chart("Implied leverage — reserve / NAV-to-common", "area", [
    { ref: "implied_leverage", label: "Implied leverage" },
  ]);
  // BTC-per-share accretion: the headline metric — issuing shares to buy BTC should
  // grow sats-per-share over time. Tracked over the full horizon.
  const satsChart = chart("Sats per share — accretion over time", "line", [
    { ref: "sats_per_share", label: "Sats / share" },
  ]);

  model.charts = [btcPriceChart, priceChart, indexChart, coverageChart, leverageChart, satsChart];

  const widget = (
    kind: Widget["kind"],
    refId: string | undefined,
    layout: Widget["layout"],
    extra?: Partial<Widget>,
  ): Widget => ({ id: newId("wgt"), kind, refId, layout, ...extra });

  model.dashboard = {
    columns: 12,
    widgets: [
      // Headline tiles. Sats-per-share (the accretion metric) leads; the BTC price
      // tile is dropped as redundant with its full-width chart directly below.
      widget("stat", priceName, { x: 0, y: 0, w: 3, h: 1 }),
      widget("stat", "sats_per_share", { x: 3, y: 0, w: 3, h: 1 }),
      widget("stat", "btc_held", { x: 6, y: 0, w: 3, h: 1 }),
      widget("stat", "implied_leverage", { x: 9, y: 0, w: 3, h: 1 }),
      // BTC price path spans full width — it's the driver behind everything below.
      widget("chart", btcPriceChart.id, { x: 0, y: 1, w: 12, h: 3 }),
      widget("chart", priceChart.id, { x: 0, y: 4, w: 6, h: 3 }),
      widget("chart", indexChart.id, { x: 6, y: 4, w: 6, h: 3 }),
      widget("chart", coverageChart.id, { x: 0, y: 7, w: 6, h: 3 }),
      widget("chart", leverageChart.id, { x: 6, y: 7, w: 6, h: 3 }),
      // Sats-per-share accretion, full width, above the projection table.
      widget("chart", satsChart.id, { x: 0, y: 10, w: 12, h: 3 }),
      widget("statement", "kpi", { x: 0, y: 13, w: 12, h: 4 }, { title: "Quarterly projection" }),
    ],
  };
}

export interface TemplateInfo {
  type: ModelType;
  label: string;
  description: string;
  build: (options: CreateModelOptions) => Model;
  /**
   * Whether creating this template requires a `ticker` (the company being
   * modeled). When true, `createModel` rejects creation with no ticker so the
   * model is never silently attributed to a placeholder, and adapters can prompt
   * for / require it. Non-ticker templates (blank, saas) leave this unset.
   */
  requiresTicker?: boolean;
}

/** Registry of available templates, for menus in the UI and enums in MCP. */
export const TEMPLATES: TemplateInfo[] = [
  {
    type: "blank",
    label: "Blank",
    description: "An empty model — just a timeline and a Base scenario.",
    build: blankModel,
  },
  {
    type: "saas",
    label: "SaaS / ARR",
    description: "Customer build, MRR/ARR, gross margin, opex, EBITDA, with a Downside scenario.",
    build: saasModel,
  },
  {
    type: "bitcoin_treasury",
    label: "Bitcoin Treasury",
    description:
      "A BTC treasury company (MSTR/ASST-style) as a levered residual claim: reserve, perpetual preferred, dividend coverage, mNAV, implied leverage, with a Drawdown scenario and a default dashboard.",
    build: bitcoinTreasuryModel,
    requiresTicker: true,
  },
];

/**
 * Build a model from a template type, falling back to blank. Templates that
 * declare `requiresTicker` reject creation without a non-empty `ticker` so the
 * model is never silently attributed to a placeholder company.
 */
export function createModel(options: CreateModelOptions): Model {
  const type = options.type ?? "blank";
  const template = TEMPLATES.find((t) => t.type === type);
  if (template?.requiresTicker && !options.ticker?.trim()) {
    throw new Error(
      `The "${template.label}" template requires a \`ticker\` (the company being modeled, e.g. "MSTR").`,
    );
  }
  return (template?.build ?? blankModel)(options);
}
