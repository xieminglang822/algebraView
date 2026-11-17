import type { Point, ShapeLayer, ShapeType } from './types';
import { clamp, formatNumber } from './numberFormat';
import { getActiveLocale } from '../i18n/locale';
import { translate, type Locale, type TranslationKey } from '../i18n/messages';

export type ShapeParameterKey = 'h' | 'k' | 'r' | 'a' | 'b' | 'theta';

export interface ShapeParameterDefinition {
  key: ShapeParameterKey;
  labelKey: TranslationKey;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  sliderMin: number;
  sliderMax: number;
}

export interface ShapeTypeDefinition {
  shapeType: ShapeType;
  nameKey: TranslationKey;
  parameters: readonly ShapeParameterDefinition[];
}

export const SHAPE_DEFINITIONS: Record<ShapeType, ShapeTypeDefinition> = {
  circle: {
    shapeType: 'circle',
    nameKey: 'shape.circle.name',
    parameters: [
      {
        key: 'h',
        labelKey: 'shape.param.h',
        defaultValue: 0,
        min: -1e9,
        max: 1e9,
        step: 0.5,
        sliderMin: -10,
        sliderMax: 10,
      },
      {
        key: 'k',
        labelKey: 'shape.param.k',
        defaultValue: 0,
        min: -1e9,
        max: 1e9,
        step: 0.5,
        sliderMin: -10,
        sliderMax: 10,
      },
      {
        key: 'r',
        labelKey: 'shape.param.r',
        defaultValue: 3,
        min: 0.1,
        max: 1e6,
        step: 0.5,
        sliderMin: 0.5,
        sliderMax: 10,
      },
    ],
  },
  ellipse: {
    shapeType: 'ellipse',
    nameKey: 'shape.ellipse.name',
    parameters: [
      {
        key: 'h',
        labelKey: 'shape.param.h',
        defaultValue: 0,
        min: -1e9,
        max: 1e9,
        step: 0.5,
        sliderMin: -10,
        sliderMax: 10,
      },
      {
        key: 'k',
        labelKey: 'shape.param.k',
        defaultValue: 0,
        min: -1e9,
        max: 1e9,
        step: 0.5,
        sliderMin: -10,
        sliderMax: 10,
      },
      {
        key: 'a',
        labelKey: 'shape.param.a',
        defaultValue: 3,
        min: 0.1,
        max: 1e6,
        step: 0.5,
        sliderMin: 0.5,
        sliderMax: 10,
      },
      {
        key: 'b',
        labelKey: 'shape.param.b',
        defaultValue: 2,
        min: 0.1,
        max: 1e6,
        step: 0.5,
        sliderMin: 0.5,
        sliderMax: 10,
      },
      {
        key: 'theta',
        labelKey: 'shape.param.theta',
        defaultValue: 0,
        min: -180,
        max: 180,
        step: 5,
        sliderMin: -180,
        sliderMax: 180,
      },
    ],
  },
};

export function shapeParameters(shapeType: ShapeType): readonly ShapeParameterDefinition[] {
  return SHAPE_DEFINITIONS[shapeType].parameters;
}

export function shapeDefaultSlots(shapeType: ShapeType): Record<string, number> {
  const slots: Record<string, number> = {};
  for (const parameter of shapeParameters(shapeType)) {
    slots[parameter.key] = parameter.defaultValue;
  }
  return slots;
}

export function shapeTypeName(
  shapeType: ShapeType,
  locale: Locale = getActiveLocale(),
): string {
  return translate(locale, SHAPE_DEFINITIONS[shapeType].nameKey);
}

/** Clamps shape parameters to their valid domains (radii must stay positive). */
export function normaliseShapeSlotValue(
  shapeType: ShapeType,
  key: string,
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return shapeDefaultSlots(shapeType)[key] ?? 0;
  }
  if (key === 'r' || key === 'a' || key === 'b') {
    return clamp(value, 0.1, 1e6);
  }
  if (key === 'theta') {
    return clamp(value, -3600, 3600);
  }
  return clamp(value, -1e9, 1e9);
}

export interface CreateShapeLayerOptions {
  id?: string;
  label: string;
  color: string;
  shapeType: ShapeType;
  slots?: Readonly<Record<string, number>>;
}

export function createShapeLayer(options: CreateShapeLayerOptions): ShapeLayer {
  return {
    kind: 'shape',
    id: options.id ?? `shape-${Math.random().toString(36).slice(2, 10)}`,
    label: options.label,
    color: options.color,
    visible: true,
    shapeType: options.shapeType,
    slots: { ...shapeDefaultSlots(options.shapeType), ...options.slots },
  };
}

export function nextShapeLabel(layers: readonly { label: string }[]): string {
  let highest = 0;
  for (const layer of layers) {
    const match = /^s(\d+)$/.exec(layer.label);
    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  }
  return `s${highest + 1}`;
}

