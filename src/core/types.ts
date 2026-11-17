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

export interface FunctionLayer {
  id: string;
  /** Short display label, e.g. `f1`. */
  label: string;
  color: string;
  visible: boolean;
  templateId: TemplateId;
  mode: InputMode;
  slots: Record<string, number>;
  terms: PolynomialTerm[];
  rawExpression: string;
  /** Last LaTeX string the user typed / OCR produced for this layer. */
  latexSource: string;
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

export type FeatureKind = 'zero' | 'y-intercept' | 'extremum' | 'intersection';

export interface FeaturePoint extends Point {
  kind: FeatureKind;
  label: string;
  layerIds: string[];
}
