import type { CompiledExpression } from './mathParser';
import { shapeFeatures, shapeImplicit, shapePoint } from './shapes';
import type { FeaturePoint, Point, ShapeLayer, Viewport } from './types';
import { getActiveLocale } from '../i18n/locale';
import { translate, type Locale } from '../i18n/messages';

export interface FindOptions {
  samples?: number;
  maxResults?: number;
}

export interface ExtremumPoint extends Point {
  kind: 'minimum' | 'maximum';
}

const DEFAULT_SAMPLES = 900;
const MAX_FEATURES = 60;
const ZERO_TOLERANCE = 1e-9;

function signOf(value: number): -1 | 0 | 1 {
  if (value > 0) {
    return 1;
  }
  if (value < 0) {
    return -1;
  }
  return 0;
}

function dedupeByX(points: readonly Point[], tolerance: number): Point[] {
  const sorted = [...points].sort((left, right) => left.x - right.x);
  const result: Point[] = [];
  for (const point of sorted) {
    const previous = result[result.length - 1];
    if (!previous || Math.abs(point.x - previous.x) > tolerance) {
      result.push(point);
    }
  }
  return result;
}

function bisectRoot(
  fn: CompiledExpression,
  left: number,
  right: number,
): number | null {
  let low = left;
  let high = right;
  let lowValue = fn.evaluate(low);
  let highValue = fn.evaluate(high);
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue)) {
    return null;
  }
  if (Math.abs(lowValue) < ZERO_TOLERANCE) {
    return low;
  }
  if (Math.abs(highValue) < ZERO_TOLERANCE) {
    return high;
  }
  if (signOf(lowValue) === signOf(highValue)) {
    return null;
  }
  for (let iteration = 0; iteration < 90; iteration += 1) {
    const middle = (low + high) / 2;
    const middleValue = fn.evaluate(middle);
    if (!Number.isFinite(middleValue)) {
      return null;
    }
    if (middleValue === 0) {
      return middle;
    }
    if (signOf(middleValue) === signOf(lowValue)) {
      low = middle;
      lowValue = middleValue;
    } else {
      high = middle;
      highValue = middleValue;
    }
  }
  const candidate = (low + high) / 2;
  const value = fn.evaluate(candidate);
  if (Number.isFinite(value) && Math.abs(value) < 1e-6) {
    return candidate;
  }
  return null;
}

function minimiseAbsolute(
  fn: CompiledExpression,
  left: number,
  right: number,
): number | null {
  const goldenRatio = (Math.sqrt(5) - 1) / 2;
  let low = left;
  let high = right;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const first = high - goldenRatio * (high - low);
    const second = low + goldenRatio * (high - low);
    const firstValue = Math.abs(fn.evaluate(first));
    const secondValue = Math.abs(fn.evaluate(second));
    if (!Number.isFinite(firstValue) || !Number.isFinite(secondValue)) {
      return null;
    }
    if (firstValue < secondValue) {
      high = second;
    } else {
      low = first;
    }
  }
  const candidate = (low + high) / 2;
  const value = fn.evaluate(candidate);
  return Number.isFinite(value) && Math.abs(value) < 1e-7 ? candidate : null;
}

/**
 * Numeric x-intercepts of a function inside `[xMin, xMax]`.
 * Handles sign changes and tangent (double) roots, and refuses to fabricate
 * roots at vertical asymptotes.
 */
