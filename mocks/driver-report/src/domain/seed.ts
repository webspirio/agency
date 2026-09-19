// mocks/driver-report/src/domain/seed.ts
/**
 * The seed story of §7.6, written out by hand: people, the twelve detailed trucks (3 pilot + 9 fleet examples), the
 * places and the planned km of the library, the plans for 21.09, the pilot's history, Олег's telemetry (T-01 … T-11 of
 * §5.7), АР 8150 КС's fuel statement and the month figures. The 88 generated trucks and every example row are W0-22's
 * `populateFleet`, called last.
 *
 * Rows carry NATURAL keys only (plate, tab_no, login, code, no, plan_key). Every reference is resolved by reading back
 * the id the store assigned, in this creation order: officeUsers → rota → trailers → trucks → drivers → devices →
 * places → distances → trips → plannedStops → history (shifts, truckDays, records, pages, ttnDocs) → telemetry →
 * statements → truckMonths → driverMonths → populateFleet. So `device-000001` is Павло's phone because it is created
 * first, not because anything here writes that string.
 *
 * Nothing here draws a random number, multiplies, divides or compares: counts are tables and every hryvnia comes out of
 * @agency/dec at the example diesel price. Every place is in government-controlled territory (§8.6 #17).
 */
import { div, mul } from '@agency/dec';
import { asBusinessDate, asDecimal2, type Decimal2, type Instant } from '@agency/mock';
import type { Stores } from '../api/stores';
import { addSeconds, demo, kyiv } from './clock';
import { populateFleet } from './seedFleet';
import { ARTEFACT_KINDS, TTN_FIELDS, type ArtefactKind, type DriverMonth, type DriverRecord, type Odometer,
  type OdometerBasis, type OfficeRole, type Payloads, type Place, type PlannedStop, type RecordType, type TelemetryKind,
  type Trailer, type Truck, type TruckMonth, type TtnField, type TtnFieldValue } from './types';

/** 91,20 грн/л in kopecks — the example diesel price («приклад», §7.6). The office's litres for a receipt are
 *  `dec.div(dec.mul(sum_uah, '100'), DIESEL_PRICE_KOP)`: 22 800,00 → 250,00. */
export const DIESEL_PRICE_KOP = 9120;
/** Hryvnias for `litres` at the example price, exact to the kopeck. */
const uah = (litres: string): Decimal2 => asDecimal2(div(mul(litres, String(DIESEL_PRICE_KOP), 2), 100, 2));

/* ── the ТТН catalogue: what OCR «reads» off each printed front (the reverse side is handwritten, so null) ── */

const SHIPPER = 'ТОВ «Дніпро-Корм» · ЄДРПОУ 31785062';
const TO_ZLAGODA = 'ПП «Птахофабрика «Злагода» · ЄДРПОУ 40217710';
const TO_LAN = 'СВК «Лан» · ЄДРПОУ 03767412';
const TO_DOBROBUT = 'ТОВ «Свиноферма «Добробут» · ЄДРПОУ 35120846';
const TO_BERIZKA = 'ФГ «Молочна ферма «Берізка» · ЄДРПОУ 34097215';
function printedTtn(no: string, date: string, consignee: string, cargo: string, mass: string,
  compartments: string | null, seals: string): Record<TtnField, string | null> {
  return { no, date, shipper: SHIPPER, consignee, cargo, mass, compartments, seals, arrival: null, departure: null,
    gross: null, drop_arrival: null, drop_departure: null };
}
/** OCR suggestions per ТТН number; `newTtnDocs` (W0-07) and the drawn ТТН (W1-06) read it. */
export const TTN_CATALOGUE: Record<string, Record<TtnField, string | null>> = {
  '004488': printedTtn('004488', '18.09.2026', TO_BERIZKA, 'Комбікорм КК-60, навалом', '24,200', '1–6', 'ДК 0417902–0417907'),
  '004503': printedTtn('004503', '17.09.2026', TO_DOBROBUT, 'Комбікорм СК-26, навалом', '24,500', null, 'ДК 0418011–0418012'),
  '004517': printedTtn('004517', '21.09.2026', TO_ZLAGODA, 'Комбікорм ПК-1, навалом', '12,000', '1–3', 'ДК 0418321–0418323'),
  '004518': printedTtn('004518', '21.09.2026', TO_LAN, 'Комбікорм СК-26, навалом', '12,400', '4–6', 'ДК 0418324–0418326'),
  '004533': printedTtn('004533', '21.09.2026', TO_DOBROBUT, 'Комбікорм СК-26, навалом', '24,600', null, 'ДК 0418341–0418342'),
  '004655': printedTtn('004655', '21.09.2026', TO_ZLAGODA, 'Комбікорм ПК-1, навалом', '12,000', '1–4', 'ДК 0418371–0418374'),
  '004671': printedTtn('004671', '21.09.2026', TO_DOBROBUT, 'Комбікорм СК-26, навалом', '11,800', '1–4', 'ДК 0418391–0418394'),
};
const PRINTED_FIELDS: readonly TtnField[] = ['no', 'date', 'shipper', 'consignee', 'cargo', 'mass', 'compartments', 'seals'];

/* ── people ─────────────────────────────────────────────────────────────── */

const OFFICE: readonly { login: string; full_name: string; short_name: string; initials: string; role: OfficeRole;
  phone: string | null }[] = [
  { login: 'natalia', full_name: 'Наталія Шевчук', short_name: 'Н. Шевчук', initials: 'НШ', role: 'OPERATOR', phone: null },
  { login: 'iryna', full_name: 'Ірина Коваленко', short_name: 'І. Коваленко', initials: 'ІК', role: 'DISPATCHER',
    phone: '+380 67 214 55 08' },
  { login: 'oksana', full_name: 'Оксана Кравець', short_name: 'О. Кравець', initials: 'ОК', role: 'DISPATCHER', phone: null },
  { login: 'tetiana', full_name: 'Тетяна Мороз', short_name: 'Т. Мороз', initials: 'ТМ', role: 'DISPATCHER', phone: null },
  { login: 'dmytro', full_name: 'Дмитро Савчук', short_name: 'Д. Савчук', initials: 'ДС', role: 'ON_CALL',
    phone: '+380 50 318 22 41' },
  { login: 'liudmyla', full_name: 'Людмила Гончаренко', short_name: 'Л. Гончаренко', initials: 'ЛГ', role: 'ACCOUNTANT',
    phone: null },
  { login: 'mykola', full_name: 'Микола Руденко', short_name: 'М. Руденко', initials: 'МР', role: 'MECHANIC', phone: null },
];
const ROTA: readonly { login: string; from: string; to: string }[] = [
  { login: 'iryna', from: '06:00', to: '20:00' },
  { login: 'dmytro', from: '20:00', to: '06:00' },
];

/* ── the twelve detailed trucks (§7.6 table) ───────────────────────────── */

