import type { CompiledExpression, SamplePoint } from '../core/mathParser';
import { sampleExpression } from '../core/mathParser';
import type { CanvasSize, Viewport } from '../core/types';
import type { CoordinateSystem } from './CoordinateSystem';

export interface CurveStyle {
  color: string;
  lineWidth?: number;
  active?: boolean;
  opacity?: number;
}

const MAX_SCREEN_COORDINATE = 60_000;

/**
 * Splits a sampled curve into drawable polylines, breaking at:
 * - NaN / Infinity samples (domain gaps, `sqrt(x)` for x < 0, …)
 * - vertical asymptotes where the slope flips sign and the jump is enormous
 *   (`1/x`, `tan(x)`, `1/x²`), per the discontinuity rule in the spec.
 */
export function buildCurveSegments(
  samples: readonly SamplePoint[],
  worldHeight: number,
): SamplePoint[][] {
  const segments: SamplePoint[][] = [];
  let current: SamplePoint[] = [];
  let previous: SamplePoint | null = null;
  let previousSlope = Number.NaN;
  const height = Number.isFinite(worldHeight) && worldHeight > 0 ? worldHeight : 20;

  const flush = (): void => {
    if (current.length > 0) {
      segments.push(current);
    }
    current = [];
  };

  for (const sample of samples) {
    if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) {
      flush();
      previous = null;
      previousSlope = Number.NaN;
      continue;
    }
    if (previous) {
      const deltaX = sample.x - previous.x;
      const deltaY = sample.y - previous.y;
      const slope = deltaX > 0 ? deltaY / deltaX : Number.NaN;
      const jump = Math.abs(deltaY);
      const slopeFlip =
        Number.isFinite(previousSlope) &&
        previousSlope !== 0 &&
        Number.isFinite(slope) &&
        slope !== 0 &&
        Math.sign(previousSlope) !== Math.sign(slope);
      const nearAsymptote =
        Math.min(Math.abs(previous.y), Math.abs(sample.y)) > height * 0.25;
      const shouldBreak =
        !Number.isFinite(slope) ||
        (slopeFlip && (jump > height * 0.5 || nearAsymptote)) ||
        jump > height * 20;

      if (shouldBreak) {
        flush();
        previous = null;
        previousSlope = Number.NaN;
      } else {
        previousSlope = slope;
      }
    }
    current.push(sample);
    previous = sample;
  }
  flush();
  return segments;
}

export function sampleCurve(
  compiled: CompiledExpression,
  viewport: Viewport,
  size: CanvasSize,
): SamplePoint[][] {
  const sampleCount = Math.min(3200, Math.max(160, Math.ceil(size.width * 1.5)));
  const samples = sampleExpression(compiled, viewport.xMin, viewport.xMax, sampleCount);
  return buildCurveSegments(samples, viewport.yMax - viewport.yMin);
}

export function drawCurveSegments(
  ctx: CanvasRenderingContext2D,
  coordinateSystem: CoordinateSystem,
  segments: readonly SamplePoint[][],
  style: CurveStyle,
): void {
  const lineWidth = style.lineWidth ?? (style.active ? 3 : 2.25);
  const opacity = style.opacity ?? (style.active ? 1 : 0.9);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = style.color;

  for (const segment of segments) {
    if (segment.length < 2) {
      continue;
    }
    ctx.beginPath();
    for (let index = 0; index < segment.length; index += 1) {
      const point = segment[index];
      if (!point) {
        continue;
      }
      const screen = coordinateSystem.toScreen(point);
      const screenX = clampCoordinate(screen.x);
      const screenY = clampCoordinate(screen.y);
      if (index === 0) {
        ctx.moveTo(screenX, screenY);
      } else {
        ctx.lineTo(screenX, screenY);
      }
    }
    if (style.active) {
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = lineWidth + 6;
      ctx.stroke();
    }
    ctx.globalAlpha = opacity;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

function clampCoordinate(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-MAX_SCREEN_COORDINATE, Math.min(MAX_SCREEN_COORDINATE, value));
}

/** Canvas-backed curve renderer; sampling is delegated to {@link sampleCurve}. */
export class CurveRenderer {
  draw(
    ctx: CanvasRenderingContext2D,
    coordinateSystem: CoordinateSystem,
    compiled: CompiledExpression,
    viewport: Viewport,
    size: CanvasSize,
    style: CurveStyle,
  ): void {
    const segments = sampleCurve(compiled, viewport, size);
    drawCurveSegments(ctx, coordinateSystem, segments, style);
  }
}
