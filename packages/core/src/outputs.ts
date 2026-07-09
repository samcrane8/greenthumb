/**
 * Structured output views (PRD §6 "Output / Statement").
 *
 * Statements are organized *views* over the item graph, not separately
 * maintained tabs. Given a computed scenario, assemble the income statement,
 * balance sheet, cash flow, and KPI rows for the UI and the `get_output` tool.
 */

import { computeModel, expandDriver, type SolveOptions } from "./engine.js";
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

// ---------------------------------------------------------------------------
// Chart data — derived on demand from a chart definition + a scenario.
// Charts store only series *references*; their numbers are computed here, never
// cached on the model (mirrors how statements are derived).
// ---------------------------------------------------------------------------

export interface ChartDataSeries {
  ref: string;
  label: string;
  axis: "left" | "right";
  style?: string;
  values: number[];
}

export interface ChartData {
  chartId: string;
  title: string;
  kind: string;
  scenarioId: string;
  periods: number;
  series: ChartDataSeries[];
  /** One row per period keyed by series label, ready for a charting library. */
  rows: Array<Record<string, number>>;
}

/** Rebase a series to 100 at the first period (for indexed comparisons). */
function indexSeries(values: number[]): number[] {
  const first = values[0];
  if (first === undefined || first === 0) return values.map(() => 0);
  return values.map((v) => (v / first) * 100);
}

/**
 * Compute a chart's referenced series for a scenario. A ref may name an item or
 * a driver (items win name collisions, per engine rules). Returns per-series
 * arrays plus period-keyed rows for direct charting.
 */
export function getChartData(
  model: Model,
  scenario: Scenario,
  chartId: string,
  options?: SolveOptions,
): ChartData {
  const chart = model.charts?.find((c) => c.id === chartId);
  if (!chart) throw new Error(`No chart with id ${chartId}`);

  const periods = model.timeline.periods;
  const computed = computeModel(model, scenario, options);

  // Resolve a name to its computed series: item first, then driver.
  const itemByName = new Map(model.items.map((i) => [i.name, i.id]));
  const driverByName = new Map(model.drivers.map((d) => [d.name, d]));
  const valuesFor = (ref: string): number[] => {
    const itemId = itemByName.get(ref);
    if (itemId) return computed.series[itemId] ?? new Array(periods).fill(0);
    const driver = driverByName.get(ref);
    if (driver) {
      const base = expandDriver(driver, periods);
      const ov = scenario.overrides[driver.id];
      if (!ov) return base;
      return base.map((v, i) => {
        const o = ov[i];
        return o === null || o === undefined ? v : o;
      });
    }
    return new Array(periods).fill(0);
  };

  const series: ChartDataSeries[] = chart.series.map((s) => {
    const raw = valuesFor(s.ref);
    return {
      ref: s.ref,
      label: s.label ?? s.ref,
      axis: s.axis ?? "left",
      style: s.style,
      values: s.index ? indexSeries(raw) : raw,
    };
  });

  const rows: Array<Record<string, number>> = [];
  for (let p = 0; p < periods; p++) {
    const row: Record<string, number> = { period: p };
    for (const s of series) row[s.label] = s.values[p] ?? 0;
    rows.push(row);
  }

  return {
    chartId: chart.id,
    title: chart.title,
    kind: chart.kind,
    scenarioId: scenario.id,
    periods,
    series,
    rows,
  };
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
