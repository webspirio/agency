// mocks/driver-report/src/domain/script.ts
/** The demo day as data (§5.6, §5.7, §5.4 #5): the fourteen beats, the fifty script entries S-01 … S-51 (S-43 is
 *  derived by the server, never scripted) and the ten rewind checkpoints. Every instant is authored in Kyiv and
 *  converted once through `demo()`. Records name their targets by natural key (plan stop, plate, script id); the
 *  stage runner (W0-20) resolves them against the realm's server. */
import { demo } from './clock';
import type { ArtefactKind, Deferred, Instant, Odometer, RecordType, Scope, SegmentChip } from './types';

export const PAVLO = 'device-000001';
export const OLEH = 'device-000002';
export const HRYHORII = 'device-000003';
export const YAROSHENKO_DEVICE = 'device-000006';
export const REVOKED_DEVICE = 'device-000009';
export const NATALIA = { id: 'user-natalia', role: 'operator' } as const;

/* ── types: exactly I-13 ── */

export type ConsoleRoute = { kind: 'path'; path: string } | { kind: 'truck-day'; plate: string; date: string }
  | { kind: 'driver-card'; tab_no: string };
export type Beat = { n: number; title: string; clock: Instant; phone: string; route: ConsoleRoute; scope: Scope;
  counts: [number, number, number, number, number]; cue: string };
export type PageTemplate = { artefact: ArtefactKind; doc_index: number; page_no: number; variant: string;
  value: string | null; sim_read: string | null; at: Instant; deferred: Deferred | null };
export type RecordTemplate = { device: string; type: RecordType; occurred_at: Instant; committed_at: Instant;
  plan_key: string | null; place_code: string | null; payload: TemplatePayload; pages: PageTemplate[] };
/** Payload with natural keys instead of ids: truck_plate/trailer_plate, place_code, road_stop_of (script id),
 *  request_of (script id), supersedes_of ({ script id, page_no }), shift_id: 'CURRENT'. The runner resolves them. */
export type TemplatePayload = Record<string, unknown>;
export type TargetRef = { stop: string } | { driverTab: string } | { truckDay: { plate: string; date: string } }
  | { record: { script: string } } | { seedRecord: { device: string; type: RecordType } } | { lastExport: true }
  | { bindCodeOf: string } | { none: true };
/** `bodies` run in order through the same op; a body `version: 'CURRENT'` is replaced by the day’s version. */
export type ScriptStep = { kind: 'record'; records: RecordTemplate[] }
  | { kind: 'op'; op: string; target: TargetRef; bodies: Record<string, unknown>[];
      pageOf?: { script: string; page_no: number } };
export type LiveMatch = { actor_id: string; op: string; record_type?: RecordType; plan_key?: string | null; request?: boolean };
export type ScriptEntry = { id: string; beat: number | null; at: Instant; mode: 'LIVE' | 'AUTO';
  actor: { id: string; role: string }; step: ScriptStep; match: LiveMatch | null };

/* ── builders ── */

const odo = (value: number, basis: Odometer['basis'], read: number | null = value): Odometer =>
  ({ value, source: 'DASH_PHOTO', basis, expected: value, read, choice: 'CONFIRMED', page_key: null });
const can = (value: number): Odometer =>
  ({ value, source: 'CAN', basis: 'CAN_DELTA', expected: value, read: null, choice: 'AUTO', page_key: null });
const pg = (artefact: ArtefactKind, doc_index: number, page_no: number, variant: string, hm: string,
  extra: Partial<PageTemplate> = {}): PageTemplate =>
  ({ artefact, doc_index, page_no, variant, value: null, sim_read: null, at: demo(hm), deferred: null, ...extra });
const cluster = (km: number, hm: string, extra: Partial<PageTemplate> = {}): PageTemplate =>
  pg('CLUSTER', 1, 1, `cluster:${km}`, hm, { value: String(km), sim_read: String(km), ...extra });
