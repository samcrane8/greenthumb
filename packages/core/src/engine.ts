/**
 * Calculation engine (PRD §7.2).
 *
 * Owns the dependency graph and recompute. Two properties matter most:
 *
 *  1. Correct ordering — formula items are evaluated in dependency order within
 *     each period, so acyclic models settle immediately.
 *  2. Intentional circularity — real 3-statement models have genuine cycles
 *     (interest expense ↔ debt balance ↔ cash). We solve those with a bounded
 *     Gauss-Seidel fixed-point iteration and report convergence. This is where
 *     naive engines fail, so it is first-class here.
 */

import { evaluate, parse, referencedNames, type Node } from "./formula.js";
import type { ComputedModel, Driver, Model, Scenario, Timeline } from "./types.js";

export interface SolveOptions {
  maxIterations?: number;
  /** Absolute convergence tolerance on formula values between iterations. */
  epsilon?: number;
  /**
   * Point-in-time cutover (handbook §3). When set, stored actuals for periods
   * `≤ asOf` are substituted into item series (locking known history) and
   * periods `> asOf` are forecast forward from that frozen state. Requires
   * `actuals`. A forecast that reaches *forward* in time (via `lead`) to an
   * actuals-bearing item is recorded as a look-ahead-bias violation.
   */
  asOf?: number;
  /** Observed actuals keyed by item id: `itemId -> (number|null)[]`. */
  actuals?: Record<string, (number | null)[]>;
}

const DEFAULTS = { maxIterations: 100, epsilon: 1e-6 } as const;

const isFinite = (v: number | null | undefined): v is number =>
  v !== null && v !== undefined && Number.isFinite(v);

interface Symbol {
  kind: "item" | "driver";
  id: string;
}

/** Precompiled per-item formula plus its dependency footprint. */
interface Compiled {
  itemId: string;
  ast: Node;
  samePeriodDeps: string[]; // referenced names evaluated at the current period
}

/**
 * Periods per year for a timeline granularity, for annualization in the formula
 * layer (`periods_per_year()`). Weekly maps to 52 if/when a weekly grain exists.
 */
function periodsPerYear(granularity: Timeline["granularity"]): number {
  switch (granularity) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "annual":
      return 1;
    default:
      return 1;
  }
}

/**
 * Compute every item's series for one scenario. Pure: it does not mutate the
 * model. Returns the computed series plus solver diagnostics.
 */
export function computeModel(
  model: Model,
  scenario: Scenario,
  options: SolveOptions = {},
): ComputedModel {
  const { maxIterations, epsilon } = { ...DEFAULTS, ...options };
  const { asOf, actuals } = options;
  const periods = model.timeline.periods;

  // Symbol table: reference item/driver by human name or id. Items win ties.
  const symbols = buildSymbolTable(model);

  // Which items carry any actuals (for the look-ahead-bias guard).
  const hasActuals = (itemId: string): boolean => {
    const a = actuals?.[itemId];
    return !!a && a.some(isFinite);
  };

  // Substitute a stored actual for period p ≤ asOf, if present.
  const lockedActual = (itemId: string, p: number): number | undefined => {
    if (asOf === undefined || p > asOf) return undefined;
    const v = actuals?.[itemId]?.[p];
    return isFinite(v) ? v : undefined;
  };

  // Driver series under this scenario (base values with per-period overrides).
  const driverSeries = new Map<string, number[]>();
  for (const d of model.drivers) {
    driverSeries.set(d.id, applyScenario(expandDriver(d, periods), scenario, d.id));
  }

  // Seed item series. Inputs and driver-refs are fixed; formulas start at 0.
  const series: Record<string, number[]> = {};
  const compiled: Compiled[] = [];
  for (const item of model.items) {
    const def = item.definition;
    if (def.kind === "input") {
      series[item.id] = padValues(def.values, periods);
    } else if (def.kind === "driver_ref") {
      series[item.id] = (driverSeries.get(def.driverId) ?? zeros(periods)).slice();
    } else {
      series[item.id] = zeros(periods);
      const ast = parse(def.expression);
      compiled.push({
        itemId: item.id,
        ast,
        samePeriodDeps: samePeriodRefs(ast),
      });
    }
    // Lock known actuals into non-formula items up front (formulas are locked
    // inside the iteration so they stay pinned each pass).
    if (asOf !== undefined && def.kind !== "formula") {
      for (let p = 0; p <= Math.min(asOf, periods - 1); p++) {
        const a = lockedActual(item.id, p);
        if (a !== undefined) series[item.id]![p] = a;
      }
    }
  }

  const order = orderFormulas(compiled, symbols);

  // Look-ahead-bias guard: during an as-of compute, a read that reaches *forward*
  // in time (period > the period being evaluated) to an actuals-bearing item is a
  // causality violation. `currentEvalPeriod` tracks the period under evaluation.
  let currentEvalPeriod = 0;
  const lookAhead = new Set<string>();

  // Resolver reads the live series/drivers (Gauss-Seidel — later items in a
  // pass see values updated earlier in the same pass).
  const resolve = (name: string, period: number): number => {
    if (period < 0 || period >= periods) return 0;
    const sym = symbols.get(name);
    if (!sym) return 0; // dangling refs are reported by validation, not here
    if (sym.kind === "driver") return driverSeries.get(sym.id)?.[period] ?? 0;
    if (asOf !== undefined && period > currentEvalPeriod && hasActuals(sym.id)) {
      lookAhead.add(sym.id); // forecast reaching forward into an observed item
    }
    return series[sym.id]?.[period] ?? 0;
  };
  const ctx = { resolve, periods, periodsPerYear: periodsPerYear(model.timeline.granularity) };

  // Fixed-point iteration. Acyclic models converge on the 2nd pass (delta 0);
  // cyclic models iterate until the change falls under epsilon or we bail.
  let iterations = 0;
  let converged = false;
  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;
    let maxDelta = 0;
    for (let p = 0; p < periods; p++) {
      currentEvalPeriod = p;
      for (const c of order) {
        const target = series[c.itemId]!;
        const locked = lockedActual(c.itemId, p);
        const next = locked !== undefined ? locked : evaluate(c.ast, p, ctx);
        const delta = Math.abs(next - target[p]!);
        if (delta > maxDelta) maxDelta = delta;
        target[p] = next;
      }
    }
    if (maxDelta < epsilon) {
      converged = true;
      break;
    }
  }

  // Expose the scenario-applied driver series so adapters can resolve a name to an
  // item or a driver (items win) without duplicating driver expansion.
  const driversOut: Record<string, number[]> = {};
  for (const [id, values] of driverSeries) driversOut[id] = values;

  const result: ComputedModel = {
    scenarioId: scenario.id,
    series,
    drivers: driversOut,
    converged,
    iterations,
  };
  if (asOf !== undefined && lookAhead.size > 0) result.lookAhead = [...lookAhead];
  return result;
}

