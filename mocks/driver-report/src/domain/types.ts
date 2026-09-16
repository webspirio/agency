import type { Decimal2, Instant } from '@agency/mock';

/**
 * ЗВІТ ВОДІЯ — the domain, in the client's own vocabulary.
 *
 * WIRE CASING IS snake_case, because that is what the Nest backend emits and a
 * mock that renames fields is a mock whose components have to be edited at
 * conversion. `occurred_at`, `odometer_km` and `ttn_number` are deliberately
 * multi-word: the wire golden fingerprints key NAMES, so a drift to
 * `occurredAt` is red.
 *
 * THE MODEL IS ONE FLAT EVENT TABLE, and that is a decision rather than an
 * omission. There is no `trips` table the driver maintains, because maintaining
 * one means tapping through screens he is not reading. A рейс is a QUERY — see
 * `legsOf` in `calc.ts` — pairing each LOADING with the next UNLOADING on the
 * same truck. The client's «база» already holds the planned рейс and Ruptela
 * already holds where the truck was every 30 seconds; the only three facts
 * nobody else holds are the document, the number printed on it, and the
 * odometer a domestic truck's ECU may not report. The app asks for those.
 */

/**
 * The three things that ever happen. Deliberately NOT project44's full enum —
 * no ARRIVED, no DEPARTED, no WORK_STARTED. Five independent vendors
 * (Transporeon, Shippeo, Samsara, Omnitracs, Route4Me) derive arrival and
 * departure from geofences with zero driver interaction, and KTL already has
 * geofences drawn in Ruptela. A tap for them would double the tap count for
 * data the client already owns.
 *
 * REFUEL is standalone rather than a step inside a trip, because the client
 * said so in the call: «маленькими окремими модулями це йдуть заправки».
 */
export type EventKind = 'LOADING' | 'UNLOADING' | 'REFUEL';

/**
 * WHERE THE ODOMETER CAME FROM, and this field is the whole reason a
 * pre-filled value and a typed one can coexist without one pretending to be
 * the other. Copied in spirit from Bringg's `checkin_origin`, which records
 * whether a check-in was human or automatic.
 *
 * The three tiers, in order of how few taps they cost the driver:
 *   CAN_AUTO         Ruptela's CAN/FMS odometer. The screen does not render.
 *   DRIVER_CONFIRMED a pre-filled number and one green ТАК.
 *   DASH_PHOTO       he photographs the cluster. 97% of the fleet is Scania
 *                    Euro 5/6 with a digital LCD dash — the best OCR case there is.
 *   DRIVER_TYPED     the last resort, and the only screen in the product where
 *                    a man who «дуже не любить писати» writes.
 */
export type OdometerSource = 'CAN_AUTO' | 'DRIVER_CONFIRMED' | 'DASH_PHOTO' | 'DRIVER_TYPED';

/**
 * The artefact photographed. The two ТТН kinds are NOT the same document:
 * п.11.3–11.5 Правил №363 issues the ТТН in THREE copies, and примірник 3 —
 * the one certified by the consignee's signature and stamp — is what proves
 * delivery and unlocks payment. That is why the driver photographs twice, and
 * why the two screens say different sentences.
 */
export type PhotoKind = 'TTN' | 'TTN_SIGNED' | 'FUEL_RECEIPT' | 'DASH';

/**
 * Where the ТТН number came from. Modelled as a reference WITH a source from
 * day one, never as "a photo with a caption": е-ТТН is live and voluntary
 * today (ПКМУ №720 від 04.06.2026) with 15 authorised platform operators, and
 * a photo-only schema forces a rewrite the moment a counterparty switches.
 */
export type TtnSource = 'OCR' | 'OFFICE' | 'ETTN';

/** QUEUED until the server acknowledges. The driver sees «збережено» at the
 *  moment the row exists locally, never after a network round trip. */
export type SyncState = 'QUEUED' | 'SENT';

