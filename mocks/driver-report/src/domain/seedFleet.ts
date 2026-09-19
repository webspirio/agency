// mocks/driver-report/src/domain/seedFleet.ts
/**
 * §7.6 «The fleet example». The 88 generated trucks (with their trailers, drivers and September rows) and every example
 * row behind «Весь парк · 100»: the board as it reads at 16:05 (97 rows), the 62 truck-days closed today (56 confirmed,
 * 6 ready), the example items of «Зараз» and «Перевірка», the example originals and the one е-ТТН, and Ярошенко's two
 * records on his phone. `populate()` (W0-04) calls this LAST, so every detailed row it refers to already exists; it
 * reads them back by natural key (plate, tab number, login, place code) and never by id.
 *
 * Nothing here draws a probability. Every count is a table consumed in order; names come from
 * `createStream(FLEET_SEED).person('uk')` and nothing else (never `address()` or `company()`, whose corpus the
 * occupied-territory test does not vet); the other varied numbers come from a second stream seeded beside it. No `*`,
 * `/` or relational operator: whole numbers go through num.ts, every litre, hryvnia and rate through @agency/dec.
 */
import { add, div, mul, sub } from '@agency/dec';
import { asBusinessDate, asDecimal2, byCodepoint, type Decimal2, type Instant } from '@agency/mock';
import { createStream, type Stream } from '@agency/synth';
import { allRows, type Stores } from '../api/stores';
import { addSeconds, DEMO_DATE, demo, kyiv, minutesBetween } from './clock';
import { gt, gte, intDiv, lt, toInt } from './num';
// A value cycle with seed.ts, read only inside populateFleet(), long after both modules have initialised: the example
// diesel price has one home, and a copy here would drift from it.
import { DIESEL_PRICE_KOP } from './seed';
import { TTN_FIELDS, type Driver, type ExampleBoardRow, type ExampleItem, type ExceptionCode, type OdometerSource,
  type OfficeUser, type Place, type Trailer, type Truck, type TruckDay, type TtnField } from './types';

export const FLEET_SEED = 2109;

type Rank = ExampleBoardRow['rank'];

/* ── the generated trucks ──────────────────────────────────────────────── */

/** «АР dddd XX»: the i-th number is 1000 + (i × 37 mod 8 999), accumulated rather than multiplied. */
const SUFFIXES = ['ВС', 'ВЕ', 'КС', 'МК', 'НТ', 'ІВ', 'ЕК', 'СЕ', 'ХА', 'КХ'] as const;
const TRAILER_SUFFIXES = ['ХР', 'ХТ', 'ХС', 'ХК'] as const;
const BODIES: readonly Omit<Trailer, 'id' | 'plate'>[] = [
  { body: 'PNEUMO', body_label: 'пневмобочка, 6 відсіків', compartments: 6, capacity_t: '25.000' },
  { body: 'TIPPER_TANK', body_label: 'кіперна бочка', compartments: 1, capacity_t: '25.000' },
  { body: 'PNEUMO', body_label: 'пневмобочка, 5 відсіків', compartments: 5, capacity_t: '22.000' },
  { body: 'AUGER', body_label: 'шнекова бочка', compartments: 1, capacity_t: '24.000' },
  { body: 'GRAIN_TIPPER', body_label: 'зерновоз', compartments: 1, capacity_t: '25.000' },
  { body: 'PNEUMO', body_label: 'пневмобочка, 4 відсіки', compartments: 4, capacity_t: '16.000' },
];
const MODELS = ['Scania R410', 'Scania R450', 'Scania P360', 'Scania G410', 'Scania R440', 'Scania R500'] as const;
const NORMS = ['29.5', '30.5', '31.0', '31.5', '32.0'] as const;
/** Every fifth generated truck is Ruptela + CAN; the rest are «Регіс», like most of the detailed fleet. */
const RC_EVERY = 5;
/** §7.6 «People»: Ірина 35 trucks (the pilot included), Оксана 35, Тетяна 30 — the detailed twelve already hold 4 · 5 · 3. */
const DISPATCHERS: readonly (readonly [string, number])[] = [['iryna', 31], ['oksana', 30], ['tetiana', 27]];
const OPERATORS = ['67', '50', '96', '98', '66', '97', '63', '68', '95', '73'] as const;
/** l/100 above or below the truck's norm: at most +0,9 on a 29,5 norm, so no generated truck passes +3,4 % (D14). */
const RATE_DELTAS = ['-0.6', '-0.4', '-0.2', '0.0', '0.2', '0.3', '0.5', '0.7', '0.9'] as const;
const TREND_DELTAS = ['-0.3', '-0.2', '-0.1', '0.1', '0.2', '0.3'] as const;

/* ── how the fleet stands at 16:05 ─────────────────────────────────────── */

