import assert from "node:assert/strict";
import { test } from "node:test";

import { bitcoinTreasuryModel, saasModel } from "./templates.js";
import {
  addChart,
  updateChart,
  removeChart,
  addWidget,
  removeWidget,
  reorderDashboard,
} from "./operations.js";
import { getChartData } from "./outputs.js";
import { validateModel, isValid } from "./validation.js";
import type { Model } from "./types.js";

function saas(): Model {
  return saasModel({ name: "Viz SaaS", timeline: { periods: 12 } });
}

test("a model without charts/dashboard validates (backward compatible)", () => {
  const m = saas();
  assert.equal(m.charts, undefined);
  assert.equal(m.dashboard, undefined);
  assert.ok(isValid(validateModel(m)));
});

test("addChart persists a definition and no numeric data", () => {
  const m = saas();
  const res = addChart(m, {
    title: "ARR over time",
    kind: "line",
    series: [{ ref: "arr", label: "ARR" }],
  });
  assert.ok(res.ok, JSON.stringify(res.issues));
  assert.equal(res.model.charts!.length, 1);
  const chart = res.model.charts![0]!;
  assert.equal(chart.series[0]!.ref, "arr");
  assert.ok(!("values" in chart.series[0]!), "no numeric data stored on the chart");
});

test("dangling chart series reference is rejected", () => {
  const m = saas();
  const res = addChart(m, {
    title: "Bad",
    kind: "line",
    series: [{ ref: "does_not_exist" }],
  });
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((i) => i.code === "DANGLING_CHART_REF"));
});

test("getChartData reflects the scenario and rebases indexed series to 100", () => {
  const m = bitcoinTreasuryModel({ name: "T", ticker: "ASST" }); // pin ticker so refs are `asst_price`
  const chart = m.charts!.find((c) => c.series.some((s) => s.index))!; // the indexed ASST-vs-BTC chart
  const base = getChartData(m, m.scenarios[0]!, chart.id);
  const draw = getChartData(m, m.scenarios[1]!, chart.id);
  // indexed series start at 100
  for (const s of base.series) assert.equal(s.values[0], 100, `${s.label} indexed to 100`);
  // scenario changes the trajectory
  const asstBase = base.series.find((s) => s.ref === "asst_price")!.values;
  const asstDraw = draw.series.find((s) => s.ref === "asst_price")!.values;
  // compare peaks — robust to where the halving-cycle oscillation lands at horizon end
  assert.ok(Math.max(...asstDraw) < Math.max(...asstBase), "drawdown scenario lowers the indexed ASST path");
  // rows are period-keyed and ready for charting
  assert.equal(base.rows.length, m.timeline.periods);
});

test("getChartData can plot a driver by name", () => {
  const m = saas();
  const res = addChart(m, {
    title: "Churn",
    kind: "line",
    series: [{ ref: "monthly_churn", label: "Churn" }],
  });
  const data = getChartData(res.model, res.model.scenarios[0]!, res.model.charts![0]!.id);
  assert.equal(data.series[0]!.values.length, res.model.timeline.periods);
  assert.equal(data.series[0]!.values[0], 0.02);
});

test("removeChart drops dependent widgets", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const chartId = m.charts![0]!.id;
  const before = m.dashboard!.widgets.filter((w) => w.kind === "chart" && w.refId === chartId).length;
  assert.ok(before > 0);
  const res = removeChart(m, chartId);
  assert.ok(res.ok, JSON.stringify(res.issues));
  assert.equal(res.model.charts!.some((c) => c.id === chartId), false);
  assert.equal(
    res.model.dashboard!.widgets.some((w) => w.kind === "chart" && w.refId === chartId),
    false,
    "widgets referencing the removed chart are gone",
  );
});

test("widget referencing a missing chart is rejected", () => {
  const m = saas();
  const res = addWidget(m, { kind: "chart", refId: "cht_missing", layout: { x: 0, y: 0, w: 4, h: 2 } });
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((i) => i.code === "DANGLING_WIDGET_REF"));
});

test("statement widget accepts a valid kind and rejects an invalid one", () => {
  const m = saas();
  const good = addWidget(m, { kind: "statement", refId: "income", layout: { x: 0, y: 0, w: 12, h: 4 } });
  assert.ok(good.ok, JSON.stringify(good.issues));
  const bad = addWidget(m, { kind: "statement", refId: "nonsense", layout: { x: 0, y: 0, w: 12, h: 4 } });
  assert.equal(bad.ok, false);
});

test("reorderDashboard preserves the widget set and only changes order", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const ids = m.dashboard!.widgets.map((w) => w.id);
  const reversed = [...ids].reverse();
  const res = reorderDashboard(m, reversed);
  assert.ok(res.ok, JSON.stringify(res.issues));
  const after = res.model.dashboard!.widgets.map((w) => w.id);
  assert.deepEqual(after, reversed, "new order applied");
  assert.deepEqual([...after].sort(), [...ids].sort(), "same set, none lost or duplicated");
});

test("reorderDashboard rejects a mismatched id set", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const ids = m.dashboard!.widgets.map((w) => w.id);
  assert.throws(() => reorderDashboard(m, ids.slice(1)), /existing widget ids/);
});

test("updateChart edits a chart in place", () => {
  const m = saas();
  const added = addChart(m, { title: "X", kind: "line", series: [{ ref: "arr" }] });
  const chartId = added.model.charts![0]!.id;
  const res = updateChart(added.model, chartId, { title: "Renamed" });
  assert.ok(res.ok);
  assert.equal(res.model.charts![0]!.title, "Renamed");
});

test("removeWidget removes a single widget", () => {
  const m = bitcoinTreasuryModel({ name: "T" });
  const widgetId = m.dashboard!.widgets[0]!.id;
  const res = removeWidget(m, widgetId);
  assert.ok(res.ok);
  assert.equal(res.model.dashboard!.widgets.some((w) => w.id === widgetId), false);
});