/**
 * Computed in the office, shown to the driver NEVER, and blocking NOTHING.
 * The industry answer to a wrong-place or wrong-order report is
 * warn-record-never-block — Detrack pops a geofence warning the driver may
 * ignore, Samsara logs an out-of-sequence arrival to an audit trail. Blocking
 * strands a man at a silo gate at 21:00 and produces a telephone call, which
 * is the behaviour that kills these apps.
 */
export type EventFlag = 'ODOMETER_BACKWARDS' | 'ODOMETER_JUMP' | 'NO_TTN_NUMBER';

export type Driver = {
  id: string;
  /** ПІБ, as HR holds it. Shown once on the bind screen at 32px so a wrong
   *  name is unmissable, then never asked again. */
  name: string;
  phone: string;
  truck_id: string;
};

export type Truck = {
  id: string;
  /** Rendered AS A PLATE, never as text in a sentence — the one element on the
   *  confirm screen a driver actually looks at. */
  plate: string;
  model: string;
  /**
   * Does Ruptela read this truck's CAN bus? On a `true` truck the odometer
   * screen does not render at all and the event costs three taps.
   *
   * UNVERIFIED IN REAL LIFE, and the mock must not pretend otherwise: Ruptela's
   * documented surface is a REST poll at api.fm-track.com and no public webhook
   * for geozone or CAN events could be found. «Регіс», which covers the ~70%
   * domestic fleet, could not be identified as a company at all.
   */
  has_can: boolean;
  /** The last reading the office holds, in whole kilometres. Never a decimal:
   *  an odometer is a count, not money. */
  odometer_km: number;
  /** Litres per 100 km, from the CLIENT'S OWN approved наказ. There is no state
   *  norm any more — наказ Мінтрансу №43 was repealed by наказ №1011 від
   *  02.11.2023, leaving only ДержавтотрансНДІпроект's advisory Базові норми. */
  norm_l_100km: Decimal2;
};

/**
 * ONE EVENT. Immutable from the phone's side: the driver cannot edit or delete,
 * only the office can confirm or void. Every field the driver did not supply is
 * named as nullable rather than faked.
 */
export type DriverEvent = {
  id: string;
  kind: EventKind;
  driver_id: string;
  driver_name: string;
  truck_id: string;
  plate: string;
  /** The device clock at capture. Server-derived here; a timestamp a client can
   *  name is one a client can forge. */
  occurred_at: Instant;
  /** Ruptela's geofence name where the office has one, else the coarse place
   *  the driver's one-shot GPS fix resolved to. The driver never picks it from
   *  a list — a list is reading, and reading is what does not happen. */
  place: string;
  odometer_km: number;
  odometer_source: OdometerSource;
  photo_kind: PhotoKind;
  /** NULL until OCR reads it or the dispatcher types it. The driver is never
   *  asked: it is 8–12 keystrokes from a man holding the document. */
  ttn_number: string | null;
  ttn_source: TtnSource | null;
  /** Litres and hryvnia come from the receipt, by OCR or by the office —
   *  never from the driver. A third input on the refuel tile kills the module,
   *  which is the one feature every adoption source names as ignored. */
  litres: Decimal2 | null;
  amount_uah: Decimal2 | null;
  confirmed_at: Instant | null;
  flags: readonly EventFlag[];
  sync: SyncState;
};

/**
 * WHAT THE PHONE SENDS. No `id`, no `occurred_at`, no `flags`, no `sync`: ids
 * are store-assigned (HARD RULE 4), the timestamp is server-derived, and the
 * flags are the office's verdict rather than the driver's claim.
 *
 * `odometer_km` is a STRING on the wire because that is what an input carries;
 * `invalidOdometer` in `rules.ts` is what refuses a non-number, with a code the
 * contract declares. A shape check answers "is this the right SHAPE"; a domain
 * rule answers "is this a legal value", and only the second has a code.
 */
