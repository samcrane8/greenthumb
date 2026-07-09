import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Bar, Area, AreaChart, ReferenceLine } from 'recharts';

// ============================================================
// ASST (STRIVE) + SATA — 4-YEAR MODEL
// Strive is a Bitcoin treasury company (Nasdaq: ASST) funded by
// SATA perpetual preferred. ASST common is a LEVERED RESIDUAL CLAIM
// on BTC: preferred sits ahead, so common moves faster than BTC both ways.
//
// Starting point: May 27, 2026 (data from 8-K filings + STRC.live)
// - ASST: $18.21, ~75.8M shares (65.9M Class A + 9.87M Class B), $1.38B mcap
// - BTC held: 16,500 | Cash: $93.3M | STRC holding: $50.1M | ZERO debt
// - SATA: 5.76M shares @ ~$100 par = $576M notional, 13% div → daily (13.88% APY) Jun 16
// - mNAV (common): 1.63x (PREMIUM — common is levered claim on BTC)
// - BTC: ~$77,600
// ============================================================

const STARTING = {
  btcHeld: 16500,
  classA: 65.9e6,
  classB: 9.87e6,
  asstPrice: 18.21,
  cash: 93.3e6,
  strcHolding: 50.1e6,       // Strive owns $50.1M of Strategy's STRC
  sataShares: 5.76e6,
  sataPar: 100,
  btcPrice: 77600,
  btcCirculating: 19.86e6,
};
STARTING.commonShares = STARTING.classA + STARTING.classB; // 75.77M
STARTING.sataNotional = STARTING.sataShares * STARTING.sataPar; // $576M
STARTING.commonMcap = STARTING.asstPrice * STARTING.commonShares; // $1.38B

const SHARES_OWNED = 0; // set if Sam holds ASST; default 0 (he holds MSTR)

interface Inputs {
  // SATA preferred issuance (S-curve)
  sataStartM: number;        // current $/wk
  sataPeakM: number;         // peak $/wk
  sataRampQtrs: number;
  sataParProbability: number; // % weeks SATA trades at par (issuance enabled)
  sataDivRate: number;        // annual %
  maxAmplification: number;   // cap: SATA notional / BTC NAV

  // ASST common ATM
  asstWeeklyM: number;
  asstGrowthAnnual: number;
  asstPauseBelowNav: boolean; // pause when common mNAV < 1.0

  // BTC market
  btcStartPrice: number;
  btcBaseGrowth: number;
  btcDemandSensitivity: number;

  // Current sell pressure (BTC market-wide)
  currentSellPressureBtc: number;
  sellPressureHalfLife: number;
  etfNetFlowBtc: number;
  etfRecoveryQtrs: number;

  // Cycle dynamics
  enableCycle: boolean;
  cyclePeakQtr: number;
  drawdownPct: number;

  // Common mNAV (premium/discount on the levered residual)
  mNavTarget: number;
  mNavMeanReversion: number;
}

const DEFAULTS: Inputs = {
  // SATA recent pace ~$50M/4days ≈ $87M/wk; tiny base, room to scale but capped by ASST size
  sataStartM: 70,
  sataPeakM: 350,            // ambitious; "issue substantially more over 12 months"
  sataRampQtrs: 7,
  sataParProbability: 0.85,  // SATA holding at par better than STRC right now ("first victim is STRC")
  sataDivRate: 13.0,
  maxAmplification: 0.5,     // SATA notional capped at 50% of BTC NAV (keeps common cushion ~2x)

  asstWeeklyM: 30,           // ASST Class A ATM — modest
  asstGrowthAnnual: 0,
  asstPauseBelowNav: false,  // ASST trades at premium, so ATM is accretive — keep on

  btcStartPrice: 77600,
  btcBaseGrowth: 30,         // matches MSTR model (realized lower due to cycle)
  btcDemandSensitivity: 5,

  currentSellPressureBtc: 150000,
  sellPressureHalfLife: 3,
  etfNetFlowBtc: -5000,
  etfRecoveryQtrs: 2,

  enableCycle: true,
  cyclePeakQtr: 13,
  drawdownPct: 55,

  mNavTarget: 1.5,           // common premium; levered claims trade rich in bull markets
  mNavMeanReversion: 5,
};

