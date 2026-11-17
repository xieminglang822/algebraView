import { useEffect, useRef, useState } from 'react';
import { Circle, Ellipse, Plus, SquareFunction, type LucideIcon } from 'lucide-react';
import { MAX_LAYERS } from '../core/templates';
import type { NewLayerKind } from '../core/types';
import { useTranslation } from '../i18n/useLocale';
import { useGraphStore } from '../store/useGraphStore';

export interface AddLayerMenuProps {
  testId: string;
  variant?: 'primary' | 'ghost';
  compact?: boolean;
}

interface MenuOption {
  kind: NewLayerKind;
  labelKey: 'app.menuFunction' | 'app.menuCircle' | 'app.menuEllipse';
  icon: LucideIcon;
  testId: string;
}

const OPTIONS: readonly MenuOption[] = [
  { kind: 'function', labelKey: 'app.menuFunction', icon: SquareFunction, testId: 'add-function' },
  { kind: 'circle', labelKey: 'app.menuCircle', icon: Circle, testId: 'add-circle' },
  { kind: 'ellipse', labelKey: 'app.menuEllipse', icon: Ellipse, testId: 'add-ellipse' },
];

export function AddLayerMenu({
  testId,
  variant = 'primary',
  compact = false,
}: AddLayerMenuProps) {
  const { t } = useTranslation();
  const layers = useGraphStore((state) => state.layers);
  const addLayer = useGraphStore((state) => state.addLayer);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const atCapacity = layers.length >= MAX_LAYERS;

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const select = (kind: NewLayerKind): void => {
    addLayer(kind);
    setOpen(false);
  };

  const triggerClasses =
    variant === 'primary'
      ? 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:bg-slate-300'
      : 'bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50';
  const itemHover =
    'hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('app.addMenu')}
        title={atCapacity ? t('app.addFunctionLimit') : t('app.addMenu')}
        disabled={atCapacity}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed ${triggerClasses}`}
      >
        <Plus size={14} />
        <span className={compact ? 'hidden sm:inline' : ''}>{t('app.add')}</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={t('app.addMenu')}
          className="absolute right-0 z-30 mt-2 w-48 animate-fade-up rounded-xl border border-slate-200 bg-white p-1 shadow-float"
        >
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.kind}
                type="button"
                role="menuitem"
                data-testid={option.testId}
                onClick={() => select(option.kind)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-slate-600 transition ${itemHover}`}
              >
                <Icon size={14} className="text-slate-400" />
                {t(option.labelKey)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
