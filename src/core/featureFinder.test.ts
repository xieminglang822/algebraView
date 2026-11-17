import { describe, expect, it } from 'vitest';
import {
  findExtrema,
  findFeatureSet,
  findFunctionShapeIntersections,
  findIntersections,
  findShapeShapeIntersections,
  findYIntercept,
  findZeros,
} from './featureFinder';
import { compileExpression } from './mathParser';
import { createShapeLayer, shapeImplicit } from './shapes';
import type { ShapeLayer, Viewport } from './types';

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
        { kind: 'function', id: 'quadratic', compiled: compileExpression('x^2 - 4') },
        { kind: 'function', id: 'linear', compiled: compileExpression('2*x - 1') },
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
      [{ kind: 'function', id: 'quadratic', compiled: compileExpression('x^2 - 4') }],
      'quadratic',
      { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
    );
    expect(features).toHaveLength(0);
  });
});

function circleShape(slots: Record<string, number> = {}): ShapeLayer {
  return createShapeLayer({
    id: 'circle',
    label: 's1',
    color: '#3B82F6',
    shapeType: 'circle',
    slots: { h: 0, k: 0, r: 2, ...slots },
  });
}

function ellipseShape(slots: Record<string, number> = {}): ShapeLayer {
  return createShapeLayer({
    id: 'ellipse',
    label: 's2',
    color: '#EF4444',
    shapeType: 'ellipse',
    slots: { h: 0, k: 0, a: 4, b: 2, theta: 0, ...slots },
  });
}

describe('featureFinder / shape intersections', () => {
  it('intersects a circle with a line', () => {
    const points = findFunctionShapeIntersections(
      compileExpression('x'),
      circleShape(),
      VIEWPORT,
    );
    expect(points).toHaveLength(2);
    const sorted = [...points].sort((left, right) => left.x - right.x);
    expect(sorted[0]?.x).toBeCloseTo(-Math.SQRT2, 3);
    expect(sorted[0]?.y).toBeCloseTo(-Math.SQRT2, 3);
    expect(sorted[1]?.x).toBeCloseTo(Math.SQRT2, 3);
    expect(sorted[1]?.y).toBeCloseTo(Math.SQRT2, 3);
  });

  it('intersects a rotated ellipse with the x-axis', () => {
    const ellipse = ellipseShape({ theta: 45 });
    const points = findFunctionShapeIntersections(compileExpression('0'), ellipse, VIEWPORT);
    expect(points).toHaveLength(2);
    for (const point of points) {
      expect(point.y).toBeCloseTo(0, 4);
      expect(Math.abs(shapeImplicit(ellipse, point))).toBeLessThan(1e-4);
    }
  });

  it('intersects two shapes', () => {
    const circle = circleShape({ r: 2 });
    const ellipse = ellipseShape({ a: 3, b: 1 });
    const points = findShapeShapeIntersections(circle, ellipse, VIEWPORT);
    expect(points).toHaveLength(4);
    for (const point of points) {
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(2, 3);
      expect(Math.abs(shapeImplicit(ellipse, point))).toBeLessThan(1e-4);
    }
  });

  it('does not report intersections between a shape and itself', () => {
    const shape = circleShape();
    expect(findShapeShapeIntersections(shape, shape, VIEWPORT)).toHaveLength(0);
  });

  it('includes shape features and mixed intersections in the feature set', () => {
    const features = findFeatureSet(
      [
        { kind: 'function', id: 'line', compiled: compileExpression('x') },
        { kind: 'shape', id: 'circle', shape: circleShape() },
      ],
      'circle',
      VIEWPORT,
    );
    expect(features.some((feature) => feature.kind === 'center')).toBe(true);
    expect(features.filter((feature) => feature.kind === 'intersection')).toHaveLength(2);
    const center = features.find((feature) => feature.kind === 'center');
    expect(center?.layerIds).toEqual(['circle']);
  });
});
