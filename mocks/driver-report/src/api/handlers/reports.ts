// mocks/driver-report/src/api/handlers/reports.ts
/** Operations 22–32 of §7.4: key points, the «В BAS» preview, its files and the simulated import, the per-truck month
 *  and fuel page, the paper chase, shift lengths, and the drivers with their bind codes (§4.2 C-10 … C-16). Thin: every
 *  rule lives in `src/domain/views/reports.ts`, `src/domain/export.ts` and the derivations; a handler reads `s.stores` /
 *  `s.world()` at call time (the stage's reset replaces them), uses `c.now` and never the wall clock, stores what the
 *  domain returns, and tells the other panes through `s.wrote`.
 *
 *  Each refusal is its operation's own literal `fail(...)` (`contract:complete` credits nothing else). No return-type
 *  annotation on `reportHandlers`: an annotation widens the map and blinds the exactness sink in routes.ts. */
import { asBusinessDate, asInstant, pageQuery, type BusinessDate, type HandlerCtxOf, type Instant,
  type Paginated } from '@agency/mock';
import { addMinutes, businessDate } from '../../domain/clock';
import { lt } from '../../domain/num';
import type { ExportRow, Scope, World } from '../../domain/types';
import { driverRows, exportFileOf, exportPreviewView, FLEET_CONFLICT, importResultOf, keyPointRows, originalRowOf,
  originalsRows, truckDayOfDoc, truckFuelView, truckMonthRows, worktimeRows } from '../../domain/views/reports';
import { fail, type Api } from '../contract';
import { SAYS_DRIVER, SAYS_EXPORT, SAYS_ORIGINAL, SAYS_TRUCK } from '../says';
import type { Server } from '../server';

/** The codes the office shows in turn (§5.7 S-01): the n-th code created is `BIND_CODES[n % 4]`, so the first is
 *  «483920». Drawn, not random — the demo must say the same digits every time. */
export const BIND_CODES: readonly string[] = ['483920', '591736', '274018', '806452'];
/** A code is good for 15 minutes (§4.2 C-16 «14:59»). */
const CODE_MINUTES = 15;

type Query = Record<string, string | string[]>;
/** The first value of a query key, or undefined. */
const q = (query: Query, key: string): string | undefined => {
  const v = query[key];
  return Array.isArray(v) ? v[0] : v;
};
const scopeOf = (raw: string | undefined): Scope => (raw === 'FLEET' ? 'FLEET' : 'PILOT');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** A wire date, or the server's business date when the screen sent none (or something that is not one). */
function dateOr(raw: string | undefined, now: Instant): BusinessDate {
  if (raw === undefined || !DATE.test(raw)) return businessDate(now);
  try {
    return asBusinessDate(raw);
  } catch {
    return businessDate(now);
  }
}
const monthOr = (raw: string | undefined, now: Instant): string =>
  (raw !== undefined && /^\d{4}-\d{2}$/.test(raw) ? raw : businessDate(now).slice(0, 7));
const sortOf = (raw: string | undefined): 'fuel_dev' | 'plate' | 'km' => (raw === 'plate' || raw === 'km' ? raw : 'fuel_dev');
/** A page of rows by the wire's `page` / `limit` (limit capped at 100), chunked rather than multiplied. */
function paged<T>(rows: readonly T[], query: Query): Paginated<T> {
  const { page, limit } = pageQuery(query);
  let start = 0;
  for (let p = 1; p !== page && lt(start, rows.length); p += 1) start += limit;
  return { data: rows.slice(start, start + limit), total: rows.length, page, limit };
}
/** The office user behind an actor (`'user-' + login`, §7.8), by the STORE id every `by` field keeps. */
const userId = (w: World, actorId: string): string => w.officeUsers.find((u) => `user-${u.login}` === actorId)?.id ?? actorId;