const TRAILERS: readonly Omit<Trailer, 'id'>[] = [
  { plate: 'АР 7781 ХР', body: 'PNEUMO', body_label: 'пневмобочка, 6 відсіків', compartments: 6, capacity_t: '25.000' },
  { plate: 'АР 4410 ХТ', body: 'TIPPER_TANK', body_label: 'кіперна бочка', compartments: 1, capacity_t: '25.000' },
  { plate: 'АР 1146 ХР', body: 'PNEUMO', body_label: 'пневмобочка, 4 відсіки', compartments: 4, capacity_t: '16.000' },
  { plate: 'АР 2290 ХС', body: 'TENT', body_label: 'тент', compartments: 1, capacity_t: '20.000' },
  { plate: 'АР 0917 ХТ', body: 'GRAIN_TIPPER', body_label: 'зерновоз, самоскид', compartments: 1, capacity_t: '26.000' },
  { plate: 'АР 3317 ХК', body: 'GRAIN_TIPPER', body_label: 'зерновоз', compartments: 1, capacity_t: '25.000' },
  { plate: 'АР 3095 ХР', body: 'TIPPER_TANK', body_label: 'кіперна бочка', compartments: 1, capacity_t: '25.000' },
  { plate: 'АР 5530 ХК', body: 'PNEUMO', body_label: 'пневмобочка, 5 відсіків', compartments: 5, capacity_t: '22.000' },
  { plate: 'АР 7702 ХТ', body: 'PNEUMO', body_label: 'пневмобочка, 6 відсіків', compartments: 6, capacity_t: '25.000' },
  { plate: 'АР 2208 ХР', body: 'PNEUMO', body_label: 'пневмобочка, 6 відсіків', compartments: 6, capacity_t: '25.000' },
  { plate: 'АР 6605 ХР', body: 'TIPPER_TANK', body_label: 'кіперна бочка', compartments: 1, capacity_t: '25.000' },
  { plate: 'АР 1882 ХТ', body: 'AUGER', body_label: 'шнекова бочка', compartments: 1, capacity_t: '24.000' },
];

/** «RG» — Регіс, positions only: no CAN, no tachograph data, no fuel sensor. */
const RG = { telematics: 'REGIS', has_can: false, has_tacho: false, has_fuel_sensor: false } as const;
/** «R+C» — Ruptela with CAN, the tachograph and a fuel-level sensor. */
const RC = { telematics: 'RUPTELA', has_can: true, has_tacho: true, has_fuel_sensor: true } as const;
type TruckSeed = Omit<Truck, 'id' | 'trailer_id' | 'dispatcher_id' | 'example' | 'norm_order'> & {
  trailer: string; dispatcher: string };
const truck = (plate: string, model: string, cls: typeof RG | typeof RC, norm: string, trailer: string, dispatcher: string,
  extra: Partial<TruckSeed> = {}): TruckSeed => ({ plate, model, year: null, ...cls, norm_l_100: norm, trailer, dispatcher,
  pilot: false, status: 'ACTIVE', card_mask: null, paper: false, mechanic_reading: null, ...extra });
const TRUCKS: readonly TruckSeed[] = [
  truck('АР 1234 ВС', 'Scania R450', RG, '32.0', 'АР 7781 ХР', 'iryna', { pilot: true, card_mask: '****4417' }),
  truck('АР 9012 МК', 'Scania R500', RC, '30.5', 'АР 4410 ХТ', 'iryna', { pilot: true, card_mask: '****6032' }),
  truck('АР 7390 ЕВ', 'Scania R420', RG, '31.5', 'АР 1146 ХР', 'iryna', { pilot: true, year: 2012,
    mechanic_reading: { value: 356118, at: kyiv('2026-09-18 16:00'), by_short: 'М. Руденко' } }),
  truck('АР 5577 ЕК', 'Scania S500', RC, '29.5', 'АР 2290 ХС', 'tetiana'),
  truck('АР 3344 НТ', 'Scania P360', RG, '31.0', 'АР 0917 ХТ', 'oksana'),
  truck('АР 5678 СЕ', 'Scania G410', RG, '30.5', 'АР 3317 ХК', 'tetiana', { status: 'REPAIR' }),
  truck('АР 6618 ЕС', 'Scania R440', RG, '31.5', 'АР 3095 ХР', 'oksana', { year: 2014, card_mask: '****5120' }),
  truck('АР 2745 ІВ', 'Scania R410', RG, '31.0', 'АР 5530 ХК', 'oksana'),
  truck('АР 8150 КС', 'Scania R500', RC, '32.0', 'АР 7702 ХТ', 'oksana', { year: 2021 }),
  truck('АР 3380 ТК', 'Scania R450', RG, '32.0', 'АР 2208 ХР', 'oksana'),
  truck('АР 4471 ВС', 'Scania R410', RG, '31.0', 'АР 6605 ХР', 'iryna'),
  truck('АР 0633 КХ', 'Scania P410', RG, '30.5', 'АР 1882 ХТ', 'tetiana', { paper: true }),
];

type DriverSeed = { tab_no: string; full_name: string; short_name: string; first_name: string; initials: string;
  phone: string | null; mode: 'APP' | 'PAPER'; pilot: boolean; hired_at: string; truck: string };
const driver = (tab_no: string, full_name: string, short_name: string, first_name: string, initials: string,
  phone: string | null, hired_at: string, truckPlate: string, extra: Partial<DriverSeed> = {}): DriverSeed =>
  ({ tab_no, full_name, short_name, first_name, initials, phone, mode: 'APP', pilot: false, hired_at, truck: truckPlate, ...extra });
const DRIVERS: readonly DriverSeed[] = [
  driver('0213', 'Ватаманюк Павло', 'Ватаманюк П.', 'Павло', 'ПВ', '+380 67 402 18 35', '2021-04-12', 'АР 1234 ВС', { pilot: true }),
  driver('0188', 'Кравчук Олег', 'Кравчук О.', 'Олег', 'ОК', '+380 50 734 61 29', '2018-03-05', 'АР 9012 МК', { pilot: true }),
  driver('0457', 'Савенко Григорій Петрович', 'Савенко Г.', 'Григорій', 'ГС', '+380 96 318 07 54', '2026-09-18', 'АР 7390 ЕВ',
    { pilot: true }),
  driver('0321', 'Гуменюк Петро', 'Гуменюк П.', 'Петро', 'ПГ', null, '2012-05-14', 'АР 0633 КХ', { mode: 'PAPER' }),
  driver('0162', 'Мельник Андрій', 'Мельник А.', 'Андрій', 'АМ', '+380 67 551 42 90', '2017-06-19', 'АР 5577 ЕК'),
  driver('0274', 'Гнатюк Тарас', 'Гнатюк Т.', 'Тарас', 'ТГ', '+380 98 207 13 66', '2020-02-03', 'АР 5577 ЕК'),
  driver('0309', 'Бондар Сергій', 'Бондар С.', 'Сергій', 'СБ', '+380 50 612 88 04', '2019-08-26', 'АР 3344 НТ'),
  driver('0145', 'Ткаченко Віктор', 'Ткаченко В.', 'Віктор', 'ВТ', '+380 67 390 25 71', '2016-10-10', 'АР 3344 НТ'),
  driver('0231', 'Ковальчук Володимир', 'Ковальчук В.', 'Володимир', 'ВК', '+380 95 144 60 38', '2015-04-06', 'АР 5678 СЕ'),
  driver('0298', 'Приходько Іван', 'Приходько І.', 'Іван', 'ІП', '+380 67 836 19 52', '2022-03-21', 'АР 6618 ЕС'),
  driver('0336', 'Ярошенко Руслан', 'Ярошенко Р.', 'Руслан', 'РЯ', '+380 50 271 94 17', '2020-11-09', 'АР 2745 ІВ'),
  driver('0117', 'Олійник Максим', 'Олійник М.', 'Максим', 'МО', '+380 97 463 58 20', '2021-07-05', 'АР 8150 КС'),
  driver('0352', 'Лисенко Богдан', 'Лисенко Б.', 'Богдан', 'БЛ', '+380 66 905 32 48', '2023-01-16', 'АР 3380 ТК'),
  driver('0268', 'Кушнір Василь', 'Кушнір В.', 'Василь', 'ВК', '+380 68 227 71 03', '2018-09-03', 'АР 4471 ВС'),
];

/** In THIS order, so the store assigns device-000001 … device-000009 exactly as §2.1's URLs name them. */
type DeviceSeed = { tab: string | null; label: string; os_label: string; bound: [string, string] | null;
  revoked: string | null; contact: string | null; next_seq: number; seen: boolean };
