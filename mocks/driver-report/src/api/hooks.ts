// mocks/driver-report/src/api/hooks.ts
/** Every read and write a screen performs. Keys come from makeQueries; nothing here writes a query key by hand. */
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import type { BindCodeView, BindPreview, Binding, ConfirmTruckDayIn, CorrectionView, CreateCorrectionIn, CreateExportIn,
  CreateRequestIn, DriverRow, DriverToday, ExceptionItem, ExportFile, ExportPreview, FleetRow, ImportResult, KeyPointRow,
  MyDay, MyMonth, OfficeSummary, OriginalsRow, Paginated, PlaceOption, RequestView, ReviewStopIn, StopReview, TruckDayRow,
  TruckDayView, TruckFuel, TruckMonthRow, UpdateExceptionIn, WorktimeRow } from '../domain/dto';
import type { Scope } from '../domain/types';
import { queries } from './queries';

const ALL = { page: '1', limit: '100' } as const;
const LIVE_MS = 15_000;   // board ages and timers are words on the server; refresh them while nothing else changes

function useWrite<V, R>(fn: (v: V) => Promise<R>): UseMutationResult<R, unknown, V> {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, retry: false, onSuccess: () => { void qc.invalidateQueries({ type: 'active' }); } });
}

export const useToday = (): UseQueryResult<DriverToday> => useQuery(queries.query('getToday', { params: {}, body: undefined }));
export const useBindPreview = (code: string): UseQueryResult<BindPreview> =>
  useQuery(queries.query('getBindPreview', { params: { code }, body: undefined }));
export function useConfirmBinding(code: string): UseMutationResult<Binding, unknown, void> {
  const m = queries.mutation('confirmBinding');
  return useWrite(() => m.mutationFn({ params: { code }, body: {} }));
}
export const useNearbyPlaces = (stopId: string | null): UseQueryResult<Paginated<PlaceOption>> =>
  useQuery(queries.query('listNearbyPlaces', { params: {}, body: undefined, qry: stopId ? { stop_id: stopId, ...ALL } : ALL }));
export const useMyDay = (date: string): UseQueryResult<MyDay> => useQuery(queries.query('getMyDay', { params: { date }, body: undefined }));
export const useMyMonth = (month: string): UseQueryResult<MyMonth> => useQuery(queries.query('getMyMonth', { params: { month }, body: undefined }));

export const useOfficeSummary = (scope: Scope): UseQueryResult<OfficeSummary> =>
  useQuery({ ...queries.query('getOfficeSummary', { params: {}, body: undefined, qry: { scope } }), refetchInterval: LIVE_MS });
export const useFleet = (scope: Scope, filter: 'ALL' | 'NEEDS_ACTION'): UseQueryResult<Paginated<FleetRow>> =>
  useQuery({ ...queries.query('listFleet', { params: {}, body: undefined, qry: { scope, filter, ...ALL } }), refetchInterval: LIVE_MS });
export const useExceptions = (lane: 'NOW' | 'REVIEW', scope: Scope): UseQueryResult<Paginated<ExceptionItem>> =>
  useQuery({ ...queries.query('listExceptions', { params: {}, body: undefined, qry: { lane, scope, ...ALL } }), refetchInterval: LIVE_MS });
export function useUpdateException(): UseMutationResult<ExceptionItem, unknown, { id: string; body: UpdateExceptionIn }> {
  const m = queries.mutation('updateException');
  return useWrite(({ id, body }) => m.mutationFn({ params: { id }, body }));
}
export const useStopReview = (stopId: string): UseQueryResult<StopReview> =>
  useQuery(queries.query('getStopReview', { params: { id: stopId }, body: undefined }));
