// mocks/driver-report/src/pages/driver/ElsewherePage.tsx
/**
 * «Де ви?» — take a planned stop out of order, or record a place the plan does not have (§3.3 D-12, D-18 [T2]).
 *
 * It COMMITS NOTHING. Every outcome is a navigation into the arrival of §3.3 D-04 carrying an `ArriveContext` (the
 * Wave 2 preamble), or into the refuel of D-10; the record is the arrival's, with its own draft, its own seq and its
 * own odometer. So this page mints no draft either: a `useFlow` here would leave a «Продовжимо: Я в іншому місці»
 * card on home for a question the driver has already answered by arriving somewhere.
 *
 * «Що тут?» is therefore a second SCREEN, not a second step — plain state in this component, which is safe precisely
 * because `LightPage` is given no `step` and so does not remount its body between the two.
 *
 * AND IT NEVER ASKS FOR A PHOTO OF THE PLACE (§8.6 #8). There is no capture step anywhere on this route: a new place
 * is a name the dispatcher will give it, and a photograph of a gate proves nothing the GPS fix does not.
 */
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Ellipsis, Fuel, MapPin, MapPinPlus, PackageCheck, PackageOpen } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNearbyPlaces, useToday } from '../../api/hooks';
import { DEVICE_ID } from '../../app/device';
import { fmtKm } from '../../app/format';
import { useServerNow } from '../../app/live';
import { pendingRecords } from '../../app/outbox';
import { ChipRow, DriverSkeleton, LightPage } from '../../components/driver';
import type { PlaceOption } from '../../domain/dto';
import { project } from '../../domain/project';
import { useDriverGuard } from './DriverShell';

const TITLE = 'Я в іншому місці';
const WHERE = 'Де ви?';
const WHAT = 'Що тут?';
const PLANNED = 'За планом';
const NEARBY = 'Поруч';
const NEW_PLACE = 'Нове місце';
const NO_FIX = 'Місце не визначено — записати однаково можна';

/** What an unplanned arrival is FOR — the `unplanned_kind` of the `ArriveContext`, plus the one answer that is not
 *  an arrival at all: «Заправка» is D-10 and goes to `/refuel`. */
type What = { label: string; icon: LucideIcon; kind: 'LOADING' | 'DROP' | 'OTHER' | null };
const WHAT_CHIPS: readonly What[] = [
  { label: 'Завантаження', icon: PackageOpen, kind: 'LOADING' },
  { label: 'Вивантаження', icon: PackageCheck, kind: 'DROP' },
  { label: 'Заправка', icon: Fuel, kind: null },
  { label: 'Інше', icon: Ellipsis, kind: 'OTHER' },
];

/** «Лан, Балабине · ТТН 004518» for a planned stop, «Дніпро-Корм, склад №2 · 2 км» for a library place. */
function labelOf(option: PlaceOption): string {
  if (option.ttn_no !== null) return `${option.short} · ТТН ${option.ttn_no}`;
  if (option.distance_km !== null) return `${option.short} · ${fmtKm(option.distance_km)} км`;
  return option.short;
}

export function ElsewherePage(): JSX.Element {
  const navigate = useNavigate();
  const today = useToday();
  const now = useServerNow();
  const data = today.data;
  /** The place the driver picked from «Поруч», or `null` for «Нове місце»; `undefined` while «Де ви?» is up. */
  const [picked, setPicked] = useState<{ place_id: string | null } | undefined>(undefined);
  const here = data === undefined ? null : project(data, pendingRecords(DEVICE_ID), now).openStop;
  const places = useNearbyPlaces(here?.stop.stop_id ?? null);
  const guard = useDriverGuard();

  const options = places.data?.data ?? [];
  const planned = options.filter((o) => o.group === 'PLANNED');
  const nearby = options.filter((o) => o.group === 'NEARBY');
  const noFix = data?.truck?.gnss === 'SUSPECT';

  const back = (): void => {
    if (picked === undefined) navigate('/');
    else setPicked(undefined);
  };

  const outOfOrder = (option: PlaceOption): void => {
    if (option.stop_id === null) return;
    navigate(`/stop/${option.stop_id}/arrive`, { state: { arrive: { order: 'OUT_OF_ORDER' } } });
  };

  const unplanned = (what: What): void => {
    if (what.kind === null) {
      navigate('/refuel');
      return;
    }
    const placeId = picked?.place_id ?? null;
    navigate('/stop/new/arrive', {
      state: { arrive: { order: 'UNPLANNED', place_id: placeId, unplanned_kind: what.kind, new_place: placeId === null } },
    });
  };

  if (picked !== undefined) {
    return (
      <LightPage title={TITLE} onBack={back}>
        <h1 className="text-[1.5rem] leading-[2rem] font-semibold">{WHAT}</h1>
        {WHAT_CHIPS.map((what) => (
          <ChipRow key={what.label} icon={what.icon} label={what.label} onPress={guard(() => { unplanned(what); })} />
        ))}
      </LightPage>
    );
  }

  // The question and its answers appear together: «Де ви?» over an empty column would be a page that asks something
  // it cannot yet be answered with, and on a phone in a cab the two frames read as a list that lost its rows.
  if (data === undefined || places.data === undefined) {
    return <LightPage title={TITLE} onBack={back}><DriverSkeleton /></LightPage>;
  }

  return (
    <LightPage title={TITLE} onBack={back}>
      <h1 className="text-[1.5rem] leading-[2rem] font-semibold">{WHERE}</h1>
      {planned.length === 0 ? null : (
        <>
          <p className="text-[1rem] leading-[1.375rem] font-semibold" style={{ color: 'var(--text-2)' }}>{PLANNED}</p>
          {planned.map((option) => (
            <ChipRow key={option.place_id} icon={MapPin} label={labelOf(option)}
              onPress={guard(() => { outOfOrder(option); })} />
          ))}
        </>
      )}
      {noFix ? (
        <p className="text-[1rem] leading-[1.375rem]" style={{ color: 'var(--text-2)' }}>{NO_FIX}</p>
      ) : nearby.length === 0 ? null : (
        <>
          <p className="text-[1rem] leading-[1.375rem] font-semibold" style={{ color: 'var(--text-2)' }}>{NEARBY}</p>
          {nearby.map((option) => (
            <ChipRow key={option.place_id} icon={MapPin} label={labelOf(option)}
              onPress={guard(() => { setPicked({ place_id: option.place_id }); })} />
          ))}
        </>
      )}
      <ChipRow icon={MapPinPlus} label={NEW_PLACE} onPress={guard(() => { setPicked({ place_id: null }); })} />
    </LightPage>
  );
}
