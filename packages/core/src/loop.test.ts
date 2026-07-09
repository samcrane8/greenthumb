import assert from "node:assert/strict";
import { test } from "node:test";

import { tornado } from "./sensitivity.js";
import { backtest, backtestSplit } from "./backtest.js";
import { calibrate } from "./calibrate.js";
import { setAssumption } from "./operations.js";
import { computeModel } from "./engine.js";
import { resolveScenario, resolveItemId } from "./analysis.js";
import { saasModel } from "./templates.js";
import type { Model } from "./types.js";

/**
 * The end-to-end improvement loop (handbook §4): tornado to find what matters →
 * backtest to see the miss → calibrate on the in-sample window → apply the
 * candidate → re-backtest on the HOLDOUT. The gate is out-of-sample error
 * falling, never the in-sample fit.
 */
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

test("improvement loop: calibrate lowers out-of-sample error", () => {
  const model = saasModel({ name: "s", timeline: { periods: 12 } });
  // Ground truth: the world's ARPA is 700, but the model was built with 500.
  const actuals = seriesWithDriver(model, "arpa", 700, "mrr");

  // 1. Tornado: arpa should be among the dominant drivers of mrr.
  const rows = tornado(model, "mrr");
  const arpa = model.drivers.find((d) => d.name === "arpa")!;
  const arpaRank = rows.findIndex((r) => r.driverId === arpa.id);
  assert.ok(arpaRank >= 0 && rows[arpaRank]!.impact > 0);

  // 2. Backtest the mis-specified model — it systematically under-forecasts.
  const before = backtest(model, "mrr", actuals);
  assert.ok(before.metrics.bias < 0, "under-forecasting at arpa=500");
  const beforeHoldout = backtestSplit(model, "mrr", actuals, 5).holdout.metrics;

  // 3. Calibrate arpa on the IN-SAMPLE window only.
  const cal = calibrate(model, "mrr", ["arpa"], actuals, {
    metric: "rmse",
    window: { from: 0, to: 5 },
    bounds: { arpa: { min: 400, max: 900 } },
  });
  assert.ok(Math.abs(cal.bestValues[arpa.id]! - 700) < 15);

  // 4. Apply the candidate through the normal assumption op (preview/accept).
  const applied = setAssumption(model, arpa.id, [cal.bestValues[arpa.id]!]);
  assert.ok(applied.ok);

  // 5. Re-backtest on the HOLDOUT — the out-of-sample gate. Error must fall.
  const afterHoldout = backtestSplit(applied.model, "mrr", actuals, 5).holdout.metrics;
  assert.ok(
    afterHoldout.rmse < beforeHoldout.rmse,
    `holdout RMSE must fall: ${beforeHoldout.rmse} → ${afterHoldout.rmse}`,
  );
  // A substantial out-of-sample improvement (>90% error reduction), not just a nudge.
  assert.ok(
    afterHoldout.rmse < beforeHoldout.rmse * 0.1,
    `expected a large holdout improvement, got ${beforeHoldout.rmse} → ${afterHoldout.rmse}`,
  );
});