export function useReviewStop(stopId: string): UseMutationResult<StopReview, unknown, ReviewStopIn> {
  const m = queries.mutation('reviewStop');
  return useWrite((body) => m.mutationFn({ params: { id: stopId }, body }));
}
export function useCreateRequest(): UseMutationResult<RequestView, unknown, CreateRequestIn> {
  const m = queries.mutation('createRequest');
  return useWrite((body) => m.mutationFn({ params: {}, body }));
}
export function useCreateCorrection(): UseMutationResult<CorrectionView, unknown, CreateCorrectionIn> {
  const m = queries.mutation('createCorrection');
  return useWrite((body) => m.mutationFn({ params: {}, body }));
}
export const useTruckDays = (state: 'to-confirm' | 'confirmed' | 'exported', scope: Scope, date?: string): UseQueryResult<Paginated<TruckDayRow>> =>
  useQuery(queries.query('listTruckDays', { params: {}, body: undefined, qry: { state, scope, ...(date ? { date } : {}), ...ALL } }));
export const useTruckDay = (id: string): UseQueryResult<TruckDayView> =>
  useQuery(queries.query('getTruckDay', { params: { id }, body: undefined }));
export function useConfirmTruckDay(id: string): UseMutationResult<TruckDayView, unknown, ConfirmTruckDayIn> {
  const m = queries.mutation('confirmTruckDay');
  return useWrite((body) => m.mutationFn({ params: { id }, body }));
}
export function usePrintTruckDay(id: string): UseMutationResult<TruckDayView, unknown, void> {
  const m = queries.mutation('printTruckDay');
  return useWrite(() => m.mutationFn({ params: { id }, body: {} }));
}
export const useKeyPoints = (date: string, scope: Scope, truckId?: string): UseQueryResult<Paginated<KeyPointRow>> =>
  useQuery(queries.query('getKeyPoints', { params: {}, body: undefined, qry: { date, scope, ...(truckId ? { truck_id: truckId } : {}), ...ALL } }));
export const useExportPreview = (date: string, scope: Scope): UseQueryResult<ExportPreview> =>
  useQuery(queries.query('getExportPreview', { params: {}, body: undefined, qry: { date, scope } }));
export function useCreateExport(): UseMutationResult<ExportFile, unknown, CreateExportIn> {
  const m = queries.mutation('createExport');
  return useWrite((body) => m.mutationFn({ params: {}, body }));
}
export function useImportExport(): UseMutationResult<ImportResult, unknown, { id: string }> {
  const m = queries.mutation('importExport');
  return useWrite(({ id }) => m.mutationFn({ params: { id }, body: {} }));
}
export const useTrucks = (scope: Scope, month: string, sort: 'fuel_dev' | 'plate' | 'km'): UseQueryResult<Paginated<TruckMonthRow>> =>
  useQuery(queries.query('listTrucks', { params: {}, body: undefined, qry: { scope, month, sort, ...ALL } }));
export const useTruckFuel = (truckId: string, month: string): UseQueryResult<TruckFuel> =>
  useQuery(queries.query('getTruckFuel', { params: { id: truckId }, body: undefined, qry: { month } }));
export const useOriginals = (scope: Scope): UseQueryResult<Paginated<OriginalsRow>> =>
  useQuery(queries.query('listOriginals', { params: {}, body: undefined, qry: { scope, ...ALL } }));
export function useReceiveOriginal(): UseMutationResult<OriginalsRow, unknown, { docId: string }> {
  const m = queries.mutation('receiveOriginal');
  return useWrite(({ docId }) => m.mutationFn({ params: { docId }, body: {} }));
}
export const useWorktime = (month: string, scope: Scope): UseQueryResult<Paginated<WorktimeRow>> =>
  useQuery(queries.query('listWorktime', { params: {}, body: undefined, qry: { month, scope, ...ALL } }));
export const useDrivers = (scope: Scope): UseQueryResult<Paginated<DriverRow>> =>
  useQuery(queries.query('listDrivers', { params: {}, body: undefined, qry: { scope, ...ALL } }));
export function useCreateBindCode(): UseMutationResult<BindCodeView, unknown, { driverId: string }> {
  const m = queries.mutation('createBindCode');
  return useWrite(({ driverId }) => m.mutationFn({ params: { id: driverId }, body: {} }));
}