export function findZeros(
  fn: CompiledExpression,
  xMin: number,
  xMax: number,
  options: FindOptions = {},
): Point[] {
  if (!(xMax > xMin)) {
    return [];
  }
  const samples = Math.min(4000, Math.max(40, options.samples ?? DEFAULT_SAMPLES));
  const span = xMax - xMin;
  const step = span / (samples - 1);
  const tolerance = step * 1.5;
  const maxResults = Math.min(80, options.maxResults ?? 40);
  const candidates: Point[] = [];

  let previous: Point | null = null;
  let beforePrevious: Point | null = null;

  for (let index = 0; index < samples; index += 1) {
    const x = index === samples - 1 ? xMax : xMin + step * index;
    const y = fn.evaluate(x);
    const current: Point = { x, y };
    if (!Number.isFinite(y)) {
      previous = null;
      beforePrevious = null;
      continue;
    }
    if (Math.abs(y) < ZERO_TOLERANCE) {
      candidates.push({ x, y: 0 });
    }
    if (previous && beforePrevious) {
      const previousMagnitude = Math.abs(previous.y);
      const beforeMagnitude = Math.abs(beforePrevious.y);
      const currentMagnitude = Math.abs(y);
      const neighbourhoodPeak = Math.max(beforeMagnitude, currentMagnitude);
      if (
        previousMagnitude <= beforeMagnitude &&
        previousMagnitude <= currentMagnitude &&
        previousMagnitude < 1e-3 &&
        previousMagnitude < neighbourhoodPeak * 0.5
      ) {
        const root = minimiseAbsolute(fn, beforePrevious.x, x);
        if (root !== null) {
          candidates.push({ x: root, y: 0 });
        }
      }
    }
    if (previous) {
      const previousSign = signOf(previous.y);
      const currentSign = signOf(y);
      if (previousSign !== 0 && currentSign !== 0 && previousSign !== currentSign) {
        const root = bisectRoot(fn, previous.x, x);
        if (root !== null) {
          candidates.push({ x: root, y: 0 });
        }
      }
    }
    beforePrevious = previous;
    previous = current;
  }

  return dedupeByX(candidates, tolerance)
    .filter((point) => Number.isFinite(point.x) && Math.abs(point.x) < 1e7)
    .slice(0, maxResults);
}

function numericDerivative(fn: CompiledExpression, x: number): number {
  const h = 1e-5 * Math.max(1, Math.abs(x));
  const before = fn.evaluate(x - h);
  const after = fn.evaluate(x + h);
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    return Number.NaN;
  }
  return (after - before) / (2 * h);
}

function bisectDerivative(
  fn: CompiledExpression,
  left: number,
  right: number,
): number | null {
  let low = left;
  let high = right;
  let lowValue = numericDerivative(fn, low);
  let highValue = numericDerivative(fn, high);
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue)) {
    return null;
  }
  for (let iteration = 0; iteration < 70; iteration += 1) {
    const middle = (low + high) / 2;
    const middleValue = numericDerivative(fn, middle);
    if (!Number.isFinite(middleValue)) {
      return null;
    }
    if (middleValue === 0) {
      return middle;
    }
    if (signOf(middleValue) === signOf(lowValue)) {
      low = middle;
      lowValue = middleValue;
    } else {
      high = middle;
      highValue = middleValue;
    }
  }
  const candidate = (low + high) / 2;
  const derivative = numericDerivative(fn, candidate);
  return Number.isFinite(derivative) && Math.abs(derivative) < 1e-3 ? candidate : null;
}

function classifyExtremum(
  fn: CompiledExpression,
  x: number,
  y: number,
  span: number,
): 'minimum' | 'maximum' | null {
  const delta = Math.max(1e-4, span * 1e-5);
  const left = fn.evaluate(x - delta);
  const right = fn.evaluate(x + delta);
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return null;
  }
  const margin = 1e-9 * Math.max(1, Math.abs(y));
  if (y < left - margin && y < right - margin) {
    return 'minimum';
  }
  if (y > left + margin && y > right + margin) {
    return 'maximum';
  }
  return null;
}