const ttnPages = (nos: string[], hm: string): PageTemplate[] => nos.flatMap((no, i) =>
  [pg('TTN_FRONT', i + 1, 1, `ttn-${no}-front`, hm), pg('TTN_BACK', i + 1, 2, `ttn-${no}-back`, hm)]);
const arrive = (chip: SegmentChip | null, odometer: Odometer | null) =>
  ({ order: 'PLANNED', claimed_at: null, chip, odometer, unplanned_kind: null, new_place: false });
const loadedP = (ttn_count: number) => ({ ttn_count, pages: [], no_doc_reason: null, deferred: null });
const unloadedP = (drop_index: number, deferred: Deferred | null = null) =>
  ({ drop_index, pages: [], deferred, no_doc_reason: null });
const acceptPrinted = (doc_index: number) => ({ action: 'ACCEPT_PRINTED', doc_index });
const setField = (doc_index: number, field: string, value: string) => ({ action: 'SET_FIELD', doc_index, field, value });
const acceptStop = () => ({ action: 'ACCEPT_STOP' });

/** committed = the device commit; in a replay it equals the declared moment, so every «(запис)» departure and every
 *  key-point time reads the scripted minute (06:10, 07:44, 08:40 …). A live flow commits later and says so itself. */
function tpl(device: string, type: RecordType, hm: string, committedHm: string, plan_key: string | null,
  payload: TemplatePayload, pages: PageTemplate[] = [], place_code: string | null = null): RecordTemplate {
  return { device, type, occurred_at: demo(hm), committed_at: demo(committedHm), plan_key, place_code, payload, pages };
}
function drv(id: string, beat: number | null, mode: 'LIVE' | 'AUTO', records: RecordTemplate[]): ScriptEntry {
  const first = records[0]!;
  return { id, beat, at: first.occurred_at, mode, actor: { id: first.device, role: 'driver' },
    step: { kind: 'record', records },
    match: mode === 'LIVE' ? { actor_id: first.device, op: 'submitRecord', record_type: first.type, plan_key: first.plan_key } : null };
}
function ofc(id: string, beat: number | null, hm: string, mode: 'LIVE' | 'AUTO', op: string, target: TargetRef,
  bodies: Record<string, unknown>[], pageOf?: { script: string; page_no: number }): ScriptEntry {
  return { id, beat, at: demo(hm), mode, actor: NATALIA, step: { kind: 'op', op, target, bodies, ...(pageOf ? { pageOf } : {}) },
    match: mode === 'LIVE' ? { actor_id: NATALIA.id, op } : null };
}

const b = (n: number, title: string, hm: string, phone: string, route: ConsoleRoute, scope: Scope,
  counts: Beat['counts'], cue: string): Beat => ({ n, title, clock: demo(hm), phone, route, scope, counts, cue });
const path = (p: string): ConsoleRoute => ({ kind: 'path', path: p });

/* ── the beats (§5.6): counts are Зараз · Перевірка · Дні на підтвердження · Оригінали · В BAS at the beat's start ── */

