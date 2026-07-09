/**
 * Semantic operations (PRD §8 "MCP server — tool surface").
 *
 * These are the model mutations both front ends share — the AdonisJS API and
 * the MCP server are thin adapters over exactly these functions. Every mutation
 * is pure (clones, mutates the clone, validates) and returns the candidate
 * model plus its issues. The caller (persistence layer) commits only when
 * `ok` is true or an explicit override is passed — no one, human or AI, leaves
 * the model broken silently.
 */

import { findPriceModel, generatePrice } from "./commodities.js";
import { renameInExpression } from "./formula.js";
import { newId } from "./id.js";
import type {
  ChangeSummary,
  Chart,
  ChartSeries,
  CommodityPriceBinding,
  Driver,
  DriverShape,
  Granularity,
  ItemCategory,
  ItemDefinition,
  LineItem,
  Model,
  Scenario,
  Unit,
  ValidationIssue,
  Widget,
} from "./types.js";
import { isValid, validateModel } from "./validation.js";

export interface OpResult {
  /** The candidate model after the operation (already validated). */
  model: Model;
  issues: ValidationIssue[];
  /** True when the candidate is safe to commit (no error-level issues). */
  ok: boolean;
  /** What this operation changed (self-declared by the op). */
  change?: ChangeSummary;
}

const clone = <T>(v: T): T => structuredClone(v);

/** Validate a candidate and stamp modified metadata; bumps version when clean. */
function finalize(candidate: Model, change?: ChangeSummary): OpResult {
  const issues = validateModel(candidate);
  const ok = isValid(issues);
  candidate.meta.modifiedAt = new Date().toISOString();
  if (ok) candidate.meta.version += 1;
  return { model: candidate, issues, ok, change };
}

// --- Line items ------------------------------------------------------------

export interface AddLineItemInput {
  name: string;
  category: ItemCategory;
  unit: Unit;
  definition: ItemDefinition;
  section?: string;
  notes?: string;
}

export function addLineItem(model: Model, input: AddLineItemInput): OpResult {
  const next = clone(model);
  const item: LineItem = { id: newId("itm"), ...input };
  next.items.push(item);
  return finalize(next, { op: "add", entity: "item", id: item.id, name: item.name });
}

export function updateLineItem(
  model: Model,
  itemId: string,
  patch: Partial<Omit<LineItem, "id">>,
): OpResult {
  const next = clone(model);
  const item = next.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`No line item with id ${itemId}`);
  Object.assign(item, patch);
  return finalize(next, {
    op: "update",
    entity: "item",
    id: item.id,
    name: item.name,
    fields: Object.keys(patch),
  });
}

/** Convenience wrapper: set an item's formula expression. */
export function setFormula(model: Model, itemId: string, expression: string): OpResult {
  return updateLineItem(model, itemId, { definition: { kind: "formula", expression } });
}

export function removeItem(model: Model, itemId: string): OpResult {
  const next = clone(model);
  const removed = next.items.find((i) => i.id === itemId);
  next.items = next.items.filter((i) => i.id !== itemId);
  return finalize(next, { op: "remove", entity: "item", id: itemId, name: removed?.name });
}

// --- Drivers ---------------------------------------------------------------

export interface AddDriverInput {
  name: string;
  unit: Unit;
  shape: DriverShape;
  values: number[];
  notes?: string;
}

export function addDriver(model: Model, input: AddDriverInput): OpResult {
  const next = clone(model);
  const driver: Driver = { id: newId("drv"), ...input };
  next.drivers.push(driver);
  return finalize(next, { op: "add", entity: "driver", id: driver.id, name: driver.name });
}

/**
 * Set a driver's base assumption values. If the driver was commodity-priced, a
 * manual override implicitly UNBINDS it — the hand-set series is now authoritative
 * and later timeline edits will not regenerate over it.
 */
