/**
 * Structured output views (PRD §6 "Output / Statement").
 *
 * Statements are organized *views* over the item graph, not separately
 * maintained tabs. Given a computed scenario, assemble the income statement,
 * balance sheet, cash flow, and KPI rows for the UI and the `get_output` tool.
 */

import { computeModel, type SolveOptions } from "./engine.js";
import type { ItemCategory, Model, Scenario } from "./types.js";

export type StatementKind = "income" | "balance_sheet" | "cash_flow" | "kpi";

export interface StatementRow {
  itemId: string;
  name: string;
  category: ItemCategory;
  unit: string;
  values: number[];
}

export interface Statement {
  kind: StatementKind;
  scenarioId: string;
  periods: number;
  rows: StatementRow[];
}

const STATEMENT_CATEGORIES: Record<StatementKind, ItemCategory[]> = {
  income: ["revenue", "cogs", "opex", "kpi"],
  balance_sheet: ["asset", "liability", "equity"],
  cash_flow: ["cashflow"],
  kpi: ["kpi"],
};

/** Build one statement view for a scenario. */
export function getStatement(
  model: Model,
  scenario: Scenario,
  kind: StatementKind,
  options?: SolveOptions,
): Statement {
  const computed = computeModel(model, scenario, options);
  const categories = new Set(STATEMENT_CATEGORIES[kind]);
  const rows: StatementRow[] = model.items
    .filter((i) => categories.has(i.category))
    .map((i) => ({
      itemId: i.id,
      name: i.name,
      category: i.category,
      unit: i.unit,
      values: computed.series[i.id] ?? [],
    }));
  return { kind, scenarioId: scenario.id, periods: model.timeline.periods, rows };
}

/** Compare one output row across scenarios (base vs. alternatives). */
export function compareScenarios(
  model: Model,
  itemId: string,
  scenarioIds: string[],
  options?: SolveOptions,
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const id of scenarioIds) {
    const scenario = model.scenarios.find((s) => s.id === id);
    if (!scenario) continue;
    out[id] = computeModel(model, scenario, options).series[itemId] ?? [];
  }
  return out;
}