const DEVICES: readonly DeviceSeed[] = [
  { tab: '0213', label: 'Redmi 9A · Павло', os_label: 'Android 11 · Chrome', bound: ['2026-09-01 07:00', 'natalia'],
    revoked: null, contact: '2026-09-20 17:49', next_seq: 417, seen: true },
  { tab: '0188', label: 'Samsung A34 · Олег', os_label: 'Android 13 · Chrome', bound: ['2026-09-01 07:20', 'natalia'],
    revoked: null, contact: '2026-09-20 15:51', next_seq: 388, seen: true },
  { tab: null, label: 'Redmi 8', os_label: 'Android 10 · Chrome', bound: null, revoked: null, contact: null, next_seq: 1,
    seen: false },
  { tab: '0309', label: 'Redmi Note 10 · Сергій', os_label: 'Android 13 · Chrome', bound: ['2026-09-01 08:00', 'natalia'],
    revoked: null, contact: null, next_seq: 1, seen: true },
  { tab: '0298', label: 'Samsung A22 · Іван', os_label: 'Android 13 · Chrome', bound: ['2026-09-01 08:10', 'natalia'],
    revoked: null, contact: null, next_seq: 1, seen: true },
  { tab: '0336', label: 'Redmi 10 · Руслан', os_label: 'Android 12 · Chrome', bound: ['2026-09-01 08:20', 'natalia'],
    revoked: null, contact: null, next_seq: 1, seen: true },
  { tab: '0352', label: 'Samsung A14 · Богдан', os_label: 'Android 14 · Chrome', bound: ['2026-09-01 08:30', 'natalia'],
    revoked: null, contact: null, next_seq: 1, seen: true },
  { tab: '0268', label: 'Redmi 9C · Василь', os_label: 'Android 11 · Chrome', bound: ['2026-09-01 08:40', 'natalia'],
    revoked: null, contact: null, next_seq: 1, seen: true },
  // Павло's old phone, revoked before the pilot: the one device that meets DEVICE_REVOKED (§7.5). Never registered
  // under his tab number, so `ref('device', '0213')` is always the live phone.
  { tab: '0213', label: 'Samsung A10 · Павло', os_label: 'Android 9 · Chrome', bound: ['2026-08-28 09:00', 'natalia'],
    revoked: '2026-08-31 18:00', contact: '2026-08-31 17:40', next_seq: 23, seen: false },
];

/* ── places and the planned km of the library ──────────────────────────── */

const place = (p: Pick<Place, 'code' | 'name' | 'short' | 'label' | 'label_gen' | 'town' | 'town_gen' | 'kind'>
  & Partial<Omit<Place, 'id'>>): Omit<Place, 'id'> => ({ edrpou: null, no_photos: false, weigh_ticket: false,
  curfew: null, radius_m: 300, near_code: null, near_km: null, ...p });
const PLACES: readonly Omit<Place, 'id'>[] = [
  place({ code: 'BASE', name: 'База КТЛ, Запоріжжя', short: 'База', label: 'База', label_gen: 'Бази', town: 'Запоріжжя',
    town_gen: 'Запоріжжя', kind: 'BASE', curfew: { from: '00:00', to: '05:00' }, radius_m: 250 }),
  place({ code: 'DK', name: 'Комбікормовий завод «Дніпро-Корм», Вільнянськ', short: 'Дніпро-Корм, Вільнянськ',
    label: 'Дніпро-Корм', label_gen: 'Дніпро-Корму', town: 'Вільнянськ', town_gen: 'Вільнянська', kind: 'LOADING',
    edrpou: '31785062', radius_m: 400 }),
  place({ code: 'DK2', name: '«Дніпро-Корм», склад №2', short: 'Дніпро-Корм, склад №2', label: 'Дніпро-Корм, склад №2',
    label_gen: 'Дніпро-Корму, склад №2', town: 'Вільнянськ', town_gen: 'Вільнянська', kind: 'LOADING',
    edrpou: '31785062', near_code: 'DK', near_km: 2 }),
  place({ code: 'OKKO', name: 'АЗС ОККО, траса Н-08, Вільнянськ', short: 'ОККО Н-08', label: 'ОККО Н-08',
    label_gen: 'ОККО Н-08', town: 'Вільнянськ', town_gen: 'Вільнянська', kind: 'REFUEL', radius_m: 150 }),
  place({ code: 'WOG', name: 'АЗС WOG, Синельникове', short: 'WOG Синельникове', label: 'WOG Синельникове',
    label_gen: 'WOG Синельникове', town: 'Синельникове', town_gen: 'Синельникове', kind: 'REFUEL', radius_m: 150 }),
  place({ code: 'ZLAGODA', name: 'Птахофабрика «Злагода», Синельникове', short: 'Злагода, Синельникове', label: 'Злагода',
    label_gen: 'Злагоди', town: 'Синельникове', town_gen: 'Синельникове', kind: 'DROP', edrpou: '40217710', radius_m: 400 }),
  place({ code: 'LAN', name: 'Свинокомплекс «Лан», с. Балабине', short: 'Лан, Балабине', label: 'Лан', label_gen: 'Лану',
    town: 'Балабине', town_gen: 'Балабиного', kind: 'DROP', edrpou: '03767412', no_photos: true,
    curfew: { from: '21:00', to: '06:00' }, radius_m: 500 }),
  place({ code: 'DOBROBUT', name: 'Свиноферма «Добробут», Павлоград', short: 'Добробут, Павлоград', label: 'Добробут',
    label_gen: 'Добробуту', town: 'Павлоград', town_gen: 'Павлограда', kind: 'DROP', edrpou: '35120846', radius_m: 400 }),
  place({ code: 'BERIZKA', name: 'Молочна ферма «Берізка», Підгородне', short: 'Берізка, Підгородне', label: 'Берізка',
    label_gen: 'Берізки', town: 'Підгородне', town_gen: 'Підгородного', kind: 'DROP', edrpou: '34097215' }),
  place({ code: 'HAVAN', name: 'Елеватор «Хлібна Гавань», с. Роздори', short: 'Хлібна Гавань, Роздори',
    label: 'Хлібна Гавань', label_gen: 'Хлібної Гавані', town: 'Роздори', town_gen: 'Роздорів', kind: 'DROP',
    weigh_ticket: true, radius_m: 400 }),
  place({ code: 'STEP', name: 'ФГ «Степ», тік біля смт Славгород', short: 'ФГ «Степ», Славгород', label: 'ФГ «Степ»',
    label_gen: 'ФГ «Степ»', town: 'Славгород', town_gen: 'Славгорода', kind: 'LOADING' }),
  place({ code: 'KOLOS', name: 'Агрофірма «Колос», с. Кушугум', short: 'Колос, Кушугум', label: 'Колос',
    label_gen: 'Колосу', town: 'Кушугум', town_gen: 'Кушугума', kind: 'DROP', curfew: { from: '21:00', to: '06:00' },
    radius_m: 400 }),
  place({ code: 'LUBOML', name: 'Стоянка очікування біля Любомля', short: 'Стоянка біля Любомля',
    label: 'Стоянка біля Любомля', label_gen: 'Стоянки біля Любомля', town: 'Любомль', town_gen: 'Любомля',
    kind: 'BORDER', radius_m: 800 }),
];
/** The library's planned km. ZLAGODA → BASE exists so Григорій's return has a plan km. */
const DISTANCES: readonly (readonly [string, string, number])[] = [
  ['BASE', 'DK', 36], ['DK', 'OKKO', 7], ['OKKO', 'ZLAGODA', 52], ['DK', 'ZLAGODA', 52], ['ZLAGODA', 'LAN', 116],
  ['LAN', 'BASE', 23], ['DK', 'DOBROBUT', 98], ['DOBROBUT', 'WOG', 47], ['WOG', 'BASE', 99], ['DOBROBUT', 'BASE', 118],
  ['ZLAGODA', 'BASE', 75],
];

