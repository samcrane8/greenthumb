import assert from "node:assert/strict";
import { test } from "node:test";

import { computeModel } from "./engine.js";
import { bitcoinTreasuryModel, createModel, TEMPLATES } from "./templates.js";
import { setAssumption } from "./operations.js";
import { validateModel, isValid } from "./validation.js";
import type { Model } from "./types.js";

function treasury(): Model {
  // Pin the ticker so the price item resolves as `asst_price` (the default is now
  // the neutral `CO` → `co_price`). Ticker-genericity is covered by its own tests.
  return bitcoinTreasuryModel({ name: "Test Treasury", ticker: "ASST" });
}

const idOf = (m: Model, n: string) => m.items.find((i) => i.name === n)!.id;
const drvOf = (m: Model, n: string) => m.drivers.find((d) => d.name === n)!.id;

test("bitcoin_treasury is registered and discoverable", () => {
  const info = TEMPLATES.find((t) => t.type === "bitcoin_treasury");
  assert.ok(info, "template registered");
  assert.ok(info!.label && info!.description);
  const m = createModel({ name: "via factory", type: "bitcoin_treasury" });
  assert.equal(m.meta.type, "bitcoin_treasury");
});

test("treasury template validates clean and converges", () => {
  const m = treasury();
  const issues = validateModel(m);
  assert.ok(isValid(issues), `unexpected issues: ${JSON.stringify(issues)}`);
  const { converged } = computeModel(m, m.scenarios[0]!);
  assert.ok(converged, "iterative solver converges over the horizon");
});

test("core levered-residual outputs are present and defined every period", () => {
  const m = treasury();
  const { series } = computeModel(m, m.scenarios[0]!);
  for (const name of [
    "reserve",
    "nav_to_common",
    "nav_per_share",
    "mnav",
    "asst_price",
    "implied_leverage",
    "preferred_notional",
    "preferred_dividend",
  ]) {
    const s = series[idOf(m, name)]!;
    assert.equal(s.length, m.timeline.periods, `${name} spans the timeline`);
    assert.ok(s.every((v) => Number.isFinite(v)), `${name} is finite every period`);
  }
});

test("common equity is levered to the reserve (implied leverage > 1x)", () => {
  const m = treasury();
  const { series } = computeModel(m, m.scenarios[0]!);
  const lev = series[idOf(m, "implied_leverage")]!;
  assert.ok(lev[0]! > 1, `expected leverage > 1x, got ${lev[0]}`);
});

test("raising the dividend rate lowers coverage", () => {
  const m = treasury();
  const before = computeModel(m, m.scenarios[0]!).series[idOf(m, "div_coverage")]!;
  const res = setAssumption(m, drvOf(m, "div_rate"), [0.2]);
  assert.ok(res.ok, `set_assumption should validate: ${JSON.stringify(res.issues)}`);
  const after = computeModel(res.model, res.model.scenarios[0]!).series[idOf(res.model, "div_coverage")]!;
  // higher carry -> lower coverage during the ramp, where a raise is still active
  const p = 3;
  assert.ok(after[p]! < before[p]!, `coverage should fall: ${after[p]} < ${before[p]}`);
});

test("drawdown scenario yields lower ASST price than base", () => {
  const m = treasury();
  const base = computeModel(m, m.scenarios[0]!).series[idOf(m, "asst_price")]!;
  const draw = computeModel(m, m.scenarios[1]!).series[idOf(m, "asst_price")]!;
  // compare peaks — robust to where the halving-cycle oscillation lands at the horizon end
  assert.ok(Math.max(...draw) < Math.max(...base), `drawdown peak lower: ${Math.max(...draw)} < ${Math.max(...base)}`);
});