interface Row {
  qtr: string;
  qIdx: number;
  sataRaisedB: number;
  asstRaisedB: number;
  sataOutstandingB: number;
  sataDivM: number;
  divCoverageRatio: number;
  cashReserveM: number;
  treasuryBtcBought: number;
  btcPrice: number;
  cycleEvent: string;
  btcHeld: number;
  // Common residual claim
  btcNavB: number;
  navToCommonB: number;       // BTC + cash + STRC - SATA preferred
  commonShares: number;
  navPerShare: number;
  mNav: number;
  asstPrice: number;
  asstMcapB: number;
  impliedLeverage: number;    // how levered common is to BTC
  btcPerShare: number;
  netWorth: number;
}

function sCurve(q: number, start: number, peak: number, rampQtrs: number): number {
  const k = 4 / rampQtrs;
  const x = q - rampQtrs / 2;
  return start + (peak - start) / (1 + Math.exp(-k * x));
}

function runModel(inp: Inputs): Row[] {
  const rows: Row[] = [];

  let btcPrice = inp.btcStartPrice;
  let btcHeld = STARTING.btcHeld;
  let commonShares = STARTING.commonShares;
  let cash = STARTING.cash;
  let strcHolding = STARTING.strcHolding;
  let sataNotional = STARTING.sataNotional;
  let mNav = STARTING.commonMcap / (STARTING.btcHeld * STARTING.btcPrice + STARTING.cash + STARTING.strcHolding - STARTING.sataNotional); // ~1.63x
  let btcCirculating = STARTING.btcCirculating;

  let postPeak = false;
  let drawdownApplied = false;

  const qtrLabels: string[] = [];
  let year = 2026; let q = 3;
  for (let i = 0; i < 16; i++) {
    qtrLabels.push(`Q${q} '${String(year).slice(2)}`);
    q++;
    if (q > 4) { q = 1; year++; }
  }

  for (let i = 0; i < 16; i++) {
    // === Capital raises ===
    let sataWk = sCurve(i, inp.sataStartM, inp.sataPeakM * inp.sataParProbability, inp.sataRampQtrs);
    let asstWk = inp.asstWeeklyM * Math.pow(1 + inp.asstGrowthAnnual / 100, i / 4);

    // SATA pauses in drawdown (par breaks)
    const inDrawdown = inp.enableCycle && (i === inp.cyclePeakQtr + 1 || i === inp.cyclePeakQtr + 2);
    const postDrawdownRecovery = inp.enableCycle && i > inp.cyclePeakQtr + 2 && i <= inp.cyclePeakQtr + 5;
    if (inDrawdown) {
      sataWk *= 0.25;
      asstWk *= 0.25;
    } else if (postDrawdownRecovery) {
      const rf = 0.4 + 0.2 * (i - inp.cyclePeakQtr - 2);
      sataWk *= Math.min(1.0, rf);
      asstWk *= Math.min(1.0, rf);
    }

    // ASST common ATM pauses if below NAV (dilutive)
    if (inp.asstPauseBelowNav && mNav < 1.0) {
      asstWk = 0;
    }

    const sataRaisedM = sataWk * 13;
    const asstRaisedM = asstWk * 13;

    // === Amplification cap ===
    // SATA preferred can't grow unbounded relative to the common equity cushion.
    // Strive discloses an "amplification ratio" (debt+preferred / BTC value).
    // We cap SATA notional at maxAmplification × current BTC NAV — beyond this,
    // the preferred has too little equity beneath it and the market won't fund it.
    const currentBtcNav = btcHeld * btcPrice;
    const maxSataNotional = currentBtcNav * inp.maxAmplification;
    const sataHeadroomM = Math.max(0, (maxSataNotional - sataNotional) / 1e6);
    const sataRaisedCappedM = Math.min(sataRaisedM, sataHeadroomM);

    // === SATA dividend obligation (the leak) ===
    const sataDivM = (sataNotional / 1e6) * (inp.sataDivRate / 100) / 4; // quarterly $M
    // Strive has zero debt + ~$143M cash/STRC buffer; dividends paid from new issuance + buffer
    const sataNetCapitalM = Math.max(0, sataRaisedCappedM - sataDivM);

    // Cash buffer absorbs shortfall if raise < dividend
    const shortfallM = Math.max(0, sataDivM - sataRaisedCappedM);
    cash = Math.max(0, cash - shortfallM * 1e6);

    // === BTC purchases (SATA net capital + ASST ATM both buy BTC) ===
    const totalBtcCapitalM = sataNetCapitalM + asstRaisedM;
    const treasuryBtcBought = (totalBtcCapitalM * 1e6) / btcPrice;
    btcHeld += treasuryBtcBought;

    // Update outstanding (use capped raise)
    sataNotional += sataRaisedCappedM * 1e6;

    // === BTC market price (simplified market-wide supply/demand) ===
    const lthSelling = inp.currentSellPressureBtc * Math.pow(0.5, i / inp.sellPressureHalfLife);
    let etfFlow = 0;
    if (i < inp.etfRecoveryQtrs) {
      etfFlow = inp.etfNetFlowBtc * (1 - i / inp.etfRecoveryQtrs);
    } else {
      const ramp = Math.min(1, (i - inp.etfRecoveryQtrs) / 3);
      const damp = Math.min(1, 200000 / btcPrice);
      etfFlow = -80000 * ramp * damp;
    }
    const etfAbsorption = etfFlow < 0 ? -etfFlow : 0;
    const totalSelling = lthSelling + Math.max(0, etfFlow);

    // Strive's own buying is tiny vs market, but include it
    const qtrlyBase = Math.pow(1 + inp.btcBaseGrowth / 100, 0.25) - 1;
    const netDemandBtc = treasuryBtcBought + etfAbsorption - totalSelling;
    const btcMarketCap = btcPrice * btcCirculating;
    const demandImpactPct = (netDemandBtc * btcPrice / btcMarketCap) * (inp.btcDemandSensitivity / 100);
    let newPrice = btcPrice * (1 + qtrlyBase + demandImpactPct);

    // Cycle peak + capitulation
    let cycleEvent = '';
    if (inp.enableCycle) {
      const distToPeak = Math.abs(i - inp.cyclePeakQtr);
      if (i >= inp.cyclePeakQtr - 2 && i <= inp.cyclePeakQtr) {
        newPrice *= (1 + 0.15 * (1 - distToPeak / 3));
      }
      if (i === inp.cyclePeakQtr + 1 && !drawdownApplied) {
        newPrice *= (1 - inp.drawdownPct / 200);
        cycleEvent = 'CAPITULATION';
        postPeak = true;
      }
      if (i === inp.cyclePeakQtr + 2 && postPeak && !drawdownApplied) {
        newPrice *= (1 - inp.drawdownPct / 200);
        cycleEvent = 'BEAR';
        drawdownApplied = true;
      }
      if (i === inp.cyclePeakQtr) cycleEvent = 'PEAK';
    }
    btcPrice = newPrice;
    btcCirculating += 90 * 144 * 3.125;

    // === Common share dilution from ASST ATM ===
    const navToCommonPre = btcHeld * btcPrice + cash + strcHolding - sataNotional;
    const navPerSharePre = navToCommonPre / commonShares;
    const asstPricePre = Math.max(navPerSharePre, 0.5) * mNav;
    const newShares = (asstRaisedM * 1e6) / Math.max(asstPricePre, 1);
    commonShares += newShares;

    // === mNAV mean reversion (compresses in bear) ===
    let mNavTarget = inp.mNavTarget;
    if (cycleEvent === 'CAPITULATION' || cycleEvent === 'BEAR') {
      mNavTarget = 0.9; // levered residual can still hold a small premium even in bear
    }
    mNav += (mNavTarget - mNav) / inp.mNavMeanReversion;

    // === Outputs: ASST common as levered residual claim ===
    const btcNav = btcHeld * btcPrice;
    const navToCommon = btcNav + cash + strcHolding - sataNotional;
    const navPerShare = navToCommon / commonShares;
    const asstPrice = Math.max(navPerShare, 0) * mNav;
    const asstMcap = asstPrice * commonShares;
    // implied leverage = total BTC NAV / NAV-to-common (how much BTC each $ of common controls)
    const impliedLeverage = navToCommon > 0 ? btcNav / navToCommon : 99;
    const btcPerShare = btcHeld / commonShares;

    rows.push({
      qtr: qtrLabels[i],
      qIdx: i,
      sataRaisedB: sataRaisedCappedM / 1000,
      asstRaisedB: asstRaisedM / 1000,
      sataOutstandingB: +(sataNotional / 1e9).toFixed(2),
      sataDivM: +sataDivM.toFixed(0),
      divCoverageRatio: sataDivM > 0 ? +(sataRaisedM / sataDivM).toFixed(2) : 99,
      cashReserveM: +(cash / 1e6).toFixed(0),
      treasuryBtcBought: Math.round(treasuryBtcBought),
      btcPrice: Math.round(btcPrice),
      cycleEvent,
      btcHeld: Math.round(btcHeld),
      btcNavB: +(btcNav / 1e9).toFixed(2),
      navToCommonB: +(navToCommon / 1e9).toFixed(2),
      commonShares: Math.round(commonShares),
      navPerShare: +navPerShare.toFixed(2),
      mNav: +mNav.toFixed(2),
      asstPrice: +asstPrice.toFixed(2),
      asstMcapB: +(asstMcap / 1e9).toFixed(2),
      impliedLeverage: +impliedLeverage.toFixed(2),
      btcPerShare: +btcPerShare.toFixed(6),
      netWorth: Math.round(asstPrice * SHARES_OWNED),
    });
  }

  return rows;
}

