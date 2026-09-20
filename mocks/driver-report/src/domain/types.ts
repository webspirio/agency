import type { BusinessDate, Decimal2, Instant } from '@agency/mock';
export type { BusinessDate, Decimal2, Instant };

export type Dec1 = string;   // one decimal: l/100, per cent, t·km  ('31.8')
export type Dec3 = string;   // tonnes ('12.000')
export type Km = number;     // whole kilometres
export type Scope = 'PILOT' | 'FLEET';
export type Tone = 'plain' | 'hold' | 'reject' | 'muted';
export type Deferred = 'AT_PARKING' | 'AFTER_EXIT';
export type Gps = 'OK' | 'DENIED' | 'UNRELIABLE';

export const RECORD_TYPES = ['SHIFT_START', 'SHIFT_END', 'DRIVER_ATTESTED', 'ARRIVED', 'SEGMENT', 'LOADED',
  'UNLOADED', 'DOCS_ADDED', 'STOP_LEFT', 'REFUEL', 'ROAD_STOP', 'ROAD_STOP_END', 'STOP_PROBLEM', 'CALL_ME',
  'REQUEST_SEEN', 'REQUEST_REPLY', 'PHOTO_REPLACE', 'CORRECTION_ACK', 'VOID'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];
export const ARTEFACT_KINDS = ['TTN_FRONT', 'TTN_BACK', 'TTN_SIGNED', 'RECEIPT', 'CLUSTER', 'WEIGH_TICKET', 'ACT'] as const;
export type ArtefactKind = (typeof ARTEFACT_KINDS)[number];
export const PAGE_SOURCES = ['DRAWN', 'INPAGE', 'NATIVE', 'OFFICE_UPLOAD'] as const;
export type PageSource = (typeof PAGE_SOURCES)[number];
export const SEGMENT_CHIPS = ['QUEUE', 'LOADING_NOW', 'UNLOADING_NOW', 'SCALES', 'LAB', 'WAIT_DOCS', 'DRIVE_IN',
  'TTN_SHOWN', 'ALERT', 'OTHER', 'WAIT_ORDERS'] as const;
export type SegmentChip = (typeof SEGMENT_CHIPS)[number];
export const ROAD_STOP_REASONS = ['ALERT', 'CURFEW', 'HEAT', 'CHECKPOINT', 'BREAKDOWN', 'DETOUR', 'ACCIDENT',
  'WEIGH_CONTROL'] as const;
export type RoadStopReason = (typeof ROAD_STOP_REASONS)[number];
export const STOP_PROBLEM_KINDS = ['NOT_ACCEPTED', 'SEAL', 'NOT_LOADED', 'DISCREPANCY'] as const;
export type StopProblemKind = (typeof STOP_PROBLEM_KINDS)[number];
export const NO_DOC_REASONS = ['PRINTING', 'SHIPPER_REFUSED', 'ETTN', 'CALL_ME', 'CONSIGNEE_REFUSES',
  'LEFT_AT_CONSIGNEE', 'SIGN_LATER', 'NO_TICKET'] as const;
export type NoDocReason = (typeof NO_DOC_REASONS)[number];
export const CORRECTION_REASONS = ['OCR_ERROR', 'TYPO', 'BY_DASH_PHOTO', 'BY_CAN', 'ODOMETER_REPLACED', 'BY_TTN',
  'BY_STATEMENT', 'BY_PLAN', 'OTHER'] as const;
export type CorrectionReason = (typeof CORRECTION_REASONS)[number];
export const REQUEST_TYPES = ['RETAKE_PHOTO', 'CALL_ME'] as const;            // P0 only
export type RequestType = (typeof REQUEST_TYPES)[number];
export const RETAKE_REASONS = ['BLUR', 'CROPPED', 'GLARE', 'WRONG_SIDE', 'NO_ARRIVAL_TIME'] as const;
export type RetakeReason = (typeof RETAKE_REASONS)[number];
export const RESOLVE_REASONS = ['DRIVER_EXPLAINED', 'OCR_ERROR', 'NOT_A_PROBLEM', 'DOC_TODAY'] as const;
export type ResolveReason = (typeof RESOLVE_REASONS)[number];
export const FLAG_CODES = ['ODOMETER_BACKWARDS', 'ODOMETER_OFF_PLAN', 'ODOMETER_JUMP', 'ODOMETER_STALE',
  'ODOMETER_TYPED', 'ODOMETER_UNREAD', 'IMAGE_QUALITY_LOW', 'PLAN_MISMATCH_TRUCK', 'PLAN_MISMATCH_TRAILER',
  'LATE_RECORD_ON_CONFIRMED_DAY', 'NO_TTN_AT_DEPARTURE', 'SAMPLE'] as const;
