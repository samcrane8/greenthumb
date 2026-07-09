/**
 * Commodity price models (PRD — treasury/resource modeling).
 *
 * A registry of commodities, each exposing one or more named PRICE MODELS. A
 * price model is a PURE generator: given a timeline and parameters it returns a
 * per-period price series (`number[]`). Generation is the ONLY place calendar
 * dates are read — the calc engine stays index-based (see engine.ts). Mirrors
 * how `TEMPLATES` works, so metals/oil/etc. slot into the same registry later
 * and mining companies can be modeled the same way.
 *
 * Bitcoin ships with a power-law trend × halving-cycle oscillation model.
 */

import type { Granularity, Timeline } from "./types.js";

export interface PriceModel {
  id: string;
  label: string;
  /** Default parameters; a caller's params override these key-by-key. */
  defaultParams: Record<string, number | string>;
  /** Pure generator: timeline + params -> per-period price series. */
  generate: (timeline: Timeline, params: Record<string, number | string>) => number[];
}

export interface Commodity {
  id: string;
  label: string;
  models: PriceModel[];
}

// ---------------------------------------------------------------------------
// Calendar: days since the Bitcoin genesis block (2009-01-03, UTC).
// ---------------------------------------------------------------------------

const GENESIS_MS = Date.UTC(2009, 0, 3); // 2009-01-03
const MS_PER_DAY = 86_400_000;

/** The UTC date at period `index`, derived from the timeline start + granularity. */
export function periodDate(timeline: Timeline, index: number): Date {
  const start = new Date(timeline.start);
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  const d = start.getUTCDate();
  const step = monthsPerPeriod(timeline.granularity);
  // Advancing whole months keeps day-of-month stable and handles leap years.
  return new Date(Date.UTC(y, m + index * step, d));
}

/** Whole days from the genesis block to period `index` (floored, min 1). */
export function daysSinceGenesis(timeline: Timeline, index: number): number {
  const days = Math.floor((periodDate(timeline, index).getTime() - GENESIS_MS) / MS_PER_DAY);
  return Math.max(1, days);
}

function monthsPerPeriod(g: Granularity): number {
  if (g === "annual") return 12;
  if (g === "quarterly") return 3;
  return 1;
}

// ---------------------------------------------------------------------------
// Bitcoin: power-law trend × halving-cycle oscillation.
// ---------------------------------------------------------------------------

/**
 * Bitcoin power law with cyclical oscillation.
 *
 *   price(t) = coefficient · days(t)^exponent  ·  band  ·  exp(amp · sin(θ(t)))
 *              └──────── power-law trend ──────┘         └── halving-cycle arc ──┘
 *
 * The trend fit (`exponent 5.8`, `coefficient 1.0117e-17`) is the widely cited
 * Santostasi/Burger power-law corridor fair value. The oscillation is a log-space
 * sinusoid over the ~4-year halving cycle; `amplitude 0.55` is calibrated to the
 * reference model's (`docs/references/asst_model.tsx`) ~47% net peak-to-trough
 * drawdown once the rising trend cushions the down-leg. `band` selects the
 * support/fair/resistance corridor line.
 *
 * Spot anchor + phase inference: if `spot` is given, period 0 is pinned to it AND
 * the cycle phase φ is solved so osc(0) = spot / (trend(0)·band) on the RISING arc
 * — so a spot below trend (today's reality) starts the series in the trough,
 * arcing up through fair value and then reversing.
 */
const BAND_MULTIPLIER: Record<string, number> = { support: 0.42, fair: 1.0, resistance: 2.5 };

const bitcoinPowerLaw: PriceModel = {
  id: "powerlaw",
  label: "Power law + halving-cycle oscillation",
  defaultParams: {
    exponent: 5.8,
    coefficient: 1.0117e-17,
    band: "fair",
    cycleYears: 4,
    amplitude: 0.55,
    damping: 0, // amplitude decay per year; 0 = undamped
    // spot: omit for pure fair-value; set to anchor + infer phase
  },
  generate(timeline, params) {
    const p = { ...this.defaultParams, ...params };
    const exponent = Number(p.exponent);
    const coefficient = Number(p.coefficient);
    const cycleYears = Number(p.cycleYears);
    const amplitude = Number(p.amplitude);
    const damping = Number(p.damping);
    const band = BAND_MULTIPLIER[String(p.band)] ?? 1.0;
    const spot = p.spot === undefined ? undefined : Number(p.spot);

    const periods = timeline.periods;
    const trend = (i: number) => coefficient * Math.pow(daysSinceGenesis(timeline, i), exponent) * band;
    // Years elapsed from period 0 (calendar-accurate).
    const t0 = daysSinceGenesis(timeline, 0);
    const yearsAt = (i: number) => (daysSinceGenesis(timeline, i) - t0) / 365.25;

    // Phase φ. Default: start at trend on the upswing (θ0 = 0 -> sin = 0, rising).
    // With a spot anchor, solve osc(0) = spot/trend(0) on the rising arc.
    let phi = 0;
    if (spot !== undefined) {
      const target = spot / trend(0); // desired osc(0)
      // osc = exp(amp·sinθ) -> sinθ = ln(target)/amp, clamped to [-1, 1].
      const sinTheta = amplitude === 0 ? 0 : Math.max(-1, Math.min(1, Math.log(target) / amplitude));
      phi = Math.asin(sinTheta); // asin ∈ [-π/2, π/2] -> the RISING arc (cos ≥ 0)
    }

    const out: number[] = [];
    for (let i = 0; i < periods; i++) {
      const yrs = yearsAt(i);
      const theta = (2 * Math.PI * yrs) / cycleYears + phi;
      const amp = amplitude * Math.exp(-damping * yrs);
      let price = trend(i) * Math.exp(amp * Math.sin(theta));
      if (!Number.isFinite(price) || price < 0) price = 0;
      out.push(price);
    }
    // Pin period 0 exactly to the requested spot (absorb rounding in the phase solve).
    if (spot !== undefined && out.length > 0 && out[0]! > 0) {
      const scale = spot / out[0]!;
      for (let i = 0; i < out.length; i++) out[i] = out[i]! * scale;
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** The registry of available commodities. Extend with metals, oil, etc. */
export const COMMODITIES: Commodity[] = [
  {
    id: "bitcoin",
    label: "Bitcoin",
    models: [bitcoinPowerLaw],
  },
];

/** List commodities and their models (for menus in the UI and MCP). */
export function listCommodities(): Array<{
  id: string;
  label: string;
  models: Array<{ id: string; label: string; defaultParams: Record<string, number | string> }>;
}> {
  return COMMODITIES.map((c) => ({
    id: c.id,
    label: c.label,
    models: c.models.map((m) => ({ id: m.id, label: m.label, defaultParams: m.defaultParams })),
  }));
}

/** Look up a price model by commodity + model id. */
export function findPriceModel(commodityId: string, modelId: string): PriceModel | undefined {
  return COMMODITIES.find((c) => c.id === commodityId)?.models.find((m) => m.id === modelId);
}

/**
 * Generate a price series for a commodity/model over a timeline. Throws if the
 * commodity/model is unknown (callers that persist a binding should validate first).
 */
export function generatePrice(
  commodityId: string,
  modelId: string,
  timeline: Timeline,
  params: Record<string, number | string> = {},
): number[] {
  const model = findPriceModel(commodityId, modelId);
  if (!model) throw new Error(`Unknown commodity price model: ${commodityId}/${modelId}`);
  return model.generate(timeline, params);
}
