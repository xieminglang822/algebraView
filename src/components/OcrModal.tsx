import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, ImageUp, Loader2, X } from 'lucide-react';
import {
  preprocessImageFile,
  recogniseAndMap,
  resolveOcrProvider,
  type OcrMappingResult,
  type PreprocessedImage,
} from '../core/ocrAdapter';
import { parseLatex, type LatexParseResult } from '../core/latexParser';
import { formatNumber } from '../core/numberFormat';
import { templateLabel } from '../core/templates';
import { useTranslation } from '../i18n/useLocale';
import { useGraphStore } from '../store/useGraphStore';

type OcrStage = 'idle' | 'preprocessing' | 'ready' | 'recognizing' | 'result' | 'error';

export interface OcrModalProps {
  open: boolean;
  layerId: string | null;
  onClose: () => void;
}

export function OcrModal({ open, layerId, onClose }: OcrModalProps) {
  const { t, locale } = useTranslation();
  const layers = useGraphStore((state) => state.layers);
  const applyStructure = useGraphStore((state) => state.applyStructure);
  const layer = layers.find((candidate) => candidate.id === layerId) ?? null;
  const provider = useMemo(() => resolveOcrProvider(), []);
  const providerLabel =
    provider.id === 'mathpix'
      ? t('ocr.provider.mathpix')
      : provider.id === 'demo'
        ? t('ocr.provider.demo')
        : t('ocr.provider.tesseract');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<OcrStage>('idle');
  const [processed, setProcessed] = useState<PreprocessedImage | null>(null);
  const [mapping, setMapping] = useState<OcrMappingResult | null>(null);
  const [latexText, setLatexText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setStage('idle');
    setProcessed(null);
    setMapping(null);
    setLatexText('');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [open, layerId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const parse = useMemo<LatexParseResult | null>(() => {
    if (latexText.trim() === '') {
      return null;
    }
    return parseLatex(latexText, {
      locale,
      ...(layer?.templateId && layer.templateId !== 'raw'
        ? { preferredTemplate: layer.templateId }
        : {}),
    });
  }, [latexText, layer, locale]);

  if (!open || !layer) {
    return null;
  }

  const handleFile = async (file: File | undefined): Promise<void> => {
    if (!file) {
      return;
    }
    setStage('preprocessing');
    setError(null);
    setMapping(null);
    setLatexText('');
    try {
      const next = await preprocessImageFile(file);
      setProcessed(next);
      setStage('ready');
    } catch (caught) {
      setProcessed(null);
      setError(caught instanceof Error ? caught.message : t('ocr.preprocessFailed'));
      setStage('error');
    }
  };

  const handleRecognize = async (): Promise<void> => {
    if (!processed) {
      return;
    }
    setStage('recognizing');
    setError(null);
    try {
      const result = await recogniseAndMap(
        processed,
        provider,
        layer.templateId === 'raw' ? undefined : layer.templateId,
      );
      setMapping(result);
      setLatexText(result.recognition.latex);
      setStage('result');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('ocr.recognizeFailed'));
      setStage('error');
    }
  };

  const handleApply = (): void => {
    if (!parse || !parse.ok) {
      return;
    }
    applyStructure(layer.id, parse.structure, latexText.trim());
    onClose();
  };

  const busy = stage === 'preprocessing' || stage === 'recognizing';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('ocr.dialogAria')}
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl animate-fade-up flex-col overflow-hidden rounded-t-3xl bg-white shadow-float sm:rounded-3xl">
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <Camera size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800">{t('ocr.title')}</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {t('ocr.subtitle', { label: layer.label })}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('ocr.close')}
            onClick={onClose}
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {t('ocr.engine', { provider: providerLabel })}
            </span>
            <span className="text-[10px] text-slate-400">
              {provider.offline ? t('ocr.offlineHint') : t('ocr.cloudHint')}
            </span>
          </div>

          <label
            htmlFor="ocr-file-input"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              void handleFile(file);
            }}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center transition hover:border-brand-300 hover:bg-brand-50/40"
          >
            <ImageUp size={22} className="text-slate-400" />
            <span className="text-xs font-medium text-slate-600">{t('ocr.dropTitle')}</span>
            <span className="text-[10px] text-slate-400">{t('ocr.dropHint')}</span>
            <input
              ref={fileInputRef}
              id="ocr-file-input"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                void handleFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </label>

          {processed ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-slate-500">{t('ocr.preview')}</p>
                <span className="font-mono text-[10px] text-slate-400">
                  {processed.width} × {processed.height}
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <img
                  src={processed.dataUrl}
                  alt={t('ocr.previewAlt')}
                  className="max-h-56 w-full object-contain"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRecognize()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {stage === 'recognizing' ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Camera size={13} />
                  )}
                  {stage === 'recognizing' ? t('ocr.recognizing') : t('ocr.start')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {t('ocr.chooseAnother')}
                </button>
              </div>
            </div>
          ) : null}

          {stage === 'preprocessing' ? (
            <p className="flex items-center gap-2 text-[11px] text-slate-500">
              <Loader2 size={13} className="animate-spin" />
              {t('ocr.preprocessing')}
            </p>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              <p className="font-medium">{t('ocr.errorTitle')}</p>
              <p className="mt-0.5 leading-relaxed">{error}</p>
              <p className="mt-1 text-[10px] text-rose-500">{t('ocr.errorTip')}</p>
            </div>
          ) : null}

          {mapping ? (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold text-slate-600">
                  {t('ocr.resultTitle')}
                </p>
                {mapping.recognition.confidence !== null ? (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500 ring-1 ring-slate-200">
                    {t('ocr.confidence', {
                      value: Math.round(mapping.recognition.confidence * 100),
                    })}
                  </span>
                ) : null}
              </div>
              <textarea
                aria-label={t('ocr.latexAria')}
                data-testid="ocr-latex"
                value={latexText}
                onChange={(event) => setLatexText(event.target.value)}
                rows={2}
                spellCheck={false}
                className={`w-full resize-y rounded-lg border bg-white px-2.5 py-2 font-mono text-[12px] text-slate-800 outline-none transition focus:ring-2 ${
                  parse?.ok === false
                    ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
                    : 'border-slate-200 focus:border-brand-400 focus:ring-brand-100'
                }`}
              />
              {parse === null ? (
                <p className="text-[10px] text-slate-400">{t('ocr.needLatex')}</p>
              ) : parse.ok ? (
                <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-800">
                  <p className="flex items-center gap-1 font-medium">
                    <Check size={12} />
                    {t('ocr.mapping', {
                      template: templateLabel(parse.structure.templateId, locale),
                      slots:
                        Object.entries(parse.structure.slots)
                          .map(([key, value]) => `${key}=${formatNumber(value)}`)
                          .join(locale === 'zh' ? '，' : ', ') || parse.expression,
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
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">
                  <p className="font-medium">{parse.error}</p>
                  <p className="text-[10px]">
                    {t('card.suggestion', { suggestion: parse.suggestion })}
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <footer className="flex items-center gap-2 border-t border-slate-100 bg-white px-5 py-3">
          <p className="mr-auto hidden text-[10px] text-slate-400 sm:block">
            {t('ocr.footer')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50"
          >
            {t('ocr.cancel')}
          </button>
          <button
            type="button"
            data-testid="apply-ocr"
            disabled={!parse || !parse.ok}
            onClick={handleApply}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {t('ocr.apply')}
          </button>
        </footer>
      </div>
    </div>
  );
}
