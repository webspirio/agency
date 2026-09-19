import type { Paginated } from '@agency/mock';
import type { ArtefactKind, BusinessDate, CorrectionReason, Dec1, Dec3, Decimal2, Deferred, ExceptionCode, Gps,
  Instant, Km, OdometerBasis, OdometerSource, OfficeRole, PageSource, Payloads, PlaceKind, RecordPayload,
  RecordType, RequestType, RetakeReason, Scope, Telematics, TelemetryKind, Tone, TtnField } from './types';
export type { Paginated };

export type SourceKey = 'CAN' | 'PHOTO' | 'PLAN_OK' | 'TYPED' | 'OFFICE' | 'ESTIMATE' | 'FROM_CALL' | 'DRIVER'
  | 'TTN' | 'RUPTELA' | 'TACHO';
export type Badge = 'REGIS' | 'RUPTELA' | 'PAPER';
export type DocDot = 'none' | 'part' | 'full';

/* ── driver ───────────────────────────────────────────────────────── */
export type BindPreview = { status: 'VALID' | 'EXPIRED' | 'USED' | 'UNKNOWN'; driver_name: string | null;
  initials: string | null; truck_plate: string | null; truck_model: string | null };
export type Binding = { device_id: string; driver_id: string; driver_name: string; bound_at: Instant };
export type PlannedStopView = { stop_id: string; plan_key: string; seq: number;
  kind: 'LOADING' | 'DROP' | 'BASE' | 'UNPLANNED'; place_id: string; label: string; short: string; town: string;
  ttn_expected: number; ttn_nos: string[]; drop_index: number | null; drop_count: number | null;
  compartments: string | null; mass_t: Dec3 | null; planned_km: Km | null; no_photos: boolean;
  weigh_ticket: boolean; accepted_at: Instant | null };
export type ShiftView = { id: string; started_at: Instant; ended_at: Instant | null; attested_at: Instant | null;
  truck_plate: string; trailer_plate: string; start_odometer: Km | null; end_odometer: Km | null };
export type RecordView = { key: string; seq: number; type: RecordType; occurred_at: Instant; committed_at: Instant;
  received_at: Instant; stop_id: string | null; place_id: string | null; payload: RecordPayload;
  photos_expected: number; photos_received: number; accepted_at: Instant | null; voided: boolean; late: boolean };
export type AutoEventView = { id: string; kind: TelemetryKind; at: Instant; place_id: string | null;
  place_short: string | null; stop_id: string | null; can_km: Km | null; litres: Decimal2 | null;
  minutes: number | null; simulated: true };
export type OdometerRefView = { value: Km | null; at: Instant | null; source: OdometerSource | null;
  basis: OdometerBasis; place_short: string | null; kind: 'SHIFT_END_AT_BASE' | 'MECHANIC' | 'POINT' | 'CAN' | 'NONE' };
export type RequestCardView = { id: string; type: RequestType; record_key: string; page_key: string | null;
  stop_id: string | null; artefact: ArtefactKind | null; doc_index: number | null; page_no: number | null;
  target_label: string; reasons: RetakeReason[]; reason_line: string; by_short: string; created_at: Instant;
  seen_at: Instant | null; done_at: Instant | null; thumb_variant: string | null };
export type CorrectionView = { id: string; record_key: string; field: 'odometer' | 'occurred_at'; old: string;
  new: string; reason: CorrectionReason; driver_wording: string; by: string; at: Instant; needs_ack: boolean;
  ack: { agree: boolean; at: Instant } | null };
export type PaperReceipt = { label: string; received_at: Instant; by_short: string; date: BusinessDate };
export type OnCallView = { name: string; role_label: string; until: string; phone: string };
export type DaySummaryView = { started_at: Instant; ended_at: Instant | null; on_shift_min: number;
  on_site_min: number; alert_min: number; km: Km | null; docs_in_office: number; docs_total: number; owed: string[] };