function fmtB(v: number) { return `$${v.toFixed(2)}B`; }
function fmtPrice(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}
function fmtBtc(v: number) {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return `${v.toFixed(0)}`;
}

function Slider({ label, value, onChange, min, max, step, suffix = '', help }: any) {
  return (
    <div className="mb-3">
      <div className="flex justify-between items-baseline mb-1">
        <label className="text-[11px] uppercase tracking-wider text-stone-400 font-mono">{label}</label>
        <span className="text-sm text-orange-400 font-mono">{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} className="w-full accent-orange-500" />
      {help && <p className="text-[10px] text-stone-500 mt-0.5 italic">{help}</p>}
    </div>
  );
}

function Toggle({ label, value, onChange, help }: any) {
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center">
        <label className="text-[11px] uppercase tracking-wider text-stone-400 font-mono">{label}</label>
        <button onClick={() => onChange(!value)}
          className={`px-2 py-0.5 text-[10px] mono uppercase tracking-wider rounded ${value ? 'bg-orange-600 text-stone-950' : 'bg-stone-700 text-stone-400'}`}>
          {value ? 'ON' : 'OFF'}
        </button>
      </div>
      {help && <p className="text-[10px] text-stone-500 mt-0.5 italic">{help}</p>}
    </div>
  );
}

