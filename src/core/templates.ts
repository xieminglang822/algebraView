import type { FunctionLayer, LayerStructure, PolynomialTerm, TemplateId } from './types';
import { formatNumber, parenthesise } from './numberFormat';
import { getActiveLocale } from '../i18n/locale';
import { translate, type Locale, type TranslationKey } from '../i18n/messages';

export const MAX_LAYERS = 8;
export const MAX_POLYNOMIAL_TERMS = 12;
export const MAX_POLYNOMIAL_DEGREE = 12;

/**
 * High-contrast palette from the specification. The order is rotated so the
 * first layer is blue and the second red, matching the acceptance scenarios
 * (UC-01 / UC-02) while still assigning every layer a unique colour.
 */
export const LAYER_COLORS = [
  '#3B82F6',
  '#EF4444',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#F97316',
] as const;

export const DEFAULT_SLIDER = {
  min: -10,
  max: 10,
  step: 0.5,
} as const;

export type LayerColor = (typeof LAYER_COLORS)[number];

export interface SlotDefinition {
  key: string;
  labelKey: TranslationKey;
  defaultValue: number;
}

export type TemplateGroup = 'polynomial' | 'trig';

export interface TemplateDefinition {
  id: Exclude<TemplateId, 'raw'>;
  nameKey: TranslationKey;
  group: TemplateGroup;
  slots: readonly SlotDefinition[];
  /** mathjs-compatible expression. */
  expression(slots: Readonly<Record<string, number>>): string;
  /** Human readable formula using unicode superscripts. */
  formula(slots: Readonly<Record<string, number>>): string;
}

const SUPERSCRIPT_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function superscript(value: number): string {
  if (!Number.isInteger(value) || value < 0) {
    return value >= 0 ? `^${formatNumber(value)}` : `^(${formatNumber(value)})`;
  }
  return String(value)
    .split('')
    .map((digit) => SUPERSCRIPT_DIGITS[Number(digit)] ?? digit)
    .join('');
}

function variablePower(exponent: number): string {
  if (exponent === 0) {
    return '';
  }
  if (exponent === 1) {
    return 'x';
  }
  return `x${superscript(exponent)}`;
}

interface DisplayTerm {
  coefficient: number;
  body: string;
}

function joinDisplayTerms(terms: readonly DisplayTerm[]): string {
  const parts: string[] = [];
  for (const term of terms) {
    if (term.coefficient === 0) {
      continue;
    }
    const magnitude = Math.abs(term.coefficient);
    const coefficientText =
      term.body === '' ? formatNumber(magnitude) : magnitude === 1 ? '' : formatNumber(magnitude);
    const text = `${coefficientText}${term.body}`;
    if (parts.length === 0) {
      parts.push(term.coefficient < 0 ? `−${text}` : text);
    } else {
      parts.push(`${term.coefficient < 0 ? '−' : '+'} ${text}`);
    }
  }
  return parts.length > 0 ? parts.join(' ') : '0';
}

function affineDisplay(coefficient: number, constant: number): string {
  const terms: DisplayTerm[] = [];
  if (coefficient !== 0) {
    terms.push({ coefficient, body: 'x' });
  }
  if (constant !== 0 || coefficient === 0) {
    terms.push({ coefficient: constant, body: '' });
  }
  return joinDisplayTerms(terms);
}

export function polynomialDisplayTerms(terms: readonly PolynomialTerm[]): string {
  const sorted = [...terms].sort((a, b) => b.exponent - a.exponent);
  return joinDisplayTerms(
    sorted.map((term) => ({ coefficient: term.coefficient, body: variablePower(term.exponent) })),
  );
}

export function polynomialExpressionFromTerms(terms: readonly PolynomialTerm[]): string {
  const sorted = [...terms]
    .filter((term) => Number.isFinite(term.coefficient) && term.coefficient !== 0)
    .sort((a, b) => b.exponent - a.exponent);

  const parts = sorted.map((term, index) => {
    const sign = term.coefficient < 0 ? '-' : '+';
    const magnitude = Math.abs(term.coefficient);
    const power = term.exponent === 0 ? '' : term.exponent === 1 ? 'x' : `x^${term.exponent}`;
    const coefficient = power === '' ? formatNumber(magnitude) : magnitude === 1 ? '' : `${formatNumber(magnitude)}*`;
    const body = `${coefficient}${power}`;
    if (index === 0) {
      return sign === '-' ? `-${body}` : body;
    }
    return ` ${sign} ${body}`;
  });

  return parts.length > 0 ? parts.join('') : '0';
}