/** Local minima / maxima detected from sign changes of the numeric derivative. */
export function findExtrema(
  fn: CompiledExpression,
  xMin: number,
  xMax: number,
  options: FindOptions = {},
): ExtremumPoint[] {
  if (!(xMax > xMin)) {
    return [];
  }
  const samples = Math.min(3000, Math.max(60, options.samples ?? 800));
  const span = xMax - xMin;
  const step = span / (samples - 1);
  const maxResults = Math.min(40, options.maxResults ?? 20);
  const results: ExtremumPoint[] = [];

  let previousX = Number.NaN;
  let previousDerivative = Number.NaN;

  for (let index = 0; index < samples; index += 1) {
    const x = index === samples - 1 ? xMax : xMin + step * index;
    const derivative = numericDerivative(fn, x);
    if (!Number.isFinite(derivative)) {
      previousDerivative = Number.NaN;
      continue;
    }
    if (
      Number.isFinite(previousDerivative) &&
      signOf(previousDerivative) !== 0 &&
      signOf(derivative) !== 0 &&
      signOf(previousDerivative) !== signOf(derivative)
    ) {
      const candidate = bisectDerivative(fn, previousX, x);
      if (candidate !== null) {
        const y = fn.evaluate(candidate);
        if (Number.isFinite(y)) {
          const kind = classifyExtremum(fn, candidate, y, span);
          if (kind) {
            results.push({ x: candidate, y, kind });
          }
        }
      }
    }
    previousX = x;
    previousDerivative = derivative;
  }

  const deduped: ExtremumPoint[] = [];
  for (const result of [...results].sort((left, right) => left.x - right.x)) {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.abs(previous.x - result.x) > step * 2) {
      deduped.push(result);
    }
  }
  return deduped.slice(0, maxResults);
}

export function findYIntercept(fn: CompiledExpression): Point | null {
  const y = fn.evaluate(0);
  return Number.isFinite(y) ? { x: 0, y } : null;
}

function difference(left: CompiledExpression, right: CompiledExpression): CompiledExpression {
  return {
    expression: `${left.expression} - (${right.expression})`,
    evaluate(x: number): number {
      const leftValue = left.evaluate(x);
      const rightValue = right.evaluate(x);
      if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
        return Number.NaN;
      }
      return leftValue - rightValue;
    },
  };
}

/** Numeric intersections of two curves inside the x-range. */
export function findIntersections(
  left: CompiledExpression,
  right: CompiledExpression,
  xMin: number,
  xMax: number,
  options: FindOptions = {},
): Point[] {
  const roots = findZeros(difference(left, right), xMin, xMax, {
    samples: Math.max(options.samples ?? DEFAULT_SAMPLES, 1200),
    maxResults: options.maxResults ?? 20,
  });
  const intersections: Point[] = [];
  for (const root of roots) {
    const y = left.evaluate(root.x);
    if (!Number.isFinite(y)) {
      continue;
    }
    intersections.push({ x: root.x, y });
  }
  return intersections;
}

function isVisible(point: Point, viewport: Viewport, marginFraction = 0.02): boolean {
  const xMargin = (viewport.xMax - viewport.xMin) * marginFraction;
  const yMargin = (viewport.yMax - viewport.yMin) * marginFraction;
  return (
    point.x >= viewport.xMin - xMargin &&
    point.x <= viewport.xMax + xMargin &&
    point.y >= viewport.yMin - yMargin &&
    point.y <= viewport.yMax + yMargin
  );
}

export type FeatureLayer =
  | { kind: 'function'; id: string; compiled: CompiledExpression }
  | { kind: 'shape'; id: string; shape: ShapeLayer };

