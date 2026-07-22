import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parse,
  evaluate,
  FormulaError,
  KNOWN_FUNCTIONS,
  referencedFunctions,
  type EvalContext,
} from "./formula.js";
import { computeModel } from "./engine.js";
import { createModel } from "./templates.js";
import { validateModel } from "./validation.js";
import type { Driver, LineItem, Model } from "./types.js";

// --- Direct-evaluation helpers (mock context over named series) -------------

function evalAt(
  src: string,
  refs: Record<string, number[]>,
  period: number,
  periodsPerYear?: number,
): number {
  const periods = Math.max(1, ...Object.values(refs).map((a) => a.length));
  const ctx: EvalContext = {
    periods,
    periodsPerYear,
    resolve: (n, p) => (p < 0 || p >= periods ? 0 : (refs[n]?.[p] ?? 0)),
  };
  return evaluate(parse(src), period, ctx);
}
function evalSeries(src: string, refs: Record<string, number[]>): number[] {
  const periods = Math.max(1, ...Object.values(refs).map((a) => a.length));
  return Array.from({ length: periods }, (_, p) => evalAt(src, refs, p));
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// --- Returns ----------------------------------------------------------------

test("logret is the natural log return vs. the prior period", () => {
  const x = [100, 110, 121];
  const lr = evalSeries("logret(x)", { x });
  assert.equal(lr[0], 0, "first period has no prior -> 0");
  assert.ok(near(lr[1]!, Math.log(110 / 100)));
  assert.ok(near(lr[2]!, Math.log(121 / 110)));
  assert.equal(evalAt("logret(x)", { x: [0, 5] }, 1), 0, "non-positive prior -> 0");
  assert.equal(evalAt("logret(x)", { x: [5, -1] }, 1), 0, "non-positive current -> 0");
});

test("pct_change is the simple period-over-period return", () => {
  assert.ok(near(evalAt("pct_change(x)", { x: [100, 125] }, 1), 0.25));
  assert.equal(evalAt("pct_change(x)", { x: [0, 5] }, 1), 0, "prior 0 -> 0");
});

// --- Dispersion -------------------------------------------------------------

test("var/stdev are sample statistics; expanding by default, windowed when given", () => {
  const s = [2, 4, 6, 8]; // sample var over all four = 20/3
  assert.ok(near(evalAt("var(s)", { s }, 3), 20 / 3));
  assert.ok(near(evalAt("stdev(s)", { s }, 3), Math.sqrt(20 / 3)));
  assert.ok(near(evalAt("var(s, 2)", { s }, 3), 2), "trailing window [6,8] -> var 2");
  assert.notEqual(
    evalAt("stdev(s)", { s: [1, 1, 1, 10] }, 3),
    evalAt("stdev(s, 2)", { s: [1, 1, 1, 10] }, 3),
    "expanding differs from a trailing window",
  );
});

test("zscore is the current value's standard-score over the window", () => {
  const s = [2, 4, 6, 8];
  assert.ok(near(evalAt("zscore(s)", { s }, 3), (8 - 5) / Math.sqrt(20 / 3)));
  assert.equal(evalAt("zscore(f)", { f: [5, 5, 5, 5] }, 3), 0, "zero variance -> 0");
});

test("drawdown is current-vs-running-peak, 0 at a new high", () => {
  const dd = evalSeries("drawdown(p)", { p: [100, 120, 90, 150] });
  assert.equal(dd[0], 0);
  assert.equal(dd[1], 0, "new high");
  assert.ok(near(dd[2]!, 90 / 120 - 1), "-0.25 below prior peak");
  assert.equal(dd[3], 0, "new all-time high");
});

// --- Association & regression ----------------------------------------------

test("correl is Pearson in [-1,1]; identical -> 1, mirrored -> -1", () => {
  const a = [1, 2, 3, 4];
  assert.ok(near(evalAt("correl(a, b)", { a, b: [2, 4, 6, 8] }, 3), 1));
  assert.ok(near(evalAt("correl(a, b)", { a, b: [4, 3, 2, 1] }, 3), -1));
  assert.ok(near(evalAt("correl(a, a)", { a }, 3), 1));
});

test("cov is the sample covariance", () => {
  // a=[1..4], b=[2,4,6,8]: sum of dev products = 10, /(n-1=3)
  assert.ok(near(evalAt("cov(a, b)", { a: [1, 2, 3, 4], b: [2, 4, 6, 8] }, 3), 10 / 3));
});

test("beta == slope == cov/var; intercept and r2 fit an exact line", () => {
  const x = [1, 2, 3, 4];
  const y = [3, 5, 7, 9]; // y = 2x + 1 exactly
  assert.ok(near(evalAt("beta(y, x)", { x, y }, 3), 2));
  assert.ok(near(evalAt("slope(y, x)", { x, y }, 3), 2));
  assert.ok(near(evalAt("intercept(y, x)", { x, y }, 3), 1));
  assert.ok(near(evalAt("r2(y, x)", { x, y }, 3), 1), "perfect fit -> r2 1");
});

// --- Annualization + composition -------------------------------------------

test("periods_per_year reads the context (default 1)", () => {
  assert.equal(evalAt("periods_per_year()", {}, 0, 52), 52);
  assert.equal(evalAt("periods_per_year()", {}, 0), 1);
  // annualized vol composes cleanly and stays finite
  const v = evalAt("stdev(logret(p)) * sqrt(periods_per_year())", { p: [100, 110, 105, 120] }, 3, 52);
  assert.ok(Number.isFinite(v) && v > 0);
});

test("lead/lag is expressed by composing lag() inside a stat", () => {
  // b[k] = a[k+1], so lag(b,1)[p] = b[p-1] = a[p] -> lag(b,1) equals a over the window.
  const a = [1, 2, 3, 4, 5];
  const b = [2, 3, 4, 5, 6];
  const withLag = evalAt("correl(a, lag(b, 1), 4)", { a, b }, 4);
  assert.ok(near(withLag, 1), "a vs b-lagged-1 is perfectly correlated");
});

// --- Totality: degenerate inputs never produce NaN/Infinity -----------------

test("degenerate windows and zero variance return 0, not NaN", () => {
  assert.equal(evalAt("stdev(x)", { x: [5] }, 0), 0, "one observation");
  assert.equal(evalAt("var(x, 1)", { x: [1, 2, 3] }, 2), 0, "window of 1");
  assert.equal(evalAt("correl(a, b)", { a: [1], b: [2] }, 0), 0, "<2 observations");
  assert.equal(evalAt("beta(y, x)", { y: [1, 2], x: [3, 3] }, 1), 0, "zero-variance x");
  for (const src of ["stdev(x)", "correl(a,b)", "beta(y,x)", "r2(y,x)", "drawdown(x)"]) {
    const refs = { x: [0, 0], a: [0, 0], b: [0, 0], y: [0, 0] };
    const v = evalAt(src, refs, 1);
    assert.ok(Number.isFinite(v), `${src} is finite on flat input`);
  }
});

// --- Registry integrity -----------------------------------------------------

test("every KNOWN_FUNCTIONS entry is dispatched (no drift with evalCall)", () => {
  const refs = { a: [1, 2, 3], b: [2, 4, 6], c: [3, 6, 9], d: [1, 1, 1] };
  for (const fn of KNOWN_FUNCTIONS) {
    try {
      evalAt(`${fn}(a, b, c, d)`, refs, 2);
    } catch (e) {
      // Arity errors are fine; an "Unknown function" error means the name isn't handled.
      assert.ok(
        !(e instanceof FormulaError && /Unknown function/.test(e.message)),
        `${fn}() reached the unknown-function branch`,
      );
    }
  }
});

test("referencedFunctions collects every called name", () => {
  const fns = referencedFunctions(parse("correl(a, lag(b, 1), 26) + stdev(c) - periods_per_year()")).sort();
  assert.deepEqual(fns, ["correl", "lag", "periods_per_year", "stdev"]);
});

// --- Validation honesty (the assessment's finding) --------------------------

function statModel(items: { name: string; expr: string }[]): Model {
  const m = createModel({ name: "stats", type: "blank" });
  const drv = (name: string, values: number[]): Driver => ({
    id: `drv_${name}`,
    name,
    unit: "count",
    shape: "series",
    values,
  });
  m.drivers.push(drv("a", [1, 2, 3, 4]), drv("b", [2, 4, 6, 8]));
  for (const it of items) {
    const item: LineItem = {
      id: `itm_${it.name}`,
      name: it.name,
      category: "kpi",
      unit: "ratio",
      definition: { kind: "formula", expression: it.expr },
    };
    m.items.push(item);
  }
  return m;
}

test("valid statistical functions pass validation", () => {
  const issues = validateModel(statModel([{ name: "good", expr: "correl(a, b, 3)" }]));
  assert.ok(!issues.some((i) => i.code === "UNKNOWN_FUNCTION"), "no unknown-function issue");
});

test("unknown functions fail validation (not compute) — the assessment's exact gap", () => {
  const issues = validateModel(
    statModel([
      { name: "bad", expr: "frobnicate(a)" },
      { name: "typo", expr: "correll(a, b)" }, // mistyped correl
    ]),
  );
  const unknown = issues.filter((i) => i.code === "UNKNOWN_FUNCTION");
  assert.equal(unknown.length, 2, "one issue per unknown function");
  assert.ok(unknown.some((i) => /frobnicate/.test(i.message)));
  assert.ok(unknown.some((i) => /correll/.test(i.message)));
});

// --- End-to-end: computes through the real engine ---------------------------

test("statistics compute through computeModel with granularity-derived periods_per_year", () => {
  const m = createModel({ name: "e2e", type: "blank" });
  m.timeline = { ...m.timeline, granularity: "quarterly", periods: 4 };
  m.drivers.push(
    { id: "drv_a", name: "a", unit: "count", shape: "series", values: [1, 2, 3, 4] },
    { id: "drv_b", name: "b", unit: "count", shape: "series", values: [2, 4, 6, 8] },
  );
  m.items.push(
    {
      id: "itm_c",
      name: "c",
      category: "kpi",
      unit: "ratio",
      definition: { kind: "formula", expression: "correl(a, b, 4)" },
    },
    {
      id: "itm_ppy",
      name: "ppy",
      category: "kpi",
      unit: "count",
      definition: { kind: "formula", expression: "periods_per_year()" },
    },
  );
  const { series } = computeModel(m, m.scenarios[0]!);
  assert.ok(near(series["itm_c"]![3]!, 1), "correlation computes in-engine");
  assert.equal(series["itm_ppy"]![0], 4, "quarterly -> 4 periods/year");
});