export function setAssumption(model: Model, driverId: string, values: number[]): OpResult {
  const next = clone(model);
  const driver = next.drivers.find((d) => d.id === driverId);
  if (!driver) throw new Error(`No driver with id ${driverId}`);
  driver.values = values;
  const wasBound = driver.priceModel !== undefined;
  if (wasBound) delete driver.priceModel;
  return finalize(next, {
    op: "update",
    entity: "driver",
    id: driver.id,
    name: driver.name,
    fields: ["values"],
    detail: wasBound ? "manual override — unbound from its commodity price model" : undefined,
  });
}

// --- Scenarios -------------------------------------------------------------

export function createScenario(model: Model, name: string): OpResult {
  const next = clone(model);
  const scenario: Scenario = { id: newId("scn"), name, overrides: {} };
  next.scenarios.push(scenario);
  return finalize(next, { op: "add", entity: "scenario", id: scenario.id, name });
}

/**
 * Override a driver's values within a scenario (per-period; null clears a period).
 * If the driver had a scenario-level commodity binding, a manual override clears it
 * (the hand-set values are now authoritative and won't be regenerated).
 */
export function setScenarioValue(
  model: Model,
  scenarioId: string,
  driverId: string,
  values: (number | null)[],
): OpResult {
  const next = clone(model);
  const scenario = next.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`No scenario with id ${scenarioId}`);
  scenario.overrides[driverId] = values;
  const wasBound = scenario.priceModels?.[driverId] !== undefined;
  if (wasBound) delete scenario.priceModels![driverId];
  return finalize(next, {
    op: "update",
    entity: "scenario",
    id: scenario.id,
    name: scenario.name,
    fields: ["overrides"],
    detail: wasBound
      ? `override for driver ${driverId} — unbound from its commodity price model`
      : `override for driver ${driverId}`,
  });
}

// --- Timeline --------------------------------------------------------------

/**
 * Regenerate the values of every commodity-priced driver from its binding over
 * the model's CURRENT timeline, including per-scenario commodity bindings (whose
 * generated series are stored as that scenario's override). Called after any
 * timeline mutation, since a price model depends on each period's date. Unbound
 * drivers and scenarios are untouched.
 */
function regenerateBoundDrivers(model: Model): void {
  for (const driver of model.drivers) {
    const binding = driver.priceModel;
    if (!binding) continue;
    if (!findPriceModel(binding.commodity, binding.model)) continue; // validation reports it
    driver.values = generatePrice(binding.commodity, binding.model, model.timeline, binding.params);
  }
  for (const scenario of model.scenarios) {
    if (!scenario.priceModels) continue;
    for (const [driverId, binding] of Object.entries(scenario.priceModels)) {
      if (!findPriceModel(binding.commodity, binding.model)) continue;
      scenario.overrides[driverId] = generatePrice(
        binding.commodity,
        binding.model,
        model.timeline,
        binding.params,
      );
    }
  }
}

/** The base scenario: the one named "base" (case-insensitive), else the first. */
function baseScenarioId(model: Model): string | undefined {
  return (model.scenarios.find((s) => s.name.toLowerCase() === "base") ?? model.scenarios[0])?.id;
}

/** Extend the horizon by N periods (values pad forward automatically at compute). */
export function extendPeriods(model: Model, additionalPeriods: number): OpResult {
  const next = clone(model);
  const before = next.timeline.periods;
  next.timeline.periods += additionalPeriods;
  regenerateBoundDrivers(next);
  return finalize(next, {
    op: "update",
    entity: "timeline",
    fields: ["periods"],
    detail: `extended ${before} -> ${next.timeline.periods} periods`,
  });
}

/**
 * Set the number of periods (up OR down). Non-destructive: stored values arrays
 * are left intact, so shrinking then re-growing restores the original series.
 * `actualsThrough` is clamped to remain a valid index.
 */
export function setPeriods(model: Model, periods: number): OpResult {
  const next = clone(model);
  const before = next.timeline.periods;
  next.timeline.periods = Math.max(1, Math.floor(periods));
  if (next.timeline.actualsThrough >= next.timeline.periods) {
    next.timeline.actualsThrough = next.timeline.periods - 1;
  }
  regenerateBoundDrivers(next);
  return finalize(next, {
    op: "update",
    entity: "timeline",
    fields: ["periods"],
    detail: `set ${before} -> ${next.timeline.periods} periods`,
  });
}

