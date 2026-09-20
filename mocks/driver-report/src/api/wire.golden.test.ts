import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import axios, { type AxiosInstance } from 'axios';
import { byCodepoint, transport, type Actor } from '@agency/mock';
import { wiredAs, wiredAt, type Wired } from './wire.golden.helpers';
import { api, call, type OpKey } from './contract';
import { server } from './server';
import { businessDate } from '../domain/clock';
import type { CreateRequestIn, DriverToday, PageIn, RecordIn, RecordView } from '../domain/dto';
import { HRYHORII, NATALIA, OLEH, PAVLO, REVOKED_DEVICE, YAROSHENKO_DEVICE } from '../domain/script';

/**
 * THE WIRE GOLDEN. Every declared operation driven once through the REAL adapter, every declared (operation, code)
 * pair driven as a refusal, every malformed body driven as the product's ValidationPipe would answer it — each
 * reduced to a structural fingerprint and diffed against a committed fixture.
 *
 * This is the ONE artifact in this mock that does not move when the registry moves, and that is the whole point.
 * Every type-level mechanism here is blind to a RE-CASED wire field: `created_at` -> `createdAt` typechecks
 * perfectly when both sides are renamed together. The golden is not.
 *
 * What it does that no other row of `pnpm verify` does:
 *   - it is generated FROM the operation table, so a new operation with no drive is red rather than silently
 *     uncovered — writes included;
 *   - it folds EVERY array element into the fingerprint, not element [0], so a heterogeneous list cannot hide its
 *     odd row;
 *   - it is driven against «Такт 10» — the seed plus forty-five applied script entries — so a list can never
 *     fingerprint as `[]` and pass by being empty;
 *   - it emits VALUE-DOMAIN tokens (`sum_uah:dec2`, `occurred_at:instant`, `fuel_rate:dec1`, `mass:dec3`) rather
 *     than a bare `typeof`, so a decimal string that becomes a number, or an instant that becomes a date, is a diff
 *     instead of `string` either way;
 *   - it pins the refusal STATUS in the COMMITTED file. MEASURED while porting this: asserting the wire status
 *     against `api[key].codes[code]` CANNOT FAIL, because `fail()` derives one from the other. Only an artifact
 *     that does not move when the registry moves can catch a changed status.
 *
 * WHAT IT DOES NOT FREEZE, stated because a fingerprint of `[]empty` looks exactly like coverage:
 *   - `AutoEventView`. It rides on `DriverToday.auto_events` and NOWHERE else, and the driver this drives — Павло —
 *     is on a REGIS truck, which carries no telemetry rows at all (`src/domain/seed.ts`: `RG.telematics`). Only
 *     Олег's `RUPTELA` truck has them, and driving `getToday` as Олег instead would cost the thirteen record
 *     variants, the plan, the paper and the request card that Павло's day is the only one to carry. So the shape of
 *     a simulated telemetry event is pinned by nothing here.
 *   - `DriverToday.corrections_to_ack` is `[]empty` for the same kind of reason — nobody has corrected one of
 *     Павло's records at this beat — but the TYPE it carries, `CorrectionView`, is frozen by the `createCorrection`
 *     drive, so only the nesting is unpinned, not the shape.
 *   - Nothing about VALUES. A fingerprint is key names and value domains: a handler returning the wrong number, the
 *     wrong row, or rows in the wrong order is green here.
 *
 * INDEPENDENCE COMES FROM THE REBUILD. Every drive and every refusal starts from its own `wiredAt(10, …)`, which
 * resets the world and replays the script into it, so no drive observes another's writes. That is ~57 rebuilds of
 * «Такт 10» in this one file and it is the file's whole cost; the refusal observations are therefore taken ONCE and
 * read by both tests that assert about them, rather than driven twice.
 *
 * Regenerate deliberately:  AGENCY_GOLDEN=write pnpm --filter driver-report exec vitest run src/api/wire.golden.test.ts
 */
const HERE = import.meta.dirname;
const GOLDEN_PATH = `${HERE}/wire.golden.json`;
const WRITING = process.env.AGENCY_GOLDEN === 'write';

/** «Такт 10» — «Подорожній лист складається сам», the beat every drive is taken at (§5.6). */
const BEAT = 10;
/** The demo day and its month. Not read off the clock: a golden whose ARGUMENTS move with the world would answer a
 *  moved demo day with a quietly different fingerprint. The clock is compared to this below instead, so a moved day
 *  is red and says so. */
const DAY = '2026-09-21';
const MONTH = '2026-09';

const OFFICE: Actor = { id: NATALIA.id, role: NATALIA.role };
const PAVLO_PHONE: Actor = { id: PAVLO, role: 'driver' };
const HRYHORII_PHONE: Actor = { id: HRYHORII, role: 'driver' };
const REVOKED_PHONE: Actor = { id: REVOKED_DEVICE, role: 'driver' };

/* ── resolving the arguments off the WIRE, never off a literal ──────────────────────────────────────────────── *
 *
 * The ids come from the store, always. `stop-000014` is what this mock's `seq()` assigns and the product assigns
 * UUIDs, so a golden that hard-codes one cannot be replayed against a live API — which is exactly what the
 * `AGENCY_LIVE_API` block at the foot of this file needs. The NATURAL keys (a plan key «3312-1», a plate, a
 * surname) are authored data in `src/domain/seed.ts` and `src/domain/script.ts`, so those are what the drives name,
 * and each resolver throws with the key it could not find rather than driving something else.
 */