type Kind = 'LOADED' | 'EMPTY' | 'QUEUE_DROP' | 'QUEUE_LOAD' | 'LOADING' | 'WAIT_DOC' | 'REPAIR' | 'NO_PLAN' | 'CLOSED';
/** The 88 generated trucks, dealt one per state in turn until each count runs out. With the nine detailed examples
 *  below they make the 97 board rows of §7.6: 9 «Їде завантажений» · 10 «Їде порожній» · 4 + 2 «У черзі» · 2 «Стоїть» ·
 *  1 «Завантажується» · 1 «Вивантажено, чекає документ» · 2 «Ремонт» · 1 «Кордон» · 3 without a plan · 61 «Не на
 *  зміні» closed today · 1 «На базі». */
const GENERATED_STATES: readonly (readonly [Kind, number])[] = [
  ['LOADED', 9], ['EMPTY', 9], ['QUEUE_DROP', 3], ['QUEUE_LOAD', 2], ['LOADING', 1], ['WAIT_DOC', 1], ['REPAIR', 1],
  ['NO_PLAN', 3], ['CLOSED', 59],
];
/** Minutes in the queue. With АР 4471 ВС's 70 the six «У черзі» rows hold 460 = «разом 7 год 40 хв на точках зараз». */
const QUEUE_MIN: Partial<Record<Kind, readonly number[]>> = { QUEUE_DROP: [95, 55, 80], QUEUE_LOAD: [30, 130] };
/** Where a loaded «Регіс» truck is heading: a drop of the library, and the km its line reads. */
const LOADED_TO: readonly (readonly [string, number])[] = [
  ['ZLAGODA', 52], ['DOBROBUT', 98], ['LAN', 116], ['BERIZKA', 64], ['HAVAN', 71], ['KOLOS', 44]];
/** Minutes since a loaded truck left, n-th «Їде завантажений» first. The first left at 15:31 and the third at 14:47 —
 *  the loadings their «Перевірка» items open on — so the board line and the item agree. */
const LOADED_MIN = [34, 52, 78, 12, 41, 66, 25, 19, 58] as const;
/** The generated days end from 14:08 on, one to two minutes apart; the last three are still waiting to be confirmed. */
const FIRST_END = '14:08';
const END_STEPS = [2, 1, 2, 2, 1] as const;
const GENERATED_READY = 3;
/** Over the 56 confirmed example days (§7.6): with Павло's 4 and Олег's 3 legs and their 2 refuels, «Ділянки · 97» and
 *  «Заправки · 41» once both pilot days are confirmed. */
const CONFIRMED_LEGS = 90;
const CONFIRMED_REFUELS = 39;
const FIRST_WAYBILL = 100001;
/** «Без зв'язку понад 2 год» — at 16:05 АР 5577 ЕК is the only such truck, and a stop over 2 h ranks 3. */
const TWO_HOURS = 120;
const AT = '16:05';

/* ── the nine detailed example trucks (§7.6 table, column 16:05) ────────── */

type BoardSeed = { plate: string; tabs: readonly string[]; state: string; line: string; base: Rank;
  odometer: readonly [number, OdometerSource]; contact: string | null; unsent: number; at_stop: number | null;
  on_shift: boolean };
const DETAILED_BOARD: readonly BoardSeed[] = [
  { plate: 'АР 5577 ЕК', tabs: ['0162', '0274'], state: 'Кордон', line: 'Ягодин · черга 2 д 7 год', base: 5,
    odometer: [612480, 'CAN'], contact: '13:25', unsent: 2, at_stop: null, on_shift: true },
  { plate: 'АР 3344 НТ', tabs: ['0309'], state: 'Стоїть', line: 'Не приймають · 0:40', base: 4,
    odometer: [455120, 'DASH_PHOTO'], contact: '16:03', unsent: 0, at_stop: null, on_shift: true },
  { plate: 'АР 5678 СЕ', tabs: ['0231'], state: 'Ремонт', line: 'СТО КТЛ', base: 6,
    odometer: [398770, 'DASH_PHOTO'], contact: null, unsent: 0, at_stop: null, on_shift: false },
  { plate: 'АР 6618 ЕС', tabs: ['0298'], state: 'На базі', line: 'закінчив 15:50', base: 6,
    odometer: [503452, 'DASH_PHOTO'], contact: '15:58', unsent: 0, at_stop: null, on_shift: false },
  { plate: 'АР 2745 ІВ', tabs: ['0336'], state: 'Не на зміні', line: 'закінчив 15:20', base: 6,
    odometer: [381617, 'DASH_PHOTO'], contact: '15:21', unsent: 0, at_stop: null, on_shift: false },
  { plate: 'АР 8150 КС', tabs: ['0117'], state: 'Їде порожній', line: 'Ruptela · позиція 1 хв тому', base: 5,
    odometer: [164905, 'CAN'], contact: '16:04', unsent: 0, at_stop: null, on_shift: true },
  { plate: 'АР 3380 ТК', tabs: ['0352'], state: 'Стоїть', line: 'Поломка · 0:45', base: 4,
    odometer: [471338, 'DASH_PHOTO'], contact: '16:01', unsent: 0, at_stop: null, on_shift: true },
  { plate: 'АР 4471 ВС', tabs: ['0268'], state: 'У черзі на вивантаження', line: 'Черга · 1:10', base: 5,
    odometer: [529904, 'DASH_PHOTO'], contact: '16:02', unsent: 0, at_stop: 70, on_shift: true },
  { plate: 'АР 0633 КХ', tabs: ['0321'], state: 'Не на зміні', line: 'ПАПІР', base: 6,
    odometer: [688412, 'OFFICE_FROM_CALL'], contact: null, unsent: 0, at_stop: null, on_shift: false },
];
/** The three detailed trucks whose day closed today — all READY: Приходько's refuel has no payment method yet,
 *  Ярошенко's start carries the typed odometer, Гуменюк's day is on paper. */
