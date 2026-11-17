import { derivative, parse, simplify, evaluate } from 'mathjs';
import { coerceNumeric } from './mathParser';

interface NerdamerApi {
  /** nerdamer returns a Vector object whose `toString()` is `[root1,root2,…]`. */
  solve(expression: string, variable: string): unknown;
}

export interface SymbolicRoots {
  roots: number[];
  engine: 'nerdamer';
}

let nerdamerPromise: Promise<NerdamerApi | null> | null = null;

async function loadNerdamer(): Promise<NerdamerApi | null> {
  if (!nerdamerPromise) {
    nerdamerPromise = (async () => {
      try {
        const imported: unknown = await import('nerdamer');
        const module = imported as { default?: unknown };
        const candidate = (module.default ?? imported) as Partial<NerdamerApi>;
        return typeof candidate.solve === 'function' ? (candidate as NerdamerApi) : null;
      } catch {
        return null;
      }
    })();
  }
  return nerdamerPromise;
}

/** Symbolic derivative via mathjs (always available, synchronous). */
export function symbolicDerivative(expression: string): string | null {
  if (expression.trim() === '') {
    return null;
  }
  try {
    const result = simplify(derivative(expression, 'x'));
    return result.toString();
  } catch {
    return null;
  }
}

function parseSolutionVector(raw: string): number[] | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '[]') {
    return [];
  }
  // nerdamer v1 returns `[2,-2]`, v2 returns the solution set `{2, -2}`.
  const opened = trimmed.startsWith('[') || trimmed.startsWith('{') ? trimmed.slice(1) : trimmed;
  const content = opened.endsWith(']') || opened.endsWith('}') ? opened.slice(0, -1) : opened;
  const tokens = content
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token !== '');
  const roots: number[] = [];
  for (const token of tokens) {
    try {
      const value = coerceNumeric(evaluate(token));
      if (Number.isFinite(value)) {
        roots.push(value);
      }
    } catch {
      continue;
    }
  }
  roots.sort((left, right) => left - right);
  const unique: number[] = [];
  for (const root of roots) {
    const previous = unique[unique.length - 1];
    if (previous === undefined || Math.abs(root - previous) > 1e-6 * Math.max(1, Math.abs(root))) {
      unique.push(root);
    }
  }
  return unique.length > 0 ? unique : null;
}

/**
 * Exact roots via nerdamer (symbolic solve), lazily loaded. Returns `null`
 * when the add-on cannot answer, so callers can fall back to numeric scanning.
 */
export async function solveSymbolically(expression: string): Promise<SymbolicRoots | null> {
  const trimmed = expression.trim();
  if (trimmed === '') {
    return null;
  }
  try {
    parse(trimmed);
  } catch {
    return null;
  }
  const api = await loadNerdamer();
  if (!api) {
    return null;
  }
  try {
    const raw = String(api.solve(trimmed, 'x'));
    const roots = parseSolutionVector(raw);
    return roots === null ? null : { roots, engine: 'nerdamer' };
  } catch {
    return null;
  }
}