export const TEMPLATE_GROUPS: ReadonlyArray<{
  groupKey: TranslationKey;
  ids: readonly TemplateId[];
}> = [
  {
    groupKey: 'template.group.polynomial',
    ids: ['quadratic-standard', 'quadratic-vertex', 'linear', 'polynomial'],
  },
  {
    groupKey: 'template.group.trig',
    ids: ['sine', 'cosine', 'exponential', 'logarithm'],
  },
];

export const TEMPLATE_DEFINITIONS: Record<Exclude<TemplateId, 'raw'>, TemplateDefinition> = {
  'quadratic-standard': {
    id: 'quadratic-standard',
    nameKey: 'template.quadratic-standard.name',
    group: 'polynomial',
    slots: [
      { key: 'a', labelKey: 'template.slot.quadratic-standard.a', defaultValue: 1 },
      { key: 'b', labelKey: 'template.slot.quadratic-standard.b', defaultValue: 0 },
      { key: 'c', labelKey: 'template.slot.quadratic-standard.c', defaultValue: -4 },
    ],
    expression: (slots) =>
      `${parenthesise(slots.a ?? 0)}*x^2 + ${parenthesise(slots.b ?? 0)}*x + ${parenthesise(slots.c ?? 0)}`,
    formula: (slots) =>
      joinDisplayTerms([
        { coefficient: slots.a ?? 0, body: 'x²' },
        { coefficient: slots.b ?? 0, body: 'x' },
        { coefficient: slots.c ?? 0, body: '' },
      ]),
  },
  'quadratic-vertex': {
    id: 'quadratic-vertex',
    nameKey: 'template.quadratic-vertex.name',
    group: 'polynomial',
    slots: [
      { key: 'a', labelKey: 'template.slot.quadratic-vertex.a', defaultValue: 1 },
      { key: 'h', labelKey: 'template.slot.quadratic-vertex.h', defaultValue: 0 },
      { key: 'k', labelKey: 'template.slot.quadratic-vertex.k', defaultValue: 0 },
    ],
    expression: (slots) =>
      `${parenthesise(slots.a ?? 0)}*(x - ${parenthesise(slots.h ?? 0)})^2 + ${parenthesise(slots.k ?? 0)}`,
    formula: (slots) => {
      const h = slots.h ?? 0;
      const k = slots.k ?? 0;
      const shift = h === 0 ? 'x²' : h > 0 ? `(x − ${formatNumber(h)})²` : `(x + ${formatNumber(-h)})²`;
      return joinDisplayTerms([
        { coefficient: slots.a ?? 0, body: shift },
        { coefficient: k, body: '' },
      ]);
    },
  },
  linear: {
    id: 'linear',
    nameKey: 'template.linear.name',
    group: 'polynomial',
    slots: [
      { key: 'a', labelKey: 'template.slot.linear.a', defaultValue: 1 },
      { key: 'b', labelKey: 'template.slot.linear.b', defaultValue: 0 },
    ],
    expression: (slots) => `${parenthesise(slots.a ?? 0)}*x + ${parenthesise(slots.b ?? 0)}`,
    formula: (slots) =>
      joinDisplayTerms([
        { coefficient: slots.a ?? 0, body: 'x' },
        { coefficient: slots.b ?? 0, body: '' },
      ]),
  },
  polynomial: {
    id: 'polynomial',
    nameKey: 'template.polynomial.name',
    group: 'polynomial',
    slots: [],
    // The polynomial template is backed by `layer.terms`, not by fixed slots.
    // `resolveLayerExpression` / `resolveLayerFormula` own its rendering.
    expression: () => '',
    formula: () => 'y = Σ aᵢxⁿⁱ',
  },
  sine: {
    id: 'sine',
    nameKey: 'template.sine.name',
    group: 'trig',
    slots: [
      { key: 'a', labelKey: 'template.slot.sine.a', defaultValue: 1 },
      { key: 'b', labelKey: 'template.slot.sine.b', defaultValue: 1 },
      { key: 'c', labelKey: 'template.slot.sine.c', defaultValue: 0 },
      { key: 'd', labelKey: 'template.slot.sine.d', defaultValue: 0 },
    ],
    expression: (slots) =>
      `${parenthesise(slots.a ?? 0)}*sin(${parenthesise(slots.b ?? 0)}*x + ${parenthesise(slots.c ?? 0)}) + ${parenthesise(slots.d ?? 0)}`,
    formula: (slots) =>
      joinDisplayTerms([
        {
          coefficient: slots.a ?? 0,
          body: `sin(${affineDisplay(slots.b ?? 0, slots.c ?? 0)})`,
        },
        { coefficient: slots.d ?? 0, body: '' },
      ]),
  },
  cosine: {
    id: 'cosine',
    nameKey: 'template.cosine.name',
    group: 'trig',
    slots: [
      { key: 'a', labelKey: 'template.slot.cosine.a', defaultValue: 1 },
      { key: 'b', labelKey: 'template.slot.cosine.b', defaultValue: 1 },
      { key: 'c', labelKey: 'template.slot.cosine.c', defaultValue: 0 },
      { key: 'd', labelKey: 'template.slot.cosine.d', defaultValue: 0 },
    ],
    expression: (slots) =>
      `${parenthesise(slots.a ?? 0)}*cos(${parenthesise(slots.b ?? 0)}*x + ${parenthesise(slots.c ?? 0)}) + ${parenthesise(slots.d ?? 0)}`,
    formula: (slots) =>
      joinDisplayTerms([
        {
          coefficient: slots.a ?? 0,
          body: `cos(${affineDisplay(slots.b ?? 0, slots.c ?? 0)})`,
        },
        { coefficient: slots.d ?? 0, body: '' },
      ]),
  },
  exponential: {
    id: 'exponential',
    nameKey: 'template.exponential.name',
    group: 'trig',
    slots: [
      { key: 'a', labelKey: 'template.slot.exponential.a', defaultValue: 1 },
      { key: 'b', labelKey: 'template.slot.exponential.b', defaultValue: 2 },
    ],
    expression: (slots) => `${parenthesise(slots.a ?? 0)}*(${parenthesise(slots.b ?? 0)})^x`,
    formula: (slots) => {
      const a = slots.a ?? 0;
      const b = slots.b ?? 0;
      const power = `${formatNumber(b)}^x`;
      if (a === 0) {
        return '0';
      }
      return a === 1 ? power : `${formatNumber(a)}·${power}`;
    },
  },
  logarithm: {
    id: 'logarithm',
    nameKey: 'template.logarithm.name',
    group: 'trig',
    slots: [
      { key: 'a', labelKey: 'template.slot.logarithm.a', defaultValue: 1 },
      { key: 'b', labelKey: 'template.slot.logarithm.b', defaultValue: 2 },
    ],
    expression: (slots) => `${parenthesise(slots.a ?? 0)}*log(x, ${parenthesise(slots.b ?? 0)})`,
    formula: (slots) => {
      const a = slots.a ?? 0;
      const b = slots.b ?? 0;
      const body = `log_${formatNumber(b)}(x)`;
      if (a === 0) {
        return '0';
      }
      return a === 1 ? body : `${formatNumber(a)}·${body}`;
    },
  },
};

