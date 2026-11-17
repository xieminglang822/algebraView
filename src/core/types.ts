export type TemplateId =
  | 'polynomial'
  | 'linear'
  | 'quadratic-standard'
  | 'quadratic-vertex'
  | 'sine'
  | 'cosine'
  | 'exponential'
  | 'logarithm'
  | 'raw';

export type InputMode = 'slots' | 'raw';

export interface PolynomialTerm {
  id: string;
  coefficient: number;
  exponent: number;
}

export interface LayerBase {
  id: string;
  /** Short display label, e.g. `f1` for functions or `s1` for shapes. */
  label: string;
  color: string;
  visible: boolean;
}

export interface FunctionLayer extends LayerBase {
  kind: 'function';
  templateId: TemplateId;
  mode: InputMode;
  slots: Record<string, number>;
  terms: PolynomialTerm[];
  rawExpression: string;
  /** Last LaTeX string the user typed / OCR produced for this layer. */
  latexSource: string;
}

export type ShapeType = 'circle' | 'ellipse';

export interface ShapeLayer extends LayerBase {
  kind: 'shape';
  shapeType: ShapeType;
  slots: Record<string, number>;
}

export type Layer = FunctionLayer | ShapeLayer;

export type NewLayerKind = 'function' | ShapeType;

export function isFunctionLayer(layer: Layer): layer is FunctionLayer {
  return layer.kind === 'function';
}

export function isShapeLayer(layer: Layer): layer is ShapeLayer {
  return layer.kind === 'shape';
}

/** Structured payload that can be applied to a layer (LaTeX parser / OCR). */
export interface LayerStructure {
  templateId: TemplateId;
  slots: Record<string, number>;
  terms: PolynomialTerm[];
  rawExpression: string;
}

export interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export type FeatureKind =
  | 'zero'
  | 'y-intercept'
  | 'extremum'
  | 'intersection'
  | 'center'
  | 'vertex'
  | 'focus';

export interface FeaturePoint extends Point {
  kind: FeatureKind;
  label: string;
  layerIds: string[];
}
