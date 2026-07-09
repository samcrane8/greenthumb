/**
 * Calibration (handbook §4 step 3 "Confront every scenario with reality").
 *
 * Point the machinery backward: which driver settings would have reproduced
 * actual history? `calibrate` searches a bounded space for the driver values
 * that minimize a chosen accuracy metric over an *in-sample* window, and reports
 * the residuals so the largest systematic misses read as a to-do list of likely
 * *structural* fixes.
 *
 * Two disciplines are baked in:
 *  - The search is BOUNDED (a grid over each driver's range refined by local
 *    coordinate descent) — no gradient, no unbounded wandering that manufactures
 *    spurious precision.
 *  - Calibration NEVER commits. It returns a candidate the caller applies through
 *    the existing setAssumption `preview → accept` flow, and any accepted change
 *    must pass the out-of-sample gate (re-backtest on the holdout must improve) —
 *    in-sample fit is never the referee.
 */

import { scoreSeries, type AccuracyMetrics } from "./accuracy.js";
import { computeModel, type SolveOptions } from "./engine.js";
import { resolveItemId, resolveScenario } from "./analysis.js";
import type { Driver, Model, Scenario } from "./types.js";

export type CalibrationMetric = "mae" | "rmse" | "mape";

export interface DriverBounds {
  min: number;
  max: number;
}

export interface CalibrateOptions extends SolveOptions {
  scenarioId?: string;
  metric?: CalibrationMetric;
  /** In-sample window to fit over. Defaults to `[0, last observed actual]`. */
  window?: { from: number; to: number };
  /** Per-driver [min, max] bounds. Defaults to ±50% of the driver's current value. */
  bounds?: Record<string, DriverBounds>;
  /** Grid points per driver per pass. Defaults to 11. */
  gridSteps?: number;
  /** Coordinate-descent refinement passes. Defaults to 3. */
  passes?: number;
  /** Acceptable metric value; above it, a structural fix is flagged. */
  acceptable?: number;
}

export interface RankedMiss {
  period: number;
  actual: number;
  forecast: number;
  residual: number;
}

export interface CalibrationResult {
  /** Best-fit driver values within bounds, keyed by driver id. */
  bestValues: Record<string, number>;
  /** The metric optimized and its value at the best fit. */
  metric: CalibrationMetric;
  score: number;
  /** Full metric set at the best fit (so bias is visible, not just the target). */
  inSample: AccuracyMetrics;
  /** Per-period residuals (forecast − actual) over the in-sample window. */
  residuals: (number | null)[];
  /** Largest systematic misses, most severe first — the structural to-do list. */
  rankedMisses: RankedMiss[];
  /**
   * True when no in-bounds setting reaches an acceptable fit — the signal that
   * the model's structure, not its inputs, is the likely fault.
   */
  structuralFixLikely: boolean;
}

