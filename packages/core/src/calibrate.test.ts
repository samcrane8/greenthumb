import assert from "node:assert/strict";
import { test } from "node:test";

import { calibrate } from "./calibrate.js";
import { computeModel } from "./engine.js";
import { resolveScenario, resolveItemId } from "./analysis.js";
import { saasModel } from "./templates.js";
import type { Model } from "./types.js";

const model = () => saasModel({ name: "s", timeline: { periods: 12 } });

/** Compute an item's series with one driver overridden to a constant value. */
function seriesWithDriver(m: Model, driverName: string, value: number, itemName: string): number[] {
  const base = resolveScenario(m);
  const driver = m.drivers.find((d) => d.name === driverName)!;
  const itemId = resolveItemId(m, itemName);
  const scenario = {
    ...base,
    overrides: { ...base.overrides, [driver.id]: new Array(m.timeline.periods).fill(value) },
  };
  return computeModel(m, scenario).series[itemId]!;
}

test("calibrate recovers the driver value that generated the actuals", () => {
  const m = model();
  const actuals = seriesWithDriver(m, "arpa", 700, "mrr"); // truth: arpa = 700
  const res = calibrate(m, "mrr", ["arpa"], actuals, {
    metric: "rmse",
    bounds: { arpa: { min: 400, max: 900 } },
  });
  const arpa = m.drivers.find((d) => d.name === "arpa")!;
  assert.ok(Math.abs(res.bestValues[arpa.id]! - 700) < 15, `got ${res.bestValues[arpa.id]}`);
  assert.ok(res.score < 1e3, "near-perfect in-sample fit");
});

test("calibrate stays within bounds (clamps rather than exceeding)", () => {
  const m = model();
  const actuals = seriesWithDriver(m, "arpa", 700, "mrr"); // truth above the upper bound
  const res = calibrate(m, "mrr", ["arpa"], actuals, {
    metric: "rmse",
    bounds: { arpa: { min: 400, max: 600 } }, // cap below the truth
  });
  const arpa = m.drivers.find((d) => d.name === "arpa")!;
  assert.ok(res.bestValues[arpa.id]! <= 600 + 1e-6, "must not exceed the upper bound");
  assert.ok(res.bestValues[arpa.id]! >= 599, "pushes up against the bound");
});

test("calibrate is read-only — the model is never mutated", () => {
  const m = model();
  const before = JSON.stringify(m);
  const actuals = seriesWithDriver(m, "arpa", 550, "mrr");
  calibrate(m, "mrr", ["arpa"], actuals, { bounds: { arpa: { min: 400, max: 700 } } });
  assert.equal(JSON.stringify(m), before);
});

test("calibrate flags a likely structural fix when no in-bounds setting fits", () => {
  const m = model();
  // An additive offset scaling `arpa` cannot remove → systematic residual.
  const base = seriesWithDriver(m, "arpa", 500, "mrr");
  const actuals = base.map((v) => v + 250000);
  const res = calibrate(m, "mrr", ["arpa"], actuals, {
    metric: "rmse",
    bounds: { arpa: { min: 400, max: 900 } },
    acceptable: 1000, // require a tight fit that scaling can't reach
  });
  assert.equal(res.structuralFixLikely, true);
  assert.ok(res.rankedMisses.length > 0);
  // The largest miss is surfaced first.
  assert.ok(
    Math.abs(res.rankedMisses[0]!.residual) >=
      Math.abs(res.rankedMisses[res.rankedMisses.length - 1]!.residual),
  );
});

test("calibrate returns the full metric set so bias stays visible", () => {
  const m = model();
  const actuals = seriesWithDriver(m, "arpa", 620, "mrr");
  const res = calibrate(m, "mrr", ["arpa"], actuals, { bounds: { arpa: { min: 400, max: 900 } } });
  assert.ok("bias" in res.inSample && "mape" in res.inSample);
});