/* ── plans: 21.09 («план з BAS 20.09 17:40»), then the two history trips the ТТН of the history refer to ── */

type TripSeed = { no: string; tab: string; truck: string; trailer: string; date: string; imported: string;
  start: Instant | null };
const TRIPS: readonly TripSeed[] = [
  { no: 'Р-26-3312', tab: '0213', truck: 'АР 1234 ВС', trailer: 'АР 7781 ХР', date: '2026-09-21', imported: '2026-09-20 17:40',
    start: demo('05:30') },
  { no: 'Р-26-3313', tab: '0188', truck: 'АР 9012 МК', trailer: 'АР 4410 ХТ', date: '2026-09-21', imported: '2026-09-20 17:40',
    start: demo('07:30') },
  { no: 'Р-26-3314', tab: '0457', truck: 'АР 7390 ЕВ', trailer: 'АР 1146 ХР', date: '2026-09-21', imported: '2026-09-20 17:40',
    start: demo('05:30') },
  { no: 'Р-26-3317', tab: '0457', truck: 'АР 7390 ЕВ', trailer: 'АР 1146 ХР', date: '2026-09-21', imported: '2026-09-20 17:40',
    start: null },
  // History: no planned start, so no «зміни немає» rule can ever read a past plan as today's.
  { no: 'Р-26-3261', tab: '0188', truck: 'АР 9012 МК', trailer: 'АР 4410 ХТ', date: '2026-09-17', imported: '2026-09-16 17:40',
    start: null },
  { no: 'Р-26-3284', tab: '0213', truck: 'АР 1234 ВС', trailer: 'АР 7781 ХР', date: '2026-09-18', imported: '2026-09-17 17:40',
    start: null },
];
type StopSeed = { plan_key: string; trip: string; seq: number; place: string; kind: PlannedStop['kind']; ttn_nos: string[];
  drop: readonly [number, number] | null; compartments: string | null; cargo: string | null; mass: string | null;
  accepted: readonly [string, string] | null };
const stop = (plan_key: string, trip: string, seq: number, placeCode: string, kind: PlannedStop['kind'],
  ttn_nos: string[], extra: Partial<StopSeed> = {}): StopSeed => ({ plan_key, trip, seq, place: placeCode, kind, ttn_nos,
  drop: null, compartments: null, cargo: null, mass: null, accepted: null, ...extra });
const STOPS: readonly StopSeed[] = [
  stop('3312-1', 'Р-26-3312', 1, 'DK', 'LOADING', ['004517', '004518'], { mass: '24.400' }),
  stop('3312-2', 'Р-26-3312', 2, 'ZLAGODA', 'DROP', ['004517'], { drop: [1, 2], compartments: '1–3',
    cargo: 'Комбікорм ПК-1', mass: '12.000' }),
  stop('3312-3', 'Р-26-3312', 3, 'LAN', 'DROP', ['004518'], { drop: [2, 2], compartments: '4–6',
    cargo: 'Комбікорм СК-26', mass: '12.400' }),
  stop('3312-4', 'Р-26-3312', 4, 'BASE', 'BASE', []),
  stop('3313-1', 'Р-26-3313', 1, 'DK', 'LOADING', ['004533'], { mass: '24.600' }),
  stop('3313-2', 'Р-26-3313', 2, 'DOBROBUT', 'DROP', ['004533'], { drop: [1, 1], cargo: 'Комбікорм СК-26', mass: '24.600' }),
  stop('3313-3', 'Р-26-3313', 3, 'BASE', 'BASE', []),
  stop('3314-1', 'Р-26-3314', 1, 'DK', 'LOADING', ['004655'], { mass: '12.000' }),
  stop('3314-2', 'Р-26-3314', 2, 'ZLAGODA', 'DROP', ['004655'], { drop: [1, 1], cargo: 'Комбікорм ПК-1', mass: '12.000' }),
  stop('3317-1', 'Р-26-3317', 1, 'DK', 'LOADING', ['004671'], { mass: '11.800' }),
  stop('3317-2', 'Р-26-3317', 2, 'DOBROBUT', 'DROP', ['004671'], { drop: [1, 1], cargo: 'Комбікорм СК-26', mass: '11.800' }),
  stop('3317-3', 'Р-26-3317', 3, 'BASE', 'BASE', []),
  stop('3261-1', 'Р-26-3261', 1, 'DK', 'LOADING', ['004503'], { mass: '24.500', accepted: ['2026-09-17 09:10', 'natalia'] }),
  stop('3261-2', 'Р-26-3261', 2, 'DOBROBUT', 'DROP', ['004503'], { drop: [1, 1], cargo: 'Комбікорм СК-26', mass: '24.500',
    accepted: ['2026-09-17 13:30', 'natalia'] }),
  stop('3261-3', 'Р-26-3261', 3, 'BASE', 'BASE', []),
  stop('3284-1', 'Р-26-3284', 1, 'DK', 'LOADING', ['004488'], { mass: '24.200', accepted: ['2026-09-18 09:30', 'natalia'] }),
  stop('3284-2', 'Р-26-3284', 2, 'BERIZKA', 'DROP', ['004488'], { drop: [1, 1], compartments: '1–6',
    cargo: 'Комбікорм КК-60', mass: '24.200', accepted: ['2026-09-18 14:15', 'natalia'] }),
  stop('3284-3', 'Р-26-3284', 3, 'BASE', 'BASE', []),
];

/* ── history: the pilot's confirmed days, as records the derivations read ─ */

type PageSeed = { artefact: ArtefactKind; doc_index: number; page_no: number; variant: string; value: string | null };
type RecSeed = { seq: number; hm: string; type: RecordType; payload: unknown; plan_key: string | null;
  place_code: string | null; pages: PageSeed[] };
type DayCtx = { shift_id: string; truck_id: string; trailer_id: string; base: string; page: (seq: number, n: number) => string };
type DaySeed = { tab: string; plate: string; date: string; waybill: string; shift: readonly [string, string, string];
  confirmed: string; printed: string | null; signed: string | null; records: (c: DayCtx) => RecSeed[] };

const rec = <T extends RecordType>(type: T, seq: number, hm: string, payload: Payloads[T],
  o: { plan_key?: string; place_code?: string; pages?: PageSeed[] } = {}): RecSeed =>
  ({ seq, hm, type, payload, plan_key: o.plan_key ?? null, place_code: o.place_code ?? null, pages: o.pages ?? [] });
const photo = (value: number, basis: OdometerBasis, page_key: string | null): Odometer =>
  ({ value, source: 'DASH_PHOTO', basis, expected: value, read: value, choice: 'CONFIRMED', page_key });
const can = (value: number): Odometer =>
  ({ value, source: 'CAN', basis: 'CAN_DELTA', expected: value, read: null, choice: 'AUTO', page_key: null });
const cluster = (km: number): PageSeed =>
  ({ artefact: 'CLUSTER', doc_index: 1, page_no: 1, variant: `cluster:${km}`, value: String(km) });
const ttnPages = (no: string): PageSeed[] => [
  { artefact: 'TTN_FRONT', doc_index: 1, page_no: 1, variant: `ttn-${no}-front`, value: null },
  { artefact: 'TTN_BACK', doc_index: 1, page_no: 2, variant: `ttn-${no}-back`, value: null }];
const signedPage = (no: string): PageSeed =>
  ({ artefact: 'TTN_SIGNED', doc_index: 1, page_no: 1, variant: `ttn-${no}-signed`, value: null });
const receiptPage = (brand: string, no: string): PageSeed =>
  ({ artefact: 'RECEIPT', doc_index: 1, page_no: 1, variant: `receipt-${brand}-${no}`, value: null });
const arrived = (odometer: Odometer): Payloads['ARRIVED'] =>
  ({ order: 'PLANNED', claimed_at: null, chip: 'QUEUE', odometer, unplanned_kind: null, new_place: false });