type DaySeed = { plate: string; tab: string; from: string; to: string; km: number; km_loaded: number; docs: string;
  fuel_l: string | null; legs: number; refuels: number; call: readonly [string, string] | null };
const DETAILED_DAYS: readonly DaySeed[] = [
  { plate: 'АР 6618 ЕС', tab: '0298', from: '05:35', to: '15:50', km: 236, km_loaded: 152, docs: '4 з 5', fuel_l: '212.60',
    legs: 3, refuels: 1, call: null },
  { plate: 'АР 2745 ІВ', tab: '0336', from: '05:40', to: '15:20', km: 212, km_loaded: 138, docs: '3 з 4', fuel_l: '186.40',
    legs: 3, refuels: 1, call: null },
  // UC-O15's one seeded «зі слів водія» entry: the paper driver phoned it in and О. Кравець wrote it down.
  { plate: 'АР 0633 КХ', tab: '0321', from: '05:50', to: '15:40', km: 188, km_loaded: 122, docs: '2 з 2', fuel_l: null,
    legs: 2, refuels: 0, call: ['2026-09-21 09:12', 'oksana'] },
];

/* ── example items, originals, Ярошенко ─────────────────────────────────── */

type TruckRef = { plate: string } | { kind: Kind; n: number };
type ItemSeed = { ref: TruckRef | 'SAMPLE'; code: ExceptionCode; lane: 'NOW' | 'REVIEW'; group: ExampleItem['group'];
  title: string; at: string; town: string | null };
/** «Зараз» 3 and «Перевірка» 10 (§7.6; the eleventh, Ярошенко's ODOMETER_TYPED, is derived from his record). */
const ITEMS: readonly ItemSeed[] = [
  { ref: { plate: 'АР 3380 ТК' }, code: 'BREAKDOWN_CANT_DRIVE', lane: 'NOW', group: null, title: 'Поломка — не можу їхати',
    at: '15:20', town: 'ZLAGODA' },
  { ref: { plate: 'АР 3344 НТ' }, code: 'NOT_ACCEPTED', lane: 'NOW', group: null, title: 'Не приймають · Елеватор повний',
    at: '15:25', town: 'HAVAN' },
  { ref: { plate: 'АР 6618 ЕС' }, code: 'CALL_ME', lane: 'NOW', group: null, title: 'Подзвоніть мені', at: '15:58',
    town: 'BASE' },
  { ref: { plate: 'АР 4471 ВС' }, code: 'PLACE_UNKNOWN', lane: 'REVIEW', group: 'OTHER',
    title: 'Нове місце 06:50 · 2 км від «Дніпро-Корм»', at: '06:50', town: 'DK' },
  { ref: { plate: 'АР 3344 НТ' }, code: 'TTN_NO_MASS', lane: 'REVIEW', group: 'MONEY',
    title: 'ТТН без маси (п.19.1.8) · ФГ «Степ» · 5 рейсів', at: '09:40', town: 'STEP' },
  { ref: { plate: 'АР 6618 ЕС' }, code: 'PAYMENT_METHOD_PENDING', lane: 'REVIEW', group: 'OTHER',
    title: 'Заправка 12:51 · спосіб оплати невідомий · на чеку лише «БЕЗГОТІВКОВА»', at: '12:51', town: 'WOG' },
  // Loaded at 12:52, in the drop's queue since 14:30 («Черга · 1:35»).
  { ref: { kind: 'QUEUE_DROP', n: 1 }, code: 'STOP_REVIEW', lane: 'REVIEW', group: 'MONEY',
    title: 'Вільнянськ · завантаження · 1 ТТН, 2 стор. · поля не підтверджено', at: '12:52', town: 'DK' },
  { ref: { kind: 'LOADED', n: 3 }, code: 'IMAGE_QUALITY_LOW', lane: 'REVIEW', group: 'OTHER',
    title: 'ТТН 2 з 2, зворотний — відблиск · водій залишив так', at: '14:47', town: 'DK' },
  { ref: { kind: 'EMPTY', n: 1 }, code: 'NO_SIGNED_TTN', lane: 'REVIEW', group: 'MONEY',
    title: 'Підписаної ТТН немає 3 год · рахунок не виставити', at: '15:05', town: 'DOBROBUT' },
  { ref: { kind: 'LOADED', n: 2 }, code: 'STOP_REVIEW', lane: 'REVIEW', group: 'MONEY',
    title: 'Славгород · завантаження · 1 ТТН, 2 стор. · поля не підтверджено', at: '15:12', town: 'STEP' },
  { ref: { kind: 'LOADED', n: 1 }, code: 'STOP_REVIEW', lane: 'REVIEW', group: 'MONEY',
    title: 'Вільнянськ · завантаження · 2 ТТН, 4 стор. · поля не підтверджено', at: '15:31', town: 'DK' },
  { ref: { kind: 'EMPTY', n: 2 }, code: 'STOP_REVIEW', lane: 'REVIEW', group: 'MONEY',
    title: 'Синельникове · вивантаження · 1 ТТН, 1 стор. · поля не підтверджено', at: '15:44', town: 'ZLAGODA' },
  // The fleet's daily sample (S-43's example twin). It names no truck's fault, so it never lifts a board row; it hangs
  // on the first confirmed example day because an item needs a truck.
  { ref: 'SAMPLE', code: 'SAMPLE_CHECK', lane: 'REVIEW', group: 'ODOMETER', title: 'Звірте з фото: 9 з 40 сьогодні',
    at: '16:00', town: null },
];
const SAMPLE_META = 'Весь парк · показання одометра з фото за сьогодні';

