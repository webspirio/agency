// mocks/driver-report/src/domain/worktime.test.ts
import { describe, expect, it } from 'vitest';
import { demo, kyiv } from './clock';
import { mkRecord, openDay, seededWorld, withRows } from './fixtures';
import { nightMinutes, onSiteMinutes, roadStopMinutes, shiftMinutes } from './worktime';

describe('working time (§7.3, C-15)', () => {
  it('counts the minutes inside 22:00–06:00 Kyiv', () => {
    expect(nightMinutes(demo('05:20'), demo('16:02'))).toBe(40);
    expect(nightMinutes(kyiv('2026-09-20 21:30'), demo('06:30'))).toBe(480);
    expect(nightMinutes(demo('08:00'), demo('16:00'))).toBe(0);
  });
  it('measures a shift, open or closed', () => {
    const shift = { started_at: demo('05:20'), ended_at: demo('16:02') } as never;
    expect(shiftMinutes(shift, demo('16:05'))).toBe(642);
    expect(shiftMinutes({ started_at: demo('05:20'), ended_at: null } as never, demo('11:50'))).toBe(390);
  });
});

const PAVLO = 'device-000001';   // Redmi 9A · Павло, АР 1234 ВС (RG)
const OLEH = 'device-000002';    // Samsung A34 · Олег, АР 9012 МК (R+C; T-08 MOTION at 13:03)

describe('working time — night edges', () => {
  it('counts nothing for an empty or reversed span, a whole night, and two nights across two days', () => {
    expect(nightMinutes(demo('23:00'), demo('23:00'))).toBe(0);
    expect(nightMinutes(demo('16:00'), demo('08:00'))).toBe(0);
    expect(nightMinutes(demo('22:00'), kyiv('2026-09-22 06:00'))).toBe(480);
    expect(nightMinutes(kyiv('2026-09-19 12:00'), demo('12:00'))).toBe(960);
  });
  it('holds across the autumn clock change (25.10.2026, 04:00 → 03:00 Kyiv): that night is 9 hours long', () => {
    expect(nightMinutes(kyiv('2026-10-24 22:00'), kyiv('2026-10-25 06:00'))).toBe(540);
  });
});

describe('on-site and road-stop minutes (§7.3, C-08 «на точках … · тривога 18 хв»)', () => {
  it('adds the known on-site minutes and skips the unknown ones', () => {
    expect(onSiteMinutes([{ on_site_min: 98 }, { on_site_min: null }, { on_site_min: 105 }])).toBe(203);
    expect(onSiteMinutes([])).toBe(0);
  });

  it('closes a road stop at its ROAD_STOP_END time and files it under its reason', () => {
    const { w: w0, shift } = openDay(seededWorld(), { device: PAVLO, plate: 'АР 1234 ВС', at: '05:20' });
    const road = mkRecord(w0, { type: 'ROAD_STOP', device: PAVLO, at: '12:30', shift, payload: { reason: 'ALERT', can_drive: null } });
    const end = mkRecord(w0, { type: 'ROAD_STOP_END', device: PAVLO, at: '12:48', shift,
      payload: { road_stop_key: road.key, at: demo('12:48'), closed_by: 'DRIVER' } });
    const w = withRows(w0, { records: [road, end] });
    expect(roadStopMinutes(w, shift.id, demo('16:02'))).toEqual({ ALERT: 18, CURFEW: 0, HEAT: 0, CHECKPOINT: 0,
      BREAKDOWN: 0, DETOUR: 0, ACCIDENT: 0, WEIGH_CONTROL: 0 });
  });

  it('takes the picked end time, not the moment the driver tapped (NEXT_TAP_CHIP)', () => {
    const { w: w0, shift } = openDay(seededWorld(), { device: PAVLO, plate: 'АР 1234 ВС', at: '05:20' });
    const road = mkRecord(w0, { type: 'ROAD_STOP', device: PAVLO, at: '12:30', shift, payload: { reason: 'HEAT', can_drive: null } });
    const end = mkRecord(w0, { type: 'ROAD_STOP_END', device: PAVLO, at: '13:45', shift,
      payload: { road_stop_key: road.key, at: demo('13:10'), closed_by: 'NEXT_TAP_CHIP' } });
    expect(roadStopMinutes(withRows(w0, { records: [road, end] }), shift.id, demo('14:00')).HEAT).toBe(40);
  });

  it('runs an open road stop on RG up to now, and ignores a voided one and another shift’s', () => {
    const { w: w0, shift } = openDay(seededWorld(), { device: PAVLO, plate: 'АР 1234 ВС', at: '05:20' });
    const road = mkRecord(w0, { type: 'ROAD_STOP', device: PAVLO, at: '12:30', shift, payload: { reason: 'ALERT', can_drive: null } });
    const voided = { ...mkRecord(w0, { type: 'ROAD_STOP', device: PAVLO, at: '09:00', shift,
      payload: { reason: 'BREAKDOWN', can_drive: true } }), voided_by: 'device-000001:999' };
    const other = mkRecord(w0, { type: 'ROAD_STOP', device: PAVLO, at: '10:00', payload: { reason: 'CURFEW', can_drive: null } });
    const w = withRows(w0, { records: [road, voided, other] });
    const m = roadStopMinutes(w, shift.id, demo('13:00'));
    expect([m.ALERT, m.BREAKDOWN, m.CURFEW]).toEqual([30, 0, 0]);
  });

  it('closes an R+C road stop at the first MOTION after it («за рухом», T-08 at 13:03), once that is visible', () => {
    const { w: w0, shift } = openDay(seededWorld(), { device: OLEH, plate: 'АР 9012 МК', at: '07:22' });
    const road = mkRecord(w0, { type: 'ROAD_STOP', device: OLEH, at: '12:25', shift, payload: { reason: 'CHECKPOINT', can_drive: null } });
    const w = withRows(w0, { records: [road] });
    expect(roadStopMinutes(w, shift.id, demo('12:50')).CHECKPOINT).toBe(25);
    expect(roadStopMinutes(w, shift.id, demo('15:06')).CHECKPOINT).toBe(38);
  });

  it('never counts an open road stop past the end of its shift', () => {
    const { w: w0, shift: open } = openDay(seededWorld(), { device: PAVLO, plate: 'АР 1234 ВС', at: '05:20' });
    const shift = { ...open, ended_at: demo('16:02') };
    const road = mkRecord(w0, { type: 'ROAD_STOP', device: PAVLO, at: '15:50', shift, payload: { reason: 'ALERT', can_drive: null } });
    const w = { ...withRows(w0, { records: [road] }), shifts: [...w0.shifts.filter((s) => s.id !== open.id), shift] };
    expect(roadStopMinutes(w, shift.id, demo('18:00')).ALERT).toBe(12);
  });
});