/**
 * WHERE a resolver's own client points. `wiredAs` — this realm's route table — for every run this repository can
 * perform; the LIVE replay at the foot of the file swaps it for its one live client, so a drive's own request and
 * the request it makes to look an id up cannot end up at two different servers.
 */
let realm: (actor: Actor) => Wired = wiredAs;

/** One phone's own view of the day — the only wire surface that carries plan stop ids, record keys and page keys. */
const todayOf = (device: string): Promise<DriverToday> =>
  call(realm({ id: device, role: 'driver' }).t, 'getToday', { params: {}, body: undefined });

function only<T>(row: T | undefined, what: string): T {
  if (row === undefined) throw new Error(`the wire golden expects ${what} at «Такт ${BEAT}» and the wire has none`);
  return row;
}

const stopIdOf = (today: DriverToday, planKey: string): string =>
  only(today.plan?.stops.find((s) => s.plan_key === planKey), `plan stop «${planKey}»`).stop_id;

const recordKeyOf = (today: DriverToday, type: RecordView['type']): string =>
  only(today.records.find((r) => r.type === type && !r.voided), `a live ${type} record`).key;

/** A record's page keys. `RecordView.payload` is the whole union, so this reads the field rather than narrowing on
 *  `type` — the union is NOT discriminated by it (I-5), and a cast would be a claim rather than a read. */
function pagesOf(today: DriverToday, type: RecordView['type']): readonly string[] {
  const rec = only(today.records.find((r) => r.type === type && !r.voided), `a live ${type} record`);
  const payload: Record<string, unknown> = { ...rec.payload };
  const pages = payload['pages'];
  return Array.isArray(pages) ? pages.filter((p): p is string => typeof p === 'string') : [];
}

/** A bind code the office has just put on screen, for the driver §5.7 S-01 names. */
async function freshBindCode(office: Wired): Promise<string> {
  const view = await call(office.t, 'createBindCode', { params: { id: await savenkoId(office) }, body: {} });
  return view.code;
}

async function savenkoId(office: Wired): Promise<string> {
  const page = await call(office.t, 'listDrivers', { params: {}, body: undefined, qry: { scope: 'FLEET', limit: '100' } });
  return only(page.data.find((d) => d.full_name.startsWith('Савенко')), 'the driver «Савенко»').id;
}

/** Павло's truck-day of the demo day, read through the board the office actually uses. */
async function pavloDayId(office: Wired): Promise<string> {
  const truckId = only((await todayOf(PAVLO)).truck?.id, "Павло's truck");
  const page = await call(office.t, 'listFleet', { params: {}, body: undefined, qry: { scope: 'FLEET', limit: '100' } });
  const row = only(page.data.find((r) => r.truck_id === truckId), "Павло's row on «Парк зараз»");
  return only(row.truck_day_id ?? undefined, "Павло's truck-day");
}

/** The record a CALL_ME tap sends (§7.2): the phone mints its own `seq` from its own allocator, never an index. */
function callMe(device: string): RecordIn {
  const seq = server.mintSeq(device);
  const at = server.clock.nowIso();
  return { key: `${device}:${seq}`, seq, type: 'CALL_ME', occurred_at: at, committed_at: at, app_clock_at: at,
    gps: 'OK', payload: {} };
}

/** One page of that record, as the outbox uploads one. */
const pageOf = (recordKey: string): PageIn => ({ key: `${recordKey}:p1`, record_key: recordKey, artefact: 'RECEIPT',
  doc_index: 1, page_no: 1, captured_at: server.clock.nowIso(), source: 'DRAWN', bytes: 300000, quality: 'OK',
  quality_reasons: [], drawn_variant: 'receipt-okko-58213' });

/**
 * ONE DRIVE PER DECLARED OPERATION, each through `call()` with a typed operation KEY — never a hand-written URL. A
 * raw verb here would be a SECOND COPY of the path, which is the thing the contract exists to remove, and the
 * golden is the last place one could hide. Each starts from its own `wiredAt(BEAT, actor)`, so a write in one does
 * not move the rows another fingerprints.
 */
