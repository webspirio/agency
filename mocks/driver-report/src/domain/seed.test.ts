// mocks/driver-report/src/domain/seed.test.ts
import { describe, expect, it } from 'vitest';
import { emptyStores, snapshot } from '../api/stores';
import { kyiv } from './clock';
import { dayOf, driverOf, placeOf, seededWorld, stopOf, truckOf, withRows } from './fixtures';
import { populate } from './seed';
import { cmpNum, lt } from './num';
import type { World } from './types';

const w = seededWorld();
const place = (id: string) => w.places.find((p) => p.id === id)!.code;

describe('seed (§7.6)', () => {
  it('is deterministic', () => {
    const a = emptyStores(); populate(a);
    const b = emptyStores(); populate(b);
    expect(JSON.stringify(snapshot(a))).toBe(JSON.stringify(snapshot(b)));
  });

  it('assigns the device ids the URLs name (§2.1)', () => {
    const d = (id: string) => w.devices.find((x) => x.id === id)!;
    expect(d('device-000001').driver_id).toBe(driverOf(w, '0213').id);
    expect(d('device-000002').driver_id).toBe(driverOf(w, '0188').id);
    expect(d('device-000003').driver_id).toBeNull();
    expect(d('device-000009')).toMatchObject({ driver_id: driverOf(w, '0213').id, revoked_at: kyiv('2026-08-31 18:00') });
    expect([d('device-000001').next_seq, d('device-000002').next_seq, d('device-000003').next_seq]).toEqual([417, 388, 1]);
  });

  it('never lets a phone mint a key it already holds (I-6 mintSeq)', () => {
    // mintSeq hands out devices[id].next_seq and increments it, so a seeded record keyed at or past that number is a
    // key the next flow on that phone reissues. Павло's history ends at 416 (next 417), Олег's at 387 (next 388); a
    // seed that writes records on any other phone — W0-22's Ярошенко on device-000006 — advances its next_seq past them.
    const clashes = (world: World): string[] => world.records.flatMap((r) => {
      if (r.key !== `${r.device_id}:${r.seq}`) return [`${r.key} is not ${r.device_id}:${r.seq}`];
      const next = world.devices.find((d) => d.id === r.device_id)?.next_seq;
      return next !== undefined && lt(r.seq, next) ? [] : [`${r.key} on next_seq ${next ?? 'of no device'}`];
    });
    expect(clashes(w)).toEqual([]);
    // The control, so the green above is not a predicate that cannot fail: Григорій's unbound phone (next_seq 1, pinned
    // above, never seeded with a record) holding one record at seq 1.
    const planted = { ...w.records[0]!, key: 'device-000003:1', device_id: 'device-000003', seq: 1 };
    expect(clashes(withRows(w, { records: [planted] }))).toEqual(['device-000003:1 on next_seq 1']);
  });

  it('holds the twelve detailed trucks, three in the pilot, with the pilot classes of §7.6', () => {
    // Robust to W0-22 landing: the generated 88 are asserted by seedFleet.test.ts, never here.
    const DETAILED = ['АР 1234 ВС', 'АР 9012 МК', 'АР 7390 ЕВ', 'АР 5577 ЕК', 'АР 3344 НТ', 'АР 5678 СЕ', 'АР 6618 ЕС',
      'АР 2745 ІВ', 'АР 8150 КС', 'АР 3380 ТК', 'АР 4471 ВС', 'АР 0633 КХ'];
    expect(DETAILED.map((plate) => truckOf(w, plate).plate)).toEqual(DETAILED);
    expect(w.trucks.filter((t) => t.pilot).map((t) => t.plate)).toEqual(['АР 1234 ВС', 'АР 9012 МК', 'АР 7390 ЕВ']);
    expect(truckOf(w, 'АР 1234 ВС')).toMatchObject({ telematics: 'REGIS', has_can: false, norm_l_100: '32.0', card_mask: '****4417' });
    expect(truckOf(w, 'АР 9012 МК')).toMatchObject({ telematics: 'RUPTELA', has_can: true, has_tacho: true, norm_l_100: '30.5' });
    expect(truckOf(w, 'АР 7390 ЕВ').mechanic_reading).toMatchObject({ value: 356118 });
    expect(truckOf(w, 'АР 0633 КХ')).toMatchObject({ paper: true, example: true });
  });

  it('keeps the planned km of the library', () => {
    const km = (a: string, b: string) => w.distances.find((x) => x.from_code === a && x.to_code === b)?.km;
    expect([km('BASE', 'DK'), km('DK', 'OKKO'), km('OKKO', 'ZLAGODA'), km('DK', 'ZLAGODA'), km('ZLAGODA', 'LAN'),
      km('LAN', 'BASE'), km('DK', 'DOBROBUT'), km('DOBROBUT', 'WOG'), km('WOG', 'BASE'), km('DOBROBUT', 'BASE')])
      .toEqual([36, 7, 52, 52, 116, 23, 98, 47, 99, 118]);
  });

  it('plans Павло’s 21.09 as §7.6', () => {
    const trip = w.trips.find((t) => t.no === 'Р-26-3312')!;
    const stops = w.plannedStops.filter((s) => s.trip_id === trip.id).sort((a, b) => cmpNum(a.seq, b.seq));
    expect(stops.map((s) => [s.plan_key, place(s.place_id), s.kind, s.ttn_nos, s.compartments, s.mass_t])).toEqual([
      ['3312-1', 'DK', 'LOADING', ['004517', '004518'], null, '24.400'],
      ['3312-2', 'ZLAGODA', 'DROP', ['004517'], '1–3', '12.000'],
      ['3312-3', 'LAN', 'DROP', ['004518'], '4–6', '12.400'],
      ['3312-4', 'BASE', 'BASE', [], null, null],
    ]);
    expect(stopOf(w, '3312-2')).toMatchObject({ drop_index: 1, drop_count: 2 });
    expect(placeOf(w, 'LAN')).toMatchObject({ no_photos: true, edrpou: '03767412', curfew: { from: '21:00', to: '06:00' }, label_gen: 'Лану' });
  });

  it('authors every case a sentence needs, rather than deriving one from an ending', () => {
    // «Завантаження у Вільнянську не записано» (§3.3 D-04) and «+23 км від «Лану»» (§3.3 D-09) are composed on the
    // phone. No rule over endings gets «Вільнянську» and «Павлограді» both right from the nominative, so the
    // locative is seeded beside the genitive and the page reads it.
    expect(w.places.map((p) => [p.code, p.town_loc])).toEqual([
      ['BASE', 'Запоріжжі'], ['DK', 'Вільнянську'], ['DK2', 'Вільнянську'], ['OKKO', 'Вільнянську'],
      ['WOG', 'Синельниковому'], ['ZLAGODA', 'Синельниковому'], ['LAN', 'Балабиному'], ['DOBROBUT', 'Павлограді'],
      ['BERIZKA', 'Підгородному'], ['HAVAN', 'Роздорах'], ['STEP', 'Славгороді'], ['KOLOS', 'Кушугумі'],
      ['LUBOML', 'Любомлі'],
    ]);
  });

  it('carries Friday 18.09 as ПЛ-000398, confirmed, printed and signed', () => {
    expect(dayOf(w, 'АР 1234 ВС', '2026-09-18')).toMatchObject({ status: 'CONFIRMED', waybill_no: 'ПЛ-000398',
      confirmed_at: kyiv('2026-09-18 17:05'), signed_at: kyiv('2026-09-18 17:10') });
  });

  it('ends Павло’s Sunday at base on 412 355 at 17:48, confirmed, printed, not signed', () => {
    const sunday = dayOf(w, 'АР 1234 ВС', '2026-09-20');
    expect(sunday).toMatchObject({ waybill_no: 'ПЛ-000409', status: 'CONFIRMED', signed_at: null });
    expect(sunday.printed_at).not.toBeNull();
    const end = w.records.find((r) => r.type === 'SHIFT_END' && r.truck_day_id === sunday.id)!;
    expect(end.occurred_at).toBe(kyiv('2026-09-20 17:48'));
    expect(end.type === 'SHIFT_END' && end.payload.odometer?.value).toBe(412355);
  });

  it('owes Олег’s original of ТТН 004503 from 17.09, and nothing else of the pilot', () => {
    const owed = w.ttnDocs.filter((d) => !d.example && d.original === null);
    expect(owed.map((d) => [d.no, d.date])).toEqual([['004503', '2026-09-17']]);
  });

  it('places nothing in occupied territory (§8.6 #17)', () => {
    const text = JSON.stringify(w);
    for (const town of ['Мелітополь', 'Токмак', 'Пологи', 'Василівка', 'Оріхів', 'Гуляйполе', 'Енергодар', 'Бердянськ']) {
      expect(text).not.toContain(town);
    }
  });

});
