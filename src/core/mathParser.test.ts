import { beforeEach, describe, expect, it } from 'vitest';
import {
  ExpressionError,
  clearExpressionCache,
  compileExpression,
  sampleExpression,
  validateExpression,
} from './mathParser';

describe('mathParser', () => {
  beforeEach(() => {
    clearExpressionCache();
  });

  it('compiles and evaluates a polynomial', () => {
    const compiled = compileExpression('x^2 - 4');
    expect(compiled.evaluate(-2)).toBeCloseTo(0);
    expect(compiled.evaluate(2)).toBeCloseTo(0);
    expect(compiled.evaluate(3)).toBeCloseTo(5);
  });

  it('returns NaN instead of throwing for undefined points', () => {
    const division = compileExpression('1/x');
    expect(Number.isNaN(division.evaluate(0))).toBe(true);
    expect(division.evaluate(2)).toBeCloseTo(0.5);

    const root = compileExpression('sqrt(x)');
    expect(Number.isNaN(root.evaluate(-1))).toBe(true);
    expect(root.evaluate(9)).toBeCloseTo(3);
  });

  it('returns NaN for complex results', () => {
    const compiled = compileExpression('sqrt(-1)');
    expect(Number.isNaN(compiled.evaluate(0))).toBe(true);
  });

  it('caches compiled expressions by source text', () => {
    const first = compileExpression('sin(x)');
    const second = compileExpression('sin(x)');
    expect(second).toBe(first);
    expect(compileExpression('  sin(x)  ')).toBe(first);
  });

  it('rejects empty input with a helpful error', () => {
    expect(() => compileExpression('   ')).toThrow(ExpressionError);
    expect(() => compileExpression('')).toThrow(/表达式为空/);
  });

  it('rejects syntax errors', () => {
    expect(() => compileExpression('x^')).toThrow(ExpressionError);
    expect(() => compileExpression('x^')).toThrow(/不完整|无法解析/);
  });

  it('rejects unknown variables and assignments', () => {
    expect(() => compileExpression('x + y')).toThrow(/未知符号/);
    expect(() => compileExpression('x + y')).toThrow(/y/);
    expect(() => compileExpression('x = 3')).toThrow(/赋值|方程/);
  });

  it('validates expressions without throwing', () => {
    expect(validateExpression('x^2 - 4')).toEqual({ ok: true, error: null });
    const invalid = validateExpression('x +');
    expect(invalid.ok).toBe(false);
    expect(invalid.error).toBeTruthy();
  });

  it('samples endpoints inclusively', () => {
    const compiled = compileExpression('x^2');
    const samples = sampleExpression(compiled, -2, 2, 9);
    expect(samples).toHaveLength(9);
    expect(samples[0]?.x).toBe(-2);
    expect(samples[8]?.x).toBe(2);
    expect(samples[4]?.y).toBeCloseTo(0);
  });

  it('keeps NaN samples for domain gaps', () => {
    const compiled = compileExpression('log(x)');
    const samples = sampleExpression(compiled, -1, 1, 5);
    expect(samples[0]?.x).toBe(-1);
    expect(Number.isNaN(samples[0]?.y)).toBe(true);
    expect(samples[4]?.y).toBeCloseTo(0);
  });
});
