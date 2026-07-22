/**
 * Time-aware formula language (PRD §6 "Formula", §7.2).
 *
 * A small DSL over item/driver names that supports financial time semantics
 * beyond plain arithmetic: prior/lag/lead, cumulative and rolling windows,
 * growth, and the usual min/max/if. This module is pure: it turns an expression
 * string into an AST and evaluates it per-period against a resolver the engine
 * supplies. It knows nothing about models, storage, or scenarios.
 */

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

export type Node =
  | { type: "num"; value: number }
  | { type: "ref"; name: string }
  | { type: "unary"; op: "-"; arg: Node }
  | { type: "binary"; op: BinaryOp; left: Node; right: Node }
  | { type: "call"; name: string; args: Node[] };

type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "^"
  | "<"
  | ">"
  | "<="
  | ">="
  | "=="
  | "!=";

export class FormulaError extends Error {}

/** Everything the evaluator needs from the engine to resolve a period value. */
export interface EvalContext {
  /** Resolve a referenced item/driver name at a given period. Out-of-range => 0. */
  resolve(name: string, period: number): number;
  /** Total number of periods on the timeline. */
  periods: number;
  /**
   * Periods per year for the timeline granularity (monthly→12, quarterly→4,
   * annual→1). Read by `periods_per_year()` for annualization. Defaults to 1
   * when absent (annual).
   */
  periodsPerYear?: number;
}

/**
 * The complete set of built-in function names the evaluator dispatches. Single
 * source of truth: `evalCall` handles exactly these, and validation resolves
 * every formula's function calls against this set (see `referencedFunctions`).
 * A guard test asserts the switch and this set never drift apart.
 */
export const KNOWN_FUNCTIONS: ReadonlySet<string> = new Set([
  // time-shift / window
  "prior", "lag", "lead", "cumulative", "rolling", "growth",
  // arithmetic / logic
  "min", "max", "abs", "sum", "avg", "if",
  // stateless math
  "exp", "ln", "sqrt", "pow", "round", "floor", "clamp", "logistic", "scurve",
  // statistics / time-series
  "logret", "pct_change", "stdev", "var", "zscore", "drawdown",
  "cov", "correl", "beta", "slope", "intercept", "r2", "periods_per_year",
]);

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "("; }
  | { t: ")"; }
  | { t: ","; };

const TWO_CHAR_OPS = new Set(["<=", ">=", "==", "!="]);
const ONE_CHAR_OPS = new Set(["+", "-", "*", "/", "^", "<", ">"]);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ t: "(" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ t: ")" });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ t: "," });
      i++;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) {
      tokens.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if (ONE_CHAR_OPS.has(c)) {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(src[i + 1] ?? ""))) {
      let j = i + 1;
      while (j < src.length && (isDigit(src[j]!) || src[j] === ".")) j++;
      tokens.push({ t: "num", v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < src.length && isIdentPart(src[j]!)) j++;
      tokens.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    throw new FormulaError(`Unexpected character '${c}' at position ${i}`);
  }
  return tokens;
}

const isDigit = (c: string) => c >= "0" && c <= "9";
const isIdentStart = (c: string) =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdentPart = (c: string) => isIdentStart(c) || isDigit(c) || c === ".";

// ---------------------------------------------------------------------------
// Parser (precedence-climbing)
// ---------------------------------------------------------------------------

const PRECEDENCE: Record<string, number> = {
  "==": 1,
  "!=": 1,
  "<": 2,
  ">": 2,
  "<=": 2,
  ">=": 2,
  "+": 3,
  "-": 3,
  "*": 4,
  "/": 4,
  "^": 5,
};

