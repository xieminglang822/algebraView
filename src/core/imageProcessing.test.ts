import { describe, expect, it } from 'vitest';
import {
  binarizeAdaptive,
  binarizeForOcr,
  binarizeWithThreshold,
  grayscaleFromRgba,
  invertGrayscale,
  meanGrayscale,
  otsuThreshold,
  stretchContrast,
} from './imageProcessing';

function makeGray(values: readonly number[]): Uint8ClampedArray {
  return Uint8ClampedArray.from(values);
}

function countBlack(binary: Uint8ClampedArray): number {
  return binary.reduce((total, value) => total + (value === 0 ? 1 : 0), 0);
}

function makePage(width: number, height: number, background = 255): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height).fill(background);
}

function paintRect(
  gray: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  value: number,
): void {
  for (let row = y; row < y + rectHeight; row += 1) {
    for (let column = x; column < x + rectWidth; column += 1) {
      gray[row * width + column] = value;
    }
  }
}

describe('imageProcessing', () => {
  it('converts RGBA pixels to luminance', () => {
    const rgba = Uint8ClampedArray.from([255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255]);
    const gray = grayscaleFromRgba(rgba);
    expect(Array.from(gray)).toEqual([255, 0, 128]);
  });

  it('never collapses a mostly-white page during contrast stretching', () => {
    // 1% ink is below the 2% lower percentile, which used to make low === high.
    const gray = makePage(100, 10);
    paintRect(gray, 100, 0, 0, 10, 1, 0);
    const changed = stretchContrast(gray);
    expect(changed).toBe(false);
    expect(Array.from(gray).filter((value) => value === 0)).toHaveLength(10);
    expect(Array.from(gray).filter((value) => value === 255)).toHaveLength(990);
  });

  it('stretches genuinely low-contrast images', () => {
    const gray = makeGray([100, 140, 120, 100]);
    const changed = stretchContrast(gray);
    expect(changed).toBe(true);
    expect(Math.min(...Array.from(gray))).toBe(0);
    expect(Math.max(...Array.from(gray))).toBe(255);
  });

  it('inverts and measures grayscale images', () => {
    expect(Array.from(invertGrayscale(makeGray([0, 128, 255])))).toEqual([255, 127, 0]);
    expect(meanGrayscale(makeGray([0, 255]))).toBeCloseTo(127.5);
    expect(meanGrayscale(makeGray([]))).toBe(255);
  });

  it('uses <= when binarising with a global threshold', () => {
    expect(Array.from(binarizeWithThreshold(makeGray([0, 127, 128, 255]), 127))).toEqual([
      0, 0, 255, 255,
    ]);
  });

  it('computes an Otsu threshold for a bimodal image', () => {
    const values: number[] = [];
    for (let index = 0; index < 100; index += 1) values.push(0);
    for (let index = 0; index < 900; index += 1) values.push(255);
    const threshold = otsuThreshold(makeGray(values));
    expect(threshold).toBe(0);
    const binary = binarizeWithThreshold(makeGray(values), threshold);
    expect(countBlack(binary)).toBe(100);
  });

  it('adaptively binarises a small ink block on a white page', () => {
    const width = 40;
    const height = 30;
    const gray = makePage(width, height);
    paintRect(gray, width, 18, 13, 4, 4, 0);
    const binary = binarizeAdaptive(gray, width, height);
    expect(countBlack(binary)).toBe(16);
    expect(binary[0]).toBe(255);
  });

  it('leaves a blank page blank', () => {
    const gray = makePage(30, 20);
    const binary = binarizeAdaptive(gray, 30, 20);
    expect(countBlack(binary)).toBe(0);
  });

  it('handles chalkboard-style inverted images', () => {
    const width = 40;
    const height = 30;
    const gray = makePage(width, height, 0);
    paintRect(gray, width, 15, 10, 10, 10, 255);
    const binary = binarizeForOcr(gray, width, height);
    expect(binary[0]).toBe(255);
    expect(countBlack(binary)).toBeGreaterThan(80);
    expect(countBlack(binary)).toBeLessThan(160);
  });

  it('falls back to Otsu when adaptive thresholding finds no ink', () => {
    const gray = makePage(20, 20, 255);
    const binary = binarizeForOcr(gray, 20, 20);
    expect(countBlack(binary)).toBe(0);
  });
});
