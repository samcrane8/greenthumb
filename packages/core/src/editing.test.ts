import assert from "node:assert/strict";
import { test } from "node:test";

import { computeModel } from "./engine.js";
import { saasModel, bitcoinTreasuryModel } from "./templates.js";
import {
  setPeriods,
  setGranularity,
  renameDriver,
  renameScenario,
  renameItem,
  updateNotes,
  removeDriver,
  removeScenario,
  setCommodityPrice,
  setScenarioCommodityPrice,
  setScenarioValue,
  setAssumption,
  createScenario,
} from "./operations.js";
import { validateModel, isValid } from "./validation.js";
import type { Model } from "./types.js";

const idOf = (m: Model, n: string) => m.items.find((i) => i.name === n)!.id;
const drvOf = (m: Model, n: string) => m.drivers.find((d) => d.name === n)!.id;
const scnByName = (m: Model, n: string) => m.scenarios.find((s) => s.name === n)!.id;

// --- Timeline ---------------------------------------------------------------

test("setPeriods shrinks the horizon and computes over fewer periods", () => {
  const m = bitcoinTreasuryModel({ name: "T", ticker: "ASST" }); // 16 quarterly; pin ticker for asst_price
  assert.equal(m.timeline.periods, 16);
  const res = setPeriods(m, 8);
  assert.ok(res.ok, JSON.stringify(res.issues));
  assert.equal(res.model.timeline.periods, 8);
  assert.equal(res.change?.entity, "timeline");
  const computed = computeModel(res.model, res.model.scenarios[0]!);
  assert.equal(computed.series[idOf(res.model, "asst_price")]!.length, 8);
});

test("re-growing restores previously stored input values", () => {
  // period_index is an input [0..15]; shrinking then re-growing must restore it.
  const m = bitcoinTreasuryModel({ name: "T" });
  const shrunk = setPeriods(m, 8).model;
  const regrown = setPeriods(shrunk, 16).model;
  const computed = computeModel(regrown, regrown.scenarios[0]!);
  const idx = computed.series[idOf(regrown, "period_index")]!;
  assert.equal(idx[15], 15, "period_index restored at period 15");
});

test("setPeriods clamps actualsThrough", () => {
  const m = saasModel({ name: "s", timeline: { periods: 12 } });
  m.timeline.actualsThrough = 10;
  const res = setPeriods(m, 6);
  assert.ok(res.ok);
  assert.ok(res.model.timeline.actualsThrough <= 5);
});

test("setGranularity relabels without changing values", () => {
  const m = saasModel({ name: "s", timeline: { periods: 12 } });
  const before = computeModel(m, m.scenarios[0]!).series[idOf(m, "mrr")]!.slice();
  const res = setGranularity(m, "quarterly");
  assert.ok(res.ok);
  assert.equal(res.model.timeline.granularity, "quarterly");
  const after = computeModel(res.model, res.model.scenarios[0]!).series[idOf(res.model, "mrr")]!;
  assert.deepEqual(after, before);
});

// --- Rename -----------------------------------------------------------------

test("renameDriver cascades into dependent formulas and computes identically", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  // div_rate is referenced by the preferred_dividend formula.
  const before = computeModel(m, m.scenarios[0]!).series[idOf(m, "preferred_dividend")]!.slice();
  const res = renameDriver(m, drvOf(m, "div_rate"), "div_rate_annual");
  assert.ok(res.ok, JSON.stringify(res.issues));
  assert.ok(res.model.drivers.some((d) => d.name === "div_rate_annual"));
  assert.ok(!res.model.drivers.some((d) => d.name === "div_rate"));
  const dividend = res.model.items.find((i) => i.name === "preferred_dividend")!;
  assert.match((dividend.definition as { expression: string }).expression, /div_rate_annual/);
  assert.ok(!res.issues.some((i) => i.code === "DANGLING_REF"));
  const after = computeModel(res.model, res.model.scenarios[0]!).series[idOf(res.model, "preferred_dividend")]!;
  assert.deepEqual(after, before, "compute unchanged by rename");
});

test("renaming to an existing name is rejected", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const res = renameDriver(m, drvOf(m, "div_rate"), "cash_start");
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((i) => i.code === "DUPLICATE_NAME"));
});

