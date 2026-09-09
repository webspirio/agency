import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { copyToClipboard } from './lib/clipboard';
import { cn } from './lib/cn';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

/**
 * LIFT NOTE — upstream took these two strings from `useTranslation()`. The kit
 * carries no i18n runtime, so they arrive as a `labels` prop with English
 * defaults; a localised app passes its own.
 */
export interface CopyableFieldLabels {
  /** Accessible name of the icon-only copy button. */
  copy: string;
  /** Tooltip shown for ~1.5s after a successful copy. */
  copied: string;
}

const DEFAULT_LABELS: CopyableFieldLabels = { copy: 'Copy', copied: 'Copied' };

interface CopyableFieldProps {
  label: string;
  value: string;
  mono?: boolean;
  labels?: Partial<CopyableFieldLabels>;
}

const COPIED_FEEDBACK_MS = 1500;

export function CopyableField({ label, value, mono = false, labels }: CopyableFieldProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleCopy = useCallback(async () => {
    await copyToClipboard(value);
    setCopied(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }, [value]);

  // Cancel a pending "Copied" reset if the field unmounts within the window.
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn('truncate text-sm', mono && 'font-mono')}>{value}</div>
      </div>
      <Tooltip open={copied}>
        <TooltipTrigger asChild>
          <Button onClick={handleCopy} size="icon" variant="ghost" aria-label={text.copy}>
            <Copy className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{text.copied}</TooltipContent>
      </Tooltip>
    </div>
  );
}
