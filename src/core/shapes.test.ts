import { describe, expect, it } from 'vitest';
import {
  createShapeLayer,
  normaliseShapeSlotValue,
  sampleShape,
  shapeDefaultSlots,
  shapeFeatures,
  shapeFormula,
  shapeImplicit,
  shapePoint,
  shapeTypeName,
} from './shapes';

function circle(slots: Record<string, number> = {}) {
  return createShapeLayer({
    id: 'circle',
    label: 's1',
    color: '#3B82F6',
    shapeType: 'circle',
    slots: { h: 1, k: 2, r: 3, ...slots },
  });
}

function ellipse(slots: Record<string, number> = {}) {
  return createShapeLayer({
    id: 'ellipse',
    label: 's2',
    color: '#EF4444',
    shapeType: 'ellipse',
    slots: { h: 0, k: 0, a: 4, b: 2, theta: 0, ...slots },
  });
}

describe('shapes / geometry', () => {
  it('generates circle points and a closed sample', () => {
    const shape = circle();
    expect(shapePoint(shape, 0)).toEqual({ x: 4, y: 2 });
    const top = shapePoint(shape, Math.PI / 2);
    expect(top.x).toBeCloseTo(1);
    expect(top.y).toBeCloseTo(5);

    const points = sampleShape(shape, 64);
    expect(points).toHaveLength(65);
    expect(points[0]?.x).toBeCloseTo(points[64]?.x ?? Number.NaN);
    expect(points[0]?.y).toBeCloseTo(points[64]?.y ?? Number.NaN);
  });

  it('rotates ellipse points around the centre', () => {
    const shape = ellipse({ a: 4, b: 2, theta: 90 });
    const point = shapePoint(shape, 0);
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(4);

    const implicit = shapeImplicit(shape, point);
    expect(implicit).toBeCloseTo(0, 8);
    expect(shapeImplicit(shape, { x: 0, y: 0 })).toBeCloseTo(-1);
    expect(shapeImplicit(shape, { x: 10, y: 10 })).toBeGreaterThan(1);
  });

  it('returns centre, vertices and foci for an ellipse', () => {
    const features = shapeFeatures(ellipse({ a: 4, b: 3 }));
    expect(features.filter((feature) => feature.kind === 'center')).toHaveLength(1);
    expect(features.filter((feature) => feature.kind === 'vertex')).toHaveLength(4);
    const foci = features.filter((feature) => feature.kind === 'focus');
    expect(foci).toHaveLength(2);
    const distance = Math.sqrt(4 * 4 - 3 * 3);
    expect(foci[0]?.point.x).toBeCloseTo(distance);
    expect(foci[1]?.point.x).toBeCloseTo(-distance);

    expect(shapeFeatures(circle())).toHaveLength(1);
  });

  it('uses the major axis for foci when b > a', () => {
    const features = shapeFeatures(ellipse({ a: 2, b: 4 }));
    const foci = features.filter((feature) => feature.kind === 'focus');
    expect(foci).toHaveLength(2);
    expect(Math.abs(foci[0]?.point.y ?? 0)).toBeCloseTo(Math.sqrt(16 - 4));
    expect(foci[0]?.point.x).toBeCloseTo(0);
  });

  it('formats circle and rotated ellipse equations', () => {
    expect(shapeFormula(circle({ h: 0, k: 0, r: 3 }), 'en')).toBe('x² + y² = 9');
    const rotated = shapeFormula(
      ellipse({ h: 1, k: -2, a: 4, b: 2, theta: 30 }),
      'en',
    );
    expect(rotated).toContain('center (1, -2)');
    expect(rotated).toContain('θ = 30°');
  });

  it('provides defaults, names and radius clamping', () => {
    expect(shapeDefaultSlots('circle')).toEqual({ h: 0, k: 0, r: 3 });
    expect(shapeDefaultSlots('ellipse')).toEqual({ h: 0, k: 0, a: 3, b: 2, theta: 0 });
    expect(shapeTypeName('circle', 'zh')).toBe('圆');
    expect(shapeTypeName('ellipse', 'en')).toBe('Ellipse');
    expect(normaliseShapeSlotValue('circle', 'r', -1)).toBe(0.1);
    expect(normaliseShapeSlotValue('ellipse', 'a', 0)).toBe(0.1);
    expect(normaliseShapeSlotValue('ellipse', 'theta', 9999)).toBe(3600);
  });
});
