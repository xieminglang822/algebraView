const EPSILON = 1e-10;

/**
 * Formats a number for display / expression building:
 * - normalises `-0`
 * - trims floating point noise introduced by slider arithmetic
 * - switches to exponential notation for very large / very small magnitudes
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity';
  }
  const rounded = Number(value.toFixed(10));
  const normalised = Object.is(rounded, -0) ? 0 : rounded;
  const magnitude = Math.abs(normalised);
  if (magnitude !== 0 && (magnitude >= 1e9 || magnitude < 1e-6)) {
    return normalised.toExponential(4).replace(/\.?0+e/, 'e').replace('e+', 'e');
  }
  return String(normalised);
}

/** Like {@link formatNumber} but wraps negative numbers in parentheses for safe embedding. */
export function parenthesise(value: number): string {
  const text = formatNumber(value);
  return value < 0 ? `(${text})` : text;
}

/** Clamps a number into `[min, max]`, guarding against NaN. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function nearlyEqual(a: number, b: number, tolerance = EPSILON): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return false;
  }
  return Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Rounds `value` to the nearest multiple of `step`. */
export function snapToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    return value;
  }
  return Number((Math.round(value / step) * step).toFixed(10));
}
