// mocks/driver-report/src/api/drift.controls.ts
/** THE PROOF THAT THIS CONTRACT BITES. Every @ts-expect-error below must stay an error; imported by nothing, compiled
 *  by the mock’s own `tsc -b`. The directive applies to the NEXT line and an object-literal error is reported at the
 *  offending PROPERTY, so those directives sit inside the literal. */
import type { CodeOf, Equal, Expect, Leaks, Paginated, ParamsOf, ReqOf, ResOf, Transport } from '@agency/mock';
import { call, fail, type Api } from './contract';
import type { DriverToday, FleetRow, RecordIn, RecordView } from '../domain/dto';
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