/** Parse an expression string into an AST. Throws FormulaError on bad syntax. */
export function parse(src: string): Node {
  const tokens = tokenize(src);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr(minPrec: number): Node {
    let left = parseUnary();
    for (;;) {
      const tok = peek();
      if (!tok || tok.t !== "op") break;
      const prec = PRECEDENCE[tok.v];
      if (prec === undefined || prec < minPrec) break;
      next();
      // ^ is right-associative; everything else left-associative.
      const nextMin = tok.v === "^" ? prec : prec + 1;
      const right = parseExpr(nextMin);
      left = { type: "binary", op: tok.v as BinaryOp, left, right };
    }
    return left;
  }

  function parseUnary(): Node {
    const tok = peek();
    if (tok && tok.t === "op" && tok.v === "-") {
      next();
      return { type: "unary", op: "-", arg: parseUnary() };
    }
    if (tok && tok.t === "op" && tok.v === "+") {
      next();
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): Node {
    const tok = next();
    if (!tok) throw new FormulaError("Unexpected end of expression");
    if (tok.t === "num") return { type: "num", value: tok.v };
    if (tok.t === "(") {
      const inner = parseExpr(0);
      const close = next();
      if (!close || close.t !== ")")
        throw new FormulaError("Expected ')'");
      return inner;
    }
    if (tok.t === "id") {
      const after = peek();
      if (after && after.t === "(") {
        next(); // consume '('
        const args: Node[] = [];
        if (peek()?.t !== ")") {
          for (;;) {
            args.push(parseExpr(0));
            const sep = peek();
            if (sep && sep.t === ",") {
              next();
              continue;
            }
            break;
          }
        }
        const close = next();
        if (!close || close.t !== ")")
          throw new FormulaError(`Expected ')' after args to ${tok.v}()`);
        return { type: "call", name: tok.v.toLowerCase(), args };
      }
      return { type: "ref", name: tok.v };
    }
    throw new FormulaError(`Unexpected token`);
  }

  const ast = parseExpr(0);
  if (pos !== tokens.length) throw new FormulaError("Trailing input in expression");
  return ast;
}

/** Collect the names of item/driver references in an expression (for the dep graph). */
export function referencedNames(node: Node): string[] {
  const out = new Set<string>();
  const walk = (n: Node) => {
    switch (n.type) {
      case "ref":
        out.add(n.name);
        break;
      case "unary":
        walk(n.arg);
        break;
      case "binary":
        walk(n.left);
        walk(n.right);
        break;
      case "call":
        n.args.forEach(walk);
        break;
    }
  };
  walk(node);
  return [...out];
}

/** Every distinct function name called anywhere in an expression AST. */
export function referencedFunctions(node: Node): string[] {
  const out = new Set<string>();
  const walk = (n: Node) => {
    switch (n.type) {
      case "unary":
        walk(n.arg);
        break;
      case "binary":
        walk(n.left);
        walk(n.right);
        break;
      case "call":
        out.add(n.name);
        n.args.forEach(walk);
        break;
    }
  };
  walk(node);
  return [...out];
}

// ---------------------------------------------------------------------------
// Printer + rename (AST -> string)
//
// The engine parses expression strings but stored formulas are strings, so a
// rename that must keep dependent formulas resolvable needs to rewrite those
// strings. We do it structurally: parse -> rewrite `ref` names -> print. The
// printer emits minimal, precedence-aware parentheses, so an expression may be
// canonically reformatted on rename (semantically identical — see round-trip
// tests). `parse(print(ast))` is stable.
// ---------------------------------------------------------------------------

/** Precedence of a node for parenthesization; atoms bind tightest. */
function nodePrec(n: Node): number {
  return n.type === "binary" ? PRECEDENCE[n.op]! : Infinity;
}

/** Render an AST back to a canonical expression string. */
export function printExpr(node: Node): string {
  switch (node.type) {
    case "num":
      return String(node.value);
    case "ref":
      return node.name;
    case "unary": {
      // Parenthesize a binary argument so `-(a + b)` round-trips correctly.
      const inner = printExpr(node.arg);
      return node.arg.type === "binary" ? `-(${inner})` : `-${inner}`;
    }
    case "call":
      return `${node.name}(${node.args.map(printExpr).join(", ")})`;
    case "binary": {
      const p = PRECEDENCE[node.op]!;
      const rightAssoc = node.op === "^";
      const wrap = (child: Node, side: "left" | "right") => {
        const s = printExpr(child);
        const cp = nodePrec(child);
        const needs =
          side === "left"
            ? cp < p || (rightAssoc && cp === p)
            : cp < p || (!rightAssoc && cp === p);
        return needs ? `(${s})` : s;
      };
      return `${wrap(node.left, "left")} ${node.op} ${wrap(node.right, "right")}`;
    }
  }
}

/** Structurally rewrite `ref` names according to `renames` (old -> new). */
function renameRefs(node: Node, renames: Record<string, string>): Node {
  switch (node.type) {
    case "num":
      return node;
    case "ref":
      return renames[node.name] ? { type: "ref", name: renames[node.name]! } : node;
    case "unary":
      return { type: "unary", op: node.op, arg: renameRefs(node.arg, renames) };
    case "binary":
      return {
        type: "binary",
        op: node.op,
        left: renameRefs(node.left, renames),
        right: renameRefs(node.right, renames),
      };
    case "call":
      return { type: "call", name: node.name, args: node.args.map((a) => renameRefs(a, renames)) };
  }
}

/**
 * Rewrite every reference to a renamed name inside an expression string.
 * Only bare item/driver references are swapped — function names and numbers are
 * untouched. Returns the canonically printed result.
 */
export function renameInExpression(expr: string, renames: Record<string, string>): string {
  return printExpr(renameRefs(parse(expr), renames));
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/** Evaluate an AST at `period` against `ctx`. */
export function evaluate(node: Node, period: number, ctx: EvalContext): number {
  switch (node.type) {
    case "num":
      return node.value;
    case "ref":
      return ctx.resolve(node.name, period);
    case "unary":
      return -evaluate(node.arg, period, ctx);
    case "binary":
      return evalBinary(node, period, ctx);
    case "call":
      return evalCall(node, period, ctx);
  }
}

function evalBinary(
  node: Extract<Node, { type: "binary" }>,
  period: number,
  ctx: EvalContext,
): number {
  const a = evaluate(node.left, period, ctx);
  const b = evaluate(node.right, period, ctx);
  switch (node.op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      return b === 0 ? 0 : a / b;
    case "^":
      return Math.pow(a, b);
    case "<":
      return a < b ? 1 : 0;
    case ">":
      return a > b ? 1 : 0;
    case "<=":
      return a <= b ? 1 : 0;
    case ">=":
      return a >= b ? 1 : 0;
    case "==":
      return a === b ? 1 : 0;
    case "!=":
      return a !== b ? 1 : 0;
  }
}

/**
 * Built-in functions. Time-shifting functions (prior/lag/lead/cumulative/
 * rolling/growth) re-evaluate their argument AST at other periods, so they work
 * over arbitrary sub-expressions, not just bare references.
 */
function evalCall(
  node: Extract<Node, { type: "call" }>,
  period: number,
  ctx: EvalContext,
): number {
  const { name, args } = node;
  const at = (n: Node, p: number) =>
    p < 0 || p >= ctx.periods ? 0 : evaluate(n, p, ctx);
  const arg = (i: number) => evaluate(args[i]!, period, ctx);

  switch (name) {
    case "prior":
      requireArgs(name, args, 1);
      return at(args[0]!, period - 1);
    case "lag":
      requireArgs(name, args, 2);
      return at(args[0]!, period - Math.round(arg(1)));
    case "lead":
      requireArgs(name, args, 2);
      return at(args[0]!, period + Math.round(arg(1)));
    case "cumulative": {
      requireArgs(name, args, 1);
      let sum = 0;
      for (let p = 0; p <= period; p++) sum += at(args[0]!, p);
      return sum;
    }
    case "rolling": {
      requireArgs(name, args, 2);
      const window = Math.round(arg(1));
      let sum = 0;
      for (let p = Math.max(0, period - window + 1); p <= period; p++)
        sum += at(args[0]!, p);
      return sum;
    }
    case "growth": {
      requireArgs(name, args, 1);
      const prev = at(args[0]!, period - 1);
      return prev === 0 ? 0 : arg(0) / prev - 1;
    }
    case "min":
      return Math.min(...args.map((_, i) => arg(i)));
    case "max":
      return Math.max(...args.map((_, i) => arg(i)));
    case "abs":
      requireArgs(name, args, 1);
      return Math.abs(arg(0));
    case "sum":
      return args.reduce((acc, _, i) => acc + arg(i), 0);
    case "avg":
      return args.length === 0
        ? 0
        : args.reduce((acc, _, i) => acc + arg(i), 0) / args.length;
    case "if":
      requireArgs(name, args, 3);
      return arg(0) !== 0 ? arg(1) : arg(2);
    // --- Stateless math primitives (pure, period-local, total) ---
    // These never throw on domain edge cases; out-of-domain / non-finite
    // results collapse to 0, matching the divide-by-zero convention above.
    case "exp":
      requireArgs(name, args, 1);
      return finite(Math.exp(arg(0)));
    case "ln":
      requireArgs(name, args, 1);
      return arg(0) <= 0 ? 0 : finite(Math.log(arg(0)));
    case "sqrt":
      requireArgs(name, args, 1);
      return arg(0) < 0 ? 0 : finite(Math.sqrt(arg(0)));
    case "pow":
      requireArgs(name, args, 2);
      return finite(Math.pow(arg(0), arg(1)));
    case "round":
      requireArgs(name, args, 1);
      return Math.round(arg(0));
    case "floor":
      requireArgs(name, args, 1);
      return Math.floor(arg(0));
    case "clamp": {
      requireArgs(name, args, 3);
      const x = arg(0);
      const lo = arg(1);
      const hi = arg(2);
      return Math.min(Math.max(x, lo), hi);
    }
    case "logistic": {
      // logistic(x, k, x0) = 1 / (1 + exp(-k * (x - x0)))
      requireArgs(name, args, 3);
      return finite(1 / (1 + Math.exp(-arg(1) * (arg(0) - arg(2)))));
    }
    case "scurve": {
      // scurve(t, start, peak, ramp): start-to-peak ramp shaped by a logistic
      // centered at ramp/2 with steepness 4/ramp (near-flat by t=0 and t=ramp).
      requireArgs(name, args, 4);
      const t = arg(0);
      const start = arg(1);
      const peak = arg(2);
      const ramp = arg(3);
      const k = ramp === 0 ? 0 : 4 / ramp;
      const s = 1 / (1 + Math.exp(-k * (t - ramp / 2)));
      return finite(start + (peak - start) * s);
    }
    // --- Statistics / time-series (period-window; see KNOWN_FUNCTIONS) ---------
    // Convention: no `window` arg => expanding (all periods 0..period, like
    // `cumulative`); a trailing integer `window` => trailing window (like
    // `rolling`). Fewer than two observations, or a zero-variance denominator,
    // yields 0 (via `finite`) — never NaN/Infinity. Lead/lag is expressed by
    // composing `lag(x, k)` inside these, not a separate parameter.
    case "logret": {
      requireArgs(name, args, 1);
      const prev = at(args[0]!, period - 1);
      const cur = arg(0);
      return prev > 0 && cur > 0 ? finite(Math.log(cur / prev)) : 0;
    }
    case "pct_change": {
      requireArgs(name, args, 1);
      const prev = at(args[0]!, period - 1);
      return prev === 0 ? 0 : arg(0) / prev - 1;
    }
    case "periods_per_year":
      requireArgs(name, args, 0);
      return ctx.periodsPerYear ?? 1;
    case "drawdown": {
      requireArgs(name, args, 1);
      let peak = -Infinity;
      for (let p = 0; p <= period; p++) peak = Math.max(peak, at(args[0]!, p));
      return peak > 0 ? finite(arg(0) / peak - 1) : 0;
    }
    case "var":
      requireArgs2(name, args, 1, 2);
      return finite(sampleVar(windowVals(at, args[0]!, winArg(args, arg, 1), period)));
    case "stdev":
      requireArgs2(name, args, 1, 2);
      return finite(Math.sqrt(sampleVar(windowVals(at, args[0]!, winArg(args, arg, 1), period))));
    case "zscore": {
      requireArgs2(name, args, 1, 2);
      const xs = windowVals(at, args[0]!, winArg(args, arg, 1), period);
      const sd = Math.sqrt(sampleVar(xs));
      return sd === 0 ? 0 : finite((arg(0) - mean(xs)) / sd);
    }
    case "cov":
      requireArgs2(name, args, 2, 3);
      return finite(pairCov(at, args, arg, period, 2));
    case "correl": {
      requireArgs2(name, args, 2, 3);
      const w = winArg(args, arg, 2);
      const xs = windowVals(at, args[0]!, w, period);
      const ys = windowVals(at, args[1]!, w, period);
      const denom = Math.sqrt(sampleVar(xs) * sampleVar(ys));
      return denom === 0 ? 0 : clampUnit(finite(sampleCov(xs, ys) / denom));
    }
    case "beta":
    case "slope": {
      // beta(y, x[, w]) = slope of y on x = cov(y, x) / var(x)
      requireArgs2(name, args, 2, 3);
      const w = winArg(args, arg, 2);
      const ys = windowVals(at, args[0]!, w, period);
      const xs = windowVals(at, args[1]!, w, period);
      const vx = sampleVar(xs);
      return vx === 0 ? 0 : finite(sampleCov(ys, xs) / vx);
    }
    case "intercept": {
      // intercept = mean(y) - slope * mean(x)
      requireArgs2(name, args, 2, 3);
      const w = winArg(args, arg, 2);
      const ys = windowVals(at, args[0]!, w, period);
      const xs = windowVals(at, args[1]!, w, period);
      const vx = sampleVar(xs);
      const slope = vx === 0 ? 0 : sampleCov(ys, xs) / vx;
      return finite(mean(ys) - slope * mean(xs));
    }
    case "r2": {
      // r2 = correl(y, x)^2
      requireArgs2(name, args, 2, 3);
      const w = winArg(args, arg, 2);
      const ys = windowVals(at, args[0]!, w, period);
      const xs = windowVals(at, args[1]!, w, period);
      const denom = Math.sqrt(sampleVar(ys) * sampleVar(xs));
      if (denom === 0) return 0;
      const r = sampleCov(ys, xs) / denom;
      return finite(r * r);
    }
    default:
      throw new FormulaError(`Unknown function '${name}()'`);
  }
}

// --- Statistics helpers -----------------------------------------------------

/** Values of a node over a window ending at `period`. No window => expanding. */
function windowVals(
  at: (n: Node, p: number) => number,
  node: Node,
  window: number | undefined,
  period: number,
): number[] {
  const start = window && window > 0 ? Math.max(0, period - window + 1) : 0;
  const out: number[] = [];
  for (let p = start; p <= period; p++) out.push(at(node, p));
  return out;
}

/** Optional trailing window argument at position `i` (rounded); undefined if absent. */
function winArg(
  args: Node[],
  arg: (i: number) => number,
  i: number,
): number | undefined {
  return args.length > i ? Math.round(arg(i)) : undefined;
}

/** Covariance of the two argument series over the (optional) window at position `w`. */
function pairCov(
  at: (n: Node, p: number) => number,
  args: Node[],
  arg: (i: number) => number,
  period: number,
  w: number,
): number {
  const window = winArg(args, arg, w);
  const xs = windowVals(at, args[0]!, window, period);
  const ys = windowVals(at, args[1]!, window, period);
  return sampleCov(xs, ys);
}

function mean(a: number[]): number {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}

/** Sample variance (n−1). < 2 observations => 0. */
function sampleVar(a: number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  const m = mean(a);
  let s = 0;
  for (const x of a) s += (x - m) * (x - m);
  return s / (n - 1);
}

/** Sample covariance (n−1) over the shared length. < 2 observations => 0. */
function sampleCov(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x);
  const my = mean(y);
  let s = 0;
  for (let i = 0; i < n; i++) s += (x[i]! - mx) * (y[i]! - my);
  return s / (n - 1);
}

/** Clamp to [-1, 1] (guards floating-point drift on a correlation). */
function clampUnit(v: number): number {
  return Math.min(1, Math.max(-1, v));
}

/** Arity check allowing a min..max range (for the optional window argument). */
function requireArgs2(name: string, args: Node[], lo: number, hi: number): void {
  if (args.length < lo || args.length > hi)
    throw new FormulaError(`${name}() expects ${lo}–${hi} argument(s), got ${args.length}`);
}

/** Collapse non-finite results (NaN, ±Infinity) to 0 so the engine stays total. */
function finite(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

function requireArgs(name: string, args: Node[], n: number): void {
  if (args.length !== n)
    throw new FormulaError(`${name}() expects ${n} argument(s), got ${args.length}`);
}
