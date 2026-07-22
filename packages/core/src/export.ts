/**
 * Dashboard → self-contained HTML export (Roadmap §7.3).
 *
 * A PURE presentation transform (model + scenario → HTML string), a sibling to
 * `outputs.ts` — it composes the existing pure derivations (`computeModel`,
 * `getChartData`, `getStatement`) and emits one offline, deterministic document:
 * headline stat tiles, charts as inline SVG, statement/KPI tables, and note prose
 * (a safe markdown subset). No I/O, no network, no browser/React/charting runtime,
 * no new dependency. Charts follow the dataviz palette; all CSS is inlined and an
 * `@media print` block makes the file convert cleanly to PDF.
 *
 * Determinism: the body embeds no wall-clock time — the same model + scenario
 * renders byte-identically.
 */

import { computeModel } from "./engine.js";
import { getChartData, getStatement, type ChartData, type StatementKind } from "./outputs.js";
import { periodDate } from "./commodities.js";
import type { Driver, LineItem, Model, Scenario, Timeline, Widget } from "./types.js";

// --- dataviz categorical palette (light / dark), fixed order ----------------
const SERIES_LIGHT = ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#e34948", "#e87ba4", "#eb6834"];
const SERIES_DARK = ["#3987e5", "#199e70", "#c98500", "#008300", "#9085e9", "#e66767", "#d55181", "#d95926"];

// --- text / formatting helpers (pure; mirror the web's format.ts) -----------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Uppercase a ticker prefix on an item name (e.g. `mstr_price` → "MSTR price"). */
function itemLabel(name: string, ticker?: string): string {
  if (ticker) {
    const prefix = `${ticker.toLowerCase()}_`;
    if (name.toLowerCase().startsWith(prefix)) {
      return `${ticker.toUpperCase()} ${name.slice(prefix.length).replace(/_/g, " ")}`;
    }
  }
  return name.replace(/_/g, " ");
}

function compactCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatNumber(value: number, unit: string, scale = 1): string {
  if (!Number.isFinite(value)) return "—";
  switch (unit) {
    case "currency":
      return compactCurrency(value * (scale || 1));
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
    case "count":
      return Math.round(value).toLocaleString("en-US");
    case "ratio":
      return value.toFixed(2);
    default:
      return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  }
}

function unitHint(unit: string): string {
  switch (unit) {
    case "currency":
      return "$";
    case "percent":
      return "%";
    case "ratio":
      return "×";
    case "count":
      return "#";
    default:
      return "";
  }
}

