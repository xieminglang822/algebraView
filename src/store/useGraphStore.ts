import { create } from 'zustand';
import type {
  FunctionLayer,
  Layer,
  LayerStructure,
  NewLayerKind,
  PolynomialTerm,
  ShapeLayer,
  ShapeType,
  TemplateId,
  Viewport,
} from '../core/types';
import {
  LAYER_COLORS,
  MAX_LAYERS,
  MAX_POLYNOMIAL_TERMS,
  createDefaultSlots,
  createDefaultTerms,
  createId,
  createLayer,
  normaliseExponent,
  nextLayerColor,
  nextLayerLabel,
  resolveLayerExpression,
} from '../core/templates';
import {
  createShapeLayer,
  nextShapeLabel,
  normaliseShapeSlotValue,
} from '../core/shapes';
import { DEFAULT_VIEWPORT, panViewport, resetViewport, zoomViewport } from '../canvas/viewport';

export interface GraphPreferences {
  showGrid: boolean;
  showFeatures: boolean;
  snapEnabled: boolean;
}

export interface GraphState {
  layers: Layer[];
  activeLayerId: string;
  viewport: Viewport;
  preferences: GraphPreferences;
  addLayer: (kind?: NewLayerKind) => void;
  removeLayer: (layerId: string) => void;
  setActiveLayer: (layerId: string) => void;
  toggleLayerVisibility: (layerId: string) => void;
  setShapeType: (layerId: string, shapeType: ShapeType) => void;
  setTemplate: (layerId: string, templateId: TemplateId) => void;
  setSlotValue: (layerId: string, slotKey: string, value: number) => void;
  addPolynomialTerm: (layerId: string) => void;
  removePolynomialTerm: (layerId: string, termId: string) => void;
  updatePolynomialTerm: (
    layerId: string,
    termId: string,
    patch: Partial<Omit<PolynomialTerm, 'id'>>,
  ) => void;
  setInputMode: (layerId: string, mode: 'slots' | 'raw') => void;
  setRawExpression: (layerId: string, expression: string) => void;
  applyStructure: (layerId: string, structure: LayerStructure, latexSource?: string) => void;
  setViewport: (viewport: Viewport) => void;
  resetViewport: () => void;
  zoomAt: (anchor: { x: number; y: number }, scale: number) => void;
  panBy: (deltaX: number, deltaY: number) => void;
  togglePreference: (key: keyof GraphPreferences) => void;
}

const INITIAL_LAYER = createLayer({
  label: 'f1',
  color: LAYER_COLORS[0],
  templateId: 'quadratic-standard',
  slots: { a: 1, b: 0, c: -4 },
});

function replaceLayer(
  state: GraphState,
  layerId: string,
  update: (layer: Layer) => Layer,
): Partial<GraphState> {
  return {
    layers: state.layers.map((layer) => (layer.id === layerId ? update(layer) : layer)),
  };
}

function replaceFunctionLayer(
  state: GraphState,
  layerId: string,
  update: (layer: FunctionLayer) => FunctionLayer,
): Partial<GraphState> {
  return replaceLayer(state, layerId, (layer) =>
    layer.kind === 'function' ? update(layer) : layer,
  );
}

function replaceShapeLayer(
  state: GraphState,
  layerId: string,
  update: (layer: ShapeLayer) => ShapeLayer,
): Partial<GraphState> {
  return replaceLayer(state, layerId, (layer) =>
    layer.kind === 'shape' ? update(layer) : layer,
  );
}

function shapeSlotsForType(
  current: ShapeLayer,
  shapeType: ShapeType,
): Record<string, number> {
  const h = current.slots.h ?? 0;
  const k = current.slots.k ?? 0;
  if (shapeType === 'circle') {
    const radius = current.shapeType === 'circle' ? (current.slots.r ?? 3) : (current.slots.a ?? 3);
    return { h, k, r: radius };
  }
  if (current.shapeType === 'ellipse') {
    return {
      h,
      k,
      a: current.slots.a ?? 3,
      b: current.slots.b ?? 2,
      theta: current.slots.theta ?? 0,
    };
  }
  const radius = current.slots.r ?? 3;
  return { h, k, a: radius, b: Math.max(0.1, radius * 0.7), theta: 0 };
}

