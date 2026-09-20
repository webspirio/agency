// mocks/driver-report/src/api/drift.controls.ts
/** THE PROOF THAT THIS CONTRACT BITES. Every @ts-expect-error below must stay an error; imported by nothing, compiled
 *  by the mock’s own `tsc -b`. The directive applies to the NEXT line and an object-literal error is reported at the
 *  offending PROPERTY, so those directives sit inside the literal. */
import type { CodeOf, Equal, Expect, HandlersOf, Leaks, Paginated, ParamsOf, ReqOf, ResOf, Route,
  Transport } from '@agency/mock';
import { call, fail, toRoutes, type Api } from './contract';
import { httpClient } from './client';
import { makeHandlers } from './routes';
import type { DriverToday, FleetRow, MyDay, RecordIn, RecordView, StopReview } from '../domain/dto';
import type { RecordPayload } from '../domain/types';

export type ParamsComeFromThePath = Expect<Equal<ParamsOf<Api['getStopReview']['path']>, { id: string }>>;
export type CodesAreClosed = Expect<Equal<CodeOf<Api, 'reviewStop'>, 'STOP_NOT_FOUND' | 'DAY_CONFIRMED' | 'VALUE_INVALID'>>;
export type NoCodesMeansNever = Expect<Equal<CodeOf<Api, 'getToday'>, never>>;
export type TheDriverMeetsTwoCodes = Expect<Equal<CodeOf<Api, 'getBindPreview' | 'confirmBinding' | 'getToday' | 'listNearbyPlaces'
  | 'submitRecord' | 'uploadPhoto' | 'sendHeartbeat' | 'getMyDay' | 'getMyMonth'>, 'BIND_CODE_EXPIRED' | 'DEVICE_REVOKED'>>;
export type BodyIsTyped = Expect<Equal<ReqOf<Api, 'submitRecord'>, RecordIn>>;
export type ListIsAnEnvelope = Expect<Equal<ResOf<Api, 'listFleet'>, Paginated<FleetRow>>>;
export type TodaySendsNothing = Expect<Equal<ReqOf<Api, 'getToday'>, void>>;
export type TodayIsRawFacts = Expect<Equal<ResOf<Api, 'getToday'>, DriverToday>>;
/** The sink can read every response this contract declares: a handler returning EXACTLY its declared type is no leak.
 *  `DeepExact` keys a nested union by the keys its constituents SHARE, so a union of disjoint objects reads as a leak
 *  against itself — measured 2026-09-19 on `DriverToday.records[].payload`, which made `routes` red with nothing wide
 *  about getToday. A declared type the sink cannot verify is fixed in dto.ts, never by loosening the sink (plan, risk 4). */
export type EveryDeclaredResponseIsLeakFree = Expect<Equal<Leaks<Api, { [K in keyof Api]: () => ResOf<Api, K> }>, never>>;
/** The wire payload is wider than the union it replaced, never narrower: every payload a record carries is one. */
export type EveryPayloadIsAWirePayload = Expect<Equal<[RecordPayload] extends [RecordView['payload']] ? true : false, true>>;
/** …and it did not blind the sink: a key no payload declares, carried inside `records[].payload`, is still a leak. */
type WidePayloadRow = Omit<RecordView, 'payload'> & { payload: RecordView['payload'] & { device_secret: string } };
export type AForeignPayloadKeyStillLeaks = Expect<Equal<
  Leaks<Api, { getToday: () => Omit<DriverToday, 'records'> & { records: WidePayloadRow[] } }>, 'getToday'>>;

export function callRefusals(http: Transport): void {
  // @ts-expect-error the path declares ':id'; 'stopId' is not a param of it.
  void call(http, 'getStopReview', { params: { stopId: 'x' }, body: undefined });
  // @ts-expect-error a declared param may not be omitted.
  void call(http, 'getStopReview', { params: {}, body: undefined });
  void call(http, 'updateException', {
    params: { id: 'x' },
    body: {
      action: 'TAKE',
      // @ts-expect-error updateException’s body has no 'title'.
      title: 'x',
    },
  });
  void call(http, 'listFleet', {
    params: {},
    body: undefined,
    qry: {
      scope: 'PILOT',
      // @ts-expect-error listFleet’s query is closed: 'sort' is not declared.
      sort: 'plate',
    },
  });
  void call(http, 'listFleet', {
    params: {},
    body: undefined,
    qry: {
      scope: 'PILOT',
      // @ts-expect-error a query value is a wire string, never a number.
      limit: 100,
    },
  });
  // @ts-expect-error there is no such operation in the contract.
  void call(http, '__no_such_operation__', { params: {}, body: undefined });
}

