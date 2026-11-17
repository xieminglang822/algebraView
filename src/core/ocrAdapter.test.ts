import { describe, expect, it } from 'vitest';
import {
  DemoOcrProvider,
  MathpixOcrProvider,
  TesseractOcrProvider,
  recogniseAndMap,
  resolveOcrProvider,
  textToLatex,
} from './ocrAdapter';
import { parseLatex } from './latexParser';

describe('ocrAdapter config', () => {
  it('uses the demo provider when demo mode is on', () => {
    const provider = resolveOcrProvider({ mathpixAppId: '', mathpixAppKey: '', demoMode: true });
    expect(provider).toBeInstanceOf(DemoOcrProvider);
  });

  it('prefers Mathpix when both credentials are present', () => {
    const provider = resolveOcrProvider({
      mathpixAppId: ' app-id ',
      mathpixAppKey: ' app-key ',
      demoMode: false,
    });
    expect(provider).toBeInstanceOf(MathpixOcrProvider);
  });

  it('falls back to Tesseract without credentials', () => {
    expect(
      resolveOcrProvider({ mathpixAppId: '', mathpixAppKey: 'key', demoMode: false }),
    ).toBeInstanceOf(TesseractOcrProvider);
  });
});

describe('ocrAdapter text conversion', () => {
  it('normalises OCR text into LaTeX-friendly math', () => {
    const latex = textToLatex('y = 2 sin(x) × 3');
    expect(latex).toContain('\\sin');
    expect(latex).toContain('*');
    expect(textToLatex('x² + 1')).toBe('x^2 + 1');
  });

  it('parses a Tesseract-style reading into sine slots', () => {
    const latex = textToLatex('y =2sin(x) + 1');
    const result = parseLatex(latex);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.structure.templateId).toBe('sine');
      expect(result.structure.slots).toEqual({ a: 2, b: 1, c: 0, d: 1 });
    }
  });
});

describe('ocrAdapter pipeline', () => {
  it('recognises and maps a demo reading onto the structured model', async () => {
    const mapping = await recogniseAndMap(
      { dataUrl: 'data:image/png;base64,AAAA', width: 10, height: 10 },
      new DemoOcrProvider(),
      'quadratic-standard',
    );
    expect(mapping.recognition.latex).toContain('sin');
    expect(mapping.parse.ok).toBe(true);
    if (mapping.parse.ok) {
      expect(mapping.parse.structure.templateId).toBe('sine');
      expect(mapping.parse.structure.slots).toEqual({ a: 2, b: 1, c: 0, d: 1 });
    }
  });
});
