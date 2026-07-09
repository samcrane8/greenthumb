/**
 * Sensitivity analysis (handbook §4 step 1 "Map the sensitivity surface").
 *
 * Read-only compositions over `computeModel`: sweep one driver across a range,
 * rank all drivers by their influence on an output (a tornado), and generate a
 * grid of scenarios programmatically. None of these mutate the stored model —
 * they answer "what does the answer actually depend on?" before scenarios are
 * designed.
 */

import { computeModel, type SolveOptions } from "./engine.js";
import { resolveItemId, resolveScenario } from "./analysis.js";
import { newId } from "./id.js";
import type { Driver, Model, Scenario } from "./types.js";

/** Cap on generated scenario combinations, so a large grid can't silently explode. */
export const MAX_SCENARIO_COMBINATIONS = 500;

const resolveDriver = (model: Model, ref: string): Driver => {
  const d = model.drivers.find((x) => x.id === ref) ?? model.drivers.find((x) => x.name === ref);
  if (!d) throw new Error(`No driver with id or name "${ref}"`);
  return d;
};

/** A scenario that layers a full-length driver override onto a base scenario. */
function withOverride(base: Scenario, driverId: string, values: number[]): Scenario {
  return {
    ...base,
    id: `${base.id}~sweep`,
    overrides: { ...base.overrides, [driverId]: values },
  };
}

export interface SweepPoint {
  value: number;
  output: number[];
}

export interface SweepOptions extends SolveOptions {
  scenarioId?: string;
}

/**
 * Recompute the model once per value of a single driver (held flat across the
 * timeline), holding everything else constant, and return the output item's
 * series at each swept value. One-at-a-time — the essence of sensitivity.
 */
export function sweepDriver(
  model: Model,
  driverRef: string,
  values: number[],
  outputItemRef: string,
  options: SweepOptions = {},
): SweepPoint[] {
  const { scenarioId, ...solve } = options;
  const base = resolveScenario(model, scenarioId);
  const driver = resolveDriver(model, driverRef);
  const itemId = resolveItemId(model, outputItemRef);
  const periods = model.timeline.periods;

  return values.map((value) => {
    const scenario = withOverride(base, driver.id, new Array(periods).fill(value));
    const computed = computeModel(model, scenario, solve);
    return { value, output: computed.series[itemId] ?? [] };
  });
}

export interface TornadoRow {
  driverId: string;
  driverName: string;
  /** Center (base) driver value at the measured period. */
  base: number;
  /** Output at the low (−delta) and high (+delta) perturbations. */
  lowOutput: number;
  highOutput: number;
  /** |highOutput − lowOutput| — the swing this driver produces. */
  impact: number;
}

export interface TornadoOptions extends SolveOptions {
  scenarioId?: string;
  /** Period at which the output swing is measured. Defaults to the last period. */
  atPeriod?: number;
  /** Fractional perturbation applied to each driver (0.1 = ±10%). Defaults to 0.1. */
  deltaPct?: number;
}

/**
 * Perturb each driver one-at-a-time by ±deltaPct, measure the change in a target
 * output at a period, and rank the drivers by the magnitude of the swing. The
 * few dominant drivers surface at the top — where scenario effort belongs.
 */
export function tornado(
  model: Model,
  outputItemRef: string,
  options: TornadoOptions = {},
): TornadoRow[] {
  const { scenarioId, atPeriod, deltaPct = 0.1, ...solve } = options;
  const base = resolveScenario(model, scenarioId);
  const itemId = resolveItemId(model, outputItemRef);
  const periods = model.timeline.periods;
  const p = atPeriod ?? periods - 1;

  // Base driver value at p under the chosen scenario, for each driver.
  const baseComputed = computeModel(model, base, solve);
  void baseComputed;

  const rows: TornadoRow[] = model.drivers.map((driver) => {
    const baseSeries = base.overrides[driver.id];
    const centerAtP =
      baseSeries?.[p] ??
      (driver.shape === "scalar" ? driver.values[0] ?? 0 : driver.values[p] ?? driver.values[driver.values.length - 1] ?? 0);

    const outputAt = (factor: number): number => {
      const perturbed = new Array(periods).fill(0).map((_, i) => {
        const src = baseSeries?.[i];
        const centered =
          src ??
          (driver.shape === "scalar"
            ? driver.values[0] ?? 0
            : driver.values[i] ?? driver.values[driver.values.length - 1] ?? 0);
        return centered * factor;
      });
      const scenario = withOverride(base, driver.id, perturbed);
      return computeModel(model, scenario, solve).series[itemId]?.[p] ?? 0;
    };

    const lowOutput = outputAt(1 - deltaPct);
    const highOutput = outputAt(1 + deltaPct);
    return {
      driverId: driver.id,
      driverName: driver.name,
      base: centerAtP,
      lowOutput,
      highOutput,
      impact: Math.abs(highOutput - lowOutput),
    };
  });

  return rows.sort((a, b) => b.impact - a.impact);
}

export interface ScenarioAxis {
  /** Driver id or name to vary. */
  driver: string;
  /** Values to place on this axis. */
  values: number[];
  /** Optional label prefix for generated scenarios. */
  label?: string;
}

export interface GenerateScenariosResult {
  /** Generated scenarios (empty when the grid overflows the cap). */
  scenarios: Scenario[];
  /** Total combinations the grid would produce. */
  combinations: number;
  /** The cap that was applied. */
  cap: number;
  /** True when `combinations > cap`; when true, `scenarios` is empty (not truncated). */
  overflow: boolean;
}

/**
 * Generate the cartesian product of driver axes as scenario overlays for
 * analysis. Enforces an explicit combination cap and REPORTS overflow rather
 * than silently truncating — a partial grid read as "covered everything" is a
 * lie the handbook warns against.
 */
export function generateScenarios(
  model: Model,
  axes: ScenarioAxis[],
  cap: number = MAX_SCENARIO_COMBINATIONS,
): GenerateScenariosResult {
  const drivers = axes.map((a) => resolveDriver(model, a.driver));
  const combinations = axes.reduce((acc, a) => acc * Math.max(1, a.values.length), 1);
  if (combinations > cap) {
    return { scenarios: [], combinations, cap, overflow: true };
  }

  const periods = model.timeline.periods;
  const scenarios: Scenario[] = [];

  // Iterate the mixed-radix product of axis indices.
  const idx = new Array(axes.length).fill(0);
  const total = combinations;
  for (let k = 0; k < total; k++) {
    const overrides: Record<string, (number | null)[]> = {};
    const parts: string[] = [];
    for (let a = 0; a < axes.length; a++) {
      const value = axes[a]!.values[idx[a]!]!;
      overrides[drivers[a]!.id] = new Array(periods).fill(value);
      parts.push(`${axes[a]!.label ?? drivers[a]!.name}=${value}`);
    }
    scenarios.push({ id: newId("scn"), name: parts.join(", "), overrides });

    // Increment mixed-radix counter.
    for (let a = axes.length - 1; a >= 0; a--) {
      idx[a]!++;
      if (idx[a]! < axes[a]!.values.length) break;
      idx[a] = 0;
    }
  }

  return { scenarios, combinations, cap, overflow: false };
}