/** Set the timeline granularity. Relabels the axis; does not resample values. */
export function setGranularity(model: Model, granularity: Granularity): OpResult {
  const next = clone(model);
  const before = next.timeline.granularity;
  next.timeline.granularity = granularity;
  regenerateBoundDrivers(next);
  return finalize(next, {
    op: "update",
    entity: "timeline",
    fields: ["granularity"],
    detail: `${before} -> ${granularity} (relabel, no resample)`,
  });
}

// --- Commodity pricing -----------------------------------------------------

/**
 * Bind a driver to a commodity price model and generate its series over the
 * current timeline. Persisting the binding lets the series be regenerated later
 * (including automatically on timeline edits). An unknown commodity/model is
 * caught by validation (UNKNOWN_PRICE_MODEL) and returned as a non-ok result.
 */
export function setCommodityPrice(
  model: Model,
  driverId: string,
  binding: CommodityPriceBinding,
): OpResult {
  const next = clone(model);
  const driver = next.drivers.find((d) => d.id === driverId);
  if (!driver) throw new Error(`No driver with id ${driverId}`);
  driver.priceModel = binding;
  if (findPriceModel(binding.commodity, binding.model)) {
    driver.values = generatePrice(binding.commodity, binding.model, next.timeline, binding.params);
  }
  return finalize(next, {
    op: "update",
    entity: "driver",
    id: driver.id,
    name: driver.name,
    fields: ["values", "priceModel"],
    detail: `priced by ${binding.commodity}/${binding.model}`,
  });
}

/** Regenerate a bound driver's series from its stored binding over the current timeline. */
export function generateCommodityPrice(model: Model, driverId: string): OpResult {
  const next = clone(model);
  const driver = next.drivers.find((d) => d.id === driverId);
  if (!driver) throw new Error(`No driver with id ${driverId}`);
  if (!driver.priceModel) throw new Error(`Driver ${driverId} is not commodity-priced`);
  const b = driver.priceModel;
  if (findPriceModel(b.commodity, b.model)) {
    driver.values = generatePrice(b.commodity, b.model, next.timeline, b.params);
  }
  return finalize(next, {
    op: "update",
    entity: "driver",
    id: driver.id,
    name: driver.name,
    fields: ["values"],
    detail: `regenerated from ${b.commodity}/${b.model}`,
  });
}

/**
 * Set a scenario's commodity price for a driver. Editing the BASE scenario updates
 * the driver's base binding (moving the whole model's baseline — same as
 * setCommodityPrice). Editing an ALTERNATE scenario records the binding on that
 * scenario only and stores the generated series as the scenario's override, so the
 * engine computes the scenario's own path with no change. A scenario without an
 * entry inherits the base path.
 */
export function setScenarioCommodityPrice(
  model: Model,
  scenarioId: string,
  driverId: string,
  binding: CommodityPriceBinding,
): OpResult {
  const next = clone(model);
  const scenario = next.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`No scenario with id ${scenarioId}`);
  const driver = next.drivers.find((d) => d.id === driverId);
  if (!driver) throw new Error(`No driver with id ${driverId}`);

  const known = findPriceModel(binding.commodity, binding.model);

  if (scenarioId === baseScenarioId(next)) {
    // Base: move the driver's base binding + regenerate its base series.
    driver.priceModel = binding;
    if (known) {
      driver.values = generatePrice(binding.commodity, binding.model, next.timeline, binding.params);
    }
    return finalize(next, {
      op: "update",
      entity: "scenario",
      id: scenario.id,
      name: scenario.name,
      fields: ["priceModel"],
      detail: `base binding: ${driver.name} priced by ${binding.commodity}/${binding.model}`,
    });
  }

  // Alternate: record the binding on the scenario and store the generated override.
  if (!scenario.priceModels) scenario.priceModels = {};
  scenario.priceModels[driverId] = binding;
  if (known) {
    scenario.overrides[driverId] = generatePrice(
      binding.commodity,
      binding.model,
      next.timeline,
      binding.params,
    );
  }
  return finalize(next, {
    op: "update",
    entity: "scenario",
    id: scenario.id,
    name: scenario.name,
    fields: ["priceModels", "overrides"],
    detail: `scenario override: ${driver.name} priced by ${binding.commodity}/${binding.model}`,
  });
}

