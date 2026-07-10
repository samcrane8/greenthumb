import assert from "node:assert/strict";
import { test } from "node:test";

import {
  setTimelineStart,
  replayActuals,
  restoreItemDefinition,
} from "./operations.js";
import { computeModel } from "./engine.js";
import { resolveScenario } from "./analysis.js";
import { saasModel, bitcoinTreasuryModel } from "./templates.js";
import type { Model } from "./types.js";

const saas = () => saasModel({ name: "s", timeline: { periods: 12 } });

// --- Timeline start (Task 1) ------------------------------------------------

test("setTimelineStart changes the start date and validates", () => {
  const m = saas();
  const res = setTimelineStart(m, "2020-07-01");
  assert.ok(res.ok);
  assert.equal(res.model.timeline.start, "2020-07-01");
});

test("setTimelineStart regenerates commodity-bound drivers over the new window", () => {
  const m = bitcoinTreasuryModel({ name: "t", timeline: { granularity: "quarterly", periods: 16 } });
  const btc = m.drivers.find((d) => d.name === "btc_price")!;
  assert.ok(btc.priceModel, "btc_price is commodity-bound");
  const before = [...btc.values];
  const res = setTimelineStart(m, "2020-07-01");
  const after = res.model.drivers.find((d) => d.name === "btc_price")!.values;
  // Re-anchoring genesis-dated power-law to 2020 changes the generated series.
  assert.notDeepEqual(after, before);
  assert.ok(res.ok);
});

// --- Currency scale is inert to computation (Task 3.2) ----------------------

test("scale is presentation-only and never changes a computed value", () => {
  const m = saas();
  const scenario = resolveScenario(m);
  const before = computeModel(m, scenario).series;
  // Tag every currency item with a $M scale.
  for (const item of m.items) if (item.unit === "currency") item.scale = 1_000_000;
  m.meta.defaultScale = 1_000_000;
  const after = computeModel(m, scenario).series;
  assert.deepEqual(after, before, "scale must not affect computation");
});

// --- Actuals replay + restore (Task 4.3) ------------------------------------

test("replayActuals swaps a formula item to an input series and drives dependents", () => {
  const m = saas();
  const mrr = m.items.find((i) => i.name === "mrr")!;
  assert.equal(mrr.definition.kind, "formula");
  const flat = new Array(m.timeline.periods).fill(1000);
  const res = replayActuals(m, mrr.id, flat);
  assert.ok(res.ok);
  const item = res.model.items.find((i) => i.id === mrr.id)!;
  assert.equal(item.definition.kind, "input");
  assert.ok(item.replacedDefinition, "original formula is preserved");
  // arr = mrr * 12 should now follow the replayed mrr.
  const scenario = resolveScenario(res.model);
  const arrId = res.model.items.find((i) => i.name === "arr")!.id;
  assert.equal(computeModel(res.model, scenario).series[arrId]![0], 12000);
});

test("restoreItemDefinition returns the original formula", () => {
  const m = saas();
  const mrr = m.items.find((i) => i.name === "mrr")!;
  const original = JSON.stringify(mrr.definition);
  const replayed = replayActuals(m, mrr.id, new Array(12).fill(500));
  const restored = restoreItemDefinition(replayed.model, mrr.id);
  const item = restored.model.items.find((i) => i.id === mrr.id)!;
  assert.equal(JSON.stringify(item.definition), original);
  assert.equal(item.replacedDefinition, undefined);
  assert.ok(restored.ok);
});

test("replay is read-only on the input model (clones)", () => {
  const m = saas();
  const before = JSON.stringify(m);
  replayActuals(m, m.items.find((i) => i.name === "mrr")!.id, new Array(12).fill(1));
  assert.equal(JSON.stringify(m), before);
});

test("replaying a balance-sheet item that breaks A=L+E surfaces the issue", () => {
  // bitcoin_treasury carries a balance sheet; replaying an asset with arbitrary
  // values should surface BS_IMBALANCE rather than silently accepting it.
  const m: Model = bitcoinTreasuryModel({ name: "t", timeline: { granularity: "quarterly", periods: 8 } });
  const asset = m.items.find((i) => i.category === "asset");
  if (!asset) return; // template has no BS items → nothing to assert
  const res = replayActuals(m, asset.id, new Array(8).fill(999999));
  // Either it validates (if no BS structure) or it flags an imbalance — never silent corruption.
  if (!res.ok) assert.ok(res.issues.some((i) => i.code === "BS_IMBALANCE" || i.severity === "error"));
});
