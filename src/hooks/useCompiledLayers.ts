import { useMemo } from 'react';
import { ExpressionError, compileExpression, type CompiledExpression } from '../core/mathParser';
import { resolveLayerExpression } from '../core/templates';
import type { FunctionLayer } from '../core/types';
import { useGraphStore } from '../store/useGraphStore';

export interface ResolvedLayer {
  layer: FunctionLayer;
  expression: string;
  compiled: CompiledExpression | null;
  error: string | null;
}

/**
 * Compiles every layer expression exactly once per layer-array mutation.
 * Errors are surfaced per-layer so one bad input never breaks the whole canvas.
 */
export function useCompiledLayers(): ResolvedLayer[] {
  const layers = useGraphStore((state) => state.layers);
  return useMemo(
    () =>
      layers.map((layer) => {
        const expression = resolveLayerExpression(layer);
        if (expression === '') {
          return {
            layer,
            expression,
            compiled: null,
            error: '请输入函数表达式',
          };
        }
        try {
          return {
            layer,
            expression,
            compiled: compileExpression(expression),
            error: null,
          };
        } catch (error) {
          return {
            layer,
            expression,
            compiled: null,
            error:
              error instanceof ExpressionError ? error.message : '表达式无法解析，请检查输入。',
          };
        }
      }),
    [layers],
  );
}
