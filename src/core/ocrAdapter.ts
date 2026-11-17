import type { LayerStructure } from '../core/types';
import { parseLatex, type LatexParseResult } from '../core/latexParser';
import {
  binarizeForOcr,
  grayscaleFromRgba,
  stretchContrast,
} from './imageProcessing';
import { t } from '../i18n/locale';

export interface OcrImage {
  dataUrl: string;
  width: number;
  height: number;
}

export interface OcrRecognition {
  latex: string;
  provider: string;
  confidence: number | null;
}

export interface MathOcrProvider {
  readonly id: string;
  readonly label: string;
  readonly offline: boolean;
  recognize(image: OcrImage): Promise<OcrRecognition>;
}

export interface PreprocessedImage extends OcrImage {
  imageData: ImageData;
}

export const OCR_MAX_WIDTH = 1024;

/** Grayscales, stretches contrast and applies Otsu binarisation to a source image. */
export function preprocessImageFromSource(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): PreprocessedImage {
  const scale = Math.min(1, OCR_MAX_WIDTH / Math.max(1, sourceWidth));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error(t('ocr.canvasUnavailable'));
  }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const total = width * height;
  const gray = grayscaleFromRgba(pixels);

  stretchContrast(gray);
  const binary = binarizeForOcr(gray, width, height);
  for (let index = 0; index < total; index += 1) {
    const value = binary[index] ?? 255;
    const offset = index * 4;
    pixels[offset] = value;
    pixels[offset + 1] = value;
    pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width,
    height,
    imageData,
  };
}

async function loadImageSource(file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // fall through to the HTMLImageElement path
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(t('ocr.decodeFailed')));
      image.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function preprocessImageFile(file: File): Promise<PreprocessedImage> {
  const loaded = await loadImageSource(file);
  return preprocessImageFromSource(loaded.source, loaded.width, loaded.height);
}

/** Converts Tesseract's plain text output into best-effort LaTeX. */
export function textToLatex(text: string): string {
  let result = text
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/[×⋅·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, '\\pi')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4')
    .replace(/\b(sin|cos|tan|cot|log|ln|sqrt|exp)\s*/gi, (match) => `\\${match.trim().toLowerCase()} `)
    .replace(/\s+/g, ' ')
    .trim();
  result = result.replace(/([xy])([2-9])\b/g, '$1^$2');
  return result;
}

export class TesseractOcrProvider implements MathOcrProvider {
  readonly id = 'tesseract';
  readonly label = t('ocr.provider.tesseract');
  readonly offline = true;

  async recognize(image: OcrImage): Promise<OcrRecognition> {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    try {
      const result = await worker.recognize(image.dataUrl);
      const text = result.data.text.trim();
      if (text === '') {
        throw new Error(t('ocr.emptyText'));
      }
      return {
        latex: textToLatex(text),
        provider: this.label,
        confidence: typeof result.data.confidence === 'number' ? result.data.confidence / 100 : null,
      };
    } finally {
      await worker.terminate();
    }
  }
}

export class MathpixOcrProvider implements MathOcrProvider {
  readonly id = 'mathpix';
  readonly label = t('ocr.provider.mathpix');
  readonly offline = false;
  private readonly appId: string;
  private readonly appKey: string;

  constructor(appId: string, appKey: string) {
    this.appId = appId;
    this.appKey = appKey;
  }

  async recognize(image: OcrImage): Promise<OcrRecognition> {
    const response = await fetch('https://api.mathpix.com/v3/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        app_id: this.appId,
        app_key: this.appKey,
      },
      body: JSON.stringify({
        src: image.dataUrl,
        formats: ['latex_styled', 'text'],
        ocr: ['math', 'text'],
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        t('ocr.mathpixHttp', {
          status: response.status,
          detail: detail ? `${detail.slice(0, 160)} ` : '',
        }),
      );
    }
    const payload: unknown = await response.json();
    const data = payload as {
      latex_styled?: string;
      text?: string;
      confidence?: number;
      error?: string;
    };
    const latex = (data.latex_styled ?? data.text ?? '').trim();
    if (latex === '') {
      throw new Error(data.error ?? t('ocr.mathpixEmpty'));
    }
    return {
      latex,
      provider: this.label,
      confidence: typeof data.confidence === 'number' ? data.confidence : null,
    };
  }
}

/** Development-only provider so the OCR flow can be exercised without network access. */
export class DemoOcrProvider implements MathOcrProvider {
  readonly id = 'demo';
  readonly label = t('ocr.provider.demo');
  readonly offline = true;

  async recognize(): Promise<OcrRecognition> {
    return {
      latex: 'y = 2\\sin(x) + 1',
      provider: this.label,
      confidence: 0.99,
    };
  }
}

export interface OcrConfig {
  mathpixAppId: string;
  mathpixAppKey: string;
  demoMode: boolean;
}

export function readOcrConfig(): OcrConfig {
  const env = import.meta.env;
  return {
    mathpixAppId: env.VITE_MATHPIX_APP_ID ?? '',
    mathpixAppKey: env.VITE_MATHPIX_APP_KEY ?? '',
    demoMode: env.VITE_OCR_DEMO === 'true',
  };
}

export function resolveOcrProvider(config: OcrConfig = readOcrConfig()): MathOcrProvider {
  if (config.demoMode) {
    return new DemoOcrProvider();
  }
  if (config.mathpixAppId.trim() !== '' && config.mathpixAppKey.trim() !== '') {
    return new MathpixOcrProvider(config.mathpixAppId.trim(), config.mathpixAppKey.trim());
  }
  return new TesseractOcrProvider();
}

export interface OcrMappingResult {
  recognition: OcrRecognition;
  parse: LatexParseResult;
}

/** Runs OCR then maps the returned LaTeX onto the structured slot model. */
export async function recogniseAndMap(
  image: OcrImage,
  provider: MathOcrProvider,
  preferredTemplate?: LayerStructure['templateId'],
): Promise<OcrMappingResult> {
  const recognition = await provider.recognize(image);
  const parse = parseLatex(
    recognition.latex,
    preferredTemplate && preferredTemplate !== 'raw' ? { preferredTemplate } : {},
  );
  return { recognition, parse };
}
