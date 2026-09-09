import * as React from 'react';
import { cn } from './lib/cn';
import { useReducedMotionSafe } from './lib/motion';

interface AnimatedNumberProps {
  value: number;
  /** Formats the tweened value for display; default: rounded integer. */
  format?: (value: number) => string;
  className?: string;
}

const defaultFormat = (value: number) => Math.round(value).toString();

const FULL_MS = 350;
/** The shared reduced-motion duration (see `reducedFade`), in ms. */
const REDUCED_MS = 150;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Price / seat counter that tweens between values («Разом: €54», «12/20»).
 * Under reduced motion it still ticks over the shared ~150ms cross-fade
 * duration rather than jump-cutting to the new value.
 *
 * LIFT NOTE — upstream drove this with `animate()`/`useMotionValue()` from
 * `motion/react`, which is not a dependency of this workspace. The tween below
 * is the same easing over the same two durations, on requestAnimationFrame.
 * The props, the display contract and the reduced-motion branch are unchanged.
 */
export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const reduced = useReducedMotionSafe();
  const fmt = format ?? defaultFormat;
  // Raw tweened number lives in state; formatting happens at render time so a
  // format prop change never needs a resync effect.
  const [current, setCurrent] = React.useState(value);
  const currentRef = React.useRef(value);
  currentRef.current = current;

  React.useEffect(() => {
    const from = currentRef.current;
    if (from === value) return;
    const duration = reduced ? REDUCED_MS : FULL_MS;
    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      setCurrent(t === 1 ? value : from + (value - from) * easeOut(t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);

  return <span className={cn('tabular-nums', className)}>{fmt(current)}</span>;
}
