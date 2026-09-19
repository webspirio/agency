// mocks/driver-report/src/components/driver/capture/QualityChips.tsx
/** What is wrong with the frame, while it is still fixable (§3.3 D-06, 03 S10.11).
 *
 *  They are HINTS, never a refusal: the shutter stays live under them, because a driver who cannot take the photo the
 *  app wants must still be able to take the photo he has (§8.6 #11). They clear as the shot improves.
 *
 *  Drawn mode fires none of them — there is no frame to measure — so on the stage this row is empty and the
 *  «Макет: намальоване фото» chip stands alone beside it. */
import type { JSX } from 'react';
import { useState } from 'react';
import { Flashlight, Moon, Sun, Waves, ZoomIn } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type QualityReason = 'DARK' | 'BLUR' | 'GLARE' | 'CLOSER';

const CHIP: Record<QualityReason, { word: string; icon: LucideIcon }> = {
  DARK: { word: 'Темно', icon: Moon },
  BLUR: { word: 'Розмито', icon: Waves },
  GLARE: { word: 'Відблиск', icon: Sun },
  CLOSER: { word: 'Ближче', icon: ZoomIn },
};

export function QualityChips({ reasons, torch = false, onTorch }: {
  reasons: QualityReason[];
  /** The track can light the scene: «Світло» then appears beside «Темно» and only there. */
  torch?: boolean;
  /** [T2] — the in-page engine turns the track's torch on; absent on every drawn viewfinder. */
  onTorch?(on: boolean): void;
}): JSX.Element {
  const [lit, setLit] = useState(false);
  return (
    <div className="pointer-events-none flex flex-wrap items-center gap-2">
      {reasons.map((reason) => {
        const { word, icon: Icon } = CHIP[reason];
        return (
          <span
            key={reason}
            className="inline-flex h-[2.5rem] items-center gap-2 rounded-[10px] px-3 text-[1rem] leading-[1.25rem] font-semibold"
            style={{ background: 'var(--cam-hold-bg)', color: 'var(--cam-hold)' }}
          >
            <Icon aria-hidden="true" className="size-[1.25rem] shrink-0" />
            {word}
          </span>
        );
      })}
      {torch && reasons.includes('DARK') ? (
        <button
          type="button"
          aria-pressed={lit}
          onClick={() => { setLit(!lit); onTorch?.(!lit); }}
          className="pointer-events-auto inline-flex h-tap items-center gap-2 rounded-[12px] px-3 text-[1rem] leading-[1.25rem] font-semibold"
          style={{ background: 'var(--cam-hold-bg)', color: 'var(--cam-hold)' }}
        >
          <Flashlight aria-hidden="true" className="size-[1.25rem] shrink-0" />
          Світло
        </button>
      ) : null}
    </div>
  );
}
