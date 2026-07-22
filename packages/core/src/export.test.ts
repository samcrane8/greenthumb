import assert from "node:assert/strict";
import { test } from "node:test";

import { bitcoinTreasuryModel } from "./templates.js";
import { getChartData } from "./outputs.js";
import { renderDashboardHtml } from "./export.js";
import type { Model } from "./types.js";

function treasuryWithNote(): Model {
  const m = bitcoinTreasuryModel({ name: "MicroStrategy", ticker: "MSTR" });
  m.dashboard!.widgets.push({
    id: "wgt_note",
    kind: "note",
    text: "# Thesis\n\nBTC is a **levered** bet.\n\n- point one\n- point two\n\nSee [FRED](https://fred.stlouisfed.org).\n\nRaw <b>tags</b> & <script>alert(1)</script> must be escaped.",
    layout: { x: 0, y: 20, w: 12, h: 2 },
  });
  return m;
}
const base = (m: Model) => m.scenarios[0]!;

test("export renders every widget type into one self-contained document", () => {
  const m = treasuryWithNote();
  const html = renderDashboardHtml(m, base(m));

  assert.match(html, /^<!doctype html>/, "is a full HTML document");
  // one <svg> per chart widget (treasury ships 6 charts)
  const chartWidgets = m.dashboard!.widgets.filter((w) => w.kind === "chart").length;
  assert.equal((html.match(/<svg/g) ?? []).length, chartWidgets, "one svg per chart widget");
  // a stat tile per stat widget, uppercased ticker prefix
  assert.ok(html.includes("MSTR price"), "stat/label uppercases the ticker prefix");
  // statement table present
  assert.match(html, /<table>/, "statement renders a table");
  // note prose present
  assert.ok(html.includes("Thesis") && html.includes("levered"), "note text present");

  // self-contained + safe: no scripts, no external assets
  assert.ok(!/<script/i.test(html), "no <script> in the document");
  assert.ok(!/https?:\/\/[^"']*\.(css|js|png|jpg|woff2?)/i.test(html), "no external asset URLs");
  assert.ok(html.includes("@media print"), "carries a print stylesheet");
});

test("export is deterministic and scenario-sensitive", () => {
  const m = treasuryWithNote();
  const a = renderDashboardHtml(m, m.scenarios[0]!);
  const b = renderDashboardHtml(m, m.scenarios[0]!);
  assert.equal(a, b, "same model+scenario renders byte-identically");

  const drawdown = m.scenarios.find((s) => s.name === "Drawdown")!;
  assert.notEqual(renderDashboardHtml(m, drawdown), a, "a different scenario renders different content");
});

test("charts render marks per kind, dual-axis, and indexed rebasing", () => {
  const m = treasuryWithNote();
  const html = renderDashboardHtml(m, base(m));

  assert.ok(html.includes("<rect"), "composed/bar chart emits <rect> bars");
  assert.ok(/opacity="0.18"/.test(html), "area chart emits a filled area path");
  assert.ok(/stroke-width="2"/.test(html), "line charts emit 2px strokes");
  assert.ok(html.includes("(R)"), "a right-axis series is marked in the legend");

  // the indexed chart rebases to 100 at period 0 (verified at the data layer it feeds)
  const indexChart = m.charts!.find((c) => c.series.some((s) => s.index))!;
  const data = getChartData(m, base(m), indexChart.id);
  for (const s of data.series) assert.equal(s.values[0], 100, `${s.label} indexed to 100`);
});

test("note markdown renders structure and escapes raw HTML", () => {
  const m = treasuryWithNote();
  const html = renderDashboardHtml(m, base(m));

  assert.match(html, /<h2>Thesis<\/h2>/, "heading renders");
  assert.match(html, /<strong>levered<\/strong>/, "bold renders");
  assert.match(html, /<li>point one<\/li>/, "list items render");
  assert.match(html, /<a href="https:\/\/fred\.stlouisfed\.org">FRED<\/a>/, "links render");
  // raw HTML in note text is escaped, never executed
  assert.ok(html.includes("&lt;b&gt;tags&lt;/b&gt;"), "raw tags are escaped");
  assert.ok(!html.includes("<script>alert(1)</script>"), "no injected script from note text");
});
