// mocks/driver-report/src/domain/seedFleet.test.ts
import { describe, expect, it } from 'vitest';
import { cmp } from '@agency/dec';
import { byCodepoint } from '@agency/mock';
import { CORPUS } from '@agency/synth';
import { emptyStores, snapshot } from '../api/stores';
import { demo, kyiv, minutesBetween } from './clock';
import { dayOf, driverOf, seededWorld, truckOf } from './fixtures';
import { gt } from './num';
import { populate } from './seed';

const w = seededWorld();

describe('the fleet example (§7.6)', () => {
  it('makes 100 trucks, 97 of them examples', () => {
    expect([w.trucks.length, w.trucks.filter((t) => t.example).length]).toEqual([100, 97]);
  });

  it('reads the example fleet at 16:05 exactly as §7.6', () => {
    const today = w.truckDays.filter((d) => d.example && d.date === '2026-09-21');
    expect([today.filter((d) => d.status === 'CONFIRMED').length, today.filter((d) => d.status === 'READY').length]).toEqual([56, 6]);
    const count = (s: string) => w.exampleBoard.filter((r) => r.state === s).length;
    expect(w.exampleBoard).toHaveLength(97);
    expect(['Їде завантажений', 'Їде порожній', 'У черзі на вивантаження', 'У черзі на завантаження', 'Стоїть',
      'Завантажується', 'Вивантажено, чекає документ', 'Ремонт', 'Кордон', 'На базі'].map(count))
      .toEqual([9, 10, 4, 2, 2, 1, 1, 2, 1, 1]);
    expect(w.exampleBoard.filter((r) => r.state.startsWith('У черзі')).reduce((s, r) => s + (r.at_stop_min ?? 0), 0)).toBe(460);
    expect(w.exampleItems.filter((i) => i.lane === 'NOW')).toHaveLength(3);
    expect(w.exampleItems.filter((i) => i.lane === 'REVIEW')).toHaveLength(10);
    expect(truckOf(w, 'АР 1037 ВС').example).toBe(true);
  });

  it('pages through stores capped at 100 rows (a store of exactly 100 needs a second, empty page)', () => {
    const s = emptyStores(); populate(s);
    expect([snapshot(s).trucks.length, snapshot(s).truckMonths.length]).toEqual([100, 100]);
  });

  it('seeds Ярошенко’s typed shift start and the one «зі слів водія» entry', () => {
    const start = w.records.find((r) => r.device_id === 'device-000006' && r.type === 'SHIFT_START')!;
    expect(start.flags).toEqual(['ODOMETER_TYPED']);
    expect(start.type === 'SHIFT_START' && start.payload.odometer).toMatchObject({ value: 318405, expected: 381402, choice: 'KEPT_AS_IS' });
    expect(dayOf(w, 'АР 0633 КХ', '2026-09-21').figures?.call_entry).toEqual({ at: kyiv('2026-09-21 09:12'), by_short: 'О. Кравець' });
    expect(w.ttnDocs.filter((d) => d.ettn !== null)).toHaveLength(1);
  });

  it('sums the confirmed example days to 90 legs and 39 refuels', () => {
    const confirmed = w.truckDays.filter((d) => d.example && d.status === 'CONFIRMED' && d.date === '2026-09-21');
    expect([confirmed.reduce((n, d) => n + (d.figures?.legs ?? 0), 0), confirmed.reduce((n, d) => n + (d.figures?.refuels ?? 0), 0)]).toEqual([90, 39]);
  });

  it('is deterministic', () => {
    const a = emptyStores(); populate(a);
    const b = emptyStores(); populate(b);
    expect(JSON.stringify(snapshot(a).exampleBoard)).toBe(JSON.stringify(snapshot(b).exampleBoard));
  });
});

/* What the Group C and D modules join on (W0-11 exceptions, W0-12 export, W0-16 office views, W0-17 reports). Each
 * assertion below is a number or a string §7.6, §4.2 or §5.6 prints, stated against the seed rather than the view. */
