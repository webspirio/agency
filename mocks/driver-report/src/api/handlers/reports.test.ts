// mocks/driver-report/src/api/handlers/reports.test.ts
import { describe, expect, it } from 'vitest';
import { DomainError } from '@agency/mock';
import { demo } from '../../domain/clock';
import { ctxFor, NATALIA_ACTOR, testServer } from '../../test/drive';
import { reportHandlers } from './reports';

const refusal = (fn: () => unknown) => {
  try { fn(); } catch (e) { if (e instanceof DomainError) return e.code; throw e; }
  return 'RESOLVED';
};

describe('reports (§4.2 C-10 … C-17)', () => {
  it('creates «483920» for Савенко, valid 15 minutes, and refuses an unknown driver', () => {
    const s = testServer('05:15');
    const driver = s.world().drivers.find((d) => d.tab_no === '0457')!;
    const h = reportHandlers(s);
    expect(h.createBindCode(ctxFor(s, NATALIA_ACTOR, { params: { id: driver.id }, body: {} })))
      .toEqual({ code: '483920', url: 'ktl.in.ua/z/483920', expires_at: demo('05:30') });
    expect(h.listDrivers(ctxFor(s, NATALIA_ACTOR, { query: { scope: 'PILOT' } })).data.find((r) => r.id === driver.id)!.binding.state).toBe('CODE_SHOWN');
    expect(refusal(() => h.createBindCode(ctxFor(s, NATALIA_ACTOR, { params: { id: 'driver-999999' }, body: {} })))).toBe('DRIVER_NOT_FOUND');
  });
  it('sorts the fleet month by fuel deviation: АР 8150 КС on top, the next at most +3,4 %', () => {
    const s = testServer('16:08');
    const rows = reportHandlers(s).listTrucks(ctxFor(s, NATALIA_ACTOR, { query: { scope: 'FLEET', month: '2026-09', sort: 'fuel_dev', limit: '100' } })).data;
    expect(rows[0]).toMatchObject({ plate: 'АР 8150 КС', fuel_rate: '33.9', norm: '32.0', deviation: '5.9', over_tolerance: true, method_label: 'CAN' });
    expect(rows[1]!.over_tolerance).toBe(false);
  });
  it('shows АР 8150 КС fuel with one mismatch dated 18.09, and refuses an unknown truck', () => {
    const s = testServer('16:08');
    const truck = s.world().trucks.find((t) => t.plate === 'АР 8150 КС')!;
    const h = reportHandlers(s);
    const f = h.getTruckFuel(ctxFor(s, NATALIA_ACTOR, { params: { id: truck.id }, query: { month: '2026-09' } }));
    expect([f.cells.length, f.mismatches.length, f.norm_block.hold]).toEqual([4, 1, 'Норму КТЛ не затверджено — надлишок для ПДВ не рахується']);
    expect(f.mismatches[0]).toContain('18.09 11:52');
    expect(JSON.stringify(f)).not.toContain('ПДВ,');
    expect(refusal(() => h.getTruckFuel(ctxFor(s, NATALIA_ACTOR, { params: { id: 'truck-999999' }, query: { month: '2026-09' } })))).toBe('TRUCK_NOT_FOUND');
  });
  it('exports confirmed days and imports them once, then reports no changes', () => {
    const s = testServer('16:07');
    const h = reportHandlers(s);
    const file = h.createExport(ctxFor(s, NATALIA_ACTOR, { body: { date: '2026-09-21', scope: 'FLEET', sheet: 'WAYBILLS', format: 'CSV' } }));
    expect([file.file_name, file.rows, file.content.startsWith('﻿')]).toEqual(['КТЛ-подорожні-21.09.2026.csv', 56, true]);
    const first = h.importExport(ctxFor(s, NATALIA_ACTOR, { params: { id: file.id }, body: {} }));
    const second = h.importExport(ctxFor(s, NATALIA_ACTOR, { params: { id: file.id }, body: {} }));
    expect([first.created, second.unchanged, second.note]).toEqual([56, 56, 'Уже в BAS без змін 56 · нових 0']);
    expect(refusal(() => h.importExport(ctxFor(s, NATALIA_ACTOR, { params: { id: 'export-999999' }, body: {} })))).toBe('EXPORT_NOT_FOUND');
  });
  it('lists Олег’s overdue original and receives it', () => {
    const s = testServer('16:15');
    const h = reportHandlers(s);
    const [row] = h.listOriginals(ctxFor(s, NATALIA_ACTOR, { query: { scope: 'PILOT' } })).data.filter((r) => r.group === 'OVERDUE');
    expect([row!.driver, row!.trip_no, row!.days, row!.docs[0]!.label]).toEqual(['Кравчук О.', 'Р-26-3261', 4, 'ТТН 004503 («Добробут»)']);
    const after = h.receiveOriginal(ctxFor(s, NATALIA_ACTOR, { params: { docId: row!.docs[0]!.id }, body: {} }));
    expect(after.docs[0]).toMatchObject({ received_at: demo('16:15'), received_by: 'Н. Шевчук' });
    expect(refusal(() => h.receiveOriginal(ctxFor(s, NATALIA_ACTOR, { params: { docId: 'ttn-999999' }, body: {} })))).toBe('DOCUMENT_NOT_FOUND');
  });
  it('writes the worktime rows with «потрібен графік змінності» and never «Робочий час» as a column', () => {
    const s = testServer('16:05');
    const rows = reportHandlers(s).listWorktime(ctxFor(s, NATALIA_ACTOR, { query: { month: '2026-09', scope: 'PILOT' } })).data;
    expect(rows.map((r) => [r.driver, r.shifts, r.span, r.weekend])).toEqual([
      ['Ватаманюк П.', '17', '186 год', 'потрібен графік змінності'], ['Кравчук О.', '16', '142 год', 'потрібен графік змінності'],
      ['Савенко Г.', '1', 'на зміні', 'потрібен графік змінності']]);
  });
});