export function getTemplate(templateId: TemplateId): TemplateDefinition | null {
  if (templateId === 'raw') {
    return null;
  }
  return TEMPLATE_DEFINITIONS[templateId];
}

export function createDefaultSlots(templateId: TemplateId): Record<string, number> {
  const template = getTemplate(templateId);
  if (!template) {
    return {};
  }
  const slots: Record<string, number> = {};
  for (const slot of template.slots) {
    slots[slot.key] = slot.defaultValue;
  }
  return slots;
}

export function createDefaultTerms(): PolynomialTerm[] {
  return [
    { id: createId('term'), coefficient: 1, exponent: 2 },
    { id: createId('term'), coefficient: 0, exponent: 1 },
    { id: createId('term'), coefficient: -4, exponent: 0 },
  ];
}

export function createId(prefix: string): string {
  const cryptoObject = globalThis.crypto as Crypto | undefined;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return `${prefix}-${cryptoObject.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreateLayerOptions {
  id?: string;
  label: string;
  color: string;
  templateId?: TemplateId;
  slots?: Readonly<Record<string, number>>;
  terms?: readonly PolynomialTerm[];
  rawExpression?: string;
  latexSource?: string;
}

export function createLayer(options: CreateLayerOptions): FunctionLayer {
  const templateId = options.templateId ?? 'quadratic-standard';
  const slots = { ...createDefaultSlots(templateId), ...options.slots };
  return {
    kind: 'function',
    id: options.id ?? createId('layer'),
    label: options.label,
    color: options.color,
    visible: true,
    templateId,
    mode: 'slots',
    slots,
    terms: options.terms ? [...options.terms] : createDefaultTerms(),
    rawExpression: options.rawExpression ?? '',
    latexSource: options.latexSource ?? '',
  };
}

export function normaliseExponent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(MAX_POLYNOMIAL_DEGREE, Math.max(0, Math.round(value)));
}

export function resolveLayerExpression(layer: FunctionLayer): string {
  if (layer.mode === 'raw' || layer.templateId === 'raw') {
    return layer.rawExpression.trim();
  }
  if (layer.templateId === 'polynomial') {
    return polynomialExpressionFromTerms(layer.terms);
  }
  const template = getTemplate(layer.templateId);
  if (!template) {
    return '';
  }
  const slots = { ...createDefaultSlots(layer.templateId), ...layer.slots };
  return template.expression(slots);
}

export function resolveLayerFormula(layer: FunctionLayer): string {
  if (layer.mode === 'raw' || layer.templateId === 'raw') {
    return layer.rawExpression.trim() || 'y = …';
  }
  if (layer.templateId === 'polynomial') {
    return polynomialDisplayTerms(layer.terms);
  }
  const template = getTemplate(layer.templateId);
  if (!template) {
    return '';
  }
  const slots = { ...createDefaultSlots(layer.templateId), ...layer.slots };
  return template.formula(slots);
}

export function structureToExpression(structure: LayerStructure): string {
  if (structure.templateId === 'raw') {
    return structure.rawExpression.trim();
  }
  if (structure.templateId === 'polynomial') {
    return polynomialExpressionFromTerms(structure.terms);
  }
  const template = getTemplate(structure.templateId);
  if (!template) {
    return '';
  }
  const slots = { ...createDefaultSlots(structure.templateId), ...structure.slots };
  return template.expression(slots);
}

export function structureToFormula(structure: LayerStructure): string {
  if (structure.templateId === 'raw') {
    return structure.rawExpression.trim() || 'y = …';
  }
  if (structure.templateId === 'polynomial') {
    return polynomialDisplayTerms(structure.terms);
  }
  const template = getTemplate(structure.templateId);
  if (!template) {
    return '';
  }
  const slots = { ...createDefaultSlots(structure.templateId), ...structure.slots };
  return template.formula(slots);
}

export function nextLayerColor(layers: readonly { color: string }[]): string {
  const used = new Set(layers.map((layer) => layer.color.toLowerCase()));
  const unused = LAYER_COLORS.find((color) => !used.has(color.toLowerCase()));
  if (unused) {
    return unused;
  }
  return LAYER_COLORS[layers.length % LAYER_COLORS.length];
}

export function nextLayerLabel(layers: readonly { label: string }[]): string {
  let highest = 0;
  for (const layer of layers) {
    const match = /^f(\d+)$/.exec(layer.label);
    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  }
  return `f${highest + 1}`;
}

export function templateLabel(
  templateId: TemplateId,
  locale: Locale = getActiveLocale(),
): string {
  if (templateId === 'raw') {
    return translate(locale, 'template.raw.name');
  }
  return translate(locale, TEMPLATE_DEFINITIONS[templateId].nameKey);
}