export type FlagCode = (typeof FLAG_CODES)[number];
export const EXCEPTION_CODES = ['NO_TTN_AT_DEPARTURE', 'ACCIDENT', 'SEAL_PROBLEM', 'BREAKDOWN_CANT_DRIVE',
  'DISCREPANCY', 'NOT_ACCEPTED', 'NOT_LOADED', 'LOADED_NOT_RECORDED', 'CALL_ME', 'SHIFT_NOT_STARTED',
  'NO_SIGNED_TTN', 'STOP_REVIEW', 'TTN_NO_MASS', 'ODOMETER_TYPED', 'ODOMETER_BACKWARDS', 'ODOMETER_JUMP',
  'ODOMETER_STALE', 'ODOMETER_UNREAD', 'ODOMETER_OFF_PLAN', 'SAMPLE_CHECK', 'IMAGE_QUALITY_LOW',
  'PAYMENT_METHOD_PENDING', 'PLACE_UNKNOWN', 'LATE_RECORD_ON_CONFIRMED_DAY', 'PLAN_MISMATCH_TRUCK',
  'PLAN_MISMATCH_TRAILER'] as const;
export type ExceptionCode = (typeof EXCEPTION_CODES)[number];
/** 'arrival'/'departure'/'gross' are the LOADING row of the reverse side; 'drop_arrival'/'drop_departure' the
 *  unloading row. reviewStop SET_FIELD 'arrival' on a DROP stop writes 'drop_arrival'. */
export const TTN_FIELDS = ['no', 'date', 'shipper', 'consignee', 'cargo', 'mass', 'compartments', 'seals',
  'arrival', 'departure', 'gross', 'drop_arrival', 'drop_departure'] as const;
export type TtnField = (typeof TTN_FIELDS)[number];
export const TELEMETRY_KINDS = ['CARD_IN', 'CARD_OUT', 'IN', 'OUT', 'REFUEL', 'DRAIN', 'BREAK', 'MOTION'] as const;
export type TelemetryKind = (typeof TELEMETRY_KINDS)[number];

export type Telematics = 'RUPTELA' | 'REGIS' | 'NONE';
export type OfficeRole = 'DISPATCHER' | 'OPERATOR' | 'ACCOUNTANT' | 'MECHANIC' | 'ON_CALL';
export type PlaceKind = 'BASE' | 'LOADING' | 'DROP' | 'REFUEL' | 'BORDER' | 'OTHER';

export type Truck = { id: string; plate: string; model: string; year: number | null; telematics: Telematics;
  has_can: boolean; has_tacho: boolean; has_fuel_sensor: boolean; norm_l_100: Dec1; norm_order: string | null;
  trailer_id: string; dispatcher_id: string; pilot: boolean; example: boolean; status: 'ACTIVE' | 'REPAIR';
  card_mask: string | null; paper: boolean;
  mechanic_reading: { value: Km; at: Instant; by_short: string } | null };
export type Trailer = { id: string; plate: string; body: 'PNEUMO' | 'TIPPER_TANK' | 'AUGER' | 'GRAIN_TIPPER' | 'TENT';
  body_label: string; compartments: number; capacity_t: Dec3 };
export type Driver = { id: string; full_name: string; short_name: string; first_name: string; initials: string;
  tab_no: string; phone: string | null; mode: 'APP' | 'PAPER'; pilot: boolean; example: boolean;
  hired_at: BusinessDate; truck_id: string };