export const BEATS: readonly Beat[] = [
  b(0, "Такт 0 · Результат: подорожній лист п'ятниці", '05:14', PAVLO, { kind: 'truck-day', plate: 'АР 1234 ВС', date: '2026-09-18' }, 'PILOT', [0, 0, 0, 1, 0], "Такт 0 · офіс · подорожній лист п'ятниці"),
  b(1, 'Такт 1 · Новий водій за один дотик', '05:15', HRYHORII, { kind: 'driver-card', tab_no: '0457' }, 'PILOT', [0, 0, 0, 1, 0], 'Такт 1 · офіс · «Водії» → «Підключити телефон»'),
  b(2, 'Такт 2 · Початок зміни на Регісі', '05:20', PAVLO, path('/'), 'PILOT', [0, 0, 0, 1, 0], 'Такт 2 · телефон Павла · «Почати зміну»'),
  b(3, 'Такт 3 · Черга, якої немає на папері', '06:10', PAVLO, path('/'), 'PILOT', [0, 0, 0, 1, 0], 'Такт 3 · телефон Павла · «Я на місці»'),
  b(4, 'Такт 4 · Одне завантаження — дві ферми', '08:40', PAVLO, path('/'), 'PILOT', [0, 0, 0, 1, 0], 'Такт 4 · телефон Павла · «Завантажено — фото ТТН»'),
  b(5, 'Такт 5 · Підтвердити, а не набирати', '08:42', PAVLO, path('/inbox/review'), 'PILOT', [0, 1, 0, 1, 0], 'Такт 5 · офіс · «Перевірка» → «Перевірити»'),
  b(6, 'Такт 6 · Машина з Ruptela і звіт по точках', '08:52', OLEH, path('/key-points'), 'PILOT', [0, 1, 0, 1, 0], 'Такт 6 · телефон Олега · «Завантажено — фото ТТН»'),
  b(7, "Такт 7 · Заправка без зв'язку", '08:57', PAVLO, path('/'), 'PILOT', [0, 2, 0, 1, 0], 'Такт 7 · «Офлайн» → телефон Павла · «Заправка»'),
  b(8, 'Такт 8 · Ферма, тривога, машина в русі', '11:50', PAVLO, path('/'), 'PILOT', [0, 0, 0, 1, 0], 'Такт 8 · телефон Павла · «Вивантажено — фото ТТН з підписом»'),
  b(9, 'Такт 9 · День водія', '16:02', PAVLO, path('/'), 'PILOT', [0, 1, 0, 1, 1], 'Такт 9 · телефон Павла · «Закінчити зміну»'),
  b(10, 'Такт 10 · Подорожній лист складається сам', '16:05', PAVLO, path('/inbox/review'), 'FLEET', [3, 11, 7, 4, 57], 'Такт 10 · офіс · «Весь парк · 100 (приклад)»'),
  b(11, 'Такт 11 · Файл у BAS', '16:07', PAVLO, path('/bas'), 'FLEET', [3, 10, 6, 4, 58], 'Такт 11 · офіс · «В BAS» → «Завантажити файл»'),
  b(12, 'Такт 12 · Кожна машина — окремий бізнес', '16:08', PAVLO, path('/trucks'), 'FLEET', [3, 10, 6, 4, 0], 'Такт 12 · офіс · «Машини»'),
  b(13, 'Вихід · Пілот', '16:09', PAVLO, path('/pilot'), 'FLEET', [3, 10, 6, 4, 0], 'Вихід · офіс · «Пілот»'),
];

/* ── the script (§5.7), in `at` order ── */

