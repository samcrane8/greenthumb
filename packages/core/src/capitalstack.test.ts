import assert from "node:assert/strict";
import { test } from "node:test";

import { computeModel } from "./engine.js";
import { bitcoinTreasuryModel } from "./templates.js";
import { analyzeCapitalStack } from "./capitalstack.js";
import { addTranche, updateTranche, removeTranche, setCapitalStackAssets, renameItem } from "./operations.js";
import { validateModel, isValid } from "./validation.js";
import type { Model } from "./types.js";

const idOf = (m: Model, n: string) => m.items.find((i) => i.name === n)!.id;

/** A tiny hand-built model: assets series + debt + preferred + common shares. */
function stackModel(assetValues: number[], debt: number, pref: number, shares: number): Model {
  const periods = assetValues.length;
  return {
    id: "m_cs",
    meta: { name: "cs", type: "blank", baseCurrency: "USD", createdAt: "t", modifiedAt: "t", version: 1 },
    timeline: { granularity: "annual", start: "2026-01-01", periods, fiscalYearStartMonth: 1, actualsThrough: -1 },
    drivers: [],
    items: [
      { id: "i_asset", name: "assets", unit: "currency", category: "asset", definition: { kind: "input", values: assetValues } },
      { id: "i_debt", name: "debt", unit: "currency", category: "liability", definition: { kind: "input", values: new Array(periods).fill(debt) } },
      { id: "i_pref", name: "pref", unit: "currency", category: "liability", definition: { kind: "input", values: new Array(periods).fill(pref) } },
      { id: "i_sh", name: "shares", unit: "count", category: "kpi", definition: { kind: "input", values: new Array(periods).fill(shares) } },
    ],
    scenarios: [{ id: "s_base", name: "Base", overrides: {} }],
    capitalStack: {
      assetRefs: ["assets"],
      tranches: [
        { id: "t_debt", name: "Debt", kind: "senior_debt", seniority: 10, notionalRef: "debt", rate: 0.1 },
        { id: "t_pref", name: "Pref", kind: "preferred", seniority: 20, notionalRef: "pref", rate: 0.08 },
        { id: "t_common", name: "Common", kind: "common", seniority: 100, sharesRef: "shares" },
      ],
    },
  };
}

test("senior claims recover before junior under a shortfall", () => {
  // assets 120; debt 100 (senior), pref 40 (junior). Debt fully covered, pref partial, common 0.
  const m = stackModel([120], 100, 40, 10);
  const a = analyzeCapitalStack(m, m.scenarios[0]!);
  const debt = a.tranches.find((t) => t.id === "t_debt")!;
  const pref = a.tranches.find((t) => t.id === "t_pref")!;
  assert.equal(debt.paid[0], 100, "debt fully paid");
  assert.equal(debt.recovery[0], 1);
  assert.equal(pref.paid[0], 20, "pref gets the remaining 20 of its 40 claim");
  assert.equal(pref.recovery[0], 0.5);
  assert.equal(a.residualToCommon[0], 0, "nothing left for common");
});

test("residual to common = assets − senior − preferred, floored at zero", () => {
  const m = stackModel([200], 100, 40, 10);
  const a = analyzeCapitalStack(m, m.scenarios[0]!);
  assert.equal(a.residualToCommon[0], 60); // 200 - 100 - 40
  assert.equal(a.navPerShare[0], 6); // 60 / 10 shares
  // deep shortfall floors at 0
  const m2 = stackModel([50], 100, 40, 10);
  assert.equal(analyzeCapitalStack(m2, m2.scenarios[0]!).residualToCommon[0], 0);
});

test("coverage rises with asset value", () => {
  const low = analyzeCapitalStack(stackModel([150], 100, 40, 10), { id: "s_base" } as never)
  const high = analyzeCapitalStack(stackModel([300], 100, 40, 10), { id: "s_base" } as never)
  const cov = (a: ReturnType<typeof analyzeCapitalStack>, id: string) => a.tranches.find((t) => t.id === id)!.coverage[0]!
  assert.ok(cov(high, "t_pref") > cov(low, "t_pref"), "higher assets -> higher preferred coverage")
});

test("blended cost = weighted average of debt/preferred rates", () => {
  const m = stackModel([300], 100, 40, 10); // debt 0.10 on 100, pref 0.08 on 40
  const a = analyzeCapitalStack(m, m.scenarios[0]!);
  const expected = (100 * 0.1 + 40 * 0.08) / (100 + 40);
  assert.ok(Math.abs(a.blendedCost[0]! - expected) < 1e-9);
});

