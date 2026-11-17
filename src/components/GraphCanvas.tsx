import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { LayoutGrid, Magnet, Plus, RotateCcw, Sparkles, ZoomIn, ZoomOut } from 'lucide-react';
import { CoordinateSystem } from '../canvas/CoordinateSystem';
import { drawCurveSegments, sampleCurve } from '../canvas/CurveRenderer';
import { findSnapTarget, type SnapTarget } from '../canvas/snapping';
import { panViewport, zoomViewport } from '../canvas/viewport';
import type { FeatureLayer } from '../core/featureFinder';
import type { SamplePoint } from '../core/mathParser';
import { resolveLayerFormula } from '../core/templates';
import type { CanvasSize, FeaturePoint, Point, Viewport } from '../core/types';
import { useCompiledLayers, type ResolvedLayer } from '../hooks/useCompiledLayers';
import { useFeaturePoints } from '../hooks/useFeaturePoints';
import { useGraphStore, type GraphPreferences } from '../store/useGraphStore';

interface SceneState {
  resolvedLayers: ResolvedLayer[];
  viewport: Viewport;
  size: CanvasSize;
  features: FeaturePoint[];
  activeLayerId: string;
  preferences: GraphPreferences;
}

interface PointerRecord {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
}

const CANVAS_FONT = '11px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const MAX_DPR = 2.5;