/** C-14 «Понад 3 дні», fleet rows: photographed, the paper not yet in the office. */
const ORIGINALS: readonly { tab: string; no: string; label: string; date: string; trip: string; note: string | null;
  handed: string | null }[] = [
  { tab: '0231', no: '214', label: 'акт №214 · талони 2', date: '2026-09-16', trip: 'Р-26-3187', note: 'нестача, претензія',
    handed: null },
  { tab: '0298', no: '004502', label: 'ТТН 004502', date: '2026-09-18', trip: 'Р-26-3290', note: null, handed: null },
  { tab: '0336', no: '004499', label: 'ТТН 004499', date: '2026-09-18', trip: 'Р-26-3288', note: null, handed: '2026-09-18' },
];
/** The one е-ТТН (C-11 «Ділянки»), on the trip of the first confirmed example day in plate order. Dated today, so it is
 *  never an overdue original (≥ 3 days), and its driver loaded nothing on a phone today, so it is not «очікуємо». */
const ETTN = { no: '004561', trip: 'Р-26-3305', ettn: { no: '2026-0921-000318', platform: 'Вчасно.ТТН', status: 'доставлено' } };

/** Ярошенко (§7.6 «History»): Sunday's shift end at base on 381 402, then — the mechanic having moved the truck 3 km —
 *  Monday's start typed as 318 405 over a dash photo that reads 381 405, and kept as is. */
const YAROSHENKO = { tab: '0336', plate: 'АР 2745 ІВ', lastEnd: 381402, typed: 318405, onDash: 381405 };

/* ── helpers ───────────────────────────────────────────────────────────── */

function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`seedFleet: ${what} is missing`);
  return v;
}
const pad = (n: number): string => String(n).padStart(2, '0');
/** Minutes after Kyiv midnight on the demo day. */
const minOf = (hm: string): number => minutesBetween(demo('00:00'), demo(hm));
const hhmm = (m: number): string => `${pad(intDiv(m, 60))}:${pad(m % 60)}`;
const at = (m: number): Instant => demo(hhmm(m));
/** A span of minutes as the board writes it: «1:10», «0:40». */
const span = (m: number): string => `${intDiv(m, 60)}:${pad(m % 60)}`;
const lower = (a: Rank, b: Rank): Rank => (lt(b, a) ? b : a);
/** Each key of a [key, count] table, one per remaining count in turn, until every count is spent. */
function deal<K>(table: readonly (readonly [K, number])[]): K[] {
  const left = table.map(([k, n]): [K, number] => [k, n]);
  const out: K[] = [];
  while (left.some(([, n]) => n !== 0)) {
    for (const e of left) {
      if (e[1] === 0) continue;
      out.push(e[0]);
      e[1] -= 1;
    }
  }
  return out;
}
/** Each key of a [key, count] table, count times, in table order. */
const expand = <K>(table: readonly (readonly [K, number])[]): K[] =>
  table.flatMap(([k, n]) => Array.from({ length: n }, () => k));
/** `n` of `total` flags set, spread evenly with an integer accumulator (Bresenham) instead of a float ratio. */
function spread(n: number, total: number): boolean[] {
  let acc = 0;
  return Array.from({ length: total }, () => {
    acc += n;
    if (!gte(acc, total)) return false;
    acc -= total;
    return true;
  });
}
const noFields = (): Record<TtnField, null> =>
  Object.fromEntries(TTN_FIELDS.map((f) => [f, null])) as Record<TtnField, null>;

type Gen = { truck: Truck; driver: Driver; kind: Kind; n: number; rc: boolean; odometer: number };
type Row = { state: string; line: string; base: Rank; at_stop: number | null; on_shift: boolean; contact: number | null };

/* ── populate ─────────────────────────────────────────────────────────── */

