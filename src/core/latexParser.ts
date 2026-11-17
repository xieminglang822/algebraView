import { parse, type MathNode } from 'mathjs';
import type { LayerStructure, PolynomialTerm, TemplateId } from './types';
import { coerceNumeric, describeMathError } from './mathParser';
import { getActiveLocale, joinListFor } from '../i18n/locale';
import { translate, type Locale } from '../i18n/messages';
import {
  MAX_POLYNOMIAL_DEGREE,
  createDefaultSlots,
  createId,
  structureToExpression,
  structureToFormula,
  templateLabel,
} from './templates';

export interface LatexParseSuccess {
  ok: true;
  structure: LayerStructure;
  expression: string;
  formula: string;
  normalizedLatex: string;
  warnings: string[];
}

export interface LatexParseFailure {
  ok: false;
  error: string;
  suggestion: string;
  position?: number;
}

export type LatexParseResult = LatexParseSuccess | LatexParseFailure;

export interface LatexParseOptions {
  preferredTemplate?: TemplateId;
  locale?: Locale;
}

const SUPPORTED_COMMANDS = [
  'frac',
  'sqrt',
  'pi',
  'cdot',
  'times',
  'div',
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'arcsin',
  'arccos',
  'arctan',
  'sinh',
  'cosh',
  'tanh',
  'ln',
  'log',
  'exp',
  'abs',
  'left',
  'right',
  'operatorname',
  'mathrm',
  'text',
  'displaystyle',
  'textstyle',
  'limits',
  'quad',
  'qquad',
  'big',
  'Big',
  'bigg',
  'Bigg',
  'bigl',
  'bigr',
  'Bigl',
  'Bigr',
  'biggl',
  'biggr',
  'Biggl',
  'Biggr',
] as const;

const ALLOWED_SYMBOLS = new Set(['x', 'pi', 'e', 'tau', 'Infinity', 'NaN']);

const FUNCTION_COMMANDS: Record<string, string> = {
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  cot: 'cot',
  sec: 'sec',
  csc: 'csc',
  arcsin: 'asin',
  arccos: 'acos',
  arctan: 'atan',
  sinh: 'sinh',
  cosh: 'cosh',
  tanh: 'tanh',
  ln: 'log',
  log: 'log',
  exp: 'exp',
  abs: 'abs',
};

class LatexSyntaxError extends Error {
  readonly suggestion: string;
  readonly position: number | undefined;

  constructor(message: string, suggestion: string, position?: number) {
    super(message);
    this.name = 'LatexSyntaxError';
    this.suggestion = suggestion;
    this.position = position;
  }
}

interface NormalisedLatex {
  code: string;
  warnings: string[];
}

function countCharacters(source: string, character: string): number {
  let count = 0;
  for (const current of source) {
    if (current === character) {
      count += 1;
    }
  }
  return count;
}

function findUnbalanced(
  source: string,
  open: string,
  close: string,
  locale: Locale,
): { position: number; message: string } | null {
  let depth = 0;
  let openPosition = -1;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === open) {
      depth += 1;
      openPosition = index;
    } else if (character === close) {
      depth -= 1;
      if (depth < 0) {
        return { position: index, message: translate(locale, 'latex.extraClose', { close }) };
      }
    }
  }
  if (depth > 0) {
    return {
      position: openPosition,
      message: translate(locale, 'latex.braceCount', {
        openCount: countCharacters(source, open),
        closeCount: countCharacters(source, close),
        open,
        close,
      }),
    };
  }
  return null;
}

function readGroup(
  source: string,
  startIndex: number,
  open: string,
  close: string,
  locale: Locale,
): { content: string; end: number } {
  let index = startIndex;
  while (source[index] === ' ') {
    index += 1;
  }
  if (source[index] !== open) {
    throw new LatexSyntaxError(
      translate(locale, 'latex.missingGroupOpen', {
        snippet: source.slice(Math.max(0, startIndex - 8), startIndex + 8),
        open,
      }),
      translate(locale, 'latex.groupHint'),
      index,
    );
  }
  let depth = 0;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;
      if (depth === 0) {
        return { content: source.slice(index + 1, cursor), end: cursor + 1 };
      }
    }
  }
  throw new LatexSyntaxError(
    translate(locale, 'latex.unclosed', { open, close }),
    translate(locale, 'latex.unclosedSuggestion', { close }),
    index,
  );
}

function convertFractions(source: string, locale: Locale): string {
  let result = '';
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('\\frac', index)) {
      const numerator = readGroup(source, index + 5, '{', '}', locale);
      const denominator = readGroup(source, numerator.end, '{', '}', locale);
      result += `((${convertFractions(numerator.content, locale)})/(${convertFractions(denominator.content, locale)}))`;
      index = denominator.end;
    } else {
      result += source[index];
      index += 1;
    }
  }
  return result;
}

