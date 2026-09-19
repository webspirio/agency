// mocks/driver-report/src/domain/fixtures.ts
/** Test-only World builders (I-17). Imported by *.test.ts files only — nothing the app ships reaches this module. */
import { emptyStores, snapshot } from '../api/stores';
import { DEMO_DATE, demo } from './clock';
import { toInt } from './num';
import { populate } from './seed';
import type { ArtefactKind, Driver, DriverRecord, Page, Payloads, PlannedStop, Place, RecordOf, RecordType, Shift, Truck,
  TruckDay, World } from './types';

export function seededWorld(): World {
  const s = emptyStores();
  populate(s);
  return snapshot(s);
}
export function withRows(w: World, patch: Partial<World>): World {
  const out = { ...w } as Record<string, unknown[]>;
  for (const [k, rows] of Object.entries(patch)) out[k] = [...(out[k] ?? []), ...(rows as unknown[])];
  return out as unknown as World;
}
export const stopOf = (w: World, planKey: string): PlannedStop => must(w.plannedStops.find((s) => s.plan_key === planKey), planKey);
export const truckOf = (w: World, plate: string): Truck => must(w.trucks.find((t) => t.plate === plate), plate);
export const placeOf = (w: World, code: string): Place => must(w.places.find((p) => p.code === code), code);
export const driverOf = (w: World, tab: string): Driver => must(w.drivers.find((d) => d.tab_no === tab), tab);
export const dayOf = (w: World, plate: string, date: string): TruckDay =>
  must(w.truckDays.find((d) => d.truck_id === truckOf(w, plate).id && d.date === date), `${plate} ${date}`);
function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`fixtures: no ${what} in the seed`);
  return v;
}
let n = 0;
const fixtureId = (prefix: string): string => { n += 1; return `${prefix}-9${String(n).padStart(5, '0')}`; };
/** A shift and its truck-day for `plate` on DEMO_DATE, driven by `device`'s driver. */
export function openDay(w: World, p: { device: string; plate: string; at: string }): { w: World; day: TruckDay; shift: Shift } {
  const truck = truckOf(w, p.plate);
  const device = must(w.devices.find((d) => d.id === p.device), p.device);
  const driverId = device.driver_id ?? must(w.drivers.find((d) => d.truck_id === truck.id), p.plate).id;
  const day: TruckDay = { id: fixtureId('day'), truck_id: truck.id, driver_id: driverId, date: DEMO_DATE, version: 1,
    status: 'OPEN', waybill_no: null, confirmed_by: null, confirmed_at: null, confirm_reason: null, printed_at: null,
    signed_at: null, exported: null, example: false, figures: null };
  const shift: Shift = { id: fixtureId('shift'), driver_id: driverId, device_id: p.device, truck_id: truck.id,
    trailer_id: truck.trailer_id, truck_day_id: day.id, started_at: demo(p.at), ended_at: null, attested_at: null,
    closed_by: null, start_key: null };
  return { w: withRows(w, { truckDays: [day], shifts: [shift] }), day, shift };
}
export function mkRecord<T extends RecordType>(w: World, p: { type: T; device: string; at: string;
  plan_key?: string | null; place_code?: string | null; payload: Payloads[T]; seq?: number; shift?: Shift }): RecordOf<T> {
  const device = must(w.devices.find((d) => d.id === p.device), p.device);
  const driverId = p.shift?.driver_id ?? device.driver_id ?? must(w.drivers.find((d) => d.tab_no === '0457'), '0457').id;
  const driver = must(w.drivers.find((d) => d.id === driverId), driverId);
  const stop = p.plan_key ? stopOf(w, p.plan_key) : null;
  const placeId = stop?.place_id ?? (p.place_code ? placeOf(w, p.place_code).id : null);
  const at = demo(p.at);
  const id = fixtureId('rec');
  const seq = p.seq ?? toInt(id.slice(-5));
  return { id, key: `${p.device}:${seq}`, seq, device_id: p.device, driver_id: driver.id,
    truck_id: p.shift?.truck_id ?? driver.truck_id, shift_id: p.shift?.id ?? null, truck_day_id: p.shift?.truck_day_id ?? null,
    occurred_at: at, committed_at: at, app_clock_at: at, received_at: at, stop_id: stop?.id ?? null, place_id: placeId,
    gps: 'OK', flags: [], voided_by: null, late: false, type: p.type, payload: p.payload } as unknown as RecordOf<T>;
}
export function mkPage(w: World, p: { record: DriverRecord; artefact: ArtefactKind; n: number; variant: string; at: string }): Page {
  void w;
  return { id: `page-9${p.record.seq}${p.n}`, key: `${p.record.key}:p${p.n}`, record_key: p.record.key, artefact: p.artefact,
    doc_index: 1, page_no: p.n, captured_at: demo(p.at), source: 'DRAWN', bytes: 700000, quality: 'OK', quality_reasons: [],
    deferred: null, drawn: { variant: p.variant, value: null, sim_read: null }, image: null, received_at: demo(p.at),
    superseded_by: null };
}
