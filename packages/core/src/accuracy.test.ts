import assert from "node:assert/strict";
import { test } from "node:test";

import { scoreSeries, scoreForecast, mae, rmse, bias } from "./accuracy.js";
import { computeModel } from "./engine.js";
import { resolveScenario, resolveItemId } from "./analysis.js";
import { saasModel } from "./templates.js";
import type { Model } from "./types.js";

test("scoreSeries computes MAE, bias, and RMSE > MAE on an uneven miss", () => {
  const m = scoreSeries([100, 100], [130, 90]); // errors +30, -10
  assert.equal(m.mae, 20);
  assert.equal(m.bias, 10); // systematic over-forecast
  assert.ok(Math.abs(m.rmse - Math.sqrt(500)) < 1e-9); // ≈22.36
  assert.ok(m.rmse > m.mae);
  assert.equal(m.n, 2);
});

test("MAPE skips zero actuals but MAE/RMSE still count them", () => {
  const m = scoreSeries([0, 50], [10, 55]); // period 0 actual is zero
  assert.equal(m.n, 2); // both periods count toward magnitude metrics
  assert.equal(m.mapeN, 1); // only the non-zero-actual period feeds MAPE
  assert.ok(Math.abs(m.mape - 10) < 1e-9); // |55-50|/50 = 10%
});

test("null actuals are not scored", () => {
  const m = scoreSeries([null, 200, null, 400], [111, 190, 999, 380]);
  assert.equal(m.n, 2); // only periods 1 and 3 have actuals
  assert.equal(m.mae, (10 + 20) / 2);
  assert.equal(m.bias, (-10 + -20) / 2);
});

test("empty / all-null scoring is total (no NaN)", () => {
  const m = scoreSeries([null, null], [1, 2]);
  assert.equal(m.n, 0);
  assert.equal(m.mae, 0);
  assert.equal(m.rmse, 0);
  assert.equal(m.mape, 0);
  assert.equal(m.bias, 0);
});

test("bias sign flips with the direction of the miss", () => {
  assert.ok(bias([100], [80]) < 0); // under-forecast
  assert.ok(bias([100], [120]) > 0); // over-forecast
});

test("named metric helpers agree with scoreSeries", () => {
  const a = [10, 20, 30];
  const f = [12, 18, 36];
  assert.equal(mae(a, f), scoreSeries(a, f).mae);
  assert.equal(rmse(a, f), scoreSeries(a, f).rmse);
});

test("scoreForecast computes the model and scores an item, read-only", () => {
  const model = saasModel({ name: "s", timeline: { periods: 12 } });
  const before = JSON.stringify(model);
  // Score the first revenue-ish item against a fabricated actuals series.
  const item = model.items[0]!;
  const actuals = new Array(model.timeline.periods).fill(null).map((_, i) => (i < 3 ? 100 : null));
  const m = scoreForecast(model, item.name, actuals);
  assert.ok(m.n >= 0 && Number.isFinite(m.mae));
  assert.equal(JSON.stringify(model), before, "scoreForecast must not mutate the model");
});

test("feeding the forecast back as actuals yields zero error", () => {
  const model = saasModel({ name: "s", timeline: { periods: 12 } });
  const item = model.items[0]!;
  const perfect = scoreForecast(model, item.name, forecastOf(model, item.name));
  assert.equal(perfect.mae, 0);
  assert.equal(perfect.bias, 0);
  assert.equal(perfect.rmse, 0);
});

// Helper: pull an item's base-scenario forecast to feed back as "actuals".
function forecastOf(model: Model, itemName: string): number[] {
  const scenario = resolveScenario(model);
  const id = resolveItemId(model, itemName);
  return computeModel(model, scenario).series[id]!;
}
