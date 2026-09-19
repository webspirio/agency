// mocks/driver-report/src/api/contract.ts
/** THE CONTRACT of «Звіт водія»: 32 P0 operations (§7.4). Declaration order is route order. NOT @scaffold-owned. */
import { makeContract, op, s, shape, type AllResJsonSafe, type BodiesOf, type Contract, type Expect, type Paginated,
  type PathsAreLiterals } from '@agency/mock';
import type { Ack, BindCodeView, BindPreview, Binding, ConfirmTruckDayIn, CorrectionView, CreateCorrectionIn,
  CreateExportIn, CreateRequestIn, DriverRow, DriverToday, ExceptionItem, ExportFile, ExportPreview, FleetRow,
  HeartbeatAck, HeartbeatIn, ImportResult, KeyPointRow, MyDay, MyMonth, OfficeSummary, OriginalsRow, PageIn,
  PhotoAck, PlaceOption, RecordIn, RequestView, ReviewStopIn, StopReview, TruckDayRow, TruckDayView, TruckFuel,
  TruckMonthRow, UpdateExceptionIn, WorktimeRow } from '../domain/dto';
import { ARTEFACT_KINDS, CORRECTION_REASONS, RECORD_TYPES, REQUEST_TYPES, TTN_FIELDS, type Scope } from '../domain/types';
import { int, obj, oneOf, strs } from './shapes';

type Empty = Record<string, never>;
type Paging = { page?: string; limit?: string };
const D = ['driver'] as const;
const O = ['dispatcher'] as const;

export const api = {
  getBindPreview: op<void, BindPreview>()({ method: 'GET', path: '/bind/:code', status: 200, caps: D, codes: {} }),
  confirmBinding: op<Empty, Binding>()({ method: 'POST', path: '/bind/:code', status: 201, caps: D, codes: { BIND_CODE_EXPIRED: 410 } }),
  getToday: op<void, DriverToday>()({ method: 'GET', path: '/driver/today', status: 200, caps: D, codes: {} }),
  listNearbyPlaces: op<void, Paginated<PlaceOption>, { stop_id?: string } & Paging>()({ method: 'GET', path: '/driver/places', status: 200, caps: D, codes: {} }),
  submitRecord: op<RecordIn, Ack>()({ method: 'POST', path: '/driver/records', status: 201, caps: D, codes: { DEVICE_REVOKED: 403 } }),
  uploadPhoto: op<PageIn, PhotoAck>()({ method: 'POST', path: '/driver/photos', status: 201, caps: D, codes: { DEVICE_REVOKED: 403 } }),
  sendHeartbeat: op<HeartbeatIn, HeartbeatAck>()({ method: 'POST', path: '/driver/heartbeat', status: 200, caps: D, codes: {} }),
  getMyDay: op<void, MyDay>()({ method: 'GET', path: '/driver/days/:date', status: 200, caps: D, codes: {} }),
  getMyMonth: op<void, MyMonth>()({ method: 'GET', path: '/driver/months/:month', status: 200, caps: D, codes: {} }),
  getOfficeSummary: op<void, OfficeSummary, { scope: Scope }>()({ method: 'GET', path: '/office/summary', status: 200, caps: O, codes: {} }),
  listFleet: op<void, Paginated<FleetRow>, { scope: Scope; filter?: 'ALL' | 'NEEDS_ACTION' } & Paging>()({ method: 'GET', path: '/office/fleet', status: 200, caps: O, codes: {} }),
  listExceptions: op<void, Paginated<ExceptionItem>, { lane: 'NOW' | 'REVIEW'; scope: Scope } & Paging>()({ method: 'GET', path: '/office/exceptions', status: 200, caps: O, codes: {} }),
  updateException: op<UpdateExceptionIn, ExceptionItem>()({ method: 'PATCH', path: '/office/exceptions/:id', status: 200, caps: O, codes: { EXCEPTION_NOT_FOUND: 404 } }),
  getStopReview: op<void, StopReview>()({ method: 'GET', path: '/office/stops/:id', status: 200, caps: O, codes: { STOP_NOT_FOUND: 404 } }),
  reviewStop: op<ReviewStopIn, StopReview>()({ method: 'PATCH', path: '/office/stops/:id', status: 200, caps: O, codes: { STOP_NOT_FOUND: 404, DAY_CONFIRMED: 409, VALUE_INVALID: 400 } }),
  createRequest: op<CreateRequestIn, RequestView>()({ method: 'POST', path: '/office/requests', status: 201, caps: O, codes: { REQUEST_ALREADY_OPEN: 409, TARGET_NOT_FOUND: 404 } }),
  createCorrection: op<CreateCorrectionIn, CorrectionView>()({ method: 'POST', path: '/office/corrections', status: 201, caps: O, codes: { TARGET_NOT_FOUND: 404, DAY_CONFIRMED: 409, VALUE_INVALID: 400 } }),
  listTruckDays: op<void, Paginated<TruckDayRow>, { state: 'to-confirm' | 'confirmed' | 'exported'; date?: string; scope: Scope } & Paging>()({ method: 'GET', path: '/office/truck-days', status: 200, caps: O, codes: {} }),
  getTruckDay: op<void, TruckDayView>()({ method: 'GET', path: '/office/truck-days/:id', status: 200, caps: O, codes: { TRUCK_DAY_NOT_FOUND: 404 } }),
  confirmTruckDay: op<ConfirmTruckDayIn, TruckDayView>()({ method: 'POST', path: '/office/truck-days/:id/confirm', status: 200, caps: O, codes: { TRUCK_DAY_NOT_FOUND: 404, DAY_CHANGED: 409 } }),
  printTruckDay: op<Empty, TruckDayView>()({ method: 'POST', path: '/office/truck-days/:id/print', status: 200, caps: O, codes: { TRUCK_DAY_NOT_FOUND: 404 } }),
  getKeyPoints: op<void, Paginated<KeyPointRow>, { date: string; scope: Scope; truck_id?: string } & Paging>()({ method: 'GET', path: '/office/key-points', status: 200, caps: O, codes: {} }),
  getExportPreview: op<void, ExportPreview, { date: string; scope: Scope }>()({ method: 'GET', path: '/office/exports/preview', status: 200, caps: O, codes: {} }),
  createExport: op<CreateExportIn, ExportFile>()({ method: 'POST', path: '/office/exports', status: 201, caps: O, codes: {} }),
  importExport: op<Empty, ImportResult>()({ method: 'POST', path: '/office/exports/:id/import', status: 200, caps: O, codes: { EXPORT_NOT_FOUND: 404 } }),
  listTrucks: op<void, Paginated<TruckMonthRow>, { scope: Scope; month: string; sort?: 'fuel_dev' | 'plate' | 'km' } & Paging>()({ method: 'GET', path: '/office/trucks', status: 200, caps: O, codes: {} }),
  getTruckFuel: op<void, TruckFuel, { month: string }>()({ method: 'GET', path: '/office/trucks/:id/fuel', status: 200, caps: O, codes: { TRUCK_NOT_FOUND: 404 } }),
  listOriginals: op<void, Paginated<OriginalsRow>, { scope: Scope } & Paging>()({ method: 'GET', path: '/office/originals', status: 200, caps: O, codes: {} }),
  receiveOriginal: op<Empty, OriginalsRow>()({ method: 'POST', path: '/office/originals/:docId/receive', status: 200, caps: O, codes: { DOCUMENT_NOT_FOUND: 404 } }),
  listWorktime: op<void, Paginated<WorktimeRow>, { month: string; scope: Scope } & Paging>()({ method: 'GET', path: '/office/worktime', status: 200, caps: O, codes: {} }),
  listDrivers: op<void, Paginated<DriverRow>, { scope: Scope } & Paging>()({ method: 'GET', path: '/office/drivers', status: 200, caps: O, codes: {} }),
  createBindCode: op<Empty, BindCodeView>()({ method: 'POST', path: '/office/drivers/:id/bind-codes', status: 201, caps: O, codes: { DRIVER_NOT_FOUND: 404 } }),
};
export type Api = typeof api;
export type OpKey = keyof Api;