const start = (c: DayCtx, odometer: Odometer): Payloads['SHIFT_START'] =>
  ({ truck_id: c.truck_id, trailer_id: c.trailer_id, plan_match: true, odometer, inline: null });

const PAVLO_DAYS: readonly DaySeed[] = [
  // Tue 15.09: the full fill at 411 012 that opens the 15.09 → 18.09 full-to-full window.
  { tab: '0213', plate: 'АР 1234 ВС', date: '2026-09-15', waybill: 'ПЛ-000384', shift: ['05:30', '16:45', '16:46'],
    confirmed: '2026-09-15 17:05', printed: '2026-09-15 17:06', signed: '2026-09-15 17:15', records: (c) => [
      rec('SHIFT_START', 360, '05:30', start(c, photo(410790, 'LAST_AT_BASE', c.page(360, 1))),
        { place_code: 'BASE', pages: [cluster(410790)] }),
      rec('REFUEL', 361, '15:50', { station: 'ОККО Н-08', receipt_no: '56118', rro_no: '3000211458', sum_uah: uah('210.00'),
        card_mask: '****4417', full_tank: true, odometer: photo(411012, 'PLANNED_KM', c.page(361, 2)), deferred: false },
      { place_code: 'OKKO', pages: [receiptPage('okko', '56118'), cluster(411012)] }),
      rec('SHIFT_END', 362, '16:45', { odometer: photo(411055, 'PLANNED_KM', c.page(362, 1)), place_id: c.base },
        { place_code: 'BASE', pages: [cluster(411055)] }),
      rec('DRIVER_ATTESTED', 363, '16:46', { shift_id: c.shift_id, km: 265, documents: 4 }),
    ] },
  // Fri 18.09, ПЛ-000398 (beat 0): 411 413 → 411 625 = 212 km, 98 loaded; the full fill at 411 612 closes
  // 15.09 → 18.09 at 193,80 л / 600 km = 32,3 л/100.
  { tab: '0213', plate: 'АР 1234 ВС', date: '2026-09-18', waybill: 'ПЛ-000398', shift: ['05:25', '16:58', '16:59'],
    confirmed: '2026-09-18 17:05', printed: '2026-09-18 17:06', signed: '2026-09-18 17:10', records: (c) => [
      rec('SHIFT_START', 403, '05:25', start(c, photo(411413, 'LAST_AT_BASE', c.page(403, 1))),
        { place_code: 'BASE', pages: [cluster(411413)] }),
      rec('ARRIVED', 404, '06:05', arrived(photo(411449, 'PLANNED_KM', c.page(404, 1))),
        { plan_key: '3284-1', pages: [cluster(411449)] }),
      rec('LOADED', 405, '09:10', { ttn_count: 1, pages: [c.page(405, 1), c.page(405, 2)], no_doc_reason: null,
        deferred: null }, { plan_key: '3284-1', pages: ttnPages('004488') }),
      rec('ARRIVED', 406, '11:40', arrived(photo(411547, 'PLANNED_KM', c.page(406, 1))),
        { plan_key: '3284-2', pages: [cluster(411547)] }),
      rec('UNLOADED', 407, '13:55', { drop_index: 1, pages: [c.page(407, 1)], deferred: null, no_doc_reason: null },
        { plan_key: '3284-2', pages: [signedPage('004488')] }),
      rec('REFUEL', 408, '16:40', { station: 'ОККО Запоріжжя', receipt_no: '57264', rro_no: '3000209871',
        sum_uah: uah('193.80'), card_mask: '****4417', full_tank: true,
        odometer: photo(411612, 'PLANNED_KM', c.page(408, 2)), deferred: false },
      { pages: [receiptPage('okko', '57264'), cluster(411612)] }),
      rec('SHIFT_END', 409, '16:58', { odometer: photo(411625, 'PLANNED_KM', c.page(409, 1)), place_id: c.base },
        { place_code: 'BASE', pages: [cluster(411625)] }),
      rec('DRIVER_ATTESTED', 410, '16:59', { shift_id: c.shift_id, km: 212, documents: 3 }),
    ] },
  // Sat 19.09, ПЛ-000403: 411 625 → 411 990.
  { tab: '0213', plate: 'АР 1234 ВС', date: '2026-09-19', waybill: 'ПЛ-000403', shift: ['05:40', '17:15', '17:16'],
    confirmed: '2026-09-19 17:35', printed: '2026-09-19 17:36', signed: '2026-09-19 17:50', records: (c) => [
      rec('SHIFT_START', 411, '05:40', start(c, photo(411625, 'LAST_AT_BASE', c.page(411, 1))),
        { place_code: 'BASE', pages: [cluster(411625)] }),
      rec('SHIFT_END', 412, '17:15', { odometer: photo(411990, 'PLANNED_KM', c.page(412, 1)), place_id: c.base },
        { place_code: 'BASE', pages: [cluster(411990)] }),
      rec('DRIVER_ATTESTED', 413, '17:16', { shift_id: c.shift_id, km: 365, documents: 4 }),
    ] },
  // Sun 20.09, ПЛ-000409: ends at base on 412 355 at 17:48 — the «вчора о 17:48 на базі» of beat 2. Confirmed and
  // printed; he signs it on Monday.
  { tab: '0213', plate: 'АР 1234 ВС', date: '2026-09-20', waybill: 'ПЛ-000409', shift: ['06:05', '17:48', '17:49'],
    confirmed: '2026-09-20 18:05', printed: '2026-09-20 18:06', signed: null, records: (c) => [
      rec('SHIFT_START', 414, '06:05', start(c, photo(411990, 'LAST_AT_BASE', c.page(414, 1))),
        { place_code: 'BASE', pages: [cluster(411990)] }),
      rec('SHIFT_END', 415, '17:48', { odometer: photo(412355, 'PLANNED_KM', c.page(415, 1)), place_id: c.base },
        { place_code: 'BASE', pages: [cluster(412355)] }),
      rec('DRIVER_ATTESTED', 416, '17:49', { shift_id: c.shift_id, km: 365, documents: 4 }),
    ] },
];
/** Олег's Sunday, ПЛ-000410 — confirmed and exported, so the pilot series continues at ПЛ-000411. CAN 241 476 at base
 *  is where S-07 starts him on Monday. */
const OLEH_DAY: DaySeed = { tab: '0188', plate: 'АР 9012 МК', date: '2026-09-20', waybill: 'ПЛ-000410',
  shift: ['06:30', '15:50', '15:51'], confirmed: '2026-09-20 18:10', printed: '2026-09-20 18:11', signed: null,
  records: (c) => [
    rec('SHIFT_START', 385, '06:30', start(c, can(241180)), { place_code: 'BASE' }),
    rec('SHIFT_END', 386, '15:50', { odometer: can(241476), place_id: c.base }, { place_code: 'BASE' }),
    rec('DRIVER_ATTESTED', 387, '15:51', { shift_id: c.shift_id, km: 296, documents: 4 }),
  ] };

/** Pilot exports, each already imported into BAS («exported»), so no history day waits in «В BAS». */
const EXPORTS: readonly { date: string; at: string; days: readonly (readonly [string, string])[] }[] = [
  { date: '2026-09-15', at: '2026-09-16 07:30', days: [['АР 1234 ВС', '2026-09-15']] },
  { date: '2026-09-18', at: '2026-09-19 07:30', days: [['АР 1234 ВС', '2026-09-18']] },
  { date: '2026-09-19', at: '2026-09-19 18:20', days: [['АР 1234 ВС', '2026-09-19']] },
  { date: '2026-09-20', at: '2026-09-20 18:30', days: [['АР 1234 ВС', '2026-09-20'], ['АР 9012 МК', '2026-09-20']] },
];

type TtnSeed = { no: string; date: string; trip: string; tab: string; loading: string; drop: string;
  printed: string; typed: readonly (readonly [TtnField, string, string])[]; original: readonly [string, string] | null };