test("renameScenario preserves overrides", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const id = scnByName(m, "Drawdown");
  const beforeOverrides = JSON.stringify(m.scenarios.find((s) => s.id === id)!.overrides);
  const res = renameScenario(m, id, "Bear (power-law)");
  assert.ok(res.ok);
  assert.equal(res.model.scenarios.find((s) => s.id === id)!.name, "Bear (power-law)");
  assert.equal(JSON.stringify(res.model.scenarios.find((s) => s.id === id)!.overrides), beforeOverrides);
});

test("renameItem cascades and updateNotes edits annotations", () => {
  const m = saasModel({ name: "s", timeline: { periods: 12 } });
  // mrr is referenced by arr, cogs, gross_profit — rename must cascade
  const res = renameItem(m, idOf(m, "mrr"), "monthly_rev");
  assert.ok(res.ok, JSON.stringify(res.issues));
  const arr = res.model.items.find((i) => i.name === "arr")!;
  assert.match((arr.definition as { expression: string }).expression, /monthly_rev/);
  const noted = updateNotes(res.model, drvOf(res.model, "arpa"), "avg revenue per account (updated)");
  assert.ok(noted.ok);
  assert.equal(noted.model.drivers.find((d) => d.name === "arpa")!.notes, "avg revenue per account (updated)");
});

// --- Delete -----------------------------------------------------------------

test("removeDriver strips scenario overrides and validates when unreferenced", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  // debt_notional defaults to 0 and is referenced by nav_to_common — so removing
  // it would dangle. Add an unreferenced throwaway driver to remove instead.
  const throwaway = { id: "drv_tmp", name: "tmp_unused", unit: "ratio" as const, shape: "scalar" as const, values: [1] };
  m.drivers.push(throwaway);
  m.scenarios[1]!.overrides["drv_tmp"] = [2];
  const res = removeDriver(m, "drv_tmp");
  assert.ok(res.ok, JSON.stringify(res.issues));
  assert.ok(!res.model.drivers.some((d) => d.id === "drv_tmp"));
  assert.equal(res.model.scenarios[1]!.overrides["drv_tmp"], undefined, "override stripped");
});

test("removing a referenced driver is blocked", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const res = removeDriver(m, drvOf(m, "debt_notional")); // referenced by nav_to_common
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((i) => i.code === "DANGLING_REF"));
});

test("removeScenario removes extras but refuses the last", () => {
  const m = bitcoinTreasuryModel({ name: "T" }); // Base + Drawdown + Power-law support
  const before = m.scenarios.length;
  let res = removeScenario(m, scnByName(m, "Drawdown"));
  assert.ok(res.ok);
  assert.equal(res.model.scenarios.length, before - 1);
  // remove down to the last, then the final removal must be refused
  while (res.model.scenarios.length > 1) {
    res = removeScenario(res.model, res.model.scenarios[res.model.scenarios.length - 1]!.id);
    assert.ok(res.ok);
  }
  assert.throws(() => removeScenario(res.model, res.model.scenarios[0]!.id), /last remaining/);
});

// --- Treasury debt line -----------------------------------------------------

test("treasury debt subtracts from NAV and leaves other_holdings alone", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  assert.ok(m.drivers.some((d) => d.name === "debt_notional"));
  const base = computeModel(m, m.scenarios[0]!).series[idOf(m, "nav_to_common")]!.slice();
  // add $6,700M of debt
  const dId = drvOf(m, "debt_notional");
  m.drivers.find((d) => d.id === dId)!.values = [6700];
  const withDebt = computeModel(m, m.scenarios[0]!).series[idOf(m, "nav_to_common")]!;
  assert.ok(withDebt[0]! < base[0]!, "debt lowers NAV-to-common");
  assert.ok(Math.abs((base[0]! - withDebt[0]!) - 6700) < 1e-6, "NAV drops by exactly the debt");
});

test("treasury template still validates and converges with the debt line", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const { converged } = computeModel(m, m.scenarios[0]!);
  assert.ok(converged);
});

// --- Commodity-priced drivers -----------------------------------------------

test("treasury btc_price is a spot-anchored power-law driver, not constant growth", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const btc = m.drivers.find((d) => d.name === "btc_price")!;
  assert.ok(btc, "btc_price is now a driver");
  assert.equal(btc.priceModel?.commodity, "bitcoin");
  assert.equal(btc.priceModel?.model, "powerlaw");
  // period 0 == spot anchor
  assert.ok(Math.abs(btc.values[0]! - 62850) / 62850 < 1e-6, "period 0 pinned to spot");
  // non-monotonic: it oscillates rather than compounding at a constant rate
  let up = 0, down = 0;
  for (let i = 1; i < btc.values.length; i++) (btc.values[i]! > btc.values[i - 1]! ? up++ : down++);
  assert.ok(up > 0 && down > 0, "price arcs up and back, not a straight line");
  assert.ok(isValid(validateModel(m)));
});

