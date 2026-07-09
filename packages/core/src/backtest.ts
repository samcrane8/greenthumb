/**
 * Backtesting (handbook §3).
 *
 * "If we had used this model in the past, how well would it have predicted what
 * actually happened?" Three read-only compositions over `computeModel`:
 *
 *  - `backtest` — forecast vs. stored actuals over the actuals window.
 *  - `backtestSplit` — an in-sample / out-of-sample (holdout) split scored
 *    separately, so quality is judged on data not used to tune the model.
 *  - `walkForward` — the gold standard: roll a point-in-time (as-of) cutover
 *    across history, producing many independent out-of-sample verdicts.
 *
 * All actuals are per-item `(number|null)[]` aligned to the timeline; nulls are
 * unobserved periods. None of these mutate the model.
 */

import { scoreSeries, type AccuracyMetrics } from "./accuracy.js";
import { computeModel, type SolveOptions } from "./engine.js";
import { resolveItemId, resolveScenario } from "./analysis.js";
import type { Model } from "./types.js";

const finite = (v: number | null | undefined): v is number =>
  v !== null && v !== undefined && Number.isFinite(v);

/** Last index that holds a finite actual, or -1 if none. */
export function actualsCoverage(actuals: (number | null)[]): number {
  for (let i = actuals.length - 1; i >= 0; i--) if (finite(actuals[i])) return i;
  return -1;
}

const countActuals = (a: (number | null)[], from: number, to: number): number => {
  let n = 0;
  for (let i = from; i <= to; i++) if (finite(a[i])) n += 1;
  return n;
};

export interface Window {
  from: number;
  to: number;
}

export interface BacktestResult {
  itemId: string;
  window: Window;
  actual: (number | null)[];
  forecast: number[];
  /** forecast − actual per period (null where the actual is missing). */
  residual: (number | null)[];
  metrics: AccuracyMetrics;
}

export interface BacktestOptions extends SolveOptions {
  scenarioId?: string;
  /** Window to score over. Defaults to `[0, actualsCoverage]`. */
  from?: number;
  to?: number;
}

function residuals(actual: (number | null)[], forecast: number[]): (number | null)[] {
  return actual.map((a, i) => (finite(a) && finite(forecast[i]) ? forecast[i]! - a : null));
}

/**
 * Score a target item's forecast against its stored actuals over the window.
 * Errors loudly when the window holds no actuals rather than scoring against
 * missing data.
 */
export function backtest(
  model: Model,
  itemRef: string,
  actuals: (number | null)[],
  options: BacktestOptions = {},
): BacktestResult {
  const { scenarioId, from, to, ...solve } = options;
  const scenario = resolveScenario(model, scenarioId);
  const itemId = resolveItemId(model, itemRef);
  const lo = from ?? 0;
  const cov = actualsCoverage(actuals);
  const hi = to ?? cov;

  if (cov < 0 || countActuals(actuals, lo, Math.max(lo, hi)) === 0) {
    throw new Error(
      `backtest: item "${itemRef}" has no stored actuals in window [${lo}, ${hi}] — nothing to score against`,
    );
  }

  const full = computeModel(model, scenario, solve).series[itemId] ?? [];
  const actualWin = actuals.slice(lo, hi + 1);
  const forecastWin = full.slice(lo, hi + 1);
  return {
    itemId,
    window: { from: lo, to: hi },
    actual: actualWin,
    forecast: forecastWin,
    residual: residuals(actualWin, forecastWin),
    metrics: scoreSeries(actualWin, forecastWin),
  };
}

export interface SplitResult {
  itemId: string;
  splitAt: number;
  inSample: BacktestResult;
  holdout: BacktestResult;
}

/**
 * Split the actuals history at `splitAt` into an in-sample window `[0, splitAt]`
 * and an untouched holdout window `[splitAt+1, coverage]`, scoring each
 * separately. Only holdout performance should count as evidence of quality.
 */
