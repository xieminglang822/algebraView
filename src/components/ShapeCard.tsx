import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { shapeFormula, shapeParameters, shapeTypeName } from '../core/shapes';
import type { ShapeLayer, ShapeType } from '../core/types';
import { useTranslation } from '../i18n/useLocale';
import { useGraphStore } from '../store/useGraphStore';
import { BlankInputSlot } from './BlankInputSlot';

export interface ShapeCardProps {
  layer: ShapeLayer;
  active: boolean;
  onDeleted: (layerId: string) => void;
}

export function ShapeCard({ layer, active, onDeleted }: ShapeCardProps) {
  const { t, locale } = useTranslation();
  const setActiveLayer = useGraphStore((state) => state.setActiveLayer);
  const toggleLayerVisibility = useGraphStore((state) => state.toggleLayerVisibility);
  const removeLayer = useGraphStore((state) => state.removeLayer);
  const setShapeType = useGraphStore((state) => state.setShapeType);
  const setSlotValue = useGraphStore((state) => state.setSlotValue);
  const parameters = shapeParameters(layer.shapeType);
  const formula = shapeFormula(layer, locale);

  return (
    <article
      data-testid={`shape-card-${layer.id}`}
      aria-label={t('shape.cardAria', { label: layer.label })}
      onClick={() => setActiveLayer(layer.id)}
      style={{ borderLeftColor: layer.color }}
      className={`animate-fade-up rounded-2xl border border-l-4 bg-white p-3 shadow-card transition-all ${
        active ? 'border-brand-200 ring-2 ring-brand-100' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: layer.color }}
        />
        <span className="font-mono text-sm font-semibold text-slate-800">{layer.label}</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
          {shapeTypeName(layer.shapeType, locale)}
        </span>
        {active ? (
          <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-600">
            {t('card.active')}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            aria-label={layer.visible ? t('card.hideLayer') : t('card.showLayer')}
            title={layer.visible ? t('card.hideLayer') : t('card.showLayer')}
            aria-pressed={!layer.visible}
            onClick={(event) => {
              event.stopPropagation();
              toggleLayerVisibility(layer.id);
            }}
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button
            type="button"
            aria-label={t('card.deleteLayer')}
            title={t('card.deleteLayer')}
            onClick={(event) => {
              event.stopPropagation();
              removeLayer(layer.id);
              onDeleted(layer.id);
            }}
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-baseline gap-2 rounded-xl bg-slate-50 px-3 py-2">
        <code
          data-testid="shape-formula"
          className="min-w-0 truncate font-mono text-[12px] font-medium text-slate-700"
        >
          {formula}
        </code>
      </div>

      <label className="mb-1 mt-2 block text-[10px] font-medium uppercase tracking-wider text-slate-400">
        {t('shape.typeAria')}
      </label>
      <select
        aria-label={t('shape.typeAria')}
        value={layer.shapeType}
        onChange={(event) => setShapeType(layer.id, event.target.value as ShapeType)}
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-700 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      >
        <option value="circle">{t('shape.circle.name')}</option>
        <option value="ellipse">{t('shape.ellipse.name')}</option>
      </select>

      <div className="mt-2 grid grid-cols-1 gap-2">
        {parameters.map((parameter) => (
          <BlankInputSlot
            key={parameter.key}
            slotKey={`${layer.id}-${parameter.key}`}
            label={t(parameter.labelKey)}
            value={layer.slots[parameter.key] ?? parameter.defaultValue}
            min={parameter.min}
            max={parameter.max}
            step={parameter.step}
            sliderMin={parameter.sliderMin}
            sliderMax={parameter.sliderMax}
            accentColor={layer.color}
            onChange={(value) => setSlotValue(layer.id, parameter.key, value)}
          />
        ))}
      </div>

      <p className="mt-2.5 border-t border-slate-100 pt-2 text-[10px] leading-relaxed text-slate-400">
        {t('shape.hint')}
      </p>
    </article>
  );
}