test("default dashboard references only resolvable series and charts", () => {
  const m = treasury();
  assert.ok(m.charts && m.charts.length === 5, "five charts");
  assert.ok(m.charts!.some((c) => c.series.some((s) => s.ref === "btc_price")), "a chart plots btc_price");
  assert.ok(m.dashboard && m.dashboard.widgets.length > 0, "dashboard present");
  const names = new Set([...m.items.map((i) => i.name), ...m.drivers.map((d) => d.name)]);
  const chartIds = new Set(m.charts!.map((c) => c.id));
  for (const c of m.charts!) {
    for (const s of c.series) assert.ok(names.has(s.ref), `chart series ${s.ref} resolves`);
  }
  for (const w of m.dashboard!.widgets) {
    if (w.kind === "chart") assert.ok(chartIds.has(w.refId!), `widget -> chart ${w.refId}`);
    if (w.kind === "stat") assert.ok(names.has(w.refId!), `stat -> item ${w.refId}`);
  }
});

/** All chart titles + series labels joined, for scanning for leaked tickers. */
const labelBlob = (m: Model) =>
  m.charts!.flatMap((c) => [c.title, ...c.series.map((s) => s.label ?? "")]).join(" | ");
const exprOf = (m: Model, n: string) => {
  const def = m.items.find((i) => i.name === n)!.definition;
  return def.kind === "formula" ? def.expression : "";
};

test("a non-default ticker names the price/mcap items and labels; no ASST/SATA left", () => {
  const m = bitcoinTreasuryModel({ name: "MicroStrategy", ticker: "MSTR" });
  const names = new Set(m.items.map((i) => i.name));
  assert.ok(names.has("mstr_price"), "price item is mstr_price");
  assert.ok(names.has("mstr_mcap"), "mcap item is mstr_mcap");
  assert.ok(!names.has("asst_price") && !names.has("co_price"), "no other-ticker price item");
  // the ATM dilution formula divides by the ticker's price
  assert.match(exprOf(m, "new_shares"), /mstr_price/);
  assert.match(exprOf(m, "mstr_mcap"), /mstr_price/);
  // charts + the headline stat widget reference mstr_price
  const refs = m.charts!.flatMap((c) => c.series.map((s) => s.ref));
  assert.ok(refs.includes("mstr_price"), "a chart series references mstr_price");
  assert.ok(
    m.dashboard!.widgets.some((w) => w.kind === "stat" && w.refId === "mstr_price"),
    "headline stat -> mstr_price",
  );
  // labels reflect the ticker, and no company literals leak through
  const blob = labelBlob(m);
  assert.match(blob, /MSTR/);
  assert.ok(!/ASST|SATA/.test(blob), `no ASST/SATA in labels: ${blob}`);
  assert.ok(isValid(validateModel(m)), "model validates");
});

test("default ticker is the neutral CO placeholder; no ASST/SATA labels", () => {
  const m = bitcoinTreasuryModel({ name: "Some Treasury" });
  const names = new Set(m.items.map((i) => i.name));
  assert.ok(names.has("co_price") && names.has("co_mcap"), "default items are co_price/co_mcap");
  assert.ok(!/ASST|SATA/.test(labelBlob(m)), "no ASST/SATA in default labels");
});

test("preferred notional grows uncapped over the horizon", () => {
  const m = treasury();
  assert.ok(!m.drivers.some((d) => d.name === "amplification_cap"), "amplification_cap driver removed");
  const { series } = computeModel(m, m.scenarios[0]!);
  const pref = series[idOf(m, "preferred_notional")]!;
  const reserve = series[idOf(m, "reserve")]!;
  // non-decreasing period over period
  for (let i = 1; i < pref.length; i++) {
    assert.ok(pref[i]! >= pref[i - 1]! - 1e-6, `non-decreasing at ${i}: ${pref[i]} >= ${pref[i - 1]}`);
  }
  // grows materially by the horizon end
  assert.ok(pref[pref.length - 1]! > pref[0]!, "notional grows over the horizon");
  // and breaks through the old amplification_cap (0.5 × reserve) ceiling somewhere —
  // proof the clamp is gone (under the old logic notional[i] <= 0.5 × reserve[i]).
  assert.ok(
    pref.some((v, i) => v > 0.5 * reserve[i]! + 1e-6),
    "preferred notional exceeds the old 0.5×reserve cap in some period",
  );
});
