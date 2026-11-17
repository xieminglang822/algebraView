/**
 * Pure grayscale / thresholding helpers used by the OCR preprocessor.
 * Kept free of DOM APIs so they can be unit-tested and reused in a worker.
 */

export function grayscaleFromRgba(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const length = Math.floor(rgba.length / 4);
  const gray = new Uint8ClampedArray(length);
  for (let index = 0; index < length; index += 1) {
    const offset = index * 4;
    const luminance =
      0.299 * (rgba[offset] ?? 0) + 0.587 * (rgba[offset + 1] ?? 0) + 0.114 * (rgba[offset + 2] ?? 0);
    gray[index] = Math.round(luminance);
  }
  return gray;
}

export function histogramOf(gray: Uint8ClampedArray): Uint32Array {
  const histogram = new Uint32Array(256);
  for (const value of gray) {
    histogram[value] = (histogram[value] ?? 0) + 1;
  }
  return histogram;
}

function percentileFromHistogram(
  histogram: Uint32Array,
  total: number,
  fraction: number,
): number {
  const target = Math.max(0, Math.min(total - 1, Math.floor(total * fraction)));
  let accumulated = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    accumulated += histogram[value] ?? 0;
    if (accumulated > target) {
      return value;
    }
  }
  return 255;
}

/**
 * Percentile contrast stretch. Degenerate ranges (e.g. a mostly white page with
 * fewer than 2% ink pixels) are left untouched so the image can never collapse
 * to a single colour.
 */
export function stretchContrast(gray: Uint8ClampedArray): boolean {
  const histogram = histogramOf(gray);
  const low = percentileFromHistogram(histogram, gray.length, 0.02);
  const high = percentileFromHistogram(histogram, gray.length, 0.98);
  const range = high - low;
  if (range < 8) {
    return false;
  }
  const scale = 255 / range;
  for (let index = 0; index < gray.length; index += 1) {
    const stretched = ((gray[index] ?? 0) - low) * scale;
    gray[index] = Math.max(0, Math.min(255, stretched));
  }
  return true;
}

export function invertGrayscale(gray: Uint8ClampedArray): Uint8ClampedArray {
  const inverted = new Uint8ClampedArray(gray.length);
  for (let index = 0; index < gray.length; index += 1) {
    inverted[index] = 255 - (gray[index] ?? 0);
  }
  return inverted;
}

export function meanGrayscale(gray: Uint8ClampedArray): number {
  if (gray.length === 0) {
    return 255;
  }
  let sum = 0;
  for (const value of gray) {
    sum += value;
  }
  return sum / gray.length;
}

/** Global Otsu threshold; dark pixels are `<= threshold`. */
export function otsuThreshold(gray: Uint8ClampedArray): number {
  const histogram = histogramOf(gray);
  const total = gray.length;
  let sum = 0;
  for (let value = 0; value < 256; value += 1) {
    sum += value * (histogram[value] ?? 0);
  }
  let sumBackground = 0;
  let weightBackground = 0;
  let bestVariance = -1;
  let bestThreshold = 127;
  for (let value = 0; value < 256; value += 1) {
    weightBackground += histogram[value] ?? 0;
    if (weightBackground === 0) {
      continue;
    }
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) {
      break;
    }
    sumBackground += value * (histogram[value] ?? 0);
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance =
      weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = value;
    }
  }
  return bestThreshold;
}

export function binarizeWithThreshold(
  gray: Uint8ClampedArray,
  threshold: number,
): Uint8ClampedArray {
  const binary = new Uint8ClampedArray(gray.length);
  for (let index = 0; index < gray.length; index += 1) {
    binary[index] = (gray[index] ?? 0) <= threshold ? 0 : 255;
  }
  return binary;
}

export interface AdaptiveOptions {
  windowRadius?: number;
  offset?: number;
}

/**
 * Adaptive mean thresholding with an integral image, matching the
 * "自适应二值化" requirement. Produces black ink on a white background.
 */
export function binarizeAdaptive(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  options: AdaptiveOptions = {},
): Uint8ClampedArray {
  const total = width * height;
  if (width <= 0 || height <= 0 || gray.length < total) {
    return new Uint8ClampedArray(Math.max(0, total));
  }
  const stride = width + 1;
  const integral = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += gray[y * width + x] ?? 0;
      integral[(y + 1) * stride + (x + 1)] =
        (integral[y * stride + (x + 1)] ?? 0) + rowSum;
    }
  }

  const radius = options.windowRadius ?? Math.max(6, Math.round(Math.min(width, height) / 16));
  const offset = options.offset ?? 10;
  const binary = new Uint8ClampedArray(total);

  for (let y = 0; y < height; y += 1) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - radius);
      const right = Math.min(width, x + radius + 1);
      const sum =
        (integral[bottom * stride + right] ?? 0) -
        (integral[top * stride + right] ?? 0) -
        (integral[bottom * stride + left] ?? 0) +
        (integral[top * stride + left] ?? 0);
      const count = (bottom - top) * (right - left);
      const mean = count > 0 ? sum / count : 255;
      binary[y * width + x] = (gray[y * width + x] ?? 0) < mean - offset ? 0 : 255;
    }
  }
  return binary;
}

function countBlack(binary: Uint8ClampedArray): number {
  let black = 0;
  for (const value of binary) {
    if (value === 0) {
      black += 1;
    }
  }
  return black;
}

/**
 * End-to-end binarisation for OCR:
 * 1. invert chalkboard-style (white ink on black) images,
 * 2. adaptive threshold for uneven lighting,
 * 3. global Otsu fallback if adaptive produced no ink at all.
 */
export function binarizeForOcr(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const working = meanGrayscale(gray) < 96 ? invertGrayscale(gray) : gray;
  const adaptive = binarizeAdaptive(working, width, height);
  const total = width * height;
  const black = countBlack(adaptive);
  if (black === 0 && total > 0) {
    const threshold = otsuThreshold(working);
    if (threshold > 0) {
      return binarizeWithThreshold(working, threshold);
    }
  }
  return adaptive;
}
