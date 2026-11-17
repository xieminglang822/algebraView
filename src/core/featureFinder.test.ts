import { describe, expect, it } from 'vitest';
import {
  findExtrema,
  findFeatureSet,
  findIntersections,
  findYIntercept,
  findZeros,
} from './featureFinder';
import { compileExpression } from './mathParser';
import type { Viewport } from './types';

const VIEWPORT: Viewport = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };

function closeTo(value: number | undefined, expected: number, precision = 4): void {
  expect(value).toBeDefined();
  expect(value as number).toBeCloseTo(expected, precision);
}

describe('featureFinder / zeros', () => {
  it('finds both roots of x^2 - 4', () => {
    const zeros = findZeros(compileExpression('x^2 - 4'), -10, 10, { samples: 1200 });
    expect(zeros).toHaveLength(2);
    closeTo(zeros[0]?.x, -2);
    closeTo(zeros[1]?.x, 2);
  });

  it('finds a simple linear root', () => {
    const zeros = findZeros(compileExpression('2*x - 1'), -10, 10);
    expect(zeros).toHaveLength(1);
    closeTo(zeros[0]?.x, 0.5);
  });

  it('finds tangent roots without a sign change', () => {
    const zeros = findZeros(compileExpression('x^2'), -10, 10, { samples: 900 });
    expect(zeros.length).toBeGreaterThanOrEqual(1);
    closeTo(zeros[0]?.x, 0, 3);
  });

  it('never fabricates a root at a vertical asymptote', () => {
    expect(findZeros(compileExpression('1/x'), -10, 10)).toHaveLength(0);
    expect(findZeros(compileExpression('tan(x)'), -2, 2)).toHaveLength(1);
  });

  it('respects the requested x range', () => {
    const zeros = findZeros(compileExpression('x^2 - 4'), 0, 10);
    expect(zeros).toHaveLength(1);
    closeTo(zeros[0]?.x, 2);
  });
});

describe('featureFinder / extrema and intercepts', () => {
  it('finds the vertex of x^2 - 4', () => {
    const extrema = findExtrema(compileExpression('x^2 - 4'), -10, 10, { samples: 800 });
    expect(extrema).toHaveLength(1);
    closeTo(extrema[0]?.x, 0, 3);
    closeTo(extrema[0]?.y, -4, 3);
    expect(extrema[0]?.kind).toBe('minimum');
  });

  it('does not report extrema for a monotonic cubic', () => {
    expect(findExtrema(compileExpression('x^3'), -5, 5)).toHaveLength(0);
  });

  it('finds extrema of a sine wave', () => {
    const extrema = findExtrema(compileExpression('sin(x)'), -Math.PI, Math.PI, { samples: 600 });
    expect(extrema).toHaveLength(2);
    const xValues = extrema.map((point) => Number(point.x.toFixed(3))).sort((a, b) => a - b);
    expect(xValues[0]).toBeCloseTo(-Math.PI / 2, 2);
    expect(xValues[1]).toBeCloseTo(Math.PI / 2, 2);
  });

  it('finds the y intercept', () => {
    const intercept = findYIntercept(compileExpression('x^2 - 4'));
    expect(intercept?.x).toBe(0);
    closeTo(intercept?.y, -4);
    expect(findYIntercept(compileExpression('1/x'))).toBeNull();
  });
});

describe('featureFinder / intersections', () => {
  it('finds UC-02 intersections of x^2 - 4 and 2x - 1', () => {
    const points = findIntersections(
      compileExpression('x^2 - 4'),
      compileExpression('2*x - 1'),
      -10,
      10,
    );
    expect(points).toHaveLength(2);
    const sorted = [...points].sort((left, right) => left.x - right.x);
    closeTo(sorted[0]?.x, -1);
    closeTo(sorted[0]?.y, -3);
    closeTo(sorted[1]?.x, 3);
    closeTo(sorted[1]?.y, 5);
  });

  it('returns no intersections for parallel lines', () => {
    const points = findIntersections(compileExpression('x + 1'), compileExpression('x + 2'), -5, 5);
    expect(points).toHaveLength(0);
  });

  it('builds a feature set for the active layer plus intersections', () => {
    const features = findFeatureSet(
      [
        { id: 'quadratic', compiled: compileExpression('x^2 - 4') },
        { id: 'linear', compiled: compileExpression('2*x - 1') },
      ],
      'quadratic',
      VIEWPORT,
    );
    expect(features.some((feature) => feature.kind === 'zero')).toBe(true);
    expect(features.some((feature) => feature.kind === 'extremum')).toBe(true);
    expect(features.some((feature) => feature.kind === 'y-intercept')).toBe(true);
    expect(features.filter((feature) => feature.kind === 'intersection')).toHaveLength(2);
    const intersection = features.find((feature) => feature.kind === 'intersection');
    expect(intersection?.layerIds).toEqual(['quadratic', 'linear']);
  });

  it('hides features outside the viewport', () => {
    const features = findFeatureSet(
      [{ id: 'quadratic', compiled: compileExpression('x^2 - 4') }],
      'quadratic',
      { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
    );
    expect(features).toHaveLength(0);
  });
});