describe('the fleet example, as the views read it', () => {
  const at1605 = demo('16:05');
  const plateOf = (truckId: string) => w.trucks.find((t) => t.id === truckId)!.plate;
  const generated = w.trucks.filter((t) => t.example).slice(9);

  it('numbers the 88 generated trucks 1000 + i·37 mod 8 999 with the suffixes cycling, every plate unique', () => {
    expect(generated.map((t) => t.plate).slice(0, 11)).toEqual(['АР 1037 ВС', 'АР 1074 ВЕ', 'АР 1111 КС', 'АР 1148 МК',
      'АР 1185 НТ', 'АР 1222 ІВ', 'АР 1259 ЕК', 'АР 1296 СЕ', 'АР 1333 ХА', 'АР 1370 КХ', 'АР 1407 ВС']);
    expect(generated.at(-1)!.plate).toBe('АР 4256 СЕ');
    const plates = [...w.trucks, ...w.trailers].map((t) => t.plate);
    expect(new Set(plates).size).toBe(plates.length);
    expect(new Set(w.trucks.map((t) => t.trailer_id)).size).toBe(100);
  });

  it('draws every generated driver from the corpus, never a name the detailed seed already uses', () => {
    const drivers = w.drivers.filter((d) => generated.some((t) => t.id === d.truck_id));
    expect(drivers).toHaveLength(88);
    const taken = [...w.drivers.filter((d) => !drivers.includes(d)).map((d) => d.full_name.split(' ')[0]!),
      ...w.officeUsers.map((u) => u.full_name.split(' ')[1]!)];
    for (const d of drivers) {
      const [family, given] = d.full_name.split(' ') as [string, string];
      expect([CORPUS.uk.family.includes(family), CORPUS.uk.given.includes(given), taken.includes(family)]).toEqual([true, true, false]);
      expect([d.short_name, d.first_name, d.example, d.pilot]).toEqual([`${family} ${given[0]}.`, given, true, false]);
    }
    expect(new Set(w.drivers.map((d) => d.short_name)).size).toBe(w.drivers.length);
    expect(new Set(w.drivers.map((d) => d.tab_no)).size).toBe(w.drivers.length);
  });

  it('shares the fleet between the three dispatchers 35 · 35 · 30 (§7.6 «People»)', () => {
    const loads = w.officeUsers.map((u) => [u.login, w.trucks.filter((t) => t.dispatcher_id === u.id).length]);
    expect(loads.filter(([, n]) => n !== 0)).toEqual([['iryna', 35], ['oksana', 35], ['tetiana', 30]]);
  });

  it('opens the three «Зараз» items on the trucks and minutes §7.6 names, and the ten «Перевірка» items by code', () => {
    const now = w.exampleItems.filter((i) => i.lane === 'NOW').map((i) => [plateOf(i.truck_id), i.code, i.opened_at, i.title]);
    expect(now).toEqual([
      ['АР 3380 ТК', 'BREAKDOWN_CANT_DRIVE', demo('15:20'), 'Поломка — не можу їхати'],
      ['АР 3344 НТ', 'NOT_ACCEPTED', demo('15:25'), 'Не приймають · Елеватор повний'],
      ['АР 6618 ЕС', 'CALL_ME', demo('15:58'), 'Подзвоніть мені']]);
    const review = w.exampleItems.filter((i) => i.lane === 'REVIEW');
    expect(review.map((i) => i.code).sort(byCodepoint)).toEqual(['IMAGE_QUALITY_LOW', 'NO_SIGNED_TTN', 'PAYMENT_METHOD_PENDING',
      'PLACE_UNKNOWN', 'SAMPLE_CHECK', 'STOP_REVIEW', 'STOP_REVIEW', 'STOP_REVIEW', 'STOP_REVIEW', 'TTN_NO_MASS']);
    const one = (code: string) => review.find((i) => i.code === code)!;
    expect([plateOf(one('TTN_NO_MASS').truck_id), one('TTN_NO_MASS').title]).toEqual(['АР 3344 НТ', 'ТТН без маси (п.19.1.8) · ФГ «Степ» · 5 рейсів']);
    expect(one('IMAGE_QUALITY_LOW').title).toBe('ТТН 2 з 2, зворотний — відблиск · водій залишив так');
    expect([plateOf(one('PAYMENT_METHOD_PENDING').truck_id), one('PAYMENT_METHOD_PENDING').title])
      .toEqual(['АР 6618 ЕС', 'Заправка 12:51 · спосіб оплати невідомий · на чеку лише «БЕЗГОТІВКОВА»']);
    expect([plateOf(one('PLACE_UNKNOWN').truck_id), one('PLACE_UNKNOWN').title]).toEqual(['АР 4471 ВС', 'Нове місце 06:50 · 2 км від «Дніпро-Корм»']);
    expect([one('SAMPLE_CHECK').title, one('SAMPLE_CHECK').opened_at]).toEqual(['Звірте з фото: 9 з 40 сьогодні', demo('16:00')]);
    expect(w.exampleItems.every((i) => !gt(minutesBetween(i.opened_at, at1605), 960) && !gt(0, minutesBetween(i.opened_at, at1605)))).toBe(true);
    expect(w.exampleItems.map((i) => [i.lane, i.group])).toEqual(w.exampleItems.map((i) => [i.lane, i.lane === 'NOW' ? null : i.group]));
  });

  it('keeps the tiles of 16:05: nobody unstarted, six at a stop, one silent over two hours (§7.6)', () => {
    expect(w.exampleBoard.filter((r) => r.not_started !== null)).toEqual([]);
    expect(w.exampleBoard.filter((r) => r.at_stop_min !== null).map((r) => r.state).sort(byCodepoint))
      .toEqual(['У черзі на вивантаження', 'У черзі на вивантаження', 'У черзі на вивантаження', 'У черзі на вивантаження',
        'У черзі на завантаження', 'У черзі на завантаження']);
    const silent = w.exampleBoard.filter((r) => r.contact_at !== null && gt(minutesBetween(r.contact_at, at1605), 120));
    expect(silent.map((r) => [plateOf(r.truck_id), r.state, r.state_line, minutesBetween(r.contact_at!, at1605), r.unsent_at_contact]))
      .toEqual([['АР 5577 ЕК', 'Кордон', 'Ягодин · черга 2 д 7 год', 160, 2]]);
    expect(w.exampleBoard.filter((r) => r.contact_at !== null && gt(0, minutesBetween(r.contact_at, at1605)))).toEqual([]);
  });

  it('writes the lines §7.6 prints for the detailed example trucks', () => {
    const row = (plate: string) => { const r = w.exampleBoard.find((x) => plateOf(x.truck_id) === plate)!; return [r.state, r.state_line, r.rank]; };
    expect(['АР 3344 НТ', 'АР 3380 ТК', 'АР 4471 ВС', 'АР 5678 СЕ', 'АР 6618 ЕС', 'АР 2745 ІВ', 'АР 0633 КХ'].map(row)).toEqual([
      ['Стоїть', 'Не приймають · 0:40', 1], ['Стоїть', 'Поломка · 0:45', 1], ['У черзі на вивантаження', 'Черга · 1:10', 2],
      ['Ремонт', 'СТО КТЛ', 6], ['На базі', 'закінчив 15:50', 1], ['Не на зміні', 'закінчив 15:20', 2], ['Не на зміні', 'ПАПІР', 6]]);
    expect(w.exampleBoard.filter((r) => r.state_line === 'плану немає')).toHaveLength(3);
  });

  it('closes 62 example days today, numbers the confirmed ones ПЛ-100001… in plate order, and exports none', () => {
    const today = w.truckDays.filter((d) => d.example && d.date === '2026-09-21');
    const confirmed = today.filter((d) => d.status === 'CONFIRMED').sort((a, b) => byCodepoint(plateOf(a.truck_id), plateOf(b.truck_id)));
    expect(confirmed.map((d) => d.waybill_no)).toEqual(confirmed.map((_, i) => `ПЛ-${String(100001 + i)}`));
    expect(today.every((d) => d.exported === null && d.figures !== null)).toBe(true);
    expect(today.filter((d) => d.status === 'READY').map((d) => plateOf(d.truck_id))).toEqual(expect.arrayContaining(['АР 2745 ІВ', 'АР 0633 КХ', 'АР 6618 ЕС']));
    const closed = w.exampleBoard.filter((r) => today.some((d) => d.truck_id === r.truck_id));
    expect(closed.map((r) => r.state).filter((s) => s !== 'Не на зміні')).toEqual(['На базі']);
    expect(today.filter((d) => d.figures!.call_entry !== null).map((d) => plateOf(d.truck_id))).toEqual(['АР 0633 КХ']);
    expect(dayOf(w, 'АР 2745 ІВ', '2026-09-21').driver_id).toBe(driverOf(w, '0336').id);
  });

  it('puts the one е-ТТН on the trip of the first confirmed example day in plate order', () => {
    const first = w.truckDays.filter((d) => d.example && d.status === 'CONFIRMED')
      .sort((a, b) => byCodepoint(plateOf(a.truck_id), plateOf(b.truck_id)))[0]!;
    const doc = w.ttnDocs.find((d) => d.ettn !== null)!;
    expect([doc.driver_id, doc.date, doc.example, doc.ettn]).toEqual([first.driver_id, '2026-09-21', true,
      { no: '2026-0921-000318', platform: 'Вчасно.ТТН', status: 'доставлено' }]);
  });

  it('owes the three example originals of C-14, and Ярошенко pressed «Здав» on 18.09', () => {
    const owed = w.ttnDocs.filter((d) => d.example && d.original === null && d.ettn === null);
    expect(owed.map((d) => [w.drivers.find((x) => x.id === d.driver_id)!.short_name, d.trip_no, d.label, d.date, d.note, d.driver_said_handed]))
      .toEqual([
        ['Ковальчук В.', 'Р-26-3187', 'акт №214 · талони 2', '2026-09-16', 'нестача, претензія', null],
        ['Приходько І.', 'Р-26-3290', 'ТТН 004502', '2026-09-18', null, null],
        ['Ярошенко Р.', 'Р-26-3288', 'ТТН 004499', '2026-09-18', null, '2026-09-18']]);
  });

  it('keeps the last trusted reading at base before the typed one, and advances the phone past both keys', () => {
    const ya = w.records.filter((r) => r.device_id === 'device-000006');
    expect(ya.map((r) => [r.type, r.occurred_at, r.key])).toEqual([
      ['SHIFT_END', kyiv('2026-09-20 17:10'), 'device-000006:1'], ['SHIFT_START', demo('05:40'), 'device-000006:2']]);
    const end = ya[0]!;
    expect(end.type === 'SHIFT_END' && end.payload.odometer).toMatchObject({ value: 381402, source: 'DASH_PHOTO' });
    expect(end.place_id).toBe(w.places.find((p) => p.code === 'BASE')!.id);
    expect(ya[1]!.truck_day_id).toBe(dayOf(w, 'АР 2745 ІВ', '2026-09-21').id);
    expect(w.devices.find((d) => d.id === 'device-000006')!.next_seq).toBe(3);
    expect(w.pages.filter((p) => p.record_key === 'device-000006:2').map((p) => [p.artefact, p.drawn?.variant, p.captured_at]))
      .toEqual([['CLUSTER', 'cluster:381405', demo('05:41')]]);
  });

  it('adds a month row per generated truck, every deviation below АР 8150 КС’s +5,9 % at or under +3,4 %', () => {
    const rows = w.truckMonths.filter((m) => m.truck_id !== truckOf(w, 'АР 8150 КС').id);
    expect(rows).toHaveLength(99);
    expect(rows.filter((m) => gt(cmp(m.deviation ?? '0', '3.4'), 0)).map((m) => [plateOf(m.truck_id), m.deviation])).toEqual([]);
    expect(new Set(w.truckMonths.map((m) => m.truck_id)).size).toBe(100);
  });
});