export function codeRefusals(): void {
  // @ts-expect-error DAY_CHANGED belongs to confirmTruckDay, not reviewStop.
  fail('reviewStop', 'DAY_CHANGED', 'no');
  // @ts-expect-error getToday declares no codes.
  fail('getToday', 'ANYTHING', 'no');
  // @ts-expect-error a driver write is never refused for content: ODOMETER_INVALID is not declared.
  fail('submitRecord', 'ODOMETER_INVALID', 'no');
}

export const missingSentence = {
  STOP_NOT_FOUND: 'Цю зупинку не знайдено.',
  DAY_CONFIRMED: 'День уже підтверджено.',
  // @ts-expect-error reviewStop also declares VALUE_INVALID, which has no sentence here.
} satisfies Record<CodeOf<Api, 'reviewStop'>, string>;

export const strangeSentence = {
  TRUCK_DAY_NOT_FOUND: 'Такого дня немає.',
  // @ts-expect-error getTruckDay declares only TRUCK_DAY_NOT_FOUND.
  DAY_ON_FIRE: 'oh no',
} satisfies Record<CodeOf<Api, 'getTruckDay'>, string>;

/** ParamsOf erases non-param segments: a path rename is invisible to types. call() takes a KEY, so no copy drifts. */
export type SegmentRenameIsInvisibleToTypes = Expect<Equal<ParamsOf<'/office/stops/:id'>, ParamsOf<'/office/stop/:id'>>>;

/* ── the HANDLER-level controls (W3-01) ──────────────────────────────────────────────────────────────────────── *
 *
 * Everything above is about the call SITE. These four are about the SINK — `toRoutes` in routes.ts, the one line
 * nobody edits — and the two RESIDUALS it does not close. Each residual is written down here as a live type that
 * compiles CLEAN, so nobody has to rediscover it by reading the diagnostics: the wire golden
 * (`wire.golden.test.ts`) is the ground truth for both, and its own limit is that it drives each operation once,
 * with one actor, so it fingerprints whichever branch that actor takes. */

// @ts-expect-error this handler returns only part of a StopReview.
export const handlerReturnsTooLittle: HandlersOf<Api>['getStopReview'] = () => ({ stop: { id: 'x', kind: 'LOADING', title: '', line: '' } });

/** The stored row the office keeps: everything the wire declares, plus a column the driver must never receive. */
type StoredReview = StopReview & { internal_note: string };
declare const wideRow: StoredReview;
declare const narrowRow: StopReview;

/** THE SINK BITES. A handler returning MORE than its operation declares is a compile error at `toRoutes`, and the
 *  diagnostic names the operation. It is DEEP and it survives `async`. */
export function sinkRefusesALeak(): void {
  // @ts-expect-error the row carries internal_note, which getStopReview does not declare.
  const table: Route[] = toRoutes({ ...makeHandlers(), getStopReview: () => wideRow });
  void table;
}
/** A branch subtype-reduces to the declared row: green by design; the wire golden is the ground truth. */
export const subtypeReducedBranchIsGreen: Route[] = toRoutes({
  ...makeHandlers(),
  getStopReview: (c) => (c.actor.role === 'operator' ? wideRow : narrowRow),
});
/** An annotated widening is green under every scheme here; the golden catches the extra key on the wire. */
export const annotatedWideningIsGreen: HandlersOf<Api>['getStopReview'] = () => {
  const out: StopReview = wideRow;
  return out;
};
/** The seam is a TYPE, not a lint rule: `httpClient` is an opaque `Transport` that only `call()` unwraps, so a raw
 *  verb is TS2339 in every file this mock compiles — hooks and components included, which no single-file AST walk
 *  reaches. Measured in the lab: 13 of 19 spellings evaded the regex that used to guard this. */
export function transportIsOpaque(): void {
  // @ts-expect-error a raw verb on the transport is not a member of it.
  void httpClient.get('/driver/today');
  // @ts-expect-error the instance itself is not callable either.
  void httpClient({ url: '/driver/today' });
  // @ts-expect-error a verb no list ever named is refused by the same mechanism.
  void httpClient.postForm('/driver/records', {});
}
/** §8.6 #24: an office note can never reach the driver — neither driver response declares one. */
export type DriverTodayHasNoNote = Expect<Equal<'note' extends keyof DriverToday ? true : false, false>>;
export type MyDayHasNoNote = Expect<Equal<'note' extends keyof MyDay ? true : false, false>>;
