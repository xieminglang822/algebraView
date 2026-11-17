import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { FunctionCard } from './components/FunctionCard';
import { GraphCanvas } from './components/GraphCanvas';
import { OcrModal } from './components/OcrModal';
import { MAX_LAYERS } from './core/templates';
import { useCompiledLayers } from './hooks/useCompiledLayers';
import { useGraphStore } from './store/useGraphStore';

export default function App() {
  const layers = useGraphStore((state) => state.layers);
  const activeLayerId = useGraphStore((state) => state.activeLayerId);
  const addLayer = useGraphStore((state) => state.addLayer);
  const resolvedLayers = useCompiledLayers();
  const [ocrLayerId, setOcrLayerId] = useState<string | null>(null);

  const layerCountLabel = useMemo(() => `${layers.length} / ${MAX_LAYERS}`, [layers.length]);
  const atCapacity = layers.length >= MAX_LAYERS;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-semibold text-white shadow-sm">
          <span aria-hidden="true" className="font-serif italic">
            f
          </span>
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-tight text-slate-800">
            algebraView
          </h1>
          <p className="hidden text-[10px] text-slate-400 sm:block">
            结构化函数输入 · 实时 2D 图像实验室
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            data-testid="layer-count"
            className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-500 sm:inline"
          >
            {layerCountLabel} 图层
          </span>
          <button
            type="button"
            data-testid="add-layer"
            onClick={addLayer}
            disabled={atCapacity}
            title={atCapacity ? '最多同时挂载 8 个图层' : '新增一个函数图层'}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">添加函数</span>
            <span className="sm:hidden">添加</span>
          </button>
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
                函数图层
              </h2>
              <p className="mt-0.5 text-[10px] text-slate-400">每个图层独立配色，可叠加对比</p>
            </div>
            <button
              type="button"
              onClick={addLayer}
              disabled={atCapacity}
              aria-label="添加函数图层"
              title={atCapacity ? '最多同时挂载 8 个图层' : '添加函数图层'}
              className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-brand-50 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={12} />
              添加
            </button>
          </div>

          <div className="scrollbar-slim min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-5 pt-1">
            {resolvedLayers.map((resolved) => (
              <FunctionCard
                key={resolved.layer.id}
                layer={resolved.layer}
                resolved={resolved}
                active={resolved.layer.id === activeLayerId}
                onOpenOcr={(layerId) => setOcrLayerId(layerId)}
                onDeleted={(layerId) => {
                  if (ocrLayerId === layerId) {
                    setOcrLayerId(null);
                  }
                }}
              />
            ))}

            {layers.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center">
                <p className="text-xs font-medium text-slate-600">还没有函数图层</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  点击「添加函数」新建一个结构化输入卡片。
                </p>
                <button
                  type="button"
                  onClick={addLayer}
                  className="mt-3 inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-brand-700"
                >
                  <Plus size={12} />
                  添加函数
                </button>
              </div>
            ) : null}

            {atCapacity ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] text-amber-700 ring-1 ring-amber-200">
                已达到 8 个图层上限。删除不再需要的图层后再添加，可保持画面清晰。
              </p>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white/70 px-4 py-2 text-[10px] leading-relaxed text-slate-400">
            提示：拖动系数滑块即可实时重绘；靠近曲线会自动吸附并显示坐标；拍照识别结果会先进入校对弹窗。
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