export function populateFleet(stores: Stores): void {
  const s = stores;
  const detailed = allRows(s.trucks);
  const drivers = allRows(s.drivers);
  const users = allRows(s.officeUsers);
  const places = allRows(s.places);
  const driver = (tab: string): Driver => must(drivers.find((d) => d.tab_no === tab), `driver ${tab}`);
  const user = (login: string): OfficeUser => must(users.find((u) => u.login === login), `office user ${login}`);
  const place = (code: string): Place => must(places.find((p) => p.code === code), `place ${code}`);

  const gen = seedGenerated(s, { trucks: detailed, drivers, users, trailers: allRows(s.trailers) },
    createStream(FLEET_SEED), createStream(FLEET_SEED + 1));
  const dice = createStream(FLEET_SEED + 2);
  const fleet = [...detailed, ...gen.map((g) => g.truck)];
  const truck = (plate: string): Truck => must(fleet.find((t) => t.plate === plate), `truck «${plate}»`);
  const truckById = (id: string): Truck => must(fleet.find((t) => t.id === id), `truck ${id}`);
  const byKind = (kind: Kind, n: number): Gen => must(gen.filter((g) => g.kind === kind)[n - 1], `generated ${kind} #${n}`);

  /* the truck-days closed today: the three detailed ones, then the 59 generated */
  const natalia = user('natalia').id;
  const days = new Map<string, TruckDay>();
  for (const d of DETAILED_DAYS) {
    const t = truck(d.plate);
    const dr = driver(d.tab);
    const call = d.call === null ? null : { at: kyiv(d.call[0]), by_short: user(d.call[1]).short_name };
    days.set(t.id, s.truckDays.create({ truck_id: t.id, driver_id: dr.id, date: DEMO_DATE, version: 1, status: 'READY',
      waybill_no: null, confirmed_by: null, confirmed_at: null, confirm_reason: null, printed_at: null, signed_at: null,
      exported: null, example: true, figures: { km: d.km, km_loaded: d.km_loaded, from: demo(d.from), to: demo(d.to),
        docs: d.docs, fuel_l: d.fuel_l === null ? null : asDecimal2(d.fuel_l), legs: d.legs, refuels: d.refuels,
        driver_short: dr.short_name, call_entry: call } }));
  }
  const closed = gen.filter((g) => g.kind === 'CLOSED');
  const confirmedCount = closed.length - GENERATED_READY;
  const twoLegs = spread(CONFIRMED_LEGS - confirmedCount, confirmedCount);
  const refuelled = spread(CONFIRMED_REFUELS, confirmedCount);
  const ends = new Map<string, number>();
  let end = minOf(FIRST_END);
  closed.forEach((g, k) => {
    if (k !== 0) end += must(END_STEPS[(k - 1) % END_STEPS.length], 'an end step');
    ends.set(g.truck.id, end);
    const confirmed = lt(k, confirmedCount);
    const legs = confirmed && !must(twoLegs[k], 'legs') ? 1 : 2;
    const refuels = confirmed && !must(refuelled[k], 'refuels') ? 0 : 1;
    const km = legs === 2 ? 150 + dice.int(110) : 60 + dice.int(60);
    const docs = legs + refuels;
    // One leg is one loaded run, so all of it is loaded; with two, the loaded leg is two-thirds of the run and the
    // empty return the rest. «Ділянки» deals the run out by these figures, and BAS reads it beside the waybill.
    const kmLoaded = legs === 1 ? km : km - intDiv(km, 3);
    const fuel_l: Decimal2 | null = refuels === 0 ? null : asDecimal2(`${140 + dice.int(120)}.${pad(dice.int(100))}`);
    days.set(g.truck.id, s.truckDays.create({ truck_id: g.truck.id, driver_id: g.driver.id, date: DEMO_DATE, version: 1,
      status: confirmed ? 'CONFIRMED' : 'READY', waybill_no: null, confirmed_by: confirmed ? natalia : null,
      confirmed_at: confirmed ? at(end + 15) : null, confirm_reason: null, printed_at: confirmed ? at(end + 16) : null,
      signed_at: null, exported: null, example: true,
      figures: { km, km_loaded: kmLoaded, from: at(minOf('04:30') + dice.int(130)), to: at(end),
        docs: confirmed ? `${docs} з ${docs}` : `${docs - 1} з ${docs}`, fuel_l, legs, refuels,
        driver_short: g.driver.short_name, call_entry: null } }));
  });
  // ПЛ-100001 … in plate order, whatever the creation order.
  const confirmedDays = [...days.values()].filter((d) => d.status === 'CONFIRMED')
    .sort((a, b) => byCodepoint(truckById(a.truck_id).plate, truckById(b.truck_id).plate));
  confirmedDays.forEach((d, i) => { s.truckDays.update(d.id, { waybill_no: `ПЛ-${FIRST_WAYBILL + i}` }); });
  const firstConfirmed = must(confirmedDays[0], 'a confirmed example day');

  /* the example items, and the ranks they lift on the board */
  const onDuty = new Map<string, Driver>(gen.map((g) => [g.truck.id, g.driver]));
  for (const b of DETAILED_BOARD) onDuty.set(truck(b.plate).id, driver(must(b.tabs[0], `${b.plate}'s driver`)));
  const lifted = new Map<string, Rank>();
  for (const it of ITEMS) {
    const t = it.ref === 'SAMPLE' ? truckById(firstConfirmed.truck_id)
      : 'plate' in it.ref ? truck(it.ref.plate) : byKind(it.ref.kind, it.ref.n).truck;
    const dr = must(onDuty.get(t.id), `${t.plate}'s driver`);
    s.exampleItems.create({ truck_id: t.id, code: it.code, lane: it.lane, group: it.group, tone: 'hold', title: it.title,
      meta: it.town === null ? SAMPLE_META : `${t.plate} · ${dr.short_name} · ${place(it.town).town}`,
      opened_at: demo(it.at), evidence: null, target_record_key: null, phone: it.ref === 'SAMPLE' ? null : dr.phone });
    if (it.ref !== 'SAMPLE') lifted.set(t.id, lower(lifted.get(t.id) ?? 6, it.lane === 'NOW' ? 1 : 2));
  }
  // Ярошенко's ODOMETER_TYPED is derived from his record rather than stored as an item; it lifts his row all the same.
  const yaTruck = truck(YAROSHENKO.plate);
  lifted.set(yaTruck.id, lower(lifted.get(yaTruck.id) ?? 6, 2));

  /* the board at 16:05 */
  const now = minOf(AT);
  for (const b of DETAILED_BOARD) {
    const t = truck(b.plate);
    s.exampleBoard.create({ truck_id: t.id, driver_label: b.tabs.map((tab) => driver(tab).short_name).join(' + '),
      state: b.state, state_line: b.line, rank: lower(b.base, lifted.get(t.id) ?? 6),
      odometer: { value: b.odometer[0], source: b.odometer[1] }, contact_at: b.contact === null ? null : demo(b.contact),
      unsent_at_contact: b.unsent, at_stop_min: b.at_stop, on_shift: b.on_shift, not_started: null, simulated: t.has_can });
  }
  for (const g of gen) {
    const row = generatedRow(g, dice, place, ends.get(g.truck.id) ?? null);
    const contact = row.on_shift ? now - 1 - dice.int(9) : row.contact;
    if (contact !== null && gt(now - contact, TWO_HOURS)) {
      throw new Error(`seedFleet: ${g.truck.plate} would read «без зв'язку» at ${AT}; only АР 5577 ЕК does`);
    }
    s.exampleBoard.create({ truck_id: g.truck.id, driver_label: g.driver.short_name, state: row.state, state_line: row.line,
      rank: lower(row.base, lifted.get(g.truck.id) ?? 6),
      odometer: { value: g.odometer, source: g.rc ? 'CAN' : 'DASH_PHOTO' }, contact_at: contact === null ? null : at(contact),
      unsent_at_contact: 0, at_stop_min: row.at_stop, on_shift: row.on_shift, not_started: null, simulated: g.rc });
  }

  /* originals and the е-ТТН */
  for (const o of ORIGINALS) {
    s.ttnDocs.create({ no: o.no, label: o.label, date: asBusinessDate(o.date), trip_no: o.trip, driver_id: driver(o.tab).id,
      loading_stop_id: null, drop_stop_id: null, doc_index: 1, ttn_count: 1, fields: noFields(), ocr: noFields(),
      blank_reverse: false, original: null, driver_said_handed: o.handed === null ? null : asBusinessDate(o.handed),
      ettn: null, note: o.note, example: true });
  }
  s.ttnDocs.create({ no: ETTN.no, label: `ТТН ${ETTN.no}`, date: DEMO_DATE, trip_no: ETTN.trip,
    driver_id: must(firstConfirmed.driver_id ?? undefined, 'the е-ТТН driver'), loading_stop_id: null, drop_stop_id: null,
    doc_index: 1, ttn_count: 1, fields: noFields(), ocr: noFields(), blank_reverse: false, original: null,
    driver_said_handed: null, ettn: { ...ETTN.ettn }, note: null, example: true });

  seedYaroshenko(s, { driver: driver(YAROSHENKO.tab), truck: yaTruck, base: place('BASE').id,
    day: must(days.get(yaTruck.id), 'Ярошенко’s day') });
}

