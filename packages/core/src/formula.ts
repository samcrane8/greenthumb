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
}

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
    default:
      throw new FormulaError(`Unknown function '${name}()'`);
  }
}

function requireArgs(name: string, args: Node[], n: number): void {
  if (args.length !== n)
    throw new FormulaError(`${name}() expects ${n} argument(s), got ${args.length}`);
}
