// mocks/driver-report/src/domain/export.test.ts
import { describe, expect, it } from 'vitest';
import { demo } from './clock';
import { fileName, keyPointsCsv, sheetView, toCsv, toJson, type Sheet } from './export';
import { seededWorld } from './fixtures';
import { toInt } from './num';

const w = seededWorld();
const view = (sheet: Sheet, scope: 'PILOT' | 'FLEET' = 'FLEET') => sheetView(w, sheet, '2026-09-21' as never, scope, demo('16:07'));
const row = (cells: string[], confirmed = true) => ({ cells, confirmed, example: false, ettn: false, exported_line: null });

describe('export (§4.2 C-11, D8)', () => {
  it('shows confirmed and ready days, counts and exports the confirmed ones', () => {
    const v = view('WAYBILLS');
    expect([v.title, v.columns.length, v.rows.length, v.total]).toEqual(['Подорожні листи', 15, 62, 56]);
    expect(v.columns.slice(0, 7)).toEqual(['Номер', 'Дата', 'Машина', 'Водій', 'Таб. №', 'Одометр виїзд, км', 'Джерело']);
    expect(view('WAYBILLS', 'PILOT').total).toBe(0);
  });
  it('sums the example legs and refuels of the confirmed days', () => {
    expect([view('LEGS').total, view('REFUELS').total, view('WORKTIME').total]).toEqual([90, 39, 56]);
  });
  it('writes CSV as UTF-8 with BOM, «;», CRLF — confirmed rows only', () => {
    const csv = toCsv({ title: 't', columns: ['Час', 'Літри'], rows: [row(['08:57', '250,00']), row(['09:10', '10,00'], false)], total: 1 });
    expect(csv).toBe('﻿Час;Літри\r\n08:57;250,00\r\n');
    expect(toCsv({ title: 't', columns: ['a'], rows: [row(['ТОВ «Дніпро-Корм»; склад'])], total: 1 })).toBe('﻿a\r\n"ТОВ «Дніпро-Корм»; склад"\r\n');
  });
  it('writes JSON with the four sheets as keys', () => {
    const json = toJson({ WAYBILLS: view('WAYBILLS'), LEGS: view('LEGS'), REFUELS: view('REFUELS'), WORKTIME: view('WORKTIME') });
    expect(Object.keys(JSON.parse(json) as object)).toEqual(['Подорожні листи', 'Ділянки', 'Заправки', 'Робочий час']);
  });
  it('names the files as C-10 and C-11 do', () => {
    const d = '2026-09-21' as never;
    expect([fileName('WAYBILLS', d, 'CSV'), fileName('LEGS', d, 'CSV'), fileName('REFUELS', d, 'CSV'), fileName('WORKTIME', d, 'CSV'),
      fileName('ALL', d, 'JSON'), fileName('KEY_POINTS', d, 'CSV')]).toEqual(['КТЛ-подорожні-21.09.2026.csv',
      'КТЛ-ділянки-21.09.2026.csv', 'КТЛ-заправки-21.09.2026.csv', 'КТЛ-робочий-час-21.09.2026.csv', 'КТЛ-BAS-21.09.2026.json',
      'КТЛ-ключові-точки-21.09.2026.csv']);
  });
  it('carries the е-ТТН example row in «Ділянки»', () => {
    const cells = view('LEGS').rows.filter((r) => r.ettn).flatMap((r) => r.cells);
    expect(cells).toContain('е-ТТН № 2026-0921-000318 · Вчасно.ТТН · доставлено');
  });
  it('follows every value column with its source', () => {
    const cols = view('WAYBILLS').columns;
    expect([cols[6], cols[8], cols[12]]).toEqual(['Джерело', 'Джерело', 'Джерело']);
  });
  it('writes the key points file of C-10', () => {
    const csv = keyPointsCsv([{ plate: 'АР 1234 ВС', place: 'Дніпро-Корм', arrived_at: demo('06:10'), departed_at: demo('08:40'),
      departed_label: '08:40 (запис)', odometer: 412391, source: 'PHOTO', simulated: false }]);
    expect(csv).toBe('﻿Машина;Місце;Прибуття;Виїзд;Одометр;Джерело\r\nАР 1234 ВС;Дніпро-Корм;06:10;08:40 (запис);412391;ФОТО\r\n');
  });
});

/* The eight tests above only ever meet example days, which read `figures`. A pilot day is derived from its records
 * instead — the path every demo day takes once «Такт 10» confirms it — so the seed's own history pins it here:
 * Павло's ПЛ-000398 of 18.09 (§7.6 «History»: 411 413 → 411 625 = 212 км, 98 з вантажем, full fill 16:40 at 411 612)
 * and the two pilot days of 20.09, both imported into BAS the same evening. */