export type OfficeUser = { id: string; login: string; full_name: string; short_name: string; initials: string;
  role: OfficeRole; phone: string | null };
export type RotaSlot = { id: string; user_id: string; from: string; to: string };
export type Device = { id: string; driver_id: string | null; label: string; os_label: string;
  bound_at: Instant | null; bound_by: string | null; revoked_at: Instant | null; last_contact_at: Instant | null;
  unsent_at_contact: number; next_seq: number; seen_examples: ArtefactKind[]; office_sees_read: boolean };
export type BindCode = { id: string; code: string; driver_id: string; created_by: string; created_at: Instant;
  expires_at: Instant; opened_at: Instant | null; used_at: Instant | null; device_id: string | null };
export type Place = { id: string; code: string; name: string; short: string; label: string; label_gen: string;
  town: string; town_gen: string; town_loc: string;
  kind: PlaceKind; edrpou: string | null; no_photos: boolean; weigh_ticket: boolean;
  curfew: { from: string; to: string } | null; radius_m: number; near_code: string | null; near_km: Km | null };
export type Distance = { id: string; from_code: string; to_code: string; km: Km };
export type Trip = { id: string; no: string; truck_id: string; trailer_id: string; driver_id: string;
  date: BusinessDate; source: 'BAS_FILE' | 'OFFICE'; imported_at: Instant; example: boolean;
  planned_start: Instant | null };
export type PlannedStop = { id: string; plan_key: string; trip_id: string; seq: number; place_id: string;
  kind: 'LOADING' | 'DROP' | 'BASE' | 'UNPLANNED'; ttn_expected: number; ttn_nos: string[];
  drop_index: number | null; drop_count: number | null; compartments: string | null; cargo: string | null;
  mass_t: Dec3 | null; unplanned_kind: 'LOADING' | 'DROP' | 'REFUEL' | 'OTHER' | null;
  accepted_at: Instant | null; accepted_by: string | null };
export type Shift = { id: string; driver_id: string; device_id: string; truck_id: string; trailer_id: string;
  truck_day_id: string; started_at: Instant; ended_at: Instant | null; attested_at: Instant | null;
  closed_by: 'DRIVER' | 'OFFICE' | 'CARD' | null; start_key: string | null };
export type ExampleDayFigures = { km: Km; km_loaded: Km; from: Instant; to: Instant; docs: string;
  fuel_l: Decimal2 | null; legs: number; refuels: number; driver_short: string;
  /** UC-O15's one seeded «зі слів водія» entry (АР 0633 КХ, «дзвінок 09:12 · О. Кравець»); null elsewhere. */
  call_entry: { at: Instant; by_short: string } | null };
export type TruckDay = { id: string; truck_id: string; driver_id: string | null; date: BusinessDate;
  version: number; status: 'OPEN' | 'READY' | 'CONFIRMED'; waybill_no: string | null;
  confirmed_by: string | null; confirmed_at: Instant | null; confirm_reason: string | null;
  printed_at: Instant | null; signed_at: Instant | null;
  exported: { export_id: string; at: Instant; version: number } | null;
  example: boolean; figures: ExampleDayFigures | null };

export type OdometerSource = 'CAN' | 'DASH_PHOTO' | 'PLAN_CONFIRMED' | 'DRIVER_TYPED' | 'UNREAD' | 'OFFICE_EDIT'
  | 'OFFICE_CALC' | 'OFFICE_FROM_CALL';
export type OdometerBasis = 'LAST_AT_BASE' | 'MECHANIC' | 'PLANNED_KM' | 'CAN_DELTA' | 'NONE';
export type OdometerChoice = 'CONFIRMED' | 'DIGIT_EXPECTED' | 'DIGIT_READ' | 'TYPED' | 'KEPT_AS_IS' | 'UNREAD' | 'AUTO';
export type Odometer = { value: Km | null; source: OdometerSource; basis: OdometerBasis; expected: Km | null;
  read: Km | null; choice: OdometerChoice; page_key: string | null };

