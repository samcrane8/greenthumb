/**
 * Capital-stack analysis (PRD §6 outputs — a derived view, like statements).
 *
 * The stored capital stack (types.ts) is an OVERLAY: tranches reference model
 * series by name for their claims/rates. Here we resolve those refs against a
 * computed scenario and run a deterministic seniority WATERFALL per period —
 * claims paid in priority order against asset value — plus coverage, residual to
 * common (NAV/share), blended cost of capital, implied leverage, and dilution
 * from in-the-money convertibles. Pure: no engine change; nothing is stored.
 */

import { computeModel, type SolveOptions } from "./engine.js";
import type { Model, Scenario, Tranche } from "./types.js";

export interface TrancheResult {
  id: string;
  name: string;
  kind: Tranche["kind"];
  seniority: number;
  /** Claim (face/liquidation pref) per period. Zero for the residual/common tranche. */
  claim: number[];
  /** Amount recovered in the waterfall per period. */
  paid: number[];
  /** paid / claim per period (1 = fully covered; 0 when claim is 0). */
  recovery: number[];
  /** Cumulative claim of all strictly-more-senior tranches per period. */
  claimsAhead: number[];
  /** assetValue / (claimsAhead + claim) — is the whole stack down to here covered? */
  coverage: number[];
}

export interface CapitalStackAnalysis {
  scenarioId: string;
  periods: number;
  /** Total asset value the claims run against (sum of assetRefs) per period. */
  assetValue: number[];
  tranches: TrancheResult[];
  /** Value left for common after all senior + preferred claims, floored at 0. */
  residualToCommon: number[];
  /** residualToCommon / diluted common shares. */
  navPerShare: number[];
  /** Common shares incl. in-the-money convertibles treated as equity. */
  dilutedShares: number[];
  /**
   * Σ(claim × rate) / Σ claim over interest/dividend-bearing tranches. This is the
   * weighted-average **annual** rate — rates (`rate`/`rateRef`) are annual by
   * convention, so blendedCost is an annualized cost of capital regardless of the
   * model's period granularity (do not read it as a per-period carry).
   */
  blendedCost: number[];
  /**
   * assetValue / residualToCommon — **total-assets** leverage on the residual
   * equity (how many dollars of the whole asset pool sit on each dollar left for
   * common). Note this is a broader measure than a treasury model's asset-specific
   * "implied leverage" (e.g. reserve ÷ NAV-to-common), which uses one asset in the
   * numerator, not the full pool — the two numbers legitimately differ.
   */
  impliedLeverage: number[];
}