/** Period label from the timeline (FY2027 / Q3 2026 / Jul 2026). */
function periodLabel(timeline: Timeline, index: number): string {
  const d = periodDate(timeline, index);
  const y = d.getUTCFullYear();
  if (timeline.granularity === "annual") return `FY${y}`;
  if (timeline.granularity === "quarterly") return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${y}`;
  return `${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${y}`;
}

// --- minimal, safe markdown subset (escapes first) --------------------------

/** Render a small markdown subset to HTML. Input is HTML-escaped first so note
 *  text can never inject markup; only the handled constructs become elements. */
function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const inline = (t: string): string =>
    esc(t)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, txt, url) => `<a href="${esc(url)}">${txt}</a>`);
  for (const line of lines) {
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const uli = /^[-*]\s+(.*)$/.exec(line);
    const oli = /^\d+\.\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1]!.length + 1; // start at <h2> (document owns <h1>)
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
    } else if (uli) {
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inline(uli[1]!)}</li>`);
    } else if (oli) {
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inline(oli[1]!)}</li>`);
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("\n");
}

// --- inline SVG chart -------------------------------------------------------

const CHART_W = 640;
const CHART_H = 260;
const PAD = { top: 12, right: 44, bottom: 26, left: 52 };

function niceExtent(values: number[]): [number, number] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return [0, 1];
  let lo = Math.min(...finite);
  let hi = Math.max(...finite);
  if (lo === hi) {
    hi = lo + Math.abs(lo || 1);
    lo = lo - Math.abs(lo || 1) * 0.1;
  }
  if (lo > 0) lo = 0; // baseline at zero for magnitude reads
  return [lo, hi];
}

/** Render one ChartData to inline SVG. Honors left/right axes (dashboard fidelity)
 *  and line/area/bar/composed. Empty/degenerate series → a labeled empty plot. */
function renderChartSvg(data: ChartData): string {
  const n = data.periods;
  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);

  const leftVals = data.series.filter((s) => s.axis !== "right").flatMap((s) => s.values);
  const rightVals = data.series.filter((s) => s.axis === "right").flatMap((s) => s.values);
  const [lLo, lHi] = niceExtent(leftVals);
  const [rLo, rHi] = niceExtent(rightVals);
  const yL = (v: number) => PAD.top + plotH - ((v - lLo) / (lHi - lLo || 1)) * plotH;
  const yR = (v: number) => PAD.top + plotH - ((v - rLo) / (rHi - rLo || 1)) * plotH;

  if (data.series.length === 0 || leftVals.concat(rightVals).every((v) => !Number.isFinite(v))) {
    return `<svg viewBox="0 0 ${CHART_W} ${CHART_H}" role="img" aria-label="${esc(data.title)} (no data)"><text x="${CHART_W / 2}" y="${CHART_H / 2}" text-anchor="middle" class="viz-empty">no data</text></svg>`;
  }

  const parts: string[] = [];
  // baseline + gridlines (recessive)
  for (let g = 0; g <= 4; g++) {
    const gy = PAD.top + (g / 4) * plotH;
    parts.push(`<line x1="${PAD.left}" y1="${gy.toFixed(1)}" x2="${PAD.left + plotW}" y2="${gy.toFixed(1)}" class="viz-grid"/>`);
    const val = lHi - (g / 4) * (lHi - lLo);
    parts.push(`<text x="${PAD.left - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" class="viz-axis">${esc(compactAxis(val))}</text>`);
  }
  // x labels (first, mid, last)
  for (const i of n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1]) {
    parts.push(`<text x="${x(i).toFixed(1)}" y="${(CHART_H - 8).toFixed(1)}" text-anchor="middle" class="viz-axis" data-p="${i}">·</text>`);
  }

  data.series.forEach((s, si) => {
    const color = `var(--series-${(si % 8) + 1})`;
    const y = s.axis === "right" ? yR : yL;
    const style = s.style ?? (data.kind === "area" ? "area" : data.kind === "bar" ? "bar" : "line");
    const pts = s.values.map((v, i) => [x(i), y(Number.isFinite(v) ? v : lLo)] as const);
    if (style === "bar") {
      const bw = Math.max(2, (plotW / n) * 0.6);
      pts.forEach(([px, py], i) => {
        if (!Number.isFinite(s.values[i]!)) return;
        const base = s.axis === "right" ? yR(Math.max(0, rLo)) : yL(Math.max(0, lLo));
        const top = Math.min(py, base);
        const h = Math.abs(base - py);
        parts.push(`<rect x="${(px - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${color}" opacity="0.85"/>`);
      });
    } else {
      const d = pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
      if (style === "area") {
        const base = y(Math.max(0, s.axis === "right" ? rLo : lLo));
        parts.push(`<path d="${d} L${pts[pts.length - 1]![0].toFixed(1)},${base.toFixed(1)} L${pts[0]![0].toFixed(1)},${base.toFixed(1)} Z" fill="${color}" opacity="0.18"/>`);
      }
      parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
    }
  });

  const legend = data.series
    .map(
      (s, si) =>
        `<span class="viz-key"><span class="viz-swatch" style="background:var(--series-${(si % 8) + 1})"></span>${esc(s.label)}${s.axis === "right" ? " (R)" : ""}</span>`,
    )
    .join("");

  return `<svg viewBox="0 0 ${CHART_W} ${CHART_H}" role="img" aria-label="${esc(data.title)}">${parts.join("")}</svg><div class="viz-legend">${legend}</div>`;
}

function compactAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  if (abs > 0 && abs < 1) return v.toFixed(2);
  return v.toFixed(0);
}

// --- widget renderers -------------------------------------------------------

interface Ctx {
  model: Model;
  scenario: Scenario;
  series: Record<string, number[]>;
  ticker?: string;
}

function resolveSeries(ctx: Ctx, name: string): { values: number[]; unit: string; scale: number } | null {
  const item: LineItem | undefined = ctx.model.items.find((i) => i.name === name);
  if (item) {
    return {
      values: ctx.series[item.id] ?? [],
      unit: item.unit,
      scale: item.scale ?? ctx.model.meta.defaultScale ?? 1,
    };
  }
  const driver: Driver | undefined = ctx.model.drivers.find((d) => d.name === name);
  if (driver) {
    return { values: ctx.series[driver.id] ?? [], unit: driver.unit, scale: driver.scale ?? 1 };
  }
  return null;
}

function renderStat(ctx: Ctx, w: Widget): string {
  const name = w.refId ?? "";
  const t = resolveSeries(ctx, name);
  if (!t) return `<div class="w stat missing">missing item "${esc(name)}"</div>`;
  const end = t.values[t.values.length - 1] ?? 0;
  const start = t.values[0] ?? 0;
  const growth = start !== 0 ? end / start - 1 : 0;
  const up = growth >= 0;
  const hint = unitHint(t.unit);
  return `<div class="w stat">
    <div class="stat-label">${esc(itemLabel(name, ctx.ticker))}${hint ? ` <span class="muted">(${hint})</span>` : ""}</div>
    <div class="stat-value">${esc(formatNumber(end, t.unit, t.scale))}</div>
    ${start !== 0 ? `<div class="stat-delta ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(growth * 100).toFixed(0)}% <span class="muted">horizon</span></div>` : ""}
  </div>`;
}

function renderChart(ctx: Ctx, w: Widget): string {
  const chart = ctx.model.charts?.find((c) => c.id === w.refId);
  if (!chart) return `<div class="w chart missing">missing chart</div>`;
  const data = getChartData(ctx.model, ctx.scenario, chart.id);
  // Replace the placeholder x-tick markers with real period labels.
  const svg = renderChartSvg(data).replace(/<text([^>]*?)data-p="(\d+)"([^>]*)>·<\/text>/g, (_m, a, i, b) => {
    return `<text${a}data-p="${i}"${b}>${esc(periodLabel(ctx.model.timeline, Number(i)))}</text>`;
  });
  return `<div class="w chart"><div class="w-title">${esc(w.title ?? chart.title)}</div>${svg}</div>`;
}

function renderStatement(ctx: Ctx, w: Widget): string {
  const kind = (w.refId ?? "kpi") as StatementKind;
  const st = getStatement(ctx.model, ctx.scenario, kind);
  const cols = Math.min(st.periods, 16);
  const header = Array.from({ length: cols }, (_, p) => `<th>${esc(periodLabel(ctx.model.timeline, p))}</th>`).join("");
  const rows = st.rows
    .map((r) => {
      const cells = Array.from({ length: cols }, (_, p) => `<td>${esc(formatNumber(r.values[p] ?? 0, r.unit, r.scale))}</td>`).join("");
      return `<tr><th class="rowh">${esc(itemLabel(r.name, ctx.ticker))}</th>${cells}</tr>`;
    })
    .join("");
  return `<div class="w statement"><div class="w-title">${esc(w.title ?? kind.replace(/_/g, " "))}</div>
    <div class="table-scroll"><table><thead><tr><th></th>${header}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderNote(w: Widget): string {
  return `<div class="w note">${renderMarkdown(w.text ?? "")}</div>`;
}

