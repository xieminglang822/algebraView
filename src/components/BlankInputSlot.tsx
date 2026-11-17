import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react';
import { clamp, formatNumber, snapToStep } from '../core/numberFormat';

export interface BlankInputSlotProps {
  slotKey: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  sliderMin?: number;
  sliderMax?: number;
  accentColor?: string;
  showSlider?: boolean;
  ariaLabel?: string;
}

/**
 * Controlled numeric blank with stepper buttons and a collapsible slider.
 * Keeps a local draft so intermediate typing states (`-`, `0.`) are not lost.
 */
export function BlankInputSlot({
  slotKey,
  label,
  value,
  onChange,
  step = 0.5,
  min = -1e9,
  max = 1e9,
  sliderMin = -10,
  sliderMax = 10,
  accentColor = '#4f46e5',
  showSlider = true,
  ariaLabel,
}: BlankInputSlotProps) {
  const [draft, setDraft] = useState(() => formatNumber(value));
  const [focused, setFocused] = useState(false);
  const [sliderOpen, setSliderOpen] = useState(true);

  useEffect(() => {
    if (!focused) {
      setDraft(formatNumber(value));
    }
  }, [value, focused]);

  const commit = (next: number): void => {
    if (!Number.isFinite(next)) {
      return;
    }
    onChange(clamp(next, min, max));
  };

  const stepBy = (direction: 1 | -1): void => {
    commit(snapToStep(value + direction * step, step));
  };

  const sliderValue = clamp(value, sliderMin, sliderMax);

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white/80 p-2.5 shadow-sm transition-colors focus-within:border-brand-300 focus-within:bg-white">
      <div className="flex items-center justify-between gap-2">
        <label className="min-w-0 truncate text-[11px] font-medium text-slate-500" htmlFor={`slot-${slotKey}`}>
          {label}
        </label>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={`减小 ${label}`}
            title={`减小 ${label}`}
            onClick={() => stepBy(-1)}
            className="grid h-6 w-6 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:scale-95"
          >
            <Minus size={13} />
          </button>
          <input
            id={`slot-${slotKey}`}
            data-testid={`slot-${slotKey}`}
            aria-label={ariaLabel ?? label}
            type="number"
            inputMode="decimal"
            step={step}
            value={draft}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              const parsed = Number(draft);
              if (!Number.isFinite(parsed)) {
                setDraft(formatNumber(value));
                return;
              }
              commit(parsed);
            }}
            onChange={(event) => {
              const next = event.target.value;
              setDraft(next);
              if (next.trim() === '') {
                return;
              }
              const parsed = Number(next);
              if (Number.isFinite(parsed)) {
                commit(parsed);
              }
            }}
            className="number-input h-7 w-[4.4rem] rounded-md border border-slate-200 bg-white px-1.5 text-center font-mono text-[13px] font-medium tabular-nums text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="button"
            aria-label={`增大 ${label}`}
            title={`增大 ${label}`}
            onClick={() => stepBy(1)}
            className="grid h-6 w-6 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:scale-95"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {showSlider ? (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            aria-expanded={sliderOpen}
            aria-label={sliderOpen ? `收起 ${label} 滑块` : `展开 ${label} 滑块`}
            title={sliderOpen ? '收起滑块' : '展开滑块'}
            onClick={() => setSliderOpen((open) => !open)}
            className="grid h-5 w-5 shrink-0 place-items-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            {sliderOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {sliderOpen ? (
            <input
              type="range"
              min={sliderMin}
              max={sliderMax}
              step={step}
              value={sliderValue}
              aria-label={`${label} 滑块`}
              onChange={(event) => commit(Number(event.target.value))}
              style={{ accentColor }}
              className="h-1.5 min-w-0 flex-1 cursor-pointer"
            />
          ) : (
            <span className="flex-1 text-[10px] text-slate-400">滑块已收起</span>
          )}
          <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-slate-400">
            {formatNumber(value)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