// --- Rename & notes --------------------------------------------------------

/** Rewrite every formula item's expression under a name change. */
function cascadeRename(next: Model, oldName: string, newName: string): void {
  if (oldName === newName) return;
  const renames = { [oldName]: newName };
  for (const item of next.items) {
    if (item.definition.kind === "formula") {
      item.definition.expression = renameInExpression(item.definition.expression, renames);
    }
  }
}

/** Rename a driver, cascading the new name through every referencing formula. */
export function renameDriver(model: Model, driverId: string, newName: string): OpResult {
  const next = clone(model);
  const driver = next.drivers.find((d) => d.id === driverId);
  if (!driver) throw new Error(`No driver with id ${driverId}`);
  const oldName = driver.name;
  driver.name = newName;
  cascadeRename(next, oldName, newName);
  return finalize(next, {
    op: "rename",
    entity: "driver",
    id: driverId,
    name: newName,
    detail: `renamed from ${oldName}`,
  });
}

/** Rename a line item, cascading the new name through every referencing formula. */
export function renameItem(model: Model, itemId: string, newName: string): OpResult {
  const next = clone(model);
  const item = next.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`No line item with id ${itemId}`);
  const oldName = item.name;
  item.name = newName;
  cascadeRename(next, oldName, newName);
  return finalize(next, {
    op: "rename",
    entity: "item",
    id: itemId,
    name: newName,
    detail: `renamed from ${oldName}`,
  });
}

/** Rename a scenario (no formula cascade — scenarios aren't referenced by name). */
export function renameScenario(model: Model, scenarioId: string, newName: string): OpResult {
  const next = clone(model);
  const scenario = next.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`No scenario with id ${scenarioId}`);
  const oldName = scenario.name;
  scenario.name = newName;
  return finalize(next, {
    op: "rename",
    entity: "scenario",
    id: scenarioId,
    name: newName,
    detail: `renamed from ${oldName}`,
  });
}

/** Set the notes/annotation on a driver or line item. */
export function updateNotes(model: Model, entityId: string, notes: string): OpResult {
  const next = clone(model);
  const driver = next.drivers.find((d) => d.id === entityId);
  const item = driver ? undefined : next.items.find((i) => i.id === entityId);
  const target = driver ?? item;
  if (!target) throw new Error(`No driver or item with id ${entityId}`);
  target.notes = notes;
  return finalize(next, {
    op: "update",
    entity: driver ? "driver" : "item",
    id: entityId,
    name: target.name,
    fields: ["notes"],
  });
}

// --- Deletion --------------------------------------------------------------

/**
 * Remove a driver and strip its id from every scenario's overrides. If a formula
 * still references it by name, validation reports DANGLING_REF and the result is
 * not ok (unless the caller overrides at the adapter layer).
 */
export function removeDriver(model: Model, driverId: string): OpResult {
  const next = clone(model);
  const removed = next.drivers.find((d) => d.id === driverId);
  next.drivers = next.drivers.filter((d) => d.id !== driverId);
  for (const scenario of next.scenarios) {
    delete scenario.overrides[driverId];
    if (scenario.priceModels) delete scenario.priceModels[driverId];
  }
  return finalize(next, { op: "remove", entity: "driver", id: driverId, name: removed?.name });
}

/** Remove a scenario, but never the last one (a model keeps at least a base). */
export function removeScenario(model: Model, scenarioId: string): OpResult {
  const next = clone(model);
  if (next.scenarios.length <= 1) {
    throw new Error("Cannot remove the last remaining scenario");
  }
  const removed = next.scenarios.find((s) => s.id === scenarioId);
  if (!removed) throw new Error(`No scenario with id ${scenarioId}`);
  next.scenarios = next.scenarios.filter((s) => s.id !== scenarioId);
  return finalize(next, { op: "remove", entity: "scenario", id: scenarioId, name: removed.name });
}

