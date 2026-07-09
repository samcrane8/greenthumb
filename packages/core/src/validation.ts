/**
 * Validation and integrity (PRD §7.4).
 *
 * Every write goes through here so neither a human nor the AI can leave a model
 * in a broken state without an explicit override. Issues carry a plain-language
 * message and a pointer to the offending item — surfaced in the UI and returned
 * to the MCP client alike.
 */

import { computeModel } from "./engine.js";
import { FormulaError, parse, referencedNames } from "./formula.js";
import type { Model, ValidationIssue } from "./types.js";

const BALANCE_TOLERANCE = 1e-3;

/** Run all structural + numerical integrity checks against the base scenario. */
export function validateModel(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const names = new Map<string, number>();
  const known = new Set<string>();
  for (const d of model.drivers) known.add(d.name);
  for (const i of model.items) known.add(i.name);

  // Duplicate names make references ambiguous.
  for (const entity of [...model.items, ...model.drivers]) {
    names.set(entity.name, (names.get(entity.name) ?? 0) + 1);
  }
  for (const [name, count] of names) {
    if (count > 1) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_NAME",
        message: `The name "${name}" is used by ${count} items/drivers; references to it are ambiguous.`,
      });
    }
  }

  // Formula syntax + dangling references.
  for (const item of model.items) {
    if (item.definition.kind !== "formula") continue;
    try {
      const ast = parse(item.definition.expression);
      for (const ref of referencedNames(ast)) {
        if (!known.has(ref)) {
          issues.push({
            severity: "error",
            code: "DANGLING_REF",
            message: `Item "${item.name}" references "${ref}", which is not a known item or driver.`,
            targetId: item.id,
          });
        }
      }
    } catch (err) {
      issues.push({
        severity: "error",
        code: "FORMULA_SYNTAX",
        message: `Item "${item.name}" has an invalid formula: ${
          err instanceof FormulaError ? err.message : String(err)
        }`,
        targetId: item.id,
      });
    }
  }

  // Driver-ref items must point at an existing driver.
  const driverIds = new Set(model.drivers.map((d) => d.id));
  for (const item of model.items) {
    if (item.definition.kind === "driver_ref" && !driverIds.has(item.definition.driverId)) {
      issues.push({
        severity: "error",
        code: "MISSING_DRIVER",
        message: `Item "${item.name}" references a driver that does not exist.`,
        targetId: item.id,
      });
    }
  }

  // Timeline sanity.
  if (model.timeline.periods <= 0) {
    issues.push({
      severity: "error",
      code: "BAD_TIMELINE",
      message: "Timeline must have at least one period.",
    });
  }

  // Numerical integrity: balance sheet balances (A = L + E) per period, when the
  // model actually has balance-sheet items. Only run if structure is sound.
  if (!issues.some((i) => i.severity === "error")) {
    issues.push(...checkBalanceSheet(model));
  }

  return issues;
}

/** A = L + E for each period, using the base scenario's computed values. */
function checkBalanceSheet(model: Model): ValidationIssue[] {
  const base = model.scenarios.find((s) => s.name.toLowerCase() === "base") ?? model.scenarios[0];
  if (!base) return [];

  const assets = model.items.filter((i) => i.category === "asset");
  const liabilities = model.items.filter((i) => i.category === "liability");
  const equity = model.items.filter((i) => i.category === "equity");
  if (assets.length === 0 || (liabilities.length === 0 && equity.length === 0)) return [];

  const computed = computeModel(model, base);
  const issues: ValidationIssue[] = [];
  const sumAt = (ids: string[], p: number) =>
    ids.reduce((acc, id) => acc + (computed.series[id]?.[p] ?? 0), 0);

  const assetIds = assets.map((i) => i.id);
  const liabIds = liabilities.map((i) => i.id);
  const eqIds = equity.map((i) => i.id);

  for (let p = 0; p < model.timeline.periods; p++) {
    const a = sumAt(assetIds, p);
    const le = sumAt(liabIds, p) + sumAt(eqIds, p);
    if (Math.abs(a - le) > BALANCE_TOLERANCE) {
      issues.push({
        severity: "error",
        code: "BS_IMBALANCE",
        message: `Balance sheet does not balance in period ${p + 1}: assets ${a.toFixed(
          2,
        )} ≠ liabilities + equity ${le.toFixed(2)} (off by ${(a - le).toFixed(2)}).`,
        period: p,
      });
    }
  }
  return issues;
}

/** True when the model has no error-level issues (safe to commit). */
export function isValid(issues: ValidationIssue[]): boolean {
  return !issues.some((i) => i.severity === "error");
}
