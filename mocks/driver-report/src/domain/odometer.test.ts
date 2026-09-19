// mocks/driver-report/src/domain/odometer.test.ts
import { describe, expect, it } from 'vitest';
import { demo, kyiv } from './clock';
import { expectedOdometer, lastTrustedOf, odometerFlags, readVerdict, storedSource, typedWarning, type OdometerPoint } from './odometer';

const NB = ' ';
const atBase = { value: 412355, at: kyiv('2026-09-20 17:48'), kind: 'SHIFT_END_AT_BASE' as const, place_short: 'База' };
const input = { canDelta: null, plannedKm: null, fromLabel: null, now: demo('05:20'), rc: false };

describe('expected odometer (§3.3 D-09, §7.3, §8.6 #2)', () => {
  it('offers the last reading at base at a shift start and never says the truck stood on a Регіс truck (D5)', () => {
    const e = expectedOdometer({ ...input, moment: 'SHIFT_START', last: atBase });
    expect(e).toMatchObject({ value: 412355, basis: 'LAST_AT_BASE', line: `вчора о 17:48 на базі: 412${NB}355 — порівняйте з фото` });
    expect(e.line).not.toContain('машина стояла');
  });
  it('says «машина стояла» only where CAN proves it', () => {
    const e = expectedOdometer({ ...input, moment: 'SHIFT_START', last: atBase, rc: true });
    expect(e.line).toBe(`вчора о 17:48 на базі: 412${NB}355 · машина стояла — порівняйте з фото`);
  });
  it('uses the mechanic’s reading for a driver new to the truck', () => {
    const last = { value: 356118, at: kyiv('2026-09-18 16:00'), kind: 'MECHANIC' as const, place_short: null };
    expect(expectedOdometer({ ...input, moment: 'SHIFT_START', last, now: demo('05:26') }))
      .toMatchObject({ value: 356118, basis: 'MECHANIC', line: `18.09 механік: 356${NB}118 — порівняйте з фото` });
  });
  it('adds the planned km on arrival and never offers the stale last reading', () => {
    const last = { value: 412355, at: demo('05:20'), kind: 'SHIFT_START' as const, place_short: 'База' };
    const e = expectedOdometer({ ...input, moment: 'ARRIVAL', last, plannedKm: 36, now: demo('06:10') });
    expect(e).toMatchObject({ value: 412391, basis: 'PLANNED_KM', line: '+36 км від виїзду · за планом 36 · на прибутті' });
    expect(e.deltaLine(412391)).toBe('+36 км від виїзду');
    expect(e.deltaLine(412400)).toBe('+45 км від виїзду');
  });
  it('writes the refuel and shift-end lines', () => {
    const dk = { value: 412391, at: demo('06:10'), kind: 'POINT' as const, place_short: 'Дніпро-Корм' };
    expect(expectedOdometer({ ...input, moment: 'REFUEL', last: dk, plannedKm: 7, now: demo('08:57') }))
      .toMatchObject({ value: 412398, line: '+7 км · за планом 7' });
    const lan = { value: 412566, at: demo('15:16'), kind: 'POINT' as const, place_short: 'Лан' };
    expect(expectedOdometer({ ...input, moment: 'SHIFT_END', last: lan, plannedKm: 23, fromLabel: 'Лану', now: demo('16:02') }))
      .toMatchObject({ value: 412589, line: '+23 км від «Лану» · за планом 23' });
  });
  it('offers no number with neither CAN nor planned km (D6)', () => {
    const last = { value: 412391, at: demo('06:10'), kind: 'POINT' as const, place_short: 'Дніпро-Корм' };
    expect(expectedOdometer({ ...input, moment: 'ARRIVAL', last, now: demo('09:00') }))
      .toMatchObject({ value: null, basis: 'NONE', line: 'Число з фото прочитає офіс' });
  });
  it('adds the CAN delta on an R+C truck', () => {
    const last = { value: 241476, at: demo('07:23'), kind: 'SHIFT_START' as const, place_short: 'База' };
    expect(expectedOdometer({ ...input, moment: 'ARRIVAL', last, canDelta: 36, rc: true, now: demo('08:05') }))
      .toMatchObject({ value: 241512, basis: 'CAN_DELTA' });
  });
  it('never offers the reference reading once the truck has provably moved (§8.6 #2, D6)', () => {
    expect(expectedOdometer({ ...input, moment: 'SHIFT_START', last: atBase, plannedKm: 12 }))
      .toMatchObject({ value: 412367, basis: 'PLANNED_KM' });
    const can = expectedOdometer({ ...input, moment: 'SHIFT_START', last: atBase, canDelta: 40, rc: true });
    expect(can).toMatchObject({ value: 412395, basis: 'CAN_DELTA' });
    expect(can.line).not.toContain('машина стояла');
    const mechanic = { value: 356118, at: kyiv('2026-09-18 16:00'), kind: 'MECHANIC' as const, place_short: null };
    expect(expectedOdometer({ ...input, moment: 'ARRIVAL', last: mechanic, now: demo('09:00') }))
      .toMatchObject({ value: null, basis: 'NONE' });
  });
  it('skips a flagged, unresolved reading', () => {
    const points: OdometerPoint[] = [
      { at: kyiv('2026-09-20 17:10'), value: 381402, source: 'DASH_PHOTO', kind: 'SHIFT_END', place_id: null, flagged: false, at_base: true, record_key: 'a' },
      { at: demo('05:40'), value: 318405, source: 'DRIVER_TYPED', kind: 'SHIFT_START', place_id: null, flagged: true, at_base: true, record_key: 'b' },
    ];
    expect(lastTrustedOf(points, demo('06:00'))).toMatchObject({ value: 381402, kind: 'SHIFT_END_AT_BASE' });
  });
});

