import { useMemo, useState, type ReactNode } from 'react';
import { Camera, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import type { TranslationKey } from '../i18n/messages';
import { useTranslation } from '../i18n/useLocale';
import type { FunctionLayer, TemplateId } from '../core/types';
import {
  MAX_POLYNOMIAL_TERMS,
  TEMPLATE_GROUPS,
  getTemplate,
  resolveLayerFormula,
  templateLabel,
} from '../core/templates';
import { parseLatex, type LatexParseResult } from '../core/latexParser';
import { validateExpression } from '../core/mathParser';
import { formatNumber } from '../core/numberFormat';
import { useGraphStore } from '../store/useGraphStore';
import { useSymbolicAnalysis } from '../hooks/useSymbolicAnalysis';
import type { ResolvedLayer } from '../hooks/useCompiledLayers';
import { BlankInputSlot } from './BlankInputSlot';

type TabId = 'slots' | 'latex' | 'raw';

const TABS: ReadonlyArray<{ id: TabId; labelKey: TranslationKey }> = [
  { id: 'slots', labelKey: 'card.tabSlots' },
  { id: 'latex', labelKey: 'card.tabLatex' },
  { id: 'raw', labelKey: 'card.tabRaw' },
];

const RAW_EXAMPLES = ['sin(x)/x', 'x^3 - 2*x + 1', 'sqrt(x)', '1/x', 'e^x', 'abs(x)'];

const LATEX_EXAMPLES = [
  'y = x^2 - 4',
  'y = 2(x - 3)^2 + 1',
  'y = 2\\sin(x) + 1',
  'y = \\frac{1}{2}x^2',
  'y = 3 \\cdot 2^x',
  'y = 2\\log_{2}(x)',
];

export interface FunctionCardProps {
  layer: FunctionLayer;
  resolved: ResolvedLayer;
  active: boolean;
  onOpenOcr: (layerId: string) => void;
  onDeleted: (layerId: string) => void;
}

export function FunctionCard({ layer, resolved, active, onOpenOcr, onDeleted }: FunctionCardProps) {
  const { t, locale } = useTranslation();
  const [tab, setTab] = useState<TabId>(layer.mode === 'raw' ? 'raw' : 'slots');
  const setActiveLayer = useGraphStore((state) => state.setActiveLayer);
  const toggleLayerVisibility = useGraphStore((state) => state.toggleLayerVisibility);
  const removeLayer = useGraphStore((state) => state.removeLayer);
  const setTemplate = useGraphStore((state) => state.setTemplate);
  const setInputMode = useGraphStore((state) => state.setInputMode);
  const addPolynomialTerm = useGraphStore((state) => state.addPolynomialTerm);
  const removePolynomialTerm = useGraphStore((state) => state.removePolynomialTerm);
  const updatePolynomialTerm = useGraphStore((state) => state.updatePolynomialTerm);

  const template = getTemplate(layer.templateId);
  const formula = resolveLayerFormula(layer);
  const rawValidation = useMemo(
    () =>
      layer.mode === 'raw'
        ? validateExpression(layer.rawExpression, locale)
        : { ok: true, error: null },
    // Localized validation errors need to be rebuilt when the locale changes.
    [layer.mode, layer.rawExpression, locale],
  );

  const selectTab = (next: TabId): void => {
    if (next === 'slots' && layer.mode === 'raw') {
      setInputMode(layer.id, 'slots');
    }
    if (next === 'raw' && layer.mode !== 'raw') {
      setInputMode(layer.id, 'raw');
    }
    setTab(next);
  };

  const handleTemplateChange = (value: string): void => {
    if (value === 'raw') {
      setInputMode(layer.id, 'raw');
      setTab('raw');
      return;
    }
    setTemplate(layer.id, value as TemplateId);
    setTab('slots');
  };

  return (
    <article
      data-testid={`function-card-${layer.id}`}
      aria-label={t('card.aria', { label: layer.label })}
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
        <span className="font-mono text-sm font-semibold text-slate-800">{layer.label}(x)</span>
        {active ? (
          <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-600">
            {t('card.active')}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5">
          <ToolButton label={t('card.camera')} onClick={() => onOpenOcr(layer.id)}>
            <Camera size={14} />
          </ToolButton>
          <ToolButton
            label={layer.visible ? t('card.hideLayer') : t('card.showLayer')}
            onClick={() => toggleLayerVisibility(layer.id)}
            pressed={!layer.visible}
          >
            {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
          </ToolButton>
          <ToolButton
            label={t('card.deleteLayer')}
            danger
            onClick={() => {
              removeLayer(layer.id);
              onDeleted(layer.id);
            }}
          >
            <Trash2 size={14} />
          </ToolButton>
        </div>
      </div>

      <div className="mt-2 flex items-baseline gap-2 rounded-xl bg-slate-50 px-3 py-2">
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-slate-400">
          {t('card.formulaPrefix')}
        </span>
        <code
          data-testid="card-formula"
          className="min-w-0 truncate font-mono text-[13px] font-medium text-slate-700"
        >
          {formula}
        </code>
        <span className="ml-auto shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] text-slate-400 ring-1 ring-slate-200">
          {templateLabel(layer.templateId)}
        </span>
      </div>

      {resolved.error ? (
        <p className="mt-1.5 flex items-start gap-1 text-[11px] leading-snug text-rose-600">
          <span aria-hidden="true">⚠</span>
          <span>{resolved.error}</span>
        </p>
      ) : null}

      <div
        role="tablist"
        aria-label={t('card.tabsAria')}
        className="mt-2.5 flex rounded-lg bg-slate-100 p-0.5"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={tab === item.id}
            onClick={() => selectTab(item.id)}
            className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
              tab === item.id
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      {tab === 'slots' ? (
        <div className="mt-2">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-400">
            {t('card.template')}
          </label>
          <select
            aria-label={t('card.templateAria')}
            value={layer.templateId}
            onChange={(event) => handleTemplateChange(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-700 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          >
            {TEMPLATE_GROUPS.map((group) => (
              <optgroup key={group.groupKey} label={t(group.groupKey)}>
                {group.ids.map((id) => {
                  const templateDefinition = getTemplate(id);
                  return (
                    <option key={id} value={id}>
                      {templateDefinition ? t(templateDefinition.nameKey) : id}
                    </option>
                  );
                })}
              </optgroup>
            ))}
            <option value="raw">{t('template.raw.name')}</option>
          </select>

          {layer.templateId === 'polynomial' ? (
            <div className="mt-2 space-y-2">
              {layer.terms.map((term, index) => (
                <div
                  key={term.id}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] items-start gap-2"
                >
                  <BlankInputSlot
                    slotKey={`${term.id}-coefficient`}
                    label={t('card.termCoefficient', { index: index + 1 })}
                    value={term.coefficient}
                    accentColor={layer.color}
                    onChange={(value) =>
                      updatePolynomialTerm(layer.id, term.id, { coefficient: value })
                    }
                  />
                  <BlankInputSlot
                    slotKey={`${term.id}-exponent`}
                    label={t('card.termDegree')}
                    value={term.exponent}
                    step={1}
                    min={0}
                    max={12}
                    showSlider={false}
                    accentColor={layer.color}
                    onChange={(value) =>
                      updatePolynomialTerm(layer.id, term.id, { exponent: value })
                    }
                  />
                  <button
                    type="button"
                    aria-label={t('card.removeTerm', { index: index + 1 })}
                    title={t('card.removeTermTitle')}
                    disabled={layer.terms.length <= 1}
                    onClick={() => removePolynomialTerm(layer.id, term.id)}
                    className="mt-2 grid h-7 w-7 place-items-center rounded-md text-slate-300 transition hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addPolynomialTerm(layer.id)}
                disabled={layer.terms.length >= MAX_POLYNOMIAL_TERMS}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-1.5 text-[11px] font-medium text-slate-500 transition hover:border-brand-300 hover:bg-brand-50/60 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={12} />
                {t('card.addTerm')}
              </button>
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-1 gap-2">
              {template?.slots.map((slot) => (
                <BlankInputSlot
                  key={slot.key}
                  slotKey={`${layer.id}-${slot.key}`}
                  label={t(slot.labelKey)}
                  value={layer.slots[slot.key] ?? slot.defaultValue}
                  accentColor={layer.color}
                  onChange={(value) => useGraphStore.getState().setSlotValue(layer.id, slot.key, value)}
                />
              ))}
              {template && template.slots.length === 0 ? (
                <p className="text-[11px] text-slate-400">{t('card.noSlots')}</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'latex' ? (
        <LatexEditor key={layer.id} layer={layer} onApplied={() => setTab('slots')} />
      ) : null}

      {tab === 'raw' ? (
        <div className="mt-2">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-400">
            {t('card.rawLabel')}
          </label>
          <textarea
            aria-label={t('card.rawAria')}
            data-testid="raw-expression"
            value={layer.rawExpression}
            onChange={(event) => useGraphStore.getState().setRawExpression(layer.id, event.target.value)}
            rows={2}
            spellCheck={false}
            placeholder={t('card.rawPlaceholder')}
            className={`w-full resize-y rounded-lg border px-2.5 py-2 font-mono text-[12px] text-slate-800 outline-none transition focus:ring-2 ${
              rawValidation.ok
                ? 'border-slate-200 focus:border-brand-400 focus:ring-brand-100'
                : 'border-rose-300 bg-rose-50/40 focus:border-rose-400 focus:ring-rose-100'
            }`}
          />
          {!rawValidation.ok && rawValidation.error ? (
            <p className="mt-1 text-[11px] text-rose-600">{rawValidation.error}</p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {RAW_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => useGraphStore.getState().setRawExpression(layer.id, example)}
                className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 transition hover:bg-brand-50 hover:text-brand-600"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <SymbolicFooter expression={resolved.expression} engineError={resolved.error} />
    </article>
  );
}

interface LatexEditorProps {
  layer: FunctionLayer;
  onApplied: () => void;
}

function LatexEditor({ layer, onApplied }: LatexEditorProps) {
  const { t, locale } = useTranslation();
  const applyStructure = useGraphStore((state) => state.applyStructure);
  const [text, setText] = useState(layer.latexSource);
  const [applied, setApplied] = useState(false);

  const parse = useMemo<LatexParseResult | null>(
    () =>
      text.trim() === ''
        ? null
        : parseLatex(text, {
            locale,
            ...(layer.templateId === 'raw'
              ? {}
              : { preferredTemplate: layer.templateId }),
          }),
    // Localized errors/suggestions are produced by the parser at parse time.
    [text, layer.templateId, locale],
  );

  const slotSummary = (result: LatexParseResult): string => {
    if (!result.ok) {
      return '';
    }
    const slots = Object.entries(result.structure.slots);
    if (slots.length === 0) {
      return result.expression;
    }
    return slots
      .map(([key, value]) => `${key} = ${formatNumber(value)}`)
      .join(locale === 'zh' ? '，' : ', ');
  };

  return (
    <div className="mt-2">
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-400">
        {t('card.latexLabel')}
      </label>
      <textarea
        aria-label={t('card.latexAria')}
        data-testid="latex-input"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setApplied(false);
        }}
        rows={2}
        spellCheck={false}
        placeholder={t('card.latexPlaceholder')}
        className={`w-full resize-y rounded-lg border px-2.5 py-2 font-mono text-[12px] text-slate-800 outline-none transition focus:ring-2 ${
          parse === null || parse.ok
            ? 'border-slate-200 focus:border-brand-400 focus:ring-brand-100'
            : 'border-rose-300 bg-rose-50/40 focus:border-rose-400 focus:ring-rose-100'
        }`}
      />

      <div className="mt-1.5 flex flex-wrap gap-1">
        {LATEX_EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              setText(example);
              setApplied(false);
            }}
            className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 transition hover:bg-brand-50 hover:text-brand-600"
          >
            {example}
          </button>
        ))}
      </div>

      {parse === null ? (
        <p className="mt-2 text-[11px] text-slate-400">{t('card.latexHint')}</p>
      ) : parse.ok ? (
        <div className="mt-2 space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-800">
          <p className="font-medium">
            {t('card.latexSuccess', {
              template: templateLabel(parse.structure.templateId, locale),
              slots: slotSummary(parse),
            })}
          </p>
          <p className="font-mono text-[10px] text-emerald-700">
            {t('card.formulaPrefix')} {parse.formula}
          </p>
          {parse.warnings.map((warning) => (
            <p key={warning} className="text-[10px] text-amber-700">
              · {warning}
            </p>
          ))}
        </div>
      ) : (
        <div className="mt-2 space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">
          <p className="font-medium">✕ {parse.error}</p>
          <p className="text-[10px]">
            {t('card.suggestion', { suggestion: parse.suggestion })}
          </p>
          {parse.position !== undefined ? (
            <p className="text-[10px] text-rose-400">
              {t('card.position', { position: parse.position + 1 })}
            </p>
          ) : null}
        </div>
      )}

      <button
        type="button"
        data-testid="apply-latex"
        disabled={!parse || !parse.ok}
        onClick={() => {
          if (!parse || !parse.ok) {
            return;
          }
          applyStructure(layer.id, parse.structure, text.trim());
          setApplied(true);
          onApplied();
        }}
        className="mt-2 w-full rounded-lg bg-brand-600 px-2 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {t('card.applyLatex')}
      </button>
      {applied ? (
        <p className="mt-1 text-center text-[10px] text-emerald-600">{t('card.applied')}</p>
      ) : null}
    </div>
  );
}

function SymbolicFooter({ expression, engineError }: { expression: string; engineError: string | null }) {
  const { t, locale } = useTranslation();
  const analysis = useSymbolicAnalysis(expression);
  const viewport = useGraphStore((state) => state.viewport);
  if (engineError || expression.trim() === '') {
    return null;
  }
  const visibleRoots =
    analysis.roots?.filter((root) => root >= viewport.xMin && root <= viewport.xMax) ?? [];
  return (
    <div
      data-testid="symbolic-footer"
      className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[10px] text-slate-400"
    >
      <span className="min-w-0">
        f′(x) ={' '}
        <code className="break-all font-mono text-slate-600">{analysis.derivative ?? '—'}</code>
      </span>
      {analysis.loading ? <span>{t('card.symbolicSolving')}</span> : null}
      {!analysis.loading && visibleRoots.length > 0 ? (
        <span className="min-w-0 break-all">
          {t('card.exactRoots')}
          <code className="font-mono text-slate-600">
            {visibleRoots
              .slice(0, 6)
              .map((root) => formatNumber(root))
              .join(locale === 'zh' ? '，' : ', ')}
          </code>
        </span>
      ) : null}
    </div>
  );
}

interface ToolButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  pressed?: boolean;
}

function ToolButton({ label, onClick, children, danger = false, pressed = false }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 ${
        danger ? 'hover:bg-rose-50 hover:text-rose-500' : 'hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}