const DRIVES: { key: OpKey; actor: Actor; run: (w: Wired) => Promise<unknown> }[] = [
  {
    key: 'getBindPreview',
    actor: OFFICE,
    run: async (office) => {
      const code = await freshBindCode(office);
      return call(realm(HRYHORII_PHONE).t, 'getBindPreview', { params: { code }, body: undefined });
    },
  },
  {
    key: 'confirmBinding',
    actor: OFFICE,
    run: async (office) => {
      const code = await freshBindCode(office);
      return call(realm(HRYHORII_PHONE).t, 'confirmBinding', { params: { code }, body: {} });
    },
  },
  {
    key: 'getToday',
    actor: PAVLO_PHONE,
    /* The office asks for a retake FIRST, and that is not decoration. `RequestCardView` — widened in the round-2
       integration with `doc_index` and `page_no` — rides on `DriverToday.requests` and NOWHERE else, and at «Такт 10»
       Павло's own requests are all done (S-12 was answered by S-14), so a bare `getToday` fingerprints `[]empty` and
       freezes nothing about the one card the driver is shown when the office asks. This is S-12 replayed at the beat
       the golden runs at. */
    run: async (w) => {
      await call(realm(OFFICE).t, 'createRequest', { params: {}, body: await retakeBody() });
      return call(w.t, 'getToday', { params: {}, body: undefined });
    },
  },
  {
    key: 'listNearbyPlaces',
    actor: PAVLO_PHONE,
    run: async (w) => {
      const stop = stopIdOf(await todayOf(PAVLO), '3312-1');
      return call(w.t, 'listNearbyPlaces', { params: {}, body: undefined, qry: { stop_id: stop, limit: '100' } });
    },
  },
  { key: 'submitRecord', actor: PAVLO_PHONE, run: (w) => call(w.t, 'submitRecord', { params: {}, body: callMe(PAVLO) }) },
  {
    key: 'uploadPhoto',
    actor: PAVLO_PHONE,
    run: async (w) => {
      const record = callMe(PAVLO);
      await call(w.t, 'submitRecord', { params: {}, body: record });
      return call(w.t, 'uploadPhoto', { params: {}, body: pageOf(record.key) });
    },
  },
  { key: 'sendHeartbeat', actor: PAVLO_PHONE, run: (w) => call(w.t, 'sendHeartbeat', { params: {}, body: { unsent: 0 } }) },
  { key: 'getMyDay', actor: PAVLO_PHONE, run: (w) => call(w.t, 'getMyDay', { params: { date: DAY }, body: undefined }) },
  { key: 'getMyMonth', actor: PAVLO_PHONE, run: (w) => call(w.t, 'getMyMonth', { params: { month: MONTH }, body: undefined }) },
  {
    key: 'getOfficeSummary',
    actor: OFFICE,
    run: (w) => call(w.t, 'getOfficeSummary', { params: {}, body: undefined, qry: { scope: 'FLEET' } }),
  },
  {
    key: 'listFleet',
    actor: OFFICE,
    run: (w) => call(w.t, 'listFleet', { params: {}, body: undefined, qry: { scope: 'FLEET', limit: '100' } }),
  },
  {
    key: 'listExceptions',
    actor: OFFICE,
    run: (w) => call(w.t, 'listExceptions', { params: {}, body: undefined, qry: { lane: 'REVIEW', scope: 'FLEET', limit: '100' } }),
  },
  {
    key: 'updateException',
    actor: OFFICE,
    run: async (w) => {
      const lane = await call(w.t, 'listExceptions', { params: {}, body: undefined, qry: { lane: 'NOW', scope: 'FLEET', limit: '100' } });
      const item = only(lane.data.find((i) => i.resolved === null), 'an open item in the «Зараз» lane');
      return call(w.t, 'updateException', { params: { id: item.id }, body: { action: 'TAKE' } });
    },
  },
  {
    key: 'getStopReview',
    actor: OFFICE,
    run: async (w) => {
      const stop = stopIdOf(await todayOf(PAVLO), '3312-1');
      return call(w.t, 'getStopReview', { params: { id: stop }, body: undefined });
    },
  },
  {
    key: 'reviewStop',
    actor: OFFICE,
    run: async (w) => {
      const stop = stopIdOf(await todayOf(PAVLO), '3312-1');
      return call(w.t, 'reviewStop', { params: { id: stop }, body: { action: 'ACCEPT_PRINTED', doc_index: 1 } });
    },
  },
  {
    key: 'createRequest',
    actor: OFFICE,
    run: async (w) => {
      const today = await todayOf(PAVLO);
      const record = recordKeyOf(today, 'LOADED');
      const page = only(pagesOf(today, 'LOADED')[0], "a page of Павло's «Завантажено»");
      return call(w.t, 'createRequest', { params: {}, body: { type: 'RETAKE_PHOTO', record_key: record, page_key: page, reasons: ['BLUR'] } });
    },
  },
  {
    key: 'createCorrection',
    actor: OFFICE,
    run: async (w) => {
      const record = recordKeyOf(await todayOf(YAROSHENKO_DEVICE), 'SHIFT_START');
      return call(w.t, 'createCorrection', { params: {}, body: { record_key: record, field: 'odometer', value: '381405', reason: 'TYPO' } });
    },
  },
  {
    key: 'listTruckDays',
    actor: OFFICE,
    run: (w) => call(w.t, 'listTruckDays', { params: {}, body: undefined, qry: { state: 'to-confirm', scope: 'FLEET', limit: '100' } }),
  },
  {
    key: 'getTruckDay',
    actor: OFFICE,
    run: async (w) => call(w.t, 'getTruckDay', { params: { id: await pavloDayId(w) }, body: undefined }),
  },
  {
    key: 'confirmTruckDay',
    actor: OFFICE,
    run: async (w) => {
      const id = await pavloDayId(w);
      const view = await call(w.t, 'getTruckDay', { params: { id }, body: undefined });
      return call(w.t, 'confirmTruckDay', { params: { id }, body: { version: view.version } });
    },
  },
  {
    key: 'printTruckDay',
    actor: OFFICE,
    run: async (w) => call(w.t, 'printTruckDay', { params: { id: await pavloDayId(w) }, body: {} }),
  },
  {
    key: 'getKeyPoints',
    actor: OFFICE,
    run: (w) => call(w.t, 'getKeyPoints', { params: {}, body: undefined, qry: { date: DAY, scope: 'FLEET', limit: '100' } }),
  },
  {
    key: 'getExportPreview',
    actor: OFFICE,
    run: (w) => call(w.t, 'getExportPreview', { params: {}, body: undefined, qry: { date: DAY, scope: 'FLEET' } }),
  },
  {
    key: 'createExport',
    actor: OFFICE,
    run: (w) => call(w.t, 'createExport', { params: {}, body: { date: DAY, scope: 'FLEET', sheet: 'WAYBILLS', format: 'CSV' } }),
  },
  {
    key: 'importExport',
    actor: OFFICE,
    run: async (w) => {
      const file = await call(w.t, 'createExport', { params: {}, body: { date: DAY, scope: 'FLEET', sheet: 'WAYBILLS', format: 'CSV' } });
      return call(w.t, 'importExport', { params: { id: file.id }, body: {} });
    },
  },
  {
    key: 'listTrucks',
    actor: OFFICE,
    run: (w) => call(w.t, 'listTrucks', { params: {}, body: undefined, qry: { scope: 'FLEET', month: MONTH, sort: 'fuel_dev', limit: '100' } }),
  },
  {
    key: 'getTruckFuel',
    actor: OFFICE,
    run: async (w) => {
      const page = await call(w.t, 'listTrucks', { params: {}, body: undefined, qry: { scope: 'FLEET', month: MONTH, sort: 'fuel_dev', limit: '100' } });
      const truck = only(page.data.find((r) => r.plate === 'АР 8150 КС'), 'the truck «АР 8150 КС»');
      return call(w.t, 'getTruckFuel', { params: { id: truck.truck_id }, body: undefined, qry: { month: MONTH } });
    },
  },
  {
    key: 'listOriginals',
    actor: OFFICE,
    run: (w) => call(w.t, 'listOriginals', { params: {}, body: undefined, qry: { scope: 'FLEET', limit: '100' } }),
  },
  {
    key: 'receiveOriginal',
    actor: OFFICE,
    run: async (w) => {
      const page = await call(w.t, 'listOriginals', { params: {}, body: undefined, qry: { scope: 'FLEET', limit: '100' } });
      const overdue = only(page.data.find((r) => r.group === 'OVERDUE' && r.docs.some((d) => d.received_at === null)),
        'an overdue row on «Оригінали»');
      const doc = only(overdue.docs.find((d) => d.received_at === null), 'a document still owed on that row');
      return call(w.t, 'receiveOriginal', { params: { docId: doc.id }, body: {} });
    },
  },
  {
    key: 'listWorktime',
    actor: OFFICE,
    run: (w) => call(w.t, 'listWorktime', { params: {}, body: undefined, qry: { month: MONTH, scope: 'FLEET', limit: '100' } }),
  },
  {
    key: 'listDrivers',
    actor: OFFICE,
    run: (w) => call(w.t, 'listDrivers', { params: {}, body: undefined, qry: { scope: 'FLEET', limit: '100' } }),
  },
  {
    key: 'createBindCode',
    actor: OFFICE,
    run: async (w) => call(w.t, 'createBindCode', { params: { id: await savenkoId(w) }, body: {} }),
  },
];

