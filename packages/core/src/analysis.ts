/**
 * Shared helpers for the read-only analysis layer (accuracy, sensitivity,
 * backtest, calibration). These functions never mutate the model — they compose
 * over `computeModel` to answer "how good is this model / what moves it?"
 */

import type { Model, Scenario } from "./types.js";

/**
 * Resolve a scenario to compute under. Given an id, use it; otherwise fall back
 * to the base scenario (named "base", case-insensitive, else the first), which
 * matches how validation and operations pick the baseline.
 */
export function resolveScenario(model: Model, scenarioId?: string): Scenario {
  if (scenarioId) {
    const s = model.scenarios.find((sc) => sc.id === scenarioId);
    if (s) return s;
  }
  const base =
    model.scenarios.find((sc) => sc.name.toLowerCase() === "base") ?? model.scenarios[0];
  if (!base) throw new Error("Model has no scenarios to compute under");
  return base;
}

/** Resolve an item reference (id or name; items win) to its item id. */
export function resolveItemId(model: Model, ref: string): string {
  const byId = model.items.find((i) => i.id === ref);
  if (byId) return byId.id;
  const byName = model.items.find((i) => i.name === ref);
  if (byName) return byName.id;
  throw new Error(`No item with id or name "${ref}"`);
}
