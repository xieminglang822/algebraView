import type { FeatureLayer } from '../core/featureFinder';
import { sampleShape } from '../core/shapes';
import type { FeaturePoint, Point } from '../core/types';
import { t } from '../i18n/locale';

export type SnapKind = 'curve' | 'shape' | FeaturePoint['kind'];

export interface SnapTarget {
  world: Point;
  screen: Point;
  distance: number;
  kind: SnapKind;
  label: string;
  layerId: string | null;
  layerIds: string[];
}

export interface SnapOptions {
  featureTolerance?: number;
  curveTolerance?: number;
}

function distanceBetween(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

/**
 * Finds the nearest snappable object under the pointer:
 * 1. feature markers (zeros, intercepts, extrema, shape centres/vertices/foci, intersections)
 * 2. a function curve at the pointer's x coordinate, or a shape outline sampled in parameter space
 */
export function findSnapTarget(
  pointerScreen: Point,
  layers: readonly FeatureLayer[],
  features: readonly FeaturePoint[],
  toScreen: (point: Point) => Point,
  toWorldX: (screenX: number) => number,
  options: SnapOptions = {},
): SnapTarget | null {
  const featureTolerance = options.featureTolerance ?? 18;
  const curveTolerance = options.curveTolerance ?? 22;

  let nearestFeature: SnapTarget | null = null;
  for (const feature of features) {
    const screen = toScreen(feature);
    const distance = distanceBetween(pointerScreen, screen);
    if (distance > featureTolerance) {
      continue;
    }
    if (!nearestFeature || distance < nearestFeature.distance - 2) {
      nearestFeature = {
        world: { x: feature.x, y: feature.y },
        screen,
        distance,
        kind: feature.kind,
        label: feature.label,
        layerId: feature.layerIds[0] ?? null,
        layerIds: [...feature.layerIds],
      };
    }
  }
  if (nearestFeature) {
    return nearestFeature;
  }

  const worldX = toWorldX(pointerScreen.x);
  let nearestOutline: SnapTarget | null = null;

  const consider = (world: Point, kind: 'curve' | 'shape', layerId: string): void => {
    const screen = toScreen(world);
    const distance = distanceBetween(pointerScreen, screen);
    if (distance > curveTolerance) {
      return;
    }
    if (!nearestOutline || distance < nearestOutline.distance) {
      nearestOutline = {
        world,
        screen,
        distance,
        kind,
        label: kind === 'curve' ? t('feature.curve') : t('feature.shape'),
        layerId,
        layerIds: [layerId],
      };
    }
  };

  for (const layer of layers) {
    if (layer.kind === 'function') {
      const worldY = layer.compiled.evaluate(worldX);
      if (Number.isFinite(worldY)) {
        consider({ x: worldX, y: worldY }, 'curve', layer.id);
      }
      continue;
    }
    for (const point of sampleShape(layer.shape, 360)) {
      consider(point, 'shape', layer.id);
    }
  }

  return nearestOutline;
}