test("binding a driver generates its series; unknown model is rejected", () => {
  const m = bitcoinTreasuryModel({ name: "T", timeline: { periods: 12 } });
  // rebind btc_price at the support band
  const btcId = drvOf(m, "btc_price");
  const ok = setCommodityPrice(m, btcId, {
    commodity: "bitcoin",
    model: "powerlaw",
    params: { band: "support" },
  });
  assert.ok(ok.ok, JSON.stringify(ok.issues));
  assert.equal(ok.model.drivers.find((d) => d.id === btcId)!.values.length, 12);
  // unknown model -> not ok
  const bad = setCommodityPrice(m, btcId, { commodity: "gold", model: "nope", params: {} });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((i) => i.code === "UNKNOWN_PRICE_MODEL"));
});

test("resizing the timeline regenerates a bound driver but not an unbound one", () => {
  const m = bitcoinTreasuryModel({ name: "T" }); // 16 quarterly
  const btcBefore = m.drivers.find((d) => d.name === "btc_price")!.values.slice();
  const res = setPeriods(m, 24);
  assert.ok(res.ok);
  const btcAfter = res.model.drivers.find((d) => d.name === "btc_price")!.values;
  assert.equal(btcAfter.length, 24, "bound price series regenerated for the new horizon");
  // the overlap keeps period 0 pinned to spot
  assert.ok(Math.abs(btcAfter[0]! - 62850) / 62850 < 1e-6);
  // an unbound scalar driver is untouched in length/values semantics
  const cash = res.model.drivers.find((d) => d.name === "cash_start")!;
  assert.deepEqual(cash.values, [93]);
  // regeneration is consistent: the overlapping 16 periods are unchanged (each
  // period's price depends only on its date), and the 8 new periods are populated
  assert.deepEqual(btcAfter.slice(0, 16), btcBefore, "overlap unchanged");
  assert.ok(btcAfter.slice(16).every((v) => Number.isFinite(v) && v > 0), "new periods populated");
});

test("setAssumption on a bound driver implicitly unbinds it", () => {
  const m = bitcoinTreasuryModel({ name: "T", timeline: { periods: 4 } });
  const btcId = drvOf(m, "btc_price");
  assert.ok(m.drivers.find((d) => d.id === btcId)!.priceModel, "bound to start");
  const res = setAssumption(m, btcId, [100000, 100000, 100000, 100000]);
  assert.ok(res.ok);
  const btc = res.model.drivers.find((d) => d.id === btcId)!;
  assert.equal(btc.priceModel, undefined, "manual override unbinds");
  assert.match(res.change?.detail ?? "", /unbound/);
  // now a timeline resize must NOT overwrite the hand-set values
  const grown = setPeriods(res.model, 6);
  assert.equal(grown.model.drivers.find((d) => d.id === btcId)!.values[0], 100000);
});

test("Power-law support scenario prices lower than base", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  // Assert on nav_per_share (the price path), not reserve: with uncapped preferred
  // issuance a lower-price scenario buys more BTC per dollar, so its reserve
  // (held × price) can actually peak higher — reserve no longer tracks "prices".
  const idA = idOf(m, "nav_per_share");
  const base = computeModel(m, m.scenarios[0]!).series[idA]!;
  const support = computeModel(m, scnByNameModel(m, "Power-law support")).series[idA]!;
  // compare peaks — robust to oscillation phase differences between scenarios
  assert.ok(Math.max(...support) < Math.max(...base), "support NAV/share peaks below base");
});

// --- Scenario commodity assumptions -----------------------------------------

test("treasury alternate scenarios carry commodity bindings, not baked haircuts", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const btcId = drvOf(m, "btc_price");
  const drawdown = scnByNameModel(m, "Drawdown");
  const support = scnByNameModel(m, "Power-law support");
  assert.equal(drawdown.priceModels?.[btcId]?.model, "powerlaw");
  assert.equal(support.priceModels?.[btcId]?.model, "powerlaw");
  // and the override values match the binding (generated, not hand-scaled)
  assert.ok(drawdown.overrides[btcId]!.length === m.timeline.periods);
});