export type Page = { id: string; key: string; record_key: string; artefact: ArtefactKind; doc_index: number;
  page_no: number; captured_at: Instant; source: PageSource; bytes: number; quality: 'OK' | 'LOW';
  quality_reasons: string[]; deferred: Deferred | null;
  drawn: { variant: string; value: string | null; sim_read: string | null } | null;
  image: string | null; received_at: Instant | null; superseded_by: string | null };

export type Payloads = {
  SHIFT_START: { truck_id: string; trailer_id: string; plan_match: boolean; odometer: Odometer | null;
    inline: 'NOW' | 'M30' | 'H1' | 'EARLIER' | 'CARD' | null };
  SHIFT_END: { odometer: Odometer | null; place_id: string | null };
  DRIVER_ATTESTED: { shift_id: string | null; km: Km | null; documents: number };
  ARRIVED: { order: 'PLANNED' | 'OUT_OF_ORDER' | 'UNPLANNED'; claimed_at: string | null; chip: SegmentChip | null;
    odometer: Odometer | null; unplanned_kind: 'LOADING' | 'DROP' | 'REFUEL' | 'OTHER' | null; new_place: boolean };
  SEGMENT: { chip: SegmentChip };
  LOADED: { ttn_count: number; pages: string[]; no_doc_reason: NoDocReason | null; deferred: Deferred | null };
  UNLOADED: { drop_index: number | null; pages: string[]; deferred: Deferred | null; no_doc_reason: NoDocReason | null };
  DOCS_ADDED: { pages: string[]; odometer: Odometer | null; deferred: Deferred };
  STOP_LEFT: Record<string, never>;
  REFUEL: { station: string; receipt_no: string | null; rro_no: string | null; sum_uah: Decimal2 | null;
    card_mask: string | null; full_tank: boolean; odometer: Odometer | null; deferred: boolean };
  ROAD_STOP: { reason: RoadStopReason; can_drive: boolean | null };
  ROAD_STOP_END: { road_stop_key: string; at: string; closed_by: 'DRIVER' | 'CAN_MOTION' | 'NEXT_TAP_CHIP' };
  STOP_PROBLEM: { kind: StopProblemKind; reason: string | null };
  CALL_ME: Record<string, never>;
  REQUEST_SEEN: { request_id: string };
  REQUEST_REPLY: { request_id: string; reply: 'LATER' | 'NO_DOCUMENT' | 'CALL_ME' };
  PHOTO_REPLACE: { request_id: string | null; page_key: string; supersedes: string };
  CORRECTION_ACK: { correction_id: string; agree: boolean };
  VOID: { target_key: string };
};
export type RecordPayload = Payloads[RecordType];

export type DriverRecordBase = { id: string; key: string; seq: number; device_id: string; driver_id: string;
  truck_id: string; shift_id: string | null; truck_day_id: string | null; occurred_at: Instant;
  committed_at: Instant; app_clock_at: Instant; received_at: Instant; stop_id: string | null;
  place_id: string | null; gps: Gps; flags: FlagCode[]; voided_by: string | null; late: boolean };
export type DriverRecord = { [T in RecordType]: DriverRecordBase & { type: T; payload: Payloads[T] } }[RecordType];
export type RecordOf<T extends RecordType> = Extract<DriverRecord, { type: T }>;

export type TtnFieldValue = { value: string; source: 'OCR' | 'OFFICE_TYPED' | 'PLAN'; by: string; at: Instant };
export type TtnDoc = { id: string; no: string; label: string; date: BusinessDate; trip_no: string; driver_id: string;
  loading_stop_id: string | null; drop_stop_id: string | null; doc_index: number; ttn_count: number;
  fields: Record<TtnField, TtnFieldValue | null>; ocr: Record<TtnField, string | null>; blank_reverse: boolean;
  original: { received_at: Instant; received_by: string } | null; driver_said_handed: BusinessDate | null;
  ettn: { no: string; platform: string; status: string } | null; note: string | null; example: boolean };
export type Request = { id: string; type: RequestType; record_key: string; page_key: string | null;
  stop_id: string | null; device_id: string; reasons: RetakeReason[]; created_by: string; created_at: Instant;
  delivered_at: Instant | null; seen_at: Instant | null; done_at: Instant | null; cancelled_at: Instant | null;
  reply: string | null };
