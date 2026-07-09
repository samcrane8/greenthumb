import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parse,
  evaluate,
  printExpr,
  renameInExpression,
  FormulaError,
  type EvalContext,
} from "./formula.js";
import { computeModel } from "./engine.js";
import { saasModel, bitcoinTreasuryModel } from "./templates.js";
import type { Model } from "./types.js";

/** Evaluate a bare expression at period 0 with no references. */
function evalExpr(src: string, refs: Record<string, number[]> = {}, period = 0): number {
  const ctx: EvalContext = {
    periods: 12,
    resolve: (name, p) => refs[name]?.[p] ?? 0,
  };
  return evaluate(parse(src), period, ctx);
}

test("exp evaluates the natural exponential", () => {
  assert.equal(evalExpr("exp(0)"), 1);
  assert.ok(Math.abs(evalExpr("exp(1)") - Math.E) < 1e-9);
});

test("ln and sqrt guard non-positive inputs (total, no NaN/Infinity)", () => {
  assert.equal(evalExpr("ln(0)"), 0);
  assert.equal(evalExpr("ln(-5)"), 0);
  assert.equal(evalExpr("sqrt(-4)"), 0);
  assert.equal(evalExpr("sqrt(9)"), 3);
  assert.ok(Math.abs(evalExpr("ln(exp(2))") - 2) < 1e-9);
});

test("pow matches the caret operator", () => {
  assert.equal(evalExpr("pow(2, 10)"), 1024);
  assert.equal(evalExpr("2 ^ 10"), 1024);
  assert.equal(evalExpr("pow(2, 10)"), evalExpr("2 ^ 10"));
});

test("round and floor behave conventionally", () => {
  assert.equal(evalExpr("round(2.5)"), 3);
  assert.equal(evalExpr("floor(2.9)"), 2);
});

test("clamp bounds a value into range", () => {
  assert.equal(evalExpr("clamp(150, 0, 100)"), 100);
  assert.equal(evalExpr("clamp(-10, 0, 100)"), 0);
  assert.equal(evalExpr("clamp(50, 0, 100)"), 50);
});

test("logistic is centered at 0.5 and bounded in (0,1)", () => {
  // centered: logistic(x0, k, x0) === 0.5 for any k, x0
  assert.equal(evalExpr("logistic(5, 2, 5)"), 0.5);
  assert.equal(evalExpr("logistic(0, 1, 0)"), 0.5);
  const lo = evalExpr("logistic(-10, 1, 0)");
  const hi = evalExpr("logistic(10, 1, 0)");
  assert.ok(lo > 0 && lo < 0.5);
  assert.ok(hi < 1 && hi > 0.5);
});

test("scurve ramps from start toward peak, monotonically", () => {
  const early = evalExpr("scurve(0, 70, 350, 7)");
  const mid = evalExpr("scurve(3.5, 70, 350, 7)"); // ramp/2 -> midpoint
  const late = evalExpr("scurve(20, 70, 350, 7)");
  assert.ok(early < mid && mid < late, `expected ${early} < ${mid} < ${late}`);
  assert.ok(Math.abs(mid - (70 + 350) / 2) < 1, "midpoint near (start+peak)/2");
  // near-flat tails: early sits close to start, late close to peak (logistic is
  // ~0.12 at t=0 and ~0.99 well past the ramp, not exactly at the endpoints).
  assert.ok(early < 130, "early value near start");
  assert.ok(late > 340, "late value approaches peak");
});

test("primitives compose with prior-period recursion and converge", () => {
  const model: Model = {
    id: "m_exp",
    meta: {
      name: "exp recursion",
      type: "blank",
      baseCurrency: "USD",
      createdAt: "2026-01-01",
      modifiedAt: "2026-01-01",
      version: 1,
    },
    timeline: {
      granularity: "annual",
      start: "2026-01-01",
      periods: 4,
      fiscalYearStartMonth: 1,
      actualsThrough: -1,
    },
    drivers: [{ id: "d_rate", name: "rate", unit: "percent", shape: "scalar", values: [0.1] }],
    items: [
      {
        id: "i_bal",
        name: "bal",
        unit: "currency",
        category: "asset",
        definition: { kind: "formula", expression: "if(prior(bal) == 0, 100, prior(bal) * exp(rate))" },
      },
    ],
    scenarios: [{ id: "s_base", name: "Base", overrides: {} }],
  };
  const { series, converged } = computeModel(model, model.scenarios[0]!);
  assert.ok(converged);
  const bal = series["i_bal"]!;
  assert.equal(bal[0], 100);
  assert.ok(Math.abs(bal[1]! - 100 * Math.exp(0.1)) < 1e-6);
});

test("unknown functions still raise FormulaError", () => {
  assert.throws(() => evalExpr("frobnicate(3)"), FormulaError);
});

// --- Printer + rename -------------------------------------------------------

/** parse -> print -> parse must be structurally stable (idempotent print). */
function assertRoundTrip(src: string) {
  const once = printExpr(parse(src));
  const twice = printExpr(parse(once));
  assert.equal(twice, once, `print not stable for: ${src}`);
}

test("printer round-trips every saas and treasury formula", () => {
  const models: Model[] = [saasModel({ name: "s" }), bitcoinTreasuryModel({ name: "t" })];
  for (const m of models) {
    for (const item of m.items) {
      if (item.definition.kind === "formula") assertRoundTrip(item.definition.expression);
    }
  }
});

test("printer preserves precedence and associativity semantics", () => {
  const ctx: EvalContext = { periods: 4, resolve: (n) => ({ a: 2, b: 3, c: 4 })[n] ?? 0 }
  for (const src of [
    "a + b * c",
    "(a + b) * c",
    "a - b - c",
    "a - (b - c)",
    "2 ^ 3 ^ 2",
    "-(a + b) * c",
    "a * b + c / a",
    "min(a, b) + max(a, c)",
    "if(a > b, a, b) * c",
  ]) {
    const printed = printExpr(parse(src))
    assert.equal(
      evaluate(parse(printed), 0, ctx),
      evaluate(parse(src), 0, ctx),
      `value changed after print for: ${src} -> ${printed}`,
    )
  }
});

test("renameInExpression swaps only matching bare refs", () => {
  // btc_growth -> q_growth, but not the function name or a substring
  const out = renameInExpression("prior(btc_price) * (1 + btc_growth)", { btc_growth: "q_growth" });
  assert.match(out, /q_growth/);
  assert.doesNotMatch(out, /btc_growth/);
  assert.match(out, /btc_price/); // untouched
  // function names are not refs
  const fn = renameInExpression("max(a, b)", { max: "min" });
  assert.match(fn, /max\(/);
});

test("renamed expression computes identically", () => {
  const ctx: EvalContext = { periods: 4, resolve: (n) => ({ price: 100, growth: 0.1, g2: 0.1 })[n] ?? 0 }
  const src = "price * (1 + growth)"
  const renamed = renameInExpression(src, { growth: "g2" })
  assert.equal(evaluate(parse(renamed), 0, ctx), evaluate(parse(src), 0, ctx))
});