export function GraphCanvas() {
  const resolvedLayers = useCompiledLayers();
  const viewport = useGraphStore((state) => state.viewport);
  const activeLayerId = useGraphStore((state) => state.activeLayerId);
  const preferences = useGraphStore((state) => state.preferences);
  const setViewport = useGraphStore((state) => state.setViewport);
  const resetViewport = useGraphStore((state) => state.resetViewport);
  const addLayer = useGraphStore((state) => state.addLayer);
  const setActiveLayer = useGraphStore((state) => state.setActiveLayer);
  const togglePreference = useGraphStore((state) => state.togglePreference);
  const { features, pending } = useFeaturePoints(resolvedLayers, activeLayerId);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const dirtyRef = useRef(false);
  const dprRef = useRef(1);
  const segmentCacheRef = useRef(new Map<string, SamplePoint[][]>());
  const pointersRef = useRef(new Map<number, PointerRecord>());
  const panRef = useRef<{ lastX: number; lastY: number; moved: number } | null>(null);
  const pinchRef = useRef<{ distance: number; midX: number; midY: number } | null>(null);
  const snapRef = useRef<SnapTarget | null>(null);
  const pinnedRef = useRef<SnapTarget | null>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });

  const requestDraw = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    if (!canvas || !scene || scene.size.width <= 0 || scene.size.height <= 0) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, scene.size.width, scene.size.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, scene.size.width, scene.size.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, scene.size.width, scene.size.height);
    ctx.clip();

    const coordinateSystem = new CoordinateSystem(scene.viewport, scene.size, dpr);
    coordinateSystem.draw(ctx, { showGrid: scene.preferences.showGrid });

    const cache = segmentCacheRef.current;
    for (const resolved of scene.resolvedLayers) {
      if (!resolved.layer.visible || !resolved.compiled) {
        continue;
      }
      const cacheKey = [
        resolved.layer.id,
        resolved.expression,
        scene.viewport.xMin,
        scene.viewport.xMax,
        scene.viewport.yMin,
        scene.viewport.yMax,
        scene.size.width,
        scene.size.height,
      ].join('|');
      let segments = cache.get(cacheKey);
      if (!segments) {
        segments = sampleCurve(resolved.compiled, scene.viewport, scene.size);
        cache.set(cacheKey, segments);
        if (cache.size > 64) {
          const oldest = cache.keys().next();
          if (!oldest.done) {
            cache.delete(oldest.value);
          }
        }
      }
      drawCurveSegments(ctx, coordinateSystem, segments, {
        color: resolved.layer.color,
        active: resolved.layer.id === scene.activeLayerId,
      });
    }

    if (scene.preferences.showFeatures) {
      drawFeatureMarkers(ctx, coordinateSystem, scene);
    }

    const snap = snapRef.current ?? pinnedRef.current;
    if (snap && scene.preferences.snapEnabled) {
      drawSnapIndicator(ctx, coordinateSystem, snap, scene);
    }
    ctx.restore();
  }, []);

  const updateSnap = useCallback((pointer: Point | null) => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }
    if (!pointer || !scene.preferences.snapEnabled) {
      snapRef.current = null;
      requestDraw();
      return;
    }
    const coordinateSystem = new CoordinateSystem(scene.viewport, scene.size, 1);
    const featureLayers: FeatureLayer[] = scene.resolvedLayers
      .filter((resolved) => resolved.layer.visible && resolved.compiled !== null)
      .map((resolved) => ({
        id: resolved.layer.id,
        compiled: resolved.compiled as NonNullable<ResolvedLayer['compiled']>,
      }));
    snapRef.current = findSnapTarget(
      pointer,
      featureLayers,
      scene.features,
      (point) => coordinateSystem.toScreen(point),
      (screenX) => coordinateSystem.toWorldX(screenX),
    );
    requestDraw();
  }, [requestDraw]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const width = Math.max(1, Math.floor(entry.contentRect.width));
      const height = Math.max(1, Math.floor(entry.contentRect.height));
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) {
      return;
    }
    const dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
    dprRef.current = dpr;
    const pixelWidth = Math.round(size.width * dpr);
    const pixelHeight = Math.round(size.height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    requestDraw();
  }, [size, requestDraw]);

  useEffect(() => {
    sceneRef.current = {
      resolvedLayers,
      viewport,
      size,
      features,
      activeLayerId,
      preferences,
    };
    requestDraw();
  }, [resolvedLayers, viewport, size, features, activeLayerId, preferences, requestDraw]);

  useEffect(() => {
    snapRef.current = null;
    pinnedRef.current = null;
    requestDraw();
  }, [viewport, resolvedLayers, size, requestDraw]);

  useEffect(() => {
    let frame = 0;
    const loop = (): void => {
      frame = window.requestAnimationFrame(loop);
      if (dirtyRef.current) {
        dirtyRef.current = false;
        drawScene();
      }
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [drawScene]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const handleWheel = (event: WheelEvent): void => {
      const scene = sceneRef.current;
      if (!scene) {
        return;
      }
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const coordinateSystem = new CoordinateSystem(
        scene.viewport,
        { width: rect.width, height: rect.height },
        1,
      );
      const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const anchor = coordinateSystem.toWorld(pointer);
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
      const factor = Math.exp(-event.deltaY * unit * 0.0016);
      setViewport(zoomViewport(scene.viewport, anchor, factor));
      snapRef.current = null;
      pinnedRef.current = null;
      requestDraw();
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [setViewport, requestDraw]);

  const localPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    const point = localPoint(event);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Safari can throw when the pointer is already released.
    }
    pointersRef.current.set(event.pointerId, {
      x: point.x,
      y: point.y,
      startX: point.x,
      startY: point.y,
      startTime: performance.now(),
    });
    if (pointersRef.current.size === 1) {
      panRef.current = { lastX: point.x, lastY: point.y, moved: 0 };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const pointers = [...pointersRef.current.values()];
      const first = pointers[0];
      const second = pointers[1];
      if (first && second) {
        pinchRef.current = {
          distance: Math.hypot(second.x - first.x, second.y - first.y),
          midX: (first.x + second.x) / 2,
          midY: (first.y + second.y) / 2,
        };
      }
      panRef.current = null;
    }
    updateSnap(point);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const point = localPoint(event);
    const record = pointersRef.current.get(event.pointerId);
    if (record) {
      record.x = point.x;
      record.y = point.y;
    }
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }
    const pointers = [...pointersRef.current.values()];

    if (pointers.length >= 2 && pinchRef.current && size.width > 0) {
      const first = pointers[0];
      const second = pointers[1];
      if (!first || !second) {
        return;
      }
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const midX = (first.x + second.x) / 2;
      const midY = (first.y + second.y) / 2;
      const state = useGraphStore.getState();
      const coordinateSystem = new CoordinateSystem(state.viewport, scene.size, 1);
      const anchor = coordinateSystem.toWorld({ x: pinchRef.current.midX, y: pinchRef.current.midY });
      const scale = distance / Math.max(1, pinchRef.current.distance);
      const zoomed = zoomViewport(state.viewport, anchor, scale);
      const next = panViewport(
        zoomed,
        -(midX - pinchRef.current.midX) / coordinateSystem.pixelsPerUnitX,
        (midY - pinchRef.current.midY) / coordinateSystem.pixelsPerUnitY,
      );
      state.setViewport(next);
      pinchRef.current = { distance: Math.max(1, distance), midX, midY };
      snapRef.current = null;
      pinnedRef.current = null;
      requestDraw();
      return;
    }

    if (panRef.current && pointers.length === 1) {
      const deltaX = point.x - panRef.current.lastX;
      const deltaY = point.y - panRef.current.lastY;
      const moved = Math.hypot(deltaX, deltaY);
      if (moved > 0.4) {
        panRef.current.moved += moved;
        const state = useGraphStore.getState();
        const width = scene.size.width;
        const height = scene.size.height;
        const worldWidth = state.viewport.xMax - state.viewport.xMin;
        const worldHeight = state.viewport.yMax - state.viewport.yMin;
        state.setViewport(
          panViewport(
            state.viewport,
            (-deltaX / Math.max(1, width)) * worldWidth,
            (deltaY / Math.max(1, height)) * worldHeight,
          ),
        );
        panRef.current.lastX = point.x;
        panRef.current.lastY = point.y;
        snapRef.current = null;
        pinnedRef.current = null;
        requestDraw();
      }
      return;
    }

    updateSnap(point);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLCanvasElement>, cancelled: boolean): void => {
    const record = pointersRef.current.get(event.pointerId);
    pointersRef.current.delete(event.pointerId);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    if (pointersRef.current.size === 0) {
      const pan = panRef.current;
      const isTap =
        !cancelled &&
        record !== undefined &&
        pan !== null &&
        pan.moved < 4 &&
        performance.now() - record.startTime < 420;
      if (isTap && record) {
        updateSnap({ x: record.x, y: record.y });
        pinnedRef.current = snapRef.current ? { ...snapRef.current } : null;
        requestDraw();
      }
      panRef.current = null;
      pinchRef.current = null;
    } else if (pointersRef.current.size === 1) {
      const remaining = [...pointersRef.current.values()][0];
      if (remaining) {
        panRef.current = { lastX: remaining.x, lastY: remaining.y, moved: 0 };
      }
      pinchRef.current = null;
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    finishPointer(event, false);
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    finishPointer(event, true);
  };

  const handlePointerLeave = (): void => {
    if (pointersRef.current.size === 0) {
      snapRef.current = null;
      requestDraw();
    }
  };

  const zoomBy = (factor: number): void => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }
    const anchor = {
      x: (scene.viewport.xMin + scene.viewport.xMax) / 2,
      y: (scene.viewport.yMin + scene.viewport.yMax) / 2,
    };
    setViewport(zoomViewport(scene.viewport, anchor, factor));
  };

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden bg-white">
      <div ref={containerRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          data-testid="graph-canvas"
          aria-label="函数图像画布"
          className="block h-full w-full cursor-crosshair touch-none select-none outline-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
        />
      </div>

      <div className="pointer-events-none absolute left-3 top-3 hidden rounded-full bg-white/85 px-3 py-1 text-[10px] text-slate-400 shadow-sm ring-1 ring-slate-200 backdrop-blur sm:block">
        滚轮缩放 · 拖拽平移 · 靠近曲线自动吸附取点
      </div>

      {pending ? (
        <div className="pointer-events-none absolute left-3 top-11 rounded-full bg-white/85 px-2.5 py-0.5 text-[10px] text-slate-400 shadow-sm ring-1 ring-slate-200 sm:top-12">
          特征点计算中…
        </div>
      ) : null}

      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <CanvasTool label="放大" testId="zoom-in" onClick={() => zoomBy(1.35)}>
          <ZoomIn size={15} />
        </CanvasTool>
        <CanvasTool label="缩小" testId="zoom-out" onClick={() => zoomBy(1 / 1.35)}>
          <ZoomOut size={15} />
        </CanvasTool>
        <CanvasTool label="重置视图" testId="reset-view" onClick={resetViewport}>
          <RotateCcw size={15} />
        </CanvasTool>
        <span className="my-0.5 h-px bg-slate-200" />
        <CanvasTool
          label="切换网格"
          testId="toggle-grid"
          active={preferences.showGrid}
          onClick={() => togglePreference('showGrid')}
        >
          <LayoutGrid size={15} />
        </CanvasTool>
        <CanvasTool
          label="切换特征点"
          testId="toggle-features"
          active={preferences.showFeatures}
          onClick={() => togglePreference('showFeatures')}
        >
          <Sparkles size={15} />
        </CanvasTool>
        <CanvasTool
          label="切换吸附"
          testId="toggle-snap"
          active={preferences.snapEnabled}
          onClick={() => togglePreference('snapEnabled')}
        >
          <Magnet size={15} />
        </CanvasTool>
      </div>

      {resolvedLayers.length > 0 ? (
        <div className="absolute bottom-3 left-3 max-w-[70%] space-y-1">
          {resolvedLayers.map((resolved) => (
            <button
              key={resolved.layer.id}
              type="button"
              onClick={() => setActiveLayer(resolved.layer.id)}
              className={`flex max-w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[11px] shadow-sm ring-1 backdrop-blur transition ${
                resolved.layer.id === activeLayerId
                  ? 'bg-white text-slate-800 ring-slate-300'
                  : 'bg-white/80 text-slate-500 ring-slate-200 hover:bg-white'
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-0.5 w-4 shrink-0 rounded-full ${resolved.layer.visible ? '' : 'opacity-30'}`}
                style={{ backgroundColor: resolved.layer.color }}
              />
              <span className="shrink-0 font-mono font-medium">{resolved.layer.label}</span>
              <span className="truncate font-mono text-[10px] text-slate-400">
                {resolveLayerFormula(resolved.layer) || '—'}
              </span>
              {resolved.error ? <span className="text-rose-400">⚠</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-white/60">
          <div className="text-center">
            <p className="text-sm font-medium text-slate-600">画布还是空的</p>
            <p className="mt-1 text-xs text-slate-400">添加一个函数图层，开始探索代数与图像。</p>
            <button
              type="button"
              onClick={addLayer}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              <Plus size={14} />
              添加函数
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface CanvasToolProps {
  label: string;
  testId: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}

function CanvasTool({ label, testId, onClick, active, children }: CanvasToolProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-lg shadow-sm ring-1 backdrop-blur transition active:scale-95 ${
        active
          ? 'bg-brand-50 text-brand-600 ring-brand-200'
          : 'bg-white/90 text-slate-500 ring-slate-200 hover:bg-white hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

function layerColorFor(layerId: string | null, scene: SceneState): string {
  if (!layerId) {
    return '#0f172a';
  }
  return scene.resolvedLayers.find((resolved) => resolved.layer.id === layerId)?.layer.color ?? '#0f172a';
}

function featureColor(feature: FeaturePoint, scene: SceneState): string {
  if (feature.kind === 'intersection') {
    return '#0f172a';
  }
  return layerColorFor(feature.layerIds[0] ?? null, scene);
}

function formatCoordinate(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude < 1e-3 || magnitude >= 1e5)) {
    return value.toExponential(2);
  }
  return String(Number(value.toFixed(3)));
}

function drawFeatureMarkers(
  ctx: CanvasRenderingContext2D,
  coordinateSystem: CoordinateSystem,
  scene: SceneState,
): void {
  let labelBudget = 12;
  for (const feature of scene.features) {
    const screen = coordinateSystem.toScreen(feature);
    if (
      screen.x < -20 ||
      screen.y < -20 ||
      screen.x > scene.size.width + 20 ||
      screen.y > scene.size.height + 20
    ) {
      continue;
    }
    const color = featureColor(feature, scene);
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    if (feature.kind === 'zero') {
      ctx.arc(screen.x, screen.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (feature.kind === 'y-intercept') {
      ctx.rect(screen.x - 3.5, screen.y - 3.5, 7, 7);
      ctx.fill();
      ctx.stroke();
    } else if (feature.kind === 'extremum') {
      ctx.moveTo(screen.x, screen.y - 5);
      ctx.lineTo(screen.x + 5, screen.y);
      ctx.lineTo(screen.x, screen.y + 5);
      ctx.lineTo(screen.x - 5, screen.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.moveTo(screen.x - 4, screen.y - 4);
      ctx.lineTo(screen.x + 4, screen.y + 4);
      ctx.moveTo(screen.x + 4, screen.y - 4);
      ctx.lineTo(screen.x - 4, screen.y + 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.restore();

    const belongsToActive =
      feature.kind === 'intersection' ||
      feature.layerIds.includes(scene.activeLayerId) ||
      scene.activeLayerId === '';
    if (belongsToActive && labelBudget > 0) {
      labelBudget -= 1;
      const layerNames = feature.layerIds
        .map(
          (id) =>
            scene.resolvedLayers.find((resolved) => resolved.layer.id === id)?.layer.label ?? '',
        )
        .filter((name) => name !== '')
        .join(' / ');
      const title =
        feature.kind === 'intersection' && layerNames !== ''
          ? `交点 ${layerNames}`
          : feature.label;
      drawBubble(
        ctx,
        { x: screen.x, y: screen.y },
        [title, `(${formatCoordinate(feature.x)}, ${formatCoordinate(feature.y)})`],
        color,
        scene.size,
      );
    }
  }
}

function drawSnapIndicator(
  ctx: CanvasRenderingContext2D,
  coordinateSystem: CoordinateSystem,
  snap: SnapTarget,
  scene: SceneState,
): void {
  const screen = coordinateSystem.toScreen(snap.world);
  if (
    screen.x < 0 ||
    screen.y < 0 ||
    screen.x > scene.size.width ||
    screen.y > scene.size.height
  ) {
    return;
  }
  const color =
    snap.kind === 'curve'
      ? layerColorFor(snap.layerId, scene)
      : snap.kind === 'intersection'
        ? '#0f172a'
        : layerColorFor(snap.layerIds[0] ?? null, scene);

  ctx.save();
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, 10, 0, Math.PI * 2);
  ctx.fillStyle = `${color}22`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const layerName =
    snap.kind === 'curve'
      ? scene.resolvedLayers.find((resolved) => resolved.layer.id === snap.layerId)?.layer.label
      : null;
  const layerNames = snap.layerIds
    .map((id) => scene.resolvedLayers.find((resolved) => resolved.layer.id === id)?.layer.label ?? '')
    .filter((name) => name !== '')
    .join(' / ');
  const title =
    snap.kind === 'curve'
      ? `${layerName ?? ''}(x) 上的点`
      : snap.kind === 'intersection' && layerNames !== ''
        ? `交点 ${layerNames}`
        : snap.label;
  drawBubble(
    ctx,
    { x: screen.x, y: screen.y },
    [title, `(${formatCoordinate(snap.world.x)}, ${formatCoordinate(snap.world.y)})`],
    color,
    scene.size,
  );
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  anchor: Point,
  lines: readonly string[],
  accent: string,
  canvasSize: CanvasSize,
): void {
  ctx.save();
  ctx.font = CANVAS_FONT;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const widths = lines.map((line) => ctx.measureText(line).width);
  const width = Math.min(240, Math.max(84, Math.max(...widths, 0) + 18));
  const height = lines.length * 14 + 10;
  let boxX = anchor.x - width / 2;
  boxX = Math.max(6, Math.min(canvasSize.width - width - 6, boxX));
  let boxY = anchor.y - height - 14;
  if (boxY < 6) {
    boxY = anchor.y + 16;
  }
  boxY = Math.max(6, Math.min(canvasSize.height - height - 6, boxY));

  roundedRectPath(ctx, boxX, boxY, width, height, 8);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.97)';
  ctx.fill();
  ctx.strokeStyle = `${accent}55`;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#334155';
  lines.forEach((line, index) => {
    const text =
      ctx.measureText(line).width > width - 16
        ? `${line.slice(0, Math.max(0, Math.floor(line.length / 2)))}…`
        : line;
    ctx.fillText(text, boxX + 9, boxY + 12 + index * 14);
  });
  ctx.restore();
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