export function reportHandlers(s: Server) {
  return {
    /** C-10: one row per visit on the date, in arrival order; `truck_id` narrows to one truck (C-13's tab). */
    getKeyPoints: (c: HandlerCtxOf<Api, 'getKeyPoints'>) => {
      const now = asInstant(c.now);
      const truckId = q(c.query, 'truck_id');
      return paged(keyPointRows(s.world(), dateOr(q(c.query, 'date'), now), scopeOf(q(c.query, 'scope')),
        truckId === undefined || truckId === '' ? null : truckId, now), c.query);
    },

    /** C-11: the count Reading, the four sheets, and the newest export of that date and scope with its import. */
    getExportPreview: (c: HandlerCtxOf<Api, 'getExportPreview'>) => {
      const now = asInstant(c.now);
      return exportPreviewView(s.world(), dateOr(q(c.query, 'date'), now), scopeOf(q(c.query, 'scope')), now);
    },

    /** A file of the confirmed days (D8): a sheet as CSV (;), or all four as JSON. Kept as an export row, so the
     *  import that follows knows which days it carried. */
    createExport: (c: HandlerCtxOf<Api, 'createExport'>) => {
      const now = asInstant(c.now);
      const w = s.world();
      const date = dateOr(c.body.date, now);
      const file = exportFileOf(w, date, c.body.scope, c.body.sheet, c.body.format, now);
      const row = s.stores.exports.create({ date, scope: c.body.scope, sheet: file.sheet, format: file.format,
        created_at: now, by: userId(w, c.actor.id), day_ids: file.day_ids, file_name: file.file_name, import: null });
      s.wrote('createExport', c, { truck_day_id: null, result_id: row.id });
      return { id: row.id, file_name: file.file_name, mime: file.mime, content: file.content, rows: file.rows };
    },

    /** «Імпорт у BAS (імітація)»: each day not yet in BAS is created, one exported on its current version is unchanged,
     *  one changed since is updated (a correction under the same number). A second import of the same batch reports
     *  «Уже в BAS без змін N · нових 0». */
    importExport: (c: HandlerCtxOf<Api, 'importExport'>) => {
      const now = asInstant(c.now);
      const row = s.stores.exports.get(c.params.id);
      if (row === undefined) fail('importExport', 'EXPORT_NOT_FOUND', SAYS_EXPORT.EXPORT_NOT_FOUND);
      let created = 0;
      let updated = 0;
      let unchanged = 0;
      for (const id of row.day_ids) {
        const day = s.stores.truckDays.get(id);
        if (day === undefined) continue;
        if (day.exported !== null && day.exported.version === day.version) {
          unchanged += 1;
          continue;
        }
        if (day.exported === null) created += 1;
        else updated += 1;
        s.stores.truckDays.update(day.id, { exported: { export_id: row.id, at: now, version: day.version } });
      }
      const imp: NonNullable<ExportRow['import']> = { at: now, created, updated, unchanged,
        corrections: row.scope === 'FLEET' && created !== 0 ? [FLEET_CONFLICT] : [] };
      s.stores.exports.update(row.id, { import: imp });
      s.wrote('importExport', c, { truck_day_id: null, result_id: row.id });
      return importResultOf(imp);
    },

    /** C-12: the per-truck month, sorted as asked (fuel deviation first by default). */
    listTrucks: (c: HandlerCtxOf<Api, 'listTrucks'>) => {
      const now = asInstant(c.now);
      return paged(truckMonthRows(s.world(), scopeOf(q(c.query, 'scope')), monthOr(q(c.query, 'month'), now),
        sortOf(q(c.query, 'sort'))), c.query);
    },

    /** C-13: one truck's fuel for the month. */
    getTruckFuel: (c: HandlerCtxOf<Api, 'getTruckFuel'>) => {
      const now = asInstant(c.now);
      const view = truckFuelView(s.world(), c.params.id, monthOr(q(c.query, 'month'), now), now);
      if (view === null) fail('getTruckFuel', 'TRUCK_NOT_FOUND', SAYS_TRUCK.TRUCK_NOT_FOUND);
      return view;
    },

    /** C-14: overdue originals by driver, and the ТТН expected today. */
    listOriginals: (c: HandlerCtxOf<Api, 'listOriginals'>) =>
      paged(originalsRows(s.world(), scopeOf(q(c.query, 'scope')), asInstant(c.now)), c.query),

    /** «Оригінал отримано»: the office's mark closes the paper chase for that document (the driver's «Здав» is only a
     *  hint). A second mark keeps the first. Answers with the row the document is shown in. */
    receiveOriginal: (c: HandlerCtxOf<Api, 'receiveOriginal'>) => {
      const now = asInstant(c.now);
      const w0 = s.world();
      const doc = s.stores.ttnDocs.get(c.params.docId);
      if (doc === undefined) fail('receiveOriginal', 'DOCUMENT_NOT_FOUND', SAYS_ORIGINAL.DOCUMENT_NOT_FOUND);
      if (doc.original === null) {
        s.stores.ttnDocs.update(doc.id, { original: { received_at: now, received_by: userId(w0, c.actor.id) } });
      }
      const w = s.world();
      s.wrote('receiveOriginal', c, { truck_day_id: truckDayOfDoc(w, doc.id), result_id: doc.id, highlight: true });
      const row = originalRowOf(w, doc.id, now);
      if (row === null) throw new Error(`receiveOriginal: «${doc.id}» vanished between its write and its row`);
      return row;
    },

    /** C-15: shift lengths beside the tachograph. */
    listWorktime: (c: HandlerCtxOf<Api, 'listWorktime'>) => {
      const now = asInstant(c.now);
      return paged(worktimeRows(s.world(), monthOr(q(c.query, 'month'), now), scopeOf(q(c.query, 'scope'))), c.query);
    },

    /** C-16: the drivers with their phones or the code on show. */
    listDrivers: (c: HandlerCtxOf<Api, 'listDrivers'>) =>
      paged(driverRows(s.world(), scopeOf(q(c.query, 'scope')), asInstant(c.now)), c.query),

    /** «Підключити телефон»: a code good for 15 minutes, shown as a QR of «ktl.in.ua/z/<code>» (C-16). */
    createBindCode: (c: HandlerCtxOf<Api, 'createBindCode'>) => {
      const now = asInstant(c.now);
      const w = s.world();
      const driver = w.drivers.find((d) => d.id === c.params.id);
      if (driver === undefined) fail('createBindCode', 'DRIVER_NOT_FOUND', SAYS_DRIVER.DRIVER_NOT_FOUND);
      const code = BIND_CODES[w.bindCodes.length % BIND_CODES.length] ?? '483920';
      const row = s.stores.bindCodes.create({ code, driver_id: driver.id, created_by: userId(w, c.actor.id), created_at: now,
        expires_at: addMinutes(now, CODE_MINUTES), opened_at: null, used_at: null, device_id: null });
      s.wrote('createBindCode', c, { truck_day_id: null, result_id: row.id, highlight: true });
      return { code, url: `ktl.in.ua/z/${code}`, expires_at: row.expires_at };
    },
  };
}