export type SubmitEvent = {
  kind: EventKind;
  truck_id: string;
  odometer_km: string;
  odometer_source: OdometerSource;
  photo_kind: PhotoKind;
  place: string;
};

/** What the DISPATCHER supplies, sitting down, in light, with two clean hands
 *  and the photograph in front of her. This is the deliberate relocation of
 *  typing — not its removal. */
export type ConfirmEvent = {
  ttn_number: string;
};

/** The driver's home screen. One request, everything on it. */
export type Me = {
  driver_name: string;
  plate: string;
  truck_id: string;
  model: string;
  has_can: boolean;
  /** The pre-fill the odometer screen offers, and the reason it is one tap. */
  odometer_km: number;
  today: number;
  queued: number;
};

/**
 * A рейс, RECONSTRUCTED. Not a row a driver maintained — a pairing of each
 * LOADING with the next UNLOADING on the same truck, with every REFUEL that
 * falls between them attached. This is the query the office runs instead of the
 * object the phone would have had to carry.
 */
export type Leg = {
  id: string;
  plate: string;
  driver_name: string;
  from_place: string;
  to_place: string;
  started_at: Instant;
  /** NULL on a leg whose unloading has not been reported — the red chip. */
  ended_at: Instant | null;
  odometer_out_km: number;
  odometer_in_km: number | null;
  km: number | null;
  litres: Decimal2;
  /** Against the truck's OWN norm, because there is no state norm. NULL while
   *  the leg is open or carries no refuel. */
  l_100km: Decimal2 | null;
  norm_l_100km: Decimal2;
  /** Over the client's own approved norm — the number that costs money, since
   *  over-norm fuel triggers a compensating VAT liability under пп.«г»
   *  п.198.5 ПКУ. */
  over_norm: boolean;
  ttn_number: string | null;
};

/**
 * ONE ROW OF BAS's OWN «Подорожній лист».
 *
 * The field names are not invented: BAS's standard document already carries
 * водій, автомобіль, «показники спідометра на момент виїзду та повернення», and
 * computes fuel from норми × пробіг. This is a near one-to-one match with what
 * the driver's four taps produce, which is why the export target is that
 * document rather than a CSV somebody has to map by hand.
 *
 * Note СПІДОМЕТР, not ОДОМЕТР. Drivers say спідометр and so does BAS — the
 * driver's word and the accounting system's word are the same word, and it is
 * not the technically correct one.
 */
export type WaybillRow = {
  id: string;
  /** ISO business date, not an instant: BAS's document is per day. */
  date: string;
  driver_name: string;
  plate: string;
  spidometr_out_km: number;
  spidometr_in_km: number | null;
  km: number | null;
  litres_by_receipt: Decimal2;
  litres_by_norm: Decimal2 | null;
  ttn_number: string | null;
};

export type WaybillExport = {
  generated_at: Instant;
  rows: readonly WaybillRow[];
  /** Usable legs only. A leg whose спідометр went BACKWARDS contributes nothing
   *  here, because summing an impossible distance produces an impossible total
   *  and this figure is about to be pushed into an accounting base. */
  total_km: number;
  total_litres: Decimal2;
  /**
   * How many rows carry a distance nobody should act on — today, a negative
   * пробіг, which is what a dropped digit looks like after the subtraction.
   *
   * Counted rather than filtered out, and that distinction is the whole point:
   * the row stays in `rows` so a dispatcher can see it and fix it, and this
   * number is how the screen knows to say the export is not safe to send yet.
   * Dropping the row silently would be the export quietly disagreeing with the
   * рейс register about how many trips happened.
   */
  suspect: number;
};

/** The dispatcher's summary strip. */
export type Overview = {
  headline: string;
  generated_at: Instant;
  /** Events waiting for a dispatcher to read one number off a photograph. */
  pending: number;
  events: number;
  legs: number;
  total_litres: Decimal2;
};