describe('reading the dash photo', () => {
  it('asks about exactly one digit — the «Лан» case', () => {
    expect(readVerdict(412566, 412866, 23)).toEqual({ kind: 'DIGIT', index: 3, readDigit: '8', expectedDigit: '5' });
  });
  it('asks nothing within ±5 km, or for several small digit changes', () => {
    expect(readVerdict(412391, 412394, 36)).toEqual({ kind: 'OK' });
    expect(readVerdict(412391, 412402, 36)).toEqual({ kind: 'OK' });
  });
  it('opens the check screen beyond max(50 km, 20 % of planned)', () => {
    expect(readVerdict(412561, 412866, 23)).toEqual({ kind: 'CHECK' });
  });
  it('has nothing to compare without a read', () => expect(readVerdict(412391, null, 36)).toEqual({ kind: 'NO_READ' }));
  it('stores ФОТО within ±5 km and ПЛАН ✓ otherwise', () => {
    expect([storedSource(412391, 412393), storedSource(412566, 412866), storedSource(412566, null)])
      .toEqual(['DASH_PHOTO', 'PLAN_CONFIRMED', 'PLAN_CONFIRMED']);
  });
});

describe('flags (§7.3): recorded, never blocking', () => {
  const f = (o: Partial<Parameters<typeof odometerFlags>[0]>) =>
    odometerFlags({ value: 412391, last: 412355, plannedKm: 36, typed: false, photoTaken: true, unread: false, detour: false, ...o });
  it('raises none for a clean reading', () => expect(f({})).toEqual([]));
  it('backwards', () => expect(f({ value: 318405, last: 381402, plannedKm: 0 })).toContain('ODOMETER_BACKWARDS'));
  it('off plan beyond max(50, 20 %)', () => expect(f({ value: 412866, last: 412450, plannedKm: 116 })).toContain('ODOMETER_OFF_PLAN'));
  it("an «Об'їзд» suppresses off-plan", () => expect(f({ value: 412866, last: 412450, plannedKm: 116, detour: true })).not.toContain('ODOMETER_OFF_PLAN'));
  it('a jump over 1 500 km', () => expect(f({ value: 414000 })).toContain('ODOMETER_JUMP'));
  it('stale: ≤ 2 km while the plan says otherwise', () => expect(f({ value: 412356 })).toContain('ODOMETER_STALE'));
  it('typed on Регіс with a photo', () => expect(f({ typed: true })).toEqual(['ODOMETER_TYPED']));
  it('unread', () => expect(f({ value: null, unread: true })).toEqual(['ODOMETER_UNREAD']));
  it('warns about an implausible typed value in the product’s words', () => {
    expect(typedWarning(412866, 412450, 116, 'Злагоди')).toBe(`Перевірте: від «Злагоди» за планом 116 км, а тут +416 км`);
    expect(typedWarning(412566, 412450, 116, 'Злагоди')).toBeNull();
  });
});
