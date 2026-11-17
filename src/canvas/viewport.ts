import type { Point, Viewport } from '../core/types';

export const DEFAULT_VIEWPORT: Viewport = {
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10,
};

export const MIN_VIEWPORT_SPAN = 1e-4;
export const MAX_VIEWPORT_SPAN = 1e6;
export const VIEWPORT_COORDINATE_LIMIT = 1e9;

export function viewportWidth(viewport: Viewport): number {
  return viewport.xMax - viewport.xMin;
}

export function viewportHeight(viewport: Viewport): number {
  return viewport.yMax - viewport.yMin;
}

export function viewportCenter(viewport: Viewport): Point {
  return {
    x: (viewport.xMin + viewport.xMax) / 2,
    y: (viewport.yMin + viewport.yMax) / 2,
  };
}

function clampSpan(span: number): number {
  if (!Number.isFinite(span) || span <= 0) {
    return 20;
  }
  return Math.min(MAX_VIEWPORT_SPAN, Math.max(MIN_VIEWPORT_SPAN, span));
}

function clampCentre(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(VIEWPORT_COORDINATE_LIMIT, Math.max(-VIEWPORT_COORDINATE_LIMIT, value));
}

export function clampViewport(viewport: Viewport): Viewport {
  const centre = viewportCenter(viewport);
  const width = clampSpan(viewportWidth(viewport));
  const height = clampSpan(viewportHeight(viewport));
  const x = clampCentre(centre.x);
  const y = clampCentre(centre.y);
  return {
    xMin: x - width / 2,
    xMax: x + width / 2,
    yMin: y - height / 2,
    yMax: y + height / 2,
  };
}

/**
 * Zooms around a world-space anchor. `scale > 1` zooms in, `scale < 1` zooms out.
 * The anchor keeps its exact screen position, which is what makes wheel / pinch
 * zoom feel natural.
 */
export function zoomViewport(viewport: Viewport, anchor: Point, scale: number): Viewport {
  const safeScale = Number.isFinite(scale) && scale > 0 ? Math.min(1e6, Math.max(1e-6, scale)) : 1;
  const ratio = 1 / safeScale;
  const xMin = anchor.x - (anchor.x - viewport.xMin) * ratio;
  const xMax = anchor.x + (viewport.xMax - anchor.x) * ratio;
  const yMin = anchor.y - (anchor.y - viewport.yMin) * ratio;
  const yMax = anchor.y + (viewport.yMax - anchor.y) * ratio;
  return clampViewport({ xMin, xMax, yMin, yMax });
}

export function panViewport(viewport: Viewport, deltaX: number, deltaY: number): Viewport {
  return clampViewport({
    xMin: viewport.xMin + deltaX,
    xMax: viewport.xMax + deltaX,
    yMin: viewport.yMin + deltaY,
    yMax: viewport.yMax + deltaY,
  });
}

export function resetViewport(): Viewport {
  return { ...DEFAULT_VIEWPORT };
}

/**
 * Adaptive 1 / 2 / 5 grid spacing so labels stay readable at every zoom level.
 * Returns the world-space distance between two major grid lines.
 */
export function chooseTickStep(worldSpan: number, pixelSpan: number, targetPixels = 84): number {
  if (!Number.isFinite(worldSpan) || worldSpan <= 0 || !Number.isFinite(pixelSpan) || pixelSpan <= 0) {
    return 1;
  }
  const raw = (worldSpan / pixelSpan) * targetPixels;
  if (!Number.isFinite(raw) || raw <= 0) {
    return 1;
  }
  const exponent = Math.floor(Math.log10(raw));
  const fraction = raw / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * 10 ** exponent;
}

export function tickDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) {
    return 0;
  }
  return Math.min(8, Math.max(0, Math.ceil(-Math.log10(step)) + 0));
}

export function formatTickLabel(value: number, step: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }
  if (Math.abs(value) >= 1e6) {
    return value.toExponential(1);
  }
  const decimals = tickDecimals(step);
  const fixed = value.toFixed(decimals);
  const normalised = Number(fixed);
  if (Object.is(normalised, -0)) {
    return '0';
  }
  return fixed;
}
