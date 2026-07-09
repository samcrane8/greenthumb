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

import { newId } from "./id.js";
import type {
  Driver,
  DriverShape,
  ItemCategory,
  ItemDefinition,
  LineItem,
  Model,
  Scenario,
  Unit,
  ValidationIssue,
} from "./types.js";
import { isValid, validateModel } from "./validation.js";

export interface OpResult {
  /** The candidate model after the operation (already validated). */
  model: Model;
  issues: ValidationIssue[];
  /** True when the candidate is safe to commit (no error-level issues). */
  ok: boolean;
}

const clone = <T>(v: T): T => structuredClone(v);

/** Validate a candidate and stamp modified metadata; bumps version when clean. */
function finalize(candidate: Model): OpResult {
  const issues = validateModel(candidate);
  const ok = isValid(issues);
  candidate.meta.modifiedAt = new Date().toISOString();
  if (ok) candidate.meta.version += 1;
  return { model: candidate, issues, ok };
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
  return finalize(next);
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
  return finalize(next);
}

/** Convenience wrapper: set an item's formula expression. */
export function setFormula(model: Model, itemId: string, expression: string): OpResult {
  return updateLineItem(model, itemId, { definition: { kind: "formula", expression } });
}

export function removeItem(model: Model, itemId: string): OpResult {
  const next = clone(model);
  next.items = next.items.filter((i) => i.id !== itemId);
  return finalize(next);
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
  return finalize(next);
}

/** Set a driver's base assumption values (scalar/series/step/ramp already expanded). */
export function setAssumption(model: Model, driverId: string, values: number[]): OpResult {
  const next = clone(model);
  const driver = next.drivers.find((d) => d.id === driverId);
  if (!driver) throw new Error(`No driver with id ${driverId}`);
  driver.values = values;
  return finalize(next);
}

// --- Scenarios -------------------------------------------------------------

export function createScenario(model: Model, name: string): OpResult {
  const next = clone(model);
  const scenario: Scenario = { id: newId("scn"), name, overrides: {} };
  next.scenarios.push(scenario);
  return finalize(next);
}

/** Override a driver's values within a scenario (per-period; null clears a period). */
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
  return finalize(next);
}

// --- Timeline --------------------------------------------------------------

/** Extend the horizon by N periods (values pad forward automatically at compute). */
export function extendPeriods(model: Model, additionalPeriods: number): OpResult {
  const next = clone(model);
  next.timeline.periods += additionalPeriods;
  return finalize(next);
}
