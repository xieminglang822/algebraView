import type { FeatureLayer } from '../core/featureFinder';
import type { FeaturePoint, Point } from '../core/types';
import { t } from '../i18n/locale';

export type SnapKind = 'curve' | FeaturePoint['kind'];

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
 * 1. algebraic feature markers (zeros / intercepts / extrema / intersections)
 * 2. the curve itself, sampled at the pointer's x coordinate
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
  let nearestCurve: SnapTarget | null = null;
  for (const layer of layers) {
    const worldY = layer.compiled.evaluate(worldX);
    if (!Number.isFinite(worldY)) {
      continue;
    }
    const screen = toScreen({ x: worldX, y: worldY });
    const distance = distanceBetween(pointerScreen, screen);
    if (distance > curveTolerance) {
      continue;
    }
    if (!nearestCurve || distance < nearestCurve.distance) {
      nearestCurve = {
        world: { x: worldX, y: worldY },
        screen,
        distance,
        kind: 'curve',
        label: t('feature.curve'),
        layerId: layer.id,
        layerIds: [layer.id],
      };
    }
  }
  return nearestCurve;
}