export const useGraphStore = create<GraphState>()((set) => ({
  layers: [INITIAL_LAYER],
  activeLayerId: INITIAL_LAYER.id,
  viewport: { ...DEFAULT_VIEWPORT },
  preferences: {
    showGrid: true,
    showFeatures: true,
    snapEnabled: true,
  },

  addLayer: (kind = 'function') => {
    set((state) => {
      if (state.layers.length >= MAX_LAYERS) {
        return state;
      }
      if (kind === 'function') {
        const layer = createLayer({
          label: nextLayerLabel(state.layers),
          color: nextLayerColor(state.layers),
          templateId: 'quadratic-standard',
        });
        return { layers: [...state.layers, layer], activeLayerId: layer.id };
      }
      const layer = createShapeLayer({
        label: nextShapeLabel(state.layers),
        color: nextLayerColor(state.layers),
        shapeType: kind,
      });
      return { layers: [...state.layers, layer], activeLayerId: layer.id };
    });
  },

  removeLayer: (layerId) => {
    set((state) => {
      const layers = state.layers.filter((layer) => layer.id !== layerId);
      const activeLayerId =
        state.activeLayerId === layerId ? (layers[0]?.id ?? '') : state.activeLayerId;
      return { layers, activeLayerId };
    });
  },

  setActiveLayer: (layerId) => {
    set((state) =>
      state.layers.some((layer) => layer.id === layerId) ? { activeLayerId: layerId } : state,
    );
  },

  toggleLayerVisibility: (layerId) => {
    set((state) =>
      replaceLayer(state, layerId, (layer) => ({ ...layer, visible: !layer.visible })),
    );
  },

  setShapeType: (layerId, shapeType) => {
    set((state) =>
      replaceShapeLayer(state, layerId, (layer) => ({
        ...layer,
        shapeType,
        slots: shapeSlotsForType(layer, shapeType),
      })),
    );
  },

  setTemplate: (layerId, templateId) => {
    set((state) =>
      replaceFunctionLayer(state, layerId, (layer) => {
        if (templateId === 'raw') {
          const rawExpression = resolveLayerExpression(layer);
          return { ...layer, templateId: 'raw', mode: 'raw', rawExpression, slots: {} };
        }
        return {
          ...layer,
          templateId,
          mode: 'slots',
          slots: createDefaultSlots(templateId),
          terms: templateId === 'polynomial' ? createDefaultTerms() : layer.terms,
          rawExpression: '',
        };
      }),
    );
  },

  setSlotValue: (layerId, slotKey, value) => {
    if (!Number.isFinite(value)) {
      return;
    }
    set((state) =>
      replaceLayer(state, layerId, (layer) => {
        if (layer.kind === 'shape') {
          return {
            ...layer,
            slots: {
              ...layer.slots,
              [slotKey]: normaliseShapeSlotValue(layer.shapeType, slotKey, value),
            },
          };
        }
        return { ...layer, mode: 'slots', slots: { ...layer.slots, [slotKey]: value } };
      }),
    );
  },

  addPolynomialTerm: (layerId) => {
    set((state) =>
      replaceFunctionLayer(state, layerId, (layer) => {
        if (layer.terms.length >= MAX_POLYNOMIAL_TERMS) {
          return layer;
        }
        const usedExponents = new Set(layer.terms.map((term) => term.exponent));
        const exponent = [1, 2, 3, 0].find((candidate) => !usedExponents.has(candidate)) ?? 1;
        return {
          ...layer,
          templateId: 'polynomial',
          mode: 'slots',
          terms: [...layer.terms, { id: createId('term'), coefficient: 1, exponent }],
        };
      }),
    );
  },

  removePolynomialTerm: (layerId, termId) => {
    set((state) =>
      replaceFunctionLayer(state, layerId, (layer) => {
        if (layer.terms.length <= 1) {
          return layer;
        }
        return { ...layer, terms: layer.terms.filter((term) => term.id !== termId) };
      }),
    );
  },

  updatePolynomialTerm: (layerId, termId, patch) => {
    set((state) =>
      replaceFunctionLayer(state, layerId, (layer) => ({
        ...layer,
        mode: 'slots',
        terms: layer.terms.map((term) => {
          if (term.id !== termId) {
            return term;
          }
          const coefficient =
            patch.coefficient !== undefined && Number.isFinite(patch.coefficient)
              ? patch.coefficient
              : term.coefficient;
          const exponent =
            patch.exponent !== undefined ? normaliseExponent(patch.exponent) : term.exponent;
          return { ...term, coefficient, exponent };
        }),
      })),
    );
  },

  setInputMode: (layerId, mode) => {
    set((state) =>
      replaceFunctionLayer(state, layerId, (layer) => {
        if (mode === 'raw') {
          const rawExpression = layer.rawExpression.trim() || resolveLayerExpression(layer);
          return {
            ...layer,
            mode: 'raw',
            templateId: 'raw',
            rawExpression,
            slots: {},
          };
        }
        if (layer.templateId === 'raw') {
          return {
            ...layer,
            mode: 'slots',
            templateId: 'quadratic-standard',
            slots: createDefaultSlots('quadratic-standard'),
            terms: createDefaultTerms(),
          };
        }
        return { ...layer, mode: 'slots' };
      }),
    );
  },

  setRawExpression: (layerId, expression) => {
    set((state) =>
      replaceFunctionLayer(state, layerId, (layer) => ({
        ...layer,
        mode: 'raw',
        templateId: 'raw',
        rawExpression: expression,
        slots: {},
      })),
    );
  },

  applyStructure: (layerId, structure, latexSource = '') => {
    set((state) =>
      replaceFunctionLayer(state, layerId, (layer) => ({
        ...layer,
        templateId: structure.templateId,
        mode: structure.templateId === 'raw' ? 'raw' : 'slots',
        slots: { ...createDefaultSlots(structure.templateId), ...structure.slots },
        terms: structure.terms.map((term) => ({ ...term })),
        rawExpression: structure.rawExpression,
        latexSource,
      })),
    );
  },

  setViewport: (viewport) => {
    set({ viewport });
  },

  resetViewport: () => {
    set({ viewport: resetViewport() });
  },

  zoomAt: (anchor, scale) => {
    set((state) => ({ viewport: zoomViewport(state.viewport, anchor, scale) }));
  },

  panBy: (deltaX, deltaY) => {
    set((state) => ({ viewport: panViewport(state.viewport, deltaX, deltaY) }));
  },

  togglePreference: (key) => {
    set((state) => ({
      preferences: { ...state.preferences, [key]: !state.preferences[key] },
    }));
  },
}));
