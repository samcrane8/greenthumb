/**
 * Forecast-accuracy metrics (handbook §3 "Measuring accuracy: more than one
 * metric").
 *
 * Pure math over an actual series and a forecast series. No single number
 * suffices, so `scoreSeries` always returns MAE, RMSE, MAPE and bias together —
 * a model can have an acceptable MAPE while systematically over- or
 * under-forecasting, and only the bias term reveals that.
 *
 * Actuals are `(number | null)[]`: a null (or non-finite) actual means "no
 * observation this period" and is not scored. Zero actuals ARE scored by the
 * magnitude metrics but skipped by MAPE (division by zero), so MAPE carries its
 * own scored count.
 */

import { computeModel, type SolveOptions } from "./engine.js";
import { resolveItemId, resolveScenario } from "./analysis.js";
import type { Model } from "./types.js";

/** The metric set. Report all of it — one number hides the failure mode. */
export interface AccuracyMetrics {
  /** Mean absolute error, native units. Robust, hard to game. */
  mae: number;
  /** Root-mean-square error, native units. Punishes large misses disproportionately. */
  rmse: number;
  /** Mean absolute percentage error, in percent (12.5 = 12.5%). Skips zero actuals. */
  mape: number;
  /** Mean signed error `mean(forecast − actual)`. Sign is the direction of bias. */
  bias: number;
  /** Periods scored by the magnitude metrics (present, finite actual & forecast). */
  n: number;
  /** Periods scored by MAPE (present, finite, non-zero actual). */
  mapeN: number;
}

const finite = (v: number | null | undefined): v is number =>
  v !== null && v !== undefined && Number.isFinite(v);

/**
 * Score aligned forecast-vs-actual arrays. Positions are matched by index (same
 * period). Periods where the actual is missing or non-finite are skipped.
 */
export function scoreSeries(
  actual: (number | null)[],
  forecast: (number | null)[],
): AccuracyMetrics {
  const len = Math.min(actual.length, forecast.length);
  let sumAbs = 0;
  let sumSq = 0;
  let sumSigned = 0;
  let sumPct = 0;
  let n = 0;
  let mapeN = 0;

  for (let i = 0; i < len; i++) {
    const a = actual[i];
    const f = forecast[i];
    if (!finite(a) || !finite(f)) continue;
    const err = f - a;
    sumAbs += Math.abs(err);
    sumSq += err * err;
    sumSigned += err;
    n += 1;
    if (a !== 0) {
      sumPct += Math.abs(err / a);
      mapeN += 1;
    }
  }

  return {
    mae: n === 0 ? 0 : sumAbs / n,
    rmse: n === 0 ? 0 : Math.sqrt(sumSq / n),
    mape: mapeN === 0 ? 0 : (sumPct / mapeN) * 100,
    bias: n === 0 ? 0 : sumSigned / n,
    n,
    mapeN,
  };
}

export interface ScoreForecastOptions extends SolveOptions {
  /** Scenario to compute under; defaults to the base scenario. */
  scenarioId?: string;
}

/**
 * Score a model's computed forecast for one item against a supplied actuals
 * series. Read-only: computes the model but never mutates it. Returns the full
 * metric set so a failure mode hidden by one number stays visible in the others.
 */
export function scoreForecast(
  model: Model,
  itemRef: string,
  actual: (number | null)[],
  options: ScoreForecastOptions = {},
): AccuracyMetrics {
  const { scenarioId, ...solve } = options;
  const scenario = resolveScenario(model, scenarioId);
  const itemId = resolveItemId(model, itemRef);
  const computed = computeModel(model, scenario, solve);
  const forecast = computed.series[itemId] ?? [];
  return scoreSeries(actual, forecast);
}

/** Mean absolute error over the scored periods. */
export const mae = (actual: (number | null)[], forecast: (number | null)[]): number =>
  scoreSeries(actual, forecast).mae;

/** Root-mean-square error over the scored periods. */
export const rmse = (actual: (number | null)[], forecast: (number | null)[]): number =>
  scoreSeries(actual, forecast).rmse;

/** Mean absolute percentage error (percent), skipping zero actuals. */
export const mape = (actual: (number | null)[], forecast: (number | null)[]): number =>
  scoreSeries(actual, forecast).mape;

/** Mean signed error `mean(forecast − actual)` — the direction of the miss. */
export const bias = (actual: (number | null)[], forecast: (number | null)[]): number =>
  scoreSeries(actual, forecast).bias;