// --- document assembly ------------------------------------------------------

export interface RenderDashboardOptions {
  /** Document title; defaults to the model name + scenario. */
  title?: string;
}

/**
 * Render a model's dashboard for a scenario to a self-contained HTML document.
 * Pure: no I/O, no network, deterministic (no embedded wall-clock time).
 */
export function renderDashboardHtml(
  model: Model,
  scenario: Scenario,
  opts: RenderDashboardOptions = {},
): string {
  const computed = computeModel(model, scenario);
  const ctx: Ctx = { model, scenario, series: computed.series, ticker: model.meta.ticker };
  const columns = model.dashboard?.columns ?? 12;
  const widgets = model.dashboard?.widgets ?? [];

  const body = widgets
    .slice()
    .sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x)
    .map((w) => {
      const span = `grid-column: span ${Math.max(1, Math.min(columns, w.layout.w))}; grid-row: span ${Math.max(1, w.layout.h)};`;
      const inner =
        w.kind === "stat"
          ? renderStat(ctx, w)
          : w.kind === "chart"
            ? renderChart(ctx, w)
            : w.kind === "statement"
              ? renderStatement(ctx, w)
              : renderNote(w);
      return `<div class="cell" style="${span}">${inner}</div>`;
    })
    .join("\n");

  const title = opts.title ?? `${model.meta.name} — ${scenario.name}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${STYLE(columns)}</style>
</head>
<body class="viz-root">
<header><h1>${esc(model.meta.name)}</h1><div class="sub">${esc(scenario.name)} scenario${model.meta.ticker ? ` · ${esc(model.meta.ticker)}` : ""}</div></header>
<main class="grid">
${body}
</main>
</body>
</html>`;
}