// --- Charts ----------------------------------------------------------------

export interface AddChartInput {
  title: string;
  kind: Chart["kind"];
  series: ChartSeries[];
  scenarioId?: string;
  options?: Record<string, unknown>;
}

export function addChart(model: Model, input: AddChartInput): OpResult {
  const next = clone(model);
  const chart: Chart = { id: newId("cht"), ...input };
  next.charts = [...(next.charts ?? []), chart];
  return finalize(next, { op: "add", entity: "chart", id: chart.id, name: chart.title });
}

export function updateChart(
  model: Model,
  chartId: string,
  patch: Partial<Omit<Chart, "id">>,
): OpResult {
  const next = clone(model);
  const chart = next.charts?.find((c) => c.id === chartId);
  if (!chart) throw new Error(`No chart with id ${chartId}`);
  Object.assign(chart, patch);
  return finalize(next, { op: "update", entity: "chart", id: chart.id, name: chart.title, fields: Object.keys(patch) });
}

export function removeChart(model: Model, chartId: string): OpResult {
  const next = clone(model);
  next.charts = (next.charts ?? []).filter((c) => c.id !== chartId);
  // Drop dashboard widgets that referenced the removed chart.
  if (next.dashboard) {
    next.dashboard.widgets = next.dashboard.widgets.filter(
      (w) => !(w.kind === "chart" && w.refId === chartId),
    );
  }
  return finalize(next, { op: "remove", entity: "chart", id: chartId });
}

// --- Dashboard -------------------------------------------------------------

export interface AddWidgetInput {
  kind: Widget["kind"];
  refId?: string;
  text?: string;
  title?: string;
  layout: Widget["layout"];
}

/** Ensure a dashboard exists on the candidate, returning it. */
function ensureDashboard(model: Model): NonNullable<Model["dashboard"]> {
  if (!model.dashboard) model.dashboard = { columns: 12, widgets: [] };
  return model.dashboard;
}

export function addWidget(model: Model, input: AddWidgetInput): OpResult {
  const next = clone(model);
  const dash = ensureDashboard(next);
  const widget: Widget = { id: newId("wgt"), ...input };
  dash.widgets = [...dash.widgets, widget];
  return finalize(next, { op: "add", entity: "widget", id: widget.id, detail: widget.kind });
}

export function updateWidget(
  model: Model,
  widgetId: string,
  patch: Partial<Omit<Widget, "id">>,
): OpResult {
  const next = clone(model);
  const widget = next.dashboard?.widgets.find((w) => w.id === widgetId);
  if (!widget) throw new Error(`No widget with id ${widgetId}`);
  Object.assign(widget, patch);
  return finalize(next, { op: "update", entity: "widget", id: widget.id, fields: Object.keys(patch) });
}

export function removeWidget(model: Model, widgetId: string): OpResult {
  const next = clone(model);
  if (next.dashboard) {
    next.dashboard.widgets = next.dashboard.widgets.filter((w) => w.id !== widgetId);
  }
  return finalize(next, { op: "remove", entity: "widget", id: widgetId });
}

/**
 * Reorder the dashboard's widgets to match `orderedIds`. Every existing widget
 * id must appear exactly once — the set is preserved, only order changes. Any
 * accompanying layout edits go through updateWidget separately.
 */
export function reorderDashboard(model: Model, orderedIds: string[]): OpResult {
  const next = clone(model);
  const dash = ensureDashboard(next);
  const byId = new Map(dash.widgets.map((w) => [w.id, w]));
  const current = new Set(byId.keys());
  const requested = new Set(orderedIds);
  const sameSet =
    current.size === requested.size && [...current].every((id) => requested.has(id));
  if (!sameSet) {
    throw new Error("reorderDashboard requires exactly the existing widget ids, each once");
  }
  dash.widgets = orderedIds.map((id) => byId.get(id)!);
  return finalize(next, { op: "update", entity: "widget", fields: ["order"], detail: "reordered dashboard" });
}