export type DriverToday = {
  server_time: Instant;
  device: { id: string; bound: boolean; revoked: boolean };
  driver: { id: string; name: string; short_name: string } | null;
  truck: { id: string; plate: string; model: string; telematics: Telematics; has_can: boolean;
    speed_kmh: number | null; gnss: 'OK' | 'SUSPECT'; can_km: Km | null } | null;
  trailer: { id: string; plate: string; body_label: string; compartments: number } | null;
  plan: { trip_no: string; caption: string; mass_label: string; imported_label: string;
    stops: PlannedStopView[] } | null;
  shift: ShiftView | null;
  records: RecordView[];
  auto_events: AutoEventView[];
  odometer_ref: OdometerRefView;
  requests: RequestCardView[];
  requests_done_today: { id: string; done_at: Instant }[];
  corrections_to_ack: CorrectionView[];
  paper: { owed: string[]; receipts: PaperReceipt[] };
  on_call: OnCallView;
  last_contact_at: Instant | null;
  first_time: { examples_seen: ArtefactKind[]; office_sees_read: boolean; first_arrival: boolean };
  day: DaySummaryView | null;
};
export type PlaceOption = { place_id: string; short: string; kind: PlaceKind; group: 'PLANNED' | 'NEARBY';
  distance_km: Km | null; ttn_no: string | null; stop_id: string | null };
type RecordInBase = { key: string; seq: number; occurred_at: string; committed_at: string; app_clock_at: string;
  stop_id?: string; place_id?: string; gps: Gps };
export type RecordIn = { [T in RecordType]: RecordInBase & { type: T; payload: Payloads[T] } }[RecordType];
export type Ack = { key: string; id: string; received_at: Instant; duplicate: boolean };
export type PageIn = { key: string; record_key: string; artefact: ArtefactKind; doc_index: number; page_no: number;
  captured_at: string; source: Exclude<PageSource, 'OFFICE_UPLOAD'>; bytes: number; quality: 'OK' | 'LOW';
  quality_reasons: string[]; deferred?: Deferred; drawn_variant?: string; drawn_value?: string;
  drawn_sim_read?: string; image?: string };
export type PhotoAck = { page_key: string; received_at: Instant };
export type HeartbeatIn = { unsent: number; last_capture_at?: string };
export type HeartbeatAck = { server_time: Instant; revoked: boolean };
export type MyDayRow = { kind: 'STOP' | 'REFUEL' | 'ROAD_STOP'; stop_id: string | null; title: string;
  lines: string[]; accepted_line: string | null; late_line: string | null };
export type MyPageView = { key: string; stop_id: string | null; artefact: ArtefactKind; doc_index: number;
  page_no: number; drawn_variant: string | null; image: string | null; state_line: string; captured_at: Instant };
export type MyDay = { date: BusinessDate; span_line: string | null; on_site_line: string | null; km_line: string | null;
  rows: MyDayRow[]; paper: string[]; corrections: CorrectionView[]; day_confirmed_at: Instant | null;
  printed_at: Instant | null; late_notes: string[]; pages: MyPageView[]; empty: boolean };
export type MyMonthDay = { date: BusinessDate; line: string };
export type MyMonth = { month: string; title: string; lines: string[]; days: MyMonthDay[] };

/* ── office ───────────────────────────────────────────────────────── */
export type Counts = { now: number; review: number; days_to_confirm: number; originals: number; bas_ready: number };
export type OfficeSummary = { clock: Instant;
  user: { id: string; name: string; initials: string; role: OfficeRole; role_label: string };
  scope: Scope; caption: string; counts: Counts;
  tiles: { not_started: { value: number; lines: string[] }; at_stops: { value: number; line: string };
    no_contact: { value: number; line: string } };
  on_call: { name: string; until: string }; closed_today: number; example: boolean };
export type FleetRow = { truck_id: string; truck_day_id: string | null; plate: string; badge: Badge; driver: string;
  /** The WHOLE line «в роботі: НШ», rendered verbatim — unlike `ExceptionItem.taken_by`, which is the initials «НШ»
   *  alone and gets its «в роботі:» from the row that shows it. */
  taken_by: string | null; state: string; state_line: string; state_since: Instant | null; rank: number;
  odometer: { value: Km | null; source: SourceKey | null };
  docs: { ttn: DocDot; signed: DocDot; receipts: DocDot; label: string };
  contact: { at: Instant | null; unsent_at_contact: number; stale: boolean }; phone: string | null;
  changed_at: Instant | null; example: boolean; simulated: boolean };
