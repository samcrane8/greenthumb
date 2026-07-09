/**
 * @greenthumb/core — the financial model engine.
 *
 * The single source of truth (PRD §9.1). Every adapter — the React UI via the
 * AdonisJS API, and Claude via the MCP server — operates through these types
 * and functions. Pure TypeScript, no I/O: storage and transport live in the
 * apps that consume this package.
 */

export * from "./types.js";
export { parse, evaluate, referencedNames, FormulaError, type Node, type EvalContext } from "./formula.js";
export { computeModel, expandDriver, type SolveOptions } from "./engine.js";
export { validateModel, isValid } from "./validation.js";
export {
  createModel,
  blankModel,
  saasModel,
  TEMPLATES,
  type CreateModelOptions,
  type TemplateInfo,
} from "./templates.js";
export * from "./operations.js";
export {
  getStatement,
  compareScenarios,
  type Statement,
  type StatementKind,
  type StatementRow,
} from "./outputs.js";
export { newId } from "./id.js";