const TTN_DOCS: readonly TtnSeed[] = [
  // Олег's ТТН of 17.09 («Добробут»): the photo is in the office, the original is not — 4 days on 21.09 (C-14).
  { no: '004503', date: '2026-09-17', trip: 'Р-26-3261', tab: '0188', loading: '3261-1', drop: '3261-2',
    printed: '2026-09-17 09:05', typed: [['arrival', '06:48', '2026-09-17 09:06'], ['departure', '07:55', '2026-09-17 09:06'],
      ['drop_arrival', '10:20', '2026-09-17 13:25'], ['drop_departure', '11:40', '2026-09-17 13:25']], original: null },
  // Павло's ТТН of 18.09, signed 1 з 1, original handed in at the window 17:10.
  { no: '004488', date: '2026-09-18', trip: 'Р-26-3284', tab: '0213', loading: '3284-1', drop: '3284-2',
    printed: '2026-09-18 09:25', typed: [['arrival', '06:12', '2026-09-18 09:26'], ['departure', '09:05', '2026-09-18 09:26'],
      ['drop_arrival', '11:45', '2026-09-18 14:10'], ['drop_departure', '13:50', '2026-09-18 14:10']],
    original: ['2026-09-18 17:10', 'natalia'] },
];

/* ── Олег's telemetry: T-01 … T-11 of §5.7, time-gated by the derivations (never shown before `at`) ── */

const TELEMETRY: readonly { hm: string; kind: TelemetryKind; place: string | null; can_km?: number; litres?: string;
  minutes?: number; until?: string }[] = [
  { hm: '07:22', kind: 'CARD_IN', place: 'BASE' },                                      // T-01
  { hm: '07:30', kind: 'OUT', place: 'BASE' },                                          // T-02
  { hm: '08:05', kind: 'IN', place: 'DK', can_km: 241512 },                             // T-03
  { hm: '08:55', kind: 'OUT', place: 'DK' },                                            // T-04
  { hm: '10:35', kind: 'IN', place: 'DOBROBUT', can_km: 241610 },                       // T-05
  { hm: '11:15', kind: 'OUT', place: 'DOBROBUT' },                                      // T-06
  { hm: '12:01', kind: 'REFUEL', place: 'WOG', can_km: 241657, litres: '196.00' },      // T-07 (ДУТ)
  { hm: '13:03', kind: 'MOTION', place: null },                                         // T-08 closes S-29 «за рухом»
  { hm: '13:05', kind: 'BREAK', place: null, minutes: 45, until: '13:50' },             // T-09
  { hm: '15:02', kind: 'IN', place: 'BASE', can_km: 241756 },                           // T-10
  // T-11. `litres` is the day's CAN fuel as Ruptela reports it with the card out — the R+C cell of §4.2 C-08 («86,2 л» ·
  // «норма 85,4 л · +0,8 л (+0,9 %)»). An office figure: views/driver.ts keeps it off the phone.
  { hm: '15:06', kind: 'CARD_OUT', place: 'BASE', litres: '86.20' },
];

/* ── АР 8150 КС's ОККО statement, 1–21.09: 12 transactions, 1 245,00 л, 113 544,00 грн ── */

/** [Kyiv time, station, litres, matched]. The one unmatched line is the D14 mismatch dated 18.09. */
const STATEMENT_8150: readonly (readonly [string, string, string, boolean])[] = [
  ['2026-09-01 06:48', 'ОККО Н-08', '95.00', true], ['2026-09-02 17:20', 'ОККО Павлоград', '88.50', true],
  ['2026-09-04 07:05', 'ОККО Н-08', '92.00', true], ['2026-09-05 16:42', 'ОККО Запоріжжя', '97.50', true],
  ['2026-09-08 06:55', 'ОККО Н-08', '85.00', true], ['2026-09-09 18:10', 'ОККО Павлоград', '90.00', true],
  ['2026-09-11 07:12', 'ОККО Н-08', '96.00', true], ['2026-09-12 15:34', 'ОККО Запоріжжя', '91.00', true],
  ['2026-09-15 06:58', 'ОККО Н-08', '93.50', true], ['2026-09-16 17:46', 'ОККО Павлоград', '94.00', true],
  ['2026-09-18 11:52', 'ОККО Н-08', '230.00', false], ['2026-09-19 16:20', 'ОККО Запоріжжя', '92.50', true],
];

/* ── month figures, September 1–21 (D14: month-to-date) ─────────────────── */

type MonthSeed = Omit<TruckMonth, 'id' | 'truck_id' | 'month' | 'example' | 'fuel_uah'> & { plate: string; fuel_uah: string };
const month = (plate: string, days: number, km: number, km_loaded: number, fuel_rate: string,
  fuel_method: TruckMonth['fuel_method'], deviation: string, fuel_uah: string, site_hours: number, docs_on_time: string,
  days_confirmed: string, tkm: string, loaded_share: string, trend: string[]): MonthSeed =>
  ({ plate, days, km, km_loaded, fuel_rate, fuel_method, deviation, fuel_uah, site_hours, docs_on_time, days_confirmed,
    tkm, loaded_share, trend });
/** АР 8150 КС is the one truck beyond the 5 % tolerance (+5,9 %); every other detailed truck is at or below +3,4 %. */
const TRUCK_MONTHS: readonly MonthSeed[] = [
  month('АР 1234 ВС', 17, 3812, 2640, '31.8', 'FULL_TO_FULL', '-0.6', '110554.10', 61, '64 з 66', '16 з 17', '63888.0', '69',
    ['32.1', '31.5', '31.8']),
  month('АР 9012 МК', 16, 3395, 2310, '31.1', 'CAN', '2.0', '96293.06', 38, '58 з 60', '15 з 16', '56595.0', '68',
    ['30.8', '31.4', '31.1']),
  month('АР 7390 ЕВ', 13, 2410, 1650, '31.9', 'FULL_TO_FULL', '1.3', '70113.65', 40, '44 з 46', '12 з 13', '39600.0', '68',
    ['31.6', '32.2', '31.9']),
  month('АР 5577 ЕК', 20, 5180, 4410, '29.8', 'CAN', '1.0', '140779.97', 48, '40 з 42', '14 з 20', '88200.0', '85',
    ['29.6', '30.1', '29.8']),
  month('АР 3344 НТ', 19, 3920, 2550, '31.6', 'FULL_TO_FULL', '1.9', '112971.26', 70, '71 з 74', '18 з 19', '63750.0', '65',
    ['31.2', '31.9', '31.6']),
  month('АР 5678 СЕ', 11, 2240, 1480, '30.2', 'FULL_TO_FULL', '-1.0', '61694.98', 35, '40 з 42', '11 з 11', '37000.0', '66',
    ['30.4', '30.0', '30.2']),
  month('АР 6618 ЕС', 18, 3610, 2380, '32.5', 'FULL_TO_FULL', '3.2', '107000.40', 58, '63 з 66', '17 з 18', '57120.0', '66',
    ['32.2', '32.8', '32.5']),
  month('АР 2745 ІВ', 18, 3480, 2300, '31.4', 'FULL_TO_FULL', '1.3', '99656.06', 55, '64 з 66', '17 з 18', '50600.0', '66',
    ['31.1', '31.7', '31.4']),
  month('АР 8150 КС', 16, 3540, 2903, '33.9', 'CAN', '5.9', '113544.00', 44, '58 з 58', '16 з 16', '69960.0', '82',
    ['33.6', '34.2', '33.9']),
  month('АР 3380 ТК', 18, 3700, 2480, '33.1', 'FULL_TO_FULL', '3.4', '111692.64', 57, '65 з 68', '17 з 18', '59520.0', '67',
    ['32.8', '33.5', '33.1']),
  month('АР 4471 ВС', 19, 3890, 2610, '30.7', 'FULL_TO_FULL', '-1.0', '108913.78', 62, '70 з 72', '18 з 19', '62640.0', '67',
    ['30.9', '30.5', '30.7']),
  month('АР 0633 КХ', 17, 3350, 2200, '30.9', 'FULL_TO_FULL', '1.3', '94405.68', 52, '—', '16 з 17', '52800.0', '66',
    ['31.0', '30.7', '30.9']),
];

