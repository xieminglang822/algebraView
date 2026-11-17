import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEWPORT,
  MAX_VIEWPORT_SPAN,
  MIN_VIEWPORT_SPAN,
  chooseTickStep,
  formatTickLabel,
  panViewport,
  resetViewport,
  tickDecimals,
  viewportCenter,
  viewportHeight,
  viewportWidth,
  zoomViewport,
} from './viewport';
import type { Viewport } from '../core/types';

describe('viewport', () => {
  it('exposes the spec default viewport', () => {
    expect(DEFAULT_VIEWPORT).toEqual({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
    expect(viewportWidth(DEFAULT_VIEWPORT)).toBe(20);
    expect(viewportHeight(DEFAULT_VIEWPORT)).toBe(20);
    expect(viewportCenter(DEFAULT_VIEWPORT)).toEqual({ x: 0, y: 0 });
  });

  it('zooms around the anchor without moving it', () => {
    const anchor = { x: 3, y: 4 };
    const zoomed = zoomViewport(DEFAULT_VIEWPORT, anchor, 2);
    expect(zoomed.xMin).toBeCloseTo(-3.5);
    expect(zoomed.xMax).toBeCloseTo(6.5);
    expect(zoomed.yMin).toBeCloseTo(-3);
    expect(zoomed.yMax).toBeCloseTo(7);
    // The anchor keeps the same relative position inside the viewport.
    const relativeBefore = (anchor.x - DEFAULT_VIEWPORT.xMin) / viewportWidth(DEFAULT_VIEWPORT);
    const relativeAfter = (anchor.x - zoomed.xMin) / viewportWidth(zoomed);
    expect(relativeAfter).toBeCloseTo(relativeBefore);
  });

  it('zooms out symmetrically', () => {
    const zoomed = zoomViewport(DEFAULT_VIEWPORT, { x: 0, y: 0 }, 0.5);
    expect(zoomed).toEqual({ xMin: -20, xMax: 20, yMin: -20, yMax: 20 });
  });

  it('clamps the span to safe limits', () => {
    let viewport: Viewport = DEFAULT_VIEWPORT;
    for (let index = 0; index < 200; index += 1) {
      viewport = zoomViewport(viewport, { x: 0, y: 0 }, 2);
    }
    expect(viewportWidth(viewport)).toBeGreaterThanOrEqual(MIN_VIEWPORT_SPAN);

    viewport = DEFAULT_VIEWPORT;
    for (let index = 0; index < 200; index += 1) {
      viewport = zoomViewport(viewport, { x: 0, y: 0 }, 0.5);
    }
    expect(viewportWidth(viewport)).toBeLessThanOrEqual(MAX_VIEWPORT_SPAN);
  });

  it('pans while preserving the span', () => {
    const panned = panViewport(DEFAULT_VIEWPORT, 5, -3);
    expect(panned).toEqual({ xMin: -5, xMax: 15, yMin: -13, yMax: 7 });
    expect(viewportWidth(panned)).toBe(20);
    expect(viewportHeight(panned)).toBe(20);
  });

  it('resets to a fresh default viewport', () => {
    const reset = resetViewport();
    expect(reset).toEqual(DEFAULT_VIEWPORT);
    reset.xMin = -100;
    expect(DEFAULT_VIEWPORT.xMin).toBe(-10);
  });

  it('chooses 1 / 2 / 5 tick spacing adaptively', () => {
    expect(chooseTickStep(20, 800)).toBe(5);
    expect(chooseTickStep(20, 1600)).toBe(2);
    expect(chooseTickStep(20, 400)).toBe(5);
    expect(chooseTickStep(0.02, 800)).toBeCloseTo(0.005);
    expect(chooseTickStep(0, 800)).toBe(1);
  });

  it('formats tick labels with the right precision', () => {
    expect(tickDecimals(5)).toBe(0);
    expect(tickDecimals(0.5)).toBe(1);
    expect(tickDecimals(0.05)).toBe(2);
    expect(formatTickLabel(0.30000000000000004, 0.1)).toBe('0.3');
    expect(formatTickLabel(-0.0000001, 0.1)).toBe('0');
    expect(formatTickLabel(2, 1)).toBe('2');
  });
});
