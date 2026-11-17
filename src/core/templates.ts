import type { FunctionLayer, LayerStructure, PolynomialTerm, TemplateId } from './types';
import { formatNumber, parenthesise } from './numberFormat';

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
  label: string;
  defaultValue: number;
}

export type TemplateGroup = '多项式' | '三角 / 指对';

export interface TemplateDefinition {
  id: Exclude<TemplateId, 'raw'>;
  name: string;
  group: TemplateGroup;
  description: string;
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

export const TEMPLATE_GROUPS: ReadonlyArray<{ group: TemplateGroup; ids: readonly TemplateId[] }> = [
  {
    group: '多项式',
    ids: ['quadratic-standard', 'quadratic-vertex', 'linear', 'polynomial'],
  },
  {
    group: '三角 / 指对',
    ids: ['sine', 'cosine', 'exponential', 'logarithm'],
  },
];

export const TEMPLATE_DEFINITIONS: Record<Exclude<TemplateId, 'raw'>, TemplateDefinition> = {
  'quadratic-standard': {
    id: 'quadratic-standard',
    name: '二次函数 · 标准式',
    group: '多项式',
    description: 'y = ax² + bx + c',
    slots: [
      { key: 'a', label: 'a（二次项系数）', defaultValue: 1 },
      { key: 'b', label: 'b（一次项系数）', defaultValue: 0 },
      { key: 'c', label: 'c（常数项）', defaultValue: -4 },
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
    name: '二次函数 · 顶点式',
    group: '多项式',
    description: 'y = a(x − h)² + k',
    slots: [
      { key: 'a', label: 'a（开口 / 伸缩）', defaultValue: 1 },
      { key: 'h', label: 'h（左右平移）', defaultValue: 0 },
      { key: 'k', label: 'k（上下平移）', defaultValue: 0 },
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
    name: '一次函数 · 标准式',
    group: '多项式',
    description: 'y = ax + b',
    slots: [
      { key: 'a', label: 'a（斜率）', defaultValue: 1 },
      { key: 'b', label: 'b（y 轴截距）', defaultValue: 0 },
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
    name: '多项式 · 自定义项',
    group: '多项式',
    description: 'y = Σ aᵢxⁿⁱ（可增减项）',
    slots: [],
    // The polynomial template is backed by `layer.terms`, not by fixed slots.
    // `resolveLayerExpression` / `resolveLayerFormula` own its rendering.
    expression: () => '',
    formula: () => 'y = Σ aᵢxⁿⁱ',
  },
  sine: {
    id: 'sine',
    name: '正弦函数',
    group: '三角 / 指对',
    description: 'y = a·sin(bx + c) + d',
    slots: [
      { key: 'a', label: 'a（振幅）', defaultValue: 1 },
      { key: 'b', label: 'b（角频率）', defaultValue: 1 },
      { key: 'c', label: 'c（初相）', defaultValue: 0 },
      { key: 'd', label: 'd（上下平移）', defaultValue: 0 },
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
    name: '余弦函数',
    group: '三角 / 指对',
    description: 'y = a·cos(bx + c) + d',
    slots: [
      { key: 'a', label: 'a（振幅）', defaultValue: 1 },
      { key: 'b', label: 'b（角频率）', defaultValue: 1 },
      { key: 'c', label: 'c（初相）', defaultValue: 0 },
      { key: 'd', label: 'd（上下平移）', defaultValue: 0 },
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
    name: '指数函数',
    group: '三角 / 指对',
    description: 'y = a·bˣ',
    slots: [
      { key: 'a', label: 'a（纵向伸缩）', defaultValue: 1 },
      { key: 'b', label: 'b（底数）', defaultValue: 2 },
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
    name: '对数函数',
    group: '三角 / 指对',
    description: 'y = a·log_b(x)',
    slots: [
      { key: 'a', label: 'a（纵向伸缩）', defaultValue: 1 },
      { key: 'b', label: 'b（底数，需 > 0 且 ≠ 1）', defaultValue: 2 },
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

export function nextLayerColor(layers: readonly FunctionLayer[]): string {
  const used = new Set(layers.map((layer) => layer.color.toLowerCase()));
  const unused = LAYER_COLORS.find((color) => !used.has(color.toLowerCase()));
  if (unused) {
    return unused;
  }
  return LAYER_COLORS[layers.length % LAYER_COLORS.length];
}

export function nextLayerLabel(layers: readonly FunctionLayer[]): string {
  let highest = 0;
  for (const layer of layers) {
    const match = /^f(\d+)$/.exec(layer.label);
    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  }
  return `f${highest + 1}`;
}

export function templateLabel(templateId: TemplateId): string {
  if (templateId === 'raw') {
    return '自由表达式';
  }
  return TEMPLATE_DEFINITIONS[templateId].name;
}
