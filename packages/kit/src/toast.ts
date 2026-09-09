import type { ReactNode } from 'react';

/**
 * LIFT NOTE — upstream this file was a thin re-export of `sonner`. `sonner` is
 * not a dependency of this workspace, so the store below is the same public
 * surface (`toast`, `toast.success/error/info/warning/loading/dismiss`,
 * `toastSuccess`, `toastError`) over ~60 lines of local state. `sonner.tsx`
 * renders it. Swapping the real library back in means deleting this store and
 * restoring the two-line re-export.
 */

export type ToastType = 'default' | 'success' | 'error' | 'info' | 'warning' | 'loading';

/** The subset of sonner's options bag the kit actually uses. */
export interface ExternalToast {
  /** Reuse an existing id to replace that toast in place (e.g. loading -> success). */
  id?: string;
  description?: ReactNode;
  /** Milliseconds on screen. `Infinity` pins it until dismissed. */
  duration?: number;
}

export interface ToastRecord {
  id: string;
  type: ToastType;
  message: ReactNode;
  description?: ReactNode;
  duration: number;
}

const DEFAULT_DURATION = 4000;

let sequence = 0;
let records: readonly ToastRecord[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

const emit = () => {
  // Snapshot: a listener may unsubscribe (or subscribe) while being called.
  for (const listener of Array.from(listeners)) listener();
};

/** Subscribe to the toast stack. Returns an unsubscribe. For `<Toaster />`. */
export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current toast stack, oldest first. Stable reference between changes. */
export const getToasts = (): readonly ToastRecord[] => records;

function dismiss(id?: string): void {
  for (const [key, timer] of timers) {
    if (id === undefined || key === id) {
      clearTimeout(timer);
      timers.delete(key);
    }
  }
  records = id === undefined ? [] : records.filter((t) => t.id !== id);
  emit();
}

function push(type: ToastType, message: ReactNode, options?: ExternalToast): string {
  // seq(), not Math.random(): the stack renders in creation order and a test
  // that asserts on an id needs it to be reproducible.
  const id = options?.id ?? `toast-${String(++sequence).padStart(6, '0')}`;
  const duration = options?.duration ?? (type === 'loading' ? Infinity : DEFAULT_DURATION);
  const existing = timers.get(id);
  if (existing) {
    clearTimeout(existing);
    timers.delete(id);
  }
  const record: ToastRecord = { id, type, message, description: options?.description, duration };
  const index = records.findIndex((t) => t.id === id);
  // Not `records.with(index, record)`: that is ES2023 and this workspace's lib is ES2022.
  records =
    index === -1 ? [...records, record] : records.map((t, i) => (i === index ? record : t));
  if (Number.isFinite(duration)) {
    timers.set(
      id,
      setTimeout(() => dismiss(id), duration),
    );
  }
  emit();
  return id;
}

const base = (message: ReactNode, options?: ExternalToast) => push('default', message, options);

/**
 * Toast API. Use these for mutation results so feel and feedback stay
 * consistent app-wide.
 */
export const toast = Object.assign(base, {
  success: (message: ReactNode, options?: ExternalToast) => push('success', message, options),
  error: (message: ReactNode, options?: ExternalToast) => push('error', message, options),
  info: (message: ReactNode, options?: ExternalToast) => push('info', message, options),
  warning: (message: ReactNode, options?: ExternalToast) => push('warning', message, options),
  loading: (message: ReactNode, options?: ExternalToast) => push('loading', message, options),
  dismiss,
});

export function toastSuccess(message: ReactNode, options?: ExternalToast) {
  return toast.success(message, options);
}

export function toastError(message: ReactNode, options?: ExternalToast) {
  return toast.error(message, options);
}