export type ExceptionEvidence = { kind: 'thumb'; variant: string } | { kind: 'line'; text: string };
export type ExceptionItem = { id: string; code: ExceptionCode; lane: 'NOW' | 'REVIEW';
  group: 'MONEY' | 'ODOMETER' | 'OTHER' | null; tone: Tone; title: string; meta: string; opened_at: Instant;
  age_min: number; evidence: ExceptionEvidence | null;
  primary_action: 'CALL' | 'CHECK' | 'FIX' | 'RESOLVE' | 'RETAKE' | 'OPEN_DAY' | 'SAMPLE';
  /** Filled on the items `listExceptions` appends after the open ones: resolved today by RESOLVE / ACCEPT_AS_IS
   *  («З'ясувала Н. Шевчук 10:14»), or closed by a correction («~~318 405~~ → 381 405 · одруківка · Н. Шевчук 21.09 16:05»). */
  taken_by: string | null; resolved: { by: string; at: Instant; reason: string;
    correction: { old: string; new: string } | null } | null;
  truck_day_id: string | null; truck_plate: string;
  target: { stop_id: string | null; record_key: string | null; page_key: string | null };
  request_line: string | null; phone: string | null; example: boolean };
export type UpdateExceptionIn = { action: 'TAKE' | 'RESOLVE' | 'ACCEPT_AS_IS'; reason?: string };
export type TtnFieldView = { field: TtnField; label: string; value: string | null;
  source: 'OCR' | 'OFFICE_TYPED' | 'PLAN' | null; source_line: string | null; ocr: string | null; required: boolean };
export type TtnDocView = { id: string; doc_index: number; no: string; switch_label: string; match_line: string;
  printed: TtnFieldView[]; reverse: TtnFieldView[]; blank_reverse: boolean; printed_confirmed: number;
  printed_required: number; derived: { text: string; tone: Tone } | null };
export type RequestView = { id: string; type: RequestType; target_label: string; reasons: RetakeReason[];
  by: string; unseen_line: string | null;
  states: { sent: Instant; delivered: Instant | null; seen: Instant | null; done: Instant | null;
    cancelled: Instant | null } };
export type PageView = { key: string; record_key: string; artefact: ArtefactKind; doc_index: number; page_no: number;
  caption: string; provenance: string; received: boolean; drawn_variant: string | null; image: string | null;
  superseded_by: string | null; supersedes: string | null; request: RequestView | null };
export type StopReview = { stop: { id: string; kind: 'LOADING' | 'DROP'; title: string; line: string };
  truck: { plate: string }; driver: { short: string; phone: string | null }; docs: TtnDocView[];
  pages: PageView[]; requests: RequestView[]; status: 'REVIEW' | 'ACCEPTED';
  accepted: { by: string; at: Instant } | null; day_status: 'OPEN' | 'READY' | 'CONFIRMED'; truck_day_id: string };
export type ReviewStopIn = { action: 'ACCEPT_PRINTED' | 'SET_FIELD' | 'MARK_BLANK_REVERSE' | 'ACCEPT_STOP';
  doc_index?: number; field?: TtnField; value?: string };
export type CreateRequestIn = { type: RequestType; record_key: string; page_key?: string; reasons: RetakeReason[] };
export type CreateCorrectionIn = { record_key: string; field: 'odometer' | 'occurred_at'; value: string;
  reason: CorrectionReason; note?: string };
export type TruckDayRow = { id: string; plate: string; badge: Badge; driver: string; date: BusinessDate;
  span: { from: Instant; to: Instant | null } | null; km: Km | null; docs: string; flags_open: number;
  attested_at: Instant | null; status: 'OPEN' | 'READY' | 'CONFIRMED'; waybill_no: string | null;
  exported_at: Instant | null; example: boolean };
export type SummaryCellView = { label: string; value: string; lines: string[]; hold_lines: string[]; simulated: boolean };
export type TimelineRow = { at: Instant; to: Instant | null; source: SourceKey; event: string;
  odometer: { value: Km; source: SourceKey } | null; thumbs: string[]; simulated: boolean; example: boolean };
export type LegRow = { n: number; from: string; to: string; loaded: boolean; km: Km | null; mass: Dec3 | null;
  tkm: Dec1 | null; ttn: string[]; arrival_driver: Instant | null; arrival_ttn: string | null; original: 'NONE' | 'RECEIVED' };
