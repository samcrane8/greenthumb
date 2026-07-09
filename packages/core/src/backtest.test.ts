import assert from "node:assert/strict";
import { test } from "node:test";

import { backtest, backtestSplit, walkForward, actualsCoverage } from "./backtest.js";
import { computeModel } from "./engine.js";
import { addLineItem } from "./operations.js";
import { resolveScenario } from "./analysis.js";
import { saasModel } from "./templates.js";
import type { Model } from "./types.js";

const model = () => saasModel({ name: "s", timeline: { periods: 12 } });

/** The base-scenario forecast for an item id. */
function forecast(m: Model, itemId: string): number[] {
  return computeModel(m, resolveScenario(m)).series[itemId]!;
}

test("actualsCoverage finds the last observed index", () => {
  assert.equal(actualsCoverage([1, 2, null, 4, null]), 3);
  assert.equal(actualsCoverage([null, null]), -1);
});

test("backtest scores forecast vs actuals over the window with residuals", () => {
  const m = model();
  const customers = m.items[0]!; // "customers"
  const f = forecast(m, customers.id);
  // Actuals that overshoot the forecast by 10 for periods 0..5.
  const actuals: (number | null)[] = f.map((v, i) => (i <= 5 ? v + 10 : null));
  const res = backtest(m, customers.name, actuals);
  assert.equal(res.window.from, 0);
  assert.equal(res.window.to, 5);
  assert.equal(res.residual[0], -10); // forecast − actual = v − (v+10)
  assert.ok(Math.abs(res.metrics.bias + 10) < 1e-9); // systematic under-forecast
  assert.equal(res.metrics.n, 6);
});

test("backtest errors loudly when the window has no actuals", () => {
  const m = model();
  const customers = m.items[0]!;
  assert.throws(
    () => backtest(m, customers.name, new Array(12).fill(null)),
    /no stored actuals/,
  );
});

test("backtestSplit reports in-sample and holdout separately", () => {
  const m = model();
  const customers = m.items[0]!;
  const f = forecast(m, customers.id);
  const actuals: (number | null)[] = f.map((v, i) => (i <= 7 ? v + i : null));
  const split = backtestSplit(m, customers.name, actuals, 3);
  assert.equal(split.inSample.window.to, 3);
  assert.equal(split.holdout.window.from, 4);
  assert.equal(split.holdout.window.to, 7);
  // Holdout bias is larger (actuals drift further from forecast over time).
  assert.ok(Math.abs(split.holdout.metrics.bias) > Math.abs(split.inSample.metrics.bias));
});

test("as-of freezes known history and forecasts forward from it", () => {
  const m = model();
  const customers = m.items[0]!;
  const f = forecast(m, customers.id);
  // Actuals that sit above the forecast through period 3.
  const actuals: (number | null)[] = f.map((v, i) => (i <= 3 ? v + 100 : null));
  const asof = computeModel(m, resolveScenario(m), {
    asOf: 3,
    actuals: { [customers.id]: actuals },
  });
  const s = asof.series[customers.id]!;
  assert.equal(s[3], f[3]! + 100, "period 3 is locked to the actual");
  // Period 4 is forecast forward from the (higher) locked period-3 value.
  assert.ok(s[4]! > f[4]!, "forecast forward inherits the frozen state");
  assert.ok(!asof.lookAhead, "no look-ahead in a purely backward-referencing model");
});

test("as-of at the horizon with no actuals equals the ordinary compute", () => {
  const m = model();
  const customers = m.items[0]!;
  const ordinary = forecast(m, customers.id);
  const asof = computeModel(m, resolveScenario(m), { asOf: m.timeline.periods - 1, actuals: {} });
  assert.deepEqual(asof.series[customers.id], ordinary);
});

test("per-item ragged coverage: each item locks only where it has actuals", () => {
  const m = model();
  const customers = m.items[0]!;
  const mrr = m.items.find((i) => i.name === "mrr")!;
  const fc = forecast(m, customers.id);
  const fm = forecast(m, mrr.id);
  const custActuals: (number | null)[] = fc.map((v, i) => (i <= 6 ? v + 100 : null));
  const mrrActuals: (number | null)[] = fm.map((v, i) => (i <= 4 ? v + 999 : null)); // through 4 only
  const asof = computeModel(m, resolveScenario(m), {
    asOf: 6,
    actuals: { [customers.id]: custActuals, [mrr.id]: mrrActuals },
  });
  assert.equal(asof.series[customers.id]![6], fc[6]! + 100, "customers locked through 6");
  assert.equal(asof.series[mrr.id]![4], fm[4]! + 999, "mrr locked through its own coverage (4)");
  // mrr at period 5 has no actual → it is forecast, not the (nonexistent) actual.
  assert.notEqual(asof.series[mrr.id]![5], fm[5]! + 999);
});

test("walk-forward produces per-step out-of-sample verdicts", () => {
  const m = model();
  const customers = m.items[0]!;
  const f = forecast(m, customers.id);
  const actuals: (number | null)[] = f.map((v) => v); // perfect actuals through the horizon
  const wf = walkForward(m, customers.name, actuals, { start: 2, step: 1, window: "anchored" });
  assert.ok(wf.steps.length > 0);
  assert.equal(wf.steps[0]!.asOf, 2);
  assert.equal(wf.steps[0]!.testWindow.from, 3);
  // Perfect actuals reproduce the forecast → near-zero out-of-sample error.
  assert.ok(wf.overall.mae < 1e-6);
});

test("walk-forward anchored vs rolling report different train windows", () => {
  const m = model();
  const customers = m.items[0]!;
  const actuals = forecast(m, customers.id);
  const anchored = walkForward(m, customers.name, actuals, { start: 3, windowLen: 2, window: "anchored" });
  const rolling = walkForward(m, customers.name, actuals, { start: 3, windowLen: 2, window: "rolling" });
  const aStep = anchored.steps[1]!;
  const rStep = rolling.steps[1]!;
  assert.equal(aStep.trainWindow.from, 0, "anchored window starts fixed at 0");
  assert.equal(rStep.trainWindow.from, rStep.asOf - 1, "rolling window slides at fixed length");
  assert.ok(rStep.trainWindow.from > aStep.trainWindow.from);
});

test("walk-forward refuses to run on a look-ahead (lead) formula", () => {
  const m = model();
  const mrr = m.items.find((i) => i.name === "mrr")!;
  // Add a formula that reaches forward in time to an actuals-bearing item.
  const withPeek = addLineItem(m, {
    name: "peek",
    category: "kpi",
    unit: "currency",
    definition: { kind: "formula", expression: "lead(mrr, 1)" },
  });
  assert.ok(withPeek.ok);
  const peekModel = withPeek.model;
  const f = forecast(peekModel, mrr.id);
  const actuals = f.map((v) => v); // mrr has actuals → forward read is look-ahead
  assert.throws(
    () => walkForward(peekModel, mrr.name, actuals, { start: 2 }),
    /look-ahead/,
  );
});