const resolveDriver = (model: Model, ref: string): Driver => {
  const d = model.drivers.find((x) => x.id === ref) ?? model.drivers.find((x) => x.name === ref);
  if (!d) throw new Error(`No driver with id or name "${ref}"`);
  return d;
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function defaultBounds(driver: Driver): DriverBounds {
  const cur = driver.shape === "scalar" ? driver.values[0] ?? 0 : driver.values[0] ?? 0;
  if (cur === 0) return { min: -1, max: 1 };
  const a = cur * 0.5;
  const b = cur * 1.5;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

/**
 * Fit `driverRefs` to `actuals` for a target item, minimizing `metric` over the
 * in-sample window. Read-only: never mutates the model. Returns a candidate to be
 * applied through the preview/accept flow, gated out-of-sample by the caller.
 */
export function calibrate(
  model: Model,
  targetItemRef: string,
  driverRefs: string[],
  actuals: (number | null)[],
  options: CalibrateOptions = {},
): CalibrationResult {
  const {
    scenarioId,
    metric = "rmse",
    window,
    bounds = {},
    gridSteps = 11,
    passes = 3,
    acceptable,
    ...solve
  } = options;

  const base = resolveScenario(model, scenarioId);
  const itemId = resolveItemId(model, targetItemRef);
  const drivers = driverRefs.map((r) => resolveDriver(model, r));
  const periods = model.timeline.periods;

  const from = window?.from ?? 0;
  let to = window?.to ?? actuals.length - 1;
  // Clamp `to` to the last observed actual.
  for (let i = to; i >= from; i--) {
    if (actuals[i] !== null && actuals[i] !== undefined && Number.isFinite(actuals[i])) {
      to = i;
      break;
    }
  }

  const driverBounds = new Map<string, DriverBounds>(
    drivers.map((d) => [d.id, bounds[d.id] ?? bounds[d.name] ?? defaultBounds(d)]),
  );

  // Candidate values, seeded at each driver's current value (clamped into bounds).
  const best: Record<string, number> = {};
  for (const d of drivers) {
    const b = driverBounds.get(d.id)!;
    best[d.id] = clamp(d.shape === "scalar" ? d.values[0] ?? 0 : d.values[0] ?? 0, b.min, b.max);
  }

  // Objective: score the target item over the in-sample window for a value set.
  const evalAt = (values: Record<string, number>): AccuracyMetrics => {
    const overrides: Record<string, (number | null)[]> = { ...base.overrides };
    for (const d of drivers) overrides[d.id] = new Array(periods).fill(values[d.id]);
    const scenario: Scenario = { ...base, id: `${base.id}~cal`, overrides };
    const series = computeModel(model, scenario, solve).series[itemId] ?? [];
    return scoreSeries(actuals.slice(from, to + 1), series.slice(from, to + 1));
  };

  const objective = (m: AccuracyMetrics): number => m[metric];

  let bestMetrics = evalAt(best);
  let bestScore = objective(bestMetrics);

  // Coordinate descent: sweep each driver over a grid, narrowing the range each
  // pass around the incumbent best (local refinement).
  for (let pass = 0; pass < passes; pass++) {
    const shrink = Math.pow(0.5, pass); // grid half-width contracts each pass
    let improvedThisPass = false;
    for (const d of drivers) {
      const b = driverBounds.get(d.id)!;
      const center = best[d.id]!;
      const halfRange = ((b.max - b.min) / 2) * shrink;
      const lo = clamp(center - halfRange, b.min, b.max);
      const hi = clamp(center + halfRange, b.min, b.max);
      const stepCount = Math.max(2, gridSteps);
      for (let k = 0; k < stepCount; k++) {
        const v = lo + ((hi - lo) * k) / (stepCount - 1);
        const trial = { ...best, [d.id]: v };
        const m = evalAt(trial);
        const s = objective(m);
        if (s < bestScore - 1e-12) {
          bestScore = s;
          bestMetrics = m;
          best[d.id] = v;
          improvedThisPass = true;
        }
      }
    }
    if (!improvedThisPass && pass > 0) break;
  }

  // Residuals + ranked misses at the best fit.
  const overrides: Record<string, (number | null)[]> = { ...base.overrides };
  for (const d of drivers) overrides[d.id] = new Array(periods).fill(best[d.id]);
  const fitScenario: Scenario = { ...base, id: `${base.id}~cal`, overrides };
  const fitSeries = computeModel(model, fitScenario, solve).series[itemId] ?? [];

  const residuals: (number | null)[] = [];
  const misses: RankedMiss[] = [];
  for (let p = from; p <= to; p++) {
    const a = actuals[p];
    const f = fitSeries[p];
    if (a === null || a === undefined || !Number.isFinite(a) || !Number.isFinite(f)) {
      residuals.push(null);
      continue;
    }
    const r = f! - a;
    residuals.push(r);
    misses.push({ period: p, actual: a, forecast: f!, residual: r });
  }
  misses.sort((x, y) => Math.abs(y.residual) - Math.abs(x.residual));

  // Structural signal: either the acceptable threshold isn't met, or nearly all
  // error is one-directional (bias ≈ magnitude) — a shape the inputs can't fix.
  const systematic =
    bestMetrics.n > 0 && bestMetrics.mae > 0 && Math.abs(bestMetrics.bias) >= 0.99 * bestMetrics.mae;
  const structuralFixLikely =
    acceptable !== undefined ? bestScore > acceptable : systematic;

  return {
    bestValues: best,
    metric,
    score: bestScore,
    inSample: bestMetrics,
    residuals,
    rankedMisses: misses,
    structuralFixLikely,
  };
}