/**
 * ONE DRIVE PER DECLARED (operation, code) PAIR — the twenty-one of §7.5.
 *
 * This is the half that makes the golden an INSTRUMENT rather than a record. No type-level scheme in this repo
 * survives a cast or a subtype-reduced branch — both residuals are written down as live types in
 * `drift.controls.ts` — so the only thing that can establish what a refusal actually puts on the wire is driving it
 * and looking.
 *
 * These use RAW VERBS deliberately: a refusal has no typed call-site equivalent that also captures the rejection,
 * and the path written here is a second copy on purpose — it is what makes a silently renamed path visible.
 */
const REFUSALS: { key: OpKey; code: string; actor: Actor; run: (w: Wired) => Promise<unknown> }[] = [
  {
    key: 'confirmBinding',
    code: 'BIND_CODE_EXPIRED',
    actor: HRYHORII_PHONE,
    run: (w) => caught(w.http.post('/bind/000000', {})),
  },
  {
    key: 'submitRecord',
    code: 'DEVICE_REVOKED',
    actor: REVOKED_PHONE,
    run: (w) => caught(w.http.post('/driver/records', callMe(REVOKED_DEVICE))),
  },
  {
    key: 'uploadPhoto',
    code: 'DEVICE_REVOKED',
    actor: REVOKED_PHONE,
    run: (w) => caught(w.http.post('/driver/photos', pageOf(`${REVOKED_DEVICE}:1`))),
  },
  {
    key: 'updateException',
    code: 'EXCEPTION_NOT_FOUND',
    actor: OFFICE,
    run: (w) => caught(w.http.patch('/office/exceptions/NO_SUCH:item', { action: 'TAKE' })),
  },
  {
    key: 'getStopReview',
    code: 'STOP_NOT_FOUND',
    actor: OFFICE,
    run: (w) => caught(w.http.get('/office/stops/stop-999999')),
  },
  {
    key: 'reviewStop',
    code: 'STOP_NOT_FOUND',
    actor: OFFICE,
    run: (w) => caught(w.http.patch('/office/stops/stop-999999', { action: 'ACCEPT_STOP' })),
  },
  {
    key: 'reviewStop',
    code: 'DAY_CONFIRMED',
    actor: OFFICE,
    run: async (w) => {
      // Олег's day was confirmed by S-42 at 15:40, an hour before this beat.
      const stop = stopIdOf(await todayOf(OLEH), '3313-1');
      return caught(w.http.patch(`/office/stops/${stop}`, { action: 'ACCEPT_STOP' }));
    },
  },
  {
    key: 'reviewStop',
    code: 'VALUE_INVALID',
    actor: OFFICE,
    run: async (w) => {
      const stop = stopIdOf(await todayOf(PAVLO), '3312-1');
      return caught(w.http.patch(`/office/stops/${stop}`, { action: 'SET_FIELD', doc_index: 1, field: 'arrival', value: '748' }));
    },
  },
  {
    key: 'createRequest',
    code: 'REQUEST_ALREADY_OPEN',
    actor: OFFICE,
    run: async (w) => {
      const body = await retakeBody();
      await w.http.post('/office/requests', body);
      return caught(w.http.post('/office/requests', body));
    },
  },
  {
    key: 'createRequest',
    code: 'TARGET_NOT_FOUND',
    actor: OFFICE,
    run: (w) => caught(w.http.post('/office/requests', { type: 'CALL_ME', record_key: `${PAVLO}:1`, reasons: [] })),
  },
  {
    key: 'createCorrection',
    code: 'TARGET_NOT_FOUND',
    actor: OFFICE,
    run: (w) => caught(w.http.post('/office/corrections', { record_key: `${PAVLO}:1`, field: 'odometer', value: '381405', reason: 'TYPO' })),
  },
  {
    key: 'createCorrection',
    code: 'DAY_CONFIRMED',
    actor: OFFICE,
    run: async (w) => {
      const record = recordKeyOf(await todayOf(OLEH), 'SHIFT_START');
      return caught(w.http.post('/office/corrections', { record_key: record, field: 'odometer', value: '241476', reason: 'TYPO' }));
    },
  },
  {
    key: 'createCorrection',
    code: 'VALUE_INVALID',
    actor: OFFICE,
    run: async (w) => {
      const record = recordKeyOf(await todayOf(PAVLO), 'SHIFT_START');
      return caught(w.http.post('/office/corrections', { record_key: record, field: 'odometer', value: '38 1405', reason: 'TYPO' }));
    },
  },
  {
    key: 'getTruckDay',
    code: 'TRUCK_DAY_NOT_FOUND',
    actor: OFFICE,
    run: (w) => caught(w.http.get('/office/truck-days/day-999999')),
  },
  {
    key: 'confirmTruckDay',
    code: 'TRUCK_DAY_NOT_FOUND',
    actor: OFFICE,
    run: (w) => caught(w.http.post('/office/truck-days/day-999999/confirm', { version: 1 })),
  },
  {
    key: 'confirmTruckDay',
    code: 'DAY_CHANGED',
    actor: OFFICE,
    // Version 0 is a version nobody ever looked at: every day starts at 1 and each change bumps it.
    run: async (w) => caught(w.http.post(`/office/truck-days/${await pavloDayId(w)}/confirm`, { version: 0 })),
  },
  {
    key: 'printTruckDay',
    code: 'TRUCK_DAY_NOT_FOUND',
    actor: OFFICE,
    run: (w) => caught(w.http.post('/office/truck-days/day-999999/print', {})),
  },
  {
    key: 'importExport',
    code: 'EXPORT_NOT_FOUND',
    actor: OFFICE,
    run: (w) => caught(w.http.post('/office/exports/export-999999/import', {})),
  },
  {
    key: 'getTruckFuel',
    code: 'TRUCK_NOT_FOUND',
    actor: OFFICE,
    run: (w) => caught(w.http.get('/office/trucks/truck-999999/fuel', { params: { month: MONTH } })),
  },
  {
    key: 'receiveOriginal',
    code: 'DOCUMENT_NOT_FOUND',
    actor: OFFICE,
    run: (w) => caught(w.http.post('/office/originals/ttn-999999/receive', {})),
  },
  {
    key: 'createBindCode',
    code: 'DRIVER_NOT_FOUND',
    actor: OFFICE,
    run: (w) => caught(w.http.post('/office/drivers/driver-999999/bind-codes', {})),
  },
];

