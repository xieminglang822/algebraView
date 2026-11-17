import { useEffect, useMemo, useState } from 'react';
import { findFeatureSet, type FeatureLayer } from '../core/featureFinder';
import type { FeaturePoint } from '../core/types';
import { useLocaleStore } from '../i18n/useLocale';
import { useGraphStore } from '../store/useGraphStore';
import type { ResolvedLayer } from './useCompiledLayers';

export interface FeaturePointResult {
  features: FeaturePoint[];
  pending: boolean;
}

/**
 * Recomputes algebraic feature markers after the viewport settles (120 ms debounce),
 * never on every animation frame.
 */
export function useFeaturePoints(
  resolvedLayers: readonly ResolvedLayer[],
  activeLayerId: string | null,
): FeaturePointResult {
  const viewport = useGraphStore((state) => state.viewport);
  const enabled = useGraphStore((state) => state.preferences.showFeatures);
  const locale = useLocaleStore((state) => state.locale);
  const [features, setFeatures] = useState<FeaturePoint[]>([]);
  const [pending, setPending] = useState(false);

  const featureLayers = useMemo<FeatureLayer[]>(
    () =>
      resolvedLayers
        .filter((resolved) => resolved.layer.visible && resolved.compiled !== null)
        .map((resolved) => ({
          id: resolved.layer.id,
          compiled: resolved.compiled as NonNullable<ResolvedLayer['compiled']>,
        })),
    [resolvedLayers],
  );

  useEffect(() => {
    if (!enabled || featureLayers.length === 0) {
      setFeatures([]);
      setPending(false);
      return;
    }
    setPending(true);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      try {
        const next = findFeatureSet(featureLayers, activeLayerId, viewport, locale);
        if (!cancelled) {
          setFeatures(next);
        }
      } catch {
        if (!cancelled) {
          setFeatures([]);
        }
      } finally {
        if (!cancelled) {
          setPending(false);
        }
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [featureLayers, activeLayerId, viewport, enabled, locale]);

  return { features, pending };
}
