import { useMemo } from 'react';
import { ExpressionError, compileExpression, type CompiledExpression } from '../core/mathParser';
import { resolveLayerExpression } from '../core/templates';
import { isFunctionLayer, type FunctionLayer } from '../core/types';
import { useLocaleStore } from '../i18n/useLocale';
import { translate } from '../i18n/messages';
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
  const allLayers = useGraphStore((state) => state.layers);
  const locale = useLocaleStore((state) => state.locale);
  return useMemo(
    () =>
      allLayers.filter(isFunctionLayer).map((layer) => {
        const expression = resolveLayerExpression(layer);
        if (expression === '') {
          return {
            layer,
            expression,
            compiled: null,
            error: translate(locale, 'card.needExpression'),
          };
        }
        try {
          return {
            layer,
            expression,
            compiled: compileExpression(expression, locale),
            error: null,
          };
        } catch (error) {
          return {
            layer,
            expression,
            compiled: null,
            error:
              error instanceof ExpressionError
                ? error.message
                : translate(locale, 'card.expressionError'),
          };
        }
      }),
    // `locale` is a dependency because compile errors are localized at throw time.
    [allLayers, locale],
  );
}