export type Correction = { id: string; record_key: string; field: 'odometer' | 'occurred_at'; old: string;
  new: string; reason: CorrectionReason; note: string | null; by: string; role: OfficeRole; at: Instant;
  needs_ack: boolean; ack: { agree: boolean; at: Instant } | null };
export type Resolution = { id: string; item_id: string; code: ExceptionCode;
  action: 'TAKE' | 'RESOLVE' | 'ACCEPT_AS_IS'; reason: string | null; by: string; at: Instant };
export type Telemetry = { id: string; truck_id: string; at: Instant; kind: TelemetryKind; place_id: string | null;
  can_km: Km | null; litres: Decimal2 | null; minutes: number | null; until: Instant | null };
export type ExportRow = { id: string; date: BusinessDate; scope: Scope;
  sheet: 'WAYBILLS' | 'LEGS' | 'REFUELS' | 'WORKTIME' | 'ALL'; format: 'CSV' | 'JSON'; created_at: Instant;
  by: string; day_ids: string[]; file_name: string;
  import: { at: Instant; created: number; updated: number; unchanged: number; corrections: string[] } | null };
export type Audit = { id: string; at: Instant; actor_id: string; role: string; action: string; target: string;
  detail: string; truck_day_id: string | null };
export type StatementLine = { id: string; truck_id: string; at: Instant; station: string; litres: Decimal2;
  sum_uah: Decimal2; matched_record_key: string | null };
export type TruckMonth = { id: string; truck_id: string; month: string; days: number; km: Km; km_loaded: Km;
  fuel_rate: Dec1 | null; fuel_method: 'CAN' | 'FULL_TO_FULL'; deviation: Dec1 | null; fuel_uah: Decimal2 | null;
  site_hours: number; docs_on_time: string; days_confirmed: string; tkm: Dec1 | null; loaded_share: string | null;
  trend: string[]; example: boolean };
export type DriverMonth = { id: string; driver_id: string; month: string; shifts: number; on_shift_min: number;
  on_site_min: number; night_min: number; docs_accepted: number; docs_total: number; originals_accepted: number;
  originals_total: number; tacho_label: string; diff_label: string; curfew_heat_label: string;
  weekend_label: string; simulated: boolean; example: boolean;
  days: { date: BusinessDate; on_shift_min: number; docs_in_office: number; docs_total: number }[] };
export type ExampleItem = { id: string; truck_id: string; code: ExceptionCode; lane: 'NOW' | 'REVIEW';
  group: 'MONEY' | 'ODOMETER' | 'OTHER' | null; tone: Tone; title: string; meta: string; opened_at: Instant;
  evidence: string | null; target_record_key: string | null; phone: string | null };
export type ExampleBoardRow = { id: string; truck_id: string; driver_label: string; state: string;
  state_line: string; rank: 1 | 2 | 3 | 4 | 5 | 6; odometer: { value: Km; source: OdometerSource } | null;
  contact_at: Instant | null; unsent_at_contact: number; at_stop_min: number | null; on_shift: boolean;
  not_started: 'MOVING_RUPTELA' | 'REGIS_NO_DATA' | 'ABSENT' | null; simulated: boolean };

/** A read-only snapshot of every store: what every domain function takes. Built by snapshot() (I-6). */
export type World = { trailers: Trailer[]; trucks: Truck[]; officeUsers: OfficeUser[]; rota: RotaSlot[];
  drivers: Driver[]; devices: Device[]; bindCodes: BindCode[]; places: Place[]; distances: Distance[];
  trips: Trip[]; plannedStops: PlannedStop[]; shifts: Shift[]; truckDays: TruckDay[]; records: DriverRecord[];
  pages: Page[]; ttnDocs: TtnDoc[]; requests: Request[]; corrections: Correction[]; resolutions: Resolution[];
  telemetry: Telemetry[]; exports: ExportRow[]; audit: Audit[]; statements: StatementLine[];
  truckMonths: TruckMonth[]; driverMonths: DriverMonth[]; exampleItems: ExampleItem[];
  exampleBoard: ExampleBoardRow[] };