function convertSquareRoots(source: string, locale: Locale): string {
  let result = '';
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('\\sqrt', index)) {
      let cursor = index + 5;
      while (source[cursor] === ' ') {
        cursor += 1;
      }
      let rootIndex = '';
      if (source[cursor] === '[') {
        const close = source.indexOf(']', cursor);
        if (close === -1) {
          throw new LatexSyntaxError(
            translate(locale, 'latex.rootMissingBracket'),
            translate(locale, 'latex.rootSuggestion'),
            cursor,
          );
        }
        rootIndex = source.slice(cursor + 1, close);
        cursor = close + 1;
      }
      const group = readGroup(source, cursor, '{', '}', locale);
      const content = convertSquareRoots(group.content, locale);
      result += rootIndex === '' ? `sqrt(${content})` : `(${content})^(1/(${rootIndex}))`;
      index = group.end;
    } else {
      result += source[index];
      index += 1;
    }
  }
  return result;
}

function matchParenthesis(
  source: string,
  startIndex: number,
  locale: Locale,
): { content: string; end: number } {
  let depth = 0;
  for (let cursor = startIndex; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        return { content: source.slice(startIndex + 1, cursor), end: cursor + 1 };
      }
    }
  }
  throw new LatexSyntaxError(
    translate(locale, 'latex.parenMissing'),
    translate(locale, 'latex.parenSuggestion'),
    startIndex,
  );
}

function readToken(source: string, startIndex: number): string {
  const match = /^[A-Za-z0-9.]+/.exec(source.slice(startIndex));
  return match ? match[0] : '';
}

/** Rewrites `\log_{b}(x)` into mathjs `log(x, b)`. */
function convertLogBases(source: string, locale: Locale): string {
  let result = '';
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('log_', index)) {
      let cursor = index + 4;
      while (source[cursor] === ' ') {
        cursor += 1;
      }
      let base = '';
      if (source[cursor] === '{') {
        const group = readGroup(source, cursor, '{', '}', locale);
        base = group.content.trim();
        cursor = group.end;
      } else if (source[cursor] === '(') {
        const group = matchParenthesis(source, cursor, locale);
        base = group.content.trim();
        cursor = group.end;
      } else {
        base = readToken(source, cursor);
        cursor += base.length;
      }
      while (source[cursor] === ' ') {
        cursor += 1;
      }
      if (base !== '' && source[cursor] === '(') {
        const argument = matchParenthesis(source, cursor, locale);
        result += `log(${convertLogBases(argument.content, locale)}, ${base})`;
        index = argument.end;
        continue;
      }
      result += source.slice(index, cursor);
      index = cursor;
      continue;
    }
    result += source[index];
    index += 1;
  }
  return result;
}

