// mocks/driver-report/src/api/stores.ts
/** Every store of the mock, one per entity of §7.2 (I-6). The Server holds one `Stores`; a snapshot of it is the
 *  read-only `World` every domain function takes. Ids are store-assigned (`createStore` → `seq`), never invented. */
import { createStore, MAX_LIMIT, type Store } from '@agency/mock';
import type * as T from '../domain/types';

export type Stores = { /* exactly I-6 */ trailers: Store<T.Trailer>; trucks: Store<T.Truck>; officeUsers: Store<T.OfficeUser>;
  rota: Store<T.RotaSlot>; drivers: Store<T.Driver>; devices: Store<T.Device>; bindCodes: Store<T.BindCode>;
  places: Store<T.Place>; distances: Store<T.Distance>; trips: Store<T.Trip>; plannedStops: Store<T.PlannedStop>;
  shifts: Store<T.Shift>; truckDays: Store<T.TruckDay>; records: Store<T.DriverRecord>; pages: Store<T.Page>;
  ttnDocs: Store<T.TtnDoc>; requests: Store<T.Request>; corrections: Store<T.Correction>;
  resolutions: Store<T.Resolution>; telemetry: Store<T.Telemetry>; exports: Store<T.ExportRow>; audit: Store<T.Audit>;
  statements: Store<T.StatementLine>; truckMonths: Store<T.TruckMonth>; driverMonths: Store<T.DriverMonth>;
  exampleItems: Store<T.ExampleItem>; exampleBoard: Store<T.ExampleBoardRow> };

export function emptyStores(): Stores {
  return { trailers: createStore('trailer', []), trucks: createStore('truck', []), officeUsers: createStore('user', []),
    rota: createStore('rota', []), drivers: createStore('driver', []), devices: createStore('device', []),
    bindCodes: createStore('bind', []), places: createStore('place', []), distances: createStore('dist', []),
    trips: createStore('trip', []), plannedStops: createStore('stop', []), shifts: createStore('shift', []),
    truckDays: createStore('day', []), records: createStore('rec', []), pages: createStore('page', []),
    ttnDocs: createStore('ttn', []), requests: createStore('req', []), corrections: createStore('corr', []),
    resolutions: createStore('res', []), telemetry: createStore('tel', []), exports: createStore('export', []),
    audit: createStore('audit', []), statements: createStore('stmt', []), truckMonths: createStore('tmonth', []),
    driverMonths: createStore('dmonth', []), exampleItems: createStore('exitem', []), exampleBoard: createStore('exboard', []) };
}
/** Every row, paging through Store.list (limit is capped at MAX_LIMIT = 100). A store of exactly 100 rows needs a
 *  second, empty page to know it is done. */
export function allRows<R extends { id: string }>(store: Store<R>): R[] {
  const out: R[] = [];
  for (let page = 1; ; page += 1) {
    const chunk = store.list({ page, limit: MAX_LIMIT });
    out.push(...chunk.data);
    if (chunk.data.length !== MAX_LIMIT) return out;
  }
}
export function snapshot(s: Stores): T.World {
  return Object.fromEntries(Object.entries(s).map(([k, store]) => [k, allRows(store as Store<{ id: string }>)])) as T.World;
}