export default function Model() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS);
  const rows = useMemo(() => runModel(inputs), [inputs]);
  const set = (k: keyof Inputs) => (v: any) => setInputs(s => ({ ...s, [k]: v }));

  const endRow = rows[rows.length - 1];
  const peakRow = rows.reduce((a, b) => b.asstPrice > a.asstPrice ? b : a);

  const btcCagr = (Math.pow(endRow.btcPrice / STARTING.btcPrice, 1 / 4) - 1) * 100;
  const asstCagr = (Math.pow(Math.max(endRow.asstPrice, 0.01) / STARTING.asstPrice, 1 / 4) - 1) * 100;
  const flowFlipRow = rows.find(r => r.divCoverageRatio < 1);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200" style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=Bodoni+Moda:wght@700;800&display=swap');
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .display { font-family: 'Bodoni Moda', serif; }
        table { border-collapse: collapse; }
        td, th { padding: 6px 8px; font-family: 'IBM Plex Mono', monospace; font-size: 10px; }
        thead th { border-bottom: 1px solid #44403c; color: #a8a29e; font-weight: 500; text-align: right; }
        thead th:first-child { text-align: left; }
        tbody td { border-bottom: 1px solid #292524; text-align: right; }
        tbody td:first-child { text-align: left; color: #d6d3d1; }
        tbody tr:hover { background: #1c1917; }
        .peak-row { background: rgba(249, 115, 22, 0.08); }
        .cap-row { background: rgba(220, 38, 38, 0.1); }
      `}</style>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="border-b border-stone-800 pb-6 mb-6">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <h1 className="display text-4xl text-orange-50">ASST · Strive · 4-Year Model</h1>
            <div className="mono text-xs text-stone-500">SATA-funded · May 27, 2026</div>
          </div>
          <p className="text-sm text-stone-400 mt-2 max-w-3xl">
            Strive (Nasdaq: ASST) is a zero-debt Bitcoin treasury funded by SATA perpetual preferred (13%, going daily Jun 16).
            ASST common is a <b className="text-orange-300">levered residual claim</b> on BTC — the $576M+ SATA preferred sits ahead,
            so common moves faster than BTC in both directions.
          </p>
        </div>

        {/* Key framing callout */}
        <div className="mb-8 bg-gradient-to-br from-orange-950 via-stone-900 to-stone-950 border border-orange-900 rounded p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-orange-500 mono mb-1">ASST today</div>
              <div className="display text-3xl text-orange-50">$18.21</div>
              <div className="text-[11px] text-stone-400 mono mt-1">$1.38B mcap · 75.8M sh</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-orange-500 mono mb-1">Common mNAV</div>
              <div className="display text-3xl text-orange-300">1.63x</div>
              <div className="text-[11px] text-stone-400 mono mt-1">premium (levered claim)</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-orange-500 mono mb-1">BTC held</div>
              <div className="display text-3xl text-orange-50">16,500</div>
              <div className="text-[11px] text-stone-400 mono mt-1">9th largest public holder</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-orange-500 mono mb-1">Debt</div>
              <div className="display text-3xl text-emerald-400">ZERO</div>
              <div className="text-[11px] text-stone-400 mono mt-1">all Semler notes retired</div>
            </div>
          </div>
        </div>

        {/* Headline projections */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Stat label="BTC (Q2 '30)" value={fmtPrice(endRow.btcPrice)} sub={`${btcCagr.toFixed(0)}% CAGR · peak ${fmtPrice(peakRow.btcPrice)}`} />
          <Stat label="ASST (Q2 '30)" value={fmtPrice(endRow.asstPrice)} sub={`${asstCagr.toFixed(0)}% CAGR`} />
          <Stat label="ASST peak" value={fmtPrice(peakRow.asstPrice)} sub={`${peakRow.qtr} · ${((peakRow.asstPrice/STARTING.asstPrice - 1)*100).toFixed(0)}% from today`} />
          <Stat label="BTC stack" value={fmtBtc(endRow.btcHeld)} sub={`from 16.5K`} />
        </div>

        {/* Inputs + charts */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-6 mb-8">
          <div className="bg-stone-900 rounded p-4 border border-stone-800 h-fit">
            <div className="text-xs uppercase tracking-widest text-orange-500 mb-3 mono">Assumptions</div>

            <SectionLabel>SATA preferred (S-curve)</SectionLabel>
            <Slider label="Start $/wk" value={inputs.sataStartM} onChange={set('sataStartM')} min={20} max={300} step={10} suffix="M" help="Recent pace ~$87M/wk (515K sh in 4 days)" />
            <Slider label="Peak $/wk" value={inputs.sataPeakM} onChange={set('sataPeakM')} min={100} max={1000} step={25} suffix="M" help="'Issue substantially more over 12mo'" />
            <Slider label="Par probability" value={inputs.sataParProbability} onChange={set('sataParProbability')} min={0.3} max={1.0} step={0.05} suffix="x" help="SATA at par 85% (beating STRC right now)" />
            <Slider label="Ramp (qtrs)" value={inputs.sataRampQtrs} onChange={set('sataRampQtrs')} min={2} max={16} step={1} suffix="" />
            <Slider label="SATA div rate" value={inputs.sataDivRate} onChange={set('sataDivRate')} min={8} max={18} step={0.5} suffix="%" help="13% now, daily → 13.88% APY Jun 16" />
            <Slider label="Max amplification" value={inputs.maxAmplification} onChange={set('maxAmplification')} min={0.2} max={1.5} step={0.05} suffix="x" help="SATA notional cap vs BTC NAV. Higher = more leverage, more risk" />

            <SectionLabel>ASST common ATM</SectionLabel>
            <Slider label="Weekly $" value={inputs.asstWeeklyM} onChange={set('asstWeeklyM')} min={0} max={200} step={10} suffix="M" help="Accretive while ASST > NAV" />
            <Slider label="Growth p.a." value={inputs.asstGrowthAnnual} onChange={set('asstGrowthAnnual')} min={-20} max={50} step={5} suffix="%" />
            <Toggle label="Pause below NAV" value={inputs.asstPauseBelowNav} onChange={set('asstPauseBelowNav')} help="ASST trades at premium so usually accretive" />

            <SectionLabel>BTC market</SectionLabel>
            <Slider label="Base growth p.a." value={inputs.btcBaseGrowth} onChange={set('btcBaseGrowth')} min={-20} max={60} step={5} suffix="%" help="Secular; realized lower due to cycle" />
            <Slider label="Demand elasticity" value={inputs.btcDemandSensitivity} onChange={set('btcDemandSensitivity')} min={1} max={20} step={1} suffix="x" />

            <SectionLabel>Sell pressure (decaying)</SectionLabel>
            <Slider label="LTH selling (BTC/qtr)" value={inputs.currentSellPressureBtc} onChange={set('currentSellPressureBtc')} min={0} max={400000} step={25000} suffix="" />
            <Slider label="LTH half-life" value={inputs.sellPressureHalfLife} onChange={set('sellPressureHalfLife')} min={1} max={12} step={1} suffix="q" />
            <Slider label="ETF flow (BTC/qtr)" value={inputs.etfNetFlowBtc} onChange={set('etfNetFlowBtc')} min={-20000} max={50000} step={1000} suffix="" />
            <Slider label="ETF recovery" value={inputs.etfRecoveryQtrs} onChange={set('etfRecoveryQtrs')} min={1} max={8} step={1} suffix="q" />

            <SectionLabel>Cycle dynamics</SectionLabel>
            <Toggle label="Halving cycle" value={inputs.enableCycle} onChange={set('enableCycle')} />
            <Slider label="Peak qtr (idx)" value={inputs.cyclePeakQtr} onChange={set('cyclePeakQtr')} min={4} max={15} step={1} suffix="" help="13 = Q4 '29" />
            <Slider label="Drawdown" value={inputs.drawdownPct} onChange={set('drawdownPct')} min={20} max={80} step={5} suffix="%" />

            <SectionLabel>Common mNAV</SectionLabel>
            <Slider label="Target" value={inputs.mNavTarget} onChange={set('mNavTarget')} min={0.5} max={3.0} step={0.05} suffix="x" help="Levered residual trades rich in bull" />
            <Slider label="Reversion qtrs" value={inputs.mNavMeanReversion} onChange={set('mNavMeanReversion')} min={1} max={20} step={1} suffix="" />

            <button onClick={() => setInputs(DEFAULTS)} className="mt-4 w-full text-xs mono uppercase tracking-wider py-2 border border-stone-700 hover:border-orange-500 hover:text-orange-400 transition">
              Reset
            </button>
          </div>

          <div className="space-y-4">
            <ChartBox title="ASST common price · levered residual claim on BTC">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={rows} margin={{ left: 5, right: 15, top: 10 }}>
                  <CartesianGrid stroke="#292524" strokeDasharray="2 2" />
                  <XAxis dataKey="qtr" stroke="#78716c" fontSize={10} />
                  <YAxis stroke="#78716c" fontSize={10} tickFormatter={fmtPrice} />
                  <Tooltip contentStyle={{ background: '#1c1917', border: '1px solid #44403c', fontSize: 11 }} formatter={(v: any) => fmtPrice(v as number)} />
                  <Line type="monotone" dataKey="asstPrice" stroke="#f97316" strokeWidth={2} dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (payload.cycleEvent === 'PEAK') return <circle cx={cx} cy={cy} r={5} fill="#fb923c" stroke="#fff" strokeWidth={1.5} />;
                    if (payload.cycleEvent === 'CAPITULATION') return <circle cx={cx} cy={cy} r={5} fill="#dc2626" stroke="#fff" strokeWidth={1.5} />;
                    return <circle cx={cx} cy={cy} r={0} />;
                  }} />
                  <Line type="monotone" dataKey="navPerShare" stroke="#57534e" strokeWidth={1} strokeDasharray="4 3" dot={false} name="NAV/share" />
                </LineChart>
              </ResponsiveContainer>
            </ChartBox>

            <ChartBox title="ASST vs BTC — leverage amplifies both directions (indexed to 100)">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={rows.map(r => ({ ...r, asstIdx: r.asstPrice / STARTING.asstPrice * 100, btcIdx: r.btcPrice / STARTING.btcPrice * 100 }))} margin={{ left: 5, right: 15, top: 10 }}>
                  <CartesianGrid stroke="#292524" strokeDasharray="2 2" />
                  <XAxis dataKey="qtr" stroke="#78716c" fontSize={10} />
                  <YAxis stroke="#78716c" fontSize={10} />
                  <Tooltip contentStyle={{ background: '#1c1917', border: '1px solid #44403c', fontSize: 11 }} formatter={(v: any) => (v as number).toFixed(0)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="asstIdx" stroke="#f97316" strokeWidth={2} dot={false} name="ASST" />
                  <Line type="monotone" dataKey="btcIdx" stroke="#fbbf24" strokeWidth={2} dot={false} name="BTC" />
                  <ReferenceLine y={100} stroke="#57534e" />
                </LineChart>
              </ResponsiveContainer>
            </ChartBox>

            <ChartBox title="SATA dividend coverage · quarterly raise vs dividend obligation">
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={rows} margin={{ left: 5, right: 15, top: 10 }}>
                  <CartesianGrid stroke="#292524" strokeDasharray="2 2" />
                  <XAxis dataKey="qtr" stroke="#78716c" fontSize={10} />
                  <YAxis yAxisId="left" stroke="#78716c" fontSize={10} tickFormatter={(v) => `$${v.toFixed(1)}B`} />
                  <YAxis yAxisId="right" orientation="right" stroke="#a8a29e" fontSize={10} tickFormatter={(v) => `${v.toFixed(0)}x`} />
                  <Tooltip contentStyle={{ background: '#1c1917', border: '1px solid #44403c', fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="sataRaisedB" fill="#f97316" name="SATA raise ($B)" />
                  <Bar yAxisId="left" dataKey={(r: any) => r.sataDivM / 1000} fill="#7f1d1d" name="SATA dividend ($B)" />
                  <Line yAxisId="right" type="monotone" dataKey="divCoverageRatio" stroke="#fb923c" strokeWidth={2} dot={false} name="Coverage (x)" />
                  <ReferenceLine yAxisId="right" y={1} stroke="#dc2626" strokeDasharray="3 3" />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartBox>

            <ChartBox title="Implied leverage · BTC NAV / NAV-to-common">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={rows} margin={{ left: 5, right: 15, top: 10 }}>
                  <defs>
                    <linearGradient id="levGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f97316" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#f97316" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#292524" strokeDasharray="2 2" />
                  <XAxis dataKey="qtr" stroke="#78716c" fontSize={10} />
                  <YAxis stroke="#78716c" fontSize={10} tickFormatter={(v) => `${v.toFixed(1)}x`} domain={[1, 'auto']} />
                  <Tooltip contentStyle={{ background: '#1c1917', border: '1px solid #44403c', fontSize: 11 }} formatter={(v: any) => `${(v as number).toFixed(2)}x`} />
                  <Area type="monotone" dataKey="impliedLeverage" stroke="#f97316" strokeWidth={2} fill="url(#levGrad)" />
                  <ReferenceLine y={1} stroke="#57534e" strokeDasharray="3 3" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartBox>
          </div>
        </div>

        {/* Quarterly table */}
        <div className="bg-stone-900 rounded border border-stone-800 overflow-x-auto">
          <div className="px-4 pt-4 pb-2 flex justify-between items-baseline">
            <div className="text-xs uppercase tracking-widest text-orange-500 mono">Quarterly projection</div>
            <div className="text-[10px] mono text-stone-500">peak orange · capitulation red</div>
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th>Qtr</th>
                <th>SATA raise</th>
                <th>SATA O/S</th>
                <th>Div/raise</th>
                <th>Cash</th>
                <th>Tsy buy</th>
                <th>BTC px</th>
                <th>BTC held</th>
                <th>NAV/sh</th>
                <th>Lev</th>
                <th>mNAV</th>
                <th>ASST</th>
                <th>Event</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.qIdx} className={r.cycleEvent === 'PEAK' ? 'peak-row' : (r.cycleEvent === 'CAPITULATION' || r.cycleEvent === 'BEAR') ? 'cap-row' : ''}>
                  <td>{r.qtr}</td>
                  <td>{fmtB(r.sataRaisedB)}</td>
                  <td>${r.sataOutstandingB.toFixed(1)}B</td>
                  <td className={r.divCoverageRatio < 1.5 ? 'text-red-400' : r.divCoverageRatio < 3 ? 'text-orange-400' : 'text-emerald-400'}>{r.divCoverageRatio.toFixed(1)}x</td>
                  <td className={r.cashReserveM < 30 ? 'text-red-400' : 'text-stone-300'}>${r.cashReserveM}M</td>
                  <td>{fmtBtc(r.treasuryBtcBought)}</td>
                  <td>{fmtPrice(r.btcPrice)}</td>
                  <td>{fmtBtc(r.btcHeld)}</td>
                  <td>${r.navPerShare.toFixed(2)}</td>
                  <td>{r.impliedLeverage.toFixed(1)}x</td>
                  <td>{r.mNav}x</td>
                  <td className="text-orange-400">{fmtPrice(r.asstPrice)}</td>
                  <td className="text-[10px]">{r.cycleEvent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Notes */}
        <div className="mt-8 grid md:grid-cols-2 gap-6 text-xs text-stone-400 leading-relaxed">
          <div>
            <div className="text-orange-500 uppercase tracking-widest mono mb-2 text-[10px]">How ASST differs from MSTR</div>
            <ul className="space-y-2 list-disc pl-4">
              <li><b className="text-stone-200">Levered residual claim.</b> The $576M+ SATA preferred sits ahead of common. Common NAV = BTC + cash + STRC holding − SATA. As BTC rises, the fixed preferred claim stays constant, so common NAV rises ~1.6x faster. Falls faster too.</li>
              <li><b className="text-stone-200">Tiny base = explosive %.</b> 16,500 BTC vs Strategy's 844K. ASST can post huge percentage moves (94% drawdown from $268 → $7, now $18). High beta, high risk.</li>
              <li><b className="text-stone-200">Zero debt.</b> All Semler notes retired. No converts, no margin, no encumbered BTC. Cleaner than Strategy's $8.2B convertible stack.</li>
              <li><b className="text-stone-200">SATA is winning the yield war.</b> At 13% (→13.88% daily) vs STRC's 11.5%, and holding at par while STRC slipped below $99. Analysts: "the bear market's first victim is STRC," with yield-hungry capital rotating to SATA.</li>
              <li><b className="text-stone-200">Common trades at a PREMIUM (1.63x),</b> opposite of MSTR's discount. The leverage is the reason — you're paying up for amplified BTC exposure.</li>
            </ul>
          </div>
          <div>
            <div className="text-orange-500 uppercase tracking-widest mono mb-2 text-[10px]">Reading the result & risks</div>
            <ul className="space-y-2 list-disc pl-4">
              <li><b className="text-stone-200">The leverage cuts both ways.</b> Watch the indexed chart — ASST's peak is a bigger multiple of BTC's, but so is its drawdown. In the capitulation, ASST can approach or breach NAV-to-common if the preferred claim is large relative to BTC value.</li>
              <li><b className="text-stone-200">SATA scale is the whole game.</b> Strive is sub-$1.5B. To matter, SATA must scale from ~$87M/wk toward $300M+/wk. That requires sustained yield demand AND ASST not diluting the common base too hard.</li>
              <li><b className="text-stone-200">Dividend coverage is tighter than Strategy's.</b> SATA at 13% is a higher carry than STRC's 11.5%. With a smaller cash buffer ($143M vs Strategy's $2.25B reserve), a prolonged par-break hits Strive faster. Watch the Cash column.</li>
              <li><b className="text-stone-200">If SATA breaks par persistently</b> (drop par-probability to 0.4), issuance stalls, BTC accumulation slows, and the leverage that powered the upside reverses on you.</li>
              <li><b className="text-stone-200">No position set.</b> Net worth tracking is off (SHARES_OWNED = 0). Tell me your ASST share count and I'll wire in a net worth panel like the MSTR model.</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 text-[10px] mono text-stone-600 text-center">
          Sources: Strive 8-K filings (Jan-May 2026), STRC.live, CoinDesk (May 29 '26), Sherwood News, Macrotrends/StockAnalysis. ASST common = levered residual claim model.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string, value: string, sub: string }) {
  return (
    <div className="bg-stone-900 border border-stone-800 rounded p-4">
      <div className="text-[10px] uppercase tracking-widest text-stone-500 mono mb-1">{label}</div>
      <div className="display text-3xl text-orange-50">{value}</div>
      <div className="text-[11px] text-orange-500 mono mt-1">{sub}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-widest text-stone-500 mono mt-4 mb-2 pb-1 border-b border-stone-800">{children}</div>;
}

function ChartBox({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="bg-stone-900 border border-stone-800 rounded p-4">
      <div className="text-xs uppercase tracking-widest text-orange-500 mono mb-3">{title}</div>
      {children}
    </div>
  );
}
