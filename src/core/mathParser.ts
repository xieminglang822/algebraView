import { parse, type EvalFunction, type MathNode } from 'mathjs';
import type { Point } from './types';
import { getActiveLocale } from '../i18n/locale';
import { translate, type Locale } from '../i18n/messages';

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
export function describeMathError(
  error: unknown,
  locale: Locale = getActiveLocale(),
): string {
  const message = error instanceof Error ? error.message : String(error);
  const undefinedSymbol = /Undefined symbol (\w+)/i.exec(message);
  if (undefinedSymbol && undefinedSymbol[1]) {
    const name = undefinedSymbol[1];
    if (name === 'y') {
      return translate(locale, 'math.unknownY');
    }
    return translate(locale, 'math.unknownSymbol', { name });
  }
  if (/Unexpected end of expression/i.test(message)) {
    return translate(locale, 'math.incomplete');
  }
  if (/Parenthesis \) expected/i.test(message)) {
    return translate(locale, 'math.missingRightParen');
  }
  if (/Parenthesis \( expected/i.test(message)) {
    return translate(locale, 'math.missingLeftParen');
  }
  if (/Unexpected character/i.test(message)) {
    return translate(locale, 'math.badCharacter', { message });
  }
  if (/Unknown function/i.test(message)) {
    return translate(locale, 'math.unknownFunction', { message });
  }
  if (/Value expected/i.test(message)) {
    return translate(locale, 'math.missingOperand');
  }
  if (/Undefined symbol/i.test(message)) {
    return translate(locale, 'math.unknownSymbolDetail', { message });
  }
  return translate(locale, 'math.cannotParse', { message });
}

function checkNode(node: MathNode, locale: Locale): void {
  if (FORBIDDEN_NODE_TYPES.has(node.type)) {
    throw new ExpressionError(translate(locale, 'math.singleFunctionOnly'), node.toString());
  }
  node.forEach((child) => {
    checkNode(child, locale);
  });
}

/**
 * Parses and compiles an expression against the single free variable `x`.
 * Throws {@link ExpressionError} with a message in the requested locale.
 */
export function compileExpression(
  rawExpression: string,
  locale: Locale = getActiveLocale(),
): CompiledExpression {
  const expression = rawExpression.trim();
  if (expression === '') {
    throw new ExpressionError(translate(locale, 'math.empty'), expression);
  }

  const cached = expressionCache.get(expression);
  if (cached) {
    return cached;
  }

  let node: MathNode;
  try {
    node = parse(expression);
  } catch (error) {
    throw new ExpressionError(describeMathError(error, locale), expression);
  }

  try {
    checkNode(node, locale);
  } catch (error) {
    throw new ExpressionError(describeMathError(error, locale), expression);
  }

  let evaluator: EvalFunction;
  try {
    evaluator = node.compile();
  } catch (error) {
    throw new ExpressionError(describeMathError(error, locale), expression);
  }

  // mathjs resolves symbols lazily; probe once so unknown variables surface here.
  try {
    evaluator.evaluate({ x: 0.5 });
  } catch (error) {
    throw new ExpressionError(describeMathError(error, locale), expression);
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

export function validateExpression(
  rawExpression: string,
  locale: Locale = getActiveLocale(),
): ExpressionValidation {
  try {
    compileExpression(rawExpression, locale);
    return { ok: true, error: null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof ExpressionError
          ? error.message
          : describeMathError(error, locale),
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
