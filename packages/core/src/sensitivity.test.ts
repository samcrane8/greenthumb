import assert from "node:assert/strict";
import { test } from "node:test";

import { sweepDriver, tornado, generateScenarios } from "./sensitivity.js";
import { saasModel } from "./templates.js";

const model = () => saasModel({ name: "s", timeline: { periods: 12 } });

test("sweepDriver returns one output series per swept value and is read-only", () => {
  const m = model();
  const before = JSON.stringify(m);
  const points = sweepDriver(m, "arpa", [400, 500, 600], "mrr");
  assert.equal(points.length, 3);
  assert.equal(points[0]!.value, 400);
  // Higher ARPA → higher MRR at the last period (monotone in this model).
  const last = (p: (typeof points)[number]) => p.output[p.output.length - 1]!;
  assert.ok(last(points[2]!) > last(points[1]!));
  assert.ok(last(points[1]!) > last(points[0]!));
  assert.equal(JSON.stringify(m), before, "sweep must not mutate the model");
});

test("tornado ranks drivers by output impact, descending", () => {
  const rows = tornado(model(), "ebitda", { deltaPct: 0.1 });
  assert.ok(rows.length >= 1);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1]!.impact >= rows[i]!.impact, "rows must be sorted by impact");
  }
  // A driver that moves EBITDA (arpa, opex, or gross_margin) should outrank one that doesn't.
  assert.ok(rows[0]!.impact > 0);
});

test("generateScenarios yields the cartesian product under the cap", () => {
  const res = generateScenarios(model(), [
    { driver: "arpa", values: [400, 600] },
    { driver: "monthly_churn", values: [0.01, 0.02] },
  ]);
  assert.equal(res.overflow, false);
  assert.equal(res.combinations, 4);
  assert.equal(res.scenarios.length, 4);
  // Every generated scenario overrides both drivers.
  const arpa = model().drivers.find((d) => d.name === "arpa")!;
  void arpa;
  for (const s of res.scenarios) {
    assert.equal(Object.keys(s.overrides).length, 2);
  }
});

test("generateScenarios reports overflow instead of truncating", () => {
  const res = generateScenarios(
    model(),
    [
      { driver: "arpa", values: [1, 2, 3] },
      { driver: "monthly_churn", values: [0.01, 0.02, 0.03] },
    ],
    4, // cap below the 9 combinations
  );
  assert.equal(res.overflow, true);
  assert.equal(res.combinations, 9);
  assert.equal(res.cap, 4);
  assert.equal(res.scenarios.length, 0, "must not return a partial grid");
});
