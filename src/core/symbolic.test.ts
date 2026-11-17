import { describe, expect, it } from 'vitest';
import { solveSymbolically, symbolicDerivative } from './symbolic';

describe('symbolic engine', () => {
  it('differentiates with mathjs', () => {
    expect(symbolicDerivative('x^2 - 4')).toBe('2 * x');
    expect(symbolicDerivative('sin(x)')).toBe('cos(x)');
    expect(symbolicDerivative('not an expression +++')).toBeNull();
  });

  it('solves exact polynomial roots with nerdamer', async () => {
    const result = await solveSymbolically('x^2 - 4');
    expect(result).not.toBeNull();
    expect(result?.engine).toBe('nerdamer');
    const roots = [...(result?.roots ?? [])].sort((left, right) => left - right);
    expect(roots).toHaveLength(2);
    expect(roots[0]).toBeCloseTo(-2);
    expect(roots[1]).toBeCloseTo(2);
  });

  it('returns sorted, de-duplicated numeric roots', async () => {
    const result = await solveSymbolically('sin(x)');
    if (result) {
      expect(result.roots.length).toBeGreaterThan(0);
      expect(result.roots.every((root) => Number.isFinite(root))).toBe(true);
      const sorted = [...result.roots].sort((left, right) => left - right);
      expect(result.roots).toEqual(sorted);
      for (let index = 1; index < result.roots.length; index += 1) {
        expect(result.roots[index]).not.toBe(result.roots[index - 1]);
      }
    }
  });

  it('returns an empty root list when there are no real solutions', async () => {
    const result = await solveSymbolically('x^2 + 1');
    if (result) {
      expect(result.roots).toEqual([]);
    }
  });
});