export function backtestSplit(
  model: Model,
  itemRef: string,
  actuals: (number | null)[],
  splitAt: number,
  options: Omit<BacktestOptions, "from" | "to"> = {},
): SplitResult {
  const cov = actualsCoverage(actuals);
  if (splitAt < 0 || splitAt >= cov) {
    throw new Error(
      `backtestSplit: splitAt ${splitAt} must leave actuals on both sides (coverage ends at ${cov})`,
    );
  }
  const itemId = resolveItemId(model, itemRef);
  const inSample = backtest(model, itemRef, actuals, { ...options, from: 0, to: splitAt });
  const holdout = backtest(model, itemRef, actuals, { ...options, from: splitAt + 1, to: cov });
  return { itemId, splitAt, inSample, holdout };
}

export type WalkForwardWindow = "anchored" | "rolling";

export interface WalkForwardStep {
  asOf: number;
  /** The window a re-estimation would have used (anchored grows; rolling slides). */
  trainWindow: Window;
  /** The unseen out-of-sample window scored this step. */
  testWindow: Window;
  actual: (number | null)[];
  forecast: number[];
  metrics: AccuracyMetrics;
}

export interface WalkForwardResult {
  itemId: string;
  window: WalkForwardWindow;
  step: number;
  steps: WalkForwardStep[];
  /** Aggregate out-of-sample metrics across every test window. */
  overall: AccuracyMetrics;
}

export interface WalkForwardOptions extends SolveOptions {
  scenarioId?: string;
  /** Anchored (fixed start, growing end) or rolling (fixed length, slides). */
  window?: WalkForwardWindow;
  /** Periods tested per step. Defaults to 1. */
  step?: number;
  /** First as-of cutover. Defaults to 1 (so there is at least one train period). */
  start?: number;
  /** Rolling train-window length. Defaults to `start + 1`. Ignored when anchored. */
  windowLen?: number;
}

/**
 * Roll a point-in-time cutover across history: at each cutover `t`, forecast the
 * model as-of `t` (locking actuals ≤ t) and score the next unseen window against
 * actuals. Produces many independent out-of-sample verdicts. Every vintage
 * forecast honors the look-ahead-bias guard; if any step's forecast reaches
 * forward into an actuals-bearing item, the walk-forward refuses to run.
 */
export function walkForward(
  model: Model,
  itemRef: string,
  actuals: (number | null)[],
  options: WalkForwardOptions = {},
): WalkForwardResult {
  const { scenarioId, window = "anchored", step = 1, start = 1, windowLen, ...solve } = options;
  const scenario = resolveScenario(model, scenarioId);
  const itemId = resolveItemId(model, itemRef);
  const cov = actualsCoverage(actuals);
  if (cov < start) {
    throw new Error(
      `walkForward: need actuals beyond the start cutover ${start} (coverage ends at ${cov})`,
    );
  }
  const len = windowLen ?? start + 1;
  const actualsMap = { [itemId]: actuals };

  const steps: WalkForwardStep[] = [];
  for (let t = start; t < cov; t += step) {
    const testTo = Math.min(t + step, cov);
    const computed = computeModel(model, scenario, { ...solve, asOf: t, actuals: actualsMap });
    if (computed.lookAhead && computed.lookAhead.length > 0) {
      throw new Error(
        `walkForward: look-ahead-bias violation at as-of ${t} — items ${computed.lookAhead.join(
          ", ",
        )} reach forward in time; a causal backtest cannot use them`,
      );
    }
    const forecast = computed.series[itemId] ?? [];
    const testActual = actuals.slice(t + 1, testTo + 1);
    const testForecast = forecast.slice(t + 1, testTo + 1);
    steps.push({
      asOf: t,
      trainWindow: window === "anchored" ? { from: 0, to: t } : { from: Math.max(0, t - len + 1), to: t },
      testWindow: { from: t + 1, to: testTo },
      actual: testActual,
      forecast: testForecast,
      metrics: scoreSeries(testActual, testForecast),
    });
  }

  // Aggregate over all test windows.
  const allActual: (number | null)[] = [];
  const allForecast: number[] = [];
  for (const s of steps) {
    allActual.push(...s.actual);
    allForecast.push(...s.forecast);
  }
  return { itemId, window, step, steps, overall: scoreSeries(allActual, allForecast) };
}
