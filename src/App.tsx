import { useEffect, useMemo, useState } from 'react';
import { Languages, Plus } from 'lucide-react';
import { AddLayerMenu } from './components/AddLayerMenu';
import { FunctionCard } from './components/FunctionCard';
import { GraphCanvas } from './components/GraphCanvas';
import { OcrModal } from './components/OcrModal';
import { ShapeCard } from './components/ShapeCard';
import { MAX_LAYERS } from './core/templates';
import { useTranslation } from './i18n/useLocale';
import { useCompiledLayers } from './hooks/useCompiledLayers';
import { useGraphStore } from './store/useGraphStore';

export default function App() {
  const { t, locale, toggleLocale } = useTranslation();
  const layers = useGraphStore((state) => state.layers);
  const activeLayerId = useGraphStore((state) => state.activeLayerId);
  const addLayer = useGraphStore((state) => state.addLayer);
  const resolvedLayers = useCompiledLayers();
  const [ocrLayerId, setOcrLayerId] = useState<string | null>(null);
  const resolvedById = useMemo(
    () => new Map(resolvedLayers.map((resolved) => [resolved.layer.id, resolved])),
    [resolvedLayers],
  );

  const layerCountLabel = useMemo(
    () => t('app.layerCount', { count: layers.length, max: MAX_LAYERS }),
    [layers.length, t],
  );
  const atCapacity = layers.length >= MAX_LAYERS;

  useEffect(() => {
    document.title = t('app.title');
    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute('content', t('app.description'));
    }
  }, [t, locale]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-semibold text-white shadow-sm">
          <span aria-hidden="true" className="font-serif italic">
            f
          </span>
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-tight text-slate-800">
            algebraView
          </h1>
          <p className="hidden text-[10px] text-slate-400 sm:block">{t('app.tagline')}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            data-testid="language-toggle"
            aria-label={t('app.languageToggle')}
            title={t('app.languageToggle')}
            onClick={toggleLocale}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-brand-50 hover:text-brand-600"
          >
            <Languages size={13} />
            <span>{locale === 'zh' ? t('app.languageShortEnglish') : t('app.languageShortChinese')}</span>
          </button>
          <span
            data-testid="layer-count"
            className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-500 sm:inline"
          >
            {layerCountLabel}
          </span>
          <AddLayerMenu testId="add-layer" compact />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="relative order-1 h-[54vh] shrink-0 overflow-hidden border-b border-slate-200 bg-white lg:order-2 lg:h-auto lg:min-h-0 lg:flex-1 lg:border-b-0">
          <GraphCanvas />
        </section>

        <aside className="order-2 flex min-h-0 flex-1 flex-col bg-slate-50 lg:order-1 lg:w-[410px] lg:flex-none lg:border-r lg:border-slate-200">
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t('app.layersTitle')}
              </h2>
              <p className="mt-0.5 text-[10px] text-slate-400">{t('app.layersSubtitle')}</p>
            </div>
            <AddLayerMenu testId="add-layer-sidebar" variant="ghost" />
          </div>

          <div className="scrollbar-slim min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-5 pt-1">
            {layers.map((layer) => {
              const active = layer.id === activeLayerId;
              const onDeleted = (layerId: string): void => {
                if (ocrLayerId === layerId) {
                  setOcrLayerId(null);
                }
              };
              if (layer.kind === 'shape') {
                return (
                  <ShapeCard
                    key={layer.id}
                    layer={layer}
                    active={active}
                    onDeleted={onDeleted}
                  />
                );
              }
              const resolved = resolvedById.get(layer.id);
              if (!resolved) {
                return null;
              }
              return (
                <FunctionCard
                  key={layer.id}
                  layer={layer}
                  resolved={resolved}
                  active={active}
                  onOpenOcr={(layerId) => setOcrLayerId(layerId)}
                  onDeleted={onDeleted}
                />
              );
            })}

            {layers.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center">
                <p className="text-xs font-medium text-slate-600">{t('app.emptyTitle')}</p>
                <p className="mt-1 text-[11px] text-slate-400">{t('app.emptyBody')}</p>
                <button
                  type="button"
                  onClick={() => addLayer('function')}
                  className="mt-3 inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-brand-700"
                >
                  <Plus size={12} />
                  {t('app.addFunction')}
                </button>
              </div>
            ) : null}

            {atCapacity ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] text-amber-700 ring-1 ring-amber-200">
                {t('app.limitNotice')}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white/70 px-4 py-2 text-[10px] leading-relaxed text-slate-400">
            {t('app.footerTip')}
          </div>
        </aside>
      </main>

      <OcrModal
        open={ocrLayerId !== null}
        layerId={ocrLayerId}
        onClose={() => setOcrLayerId(null)}
      />
    </div>
  );
}
