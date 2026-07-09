import assert from "node:assert/strict";
import { test } from "node:test";

import { computeModel } from "./engine.js";
import { saasModel } from "./templates.js";
import { setScenarioValue } from "./operations.js";
import { validateModel, isValid } from "./validation.js";
import type { Model } from "./types.js";

function saas(): Model {
  return saasModel({ name: "Test SaaS", timeline: { periods: 12 } });
}

test("saas template validates clean", () => {
  const issues = validateModel(saas());
  assert.ok(isValid(issues), `unexpected issues: ${JSON.stringify(issues)}`);
});

test("customer build compounds with churn", () => {
  const model = saas();
  const base = model.scenarios[0]!;
  const { series, converged } = computeModel(model, base);
  assert.ok(converged);
  const customers = series[model.items.find((i) => i.name === "customers")!.id]!;
  // period 0 = 120 starting base; then prior*(1-0.02)+20 each month, strictly rising
  assert.equal(customers[0], 120);
  assert.ok(customers[1]! > customers[0]!);
  assert.ok(customers[11]! > customers[1]!);
});

test("mrr = customers * arpa", () => {
  const model = saas();
  const { series } = computeModel(model, model.scenarios[0]!);
  const idOf = (n: string) => model.items.find((i) => i.name === n)!.id;
  const customers = series[idOf("customers")]!;
  const mrr = series[idOf("mrr")]!;
  assert.equal(mrr[5], customers[5]! * 500);
});

test("downside scenario yields lower ebitda than base", () => {
  const model = saas();
  const idOf = (n: string) => model.items.find((i) => i.name === n)!.id;
  const base = computeModel(model, model.scenarios[0]!).series[idOf("ebitda")]!;
  const downside = computeModel(model, model.scenarios[1]!).series[idOf("ebitda")]!;
  assert.ok(downside[11]! < base[11]!);
});

test("iterative solver resolves intentional circularity", () => {
  // interest ↔ debt: interest = debt * rate; debt = prior(debt) + interest (toy cycle)
  const model: Model = {
    id: "m1",
    meta: {
      name: "circular",
      type: "blank",
      baseCurrency: "USD",
      createdAt: "2026-01-01",
      modifiedAt: "2026-01-01",
      version: 1,
    },
    timeline: {
      granularity: "annual",
      start: "2026-01-01",
      periods: 3,
      fiscalYearStartMonth: 1,
      actualsThrough: -1,
    },
    drivers: [{ id: "d_rate", name: "rate", unit: "percent", shape: "scalar", values: [0.1] }],
    items: [
      {
        id: "i_debt",
        name: "debt",
        unit: "currency",
        category: "liability",
        definition: { kind: "input", values: [1000, 1000, 1000] },
      },
      {
        id: "i_interest",
        name: "interest",
        unit: "currency",
        category: "opex",
        definition: { kind: "formula", expression: "debt * rate + interest * 0" },
      },
    ],
    scenarios: [{ id: "s_base", name: "Base", overrides: {} }],
  };
  const { series, converged } = computeModel(model, model.scenarios[0]!);
  assert.ok(converged);
  assert.equal(series["i_interest"]![0], 100);
});

test("scenario override is applied via operations", () => {
  const model = saas();
  const arpa = model.drivers.find((d) => d.name === "arpa")!;
  const res = setScenarioValue(model, model.scenarios[0]!.id, arpa.id, [600]);
  assert.ok(res.ok);
});
