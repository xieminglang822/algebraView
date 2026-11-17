import type { CanvasSize, Point, Viewport } from '../core/types';
import { chooseTickStep, formatTickLabel } from './viewport';

const AXIS_COLOR = '#94a3b8';
const MAJOR_GRID_COLOR = 'rgba(148, 163, 184, 0.32)';
const MINOR_GRID_COLOR = 'rgba(203, 213, 225, 0.28)';
const LABEL_COLOR = '#64748b';
const TICK_FONT = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * Pure world ↔ screen mapping plus grid / axis rendering. Knows nothing about
 * React, function layers or gestures.
 */
export class CoordinateSystem {
  readonly viewport: Viewport;
  readonly size: CanvasSize;
  readonly dpr: number;

  constructor(viewport: Viewport, size: CanvasSize, dpr = 1) {
    this.viewport = viewport;
    this.size = size;
    this.dpr = dpr;
  }

  get worldWidth(): number {
    return this.viewport.xMax - this.viewport.xMin;
  }

  get worldHeight(): number {
    return this.viewport.yMax - this.viewport.yMin;
  }

  get pixelsPerUnitX(): number {
    return this.size.width / this.worldWidth;
  }

  get pixelsPerUnitY(): number {
    return this.size.height / this.worldHeight;
  }

  toScreenX(x: number): number {
    return ((x - this.viewport.xMin) / this.worldWidth) * this.size.width;
  }

  toScreenY(y: number): number {
    return ((this.viewport.yMax - y) / this.worldHeight) * this.size.height;
  }

  toScreen(point: Point): Point {
    return { x: this.toScreenX(point.x), y: this.toScreenY(point.y) };
  }

  toWorldX(px: number): number {
    return this.viewport.xMin + (px / this.size.width) * this.worldWidth;
  }

  toWorldY(py: number): number {
    return this.viewport.yMax - (py / this.size.height) * this.worldHeight;
  }

  toWorld(point: Point): Point {
    return { x: this.toWorldX(point.x), y: this.toWorldY(point.y) };
  }

  /** Horizontal world-space grid spacing currently in use. */
  get xTickStep(): number {
    return chooseTickStep(this.worldWidth, this.size.width);
  }

  get yTickStep(): number {
    return chooseTickStep(this.worldHeight, this.size.height);
  }

  draw(ctx: CanvasRenderingContext2D, options: { showGrid?: boolean } = {}): void {
    if (options.showGrid !== false) {
      this.drawGrid(ctx);
    }
    this.drawAxes(ctx);
    this.drawLabels(ctx);
  }