/** Analyze a model's capital stack for a scenario. Throws if there is no stack. */
export function analyzeCapitalStack(
  model: Model,
  scenario: Scenario,
  options?: SolveOptions,
): CapitalStackAnalysis {
  const stack = model.capitalStack;
  if (!stack) throw new Error("Model has no capital stack");

  const periods = model.timeline.periods;
  const computed = computeModel(model, scenario, options);

  // Resolve an item/driver name to its per-period series (items win collisions).
  const itemByName = new Map(model.items.map((i) => [i.name, i.id]));
  const driverByName = new Map(model.drivers.map((d) => [d.name, d.id]));
  const seriesFor = (ref: string | undefined): number[] => {
    if (!ref) return new Array(periods).fill(0);
    const itemId = itemByName.get(ref);
    if (itemId) return computed.series[itemId] ?? new Array(periods).fill(0);
    const driverId = driverByName.get(ref);
    if (driverId) return computed.drivers[driverId] ?? new Array(periods).fill(0);
    return new Array(periods).fill(0);
  };

  const assetValue = new Array(periods).fill(0);
  for (const ref of stack.assetRefs) {
    const s = seriesFor(ref);
    for (let p = 0; p < periods; p++) assetValue[p] += s[p] ?? 0;
  }

  // Pre-resolve each tranche's claim/rate/shares series once.
  const resolved = stack.tranches.map((t) => ({
    t,
    claim: seriesFor(t.notionalRef),
    rate: t.rateRef ? seriesFor(t.rateRef) : undefined,
    shares: seriesFor(t.sharesRef),
  }))

  // Order claim tranches by seniority (ascending = most senior first). The
  // residual/common tranche(s) are handled separately (they take what's left).
  const common = resolved.find((r) => r.t.kind === "common")
  const claimants = resolved
    .filter((r) => r.t.kind !== "common")
    .sort((a, b) => a.t.seniority - b.t.seniority)

  const results = new Map<string, TrancheResult>()
  for (const r of resolved) {
    results.set(r.t.id, {
      id: r.t.id,
      name: r.t.name,
      kind: r.t.kind,
      seniority: r.t.seniority,
      claim: new Array(periods).fill(0),
      paid: new Array(periods).fill(0),
      recovery: new Array(periods).fill(0),
      claimsAhead: new Array(periods).fill(0),
      coverage: new Array(periods).fill(0),
    })
  }

  const residualToCommon = new Array(periods).fill(0)
  const dilutedShares = new Array(periods).fill(0)
  const navPerShare = new Array(periods).fill(0)
  const blendedCost = new Array(periods).fill(0)
  const impliedLeverage = new Array(periods).fill(0)

  for (let p = 0; p < periods; p++) {
    const asset = assetValue[p] ?? 0

    // Effective claims: a convertible treated as equity leaves the claim set and
    // instead dilutes shares; otherwise it's a face-value claim at its seniority.
    let extraShares = 0
    let weightedRate = 0
    let ratedNotional = 0

    // First pass: compute each claimant's claim for this period (respecting converts).
    const active: { r: (typeof claimants)[number]; claim: number }[] = []
    for (const r of claimants) {
      const asEquity =
        r.t.kind === "convertible" && (r.t.convertAsEquity ?? 0) > 0.5 && r.t.conversionPrice
      const claim = asEquity ? 0 : Math.max(0, r.claim[p] ?? 0)
      results.get(r.t.id)!.claim[p] = claim
      if (asEquity) {
        extraShares += (r.claim[p] ?? 0) / (r.t.conversionPrice as number)
      }
      if (claim > 0) {
        const rate = r.rate ? (r.rate[p] ?? 0) : r.t.rate ?? 0
        weightedRate += claim * rate
        ratedNotional += claim
        active.push({ r, claim })
      }
    }

    // Group by seniority for pari-passu (equal rank) pro-rata payment.
    active.sort((a, b) => a.r.t.seniority - b.r.t.seniority)
    let remaining = Math.max(0, asset)
    let claimsAheadAcc = 0
    let i = 0
    while (i < active.length) {
      let j = i
      let groupClaim = 0
      while (j < active.length && active[j]!.r.t.seniority === active[i]!.r.t.seniority) {
        groupClaim += active[j]!.claim
        j++
      }
      const groupPaid = Math.min(remaining, groupClaim)
      for (let k = i; k < j; k++) {
        const a = active[k]!
        const res = results.get(a.r.t.id)!
        // pro-rata within the tie group
        const paid = groupClaim > 0 ? groupPaid * (a.claim / groupClaim) : 0
        res.paid[p] = paid
        res.recovery[p] = a.claim > 0 ? paid / a.claim : 0
        res.claimsAhead[p] = claimsAheadAcc
        res.coverage[p] = a.claim + claimsAheadAcc > 0 ? asset / (claimsAheadAcc + a.claim) : 0
      }
      remaining -= groupPaid
      claimsAheadAcc += groupClaim
      i = j
    }

    // Residual to common = what's left after all senior/preferred claims.
    residualToCommon[p] = Math.max(0, asset - claimsAheadAcc)

    const baseShares = common ? common.shares[p] ?? 0 : 0
    dilutedShares[p] = baseShares + extraShares
    navPerShare[p] = dilutedShares[p] > 0 ? residualToCommon[p] / dilutedShares[p] : 0
    blendedCost[p] = ratedNotional > 0 ? weightedRate / ratedNotional : 0
    impliedLeverage[p] = residualToCommon[p] > 0 ? asset / residualToCommon[p] : 0

    if (common) {
      const res = results.get(common.t.id)!
      res.paid[p] = residualToCommon[p]
      res.claimsAhead[p] = claimsAheadAcc
      res.coverage[p] = claimsAheadAcc > 0 ? asset / claimsAheadAcc : 0
    }
  }

  return {
    scenarioId: scenario.id,
    periods,
    assetValue,
    tranches: stack.tranches.map((t) => results.get(t.id)!),
    residualToCommon,
    navPerShare,
    dilutedShares,
    blendedCost,
    impliedLeverage,
  }
}