const REGIS_TACHO = 'не звірено (Регіс) — завантажте файли тахографа (не рідше ніж раз на 28 днів)';
const ROSTER = 'потрібен графік змінності';
/** [date, minutes on shift, documents in the office, documents in all] — the shift days before 21.09. */
type DaySums = readonly (readonly [string, number, number, number])[];
/** Павло: 16 shifts 01–20.09; with 21.09 (642 min, 5 з 5) they make 17 змін · 11 160 min · 64 з 66. */
const PAVLO_MONTH_DAYS: DaySums = [
  ['2026-09-01', 652, 4, 4], ['2026-09-02', 640, 4, 4], ['2026-09-03', 628, 3, 3], ['2026-09-04', 661, 3, 4],
  ['2026-09-05', 634, 4, 4], ['2026-09-07', 655, 4, 4], ['2026-09-08', 643, 4, 4], ['2026-09-09', 650, 3, 3],
  ['2026-09-11', 637, 3, 4], ['2026-09-12', 659, 4, 4], ['2026-09-14', 646, 4, 4], ['2026-09-15', 675, 4, 4],
  ['2026-09-17', 647, 4, 4], ['2026-09-18', 693, 3, 3], ['2026-09-19', 695, 4, 4], ['2026-09-20', 703, 4, 4],
];
/** Олег: 15 shifts 01–20.09; with 21.09 (463 min, 3 з 3) they make 16 змін · 8 520 min · 58 з 60. */
const OLEH_MONTH_DAYS: DaySums = [
  ['2026-09-01', 541, 4, 4], ['2026-09-02', 528, 4, 4], ['2026-09-03', 536, 3, 4], ['2026-09-04', 547, 4, 4],
  ['2026-09-05', 522, 3, 3], ['2026-09-08', 539, 4, 4], ['2026-09-09', 530, 4, 4], ['2026-09-10', 544, 4, 4],
  ['2026-09-11', 526, 3, 4], ['2026-09-12', 538, 3, 3], ['2026-09-15', 533, 4, 4], ['2026-09-16', 542, 4, 4],
  ['2026-09-17', 535, 4, 4], ['2026-09-18', 536, 3, 3], ['2026-09-20', 560, 4, 4],
];
type DriverMonthSeed = Omit<DriverMonth, 'id' | 'driver_id' | 'month' | 'days'> & { tab: string; days: DaySums };
const DRIVER_MONTHS: readonly DriverMonthSeed[] = [
  { tab: '0213', shifts: 17, on_shift_min: 11160, on_site_min: 3660, night_min: 540, docs_accepted: 64, docs_total: 66,
    originals_accepted: 30, originals_total: 32, tacho_label: REGIS_TACHO, diff_label: '—', curfew_heat_label: '—',
    weekend_label: ROSTER, simulated: false, example: false, days: PAVLO_MONTH_DAYS },
  { tab: '0188', shifts: 16, on_shift_min: 8520, on_site_min: 2280, night_min: 240, docs_accepted: 58, docs_total: 60,
    originals_accepted: 29, originals_total: 30, tacho_label: '139 год 20 хв (Ruptela)', diff_label: '+2 год 40 хв',
    curfew_heat_label: '—', weekend_label: ROSTER, simulated: true, example: false, days: OLEH_MONTH_DAYS },
  // Григорій's first shift is today: the row reads «на зміні».
  { tab: '0457', shifts: 1, on_shift_min: 0, on_site_min: 0, night_min: 0, docs_accepted: 0, docs_total: 0,
    originals_accepted: 0, originals_total: 0, tacho_label: 'не звірено (Регіс)', diff_label: '—', curfew_heat_label: '—',
    weekend_label: ROSTER, simulated: false, example: false, days: [] },
  { tab: '0145', shifts: 19, on_shift_min: 12840, on_site_min: 4260, night_min: 7080, docs_accepted: 70, docs_total: 72,
    originals_accepted: 36, originals_total: 38, tacho_label: 'не звірено (Регіс)', diff_label: '—',
    curfew_heat_label: 'комендантська 31 год — не в робочому часі (налаштування КТЛ)', weekend_label: ROSTER,
    simulated: false, example: true, days: [] },
];

/* ── populate ─────────────────────────────────────────────────────────── */

/** Natural key → the id its store assigned. A missing key is a bug in this file, so it throws. */
function registry(): { set: (ns: string, key: string, id: string) => void; id: (ns: string, key: string) => string } {
  const ids = new Map<string, string>();
  return {
    set: (ns, key, id) => { ids.set(`${ns}:${key}`, id); },
    id: (ns, key) => {
      const v = ids.get(`${ns}:${key}`);
      if (v === undefined) throw new Error(`seed: no ${ns} «${key}»`);
      return v;
    },
  };
}
type Refs = ReturnType<typeof registry>;
function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`seed: ${what} is missing`);
  return v;
}

export function populate(s: Stores): void {
  const r = registry();
  const user = (login: string): string => r.id('user', login);

  for (const u of OFFICE) r.set('user', u.login, s.officeUsers.create(u).id);
  for (const slot of ROTA) s.rota.create({ user_id: user(slot.login), from: slot.from, to: slot.to });
  for (const t of TRAILERS) r.set('trailer', t.plate, s.trailers.create(t).id);
  for (const { trailer, dispatcher, ...t } of TRUCKS) {
    r.set('truck', t.plate, s.trucks.create({ ...t, trailer_id: r.id('trailer', trailer), dispatcher_id: user(dispatcher),
      example: !t.pilot, norm_order: null }).id);
  }
  for (const { truck: plate, hired_at, ...d } of DRIVERS) {
    r.set('driver', d.tab_no, s.drivers.create({ ...d, example: !d.pilot, hired_at: asBusinessDate(hired_at),
      truck_id: r.id('truck', plate) }).id);
  }
  for (const d of DEVICES) {
    const row = s.devices.create({ driver_id: d.tab === null ? null : r.id('driver', d.tab), label: d.label,
      os_label: d.os_label, bound_at: d.bound ? kyiv(d.bound[0]) : null, bound_by: d.bound ? user(d.bound[1]) : null,
      revoked_at: d.revoked === null ? null : kyiv(d.revoked), last_contact_at: d.contact === null ? null : kyiv(d.contact),
      unsent_at_contact: 0, next_seq: d.next_seq, seen_examples: d.seen ? [...ARTEFACT_KINDS] : [],
      office_sees_read: d.seen });
    if (d.tab !== null && d.revoked === null) r.set('device', d.tab, row.id);
  }
  for (const p of PLACES) r.set('place', p.code, s.places.create(p).id);
  for (const [from_code, to_code, km] of DISTANCES) s.distances.create({ from_code, to_code, km });
  for (const t of TRIPS) {
    r.set('trip', t.no, s.trips.create({ no: t.no, truck_id: r.id('truck', t.truck), trailer_id: r.id('trailer', t.trailer),
      driver_id: r.id('driver', t.tab), date: asBusinessDate(t.date), source: 'BAS_FILE', imported_at: kyiv(t.imported),
      example: false, planned_start: t.start }).id);
  }
  for (const p of STOPS) {
    const counted = p.kind === 'LOADING' || p.kind === 'DROP';
    r.set('stop', p.plan_key, s.plannedStops.create({ plan_key: p.plan_key, trip_id: r.id('trip', p.trip), seq: p.seq,
      place_id: r.id('place', p.place), kind: p.kind, ttn_expected: counted ? p.ttn_nos.length : 0, ttn_nos: p.ttn_nos,
      drop_index: p.drop ? p.drop[0] : null, drop_count: p.drop ? p.drop[1] : null, compartments: p.compartments,
      cargo: p.cargo, mass_t: p.mass, unplanned_kind: null, accepted_at: p.accepted ? kyiv(p.accepted[0]) : null,
      accepted_by: p.accepted ? user(p.accepted[1]) : null }).id);
  }

  seedHistory(s, r);

  const oleh = r.id('truck', 'АР 9012 МК');
  for (const t of TELEMETRY) {
    s.telemetry.create({ truck_id: oleh, at: demo(t.hm), kind: t.kind, place_id: t.place === null ? null : r.id('place', t.place),
      can_km: t.can_km ?? null, litres: t.litres === undefined ? null : asDecimal2(t.litres), minutes: t.minutes ?? null,
      until: t.until === undefined ? null : demo(t.until) });
  }
  const olijnyk = r.id('truck', 'АР 8150 КС');
  STATEMENT_8150.forEach(([at, station, litres, matched], i) => {
    s.statements.create({ truck_id: olijnyk, at: kyiv(at), station, litres: asDecimal2(litres), sum_uah: uah(litres),
      matched_record_key: matched ? `example:8150:${String(i + 1).padStart(2, '0')}` : null });
  });
  for (const { plate, fuel_uah, ...m } of TRUCK_MONTHS) {
    const truckId = r.id('truck', plate);
    s.truckMonths.create({ ...m, truck_id: truckId, month: '2026-09', fuel_uah: asDecimal2(fuel_uah),
      example: !must(s.trucks.get(truckId), plate).pilot });
  }
  for (const { tab, days, ...m } of DRIVER_MONTHS) {
    s.driverMonths.create({ ...m, driver_id: r.id('driver', tab), month: '2026-09',
      days: days.map(([date, on_shift_min, docs_in_office, docs_total]) =>
        ({ date: asBusinessDate(date), on_shift_min, docs_in_office, docs_total })) });
  }

  populateFleet(s);
}

