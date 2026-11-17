import { describe, expect, it } from 'vitest';
import { buildCurveSegments, sampleCurve } from './CurveRenderer';
import { compileExpression } from '../core/mathParser';
import type { SamplePoint } from '../core/mathParser';

function sampleAt(fn: (x: number) => number, start: number, end: number, count: number): SamplePoint[] {
  return Array.from({ length: count }, (_unused, index) => {
    const x = start + ((end - start) * index) / (count - 1);
    return { x, y: fn(x) };
  });
}

function crosses(segment: readonly SamplePoint[], value: number): boolean {
  const xs = segment.map((point) => point.x);
  return Math.min(...xs) < value && Math.max(...xs) > value;
}

describe('CurveRenderer / discontinuity detection', () => {
  it('breaks 1/x at the vertical asymptote', () => {
    const segments = buildCurveSegments(sampleAt((x) => 1 / x, -2, 2, 401), 4);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments.some((segment) => crosses(segment, 0))).toBe(false);
  });

  it('breaks 1/x^2 at the vertical asymptote', () => {
    const segments = buildCurveSegments(sampleAt((x) => 1 / (x * x), -2, 2, 401), 4);
    expect(segments.some((segment) => crosses(segment, 0))).toBe(false);
  });

  it('breaks tan(x) at both asymptotes', () => {
    const segments = buildCurveSegments(sampleAt((x) => Math.tan(x), -3, 3, 1201), 4);
    expect(segments.length).toBeGreaterThanOrEqual(3);
    for (const segment of segments) {
      expect(crosses(segment, -Math.PI / 2)).toBe(false);
      expect(crosses(segment, Math.PI / 2)).toBe(false);
    }
  });

  it('keeps a continuous parabola in a single segment', () => {
    const segments = buildCurveSegments(sampleAt((x) => x * x, -2, 2, 200), 4);
    expect(segments).toHaveLength(1);
  });

  it('keeps steep-but-continuous lines connected', () => {
    const segments = buildCurveSegments(sampleAt((x) => 1000 * x, -1, 1, 200), 20);
    expect(segments).toHaveLength(1);
  });

  it('stops at domain gaps like sqrt(x)', () => {
    const segments = buildCurveSegments(sampleAt((x) => Math.sqrt(x), -2, 2, 200), 4);
    expect(segments.length).toBeGreaterThan(0);
    for (const point of segments.flat()) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(point.y)).toBe(false);
    }
  });

  it('samples and segments a compiled expression', () => {
    const segments = sampleCurve(
      compileExpression('1/x'),
      { xMin: -2, xMax: 2, yMin: -4, yMax: 4 },
      { width: 400, height: 300 },
    );
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments.some((segment) => crosses(segment, 0))).toBe(false);
  });
});