  private drawGrid(ctx: CanvasRenderingContext2D): void {
    const xStep = this.xTickStep;
    const yStep = this.yTickStep;
    const minorXStep = xStep / 5;
    const minorYStep = yStep / 5;
    const drawMinorX = (minorXStep * this.pixelsPerUnitX) >= 7;
    const drawMinorY = (minorYStep * this.pixelsPerUnitY) >= 7;

    ctx.save();
    ctx.lineWidth = 1;

    if (drawMinorX || drawMinorY) {
      ctx.strokeStyle = MINOR_GRID_COLOR;
      ctx.beginPath();
      if (drawMinorX) {
        for (const x of tickValues(this.viewport.xMin, this.viewport.xMax, minorXStep)) {
          const screenX = align(this.toScreenX(x), this.dpr);
          ctx.moveTo(screenX, 0);
          ctx.lineTo(screenX, this.size.height);
        }
      }
      if (drawMinorY) {
        for (const y of tickValues(this.viewport.yMin, this.viewport.yMax, minorYStep)) {
          const screenY = align(this.toScreenY(y), this.dpr);
          ctx.moveTo(0, screenY);
          ctx.lineTo(this.size.width, screenY);
        }
      }
      ctx.stroke();
    }

    ctx.strokeStyle = MAJOR_GRID_COLOR;
    ctx.beginPath();
    for (const x of tickValues(this.viewport.xMin, this.viewport.xMax, xStep)) {
      const screenX = align(this.toScreenX(x), this.dpr);
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, this.size.height);
    }
    for (const y of tickValues(this.viewport.yMin, this.viewport.yMax, yStep)) {
      const screenY = align(this.toScreenY(y), this.dpr);
      ctx.moveTo(0, screenY);
      ctx.lineTo(this.size.width, screenY);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawAxes(ctx: CanvasRenderingContext2D): void {
    const origin = this.toScreen({ x: 0, y: 0 });
    const axisY = origin.y;
    const axisX = origin.x;
    ctx.save();
    ctx.strokeStyle = AXIS_COLOR;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (axisY >= 0 && axisY <= this.size.height) {
      const y = align(axisY, this.dpr);
      ctx.moveTo(0, y);
      ctx.lineTo(this.size.width, y);
    }
    if (axisX >= 0 && axisX <= this.size.width) {
      const x = align(axisX, this.dpr);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.size.height);
    }
    ctx.stroke();

    // Arrow heads mark the positive directions when the axes are on screen.
    ctx.fillStyle = AXIS_COLOR;
    if (axisY >= 0 && axisY <= this.size.height) {
      ctx.beginPath();
      ctx.moveTo(this.size.width - 1, axisY);
      ctx.lineTo(this.size.width - 9, axisY - 4);
      ctx.lineTo(this.size.width - 9, axisY + 4);
      ctx.closePath();
      ctx.fill();
    }
    if (axisX >= 0 && axisX <= this.size.width) {
      ctx.beginPath();
      ctx.moveTo(axisX, 1);
      ctx.lineTo(axisX - 4, 9);
      ctx.lineTo(axisX + 4, 9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawLabels(ctx: CanvasRenderingContext2D): void {
    const xStep = this.xTickStep;
    const yStep = this.yTickStep;
    const origin = this.toScreen({ x: 0, y: 0 });
    ctx.save();
    ctx.font = TICK_FONT;
    ctx.fillStyle = LABEL_COLOR;
    ctx.textBaseline = 'middle';

    const showXLabels = xStep * this.pixelsPerUnitX >= 32;
    const showYLabels = yStep * this.pixelsPerUnitY >= 28;

    if (showXLabels) {
      const labelY = clamp(origin.y + 10, 12, this.size.height - 8);
      ctx.textAlign = 'center';
      for (const x of tickValues(this.viewport.xMin, this.viewport.xMax, xStep)) {
        if (Math.abs(x) < xStep * 1e-6) {
          continue;
        }
        const screenX = this.toScreenX(x);
        if (screenX < 16 || screenX > this.size.width - 16) {
          continue;
        }
        ctx.fillText(formatTickLabel(x, xStep), screenX, labelY);
      }
    }

    if (showYLabels) {
      const labelX = clamp(origin.x - 8, 26, this.size.width - 30);
      ctx.textAlign = 'right';
      for (const y of tickValues(this.viewport.yMin, this.viewport.yMax, yStep)) {
        if (Math.abs(y) < yStep * 1e-6) {
          continue;
        }
        const screenY = this.toScreenY(y);
        if (screenY < 12 || screenY > this.size.height - 10) {
          continue;
        }
        ctx.fillText(formatTickLabel(y, yStep), labelX, screenY);
      }
    }

    if (
      origin.x >= 12 &&
      origin.x <= this.size.width - 12 &&
      origin.y >= 12 &&
      origin.y <= this.size.height - 12
    ) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#475569';
      ctx.fillText('0', origin.x - 6, clamp(origin.y + 10, 12, this.size.height - 8));
    }
    ctx.restore();
  }
}

function align(value: number, dpr: number): number {
  const halfPixel = 0.5 / Math.max(1, dpr);
  return Math.round(value) + halfPixel;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Inclusive tick values, capped so a pathological viewport can never hang. */
function tickValues(min: number, max: number, step: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0) {
    return [];
  }
  const first = Math.ceil(min / step) * step;
  const values: number[] = [];
  const limit = 4000;
  for (let index = 0; index < limit; index += 1) {
    const value = first + index * step;
    if (value > max + step * 1e-9) {
      break;
    }
    values.push(value);
  }
  return values;
}
