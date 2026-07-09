import assert from "node:assert/strict";
import { test } from "node:test";

import {
  listCommodities,
  findPriceModel,
  generatePrice,
  daysSinceGenesis,
  periodDate,
} from "./commodities.js";
import type { Timeline } from "./types.js";

/** Classic max drawdown: deepest fall from a running peak. */
function maxDrawdown(series: number[]): number {
  let peak = -Infinity;
  let dd = 0;
  for (const v of series) {
    peak = Math.max(peak, v);
    dd = Math.max(dd, 1 - v / peak);
  }
  return dd;
}

function timeline(overrides: Partial<Timeline> = {}): Timeline {
  return {
    granularity: "quarterly",
    start: "2026-07-01",
    periods: 20, // 5 years — spans a full 4-year cycle
    fiscalYearStartMonth: 1,
    actualsThrough: -1,
    ...overrides,
  };
}

test("bitcoin is registered with a power-law model", () => {
  const commodities = listCommodities();
  const btc = commodities.find((c) => c.id === "bitcoin");
  assert.ok(btc, "bitcoin registered");
  assert.ok(btc!.models.some((m) => m.id === "powerlaw"));
  assert.ok(findPriceModel("bitcoin", "powerlaw"));
});

test("generates one finite positive price per period", () => {
  const tl = timeline({ periods: 16 });
  const series = generatePrice("bitcoin", "powerlaw", tl, {});
  assert.equal(series.length, 16);
  assert.ok(series.every((v) => Number.isFinite(v) && v > 0));
});

test("series oscillates around its trend (non-monotonic over a full cycle)", () => {
  const tl = timeline({ periods: 24 }); // 6 years, > one full cycle
  const series = generatePrice("bitcoin", "powerlaw", tl, { spot: 62850 });
  let rises = 0;
  let falls = 0;
  for (let i = 1; i < series.length; i++) {
    if (series[i]! > series[i - 1]!) rises++;
    else falls++;
  }
  assert.ok(rises > 0 && falls > 0, `expected both up and down moves, got ${rises} up / ${falls} down`);
});

test("a below-trend spot pins period 0 and rises through fair value before reversing", () => {
  const tl = timeline({ periods: 24 });
  const fair = generatePrice("bitcoin", "powerlaw", tl, { band: "fair" });
  const spot = 62850;
  assert.ok(spot < fair[0]!, "test premise: spot is below fair value at period 0");
  const series = generatePrice("bitcoin", "powerlaw", tl, { spot });
  // period 0 pinned to spot
  assert.ok(Math.abs(series[0]! - spot) / spot < 1e-6, `period 0 should equal spot, got ${series[0]}`);
  // rises early
  assert.ok(series[3]! > series[0]!, "series rises off the trough");
  // crosses above fair value at some point (arcs up through fair)
  assert.ok(
    series.some((v, i) => v > fair[i]!),
    "series should rise above its own fair-value trend at some point",
  );
  // and reverses (a real pullback from a running peak occurs within the horizon)
  assert.ok(maxDrawdown(series) > 0.2, "series reverses meaningfully after arcing up");
});

test("support band is uniformly below fair band", () => {
  const tl = timeline();
  const support = generatePrice("bitcoin", "powerlaw", tl, { band: "support" });
  const fair = generatePrice("bitcoin", "powerlaw", tl, { band: "fair" });
  for (let i = 0; i < tl.periods; i++) assert.ok(support[i]! < fair[i]!, `support < fair at ${i}`);
});

test("peak-to-trough drawdown over a down-leg is ~45-50% (calibrated to reference)", () => {
  // Long horizon so a full oscillation down-leg is sampled. Use running-peak max
  // drawdown — the trend lifts later oscillation peaks above earlier ones, so a
  // naive global-max→min truncates the pullback.
  const tl = timeline({ periods: 28 }); // 7 years
  const series = generatePrice("bitcoin", "powerlaw", tl, { spot: 62850 });
  const drawdown = maxDrawdown(series);
  assert.ok(drawdown > 0.38 && drawdown < 0.52, `expected ~47% drawdown, got ${(drawdown * 100).toFixed(1)}%`);
});

test("phase inference reproduces the spot at period 0 for various spots", () => {
  const tl = timeline();
  for (const spot of [40000, 62850, 90000, 150000]) {
    const series = generatePrice("bitcoin", "powerlaw", tl, { spot });
    assert.ok(Math.abs(series[0]! - spot) / spot < 1e-6, `spot ${spot} not reproduced: ${series[0]}`);
  }
});

test("daysSinceGenesis is calendar-accurate across granularities", () => {
  // 2019-01-03 is exactly 10 years after genesis (2009-01-03): 3652 days incl. 2012,2016 leaps.
  const tl = timeline({ start: "2019-01-03", periods: 5 });
  assert.equal(daysSinceGenesis(tl, 0), 3652);
  // quarterly: period 4 is one year later — ~365/366 days more
  const q = timeline({ granularity: "quarterly", start: "2020-01-03", periods: 8 });
  const diff = daysSinceGenesis(q, 4) - daysSinceGenesis(q, 0);
  assert.ok(diff === 365 || diff === 366, `one year should be 365/366 days, got ${diff}`);
  // annual advances 12 months per period
  const a = timeline({ granularity: "annual", start: "2026-01-01", periods: 4 });
  assert.equal(periodDate(a, 2).getUTCFullYear(), 2028);
  // monotonic increasing
  const m = timeline({ granularity: "monthly", start: "2026-01-01", periods: 12 });
  for (let i = 1; i < 12; i++) assert.ok(daysSinceGenesis(m, i) > daysSinceGenesis(m, i - 1));
});