test("setScenarioCommodityPrice on an alternate scenario diverges from base only", () => {
  const m = bitcoinTreasuryModel({ name: "T", ticker: "ASST" });
  const btcId = drvOf(m, "btc_price");
  const asst = idOf(m, "asst_price");
  const baseBefore = computeModel(m, m.scenarios[0]!).series[asst]!.slice();
  const alt = scnByNameModel(m, "Drawdown");
  const res = setScenarioCommodityPrice(m, alt.id, btcId, {
    commodity: "bitcoin",
    model: "powerlaw",
    params: { spot: 20000, band: "fair" },
  });
  assert.ok(res.ok, JSON.stringify(res.issues));
  // base is untouched
  const baseAfter = computeModel(res.model, res.model.scenarios[0]!).series[asst]!;
  assert.deepEqual(baseAfter, baseBefore, "base scenario unchanged");
  // the alternate scenario now reflects the new (lower) spot
  const altAfter = res.model.scenarios.find((s) => s.id === alt.id)!;
  assert.ok(Math.abs(altAfter.overrides[btcId]![0]! - 20000) / 20000 < 1e-6, "period 0 == new spot");
  assert.equal(altAfter.priceModels?.[btcId]?.params.spot, 20000);
});

test("setScenarioCommodityPrice on the base moves the base binding", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const btcId = drvOf(m, "btc_price");
  const res = setScenarioCommodityPrice(m, m.scenarios[0]!.id, btcId, {
    commodity: "bitcoin",
    model: "powerlaw",
    params: { spot: 80000, band: "fair" },
  });
  assert.ok(res.ok, JSON.stringify(res.issues));
  const driver = res.model.drivers.find((d) => d.id === btcId)!;
  assert.equal(driver.priceModel?.params.spot, 80000, "base binding updated");
  assert.ok(Math.abs(driver.values[0]! - 80000) / 80000 < 1e-6);
});

test("a scenario without a commodity binding inherits the base path", () => {
  const m = bitcoinTreasuryModel({ name: "T", timeline: { periods: 12 } });
  const btcId = drvOf(m, "btc_price");
  // create a fresh scenario that has no btc_price binding or override
  const created = createScenario(m, "Fresh");
  const fresh = created.model.scenarios.find((s) => s.name === "Fresh")!;
  assert.equal(fresh.priceModels?.[btcId], undefined, "no scenario binding");
  assert.equal(fresh.overrides[btcId], undefined, "no scenario override");
  // it computes btc_price using the base driver values
  const baseBtc = computeModel(created.model, created.model.scenarios[0]!).series;
  const freshBtc = computeModel(created.model, fresh).series;
  const btcItemDependent = idOf(created.model, "reserve"); // reserve = f(btc_price)
  assert.deepEqual(freshBtc[btcItemDependent], baseBtc[btcItemDependent], "inherits base BTC path");
});

test("timeline resize regenerates a scenario commodity override", () => {
  const m = bitcoinTreasuryModel({ name: "T" }); // 16q
  const btcId = drvOf(m, "btc_price");
  const alt = scnByNameModel(m, "Drawdown");
  const res = setPeriods(m, 24);
  assert.ok(res.ok);
  const altAfter = res.model.scenarios.find((s) => s.id === alt.id)!;
  assert.equal(altAfter.overrides[btcId]!.length, 24, "scenario override regenerated for new horizon");
  assert.ok(altAfter.overrides[btcId]!.every((v) => Number.isFinite(v) && v > 0));
});

test("manual setScenarioValue clears the scenario commodity binding", () => {
  const m = bitcoinTreasuryModel({ name: "T", timeline: { periods: 4 } });
  const btcId = drvOf(m, "btc_price");
  const alt = scnByNameModel(m, "Drawdown");
  assert.ok(alt.priceModels?.[btcId], "bound to start");
  const res = setScenarioValue(m, alt.id, btcId, [10, 10, 10, 10]);
  assert.ok(res.ok);
  const altAfter = res.model.scenarios.find((s) => s.id === alt.id)!;
  assert.equal(altAfter.priceModels?.[btcId], undefined, "manual override unbinds the scenario");
  assert.match(res.change?.detail ?? "", /unbound/);
});

test("unknown scenario price model is rejected", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const btcId = drvOf(m, "btc_price");
  const res = setScenarioCommodityPrice(m, scnByNameModel(m, "Drawdown").id, btcId, {
    commodity: "gold",
    model: "nope",
    params: {},
  });
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((i) => i.code === "UNKNOWN_PRICE_MODEL"));
});

function scnByNameModel(m: Model, n: string) {
  return m.scenarios.find((s) => s.name === n)!;
}