export const SCRIPT: readonly ScriptEntry[] = [
  ofc('S-01', 1, '05:15', 'LIVE', 'createBindCode', { driverTab: '0457' }, [{}]),
  { id: 'S-02', beat: 1, at: demo('05:15:30'), mode: 'LIVE', actor: { id: HRYHORII, role: 'driver' },
    step: { kind: 'op', op: 'confirmBinding', target: { bindCodeOf: 'S-01' }, bodies: [{}] },
    match: { actor_id: HRYHORII, op: 'confirmBinding' } },
  drv('S-03', 2, 'LIVE', [tpl(PAVLO, 'SHIFT_START', '05:20', '05:20', null, { truck_plate: 'АР 1234 ВС', trailer_plate: 'АР 7781 ХР', plan_match: true, odometer: odo(412355, 'LAST_AT_BASE'), inline: null }, [cluster(412355, '05:20')])]),
  drv('S-04', 2, 'AUTO', [tpl(HRYHORII, 'SHIFT_START', '05:26', '05:26', null, { truck_plate: 'АР 7390 ЕВ', trailer_plate: 'АР 1146 ХР', plan_match: true, odometer: odo(356118, 'MECHANIC'), inline: null }, [cluster(356118, '05:26')])]),
  drv('S-05', 3, 'AUTO', [tpl(HRYHORII, 'ARRIVED', '06:05', '06:05', '3314-1', arrive('QUEUE', odo(356154, 'PLANNED_KM')), [cluster(356154, '06:05')])]),
  drv('S-06', 3, 'LIVE', [tpl(PAVLO, 'ARRIVED', '06:10', '06:10', '3312-1', arrive('QUEUE', odo(412391, 'PLANNED_KM')), [cluster(412391, '06:10')])]),
  drv('S-07', 3, 'AUTO', [tpl(OLEH, 'SHIFT_START', '07:23', '07:23', null, { truck_plate: 'АР 9012 МК', trailer_plate: 'АР 4410 ХТ', plan_match: true, odometer: can(241476), inline: 'CARD' })]),
  drv('S-08', 3, 'AUTO', [tpl(HRYHORII, 'LOADED', '07:44', '07:44', '3314-1', loadedP(1), ttnPages(['004655'], '07:43'))]),
  ofc('S-09', 3, '08:00', 'AUTO', 'reviewStop', { stop: '3314-1' }, [acceptPrinted(1), setField(1, 'arrival', '0712'), setField(1, 'departure', '0744'), acceptStop()]),
  drv('S-10', 4, 'LIVE', [tpl(PAVLO, 'LOADED', '08:40', '08:40', '3312-1', loadedP(2), [
    pg('TTN_FRONT', 1, 1, 'ttn-004517-front', '08:37'), pg('TTN_BACK', 1, 2, 'ttn-004517-back', '08:38'),
    pg('TTN_FRONT', 2, 1, 'ttn-004518-front', '08:39'), pg('TTN_BACK', 2, 2, 'ttn-004518-back:soft', '08:39')])]),
  ofc('S-11', 5, '08:43', 'LIVE', 'reviewStop', { stop: '3312-1' }, [acceptPrinted(1), setField(1, 'arrival', '0748')]),
  ofc('S-12', 5, '08:43', 'LIVE', 'createRequest', { record: { script: 'S-10' } }, [{ type: 'RETAKE_PHOTO', reasons: ['BLUR'] }], { script: 'S-10', page_no: 4 }),
  drv('S-13', 5, 'LIVE', [tpl(PAVLO, 'REQUEST_SEEN', '08:43', '08:43', null, { request_of: 'S-12' })]),
  drv('S-14', 5, 'LIVE', [tpl(PAVLO, 'PHOTO_REPLACE', '08:44', '08:44', '3312-1', { request_of: 'S-12', supersedes_of: { script: 'S-10', page_no: 4 } }, [pg('TTN_BACK', 2, 2, 'ttn-004518-back', '08:44')])]),
  drv('S-15', 6, 'LIVE', [tpl(OLEH, 'LOADED', '08:52', '08:52', '3313-1', loadedP(1), ttnPages(['004533'], '08:50'))]),
  drv('S-16', 7, 'LIVE', [tpl(PAVLO, 'REFUEL', '08:57', '08:57', null, { station: 'ОККО Н-08', receipt_no: '58213', rro_no: '3000211458', sum_uah: '22800.00', card_mask: '****4417', full_tank: true, odometer: odo(412398, 'PLANNED_KM'), deferred: false }, [pg('RECEIPT', 1, 1, 'receipt-okko-58213', '08:57'), cluster(412398, '08:58')], 'OKKO')]),
  drv('S-17', 8, 'AUTO', [tpl(HRYHORII, 'ARRIVED', '09:05', '09:05', '3314-2', arrive('QUEUE', odo(356206, 'PLANNED_KM')), [cluster(356206, '09:05')])]),
  ofc('S-18', 8, '09:15', 'AUTO', 'reviewStop', { stop: '3313-1' }, [acceptPrinted(1), setField(1, 'arrival', '0821'), setField(1, 'departure', '0850'), acceptStop()]),
  drv('S-19', 8, 'AUTO', [tpl(PAVLO, 'ARRIVED', '10:05', '10:05', '3312-2', arrive('QUEUE', odo(412450, 'PLANNED_KM')), [cluster(412450, '10:05')])]),
  ofc('S-20', 8, '10:09', 'AUTO', 'reviewStop', { stop: '3312-1' }, [acceptPrinted(2), setField(2, 'arrival', '0748'), setField(1, 'departure', '0840'), setField(2, 'departure', '0840'), acceptStop()]),
  drv('S-21', 8, 'AUTO', [tpl(HRYHORII, 'UNLOADED', '10:20', '10:20', '3314-2', unloadedP(1), [pg('TTN_SIGNED', 1, 1, 'ttn-004655-signed', '10:20')])]),
  ofc('S-22', 8, '10:40', 'AUTO', 'reviewStop', { stop: '3314-2' }, [setField(1, 'arrival', '0915'), acceptStop()]),
  drv('S-23', 8, 'AUTO', [tpl(HRYHORII, 'ARRIVED', '11:05', '11:05', '3317-1', arrive('QUEUE', odo(356258, 'PLANNED_KM')), [cluster(356258, '11:05')])]),
  drv('S-24', 8, 'AUTO', [tpl(OLEH, 'UNLOADED', '11:08', '11:08', '3313-2', unloadedP(1), [pg('TTN_SIGNED', 1, 1, 'ttn-004533-signed', '11:07')])]),
  ofc('S-25', 8, '11:30', 'AUTO', 'reviewStop', { stop: '3313-2' }, [setField(1, 'arrival', '1038'), acceptStop()]),
  drv('S-26', 8, 'LIVE', [tpl(PAVLO, 'UNLOADED', '11:50', '11:50', '3312-2', unloadedP(1), [pg('TTN_SIGNED', 1, 1, 'ttn-004517-signed', '11:50')])]),
  drv('S-27', 8, 'AUTO', [tpl(OLEH, 'REFUEL', '12:01', '12:01', null, { station: 'WOG Синельникове', receipt_no: '30744', rro_no: null, sum_uah: '18240.00', card_mask: '****6032', full_tank: true, odometer: can(241657), deferred: false }, [pg('RECEIPT', 1, 1, 'receipt-wog-30744', '12:01')], 'WOG')]),
  ofc('S-28', 8, '12:10', 'AUTO', 'reviewStop', { stop: '3312-2' }, [setField(1, 'arrival', '1030'), acceptStop()]),
  drv('S-29', 8, 'AUTO', [tpl(OLEH, 'ROAD_STOP', '12:25', '12:25', null, { reason: 'CHECKPOINT', can_drive: null })]),
  drv('S-30', 8, 'LIVE', [tpl(PAVLO, 'ROAD_STOP', '12:30', '12:30', null, { reason: 'ALERT', can_drive: null })]),
  drv('S-31', 8, 'AUTO', [tpl(HRYHORII, 'LOADED', '12:40', '12:40', '3317-1', loadedP(1), ttnPages(['004671'], '12:39'))]),
  drv('S-32', 8, 'LIVE', [tpl(PAVLO, 'ROAD_STOP_END', '12:48', '12:48', null, { road_stop_of: 'S-30', at: demo('12:48'), closed_by: 'DRIVER' })]),
  ofc('S-33', 9, '13:00', 'AUTO', 'reviewStop', { stop: '3317-1' }, [acceptPrinted(1), acceptStop()]),
  drv('S-34', 9, 'AUTO', [tpl(PAVLO, 'ARRIVED', '13:45', '13:45', '3312-3', arrive('QUEUE', null))]),
  drv('S-35', 9, 'AUTO', [tpl(HRYHORII, 'ARRIVED', '14:20', '14:20', '3317-2', arrive('QUEUE', odo(356356, 'PLANNED_KM')), [cluster(356356, '14:20')])]),
  drv('S-36', 9, 'AUTO', [
    tpl(OLEH, 'SHIFT_END', '15:06', '15:06', null, { odometer: can(241756), place_code: 'BASE' }),
    tpl(OLEH, 'DRIVER_ATTESTED', '15:06', '15:06', null, { shift_id: 'CURRENT', km: 280, documents: 4 })]),
  drv('S-37', 9, 'AUTO', [tpl(PAVLO, 'UNLOADED', '15:08', '15:08', '3312-3', unloadedP(2, 'AFTER_EXIT'))]),
  drv('S-38', 9, 'AUTO', [tpl(HRYHORII, 'UNLOADED', '15:10', '15:10', '3317-2', unloadedP(1), [pg('TTN_SIGNED', 1, 1, 'ttn-004671-signed', '15:10')])]),
  drv('S-39', 9, 'AUTO', [tpl(PAVLO, 'DOCS_ADDED', '15:17', '15:17', '3312-3',
    { odometer: { value: 412566, source: 'PLAN_CONFIRMED', basis: 'PLANNED_KM', expected: 412566, read: 412866, choice: 'DIGIT_EXPECTED', page_key: null }, deferred: 'AFTER_EXIT' },
    [pg('TTN_SIGNED', 1, 1, 'ttn-004518-signed', '15:16', { deferred: 'AFTER_EXIT' }), cluster(412566, '15:16', { sim_read: '412866', deferred: 'AFTER_EXIT' })])]),
  ofc('S-40', 9, '15:25', 'AUTO', 'reviewStop', { stop: '3312-3' }, [setField(1, 'arrival', '1407'), acceptStop()]),
  ofc('S-41', 9, '15:30', 'AUTO', 'reviewStop', { stop: '3317-2' }, [acceptStop()]),
  ofc('S-42', 9, '15:40', 'AUTO', 'confirmTruckDay', { truckDay: { plate: 'АР 9012 МК', date: '2026-09-21' } }, [{ version: 'CURRENT' }]),
  drv('S-44', 9, 'LIVE', [tpl(PAVLO, 'SHIFT_END', '16:02', '16:02', null, { odometer: odo(412589, 'PLANNED_KM'), place_code: 'BASE' }, [cluster(412589, '16:02')])]),
  drv('S-45', 9, 'LIVE', [tpl(PAVLO, 'DRIVER_ATTESTED', '16:03', '16:03', null, { shift_id: 'CURRENT', km: 234, documents: 5 })]),
  ofc('S-46', 10, '16:05', 'LIVE', 'createCorrection', { seedRecord: { device: YAROSHENKO_DEVICE, type: 'SHIFT_START' } }, [{ field: 'odometer', value: '381405', reason: 'TYPO' }]),
  ofc('S-47', 10, '16:06', 'LIVE', 'confirmTruckDay', { truckDay: { plate: 'АР 1234 ВС', date: '2026-09-21' } }, [{ version: 'CURRENT' }]),
  ofc('S-48', 10, '16:06', 'LIVE', 'printTruckDay', { truckDay: { plate: 'АР 1234 ВС', date: '2026-09-21' } }, [{}]),
  ofc('S-49', 11, '16:07', 'LIVE', 'createExport', { none: true }, [{ date: '2026-09-21', scope: 'FLEET', sheet: 'WAYBILLS', format: 'CSV' }]),
  ofc('S-50', 11, '16:07', 'LIVE', 'importExport', { lastExport: true }, [{}]),
  drv('S-51', null, 'AUTO', [
    tpl(HRYHORII, 'SHIFT_END', '16:30', '16:30', null, { odometer: odo(356474, 'PLANNED_KM'), place_code: 'BASE' }, [cluster(356474, '16:30')]),
    tpl(HRYHORII, 'DRIVER_ATTESTED', '16:31', '16:31', null, { shift_id: 'CURRENT', km: 356, documents: 6 })]),
];

/* ── the ten rewind checkpoints (§5.4 #5) ── */

export const CHECKPOINTS: readonly { at: Instant; label: string }[] = [
  ['06:10', 'біля воріт'], ['07:48', 'відмітка відправника'], ['08:40', 'ТТН видали'], ['08:52', 'Олег завантажився'],
  ['08:57', 'заправка'], ['11:50', 'Злагода'], ['12:30', 'тривога'], ['12:48', 'кінець тривоги'], ['16:02', 'база'],
  ['16:05', 'офіс, кінець дня'],
].map(([hm, label]) => ({ at: demo(hm!), label: label! }));