/** A rejection, kept. `null` means the drive RESOLVED — the request the table calls a refusal was answered as a
 *  success, which is a drive that proves nothing and is named as such below. */
const caught = (p: Promise<unknown>): Promise<unknown> => p.then(() => null, (e: unknown) => e);

/** The body «Попросити перезняти» sends for Павло's «Завантажено», read off his own phone's day. */
async function retakeBody(): Promise<CreateRequestIn> {
  const today = await todayOf(PAVLO);
  return { type: 'RETAKE_PHOTO', record_key: recordKeyOf(today, 'LOADED'),
    page_key: only(pagesOf(today, 'LOADED')[0], "a page of Павло's «Завантажено»"), reasons: ['BLUR'] };
}

/**
 * MALFORMED BODIES, which are NOT refusals.
 *
 * A validation failure declares no `code` — the product's ValidationPipe produces one and `AllExceptionsFilter`
 * puts it on the wire as a 400 with `message: string[]` and nothing else — so it forms no (operation, code) pair
 * and the exhaustiveness loop must keep passing without it. Putting these in the refusal table would make that loop
 * demand a code that does not exist, which is the tell that they belong apart.
 */
const MALFORMED: { name: string; actor: Actor; run: (w: Wired) => Promise<unknown> }[] = [
  { name: 'submitRecord.emptyBody', actor: PAVLO_PHONE, run: (w) => caught(w.http.post('/driver/records', {})) },
  {
    name: 'submitRecord.forgedFields',
    actor: PAVLO_PHONE,
    run: (w) => caught(w.http.post('/driver/records', { ...callMe(PAVLO), id: 'record-999999', received_at: '1999-01-01T00:00:00.000Z' })),
  },
  {
    name: 'reviewStop.wrongType',
    actor: OFFICE,
    run: async (w) => {
      const stop = stopIdOf(await todayOf(PAVLO), '3312-1');
      return caught(w.http.patch(`/office/stops/${stop}`, { action: 'ACCEPT_PRINTED', doc_index: '1' }));
    },
  },
  {
    name: 'createExport.badScope',
    actor: OFFICE,
    run: (w) => caught(w.http.post('/office/exports', { date: DAY, scope: 'ALL', sheet: 'WAYBILLS', format: 'CSV' })),
  },
];

