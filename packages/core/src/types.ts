/**
 * Domain model — what a "model" IS in this system (PRD §6).
 *
 * A model is a typed, semantic object graph — a set of time-aware series and
 * drivers wired by formulas — NOT an opaque grid of cells. These types are the
 * contract every adapter (UI, AdonisJS API, MCP server) speaks in.
 */

export type Granularity = "monthly" | "quarterly" | "annual";

export type Unit =
  | "currency"
  | "percent"
  | "count"
  | "ratio"
  | "per_unit"
  | "none";

/** Semantic category of a line item — what statement/role it plays. */
export type ItemCategory =
  | "revenue"
  | "cogs"
  | "opex"
  | "headcount"
  | "asset"
  | "liability"
  | "equity"
  | "cashflow"
  | "kpi"
  | "other";

export type ModelType =
  | "blank"
  | "three_statement"
  | "dcf"
  | "lbo"
  | "saas"
  | "fpa"
  | "project_finance"
  | "real_estate"
  | "cohort";

/**
 * The time axis. `actualsThrough` is the index of the last period that holds
 * locked historical actuals; everything after it is forecast.
 */
export interface Timeline {
  granularity: Granularity;
  /** ISO date of the first period's start, e.g. "2026-01-01". */
  start: string;
  /** Number of periods on the axis. */
  periods: number;
  /** First fiscal month, 1-12. Jan = 1. */
  fiscalYearStartMonth: number;
  /** Index (0-based) of the last actuals period; -1 means all forecast. */
  actualsThrough: number;
}

/** An input definition: either literal values per period or a driver reference. */
export interface InputDefinition {
  kind: "input";
  /** Per-period values, aligned to the timeline. Nulls are treated as 0. */
  values: (number | null)[];
}

/** A formula definition: a time-aware expression over other items/drivers. */
export interface FormulaDefinition {
  kind: "formula";
  /** Expression source, e.g. "revenue * gross_margin" or "prior(cash) + net_income". */
  expression: string;
}

/** A driver-reference definition: the item mirrors a named driver's series. */
export interface DriverRefDefinition {
  kind: "driver_ref";
  driverId: string;
}

export type ItemDefinition =
  | InputDefinition
  | FormulaDefinition
  | DriverRefDefinition;

/** A named, typed time series — the atomic unit of the model. */
export interface LineItem {
  id: string;
  name: string;
  category: ItemCategory;
  unit: Unit;
  /** Optional section grouping, e.g. "revenue_build", "working_capital". */
  section?: string;
  definition: ItemDefinition;
  notes?: string;
}

export type DriverShape = "scalar" | "series" | "step" | "ramp";

/**
 * A distinguished input that feeds formulas but is not itself a statement line
 * (growth rate, price, churn, hiring plan, DSO/DPO, discount rate). Drivers are
 * what scenarios override and what sensitivities sweep.
 */
export interface Driver {
  id: string;
  name: string;
  unit: Unit;
  shape: DriverShape;
  /**
   * Base values per period. A scalar driver repeats value[0] across the axis;
   * step/ramp are expanded to a full series at load time.
   */
  values: number[];
  notes?: string;
}

/** A named overlay of driver values. Base is always present and overrides nothing. */
export interface Scenario {
  id: string;
  name: string;
  /** driverId -> per-period override values (partial series allowed). */
  overrides: Record<string, (number | null)[]>;
}

export interface ModelMeta {
  name: string;
  type: ModelType;
  baseCurrency: string;
  createdAt: string;
  modifiedAt: string;
  version: number;
}

/** The top-level container — the whole model as one serializable object. */
export interface Model {
  id: string;
  meta: ModelMeta;
  timeline: Timeline;
  items: LineItem[];
  drivers: Driver[];
  scenarios: Scenario[];
}

/** A computed result: every item's series under a given scenario. */
export interface ComputedModel {
  scenarioId: string;
  /** itemId -> per-period computed values. */
  series: Record<string, number[]>;
  /** Whether the iterative solver reached convergence (for circular models). */
  converged: boolean;
  iterations: number;
}

export type Severity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: Severity;
  code: string;
  message: string;
  /** Item or driver the issue points at, when applicable. */
  targetId?: string;
  period?: number;
}
