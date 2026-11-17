import { describe, expect, it } from 'vitest';
import { normaliseLatex, parseLatex, structureToLayerPatch } from './latexParser';
import type { LatexParseSuccess } from './latexParser';

function expectSuccess(result: ReturnType<typeof parseLatex>): LatexParseSuccess {
  if (!result.ok) {
    throw new Error(`expected success, got failure: ${result.error} / ${result.suggestion}`);
  }
  return result;
}

function slotValues(result: LatexParseSuccess): Record<string, number> {
  return result.structure.slots;
}

describe('latexParser / normalisation', () => {
  it('normalises implicit multiplication and commands', () => {
    expect(normaliseLatex('y = 2\\sin(x) + 1').code).toBe('2*sin(x) + 1');
    expect(normaliseLatex('2x^2').code).toBe('2*x^2');
    expect(normaliseLatex('\\frac{1}{2}x^2').code).toBe('((1)/(2))*x^2');
    expect(normaliseLatex('2\\log_{2}(x)').code).toBe('2*log(x, 2)');
    expect(normaliseLatex('\\sqrt[3]{x}').code).toBe('(x)^(1/(3))');
  });

  it('accepts unicode maths input', () => {
    expect(normaliseLatex('y = −2x² + 3').code).toBe('-2*x^2 + 3');
    expect(normaliseLatex('2πx').code).toBe('2*pi*x');
  });

  it('reports unbalanced braces with a repair hint', () => {
    const result = parseLatex('y = \\frac{1}{2');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/花括号不配对/);
      expect(result.suggestion).toMatch(/补上/);
    }
  });

  it('rejects unknown LaTeX commands', () => {
    const result = parseLatex('\\foobar(x)');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/不支持的命令/);
      expect(result.suggestion).toMatch(/\\sin/);
    }
  });

  it('rejects multiple equations and extra variables', () => {
    const equation = parseLatex('y = 2x = 3');
    expect(equation.ok).toBe(false);
    if (!equation.ok) {
      expect(equation.error).toMatch(/等号/);
    }

    const extraVariable = parseLatex('x + t');
    expect(extraVariable.ok).toBe(false);
    if (!extraVariable.ok) {
      expect(extraVariable.error).toMatch(/t/);
    }
  });

  it('rejects incomplete expressions with a suggestion', () => {
    const result = parseLatex('y = 2x +');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.suggestion.length).toBeGreaterThan(0);
    }
  });
});

describe('latexParser / template mapping', () => {
  it('maps UC-03: 2sin(x) + 1 to four sine slots', () => {
    const result = expectSuccess(parseLatex('y = 2\\sin(x) + 1'));
    expect(result.structure.templateId).toBe('sine');
    expect(slotValues(result)).toEqual({ a: 2, b: 1, c: 0, d: 1 });
    expect(result.expression).toBe('2*sin(1*x + 0) + 1');
  });

  it('maps phase-shifted sine with a fraction argument', () => {
    const result = expectSuccess(parseLatex('y = 2\\sin(3x - \\frac{\\pi}{2}) + 1'));
    expect(result.structure.templateId).toBe('sine');
    expect(slotValues(result).a).toBeCloseTo(2);
    expect(slotValues(result).b).toBeCloseTo(3);
    expect(slotValues(result).c).toBeCloseTo(-Math.PI / 2);
    expect(slotValues(result).d).toBeCloseTo(1);
  });

  it('maps UC-01: x^2 - 4 to the quadratic standard form', () => {
    const result = expectSuccess(parseLatex('x^2 - 4'));
    expect(result.structure.templateId).toBe('quadratic-standard');
    expect(slotValues(result)).toEqual({ a: 1, b: 0, c: -4 });
  });

  it('maps 2x^2 - 3x + 1 to quadratic slots', () => {
    const result = expectSuccess(parseLatex('2x^2 - 3x + 1'));
    expect(result.structure.templateId).toBe('quadratic-standard');
    expect(slotValues(result)).toEqual({ a: 2, b: -3, c: 1 });
  });

  it('maps vertex form with a real horizontal shift', () => {
    const result = expectSuccess(parseLatex('y = 2(x - 3)^2 + 1'));
    expect(result.structure.templateId).toBe('quadratic-vertex');
    expect(slotValues(result)).toEqual({ a: 2, h: 3, k: 1 });
  });

  it('respects an explicitly selected template', () => {
    const result = expectSuccess(
      parseLatex('2(x - 3)^2 + 1', { preferredTemplate: 'quadratic-standard' }),
    );
    expect(result.structure.templateId).toBe('quadratic-standard');
    expect(slotValues(result).a).toBe(2);
    expect(slotValues(result).b).toBeCloseTo(-12);
    expect(slotValues(result).c).toBeCloseTo(19);
  });

  it('falls back and warns when the preferred template cannot express the formula', () => {
    const result = expectSuccess(parseLatex('x^2 - 4', { preferredTemplate: 'linear' }));
    expect(result.structure.templateId).toBe('quadratic-standard');
    expect(result.warnings.join(' ')).toMatch(/自动切换/);
  });

  it('maps fractions and negative coefficients', () => {
    const result = expectSuccess(parseLatex('y = -\\frac{1}{2}x^2'));
    expect(result.structure.templateId).toBe('quadratic-standard');
    expect(slotValues(result).a).toBeCloseTo(-0.5);
  });

  it('maps linear functions and constants', () => {
    const linear = expectSuccess(parseLatex('2x - 7'));
    expect(linear.structure.templateId).toBe('linear');
    expect(slotValues(linear)).toEqual({ a: 2, b: -7 });

    const constant = expectSuccess(parseLatex('5'));
    expect(constant.structure.templateId).toBe('linear');
    expect(slotValues(constant)).toEqual({ a: 0, b: 5 });
  });

  it('maps polynomials with three or more terms', () => {
    const result = expectSuccess(parseLatex('x^3 - 2x + 1'));
    expect(result.structure.templateId).toBe('polynomial');
    const terms = [...result.structure.terms].sort((left, right) => right.exponent - left.exponent);
    expect(terms.map((term) => term.exponent)).toEqual([3, 1, 0]);
    expect(terms.map((term) => term.coefficient)).toEqual([1, -2, 1]);
  });

  it('maps exponential form', () => {
    const result = expectSuccess(parseLatex('y = 3 \\cdot 2^x'));
    expect(result.structure.templateId).toBe('exponential');
    expect(slotValues(result)).toEqual({ a: 3, b: 2 });
  });

  it('maps logarithm with an explicit base', () => {
    const result = expectSuccess(parseLatex('y = 2\\log_{2}(x)'));
    expect(result.structure.templateId).toBe('logarithm');
    expect(slotValues(result)).toEqual({ a: 2, b: 2 });
  });

  it('falls back to raw expression mode when no template matches', () => {
    const result = expectSuccess(parseLatex('x^x'));
    expect(result.structure.templateId).toBe('raw');
    expect(result.warnings.join(' ')).toMatch(/自由表达式/);
  });

  it('applies a parsed structure to a layer patch', () => {
    const result = expectSuccess(parseLatex('2(x - 3)^2 + 1'));
    const patch = structureToLayerPatch(result.structure);
    expect(patch.mode).toBe('slots');
    expect(patch.templateId).toBe('quadratic-vertex');
    expect(patch.slots).toEqual({ a: 2, h: 3, k: 1 });
  });
});