function insertImplicitMultiplication(source: string): string {
  let result = source;
  result = result.replace(/(^|[^A-Za-z])pi(?=[A-Za-z(])/g, '$1pi*');
  result = result.replace(/(\d)\s*(?=[A-Za-z(])/g, '$1*');
  result = result.replace(/\)\s*(?=[A-Za-z0-9(])/g, ')*');
  result = result.replace(/(^|[^A-Za-z0-9_)])(pi|e|x)\s*(?=\()/g, '$1$2*');
  result = result.replace(/([A-Za-z0-9)])\s+(?=(?:sin|cos|tan|log|sqrt|exp|abs)\s*\()/g, '$1*');
  return result;
}

function checkCommands(source: string, locale: Locale): void {
  const commandPattern = /\\([A-Za-z]+)/g;
  const unsupported: string[] = [];
  let match: RegExpExecArray | null = commandPattern.exec(source);
  while (match) {
    const name = match[1] ?? '';
    if (name !== '' && !(SUPPORTED_COMMANDS as readonly string[]).includes(name)) {
      unsupported.push(`\\${name}`);
    }
    match = commandPattern.exec(source);
  }
  if (unsupported.length > 0) {
    throw new LatexSyntaxError(
      translate(locale, 'latex.unsupportedCommands', { list: joinListFor(locale, unsupported) }),
      translate(locale, 'latex.supportedCommands'),
    );
  }
}

/**
 * Best-effort LaTeX → mathjs normalization. Throws {@link LatexSyntaxError}
 * with a concrete repair suggestion when the input cannot be tokenized.
 */
export function normaliseLatex(
  rawLatex: string,
  locale: Locale = getActiveLocale(),
): NormalisedLatex {
  const warnings: string[] = [];
  let source = rawLatex.trim();
  if (source === '') {
    throw new LatexSyntaxError(translate(locale, 'latex.empty'), translate(locale, 'latex.emptyExample'));
  }
  source = source.replace(/^\${1,2}/, '').replace(/\${1,2}$/, '').trim();

  const prefix = /^(?:y|f\s*\(\s*x\s*\)|g\s*\(\s*x\s*\))\s*=\s*/i.exec(source);
  if (prefix) {
    source = source.slice(prefix[0].length);
  }
  if (source.includes('=')) {
    throw new LatexSyntaxError(
      translate(locale, 'latex.extraEquals'),
      translate(locale, 'latex.extraEqualsSuggestion'),
    );
  }
  if (/\\\\|&/.test(source)) {
    throw new LatexSyntaxError(translate(locale, 'latex.multiline'), translate(locale, 'latex.multilineSuggestion'));
  }
  if (/\\(?:begin|end)\b/.test(source)) {
    throw new LatexSyntaxError(
      translate(locale, 'latex.environment'),
      translate(locale, 'latex.environmentSuggestion'),
    );
  }
  if (/[\u4e00-\u9fff]/.test(source)) {
    throw new LatexSyntaxError(translate(locale, 'latex.chinese'), translate(locale, 'latex.chineseSuggestion'));
  }
  checkCommands(source, locale);

  source = source
    .replace(/\u2212/g, '-')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[×⋅·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/∞/g, 'Infinity')
    .replace(/√/g, 'sqrt')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4')
    .replace(/⁵/g, '^5')
    .replace(/⁶/g, '^6')
    .replace(/⁷/g, '^7')
    .replace(/⁸/g, '^8')
    .replace(/⁹/g, '^9')
    .replace(/[，。；;]$/g, '');

  source = source
    .replace(/\\cdot/g, '*')
    .replace(/\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\pi(?![A-Za-z])/g, 'pi');

  source = source
    .replace(/\\(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr)\s*/g, '')
    .replace(/\\(?:displaystyle|textstyle|limits)/g, '')
    .replace(/\\(?:quad|qquad)/g, ' ')
    .replace(/\\[!,;: ]/g, '')
    .replace(/\\ /g, ' ')
    .replace(/\\\{/g, '(')
    .replace(/\\\}/g, ')');

  source = source.replace(
    /\\(?:operatorname|mathrm|text)\{([^{}]*)\}/g,
    (_match: string, content: string) => content,
  );

  const braceProblem = findUnbalanced(source, '{', '}', locale);
  if (braceProblem) {
    const missing = countCharacters(source, '{') - countCharacters(source, '}');
    const hint =
      missing > 0
        ? translate(locale, 'latex.braceHintAdd', { count: missing })
        : translate(locale, 'latex.braceHintRemove');
    throw new LatexSyntaxError(
      translate(locale, 'latex.braceMismatch', { message: braceProblem.message }),
      hint,
      braceProblem.position,
    );
  }

  source = convertFractions(source, locale);
  source = convertSquareRoots(source, locale);
  source = source.replace(
    /\\(arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|cot|sec|csc|ln|log|exp|abs|sqrt)/g,
    (_match: string, name: string) => FUNCTION_COMMANDS[name] ?? name,
  );
  source = convertLogBases(source, locale);
  source = source.replace(/\{/g, '(').replace(/\}/g, ')');
  source = source.replace(/\s+/g, ' ').trim();

  if (source === '') {
    throw new LatexSyntaxError(translate(locale, 'latex.empty'), translate(locale, 'latex.emptyAfterNormalise'));
  }

  const parenProblem = findUnbalanced(source, '(', ')', locale);
  if (parenProblem) {
    const missing = countCharacters(source, '(') - countCharacters(source, ')');
    const hint =
      missing > 0
        ? translate(locale, 'latex.parenHintAdd', { count: missing })
        : translate(locale, 'latex.parenHintRemove');
    throw new LatexSyntaxError(
      translate(locale, 'latex.parenMismatch', { message: parenProblem.message }),
      hint,
      parenProblem.position,
    );
  }

  if (/\\/.test(source)) {
    throw new LatexSyntaxError(
      translate(locale, 'latex.leftoverCommands'),
      translate(locale, 'latex.leftoverSuggestion'),
    );
  }

  if (/(sin|cos|tan|log|ln|sqrt|exp|abs)[A-Za-z0-9]/.test(source)) {
    warnings.push(translate(locale, 'latex.functionParenWarning'));
  }

  source = insertImplicitMultiplication(source);
  source = source.replace(/\s+/g, ' ').trim();

  return { code: source, warnings };
}

interface AstNode {
  type: string;
  op?: string;
  fn?: { name?: string } | string;
  args?: AstNode[];
  name?: string;
  value?: unknown;
  content?: AstNode;
  implicit?: boolean;
}

function asAst(node: MathNode): AstNode {
  return node as unknown as AstNode;
}

function isAstLike(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string';
}

function unwrap(node: AstNode): AstNode {
  let current = node;
  while (current.type === 'ParenthesisNode' && isAstLike(current.content)) {
    current = current.content;
  }
  return current;
}

function childrenOf(node: AstNode): AstNode[] {
  const children: AstNode[] = [];
  if (Array.isArray(node.args)) {
    for (const argument of node.args) {
      if (isAstLike(argument)) {
        children.push(argument);
      }
    }
  }
  if (isAstLike(node.content)) {
    children.push(node.content);
  }
  return children;
}

function collectSymbols(node: AstNode, target: Set<string>): void {
  if (node.type === 'SymbolNode' && typeof node.name === 'string') {
    target.add(node.name);
  }
  for (const child of childrenOf(node)) {
    collectSymbols(child, target);
  }
}

function containsX(node: AstNode): boolean {
  if (node.type === 'SymbolNode' && node.name === 'x') {
    return true;
  }
  return childrenOf(node).some((child) => containsX(child));
}

function evaluateNode(node: AstNode, scope: Record<string, number>): number {
  const evaluatable = node as unknown as {
    evaluate: (scope: Record<string, number>) => unknown;
  };
  try {
    return coerceNumeric(evaluatable.evaluate(scope));
  } catch {
    return Number.NaN;
  }
}

function constantValue(node: AstNode): number | null {
  const raw = unwrap(node);
  if (raw.type === 'ConstantNode') {
    if (typeof raw.value === 'number' && Number.isFinite(raw.value)) {
      return raw.value;
    }
    if (typeof raw.value === 'string') {
      const numeric = Number(raw.value);
      return Number.isFinite(numeric) ? numeric : null;
    }
  }
  if (containsX(raw)) {
    return null;
  }
  const value = evaluateNode(raw, {});
  return Number.isFinite(value) ? value : null;
}

type Polynomial = Map<number, number>;

function tidy(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const rounded = Number(value.toFixed(10));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function polynomialOf(node: AstNode, depth = 0): Polynomial | null {
  if (depth > 14) {
    return null;
  }
  const raw = unwrap(node);
  if (!containsX(raw)) {
    const value = constantValue(raw);
    return value === null ? null : new Map<number, number>([[0, tidy(value)]]);
  }
  if (raw.type === 'SymbolNode' && raw.name === 'x') {
    return new Map<number, number>([[1, 1]]);
  }
  if (raw.type !== 'OperatorNode') {
    return null;
  }
  const args = raw.args ?? [];
  const first = args[0];
  const second = args[1];
  switch (raw.op) {
    case '+': {
      if (!first || !second) {
        return null;
      }
      const left = polynomialOf(first, depth + 1);
      const right = polynomialOf(second, depth + 1);
      return left && right ? combinePolynomials(left, right, 1) : null;
    }
    case '-': {
      if (!first) {
        return null;
      }
      if (args.length === 1) {
        const inner = polynomialOf(first, depth + 1);
        return inner ? scalePolynomial(inner, -1) : null;
      }
      if (!second) {
        return null;
      }
      const left = polynomialOf(first, depth + 1);
      const right = polynomialOf(second, depth + 1);
      return left && right ? combinePolynomials(left, right, -1) : null;
    }
    case '*': {
      let result: Polynomial = new Map<number, number>([[0, 1]]);
      for (const argument of args) {
        const factor = polynomialOf(argument, depth + 1);
        if (!factor) {
          return null;
        }
        const next = multiplyPolynomials(result, factor);
        if (!next) {
          return null;
        }
        result = next;
      }
      return result;
    }
    case '/': {
      if (!first || !second) {
        return null;
      }
      const numerator = polynomialOf(first, depth + 1);
      const denominator = constantValue(second);
      if (!numerator || denominator === null || denominator === 0) {
        return null;
      }
      return scalePolynomial(numerator, 1 / denominator);
    }
    case '^': {
      if (!first || !second) {
        return null;
      }
      const base = polynomialOf(first, depth + 1);
      const exponent = constantValue(second);
      if (!base || exponent === null || !Number.isInteger(exponent) || exponent < 0) {
        return null;
      }
      if (exponent > MAX_POLYNOMIAL_DEGREE) {
        return null;
      }
      let result: Polynomial = new Map<number, number>([[0, 1]]);
      for (let power = 0; power < exponent; power += 1) {
        const next = multiplyPolynomials(result, base);
        if (!next) {
          return null;
        }
        result = next;
      }
      return result;
    }
    default:
      return null;
  }
}

function combinePolynomials(left: Polynomial, right: Polynomial, sign: 1 | -1): Polynomial | null {
  const result: Polynomial = new Map(left);
  for (const [degree, coefficient] of right) {
    const next = (result.get(degree) ?? 0) + sign * coefficient;
    result.set(degree, tidy(next));
  }
  return maxDegreeOf(result) > MAX_POLYNOMIAL_DEGREE ? null : result;
}

function scalePolynomial(source: Polynomial, factor: number): Polynomial {
  const result: Polynomial = new Map();
  for (const [degree, coefficient] of source) {
    result.set(degree, tidy(coefficient * factor));
  }
  return result;
}

function multiplyPolynomials(left: Polynomial, right: Polynomial): Polynomial | null {
  const result: Polynomial = new Map();
  for (const [leftDegree, leftCoefficient] of left) {
    for (const [rightDegree, rightCoefficient] of right) {
      const degree = leftDegree + rightDegree;
      if (degree > MAX_POLYNOMIAL_DEGREE) {
        return null;
      }
      result.set(degree, tidy((result.get(degree) ?? 0) + leftCoefficient * rightCoefficient));
    }
  }
  return result;
}

function maxDegreeOf(polynomial: Polynomial): number {
  let degree = 0;
  for (const [candidate, coefficient] of polynomial) {
    if (Math.abs(coefficient) > 1e-12) {
      degree = Math.max(degree, candidate);
    }
  }
  return degree;
}

interface Affine {
  slope: number;
  intercept: number;
}

function affineOf(node: AstNode): Affine | null {
  const polynomial = polynomialOf(node);
  if (!polynomial) {
    return null;
  }
  for (const [degree, coefficient] of polynomial) {
    if (degree > 1 && Math.abs(coefficient) > 1e-12) {
      return null;
    }
  }
  return {
    slope: tidy(polynomial.get(1) ?? 0),
    intercept: tidy(polynomial.get(0) ?? 0),
  };
}

interface SignedTerm {
  sign: 1 | -1;
  node: AstNode;
}

function splitSum(node: AstNode): SignedTerm[] | null {
  const raw = unwrap(node);
  if (raw.type === 'OperatorNode' && Array.isArray(raw.args)) {
    const args = raw.args;
    if (raw.op === '+') {
      if (args.length < 2) {
        return null;
      }
      const left = splitSum(args[0] as AstNode);
      const right = splitSum(args[1] as AstNode);
      return left && right ? [...left, ...right] : null;
    }
    if (raw.op === '-') {
      if (args.length === 1) {
        const inner = splitSum(args[0] as AstNode);
        return inner
          ? inner.map((term) => ({ sign: (term.sign === 1 ? -1 : 1) as 1 | -1, node: term.node }))
          : null;
      }
      const left = splitSum(args[0] as AstNode);
      const right = splitSum(args[1] as AstNode);
      if (!left || !right) {
        return null;
      }
      return [
        ...left,
        ...right.map((term) => ({ sign: (term.sign === 1 ? -1 : 1) as 1 | -1, node: term.node })),
      ];
    }
  }
  return [{ sign: 1, node: raw }];
}

interface ProductParts {
  coefficient: number;
  factors: AstNode[];
}

function collectProduct(node: AstNode): ProductParts | null {
  const raw = unwrap(node);
  if (raw.type === 'OperatorNode' && Array.isArray(raw.args)) {
    const args = raw.args;
    if (raw.op === '*') {
      let coefficient = 1;
      const factors: AstNode[] = [];
      for (const argument of args) {
        const part = collectProduct(argument);
        if (!part) {
          return null;
        }
        coefficient *= part.coefficient;
        factors.push(...part.factors);
      }
      return { coefficient, factors };
    }
    if (raw.op === '/') {
      const numerator = args[0];
      const denominator = args[1];
      if (!numerator || !denominator) {
        return null;
      }
      const left = collectProduct(numerator);
      const divisor = constantValue(denominator);
      if (!left || divisor === null || divisor === 0) {
        return null;
      }
      return { coefficient: left.coefficient / divisor, factors: left.factors };
    }
    if (raw.op === '-' && args.length === 1 && args[0]) {
      const inner = collectProduct(args[0]);
      return inner ? { coefficient: -inner.coefficient, factors: inner.factors } : null;
    }
    if (raw.op === '^') {
      // Powers are opaque multiplicative factors; the exponential matcher inspects them.
      return { coefficient: 1, factors: [raw] };
    }
    return null;
  }
  if (raw.type === 'SymbolNode' && raw.name === 'x') {
    return { coefficient: 1, factors: [raw] };
  }
  const constant = constantValue(raw);
  if (constant !== null) {
    return { coefficient: tidy(constant), factors: [] };
  }
  return { coefficient: 1, factors: [raw] };
}

function functionNameOf(node: AstNode): string | null {
  if (node.type !== 'FunctionNode') {
    return null;
  }
  if (typeof node.fn === 'string') {
    return node.fn;
  }
  if (node.fn && typeof node.fn.name === 'string') {
    return node.fn.name;
  }
  return null;
}

interface WaveMatch {
  a: number;
  b: number;
  c: number;
  d: number;
}

function matchWave(node: AstNode, functionName: 'sin' | 'cos'): WaveMatch | null {
  const terms = splitSum(node);
  if (!terms) {
    return null;
  }
  let wave: { coefficient: number; argument: AstNode } | null = null;
  let offset = 0;
  for (const term of terms) {
    const product = collectProduct(term.node);
    if (!product) {
      return null;
    }
    const functionIndex = product.factors.findIndex(
      (factor) => functionNameOf(factor) === functionName,
    );
    if (functionIndex >= 0) {
      if (wave || product.factors.length !== 1) {
        return null;
      }
      const factor = product.factors[functionIndex];
      const args = factor?.args ?? [];
      if (args.length !== 1 || !args[0]) {
        return null;
      }
      wave = { coefficient: term.sign * product.coefficient, argument: args[0] };
    } else {
      const constant = constantValue(term.node);
      if (constant === null) {
        return null;
      }
      offset += term.sign * constant;
    }
  }
  if (!wave || Math.abs(wave.coefficient) < 1e-12) {
    return null;
  }
  const affine = affineOf(wave.argument);
  if (!affine || Math.abs(affine.slope) < 1e-12) {
    return null;
  }
  return {
    a: tidy(wave.coefficient),
    b: affine.slope,
    c: affine.intercept,
    d: tidy(offset),
  };
}

interface ExponentialMatch {
  a: number;
  b: number;
}

function matchExponential(node: AstNode): ExponentialMatch | null {
  const terms = splitSum(node);
  if (!terms || terms.length !== 1) {
    return null;
  }
  const term = terms[0];
  if (!term) {
    return null;
  }
  const product = collectProduct(term.node);
  if (!product || product.factors.length !== 1) {
    return null;
  }
  const power = product.factors[0];
  if (!power || power.type !== 'OperatorNode' || power.op !== '^' || !power.args) {
    return null;
  }
  const baseNode = power.args[0];
  const exponentNode = power.args[1];
  if (!baseNode || !exponentNode) {
    return null;
  }
  const base = constantValue(baseNode);
  if (base === null || base <= 0 || Math.abs(base - 1) < 1e-12) {
    return null;
  }
  const exponent = affineOf(exponentNode);
  if (!exponent || Math.abs(exponent.slope - 1) > 1e-9) {
    return null;
  }
  const coefficient = tidy(term.sign * product.coefficient * Math.pow(base, exponent.intercept));
  if (!Number.isFinite(coefficient) || Math.abs(coefficient) < 1e-12) {
    return null;
  }
  return { a: coefficient, b: tidy(base) };
}

interface LogarithmMatch {
  a: number;
  b: number;
}

function matchLogarithm(node: AstNode): LogarithmMatch | null {
  const terms = splitSum(node);
  if (!terms || terms.length !== 1) {
    return null;
  }
  const term = terms[0];
  if (!term) {
    return null;
  }
  const product = collectProduct(term.node);
  if (!product || product.factors.length !== 1) {
    return null;
  }
  const factor = product.factors[0];
  if (!factor || functionNameOf(factor) !== 'log') {
    return null;
  }
  const args = factor.args ?? [];
  if (args.length !== 2 || !args[0] || !args[1]) {
    return null;
  }
  const argument = affineOf(args[0]);
  if (!argument || Math.abs(argument.slope - 1) > 1e-9 || Math.abs(argument.intercept) > 1e-9) {
    return null;
  }
  const base = constantValue(args[1]);
  if (base === null || base <= 0 || Math.abs(base - 1) < 1e-12) {
    return null;
  }
  const coefficient = tidy(term.sign * product.coefficient);
  if (!Number.isFinite(coefficient) || Math.abs(coefficient) < 1e-12) {
    return null;
  }
  return { a: coefficient, b: tidy(base) };
}

function findShiftBase(node: AstNode): AstNode | null {
  const raw = unwrap(node);
  if (raw.type === 'OperatorNode' && raw.op === '^' && raw.args && raw.args.length === 2) {
    const base = raw.args[0];
    const exponentNode = raw.args[1];
    if (base && exponentNode) {
      const exponent = constantValue(exponentNode);
      const affine = affineOf(base);
      if (exponent === 2 && affine && Math.abs(Math.abs(affine.slope) - 1) < 1e-9) {
        return base;
      }
    }
  }
  for (const child of childrenOf(raw)) {
    const found = findShiftBase(child);
    if (found) {
      return found;
    }
  }
  return null;
}

interface VertexMatch {
  a: number;
  h: number;
  k: number;
}

function matchVertex(node: AstNode, polynomial: Polynomial): VertexMatch | null {
  const a = polynomial.get(2) ?? 0;
  if (Math.abs(a) < 1e-12 || maxDegreeOf(polynomial) !== 2) {
    return null;
  }
  const base = findShiftBase(node);
  if (!base) {
    return null;
  }
  const affine = affineOf(base);
  if (!affine || Math.abs(affine.slope) < 1e-9) {
    return null;
  }
  const h = tidy(-affine.intercept / affine.slope);
  const k = evaluateNode(node, { x: h });
  if (!Number.isFinite(k)) {
    return null;
  }
  for (const probe of [h + Math.PI / 7, h - Math.E / 5]) {
    const actual = evaluateNode(node, { x: probe });
    const expected = a * (probe - h) ** 2 + k;
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > 1e-7 * Math.max(1, Math.abs(expected))) {
      return null;
    }
  }
  return { a: tidy(a), h, k: tidy(k) };
}

function emptyStructure(templateId: TemplateId): LayerStructure {
  return {
    templateId,
    slots: createDefaultSlots(templateId),
    terms: [],
    rawExpression: '',
  };
}

function buildWaveStructure(templateId: 'sine' | 'cosine', match: WaveMatch): LayerStructure {
  return {
    ...emptyStructure(templateId),
    slots: { a: match.a, b: match.b, c: match.c, d: match.d },
  };
}

function buildExponentialStructure(match: ExponentialMatch): LayerStructure {
  return {
    ...emptyStructure('exponential'),
    slots: { a: match.a, b: match.b },
  };
}

function buildLogarithmStructure(match: LogarithmMatch): LayerStructure {
  return {
    ...emptyStructure('logarithm'),
    slots: { a: match.a, b: match.b },
  };
}

function buildVertexStructure(match: VertexMatch): LayerStructure {
  return {
    ...emptyStructure('quadratic-vertex'),
    slots: { a: match.a, h: match.h, k: match.k },
  };
}

function buildLinearStructure(polynomial: Polynomial): LayerStructure {
  return {
    ...emptyStructure('linear'),
    slots: {
      a: tidy(polynomial.get(1) ?? 0),
      b: tidy(polynomial.get(0) ?? 0),
    },
  };
}

function buildQuadraticStructure(polynomial: Polynomial): LayerStructure {
  return {
    ...emptyStructure('quadratic-standard'),
    slots: {
      a: tidy(polynomial.get(2) ?? 0),
      b: tidy(polynomial.get(1) ?? 0),
      c: tidy(polynomial.get(0) ?? 0),
    },
  };
}

function buildPolynomialStructure(polynomial: Polynomial): LayerStructure {
  const degrees = [...polynomial.keys()]
    .filter((degree) => Math.abs(polynomial.get(degree) ?? 0) > 1e-12)
    .sort((left, right) => right - left);
  const terms: PolynomialTerm[] = degrees.map((degree) => ({
    id: createId('term'),
    coefficient: tidy(polynomial.get(degree) ?? 0),
    exponent: degree,
  }));
  if (terms.length === 0) {
    terms.push({ id: createId('term'), coefficient: 0, exponent: 0 });
  }
  return {
    templateId: 'polynomial',
    slots: {},
    terms,
    rawExpression: '',
  };
}

interface Candidate {
  structure: LayerStructure;
  priority: number;
}

function candidatePriority(templateId: TemplateId): number {
  switch (templateId) {
    case 'sine':
    case 'cosine':
      return 1;
    case 'exponential':
    case 'logarithm':
      return 2;
    case 'quadratic-vertex':
      return 3;
    case 'linear':
      return 4;
    case 'quadratic-standard':
      return 5;
    case 'polynomial':
      return 6;
    default:
      return 7;
  }
}

function autoSelect(candidates: readonly Candidate[]): LayerStructure | null {
  if (candidates.length === 0) {
    return null;
  }
  const sorted = [...candidates].sort((left, right) => left.priority - right.priority);
  return sorted[0]?.structure ?? null;
}

function failure(error: string, suggestion: string, position?: number): LatexParseFailure {
  return {
    ok: false,
    error,
    suggestion,
    ...(position === undefined ? {} : { position }),
  };
}

function suggestionForMathError(code: string, message: string, locale: Locale): string {
  if (
    /parenthes|括号/i.test(message) ||
    countCharacters(code, '(') !== countCharacters(code, ')')
  ) {
    return translate(locale, 'latex.suggestionParen');
  }
  if (/不完整|incomplete|缺少|missing/i.test(message)) {
    return translate(locale, 'latex.suggestionIncomplete');
  }
  if (/未知符号|未知函数|unknown symbol|unknown function/i.test(message)) {
    return translate(locale, 'latex.suggestionSymbols');
  }
  return translate(locale, 'latex.suggestionDefault');
}

/**
 * Converts a LaTeX formula into a structured template + slot values.
 * Invalid input returns a failure with a concrete, human readable suggestion.
 */
export function parseLatex(rawLatex: string, options: LatexParseOptions = {}): LatexParseResult {
  const preferred = options.preferredTemplate;
  const locale = options.locale ?? getActiveLocale();
  let normalized: NormalisedLatex;
  try {
    normalized = normaliseLatex(rawLatex, locale);
  } catch (error) {
    if (error instanceof LatexSyntaxError) {
      return failure(error.message, error.suggestion, error.position);
    }
    return failure(translate(locale, 'latex.cannotParse'), translate(locale, 'latex.cannotParseSuggestion'));
  }

  let ast: MathNode;
  try {
    ast = parse(normalized.code);
  } catch (error) {
    const message = describeMathError(error);
    return failure(message, suggestionForMathError(normalized.code, message, locale));
  }
  const root = asAst(ast);

  const symbols = new Set<string>();
  collectSymbols(root, symbols);
  const unknownSymbols = [...symbols].filter((symbol) => !ALLOWED_SYMBOLS.has(symbol));
  if (unknownSymbols.length > 0) {
    return failure(
      translate(locale, 'latex.multiVars', { symbols: joinListFor(locale, unknownSymbols) }),
      translate(locale, 'latex.multiVarsSuggestion'),
    );
  }

  const polynomial = polynomialOf(root);
  const warnings = [...normalized.warnings];
  const rawCandidate: LayerStructure = {
    templateId: 'raw',
    slots: {},
    terms: [],
    rawExpression: normalized.code,
  };

  if (preferred === 'raw') {
    return {
      ok: true,
      structure: rawCandidate,
      expression: normalized.code,
      formula: normalized.code,
      normalizedLatex: normalized.code,
      warnings,
    };
  }

  const candidates: Candidate[] = [];
  const sineMatch = matchWave(root, 'sin');
  if (sineMatch) {
    candidates.push({
      structure: buildWaveStructure('sine', sineMatch),
      priority: candidatePriority('sine'),
    });
  }
  const cosineMatch = matchWave(root, 'cos');
  if (cosineMatch) {
    candidates.push({
      structure: buildWaveStructure('cosine', cosineMatch),
      priority: candidatePriority('cosine'),
    });
  }
  const exponentialMatch = matchExponential(root);
  if (exponentialMatch) {
    candidates.push({
      structure: buildExponentialStructure(exponentialMatch),
      priority: candidatePriority('exponential'),
    });
  }
  const logarithmMatch = matchLogarithm(root);
  if (logarithmMatch) {
    candidates.push({
      structure: buildLogarithmStructure(logarithmMatch),
      priority: candidatePriority('logarithm'),
    });
  }

  if (polynomial) {
    const degree = maxDegreeOf(polynomial);
    const vertexMatch = degree === 2 ? matchVertex(root, polynomial) : null;
    // A bare `x^2` is also technically `(x - 0)^2`; only surface the vertex
    // template when there is a real horizontal shift, unless the user asked for it.
    if (vertexMatch && (Math.abs(vertexMatch.h) > 1e-9 || preferred === 'quadratic-vertex')) {
      candidates.push({
        structure: buildVertexStructure(vertexMatch),
        priority: candidatePriority('quadratic-vertex'),
      });
    }
    if (degree <= 1) {
      candidates.push({
        structure: buildLinearStructure(polynomial),
        priority: candidatePriority('linear'),
      });
    }
    if (degree <= 2) {
      candidates.push({
        structure: buildQuadraticStructure(polynomial),
        priority: candidatePriority('quadratic-standard'),
      });
    }
    candidates.push({
      structure: buildPolynomialStructure(polynomial),
      priority: candidatePriority('polynomial'),
    });
  }

  let chosen: LayerStructure | null = null;
  if (preferred) {
    chosen = candidates.find((candidate) => candidate.structure.templateId === preferred)?.structure ?? null;
  }
  if (!chosen) {
    chosen = autoSelect(candidates);
  }

  if (!chosen) {
    warnings.push(translate(locale, 'latex.rawFallbackWarning'));
    if (containsX(root) === false) {
      warnings.push(translate(locale, 'latex.noXWarning'));
    }
    return {
      ok: true,
      structure: rawCandidate,
      expression: rawCandidate.rawExpression,
      formula: rawCandidate.rawExpression,
      normalizedLatex: normalized.code,
      warnings,
    };
  }

  if (preferred && chosen.templateId !== preferred) {
    warnings.push(
      translate(locale, 'latex.templateSwitchWarning', {
        preferred: templateLabel(preferred, locale),
        chosen: templateLabel(chosen.templateId, locale),
      }),
    );
  }
  if (chosen.templateId === 'quadratic-vertex' && preferred !== 'quadratic-vertex') {
    warnings.push(translate(locale, 'latex.vertexWarning'));
  }
  if (!containsX(root)) {
    warnings.push(translate(locale, 'latex.noXWarning'));
  }
  if (chosen.templateId === 'exponential') {
    const base = chosen.slots.b ?? 0;
    if (base <= 0 || Math.abs(base - 1) < 1e-12) {
      warnings.push(translate(locale, 'latex.expBaseWarning'));
    }
  }
  if (chosen.templateId === 'logarithm') {
    const base = chosen.slots.b ?? 0;
    if (base <= 0 || Math.abs(base - 1) < 1e-12) {
      warnings.push(translate(locale, 'latex.logBaseWarning'));
    }
  }

  return {
    ok: true,
    structure: chosen,
    expression: structureToExpression(chosen),
    formula: structureToFormula(chosen),
    normalizedLatex: normalized.code,
    warnings,
  };
}

/** Applies a parsed structure to a layer-shaped object (used by OCR and the card editor). */
export function structureToLayerPatch(structure: LayerStructure): {
  templateId: TemplateId;
  slots: Record<string, number>;
  terms: PolynomialTerm[];
  rawExpression: string;
  mode: 'slots' | 'raw';
} {
  return {
    templateId: structure.templateId,
    slots: { ...structure.slots },
    terms: structure.terms.map((term) => ({ ...term })),
    rawExpression: structure.rawExpression,
    mode: structure.templateId === 'raw' ? 'raw' : 'slots',
  };
}
