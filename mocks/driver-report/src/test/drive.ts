// mocks/driver-report/src/test/drive.ts
/** The handler-test driver (I-17): a fresh server with its clock pinned, a handler context for any operation, a record
 *  submitted the way the phone's outbox submits it (the record, then each of its pages), and a driver's own scripted
 *  day replayed through that same path. Imported by *.test.ts files only — nothing the app ships reaches this module. */
import type { Actor, HandlerCtxOf } from '@agency/mock';
import { fmtTime } from '../app/format';
import type { Api, OpKey } from '../api/contract';
import { driverHandlers } from '../api/handlers/driver';
import { createServer, type Server } from '../api/server';
import { demo, isBefore } from '../domain/clock';
import type { PageIn, RecordIn } from '../domain/dto';
import { HRYHORII, OLEH, PAVLO, REVOKED_DEVICE, SCRIPT } from '../domain/script';
import type { ArtefactKind, RecordType } from '../domain/types';

export const PAVLO_ACTOR: Actor = { id: PAVLO, role: 'driver' };
export const OLEH_ACTOR: Actor = { id: OLEH, role: 'driver' };
export const HRYHORII_ACTOR: Actor = { id: HRYHORII, role: 'driver' };
export const REVOKED_ACTOR: Actor = { id: REVOKED_DEVICE, role: 'driver' };
/** Office actors are `'user-' + login` (§7.8); the handlers resolve them to the user's store id. */
export const NATALIA_ACTOR: Actor = { id: 'user-natalia', role: 'operator' };
export const IRYNA_ACTOR: Actor = { id: 'user-iryna', role: 'dispatcher' };

/** `createServer()` with its clock set to `demo(hm ?? '05:14')` and left frozen. */
export function testServer(hm?: string): Server {
  const s = createServer();
  s.clock.set(demo(hm ?? '05:14'));
  return s;
}

/** A handler context as the adapter builds one: `now` is the server clock, once. */
export function ctxFor<K extends OpKey>(s: Server, actor: Actor, p: { params?: Record<string, string>; body?: unknown;
  query?: Record<string, string> } = {}): HandlerCtxOf<Api, K> {
  return { params: p.params ?? {}, query: p.query ?? {}, body: p.body, actor, now: s.clock.nowIso() } as unknown as HandlerCtxOf<Api, K>;
}

type PageSpec = { artefact: ArtefactKind; doc_index: number; page_no: number; variant: string; value?: string; sim_read?: string };
/** The record types whose payload names its pages. */
const NAMES_PAGES: readonly RecordType[] = ['LOADED', 'UNLOADED', 'DOCS_ADDED'];

/** Sets the clock to `committed ?? hm`, mints the device's seq, submits the record through `driverHandlers` and uploads
 *  its pages (`${key}:p1` …, source DRAWN, 700 000 bytes). `plan_key` resolves to the stop and its place, `place_code`
 *  to a place. */
export function submit(s: Server, device: string, type: RecordType, hm: string, payload: unknown, opts: {
  plan_key?: string; place_code?: string; committed?: string; pages?: PageSpec[];
} = {}): { key: string; id: string; seq: number } {
  const occurred = demo(hm);
  const committed = demo(opts.committed ?? hm);
  s.clock.set(committed);
  const seq = s.mintSeq(device);
  const key = `${device}:${seq}`;
  const w = s.world();
  const stop = opts.plan_key === undefined ? null : w.plannedStops.find((p) => p.plan_key === opts.plan_key) ?? null;
  if (opts.plan_key !== undefined && stop === null) throw new Error(`submit: no planned stop «${opts.plan_key}»`);
  const place = opts.place_code === undefined ? null : w.places.find((p) => p.code === opts.place_code) ?? null;
  if (opts.place_code !== undefined && place === null) throw new Error(`submit: no place «${opts.place_code}»`);
  const placeId = stop?.place_id ?? place?.id ?? null;
  const pages = opts.pages ?? [];
  const pageKey = (i: number): string => `${key}:p${i + 1}`;

  const body: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  if (NAMES_PAGES.includes(type)) body.pages = pages.map((_, i) => pageKey(i));
  const record = { key, seq, type, occurred_at: occurred, committed_at: committed, app_clock_at: committed, gps: 'OK',
    ...(stop === null ? {} : { stop_id: stop.id }), ...(placeId === null ? {} : { place_id: placeId }),
    payload: body } as unknown as RecordIn;

  const actor: Actor = { id: device, role: 'driver' };
  const h = driverHandlers(s);
  const ack = h.submitRecord(ctxFor<'submitRecord'>(s, actor, { body: record }));
  pages.forEach((pg, i) => {
    const page: PageIn = { key: pageKey(i), record_key: key, artefact: pg.artefact, doc_index: pg.doc_index, page_no: pg.page_no,
      captured_at: occurred, source: 'DRAWN', bytes: 700000, quality: 'OK', quality_reasons: [], drawn_variant: pg.variant,
      ...(pg.value === undefined ? {} : { drawn_value: pg.value }),
      ...(pg.sim_read === undefined ? {} : { drawn_sim_read: pg.sim_read }) };
    h.uploadPhoto(ctxFor<'uploadPhoto'>(s, actor, { body: page }));
  });
  return { key: ack.key, id: ack.id, seq };
}

/** Replays `device`'s own SCRIPT records up to `until` (Kyiv 'HH:MM') through `submit`, resolving plates, place codes,
 *  `road_stop_of` and `shift_id: 'CURRENT'` locally; skips REQUEST_SEEN / PHOTO_REPLACE (they need an office request).
 *  Returns script id → record key. */
export function replayDriver(s: Server, device: string, until: string): Record<string, string> {
  const w0 = s.world();
  const idOf = (plate: string): string => (w0.trucks.find((t) => t.plate === plate) ?? w0.trailers.find((t) => t.plate === plate))!.id;
  const skip = new Set(['REQUEST_SEEN', 'PHOTO_REPLACE']);
  const keys: Record<string, string> = {};
  for (const e of SCRIPT) {
    if (e.step.kind !== 'record' || e.actor.id !== device || isBefore(demo(until), e.at)) continue;
    for (const r of e.step.records) {
      if (skip.has(r.type)) continue;
      const payload: Record<string, unknown> = { ...r.payload };
      if (typeof payload.truck_plate === 'string' && typeof payload.trailer_plate === 'string') {
        payload.truck_id = idOf(payload.truck_plate);
        payload.trailer_id = idOf(payload.trailer_plate);
        delete payload.truck_plate;
        delete payload.trailer_plate;
      }
      if (typeof payload.place_code === 'string') {
        payload.place_id = w0.places.find((p) => p.code === payload.place_code)!.id;
        delete payload.place_code;
      }
      if (typeof payload.road_stop_of === 'string') {
        payload.road_stop_key = keys[payload.road_stop_of];
        delete payload.road_stop_of;
      }
      if (payload.shift_id === 'CURRENT') {
        payload.shift_id = s.world().shifts.filter((x) => x.device_id === r.device).at(-1)!.id;
      }
      keys[e.id] = submit(s, r.device, r.type, fmtTime(r.occurred_at), payload, {
        plan_key: r.plan_key ?? undefined, place_code: r.place_code ?? undefined, committed: fmtTime(r.committed_at),
        pages: r.pages.map((pg) => ({ artefact: pg.artefact, doc_index: pg.doc_index, page_no: pg.page_no, variant: pg.variant,
          value: pg.value ?? undefined, sim_read: pg.sim_read ?? undefined })),
      }).key;
    }
  }
  return keys;
}