function functionFeaturesForLayer(
  layer: Extract<FeatureLayer, { kind: 'function' }>,
  viewport: Viewport,
  locale: Locale,
): FeaturePoint[] {
  const features: FeaturePoint[] = [];
  const zeros = findZeros(layer.compiled, viewport.xMin, viewport.xMax, {
    samples: 1200,
    maxResults: 30,
  });
  for (const zero of zeros) {
    if (isVisible(zero, viewport)) {
      features.push({
        x: zero.x,
        y: zero.y,
        kind: 'zero',
        label: translate(locale, 'feature.zero'),
        layerIds: [layer.id],
      });
    }
  }

  const intercept = findYIntercept(layer.compiled);
  if (intercept && isVisible(intercept, viewport)) {
    features.push({
      x: intercept.x,
      y: intercept.y,
      kind: 'y-intercept',
      label: translate(locale, 'feature.yIntercept'),
      layerIds: [layer.id],
    });
  }

  const extrema = findExtrema(layer.compiled, viewport.xMin, viewport.xMax, {
    samples: 1000,
    maxResults: 12,
  });
  for (const extremum of extrema) {
    if (isVisible(extremum, viewport)) {
      features.push({
        x: extremum.x,
        y: extremum.y,
        kind: 'extremum',
        label:
          extremum.kind === 'minimum'
            ? translate(locale, 'feature.minimum')
            : translate(locale, 'feature.maximum'),
        layerIds: [layer.id],
      });
    }
  }

  return features;
}

function shapeFeaturesForLayer(
  layer: Extract<FeatureLayer, { kind: 'shape' }>,
  viewport: Viewport,
  locale: Locale,
): FeaturePoint[] {
  return shapeFeatures(layer.shape)
    .filter((feature) => isVisible(feature.point, viewport))
    .map((feature) => ({
      x: feature.point.x,
      y: feature.point.y,
      kind: feature.kind,
      label:
        feature.kind === 'center'
          ? translate(locale, 'feature.center')
          : feature.kind === 'vertex'
            ? translate(locale, 'feature.vertex')
            : translate(locale, 'feature.focus'),
      layerIds: [layer.id],
    }));
}

const PARAMETER_MIN = 0;
const PARAMETER_MAX = Math.PI * 2;
const PARAMETER_SAMPLES = 1800;

function parameterFunction(evaluate: (t: number) => number): CompiledExpression {
  return { expression: 'shape-intersection', evaluate };
}

function dedupePoints(points: readonly Point[], tolerance: number): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    if (
      !result.some(
        (candidate) =>
          Math.abs(candidate.x - point.x) <= tolerance &&
          Math.abs(candidate.y - point.y) <= tolerance,
      )
    ) {
      result.push(point);
    }
  }
  return result;
}

/** Function × shape: roots of `shapeY(t) − f(shapeX(t))` over one full turn. */
export function findFunctionShapeIntersections(
  fn: CompiledExpression,
  shape: ShapeLayer,
  viewport: Viewport,
  options: FindOptions = {},
): Point[] {
  const scale = Math.max(1, viewport.xMax - viewport.xMin, viewport.yMax - viewport.yMin);
  const scalar = parameterFunction((t) => {
    const point = shapePoint(shape, t);
    const functionY = fn.evaluate(point.x);
    if (!Number.isFinite(functionY)) {
      return Number.NaN;
    }
    return point.y - functionY;
  });
  const roots = findZeros(scalar, PARAMETER_MIN, PARAMETER_MAX, {
    samples: Math.max(options.samples ?? PARAMETER_SAMPLES, 900),
    maxResults: options.maxResults ?? 24,
  });
  const points: Point[] = [];
  for (const root of roots) {
    const point = shapePoint(shape, root.x);
    const functionY = fn.evaluate(point.x);
    if (
      Number.isFinite(functionY) &&
      Math.abs(functionY - point.y) <= scale * 1e-6 &&
      isVisible(point, viewport)
    ) {
      points.push(point);
    }
  }
  return dedupePoints(points, scale * 1e-6);
}