test("convertible treated as equity dilutes instead of claiming", () => {
  const base = stackModel([300], 100, 40, 10);
  // add a $60 convertible at strike $5 -> 12 diluted shares if equity
  const withConv: Model = {
    ...base,
    items: [
      ...base.items,
      { id: "i_conv", name: "conv", unit: "currency", category: "liability", definition: { kind: "input", values: [60] } },
    ],
    capitalStack: {
      assetRefs: ["assets"],
      tranches: [
        ...base.capitalStack!.tranches.filter((t) => t.kind !== "common"),
        { id: "t_conv", name: "Convert", kind: "convertible", seniority: 15, notionalRef: "conv", conversionPrice: 5, convertAsEquity: 1 },
        { id: "t_common", name: "Common", kind: "common", seniority: 100, sharesRef: "shares" },
      ],
    },
  };
  const eq = analyzeCapitalStack(withConv, withConv.scenarios[0]!);
  assert.equal(eq.dilutedShares[0], 22, "10 base + 12 converted shares");
  // residual = 300 - 100 - 40 = 160 (convert NOT a claim); /22 shares
  assert.equal(eq.residualToCommon[0], 160);
  assert.ok(Math.abs(eq.navPerShare[0]! - 160 / 22) < 1e-9);

  // as face-value debt: it IS a claim (60), residual = 300-100-40-60 = 100, shares 10
  const asDebt = analyzeCapitalStack(
    { ...withConv, capitalStack: { ...withConv.capitalStack!, tranches: withConv.capitalStack!.tranches.map((t) => (t.id === "t_conv" ? { ...t, convertAsEquity: 0 } : t)) } },
    withConv.scenarios[0]!,
  );
  assert.equal(asDebt.dilutedShares[0], 10);
  assert.equal(asDebt.residualToCommon[0], 100);
});

// --- Operations + validation ------------------------------------------------

test("addTranche with a dangling ref is rejected; valid ref is ok", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const bad = addTranche(m, { name: "X", kind: "senior_debt", seniority: 5, notionalRef: "does_not_exist" });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((i) => i.code === "DANGLING_STACK_REF"));
  const good = addTranche(m, { name: "Extra debt", kind: "subordinated_debt", seniority: 15, notionalRef: "debt_notional" });
  assert.ok(good.ok, JSON.stringify(good.issues));
});

test("a second common tranche is rejected", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const res = addTranche(m, { name: "Common B", kind: "common", seniority: 200, sharesRef: "common_shares" });
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((i) => i.code === "BAD_CAPITAL_STACK"));
});

test("renaming a referenced item updates the tranche ref", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const res = renameItem(m, idOf(m, "preferred_notional"), "pref_notional");
  assert.ok(res.ok, JSON.stringify(res.issues));
  const pref = res.model.capitalStack!.tranches.find((t) => t.kind === "preferred")!;
  assert.equal(pref.notionalRef, "pref_notional", "stack ref followed the rename");
  assert.ok(!res.issues.some((i) => i.code === "DANGLING_STACK_REF"));
});

test("update/remove tranche and set assets work", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const added = addTranche(m, { name: "Sub", kind: "subordinated_debt", seniority: 15, notionalRef: "debt_notional" });
  const tId = added.model.capitalStack!.tranches.find((t) => t.name === "Sub")!.id;
  const up = updateTranche(added.model, tId, { seniority: 12 });
  assert.equal(up.model.capitalStack!.tranches.find((t) => t.id === tId)!.seniority, 12);
  const rm = removeTranche(up.model, tId);
  assert.ok(!rm.model.capitalStack!.tranches.some((t) => t.id === tId));
  const assets = setCapitalStackAssets(rm.model, ["reserve", "cash"]);
  assert.deepEqual(assets.model.capitalStack!.assetRefs, ["reserve", "cash"]);
  assert.ok(assets.ok);
});

// --- Treasury default stack tie-out -----------------------------------------

test("treasury ships a default stack whose residual ties out to nav_to_common", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  assert.ok(isValid(validateModel(m)));
  const kinds = m.capitalStack!.tranches.map((t) => t.kind);
  assert.ok(kinds.includes("senior_debt") && kinds.includes("preferred") && kinds.includes("common"));
  for (const scenario of m.scenarios) {
    const a = analyzeCapitalStack(m, scenario);
    const nav = computeModel(m, scenario).series[idOf(m, "nav_to_common")]!;
    for (let p = 0; p < m.timeline.periods; p++) {
      // residual is floored at 0; nav_to_common can go negative
      assert.ok(
        Math.abs(a.residualToCommon[p]! - Math.max(0, nav[p]!)) < 1e-6,
        `tie-out failed at ${scenario.name} p${p}: ${a.residualToCommon[p]} vs ${Math.max(0, nav[p]!)}`,
      );
    }
  }
});

test("a drawdown scenario cuts junior recovery first", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const base = analyzeCapitalStack(m, m.scenarios[0]!);
  const draw = analyzeCapitalStack(m, m.scenarios.find((s) => s.name === "Drawdown")!);
  // common residual should be lower under drawdown at the peak
  assert.ok(Math.max(...draw.residualToCommon) < Math.max(...base.residualToCommon));
});
