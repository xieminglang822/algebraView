import { useEffect, useState } from 'react';
import { solveSymbolically, symbolicDerivative } from '../core/symbolic';

export interface SymbolicAnalysis {
  derivative: string | null;
  roots: number[] | null;
  loading: boolean;
  engine: 'nerdamer' | 'unavailable';
}

/** Debounced symbolic analysis: derivative (mathjs) + exact roots (nerdamer). */
export function useSymbolicAnalysis(expression: string): SymbolicAnalysis {
  const [roots, setRoots] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [engine, setEngine] = useState<'nerdamer' | 'unavailable'>('unavailable');
  const derivative = expression.trim() === '' ? null : symbolicDerivative(expression);

  useEffect(() => {
    let cancelled = false;
    if (expression.trim() === '') {
      setRoots(null);
      setLoading(false);
      setEngine('unavailable');
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      void solveSymbolically(expression)
        .then((result) => {
          if (cancelled) {
            return;
          }
          if (result) {
            setRoots(result.roots);
            setEngine('nerdamer');
          } else {
            setRoots(null);
            setEngine('unavailable');
          }
        })
        .catch(() => {
          if (!cancelled) {
            setRoots(null);
            setEngine('unavailable');
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [expression]);

  return { derivative, roots, loading, engine };
}