/** The 88 generated trucks with their trailers, drivers and September rows, in plate order. `names` draws the people,
 *  `dice` everything else, so a change to a number never renames a driver. */
function seedGenerated(s: Stores, have: { trucks: Truck[]; drivers: Driver[]; users: OfficeUser[]; trailers: Trailer[] },
  names: Stream, dice: Stream): Gen[] {
  const kinds = deal(GENERATED_STATES);
  const dispatchers = expand(DISPATCHERS);
  if (dispatchers.length !== kinds.length) throw new Error('seedFleet: the dispatcher table does not cover the fleet');
  const people = drawPeople(kinds.length, names, [
    ...have.drivers.map((d) => must(d.full_name.split(' ')[0], d.full_name)),
    ...have.users.map((u) => must(u.full_name.split(' ')[1], u.full_name))]);
  const plates = new Set([...have.trucks, ...have.trailers].map((t) => t.plate));
  const unique = (plate: string): string => {
    if (plates.has(plate)) throw new Error(`seedFleet: plate «${plate}» is already on the road`);
    plates.add(plate);
    return plate;
  };
  const counts = new Map<Kind, number>();
  let m = 0;
  let tm = 0;
  return kinds.map((kind, i) => {
    m = (m + 37) % 8999;
    tm = (tm + 41) % 4999;
    const n = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, n);
    const rc = (i + 1) % RC_EVERY === 0;
    const trailer = s.trailers.create({ ...must(BODIES[i % BODIES.length], 'a body'),
      plate: unique(`АР ${5000 + tm} ${must(TRAILER_SUFFIXES[i % TRAILER_SUFFIXES.length], 'a trailer suffix')}`) });
    const login = must(dispatchers[i], 'a dispatcher');
    const truck = s.trucks.create({ plate: unique(`АР ${1000 + m} ${must(SUFFIXES[i % SUFFIXES.length], 'a suffix')}`),
      model: dice.pick(MODELS), year: 2011 + dice.int(12),
      ...(rc ? { telematics: 'RUPTELA', has_can: true, has_tacho: true, has_fuel_sensor: true } as const
        : { telematics: 'REGIS', has_can: false, has_tacho: false, has_fuel_sensor: false } as const),
      norm_l_100: dice.pick(NORMS), norm_order: null, trailer_id: trailer.id,
      dispatcher_id: must(have.users.find((u) => u.login === login), login).id, pilot: false, example: true,
      status: kind === 'REPAIR' ? 'REPAIR' : 'ACTIVE', card_mask: `****${1000 + dice.int(9000)}`, paper: false,
      mechanic_reading: null });
    const { given, family } = must(people[i], 'a person');
    const initial = given.slice(0, 1);
    const driver = s.drivers.create({ full_name: `${family} ${given}`, short_name: `${family} ${initial}.`, first_name: given,
      initials: `${initial}${family.slice(0, 1)}`, tab_no: String(501 + i).padStart(4, '0'),
      phone: `+380 ${dice.pick(OPERATORS)} ${100 + dice.int(900)} ${pad(dice.int(100))} ${pad(dice.int(100))}`,
      mode: 'APP', pilot: false, example: true,
      hired_at: asBusinessDate(`${2012 + dice.int(14)}-${pad(1 + dice.int(12))}-${pad(1 + dice.int(28))}`), truck_id: truck.id });
    seedMonth(s, truck, rc, dice);
    return { truck, driver, kind, n, rc, odometer: 150000 + dice.int(550000) };
  });
}

