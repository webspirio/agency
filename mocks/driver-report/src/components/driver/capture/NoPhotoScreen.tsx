// mocks/driver-report/src/components/driver/capture/NoPhotoScreen.tsx
/** «Тут фото заборонені» (§3.3 D-06, D-08): the drop where the camera may not be used at all — a poultry farm's
 *  biosecurity rule, not the app's.
 *
 *  It comes BEFORE the camera rather than after a refusal, because the driver must not stand at the gate deciding
 *  whether to break a rule he has just been reminded of. «Зніму після виїзду» commits the unloading now, with the
 *  tap's own time and no pages, and home carries the reminder until the photos arrive.
 *
 *  «Все одно зняти зараз» stays, quiet: the flag belongs to the place, and only the driver can see whether it is
 *  true today (§8.6 #11 — nothing on this route is a hard block). */
import type { JSX } from 'react';
import { Camera, CameraOff, Clock } from 'lucide-react';
import { ActionBar } from '../ActionBar';
import { PrimaryAction } from '../PrimaryAction';
import { QuietButton } from '../QuietButton';

const TITLE = 'Тут фото заборонені';
const LINE = 'ТТН з підписом і щиток знімете після виїзду';

export function NoPhotoScreen({ onDefer, onShootAnyway }: {
  onDefer(): void;
  onShootAnyway(): void;
}): JSX.Element {
  return (
    <div data-surface="dark" className="flex min-h-dvh flex-col bg-cam-bg text-cam-ink">
      <div className="mx-auto flex w-full max-w-[35rem] flex-1 flex-col items-center justify-center gap-4 px-gutter py-6 text-center">
        <CameraOff aria-hidden="true" className="size-[2.5rem]" />
        <h1 className="text-[1.5rem] leading-[2rem] font-semibold">{TITLE}</h1>
        <p className="text-[1.125rem] leading-[1.5rem]" style={{ color: 'var(--cam-text-2)' }}>{LINE}</p>
      </div>
      <ActionBar dark>
        <PrimaryAction icon={Clock} verb="Зніму після виїзду" dark onPress={onDefer} />
        <QuietButton dark icon={Camera} label="Все одно зняти зараз" onPress={onShootAnyway} />
      </ActionBar>
    </div>
  );
}