// ---------------------------------------------------------------------------
// Dependency ordering
// ---------------------------------------------------------------------------

/**
 * Topologically order formula items by same-period dependencies (Kahn). Items
 * that remain in cycles (intentional circularity) are appended in definition
 * order; the fixed-point loop resolves them.
 */
function orderFormulas(compiled: Compiled[], symbols: Map<string, Symbol>): Compiled[] {
  const byItemId = new Map(compiled.map((c) => [c.itemId, c]));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // itemId -> items that depend on it
  for (const c of compiled) indegree.set(c.itemId, 0);

  for (const c of compiled) {
    for (const name of c.samePeriodDeps) {
      const sym = symbols.get(name);
      if (!sym || sym.kind !== "item") continue;
      if (!byItemId.has(sym.id)) continue; // dep is an input/driver-ref, not a formula
      if (sym.id === c.itemId) continue; // self-reference resolves via iteration
      dependents.set(sym.id, [...(dependents.get(sym.id) ?? []), c.itemId]);
      indegree.set(c.itemId, (indegree.get(c.itemId) ?? 0) + 1);
    }
  }

  const queue = compiled.filter((c) => (indegree.get(c.itemId) ?? 0) === 0);
  const ordered: Compiled[] = [];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const c = queue.shift()!;
    if (seen.has(c.itemId)) continue;
    seen.add(c.itemId);
    ordered.push(c);
    for (const depId of dependents.get(c.itemId) ?? []) {
      const d = indegree.get(depId)! - 1;
      indegree.set(depId, d);
      if (d === 0 && byItemId.has(depId)) queue.push(byItemId.get(depId)!);
    }
  }
  // Anything left is part of a cycle — keep it, iteration will converge it.
  for (const c of compiled) if (!seen.has(c.itemId)) ordered.push(c);
  return ordered;
}

/**
 * Names referenced at the *current* period — i.e. reachable without passing
 * through a period-shifting function (prior/lag/lead). These form the edges
 * that can create same-period cycles.
 */
function samePeriodRefs(node: Node): string[] {
  const out = new Set<string>();
  const walk = (n: Node) => {
    switch (n.type) {
      case "ref":
        out.add(n.name);
        return;
      case "unary":
        walk(n.arg);
        return;
      case "binary":
        walk(n.left);
        walk(n.right);
        return;
      case "call": {
        const name = n.name;
        if (name === "prior") return; // arg is at period-1
        if (name === "lag" || name === "lead") {
          // arg[0] is shifted; arg[1] (the count) is same-period
          if (n.args[1]) walk(n.args[1]);
          return;
        }
        n.args.forEach(walk); // cumulative/rolling/growth/min/... use current period
        return;
      }
    }
  };
  walk(node);
  return [...out];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSymbolTable(model: Model): Map<string, Symbol> {
  const table = new Map<string, Symbol>();
  // Drivers first, then items — items overwrite on name collision (items win).
  for (const d of model.drivers) {
    table.set(d.id, { kind: "driver", id: d.id });
    table.set(d.name, { kind: "driver", id: d.id });
  }
  for (const item of model.items) {
    table.set(item.id, { kind: "item", id: item.id });
    table.set(item.name, { kind: "item", id: item.id });
  }
  return table;
}

/** Expand a driver's base values to a full-length series. */
export function expandDriver(driver: Driver, periods: number): number[] {
  if (driver.shape === "scalar") {
    const v = driver.values[0] ?? 0;
    return new Array(periods).fill(v);
  }
  return padValues(driver.values, periods);
}

function applyScenario(base: number[], scenario: Scenario, driverId: string): number[] {
  const overrides = scenario.overrides[driverId];
  if (!overrides) return base;
  return base.map((v, i) => {
    const o = overrides[i];
    return o === null || o === undefined ? v : o;
  });
}

function padValues(values: (number | null)[], periods: number): number[] {
  const out = zeros(periods);
  const last = values.length > 0 ? values[values.length - 1] ?? 0 : 0;
  for (let i = 0; i < periods; i++) {
    const v = i < values.length ? values[i] : last;
    out[i] = v ?? 0;
  }
  return out;
}

const zeros = (n: number): number[] => new Array(n).fill(0);

/** Re-export for adapters that want to inspect an expression's references. */
export { referencedNames };
