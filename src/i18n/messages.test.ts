import { afterEach, describe, expect, it } from 'vitest';
import { MESSAGES, translate } from './messages';
import { getActiveLocale, joinList, setActiveLocale, t } from './locale';
import { TEMPLATE_DEFINITIONS, templateLabel } from '../core/templates';
import { parseLatex } from '../core/latexParser';
import { compileExpression } from '../core/mathParser';

afterEach(() => {
  setActiveLocale('zh');
});

describe('i18n messages', () => {
  it('defines the same non-empty keys in both locales', () => {
    const zhKeys = Object.keys(MESSAGES.zh).sort();
    const enKeys = Object.keys(MESSAGES.en).sort();
    expect(enKeys).toEqual(zhKeys);
    for (const key of zhKeys) {
      expect(MESSAGES.zh[key as keyof typeof MESSAGES.zh].trim()).not.toBe('');
      expect(MESSAGES.en[key as keyof typeof MESSAGES.en].trim()).not.toBe('');
    }
  });

  it('interpolates parameters and keeps unknown placeholders', () => {
    expect(translate('en', 'app.layerCount', { count: 2, max: 8 })).toBe('2 / 8 layers');
    expect(translate('zh', 'app.layerCount', { count: 2, max: 8 })).toBe('2 / 8 图层');
    expect(translate('en', 'math.unknownSymbol', { name: 'y' })).toContain('“y”');
  });

  it('joins lists with a locale-aware separator', () => {
    setActiveLocale('zh');
    expect(joinList(['a', 'b'])).toBe('a、b');
    setActiveLocale('en');
    expect(joinList(['a', 'b'])).toBe('a, b');
  });

  it('localizes template names and slot labels', () => {
    setActiveLocale('zh');
    expect(templateLabel('sine')).toBe('正弦函数');
    for (const definition of Object.values(TEMPLATE_DEFINITIONS)) {
      expect(t(definition.nameKey).trim()).not.toBe('');
      for (const slot of definition.slots) {
        expect(t(slot.labelKey).trim()).not.toBe('');
      }
    }
    setActiveLocale('en');
    expect(templateLabel('sine')).toBe('Sine function');
    expect(templateLabel('raw')).toBe('Free expression');
    expect(t('template.slot.sine.a')).toBe('a (amplitude)');
  });

  it('localizes parser errors, suggestions and warnings', () => {
    setActiveLocale('en');
    const invalid = parseLatex('y = \\frac{1}{2');
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error).toContain('Unbalanced braces');
      expect(invalid.suggestion).toContain('Add');
    }

    const warning = parseLatex('x^x');
    expect(warning.ok).toBe(true);
    if (warning.ok) {
      expect(warning.warnings.join(' ')).toContain('free-expression');
    }
  });

  it('localizes math engine errors', () => {
    setActiveLocale('en');
    expect(() => compileExpression('x + y')).toThrow(/Unknown symbol/);
    expect(() => compileExpression('x +')).toThrow(/Incomplete expression/);
    setActiveLocale('zh');
    expect(() => compileExpression('x + y')).toThrow(/未知符号/);
  });

  it('defaults to Chinese when no browser locale is available', () => {
    expect(getActiveLocale()).toBe('zh');
  });
});
