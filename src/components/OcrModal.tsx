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
import { useGraphStore } from '../store/useGraphStore';

type OcrStage = 'idle' | 'preprocessing' | 'ready' | 'recognizing' | 'result' | 'error';

export interface OcrModalProps {
  open: boolean;
  layerId: string | null;
  onClose: () => void;
}

export function OcrModal({ open, layerId, onClose }: OcrModalProps) {
  const layers = useGraphStore((state) => state.layers);
  const applyStructure = useGraphStore((state) => state.applyStructure);
  const layer = layers.find((candidate) => candidate.id === layerId) ?? null;
  const provider = useMemo(() => resolveOcrProvider(), []);
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
      preferredTemplate: layer?.templateId ?? 'quadratic-standard',
    });
  }, [latexText, layer]);

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
      setError(caught instanceof Error ? caught.message : '图片预处理失败，请换一张图片。');
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
      setError(
        caught instanceof Error
          ? caught.message
          : '识别失败：请检查网络或换一张更清晰的图片，也可以在卡片「LaTeX」页签手动输入。',
      );
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
      aria-label="拍照识别公式"
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
            <h2 className="text-sm font-semibold text-slate-800">拍照识别公式</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              为 {layer.label}(x) 拍照或上传习题截图，识别结果会先填入槽位供你校对。
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭识别弹窗"
            onClick={onClose}
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              识别引擎：{provider.label}
            </span>
            <span className="text-[10px] text-slate-400">
              {provider.offline
                ? '离线识别，首次运行需联网下载语言包；识别后请校对。'
                : 'Mathpix 云端识别，需要有效的 API 凭证。'}
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
            <span className="text-xs font-medium text-slate-600">
              点击拍照 / 上传图片，或把图片拖到这里
            </span>
            <span className="text-[10px] text-slate-400">
              支持 JPG / PNG，自动灰度化、对比度增强、二值化并压缩到 1024px
            </span>
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
                <p className="text-[11px] font-medium text-slate-500">
                  预处理结果（灰度 + 自适应二值化）
                </p>
                <span className="font-mono text-[10px] text-slate-400">
                  {processed.width} × {processed.height}
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <img
                  src={processed.dataUrl}
                  alt="预处理后的公式图片"
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
                  {stage === 'recognizing' ? '识别中…' : '开始识别'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  重新选择图片
                </button>
              </div>
            </div>
          ) : null}

          {stage === 'preprocessing' ? (
            <p className="flex items-center gap-2 text-[11px] text-slate-500">
              <Loader2 size={13} className="animate-spin" />
              正在预处理图片…
            </p>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              <p className="font-medium">识别未完成</p>
              <p className="mt-0.5 leading-relaxed">{error}</p>
              <p className="mt-1 text-[10px] text-rose-500">
                提示：也可以关闭弹窗，在卡片切换「LaTeX」页签手动输入；或配置
                VITE_MATHPIX_APP_ID / VITE_MATHPIX_APP_KEY 使用高精度云端识别。
              </p>
            </div>
          ) : null}

          {mapping ? (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold text-slate-600">识别结果（可校对后编辑）</p>
                {mapping.recognition.confidence !== null ? (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500 ring-1 ring-slate-200">
                    置信度 {Math.round(mapping.recognition.confidence * 100)}%
                  </span>
                ) : null}
              </div>
              <textarea
                aria-label="识别出的 LaTeX 公式"
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
                <p className="text-[10px] text-slate-400">请补充 LaTeX 公式后再应用。</p>
              ) : parse.ok ? (
                <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-800">
                  <p className="flex items-center gap-1 font-medium">
                    <Check size={12} />
                    将填入「{templateLabel(parse.structure.templateId)}」：
                    {Object.entries(parse.structure.slots)
                      .map(([key, value]) => `${key}=${formatNumber(value)}`)
                      .join('，') || parse.expression}
                  </p>
                  <p className="font-mono text-[10px] text-emerald-700">y = {parse.formula}</p>
                  {parse.warnings.map((warning) => (
                    <p key={warning} className="text-[10px] text-amber-700">
                      · {warning}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">
                  <p className="font-medium">{parse.error}</p>
                  <p className="text-[10px]">建议：{parse.suggestion}</p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <footer className="flex items-center gap-2 border-t border-slate-100 bg-white px-5 py-3">
          <p className="mr-auto hidden text-[10px] text-slate-400 sm:block">
            识别结果不会自动覆盖原函数，确认后点击「应用到槽位」。
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            data-testid="apply-ocr"
            disabled={!parse || !parse.ok}
            onClick={handleApply}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            应用到槽位
          </button>
        </footer>
      </div>
    </div>
  );
}