/** Shape × shape: roots of shape B's implicit equation along shape A's outline. */
export function findShapeShapeIntersections(
  left: ShapeLayer,
  right: ShapeLayer,
  viewport: Viewport,
  options: FindOptions = {},
): Point[] {
  if (left.id === right.id) {
    return [];
  }
  const scale = Math.max(1, viewport.xMax - viewport.xMin, viewport.yMax - viewport.yMin);
  const scalar = parameterFunction((t) => shapeImplicit(right, shapePoint(left, t)));
  const roots = findZeros(scalar, PARAMETER_MIN, PARAMETER_MAX, {
    samples: Math.max(options.samples ?? PARAMETER_SAMPLES, 900),
    maxResults: options.maxResults ?? 24,
  });
  const points: Point[] = [];
  for (const root of roots) {
    const point = shapePoint(left, root.x);
    if (
      Number.isFinite(shapeImplicit(right, point)) &&
      Math.abs(shapeImplicit(right, point)) <= 1e-4 &&
      isVisible(point, viewport)
    ) {
      points.push(point);
    }
  }
  return dedupePoints(points, scale * 1e-6);
}

function findPairIntersections(
  left: FeatureLayer,
  right: FeatureLayer,
  viewport: Viewport,
): Point[] {
  if (left.kind === 'function' && right.kind === 'function') {
    return findIntersections(left.compiled, right.compiled, viewport.xMin, viewport.xMax, {
      samples: 1600,
      maxResults: 16,
    });
  }
  if (left.kind === 'function' && right.kind === 'shape') {
    return findFunctionShapeIntersections(left.compiled, right.shape, viewport);
  }
  if (left.kind === 'shape' && right.kind === 'function') {
    return findFunctionShapeIntersections(right.compiled, left.shape, viewport);
  }
  if (left.kind === 'shape' && right.kind === 'shape') {
    return findShapeShapeIntersections(left.shape, right.shape, viewport);
  }
  return [];
}

/** Intersections between every visible pair, merged when three layers meet. */
export function findIntersectionFeatures(
  layers: readonly FeatureLayer[],
  viewport: Viewport,
  locale: Locale = getActiveLocale(),
): FeaturePoint[] {
  const intersections: FeaturePoint[] = [];
  const xTolerance = (viewport.xMax - viewport.xMin) * 1e-3;
  const yTolerance = (viewport.yMax - viewport.yMin) * 1e-3;

  for (let leftIndex = 0; leftIndex < layers.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < layers.length; rightIndex += 1) {
      const leftLayer = layers[leftIndex];
      const rightLayer = layers[rightIndex];
      if (!leftLayer || !rightLayer) {
        continue;
      }
      const points = findPairIntersections(leftLayer, rightLayer, viewport);
      for (const point of points) {
        if (!isVisible(point, viewport)) {
          continue;
        }
        const existing = intersections.find(
          (candidate) =>
            Math.abs(candidate.x - point.x) <= xTolerance &&
            Math.abs(candidate.y - point.y) <= yTolerance,
        );
        if (existing) {
          for (const id of [leftLayer.id, rightLayer.id]) {
            if (!existing.layerIds.includes(id)) {
              existing.layerIds.push(id);
            }
          }
        } else {
          intersections.push({
            x: point.x,
            y: point.y,
            kind: 'intersection',
            label: translate(locale, 'feature.intersection'),
            layerIds: [leftLayer.id, rightLayer.id],
          });
        }
      }
    }
  }

  return intersections.slice(0, 30);
}

/**
 * Feature points for the active layer plus all pairwise intersections.
 * Intended to be called from a debounced hook, never directly per animation frame.
 */
export function findFeatureSet(
  layers: readonly FeatureLayer[],
  activeLayerId: string | null,
  viewport: Viewport,
  locale: Locale = getActiveLocale(),
): FeaturePoint[] {
  const active = layers.find((layer) => layer.id === activeLayerId) ?? null;
  const layerFeatures = !active
    ? []
    : active.kind === 'function'
      ? functionFeaturesForLayer(active, viewport, locale)
      : shapeFeaturesForLayer(active, viewport, locale);
  const intersections = findIntersectionFeatures(layers, viewport, locale);
  return [...layerFeatures, ...intersections].slice(0, MAX_FEATURES);
}
