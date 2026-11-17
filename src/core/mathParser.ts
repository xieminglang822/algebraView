import { parse, type EvalFunction, type MathNode } from 'mathjs';
import type { Point } from './types';

export class ExpressionError extends Error {
  readonly expression: string;

  constructor(message: string, expression: string) {
    super(message);
    this.name = 'ExpressionError';
    this.expression = expression;
  }
}

export interface CompiledExpression {
  readonly expression: string;
  evaluate(x: number): number;
}

export interface SamplePoint extends Point {
  y: number;
}

const MAX_CACHE_ENTRIES = 96;
const expressionCache = new Map<string, CompiledExpression>();

const FORBIDDEN_NODE_TYPES = new Set([
  'AssignmentNode',
  'FunctionAssignmentNode',
  'BlockNode',
  'ArrayNode',
  'MatrixNode',
  'ObjectNode',
  'IndexNode',
  'RangeNode',
]);

/** Converts loose mathjs evaluation output into a finite number or NaN. */
export function coerceNumeric(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  if (typeof value === 'bigint') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : Number.NaN;
  }
  if (value !== null && typeof value === 'object') {
    const candidate = value as {
      re?: unknown;
      im?: unknown;
      toNumber?: () => number;
    };
    if (typeof candidate.re === 'number' && typeof candidate.im === 'number') {
      return Math.abs(candidate.im) < 1e-12 ? candidate.re : Number.NaN;
    }
    if (typeof candidate.toNumber === 'function') {
      try {
        const numeric = candidate.toNumber();
        return Number.isFinite(numeric) ? numeric : Number.NaN;
      } catch {
        return Number.NaN;
      }
    }
  }
  return Number.NaN;
}

/** Turns a mathjs / JavaScript error into a friendly Chinese explanation. */
export function describeMathError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const undefinedSymbol = /Undefined symbol (\w+)/i.exec(message);
  if (undefinedSymbol && undefinedSymbol[1]) {
    const name = undefinedSymbol[1];
    if (name === 'y') {
      return '未知符号「y」：请去掉「y =」前缀，只输入等号右侧的表达式。';
    }
    return `未知符号「${name}」：图像引擎只支持自变量 x。`;
  }
  if (/Unexpected end of expression/i.test(message)) {
    return '表达式不完整：结尾缺少数字、变量或右括号。';
  }
  if (/Parenthesis \) expected/i.test(message)) {
    return '括号不配对：缺少右括号「)」。';
  }
  if (/Parenthesis \( expected/i.test(message)) {
    return '括号不配对：缺少左括号「(」。';
  }
  if (/Unexpected character/i.test(message)) {
    return `包含无法识别的字符：${message}`;
  }
  if (/Unknown function/i.test(message)) {
    return `未知函数：${message}`;
  }
  if (/Value expected/i.test(message)) {
    return '运算符缺少操作数，请检查表达式是否完整。';
  }
  if (/Undefined symbol/i.test(message)) {
    return `未知符号：${message}`;
  }
  return `表达式无法解析：${message}`;
}

function checkNode(node: MathNode): void {
  if (FORBIDDEN_NODE_TYPES.has(node.type)) {
    throw new ExpressionError('只支持单个函数表达式，不支持赋值、方程或多行语句。', node.toString());
  }
  node.forEach((child) => {
    checkNode(child);
  });
}

/**
 * Parses and compiles an expression against the single free variable `x`.
 * Throws {@link ExpressionError} with a human readable Chinese message.
 */
export function compileExpression(rawExpression: string): CompiledExpression {
  const expression = rawExpression.trim();
  if (expression === '') {
    throw new ExpressionError('表达式为空，请输入例如 x^2 - 4。', expression);
  }

  const cached = expressionCache.get(expression);
  if (cached) {
    return cached;
  }

  let node: MathNode;
  try {
    node = parse(expression);
  } catch (error) {
    throw new ExpressionError(describeMathError(error), expression);
  }

  try {
    checkNode(node);
  } catch (error) {
    throw new ExpressionError(describeMathError(error), expression);
  }

  let evaluator: EvalFunction;
  try {
    evaluator = node.compile();
  } catch (error) {
    throw new ExpressionError(describeMathError(error), expression);
  }

  // mathjs resolves symbols lazily; probe once so unknown variables surface here.
  try {
    evaluator.evaluate({ x: 0.5 });
  } catch (error) {
    throw new ExpressionError(describeMathError(error), expression);
  }

  const compiled: CompiledExpression = {
    expression,
    evaluate(x: number): number {
      if (!Number.isFinite(x)) {
        return Number.NaN;
      }
      try {
        return coerceNumeric(evaluator.evaluate({ x }));
      } catch {
        return Number.NaN;
      }
    },
  };

  if (expressionCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = expressionCache.keys().next();
    if (!oldest.done) {
      expressionCache.delete(oldest.value);
    }
  }
  expressionCache.set(expression, compiled);
  return compiled;
}

export interface ExpressionValidation {
  ok: boolean;
  error: string | null;
}

export function validateExpression(rawExpression: string): ExpressionValidation {
  try {
    compileExpression(rawExpression);
    return { ok: true, error: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ExpressionError ? error.message : describeMathError(error),
    };
  }
}

export function clearExpressionCache(): void {
  expressionCache.clear();
}

/** Uniformly samples `[xMin, xMax]`, returning NaN for undefined points. */
export function sampleExpression(
  compiled: CompiledExpression,
  xMin: number,
  xMax: number,
  sampleCount: number,
): SamplePoint[] {
  const safeCount = Math.max(2, Math.min(6000, Math.floor(sampleCount)));
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) {
    return [{ x: xMin, y: compiled.evaluate(xMin) }];
  }
  const points: SamplePoint[] = new Array<SamplePoint>(safeCount);
  const step = (xMax - xMin) / (safeCount - 1);
  for (let index = 0; index < safeCount; index += 1) {
    const x = index === safeCount - 1 ? xMax : xMin + step * index;
    points[index] = { x, y: compiled.evaluate(x) };
  }
  return points;
}
