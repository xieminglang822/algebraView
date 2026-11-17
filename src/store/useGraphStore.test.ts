import { beforeEach, describe, expect, it } from 'vitest';
import { useGraphStore } from './useGraphStore';
import { LAYER_COLORS, MAX_LAYERS, createLayer, resolveLayerExpression } from '../core/templates';
import { DEFAULT_VIEWPORT } from '../canvas/viewport';
import { parseLatex } from '../core/latexParser';

const BASE_LAYER_ID = 'test-layer';

function resetStore(): void {
  const layer = createLayer({
    id: BASE_LAYER_ID,
    label: 'f1',
    color: LAYER_COLORS[0],
    templateId: 'quadratic-standard',
    slots: { a: 1, b: 0, c: -4 },
  });
  useGraphStore.setState({
    layers: [layer],
    activeLayerId: layer.id,
    viewport: { ...DEFAULT_VIEWPORT },
    preferences: { showGrid: true, showFeatures: true, snapEnabled: true },
  });
}

function currentLayer() {
  return useGraphStore.getState().layers.find((layer) => layer.id === BASE_LAYER_ID);
}

describe('useGraphStore', () => {
  beforeEach(resetStore);

  it('starts from a single blue quadratic layer', () => {
    const layer = currentLayer();
    expect(layer?.color).toBe(LAYER_COLORS[0]);
    expect(layer?.label).toBe('f1');
    expect(layer?.visible).toBe(true);
    expect(useGraphStore.getState().activeLayerId).toBe(BASE_LAYER_ID);
  });

  it('adds layers with unique colours up to the limit of eight', () => {
    for (let index = 0; index < MAX_LAYERS + 3; index += 1) {
      useGraphStore.getState().addLayer();
    }
    const layers = useGraphStore.getState().layers;
    expect(layers).toHaveLength(MAX_LAYERS);
    expect(new Set(layers.map((layer) => layer.color)).size).toBe(MAX_LAYERS);
    expect(layers[1]?.color).toBe(LAYER_COLORS[1]);
    expect(useGraphStore.getState().activeLayerId).toBe(layers[layers.length - 1]?.id);
  });

  it('switches templates and resets slots to their defaults', () => {
    useGraphStore.getState().setTemplate(BASE_LAYER_ID, 'sine');
    const layer = currentLayer();
    expect(layer?.templateId).toBe('sine');
    expect(layer?.mode).toBe('slots');
    expect(layer?.slots).toEqual({ a: 1, b: 1, c: 0, d: 0 });
  });

  it('updates slot values and recompiles the curve expression', () => {
    useGraphStore.getState().setSlotValue(BASE_LAYER_ID, 'a', 2);
    useGraphStore.getState().setSlotValue(BASE_LAYER_ID, 'c', 1);
    const layer = currentLayer();
    expect(layer?.slots.a).toBe(2);
    expect(layer?.slots.c).toBe(1);
    expect(layer ? resolveLayerExpression(layer) : '').toBe('2*x^2 + 0*x + 1');
  });

  it('ignores non-finite slot values', () => {
    useGraphStore.getState().setSlotValue(BASE_LAYER_ID, 'a', Number.NaN);
    expect(currentLayer()?.slots.a).toBe(1);
  });

  it('supports polynomial term add / update / remove', () => {
    useGraphStore.getState().setTemplate(BASE_LAYER_ID, 'polynomial');
    const initialTerms = currentLayer()?.terms ?? [];
    expect(initialTerms).toHaveLength(3);

    useGraphStore.getState().addPolynomialTerm(BASE_LAYER_ID);
    expect(currentLayer()?.terms).toHaveLength(4);
    const added = currentLayer()?.terms[3];
    expect(added).toBeDefined();

    if (added) {
      useGraphStore.getState().updatePolynomialTerm(BASE_LAYER_ID, added.id, {
        coefficient: 5,
        exponent: 99,
      });
      const updated = currentLayer()?.terms.find((term) => term.id === added.id);
      expect(updated?.coefficient).toBe(5);
      expect(updated?.exponent).toBe(12);

      useGraphStore.getState().removePolynomialTerm(BASE_LAYER_ID, added.id);
      expect(currentLayer()?.terms).toHaveLength(3);
    }
  });

  it('never removes the last polynomial term', () => {
    useGraphStore.getState().setTemplate(BASE_LAYER_ID, 'polynomial');
    const terms = currentLayer()?.terms ?? [];
    for (const term of terms) {
      useGraphStore.getState().removePolynomialTerm(BASE_LAYER_ID, term.id);
    }
    expect(currentLayer()?.terms).toHaveLength(1);
  });

  it('seeds raw mode from the current structured expression', () => {
    useGraphStore.getState().setInputMode(BASE_LAYER_ID, 'raw');
    const layer = currentLayer();
    expect(layer?.mode).toBe('raw');
    expect(layer?.templateId).toBe('raw');
    expect(layer?.rawExpression).toBe('1*x^2 + 0*x + (-4)');

    useGraphStore.getState().setRawExpression(BASE_LAYER_ID, 'sin(x)/x');
    expect(currentLayer()?.rawExpression).toBe('sin(x)/x');
  });

  it('applies a LaTeX-parsed structure', () => {
    const parsed = parseLatex('y = 2(x - 3)^2 + 1');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    useGraphStore.getState().applyStructure(BASE_LAYER_ID, parsed.structure, 'y = 2(x - 3)^2 + 1');
    const layer = currentLayer();
    expect(layer?.templateId).toBe('quadratic-vertex');
    expect(layer?.slots).toEqual({ a: 2, h: 3, k: 1 });
    expect(layer?.latexSource).toBe('y = 2(x - 3)^2 + 1');
  });

  it('zooms, pans and resets the viewport', () => {
    useGraphStore.getState().zoomAt({ x: 0, y: 0 }, 2);
    const zoomed = useGraphStore.getState().viewport;
    expect(zoomed.xMax - zoomed.xMin).toBeCloseTo(10);
    expect(zoomed.yMax - zoomed.yMin).toBeCloseTo(10);

    useGraphStore.getState().panBy(5, -5);
    const panned = useGraphStore.getState().viewport;
    expect(panned.xMin).toBeCloseTo(-0);
    expect(panned.xMin - zoomed.xMin).toBeCloseTo(5);

    useGraphStore.getState().resetViewport();
    expect(useGraphStore.getState().viewport).toEqual(DEFAULT_VIEWPORT);
  });

  it('removes layers and keeps the active layer valid', () => {
    useGraphStore.getState().addLayer();
    const layers = useGraphStore.getState().layers;
    const second = layers[1];
    expect(second).toBeDefined();
    if (!second) {
      return;
    }
    expect(useGraphStore.getState().activeLayerId).toBe(second.id);
    useGraphStore.getState().removeLayer(second.id);
    expect(useGraphStore.getState().activeLayerId).toBe(BASE_LAYER_ID);
    useGraphStore.getState().removeLayer(BASE_LAYER_ID);
    expect(useGraphStore.getState().layers).toHaveLength(0);
    expect(useGraphStore.getState().activeLayerId).toBe('');
  });

  it('toggles visibility and preferences', () => {
    useGraphStore.getState().toggleLayerVisibility(BASE_LAYER_ID);
    expect(currentLayer()?.visible).toBe(false);
    useGraphStore.getState().togglePreference('showGrid');
    useGraphStore.getState().togglePreference('snapEnabled');
    const preferences = useGraphStore.getState().preferences;
    expect(preferences.showGrid).toBe(false);
    expect(preferences.snapEnabled).toBe(false);
    expect(preferences.showFeatures).toBe(true);
  });

  it('can switch back from raw mode to structured slots', () => {
    useGraphStore.getState().setRawExpression(BASE_LAYER_ID, 'x^3');
    useGraphStore.getState().setInputMode(BASE_LAYER_ID, 'slots');
    const layer = currentLayer();
    expect(layer?.mode).toBe('slots');
    expect(layer?.templateId).toBe('quadratic-standard');
    expect(layer?.slots).toEqual({ a: 1, b: 0, c: -4 });
  });
});
