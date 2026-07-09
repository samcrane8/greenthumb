/**
 * Model templates (PRD §6 "Template / Model type").
 *
 * A template seeds items, drivers, scenarios, and integrity expectations for a
 * domain. Templates are the defaults Claude scaffolds from and the modeler
 * starts from. Start with `blank` and `saas`; more (3-statement, DCF, LBO…)
 * slot into the same registry.
 */

import { newId } from "./id.js";
import type { Driver, LineItem, Model, ModelType, Scenario, Timeline } from "./types.js";

export interface CreateModelOptions {
  name: string;
  type?: ModelType;
  baseCurrency?: string;
  timeline?: Partial<Timeline>;
}

const now = () => new Date().toISOString();

function defaultTimeline(overrides?: Partial<Timeline>): Timeline {
  return {
    granularity: "monthly",
    start: "2026-01-01",
    periods: 36,
    fiscalYearStartMonth: 1,
    actualsThrough: -1,
    ...overrides,
  };
}

function baseScenario(): Scenario {
  return { id: newId("scn"), name: "Base", overrides: {} };
}

function shell(options: CreateModelOptions, type: ModelType): Model {
  const ts = now();
  return {
    id: newId("mdl"),
    meta: {
      name: options.name,
      type,
      baseCurrency: options.baseCurrency ?? "USD",
      createdAt: ts,
      modifiedAt: ts,
      version: 1,
    },
    timeline: defaultTimeline(options.timeline),
    items: [],
    drivers: [],
    scenarios: [baseScenario()],
  };
}

/** An empty model: a timeline and a Base scenario, nothing else. */
export function blankModel(options: CreateModelOptions): Model {
  return shell(options, "blank");
}

/**
 * A minimal but coherent SaaS / ARR model: a customer build driven by new-logo
 * adds and churn, MRR/ARR, gross margin, opex, and EBITDA — plus a Downside
 * scenario. Demonstrates drivers, time-aware formulas, and scenario overlays.
 */
export function saasModel(options: CreateModelOptions): Model {
  const model = shell(options, "saas");
  const periods = model.timeline.periods;

  const driver = (
    name: string,
    unit: Driver["unit"],
    shape: Driver["shape"],
    values: number[],
  ): Driver => ({ id: newId("drv"), name, unit, shape, values });

  // new_customers period 0 folds in the 100-customer starting base (100 + 20).
  const newCustomers = [120, ...new Array(Math.max(0, periods - 1)).fill(20)];

  const drivers: Driver[] = [
    driver("new_customers", "count", "series", newCustomers),
    driver("monthly_churn", "percent", "scalar", [0.02]),
    driver("arpa", "currency", "scalar", [500]),
    driver("gross_margin", "percent", "scalar", [0.8]),
    driver("opex_per_month", "currency", "scalar", [40000]),
  ];

  const item = (
    name: string,
    category: LineItem["category"],
    unit: LineItem["unit"],
    expression: string,
    section?: string,
  ): LineItem => ({
    id: newId("itm"),
    name,
    category,
    unit,
    section,
    definition: { kind: "formula", expression },
  });

  const items: LineItem[] = [
    item(
      "customers",
      "kpi",
      "count",
      "prior(customers) * (1 - monthly_churn) + new_customers",
      "revenue_build",
    ),
    item("mrr", "revenue", "currency", "customers * arpa", "revenue_build"),
    item("arr", "kpi", "currency", "mrr * 12", "revenue_build"),
    item("cogs", "cogs", "currency", "-mrr * (1 - gross_margin)", "cost_build"),
    item("gross_profit", "kpi", "currency", "mrr + cogs", "cost_build"),
    item("opex", "opex", "currency", "-opex_per_month", "cost_build"),
    item("ebitda", "kpi", "currency", "gross_profit + opex", "cost_build"),
  ];

  const churn = drivers.find((d) => d.name === "monthly_churn")!;
  const newLogo = drivers.find((d) => d.name === "new_customers")!;
  const downside: Scenario = {
    id: newId("scn"),
    name: "Downside",
    overrides: {
      [churn.id]: new Array(periods).fill(0.04), // churn doubles
      [newLogo.id]: newCustomers.map((v) => v / 2), // new-logo growth halves
    },
  };

  model.drivers = drivers;
  model.items = items;
  model.scenarios = [...model.scenarios, downside];
  return model;
}

export interface TemplateInfo {
  type: ModelType;
  label: string;
  description: string;
  build: (options: CreateModelOptions) => Model;
}

/** Registry of available templates, for menus in the UI and enums in MCP. */
export const TEMPLATES: TemplateInfo[] = [
  {
    type: "blank",
    label: "Blank",
    description: "An empty model — just a timeline and a Base scenario.",
    build: blankModel,
  },
  {
    type: "saas",
    label: "SaaS / ARR",
    description: "Customer build, MRR/ARR, gross margin, opex, EBITDA, with a Downside scenario.",
    build: saasModel,
  },
];

/** Build a model from a template type, falling back to blank. */
export function createModel(options: CreateModelOptions): Model {
  const type = options.type ?? "blank";
  const template = TEMPLATES.find((t) => t.type === type);
  return (template?.build ?? blankModel)(options);
}
