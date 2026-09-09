import * as React from 'react';
import { cn } from './lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the control (pass a t() string). */
  label?: string;
  size?: 'sm' | 'md';
  /** 'fill' (default) = equal-width segments that clip long labels; 'content' = segments sized to their label (no clipping). */
  fit?: 'fill' | 'content';
  /**
   * 'default' (the shared look) vs 'strong' — a higher-contrast variant for
   * dense/admin-style surfaces: readable inactive labels and a more prominent
   * active thumb, so the control never reads as a row of disabled buttons.
   */
  tone?: 'default' | 'strong';
  className?: string;
}

/**
 * iOS-style segmented control: radiogroup semantics with roving tabindex and
 * arrow-key navigation; the active thumb marks the selected segment. A hairline
 * divider separates each pair of segments — suppressed either side of the thumb
 * so none crosses it. Used for sort switchers, status filters and similar small
 * option sets.
 *
 * LIFT NOTE — upstream the thumb was a `motion.span` that glided between
 * segments via `layoutId`. `motion` is not a dependency of this workspace, and
 * a layoutId animates a POSITION transform between two different DOM nodes,
 * which CSS cannot express. So the thumb SNAPS — which is exactly the branch
 * upstream already took under reduced motion, not a new visual state. Adding
 * `motion` back restores the glide by reverting this one element.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  fit = 'fill',
  tone = 'default',
  className,
}: SegmentedProps<T>) {
  const buttonsRef = React.useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = options.findIndex((option) => option.value === value);

  const select = (option: SegmentedOption<T>, index: number) => {
    if (option.disabled || option.value === value) return;
    onChange(option.value);
    buttonsRef.current[index]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const enabled = options
      .map((option, index) => ({ option, index }))
      .filter(({ option }) => !option.disabled);
    if (enabled.length === 0) return;
    const currentPos = enabled.findIndex(({ option }) => option.value === value);
    let nextPos: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextPos = (currentPos + 1) % enabled.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextPos = (currentPos - 1 + enabled.length) % enabled.length;
        break;
      case 'Home':
        nextPos = 0;
        break;
      case 'End':
        nextPos = enabled.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    // `nextPos` is always in range (it is a modulo of enabled.length, and the
    // empty case returned above); the guard is for noUncheckedIndexedAccess.
    const target = enabled[nextPos];
    if (target) select(target.option, target.index);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-tone={tone}
      onKeyDown={onKeyDown}
      className={cn('inline-flex w-full rounded-xl bg-muted p-1', className)}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        // A hairline between neighbours. Suppressed on the active segment and
        // the one straight after it, so no rule ever crosses the thumb — and
        // faded rather than snapped, because the thumb glides via layoutId and
        // an instant toggle would flicker mid-travel. Opacity is also the one
        // transition reduced motion tolerates, so this needs no motion guard.
        //
        // It is `bg-line2`, NOT `bg-border`: this control fills its own field
        // with `bg-muted`, and --border is calibrated against --card. On --muted
        // it reaches only 1.10:1 in light, and in dark --border and --muted are
        // the SAME hex — 1.00:1, an invisible divider. --line2 ("stronger
        // dividers") clears both. Pinned in brand-tokens.contrast.test.ts.
        const dividerHidden = index === activeIndex || index === activeIndex + 1;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttonsRef.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={option.disabled}
            onClick={() => select(option, index)}
            className={cn(
              'relative rounded-lg px-3 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40',
              fit === 'fill' ? 'min-w-0 flex-1' : 'flex-none',
              size === 'md' ? 'h-9 text-sm' : 'h-8 text-xs',
              // Strong tone bolds the active label; every other case keeps the
              // medium weight (only ONE font-weight class is ever applied, so
              // font-medium/font-semibold never fight over source order).
              active && tone === 'strong' ? 'font-semibold' : 'font-medium',
              active
                ? 'text-foreground'
                : tone === 'strong'
                  ? // Darker, clearly-readable inactive labels (not "disabled").
                    'text-foreground/70 hover:text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {index > 0 && (
              <span
                data-slot="segmented-divider"
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute left-0 top-1/2 h-4 w-px -translate-y-1/2 bg-line2 transition-opacity',
                  dividerHidden && 'opacity-0',
                )}
              />
            )}
            {active && (
              <span
                data-slot="segmented-thumb"
                aria-hidden="true"
                className={cn(
                  'absolute inset-0 rounded-lg bg-surface dark:bg-card',
                  // Strong tone lifts the thumb off the track (admin readability).
                  tone === 'strong' ? 'shadow ring-1 ring-border' : 'shadow-sm',
                )}
              />
            )}
            <span className={cn('relative z-10 block', fit === 'fill' && 'truncate')}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