export type TruckDayView = {
  day: { id: string; date: BusinessDate; status: 'OPEN' | 'READY' | 'CONFIRMED'; waybill_no: string | null;
    version: number; confirmed: { by: string; at: Instant } | null; printed_at: Instant | null;
    signed_at: Instant | null; example: boolean; truck_plate: string; badge: Badge };
  requisites: { key: string; label: string; value: string; plate: string | null; note: string | null }[];
  summary: { odometer: SummaryCellView; fuel: SummaryCellView; time: SummaryCellView; documents: SummaryCellView };
  timeline: TimelineRow[]; legs: LegRow[]; fuel_block: string[];
  flags: { id: string; title: string; state: string; tone: Tone }[];
  history: { at: Instant; by: string; text: string }[]; badges: string[]; version: number;
  driver_attested_at: Instant | null; flags_open: number;
  /** The footer's left text, rendered verbatim: the C-08 sentence before confirmation, and after it already the stamp
   *  «Підтверджено Н. Шевчук 21.09 16:06» — so a page composes no second stamp. */
  consequence: string; print_lines: string[] };
export type ConfirmTruckDayIn = { version: number; reason?: string };

/* ── reports ──────────────────────────────────────────────────────── */
export type KeyPointRow = { plate: string; place: string; arrived_at: Instant; departed_at: Instant | null;
  departed_label: string; odometer: Km | null; source: SourceKey; simulated: boolean };
export type SheetRow = { cells: string[]; confirmed: boolean; example: boolean; ettn: boolean;
  /** «У BAS 21.09 16:07 · версія 1» once the day was imported (C-11); never written into a file. */
  exported_line: string | null };
export type SheetView = { title: string; columns: string[]; rows: SheetRow[]; total: number };
export type ImportResult = { at: Instant; created: number; updated: number; unchanged: number;
  corrections: string[]; note: string; lines: string[] };
export type ExportPreview = { date: BusinessDate; scope: Scope; confirmed: number; unconfirmed: number;
  still_on_shift: string[]; count_line: string;
  sheets: { waybills: SheetView; legs: SheetView; refuels: SheetView; worktime: SheetView };
  last_export_id: string | null; last_import: ImportResult | null };
export type CreateExportIn = { date: string; scope: Scope; sheet: 'WAYBILLS' | 'LEGS' | 'REFUELS' | 'WORKTIME' | 'ALL';
  format: 'CSV' | 'JSON' };
export type ExportFile = { id: string; file_name: string; mime: string; content: string; rows: number };
export type TruckMonthRow = { truck_id: string; plate: string; badge: Badge; days: number; km: Km; km_loaded: Km;
  fuel_rate: Dec1 | null; method_label: string; norm: Dec1; deviation: Dec1 | null; over_tolerance: boolean;
  fuel_uah: Decimal2 | null; site_hours: number; idle_over_free: string | null; docs_on_time: string;
  days_confirmed: string; example: boolean; simulated: boolean };
export type TruckFuel = { truck: { id: string; plate: string; line: string }; cells: SummaryCellView[];
  mismatches: string[]; norm_block: { hold: string; lines: string[]; trend: string[]; trend_label: string;
    dispatcher: string[] };
  month_strip: { date: BusinessDate; state: 'CONFIRMED' | 'TODAY' | 'OFF' | 'OPEN' }[];
  month: TruckMonthRow | null; example: boolean };
export type OriginalsRow = { id: string; driver: string; trip_no: string;
  docs: { id: string; label: string; received_at: Instant | null; received_by: string | null }[];
  days: number; note: string | null; group: 'OVERDUE' | 'TODAY'; example: boolean };
export type WorktimeRow = { driver: string; shifts: string; span: string; on_site: string; night: string;
  curfew_heat: string; tacho: string; diff: string; weekend: string; simulated: boolean; example: boolean };
export type DriverRow = { id: string; full_name: string; tab_no: string; plate: string; mode: 'APP' | 'PAPER';
  phone_label: string; pilot: boolean;
  binding: { state: 'NONE' | 'CODE_SHOWN' | 'OPENED' | 'BOUND'; code: string | null; expires_at: Instant | null;
    bound_at: Instant | null; device_label: string | null };
  example: boolean };
export type BindCodeView = { code: string; url: string; expires_at: Instant };