describe('export — a pilot day derived from its records (§7.3, §7.6 «History»)', () => {
  const pilot = (sheet: Sheet, date: string) => sheetView(w, sheet, date as never, 'PILOT', demo('16:07'));

  it('writes Павло’s ПЛ-000398 from his odometer readings, legs, receipt and shift', () => {
    expect(pilot('WAYBILLS', '2026-09-18').rows).toEqual([{ cells: ['ПЛ-000398', '18.09.2026', 'АР 1234 ВС', 'Ватаманюк П.',
      '0213', '411413', 'ФОТО', '411625', 'ФОТО', '212', '98', '193,80', 'OCR чека', '11,55', 'так'], confirmed: true,
      example: false, ettn: false, exported_line: 'У BAS 19.09 07:30 · версія 9' }]);
  });
  it('writes one «Ділянки» row per leg, the loaded one with its ТТН, mass and t·km', () => {
    expect(pilot('LEGS', '2026-09-18').rows.map((r) => r.cells)).toEqual([
      ['ПЛ-000398', '1', 'База', 'Дніпро-Корм', 'ні', '36', 'ФОТО', '—', '—', '—', '—', '06:05', 'ВОДІЙ', 'так'],
      ['ПЛ-000398', '2', 'Дніпро-Корм', 'Берізка', 'так', '98', 'ФОТО', '24,200', '2371,6', '004488', '—', '11:40', 'ВОДІЙ', 'так'],
      ['ПЛ-000398', '3', 'Берізка', 'База', 'ні', '78', 'ФОТО', '—', '—', '—', '—', '16:58', 'ВОДІЙ', 'так']]);
  });
  it('writes the refuel from its receipt, the litres at the example diesel price', () => {
    expect(pilot('REFUELS', '2026-09-18').rows.map((r) => r.cells)).toEqual([['ПЛ-000398', '16:40', 'ОККО Запоріжжя', '57264',
      '3000209871', '193,80', 'OCR чека', '17674,56', '****4417', 'так', '411612', 'ФОТО', 'так']]);
  });
  it('writes the shift span, the hours at points and at night, and says the tachograph was not read', () => {
    expect(pilot('WORKTIME', '2026-09-18').rows.map((r) => r.cells)).toEqual([['Ватаманюк П.', '0213', '18.09.2026', '05:25',
      '16:58', '11,55', '5,33', '0,58', 'не звірено (Регіс)', 'так']]);
  });
  it('marks an imported day with its BAS line, and never writes that line into a file', () => {
    const v = pilot('WAYBILLS', '2026-09-20');
    expect(v.rows.map((r) => [r.cells[2], r.cells[9], r.cells[6], r.exported_line])).toEqual([
      ['АР 1234 ВС', '365', 'ФОТО', 'У BAS 20.09 18:30 · версія 4'], ['АР 9012 МК', '296', 'CAN', 'У BAS 20.09 18:30 · версія 4']]);
    const all = { WAYBILLS: v, LEGS: pilot('LEGS', '2026-09-20'), REFUELS: pilot('REFUELS', '2026-09-20'),
      WORKTIME: pilot('WORKTIME', '2026-09-20') };
    expect([toCsv(v), toJson(all)].filter((text) => text.includes('У BAS'))).toEqual([]);
  });
  it('keeps the three «Джерело» columns of «Подорожні листи» apart in the JSON', () => {
    const all = { WAYBILLS: pilot('WAYBILLS', '2026-09-18'), LEGS: pilot('LEGS', '2026-09-18'),
      REFUELS: pilot('REFUELS', '2026-09-18'), WORKTIME: pilot('WORKTIME', '2026-09-18') };
    const [first] = (JSON.parse(toJson(all)) as Record<string, Record<string, string>[]>)['Подорожні листи'] ?? [];
    expect([first?.['Джерело (Одометр виїзд, км)'], first?.['Джерело (Одометр повернення, км)'], first?.['Джерело (Пальне, л)'],
      Object.keys(first ?? {}).length]).toEqual(['ФОТО', 'ФОТО', 'OCR чека', 15]);
  });
});

describe('export — the fleet example read from its figures (§7.6)', () => {
  it('adds every confirmed example day’s legs up to its run, and its run up to its two odometer readings', () => {
    const legs = view('LEGS').rows.filter((r) => r.confirmed && r.example);
    const days = view('WAYBILLS').rows.filter((r) => r.confirmed && r.example);
    const km = (cell: string | undefined): number => toInt(cell ?? 'missing');
    const mismatched = days.filter((d) => {
      const run = km(d.cells[9]);
      const legSum = legs.filter((l) => l.cells[0] === d.cells[0]).reduce((acc, l) => acc + km(l.cells[5]), 0);
      return legSum !== run || km(d.cells[7]) - km(d.cells[5]) !== run;
    });
    expect([days.length, mismatched.map((d) => d.cells[0])]).toEqual([56, []]);
  });
  it('carries each confirmed example day’s loaded km in «Ділянки» exactly as its waybill’s «З вантажем»', () => {
    // BAS reads the two sheets side by side: a day whose loaded legs disagree with its waybill is a row an accountant
    // has to chase. A one-leg day is its whole run loaded, so its waybill must say so too.
    const legs = view('LEGS').rows.filter((r) => r.confirmed && r.example);
    const days = view('WAYBILLS').rows.filter((r) => r.confirmed && r.example);
    const km = (cell: string | undefined): number => toInt(cell ?? 'missing');
    const mismatched = days.filter((d) => {
      const loaded = legs.filter((l) => l.cells[0] === d.cells[0] && l.cells[4] === 'так').reduce((acc, l) => acc + km(l.cells[5]), 0);
      return loaded !== km(d.cells[10]);
    });
    expect([days.length, mismatched.map((d) => d.cells[0])]).toEqual([56, []]);
  });
});