function seedHistory(s: Stores, r: Refs): void {
  const dayIds = new Map<string, string>();
  for (const d of [...PAVLO_DAYS, OLEH_DAY]) dayIds.set(`${d.plate} ${d.date}`, seedDay(s, r, d));

  for (const t of TTN_DOCS) {
    const ocr = must(TTN_CATALOGUE[t.no], `ТТН ${t.no} in the catalogue`);
    const by = r.id('user', 'natalia');
    const typed = new Map(t.typed.map(([field, value, at]) => [field, { value, at }]));
    const fields = Object.fromEntries(TTN_FIELDS.map((field): [TtnField, TtnFieldValue | null] => {
      const read = ocr[field];
      const hand = typed.get(field);
      if (PRINTED_FIELDS.includes(field) && read !== null) return [field, { value: read, source: 'OCR', by, at: kyiv(t.printed) }];
      if (hand) return [field, { value: hand.value, source: 'OFFICE_TYPED', by, at: kyiv(hand.at) }];
      return [field, null];
    })) as Record<TtnField, TtnFieldValue | null>;
    s.ttnDocs.create({ no: t.no, label: `ТТН ${t.no}`, date: asBusinessDate(t.date), trip_no: t.trip,
      driver_id: r.id('driver', t.tab), loading_stop_id: r.id('stop', t.loading), drop_stop_id: r.id('stop', t.drop),
      doc_index: 1, ttn_count: 1, fields, ocr: { ...ocr }, blank_reverse: false,
      original: t.original ? { received_at: kyiv(t.original[0]), received_by: r.id('user', t.original[1]) } : null,
      driver_said_handed: null, ettn: null, note: null, example: false });
  }

  for (const e of EXPORTS) {
    const ids = e.days.map(([plate, date]) => must(dayIds.get(`${plate} ${date}`), `${plate} ${date}`));
    const at = kyiv(e.at);
    const file = `КТЛ-подорожні-${e.date.slice(8, 10)}.${e.date.slice(5, 7)}.${e.date.slice(0, 4)}.csv`;
    const row = s.exports.create({ date: asBusinessDate(e.date), scope: 'PILOT', sheet: 'WAYBILLS', format: 'CSV',
      created_at: at, by: r.id('user', 'natalia'), day_ids: ids, file_name: file,
      import: { at, created: ids.length, updated: 0, unchanged: 0, corrections: [] } });
    for (const id of ids) {
      const day = must(s.truckDays.get(id), id);
      s.truckDays.update(id, { exported: { export_id: row.id, at, version: day.version } });
    }
  }
}

/** One confirmed pilot day: its truck-day, its shift, its records and their pages. Returns the truck-day id. */
function seedDay(s: Stores, r: Refs, d: DaySeed): string {
  const truck = must(s.trucks.get(r.id('truck', d.plate)), d.plate);
  const driver_id = r.id('driver', d.tab);
  const device_id = r.id('device', d.tab);
  const at = (hm: string): Instant => kyiv(`${d.date} ${hm}`);
  const day = s.truckDays.create({ truck_id: truck.id, driver_id, date: asBusinessDate(d.date), version: 1,
    status: 'CONFIRMED', waybill_no: d.waybill, confirmed_by: r.id('user', 'natalia'), confirmed_at: kyiv(d.confirmed),
    confirm_reason: null, printed_at: d.printed === null ? null : kyiv(d.printed),
    signed_at: d.signed === null ? null : kyiv(d.signed), exported: null, example: false, figures: null });
  const [from, to, attested] = d.shift;
  const shift = s.shifts.create({ driver_id, device_id, truck_id: truck.id, trailer_id: truck.trailer_id,
    truck_day_id: day.id, started_at: at(from), ended_at: at(to), attested_at: at(attested), closed_by: 'DRIVER',
    start_key: null });
  const key = (seq: number): string => `${device_id}:${seq}`;
  const records = d.records({ shift_id: shift.id, truck_id: truck.id, trailer_id: truck.trailer_id,
    base: r.id('place', 'BASE'), page: (seq, n) => `${key(seq)}:p${n}` });

  for (const x of records) {
    const occurred = at(x.hm);
    const stopRow = x.plan_key === null ? null : must(s.plannedStops.get(r.id('stop', x.plan_key)), x.plan_key);
    const place_id = stopRow ? stopRow.place_id : x.place_code === null ? null : r.id('place', x.place_code);
    if (x.type === 'SHIFT_START') s.shifts.update(shift.id, { start_key: key(x.seq) });
    s.records.create({ key: key(x.seq), seq: x.seq, device_id, driver_id, truck_id: truck.id, shift_id: shift.id,
      truck_day_id: day.id, occurred_at: occurred, committed_at: occurred, app_clock_at: occurred,
      received_at: addSeconds(occurred, 20), stop_id: stopRow ? stopRow.id : null, place_id, gps: 'OK', flags: [],
      voided_by: null, late: false, type: x.type, payload: x.payload } as Omit<DriverRecord, 'id'>);
    x.pages.forEach((p, i) => {
      s.pages.create({ key: `${key(x.seq)}:p${i + 1}`, record_key: key(x.seq), artefact: p.artefact, doc_index: p.doc_index,
        page_no: p.page_no, captured_at: occurred, source: 'DRAWN', bytes: 700000, quality: 'OK', quality_reasons: [],
        deferred: null, drawn: { variant: p.variant, value: p.value, sim_read: p.value }, image: null,
        received_at: addSeconds(occurred, 40), superseded_by: null });
    });
  }
  // Every record moved the day's version by one (W0-15's rule); the export stamps the version it carried.
  s.truckDays.update(day.id, { version: records.length + 1 });
  return day.id;
}
