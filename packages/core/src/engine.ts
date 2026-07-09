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
import type { ComputedModel, Driver, Model, Scenario } from "./types.js";

export interface SolveOptions {
  maxIterations?: number;
  /** Absolute convergence tolerance on formula values between iterations. */
  epsilon?: number;
}

const DEFAULTS: Required<SolveOptions> = { maxIterations: 100, epsilon: 1e-6 };

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
 * Compute every item's series for one scenario. Pure: it does not mutate the
 * model. Returns the computed series plus solver diagnostics.
 */
export function computeModel(
  model: Model,
  scenario: Scenario,
  options: SolveOptions = {},
): ComputedModel {
  const { maxIterations, epsilon } = { ...DEFAULTS, ...options };
  const periods = model.timeline.periods;

  // Symbol table: reference item/driver by human name or id. Items win ties.
  const symbols = buildSymbolTable(model);

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
  }

  const order = orderFormulas(compiled, symbols);

  // Resolver reads the live series/drivers (Gauss-Seidel — later items in a
  // pass see values updated earlier in the same pass).
  const resolve = (name: string, period: number): number => {
    if (period < 0 || period >= periods) return 0;
    const sym = symbols.get(name);
    if (!sym) return 0; // dangling refs are reported by validation, not here
    if (sym.kind === "driver") return driverSeries.get(sym.id)?.[period] ?? 0;
    return series[sym.id]?.[period] ?? 0;
  };
  const ctx = { resolve, periods };

  // Fixed-point iteration. Acyclic models converge on the 2nd pass (delta 0);
  // cyclic models iterate until the change falls under epsilon or we bail.
  let iterations = 0;
  let converged = false;
  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;
    let maxDelta = 0;
    for (let p = 0; p < periods; p++) {
      for (const c of order) {
        const target = series[c.itemId]!;
        const next = evaluate(c.ast, p, ctx);
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

  return { scenarioId: scenario.id, series, converged, iterations };
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