/** `count` Ukrainian names from the corpus, skipping any family name the detailed seed already gives a person (no second
 *  «Ватаманюк П.» on the board) and any short name another generated driver already has. */
function drawPeople(count: number, names: Stream, takenFamilies: readonly string[]): { given: string; family: string }[] {
  const shorts = new Set<string>();
  const out: { given: string; family: string }[] = [];
  for (let draws = 0; out.length !== count; draws += 1) {
    if (draws === 10000) throw new Error('seedFleet: the corpus ran out of unused names');
    const [given, family] = names.person('uk').split(' ');
    if (given === undefined || family === undefined || takenFamilies.includes(family)) continue;
    const short = `${family} ${given.slice(0, 1)}.`;
    if (shorts.has(short)) continue;
    shorts.add(short);
    out.push({ given, family });
  }
  return out;
}

/** September 1–21 for one generated truck (D14: month-to-date), at or below +3,4 % against its norm. */
function seedMonth(s: Stores, truck: Truck, rc: boolean, dice: Stream): void {
  const norm = truck.norm_l_100;
  const days = 14 + dice.int(6);
  const km = 2800 + dice.int(1500);
  const share = 58 + dice.int(12);
  const rate = add(norm, dice.pick(RATE_DELTAS), 1);
  // (fact − norm) / norm × 100 to one place: the norm in tenths is a whole divisor, so the gap in tenths goes × 1 000.
  const deviation = div(mul(sub(rate, norm, 1), '1000', 1), toInt(norm.replace('.', '')), 1);
  const litres = div(mul(String(km), rate, 2), 100, 2);
  const km_loaded = toInt(div(mul(String(km), String(share), 0), 100, 0));
  const docs = toInt(mul(String(days), '4', 0));
  s.truckMonths.create({ truck_id: truck.id, month: '2026-09', days, km, km_loaded, fuel_rate: rate,
    fuel_method: rc ? 'CAN' : 'FULL_TO_FULL', deviation,
    fuel_uah: asDecimal2(div(mul(litres, String(DIESEL_PRICE_KOP), 2), 100, 2)), site_hours: 30 + dice.int(40),
    docs_on_time: `${docs - dice.int(4)} з ${docs}`, days_confirmed: `${days - dice.int(2)} з ${days}`,
    tkm: mul(String(km_loaded), `${20 + dice.int(5)}.${dice.int(10)}`, 1), loaded_share: String(share),
    trend: [add(rate, dice.pick(TREND_DELTAS), 1), add(rate, dice.pick(TREND_DELTAS), 1), rate], example: true });
}

