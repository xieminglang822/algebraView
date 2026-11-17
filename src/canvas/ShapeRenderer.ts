import type { ShapeLayer } from '../core/types';
import { sampleShape } from '../core/shapes';
import type { CoordinateSystem } from './CoordinateSystem';

export interface ShapeStyle {
  color: string;
  active?: boolean;
}

/** Draws a closed circle/rotated-ellipse path with a subtle translucent fill. */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  coordinateSystem: CoordinateSystem,
  shape: ShapeLayer,
  style: ShapeStyle,
): void {
  const points = sampleShape(shape, 256);
  if (points.length < 3) {
    return;
  }
  ctx.save();
  ctx.beginPath();
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!point) {
      continue;
    }
    const screen = coordinateSystem.toScreen(point);
    if (index === 0) {
      ctx.moveTo(screen.x, screen.y);
    } else {
      ctx.lineTo(screen.x, screen.y);
    }
  }
  ctx.closePath();

  ctx.globalAlpha = style.active ? 0.16 : 0.09;
  ctx.fillStyle = style.color;
  ctx.fill();

  if (style.active) {
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 9;
    ctx.strokeStyle = style.color;
    ctx.stroke();
  }

  ctx.globalAlpha = style.active ? 1 : 0.9;
  ctx.lineWidth = style.active ? 3 : 2.25;
  ctx.strokeStyle = style.color;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}
