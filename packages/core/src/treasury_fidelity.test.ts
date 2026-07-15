import assert from "node:assert/strict";
import { test } from "node:test";

import { computeModel } from "./engine.js";
import { setAssumption } from "./operations.js";
import { analyzeCapitalStack } from "./capitalstack.js";
import { bitcoinTreasuryModel } from "./templates.js";
import type { Model } from "./types.js";

const treasury = (): Model =>
  bitcoinTreasuryModel({ name: "T", ticker: "ASST", timeline: { granularity: "quarterly", periods: 16 } });
const idOf = (m: Model, n: string) => m.items.find((i) => i.name === n)!.id;
const drvOf = (m: Model, n: string) => m.drivers.find((d) => d.name === n)!.id;
const base = (m: Model) => computeModel(m, m.scenarios[0]!).series;

// --- Cyclical mNAV (Task 5) -------------------------------------------------

test("mNAV follows an observed non-monotonic path when set", () => {
  const m = treasury();
  const periods = m.timeline.periods;
  // A U-shaped premium: high -> trough -> recovery, the shape the old monotonic
  // rule could never produce.
  const cyclical = Array.from({ length: periods }, (_, i) => {
    const t = i / (periods - 1);
    return 3.4 - 5.3 * t + 5.3 * t * t; // 3.4 -> ~0.75 -> ~3.4, U-shaped
  });
  const res = setAssumption(m, drvOf(m, "mnav_path"), cyclical);
  assert.ok(res.ok);
  const mnav = computeModel(res.model, res.model.scenarios[0]!).series[idOf(res.model, "mnav")]!;
  // mnav item mirrors the driver path period-by-period.
  for (let i = 0; i < periods; i++) assert.ok(Math.abs(mnav[i]! - cyclical[i]!) < 1e-9);
  // It genuinely falls then rises (non-monotonic) — the old rule couldn't.
  const mid = Math.floor(periods / 2);
  assert.ok(mnav[mid]! < mnav[0]! && mnav[periods - 1]! > mnav[mid]!);
});

test("default mNAV path reproduces the prior mean-reversion behavior", () => {
  const m = treasury();
  const mnav = base(m)[idOf(m, "mnav")]!;
  // Prior behavior: start 1.63, revert toward 1.5 at speed 5 (monotone down).
  assert.ok(Math.abs(mnav[0]! - 1.63) < 1e-9);
  assert.ok(Math.abs(mnav[1]! - (1.63 + (1.5 - 1.63) / 5)) < 1e-9);
  for (let i = 1; i < mnav.length; i++) assert.ok(mnav[i]! <= mnav[i - 1]! + 1e-12);
});

// --- Drawdown-solvent NAV via look-through converts (Task 6) ----------------

test("look-through converts keep NAV-to-common positive; face-value debt can wipe it", () => {
  const m = treasury();
  const bigConvert = new Array(m.timeline.periods).fill(2000); // $2B converts, ~2x the reserve

  // convert_as_equity defaults to 1 (look-through): converts don't subtract → NAV stays positive.
  const lookThrough = setAssumption(m, drvOf(m, "convertible_debt"), bigConvert);
  assert.ok(lookThrough.ok);
  const navLT = computeModel(lookThrough.model, lookThrough.model.scenarios[0]!).series[
    idOf(lookThrough.model, "nav_to_common")
  ]!;
  const priceLT = computeModel(lookThrough.model, lookThrough.model.scenarios[0]!).series[
    idOf(lookThrough.model, "asst_price")
  ]!;
  assert.ok(navLT[0]! > 0, "look-through NAV stays positive");
  assert.ok(priceLT[0]! > 0, "price does not collapse to zero");

  // Flip to face-value debt: the same converts now subtract and wipe the common early.
  const faceValue = setAssumption(lookThrough.model, drvOf(lookThrough.model, "convert_as_equity"), [0]);
  const navFV = computeModel(faceValue.model, faceValue.model.scenarios[0]!).series[
    idOf(faceValue.model, "nav_to_common")
  ]!;
  const priceFV = computeModel(faceValue.model, faceValue.model.scenarios[0]!).series[
    idOf(faceValue.model, "asst_price")
  ]!;
  assert.ok(navFV[0]! < navLT[0]!, "face-value debt lowers NAV vs look-through");
  assert.ok(navFV[0]! < 0 && priceFV[0]! === 0, "face-value converts wipe the common early → price 0");
});

test("the convert treatment is an explicit, adjustable assumption", () => {
  const m = treasury();
  const toggle = m.drivers.find((d) => d.name === "convert_as_equity");
  assert.ok(toggle, "convert_as_equity driver exists");
  assert.ok((toggle!.notes ?? "").toLowerCase().includes("look-through"));
});

test("face-value converts rank junior to senior debt, senior to preferred", () => {
  const m = treasury();
  const stack = m.capitalStack!;
  const senior = stack.tranches.find((t) => t.kind === "senior_debt")!;
  const convert = stack.tranches.find((t) => t.name.startsWith("Convertible"))!;
  const preferred = stack.tranches.find((t) => t.kind === "preferred")!;
  // Ranking: senior (10) < convertible (15) < preferred (20).
  assert.ok(senior.seniority < convert.seniority);
  assert.ok(convert.seniority < preferred.seniority);
  assert.equal(convert.kind, "subordinated_debt");
  assert.equal(convert.notionalRef, "convert_claim");
});

test("face-value converts bite (and still tie out) when convert_as_equity=0", () => {
  const m = treasury();
  const bigConvert = new Array(m.timeline.periods).fill(1500);
  const withConv = setAssumption(m, drvOf(m, "convertible_debt"), bigConvert);
  const faceValue = setAssumption(withConv.model, drvOf(withConv.model, "convert_as_equity"), [0]);
  assert.ok(faceValue.ok);
  const mm = faceValue.model;
  // convert_claim now carries the face-value converts.
  const claim = computeModel(mm, mm.scenarios[0]!).series[idOf(mm, "convert_claim")]!;
  assert.ok(claim.every((v) => Math.abs(v - 1500) < 1e-6));
  // Capital-stack residual still ties out to nav_to_common with the converts in.
  const a = analyzeCapitalStack(mm, mm.scenarios[0]!);
  const nav = computeModel(mm, mm.scenarios[0]!).series[idOf(mm, "nav_to_common")]!;
  for (let p = 0; p < mm.timeline.periods; p++) {
    assert.ok(Math.abs(a.residualToCommon[p]! - Math.max(0, nav[p]!)) < 1e-6);
  }
});