/** Every path is still a literal — the only check inside this file that each entry went through op<…>(). */
export const KEEP_LITERAL: PathsAreLiterals<Api> = true;
/** Every declared response survives JSON. */
export type RESPONSES_ARE_WIRE_SHAPED = Expect<AllResJsonSafe<Api>>;

const bodies = {
  confirmBinding: shape({}),
  submitRecord: shape({ key: s.str(), seq: int(), type: oneOf(RECORD_TYPES), occurred_at: s.str(), committed_at: s.str(),
    app_clock_at: s.str(), stop_id: s.opt(s.str()), place_id: s.opt(s.str()), gps: oneOf(['OK', 'DENIED', 'UNRELIABLE']), payload: obj() }),
  uploadPhoto: shape({ key: s.str(), record_key: s.str(), artefact: oneOf(ARTEFACT_KINDS), doc_index: int(), page_no: int(),
    captured_at: s.str(), source: oneOf(['DRAWN', 'INPAGE', 'NATIVE']), bytes: int(), quality: oneOf(['OK', 'LOW']),
    quality_reasons: strs(), deferred: s.opt(oneOf(['AT_PARKING', 'AFTER_EXIT'])), drawn_variant: s.opt(s.str()),
    drawn_value: s.opt(s.str()), drawn_sim_read: s.opt(s.str()), image: s.opt(s.str()) }),
  sendHeartbeat: shape({ unsent: int(), last_capture_at: s.opt(s.str()) }),
  updateException: shape({ action: oneOf(['TAKE', 'RESOLVE', 'ACCEPT_AS_IS']), reason: s.opt(s.str()) }),
  reviewStop: shape({ action: oneOf(['ACCEPT_PRINTED', 'SET_FIELD', 'MARK_BLANK_REVERSE', 'ACCEPT_STOP']),
    doc_index: s.opt(int()), field: s.opt(oneOf(TTN_FIELDS)), value: s.opt(s.str()) }),
  createRequest: shape({ type: oneOf(REQUEST_TYPES), record_key: s.str(), page_key: s.opt(s.str()), reasons: strs() }),
  createCorrection: shape({ record_key: s.str(), field: oneOf(['odometer', 'occurred_at']), value: s.str(),
    reason: oneOf(CORRECTION_REASONS), note: s.opt(s.str()) }),
  confirmTruckDay: shape({ version: int(), reason: s.opt(s.str()) }),
  printTruckDay: shape({}),
  createExport: shape({ date: s.str(), scope: oneOf(['PILOT', 'FLEET']), sheet: oneOf(['WAYBILLS', 'LEGS', 'REFUELS', 'WORKTIME', 'ALL']),
    format: oneOf(['CSV', 'JSON']) }),
  importExport: shape({}),
  receiveOriginal: shape({}),
  createBindCode: shape({}),
} satisfies BodiesOf<Api>;

const contract = makeContract<Api>(api, bodies);
/** Annotated consts, not a destructure: a never-returning `fail` narrows only through an explicit annotation. */
export const call: Contract<Api>['call'] = contract.call;
export const fail: Contract<Api>['fail'] = contract.fail;
export const codeOf: Contract<Api>['codeOf'] = contract.codeOf;
export const toRoutes: Contract<Api>['toRoutes'] = contract.toRoutes;
export { contract };