/** The declared pairs, read off the registry OBJECT at runtime. */
const declaredPairs = (): string[] => {
  const out: string[] = [];
  const table = api as unknown as Record<string, { codes: Record<string, number> }>;
  for (const key of Object.keys(table)) {
    for (const code of Object.keys(table[key]!.codes)) out.push(`${key}.${code}`);
  }
  return out;
};

type Seen = { status: number | 'RESOLVED'; code: string | undefined; shape: string[] };

/**
 * Every refusal driven ONCE, and the observation shared.
 *
 * Two tests assert about these — that the pair refused with the code the table names, and that its status and
 * envelope match the committed fixture — and each drive costs a full rebuild of «Такт 10». Driving them twice would
 * double the file's cost to establish nothing the first pass did not.
 */
let observed: Promise<Record<string, Seen>> | null = null;
const refusalsOnce = (): Promise<Record<string, Seen>> => (observed ??= driveRefusals());

async function driveRefusals(): Promise<Record<string, Seen>> {
  const out: Record<string, Seen> = {};
  for (const refusal of REFUSALS) {
    const w = await wiredAt(BEAT, refusal.actor);
    const err = (await refusal.run(w)) as { response?: { status?: number; data?: unknown } } | null;
    const data = err?.response?.data;
    out[`${String(refusal.key)}.${refusal.code}`] = {
      status: err?.response?.status ?? 'RESOLVED',
      code: (data as { code?: string } | undefined)?.code,
      shape: shapeOf(data),
    };
  }
  return out;
}

