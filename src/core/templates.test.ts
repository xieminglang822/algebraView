import { describe, expect, it } from 'vitest';
import {
  LAYER_COLORS,
  MAX_LAYERS,
  MAX_POLYNOMIAL_DEGREE,
  TEMPLATE_GROUPS,
  createDefaultSlots,
  createLayer,
  nextLayerColor,
  nextLayerLabel,
  normaliseExponent,
  polynomialDisplayTerms,
  polynomialExpressionFromTerms,
  resolveLayerExpression,
  resolveLayerFormula,
  structureToExpression,
} from './templates';
import { compileExpression } from './mathParser';
import type { FunctionLayer, PolynomialTerm } from './types';

function layerWith(overrides: Partial<FunctionLayer>): FunctionLayer {
  return {
    ...createLayer({ label: 'f1', color: LAYER_COLORS[0] }),
    ...overrides,
  };
}

describe('templates', () => {
  it('exposes all eight palette colours and template groups', () => {
    expect(LAYER_COLORS).toHaveLength(MAX_LAYERS);
    expect(new Set(LAYER_COLORS).size).toBe(MAX_LAYERS);
    expect(TEMPLATE_GROUPS.flatMap((group) => group.ids)).toContain('polynomial');
    expect(TEMPLATE_GROUPS.flatMap((group) => group.ids)).toContain('sine');
  });

  it('builds a linear expression that mathjs can evaluate', () => {
    const layer = layerWith({ templateId: 'linear', slots: { a: 2, b: -1 } });
    expect(resolveLayerExpression(layer)).toBe('2*x + (-1)');
    expect(resolveLayerFormula(layer)).toBe('2x − 1');
    expect(compileExpression(resolveLayerExpression(layer)).evaluate(3)).toBeCloseTo(5);
  });

  it('builds the quadratic standard form with default slots', () => {
    const layer = layerWith({ templateId: 'quadratic-standard' });
    expect(createDefaultSlots('quadratic-standard')).toEqual({ a: 1, b: 0, c: -4 });
    expect(resolveLayerFormula(layer)).toBe('x² − 4');
    const compiled = compileExpression(resolveLayerExpression(layer));
    expect(compiled.evaluate(-2)).toBeCloseTo(0);
    expect(compiled.evaluate(2)).toBeCloseTo(0);
    expect(compiled.evaluate(0)).toBeCloseTo(-4);
  });

  it('builds the vertex form', () => {
    const layer = layerWith({ templateId: 'quadratic-vertex', slots: { a: 2, h: 3, k: 1 } });
    expect(resolveLayerExpression(layer)).toBe('2*(x - 3)^2 + 1');
    expect(resolveLayerFormula(layer)).toBe('2(x − 3)² + 1');
    expect(compileExpression(resolveLayerExpression(layer)).evaluate(3)).toBeCloseTo(1);
  });

  it('builds sine / cosine with four slots', () => {
    const sine = layerWith({ templateId: 'sine', slots: { a: 2, b: 3, c: 0, d: 1 } });
    expect(resolveLayerExpression(sine)).toBe('2*sin(3*x + 0) + 1');
    expect(resolveLayerFormula(sine)).toBe('2sin(3x) + 1');
    const compiled = compileExpression(resolveLayerExpression(sine));
    expect(compiled.evaluate(0)).toBeCloseTo(1);
    expect(compiled.evaluate(Math.PI / 6)).toBeCloseTo(3);

    const cosine = layerWith({ templateId: 'cosine', slots: { a: 1, b: 1, c: 0, d: 0 } });
    expect(resolveLayerFormula(cosine)).toBe('cos(x)');
  });

  it('builds exponential and logarithm templates', () => {
    const exponential = layerWith({ templateId: 'exponential', slots: { a: 3, b: 2 } });
    expect(resolveLayerExpression(exponential)).toBe('3*(2)^x');
    expect(resolveLayerFormula(exponential)).toBe('3·2^x');
    expect(compileExpression(resolveLayerExpression(exponential)).evaluate(2)).toBeCloseTo(12);

    const logarithm = layerWith({ templateId: 'logarithm', slots: { a: 2, b: 2 } });
    expect(resolveLayerFormula(logarithm)).toBe('2·log_2(x)');
    expect(compileExpression(resolveLayerExpression(logarithm)).evaluate(8)).toBeCloseTo(6);
  });

  it('formats polynomial terms with unicode superscripts and mathjs syntax', () => {
    const terms: PolynomialTerm[] = [
      { id: 'a', coefficient: 2, exponent: 2 },
      { id: 'b', coefficient: 3, exponent: 1 },
      { id: 'c', coefficient: -4, exponent: 0 },
    ];
    expect(polynomialDisplayTerms(terms)).toBe('2x² + 3x − 4');
    expect(polynomialExpressionFromTerms(terms)).toBe('2*x^2 + 3*x - 4');
    expect(polynomialExpressionFromTerms([{ id: 'zero', coefficient: 0, exponent: 3 }])).toBe('0');
    expect(polynomialExpressionFromTerms([])).toBe('0');
  });

  it('resolves raw layers from their raw expression', () => {
    const layer = layerWith({
      mode: 'raw',
      templateId: 'raw',
      rawExpression: 'sin(x)/x',
      slots: {},
    });
    expect(resolveLayerExpression(layer)).toBe('sin(x)/x');
    expect(resolveLayerFormula(layer)).toBe('sin(x)/x');
  });

  it('normalises exponents into the supported range', () => {
    expect(normaliseExponent(3.6)).toBe(4);
    expect(normaliseExponent(-2)).toBe(0);
    expect(normaliseExponent(Number.NaN)).toBe(0);
    expect(normaliseExponent(99)).toBe(MAX_POLYNOMIAL_DEGREE);
  });

  it('assigns unique colours starting with blue then red', () => {
    const blue = createLayer({ label: 'f1', color: LAYER_COLORS[0] });
    const red = createLayer({ label: 'f2', color: LAYER_COLORS[1] });
    expect(nextLayerColor([blue])).toBe(LAYER_COLORS[1]);
    expect(nextLayerColor([blue, red])).toBe(LAYER_COLORS[2]);

    const full = LAYER_COLORS.map((color, index) =>
      createLayer({ label: `f${index + 1}`, color }),
    );
    expect(nextLayerColor(full)).toBe(LAYER_COLORS[0]);
  });

  it('increments layer labels based on existing names', () => {
    expect(nextLayerLabel([])).toBe('f1');
    expect(
      nextLayerLabel([
        createLayer({ label: 'f1', color: LAYER_COLORS[0] }),
        createLayer({ label: 'f3', color: LAYER_COLORS[1] }),
      ]),
    ).toBe('f4');
  });

  it('maps structures back to expressions', () => {
    expect(
      structureToExpression({
        templateId: 'quadratic-standard',
        slots: { a: 1, b: 0, c: -4 },
        terms: [],
        rawExpression: '',
      }),
    ).toBe('1*x^2 + 0*x + (-4)');
    expect(
      structureToExpression({
        templateId: 'raw',
        slots: {},
        terms: [],
        rawExpression: 'x^3',
      }),
    ).toBe('x^3');
  });
});