// Inlined stylesheet — no external assets/fonts/scripts. Light + dark, print.
function STYLE(columns: number): string {
  const light = SERIES_LIGHT.map((c, i) => `--series-${i + 1}:${c};`).join("");
  const dark = SERIES_DARK.map((c, i) => `--series-${i + 1}:${c};`).join("");
  return `
:root{--surface:#fcfcfb;--panel:#ffffff;--ink:#0b0b0b;--muted:#52514e;--border:#e6e5e1;--pos:#0ca30c;--neg:#d03b3b;${light}}
@media (prefers-color-scheme:dark){:root{--surface:#161615;--panel:#1a1a19;--ink:#ffffff;--muted:#c3c2b7;--border:#33322e;${dark}}}
*{box-sizing:border-box}
body{margin:0;background:var(--surface);color:var(--ink);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
header{padding:20px 24px;border-bottom:1px solid var(--border)}
header h1{margin:0;font-size:20px;font-weight:650}
header .sub{color:var(--muted);font-size:13px;margin-top:2px;text-transform:capitalize}
.grid{display:grid;grid-template-columns:repeat(${columns},1fr);gap:12px;padding:16px 24px;align-items:start}
.cell{min-width:0}
.w{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:12px 14px;height:100%}
.w-title{font-size:12px;font-weight:600;color:var(--muted);margin-bottom:8px}
.stat .stat-label{font-size:11px;letter-spacing:.02em;text-transform:uppercase;color:var(--muted)}
.stat .stat-value{font-variant-numeric:tabular-nums;font-size:24px;font-weight:650;margin-top:4px}
.stat .stat-delta{font-size:11px;font-variant-numeric:tabular-nums;margin-top:4px}
.stat .stat-delta.up{color:var(--pos)}.stat .stat-delta.down{color:var(--neg)}
.muted{color:var(--muted)}
.missing{color:var(--neg);font-size:12px}
svg{width:100%;height:auto;display:block}
.viz-grid{stroke:var(--border);stroke-width:1}
.viz-axis{fill:var(--muted);font-size:10px;font-variant-numeric:tabular-nums}
.viz-empty{fill:var(--muted);font-size:12px}
.viz-legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}
.viz-key{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--muted)}
.viz-swatch{width:9px;height:9px;border-radius:2px;display:inline-block}
.table-scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums}
th,td{padding:4px 8px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--border)}
thead th{color:var(--muted);font-weight:600}
.rowh,td:first-child,thead th:first-child{text-align:left}
.rowh{font-weight:500;text-transform:capitalize}
.note h2,.note h3,.note h4{margin:.4em 0 .2em}
.note p{margin:.4em 0}.note ul,.note ol{margin:.3em 0 .3em 1.2em}
@media print{
  body{background:#fff;color:#000}
  .grid{padding:0}
  .cell,.w{break-inside:avoid}
  .w{border-color:#ccc}
}`;
}