describe('the wire golden pins the shape every screen will receive', () => {
  it('covers EVERY declared operation — a new one with no drive is red here', () => {
    // Without this, adding an operation silently adds an uncovered route and the golden goes on passing about the
    // ones it already knew.
    /* byCodepoint, never localeCompare: ICU collation is a property of the machine node was built on, so a golden
       that sorts with it can differ between a laptop and CI for reasons unrelated to the code. */
    expect(DRIVES.map((d) => String(d.key)).sort(byCodepoint)).toEqual(Object.keys(api).sort(byCodepoint));
  });

  it('drives every operation through call(), never a hand-written URL', () => {
    /* A raw verb in a drive is a SECOND COPY of the path — the thing the contract exists to remove — and the golden
       is the last place one could hide, because it is the one file that legitimately talks to the wire. The refusal
       table keeps its raw verbs deliberately: a refusal has no typed call-site equivalent that also captures the
       rejection. */
    const source = readFileSync(`${HERE}/wire.golden.test.ts`, 'utf8');
    const drives = source.slice(source.indexOf('const DRIVES'), source.indexOf('const REFUSALS'));
    expect(drives).not.toMatch(/\.(get|post|patch|put|delete)\(/);
  });

  it('drives EVERY declared (operation, code) pair — the loop runs at RUNTIME', () => {
    /* AT RUNTIME, over Object.keys, and that is the point. A mapped type would name a missing pair earlier, but a
       cast in the table evades it — and a cast is exactly the residual no type-level scheme here survives.
       Object.keys reads the registry object that actually ships. */
    const driven = REFUSALS.map((r) => `${String(r.key)}.${r.code}`);
    expect([...driven].sort(byCodepoint)).toEqual([...declaredPairs()].sort(byCodepoint));
  });

  it('is taken at the beat whose world the fixture describes', async () => {
    /* The drives name «2026-09-21» rather than reading the clock, so this is the one place the two are compared. A
       moved demo day would otherwise fingerprint empty lists and a fixture nobody could read as wrong. */
    await wiredAt(BEAT, OFFICE);
    expect({ day: businessDate(server.clock.nowIso()), beat: server.ui.beat }).toEqual({ day: DAY, beat: BEAT });
  });

  /**
   * NARROW, deliberately, and its limit is written down: the status half CANNOT fail while every refusal goes
   * through `fail()`, because `fail()` reads the status off the same registry entry this reads. What it does catch
   * is a handler that bypasses `fail()` and throws a hand-typed `DomainError`, and a drive whose operation answers
   * a DIFFERENT code than the table claims. The committed fixture is what catches a changed status.
   */
  it('refuses through fail(), with the code the table names', async () => {
    const seen = await refusalsOnce();
    const table = api as unknown as Record<string, { codes: Record<string, number> }>;
    for (const refusal of REFUSALS) {
      const pair = `${String(refusal.key)}.${refusal.code}`;
      const got = seen[pair]!;
      /* 'RESOLVED' means the request the table calls a refusal was answered as a success. Naming the pair matters
         more than the assertion that follows: a drive that does not refuse is a drive that proves nothing. */
      expect({ pair, refused: got.status !== 'RESOLVED' }).toEqual({ pair, refused: true });
      expect({ pair, status: got.status, code: got.code }).toEqual({
        pair,
        status: table[String(refusal.key)]!.codes[refusal.code],
        code: refusal.code,
      });
    }
  });

  it('emits the committed wire shape for every route, refusal and malformed body', async () => {
    const seen: Record<string, string[]> = {};
    for (const drive of DRIVES) {
      const w = await wiredAt(BEAT, drive.actor);
      seen[drive.key] = shapeOf(await drive.run(w));
    }

    /* The ENVELOPE is pinned the way every success response already is. Without this the refusal drives assert a
       (status, code) pair and nothing at all about the shape around it — and the envelope is what a screen renders
       when `codeOf` returns undefined.

       THE STATUS IS IN THE FINGERPRINT, and that is not decoration. MEASURED: asserting `err.response.status`
       against `api[key].codes[code]` CANNOT FAIL — fail() derives the wire status from that same registry entry, so
       both sides move together and the assertion is `dec === dec` one more time. */
    const refusals: Record<string, string[]> = {};
    for (const [pair, got] of Object.entries(await refusalsOnce())) {
      refusals[pair] = [`${got.status}`, ...got.shape];
    }

    const malformed: Record<string, string[]> = {};
    for (const bad of MALFORMED) {
      const w = await wiredAt(BEAT, bad.actor);
      const err = (await bad.run(w)) as { response?: { status?: number; data?: unknown } } | null;
      malformed[bad.name] = [`${err?.response?.status ?? 'RESOLVED'}`, ...shapeOf(err?.response?.data)];
    }

    const rendered = `${JSON.stringify({ ...seen, refusals, malformed }, null, 2)}\n`;
    if (WRITING) {
      writeFileSync(GOLDEN_PATH, rendered);
      return;
    }

    const committed = readFileSync(GOLDEN_PATH, 'utf8');
    /* The PARSED comparison first, because it is the one a human can read: vitest names the operation and the token
       that moved. */
    expect({ ...seen, refusals, malformed }).toEqual(JSON.parse(committed) as Record<string, unknown>);
    /* Then the BYTES — the regeneration this run would have written, against the file on disk. That is what
       «regenerated and byte-identical» means and it is strictly stronger than the line above: the parsed comparison
       ignores key ORDER, so a drive quietly deleted from the table leaves a fixture entry nothing produces any more
       and `toEqual` on two objects that no longer share a key set is red only on that key — while a REORDERED table,
       which changes what the fixture would be regenerated as, is invisible to it entirely. The `wire:frozen` row of
       `pnpm verify:full` performs the same regeneration for templates/mock and never for a scaffolded mock, so for
       this mock the check has to live here. */
    expect(rendered).toBe(committed);
  }, 120000);

  it('would notice a re-cased wire field, which no type here can', () => {
    // `occurred_at` -> `occurredAt` typechecks perfectly if both sides are renamed together. This is the only
    // mechanism that sees the WIRE change.
    expect(shapeOf({ occurred_at: '2026-09-21T13:05:00.000Z' })).toEqual(['{occurred_at:instant}']);
    expect(shapeOf({ occurredAt: '2026-09-21T13:05:00.000Z' })).not.toEqual(['{occurred_at:instant}']);
  });

  it('distinguishes a decimal string from a number, which `typeof` does not', () => {
    expect(shapeOf({ sum_uah: '22800.00' })).toEqual(['{sum_uah:dec2}']);
    expect(shapeOf({ sum_uah: 22800 })).toEqual(['{sum_uah:number}']);
  });

  it('keeps l/100 km, t·km and tonnes apart from every other decimal', () => {
    // One decimal, two and three are three different wire contracts (§0.1): a rate that starts carrying two places
    // is a changed wire even though `typeof` and `dec2` alone would both call it a string.
    expect(shapeOf({ fuel_rate: '31.8', sum_uah: '31.80', mass: '31.800' })).toEqual([
      '{fuel_rate:dec1,mass:dec3,sum_uah:dec2}',
    ]);
  });

  it('folds EVERY element of an array, so an odd row cannot hide behind [0]', () => {
    const mixed = shapeOf([{ a: '1.00' }, { a: 1 }]);
    expect(mixed).toEqual(['[]{a:dec2}|{a:number}']);
  });

  it('says an empty list is empty, rather than fingerprinting as a shape', () => {
    expect(shapeOf([])).toEqual(['[]empty']);
  });
});

/* ── THE LIVE REPLAY ────────────────────────────────────────────────────── *
 *
 * SPEC 15 promises "exactly one migration mechanism". This is it, and it is the reason the drives read their ids
 * from the store rather than from `stop-000014`: the product assigns UUIDs, so a golden that hard-codes a sequence
 * id cannot be replayed at all.
 *
 *   AGENCY_LIVE_API=https://api.example.com pnpm --filter driver-report test
 *
 * SKIPPED when unset, through vitest's own `describe.skipIf` — so the suite REPORTS skipped rather than passing
 * vacuously. `if (!LIVE) return` would report a pass, which is the status collapse this whole layer exists to
 * prevent.
 */
const LIVE = process.env.AGENCY_LIVE_API;

/**
 * ONE ENTRY, and it should stay that way. `seq-id` and `uuid` are the same THING — a store-assigned identifier —
 * fingerprinted differently because this mock's allocator is a sequence and the product's is a UUID. Every other
 * token must match exactly: a second entry here would mean the wire has genuinely diverged, and that is the finding
 * rather than something to configure away.
 */
const EQUIVALENT: Readonly<Record<string, readonly string[]>> = { 'seq-id': ['uuid'] };

/** Is the live token an accepted stand-in for the committed one? */
const equivalent = (committed: string, live: string): boolean =>
  committed === live || (EQUIVALENT[committed]?.includes(live) ?? false);

/** Compare two fingerprints token by token, allowing only the declared equivalences. */
export function fingerprintsAgree(committed: string, live: string): boolean {
  const a = committed.split(/([{},:[\]|])/);
  const b = live.split(/([{},:[\]|])/);
  if (a.length !== b.length) return false;
  return a.every((token, i) => equivalent(token, b[i] ?? ''));
}

/* The equivalence logic runs in every suite, LIVE or not — otherwise the only code path that decides whether a
   replay passed would itself be unexercised in every run this repository can perform. */
describe('the replay allows exactly one equivalence and no more', () => {
  const ACK = '{duplicate:boolean,id:seq-id,key:string,received_at:instant}';

  it('accepts a uuid where the mock committed a seq-id', () => {
    expect(fingerprintsAgree(ACK, ACK.replace('seq-id', 'uuid'))).toBe(true);
  });

  it('refuses any OTHER substitution, however plausible', () => {
    expect(fingerprintsAgree(ACK, ACK.replace('boolean', 'string'))).toBe(false);
    expect(fingerprintsAgree(ACK, ACK.replace('instant', 'string'))).toBe(false);
    expect(fingerprintsAgree(ACK, ACK.replace('received_at', 'receivedAt'))).toBe(false);
  });

  it('refuses a uuid where the mock did NOT commit a seq-id — the map is one-way', () => {
    expect(fingerprintsAgree(ACK.replace('key:string', 'key:uuid'), ACK)).toBe(false);
  });

  it('refuses a shape with a different number of tokens', () => {
    expect(fingerprintsAgree(ACK, ACK.replace(',key:string', ''))).toBe(false);
  });

  it('accepts an identical fingerprint', () => {
    expect(fingerprintsAgree(ACK, ACK)).toBe(true);
  });
});

describe.skipIf(LIVE === undefined)('the golden replays against a live API', () => {
  it('answers every drive with the committed shape, modulo the id allocator', async () => {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Record<string, string[]>;
    /* One live client, and `realm` swapped so the resolvers a drive calls to read an id off the wire go to the same
       place the drive does. Nothing is rebuilt: a live API has one world and one session. */
    const live: Wired = { t: transport(liveHttp()), http: liveHttp() };
    realm = () => live;
    try {
      for (const drive of DRIVES) {
        const seen = shapeOf(await drive.run(live));
        const committed = golden[drive.key] ?? [];
        expect({ key: drive.key, agree: seen.length === committed.length }).toEqual({ key: drive.key, agree: true });
        seen.forEach((token, i) => {
          expect({ key: drive.key, i, agree: fingerprintsAgree(committed[i] ?? '', token) }).toEqual({
            key: drive.key, i, agree: true,
          });
        });
      }
    } finally {
      realm = wiredAs;
    }
  }, 120000);
});

/** A plain axios against the live API: the same serializer the seam pins, and NO adapter. */
const liveHttp = (): AxiosInstance => axios.create({ baseURL: LIVE, paramsSerializer: { indexes: null } });

const DEC1 = /^-?\d+\.\d$/;
const DEC2 = /^-?\d+\.\d{2}$/;
const DEC3 = /^-?\d+\.\d{3}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SEQ_ID = /^[a-z][a-z0-9-]*-\d{6}$/;

/** The value DOMAIN, not its `typeof`. A decimal that becomes a float, or an instant that becomes a date, is a
 *  different token and therefore a diff. `dec1` and `dec3` are this mock's own: l/100 km and «−0,6 %» carry one
 *  place, tonnes and t·km three, and a rate that silently gains a place is a changed wire. */
function tokenOf(value: string): string {
  if (DEC1.test(value)) return 'dec1';
  if (DEC2.test(value)) return 'dec2';
  if (DEC3.test(value)) return 'dec3';
  if (INSTANT.test(value)) return 'instant';
  if (BUSINESS_DATE.test(value)) return 'date';
  if (SEQ_ID.test(value)) return 'seq-id';
  return 'string';
}

/** A structural fingerprint: key names and value DOMAINS, recursively, sorted. */
function shapeOf(value: unknown): string[] {
  return [fingerprint(value)].flat();
}

function fingerprint(value: unknown): string {
  if (value === null) return 'null';
  if (value === '') return 'empty-body';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]empty';
    /* EVERY element, deduped and ordered — not element [0]. Ordered by CODE POINT: this ordering goes into the
       COMMITTED golden, so sorting it with ICU collation would make the fixture itself depend on the ICU build
       node was compiled with. */
    const variants = [...new Set(value.map((v) => fingerprint(v)))].sort(byCodepoint);
    return `[]${variants.join('|')}`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}:${fingerprint(v)}`)
      .sort(byCodepoint);
    return `{${entries.join(',')}}`;
  }
  if (typeof value === 'string') return tokenOf(value);
  return typeof value;
}
