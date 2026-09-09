import * as React from 'react';
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { cn } from './lib/cn';
import { getToasts, subscribeToasts, toast, type ToastType } from './toast';

/**
 * Dark mode is driven by the `.dark` class that `useAppTheme` toggles
 * on <html> (no next-themes in this app). A MutationObserver keeps the toaster
 * in sync when the effective theme changes at runtime.
 */
function useDocumentDarkClass(): boolean {
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    const observer = new MutationObserver(onStoreChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);
  return React.useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
}

const ICONS: Record<ToastType, React.ReactNode> = {
  default: null,
  success: <CircleCheckIcon className="size-4" />,
  info: <InfoIcon className="size-4" />,
  warning: <TriangleAlertIcon className="size-4" />,
  error: <OctagonXIcon className="size-4" />,
  loading: <Loader2Icon className="size-4 animate-spin" />,
};

const POSITIONS = {
  'top-left': 'top-4 left-4 items-start',
  'top-center': 'top-4 left-1/2 -translate-x-1/2 items-center',
  'top-right': 'top-4 right-4 items-end',
  'bottom-left': 'bottom-4 left-4 items-start',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 items-center',
  'bottom-right': 'bottom-4 right-4 items-end',
} as const;

export interface ToasterProps {
  position?: keyof typeof POSITIONS;
  className?: string;
  style?: React.CSSProperties;
}

const EMPTY: ReturnType<typeof getToasts> = [];

/**
 * LIFT NOTE — upstream this wrapped `sonner`'s `<Toaster />`. `sonner` is not a
 * dependency of this workspace, so it renders `./toast`'s store directly. Same
 * component name, same icon set, same four CSS custom properties, so the
 * theming a mock's stylesheet does keeps working unchanged.
 */
const Toaster = ({ position = 'bottom-right', className, style }: ToasterProps) => {
  const isDark = useDocumentDarkClass();
  const toasts = React.useSyncExternalStore(subscribeToasts, getToasts, () => EMPTY);

  return (
    <ol
      aria-live="polite"
      data-theme={isDark ? 'dark' : 'light'}
      className={cn(
        'toaster group pointer-events-none fixed z-100 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2',
        POSITIONS[position],
        className,
      )}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          ...style,
        } as React.CSSProperties
      }
    >
      {toasts.map((t) => (
        <li
          key={t.id}
          data-type={t.type}
          className="pointer-events-auto flex w-full items-start gap-2.5 border p-3.5 text-sm shadow-lg"
          style={{
            background: 'var(--normal-bg)',
            color: 'var(--normal-text)',
            borderColor: 'var(--normal-border)',
            borderRadius: 'var(--border-radius)',
          }}
        >
          {ICONS[t.type] && <span className="mt-px shrink-0">{ICONS[t.type]}</span>}
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t.message}</div>
            {t.description && (
              <div className="mt-0.5 text-xs opacity-70">{t.description}</div>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => toast.dismiss(t.id)}
            className="shrink-0 text-xs opacity-50 transition-opacity hover:opacity-100"
          >
            ✕
          </button>
        </li>
      ))}
    </ol>
  );
};

export { Toaster };