/** Point on the circle / rotated ellipse at parameter `t`. */
export function shapePoint(shape: ShapeLayer, t: number): Point {
  const h = shape.slots.h ?? 0;
  const k = shape.slots.k ?? 0;
  const isCircle = shape.shapeType === 'circle';
  const a = isCircle ? (shape.slots.r ?? 1) : (shape.slots.a ?? 1);
  const b = isCircle ? (shape.slots.r ?? 1) : (shape.slots.b ?? 1);
  const theta = isCircle ? 0 : ((shape.slots.theta ?? 0) * Math.PI) / 180;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const localX = a * Math.cos(t);
  const localY = b * Math.sin(t);
  return {
    x: h + localX * cosTheta - localY * sinTheta,
    y: k + localX * sinTheta + localY * cosTheta,
  };
}

/** Samples the closed outline; enough points for smooth rendering and snapping. */
export function sampleShape(shape: ShapeLayer, steps = 256): Point[] {
  const safeSteps = Math.max(24, Math.min(1024, Math.round(steps)));
  const points: Point[] = [];
  for (let index = 0; index <= safeSteps; index += 1) {
    points.push(shapePoint(shape, (index / safeSteps) * Math.PI * 2));
  }
  return points;
}

/**
 * Normalised implicit value: `(x'/a)² + (y'/b)² − 1`, where the point is
 * rotated into the ellipse's local frame. Zero on the outline.
 */
export function shapeImplicit(shape: ShapeLayer, point: Point): number {
  const h = shape.slots.h ?? 0;
  const k = shape.slots.k ?? 0;
  const isCircle = shape.shapeType === 'circle';
  const a = isCircle ? (shape.slots.r ?? 1) : (shape.slots.a ?? 1);
  const b = isCircle ? (shape.slots.r ?? 1) : (shape.slots.b ?? 1);
  const theta = isCircle ? 0 : ((shape.slots.theta ?? 0) * Math.PI) / 180;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const dx = point.x - h;
  const dy = point.y - k;
  const localX = dx * cosTheta + dy * sinTheta;
  const localY = -dx * sinTheta + dy * cosTheta;
  if (a <= 0 || b <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return (localX / a) ** 2 + (localY / b) ** 2 - 1;
}

export interface ShapeFeature {
  point: Point;
  kind: 'center' | 'vertex' | 'focus';
}

function rotateLocal(shape: ShapeLayer, localX: number, localY: number): Point {
  const h = shape.slots.h ?? 0;
  const k = shape.slots.k ?? 0;
  const theta = ((shape.slots.theta ?? 0) * Math.PI) / 180;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  return {
    x: h + localX * cosTheta - localY * sinTheta,
    y: k + localX * sinTheta + localY * cosTheta,
  };
}

/** Centre plus ellipse vertices/foci. A circle only has a centre feature. */
export function shapeFeatures(shape: ShapeLayer): ShapeFeature[] {
  const h = shape.slots.h ?? 0;
  const k = shape.slots.k ?? 0;
  const center: ShapeFeature = { point: { x: h, y: k }, kind: 'center' };
  if (shape.shapeType === 'circle') {
    return [center];
  }
  const a = shape.slots.a ?? 1;
  const b = shape.slots.b ?? 1;
  const features: ShapeFeature[] = [center];
  const vertices: Array<[number, number]> = [
    [a, 0],
    [-a, 0],
    [0, b],
    [0, -b],
  ];
  for (const [localX, localY] of vertices) {
    features.push({ point: rotateLocal(shape, localX, localY), kind: 'vertex' });
  }
  const c = Math.sqrt(Math.max(0, a * a - b * b));
  if (c > 1e-9) {
    features.push({ point: rotateLocal(shape, c, 0), kind: 'focus' });
    features.push({ point: rotateLocal(shape, -c, 0), kind: 'focus' });
  } else if (b * b - a * a > 1e-9) {
    const majorC = Math.sqrt(b * b - a * a);
    features.push({ point: rotateLocal(shape, 0, majorC), kind: 'focus' });
    features.push({ point: rotateLocal(shape, 0, -majorC), kind: 'focus' });
  }
  return features;
}

function centeredVariable(variable: string, center: number): string {
  if (Math.abs(center) < 1e-10) {
    return variable;
  }
  const operator = center < 0 ? '+' : '−';
  return `(${variable} ${operator} ${formatNumber(Math.abs(center))})`;
}

/** Human-readable equation/summary used by shape cards and the legend. */
export function shapeFormula(shape: ShapeLayer, locale: Locale = getActiveLocale()): string {
  const h = shape.slots.h ?? 0;
  const k = shape.slots.k ?? 0;
  if (shape.shapeType === 'circle') {
    const r = shape.slots.r ?? 1;
    return `${centeredVariable('x', h)}² + ${centeredVariable('y', k)}² = ${formatNumber(r * r)}`;
  }
  const a = shape.slots.a ?? 1;
  const b = shape.slots.b ?? 1;
  const theta = shape.slots.theta ?? 0;
  if (Math.abs(theta) < 1e-9) {
    return `${centeredVariable('x', h)}²/${formatNumber(a * a)} + ${centeredVariable('y', k)}²/${formatNumber(b * b)} = 1`;
  }
  return translate(locale, 'shape.formulaRotated', {
    h: formatNumber(h),
    k: formatNumber(k),
    a: formatNumber(a),
    b: formatNumber(b),
    theta: formatNumber(theta),
  });
}
