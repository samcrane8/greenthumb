/**
 * @greenthumb/core — the financial model engine.
 *
 * The single source of truth (PRD §9.1). Every adapter — the React UI via the
 * AdonisJS API, and Claude via the MCP server — operates through these types
 * and functions. Pure TypeScript, no I/O: storage and transport live in the
 * apps that consume this package.
 */

export * from "./types.js";
export {
  parse,
  evaluate,
  referencedNames,
  printExpr,
  renameInExpression,
  FormulaError,
  type Node,
  type EvalContext,
} from "./formula.js";
export { computeModel, expandDriver, type SolveOptions } from "./engine.js";
export { validateModel, isValid } from "./validation.js";
export {
  createModel,
  blankModel,
  saasModel,
  bitcoinTreasuryModel,
  TEMPLATES,
  type CreateModelOptions,
  type TemplateInfo,
} from "./templates.js";
export * from "./operations.js";
export {
  getStatement,
  compareScenarios,
  getChartData,
  type Statement,
  type StatementKind,
  type StatementRow,
  type ChartData,
  type ChartDataSeries,
} from "./outputs.js";
export { renderDashboardHtml, type RenderDashboardOptions } from "./export.js";
export {
  analyzeCapitalStack,
  type CapitalStackAnalysis,
  type TrancheResult,
} from "./capitalstack.js";
export {
  COMMODITIES,
  listCommodities,
  findPriceModel,
  generatePrice,
  daysSinceGenesis,
  periodDate,
  type Commodity,
  type PriceModel,
} from "./commodities.js";
export {
  scoreSeries,
  scoreForecast,
  mae,
  rmse,
  mape,
  bias,
  type AccuracyMetrics,
  type ScoreForecastOptions,
} from "./accuracy.js";
export { resolveScenario, resolveItemId } from "./analysis.js";
export {
  calibrate,
  type CalibrationMetric,
  type CalibrateOptions,
  type CalibrationResult,
  type DriverBounds,
  type RankedMiss,
} from "./calibrate.js";
export {
  backtest,
  backtestSplit,
  walkForward,
  actualsCoverage,
  type BacktestResult,
  type BacktestOptions,
  type SplitResult,
  type WalkForwardResult,
  type WalkForwardStep,
  type WalkForwardOptions,
  type WalkForwardWindow,
  type Window,
} from "./backtest.js";
export {
  sweepDriver,
  tornado,
  generateScenarios,
  MAX_SCENARIO_COMBINATIONS,
  type SweepPoint,
  type SweepOptions,
  type TornadoRow,
  type TornadoOptions,
  type ScenarioAxis,
  type GenerateScenariosResult,
} from "./sensitivity.js";
export { newId } from "./id.js";