/** A generated truck's board row at 16:05, before the example items lift its rank. */
function generatedRow(g: Gen, dice: Stream, place: (code: string) => Place, end: number | null): Row {
  const ruptela = (): string => `Ruptela · позиція ${1 + dice.int(4)} хв тому`;
  const moving: Omit<Row, 'state' | 'line'> = { base: 5, at_stop: null, on_shift: true, contact: null };
  switch (g.kind) {
    case 'LOADED': {
      const [code, km] = must(LOADED_TO[(g.n - 1) % LOADED_TO.length], 'a destination');
      const since = must(LOADED_MIN[g.n - 1], `LOADED #${g.n}'s departure`);
      return { ...moving, state: 'Їде завантажений',
        line: g.rc ? ruptela() : `${span(since)} · до ${place(code).town_gen} ${km} км` };
    }
    case 'EMPTY':
      return { ...moving, state: 'Їде порожній', line: g.rc ? ruptela() : 'до бази' };
    case 'QUEUE_DROP':
    case 'QUEUE_LOAD': {
      const min = must(QUEUE_MIN[g.kind]?.[g.n - 1], `${g.kind} #${g.n}'s queue`);
      return { ...moving, state: g.kind === 'QUEUE_DROP' ? 'У черзі на вивантаження' : 'У черзі на завантаження',
        line: `Черга · ${span(min)}`, base: gt(min, TWO_HOURS) ? 3 : 5, at_stop: min };
    }
    case 'LOADING':
      return { ...moving, state: 'Завантажується', line: span(10 + dice.int(40)) };
    case 'WAIT_DOC':
      return { ...moving, state: 'Вивантажено, чекає документ', line: '' };
    case 'REPAIR':
      return { state: 'Ремонт', line: 'СТО КТЛ', base: 6, at_stop: null, on_shift: false, contact: null };
    case 'NO_PLAN':
      return { state: 'Не на зміні', line: 'плану немає', base: 6, at_stop: null, on_shift: false, contact: null };
    case 'CLOSED': {
      const ended = must(end ?? undefined, `${g.truck.plate}'s end of shift`);
      return { state: 'Не на зміні', line: `закінчив ${hhmm(ended)}`, base: 6, at_stop: null, on_shift: false,
        contact: ended + 1 };
    }
  }
}

/** Ярошенко's two records on his phone and the dash photo under each. The phone's next_seq moves past both keys, so a
 *  flow on it can never reissue one (seed.test.ts «never lets a phone mint a key it already holds»). */
function seedYaroshenko(s: Stores, c: { driver: Driver; truck: Truck; base: string; day: TruckDay }): void {
  const phone = must(allRows(s.devices).find((d) => d.driver_id === c.driver.id && d.revoked_at === null), 'Ярошенко’s phone');
  const key = (seq: number): string => `${phone.id}:${seq}`;
  const dashPhoto = (seq: number, km: number, read: boolean, captured: Instant): string =>
    s.pages.create({ key: `${key(seq)}:p1`, record_key: key(seq), artefact: 'CLUSTER', doc_index: 1, page_no: 1,
      captured_at: captured, source: 'DRAWN', bytes: 700000, quality: 'OK', quality_reasons: [], deferred: null,
      drawn: { variant: `cluster:${km}`, value: String(km), sim_read: read ? String(km) : null }, image: null,
      received_at: addSeconds(captured, 40), superseded_by: null }).key;
  const common = { device_id: phone.id, driver_id: c.driver.id, truck_id: c.truck.id, shift_id: null, stop_id: null,
    place_id: c.base, gps: 'OK', voided_by: null, late: false } as const;

  const endAt = kyiv('2026-09-20 17:10');
  s.records.create({ ...common, key: key(1), seq: 1, truck_day_id: null, occurred_at: endAt, committed_at: endAt,
    app_clock_at: endAt, received_at: addSeconds(endAt, 20), flags: [], type: 'SHIFT_END',
    payload: { place_id: c.base, odometer: { value: YAROSHENKO.lastEnd, source: 'DASH_PHOTO', basis: 'PLANNED_KM',
      expected: YAROSHENKO.lastEnd, read: YAROSHENKO.lastEnd, choice: 'CONFIRMED',
      page_key: dashPhoto(1, YAROSHENKO.lastEnd, true, endAt) } } });

  // The photo reads 381 405 but the read failed; he typed 318 405, was warned, and kept it («водій залишив як є»).
  const startAt = demo('05:40');
  const saved = demo('05:41');
  s.records.create({ ...common, key: key(2), seq: 2, truck_day_id: c.day.id, occurred_at: startAt, committed_at: saved,
    app_clock_at: saved, received_at: addSeconds(saved, 20), flags: ['ODOMETER_TYPED'], type: 'SHIFT_START',
    payload: { truck_id: c.truck.id, trailer_id: c.truck.trailer_id, plan_match: true, inline: null,
      odometer: { value: YAROSHENKO.typed, source: 'DRIVER_TYPED', basis: 'LAST_AT_BASE', expected: YAROSHENKO.lastEnd,
        read: null, choice: 'KEPT_AS_IS', page_key: dashPhoto(2, YAROSHENKO.onDash, false, saved) } } });
  // Every record moved the day's version by one (W0-15's rule), as seed.ts does for the pilot's days.
  s.truckDays.update(c.day.id, { version: c.day.version + 1 });
  s.devices.update(phone.id, { next_seq: 3, last_contact_at: demo('15:21') });
}
