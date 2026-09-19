// mocks/driver-report/src/components/artefacts/catalogue.ts
/**
 * What each §6.11 variant IS: which drawing to make, and the paper that drawing carries.
 *
 * A variant string is a base name and, after colons, the cluster's digits and any modifier —
 * `cluster:412391`, `cluster:412391:glare`, `ttn-004518-back:soft`. Nothing else in this kit parses one; every
 * component receives finished strings and draws them.
 *
 * The printed half of a ТТН is NOT written here: it is read from `TTN_CATALOGUE` in `src/domain/seed.ts`, the same
 * table the office's OCR suggestions come from, so a ТТН the mock talks about and the ТТН the driver photographs
 * cannot say different things. Only what the catalogue lacks — the vehicle, the trailer, the carrier, the driver, the
 * two points and the handwriting — lives here, as the paper's own data, and `artefacts.test.tsx` pins every one of
 * those six against the seed's own trucks, trailers, drivers and places rather than against this file.
 *
 * The cluster's dash clock is read the same way, from `SCRIPT`: the hour on the panel is the hour the script takes
 * that photograph, so a deferred 15:16 щиток does not open in the office reading 08:57.
 *
 * A variant nobody knows draws a BLANK form rather than throwing: a blank ТТН on screen is loud, and an exception
 * during the demo is louder than the mistake it reports.
 */
import { fmtTime } from '../../app/format';
import { SCRIPT } from '../../domain/script';
import { TTN_CATALOGUE } from '../../domain/seed';
import type { ArtefactKind } from '../../domain/types';

/* ── the variant string ─────────────────────────────────────────────────── */

/** A parsed variant: the base name, the cluster's digits, and the three modifiers §6.11 defines. */
export type Variant = { base: string; digits: string | null; glare: boolean; dark: boolean; soft: boolean };

const ONLY_DIGITS = /^\d+$/;

export function parseVariant(variant: string): Variant {
  const [base = '', ...flags] = variant.split(':');
  return {
    base,
    digits: flags.find((flag) => ONLY_DIGITS.test(flag)) ?? null,
    glare: flags.includes('glare'),
    dark: flags.includes('dark'),
    soft: flags.includes('soft'),
  };
}

/** The kind is derived from the base NAME, so a ТТН number this file has never seen still has the right frame guide
 *  and the right «Ось так» example. Every `ttn-…` page that is neither a back nor a signed copy is a front. */
function kindOfBase(base: string): ArtefactKind {
  if (base === 'cluster') return 'CLUSTER';
  if (base.startsWith('receipt-')) return 'RECEIPT';
  if (base.startsWith('weigh-ticket')) return 'WEIGH_TICKET';
  if (base.startsWith('act-')) return 'ACT';
  if (base.endsWith('-back')) return 'TTN_BACK';
  if (base.endsWith('-signed')) return 'TTN_SIGNED';
  return 'TTN_FRONT';
}

/* ── the papers ─────────────────────────────────────────────────────────── */

/** The printed half of a ТТН, as `TTN_CATALOGUE` holds it. */
export type TtnPrint = { no: string; date: string; shipper: string; consignee: string; cargo: string; mass: string;
  compartments: string | null; seals: string };

/** Everything on a ТТН that the OCR catalogue does not carry. */
export type TtnPaper = {
  carrier: string; vehicle: string; trailer: string; driver: string; loading: string; unloading: string;
  /** the back page's one handwritten row (§6.11); `null` for a ТТН whose reverse nobody drew. */
  ops: { gross: string; arrival: string; departure: string; idle: string } | null;
  /** the примірник 3 acceptance block: who signed, and the time they wrote in. */
  received: { by: string; at: string };
};

export type ReceiptPaper = { label: string; brand: string; station: string; rro: string | null; no: string;
  item: string; pay: string; sum: string; vat: string | null; at: string; qr: string };

export type TicketPaper = { label: string; title: string; owner: string; at: string; plates: string;
  rows: readonly (readonly [string, string])[]; scales: string };

export type ActPaper = { label: string; title: string; at: string; place: string;
  rows: readonly (readonly [string, string])[]; note: string; hand: string };

/** Ballpoint paths, drawn once and reused: a signature is a shape, not a character. */
export const SIGNATURE = {
  driver: 'M0 0c2.4-4.4 4.1-1.3 5.6 1 1.1 1.7 2.2 1.5 3.2-1.2 1.2-3.3 2.6-3.1 3.9.4 1 2 2.1 2 3.6-.3 1.3-2.2 2.8-2 4.5.8',
  keeper: 'M0 1.2c1.8-3.7 3.4-3.3 4.4.3.6 2.3 1.6 2.6 2.8.9 1.6-2.2 3.2-1.5 4.2 1 .7 2 1.9 2.1 3.3.4 1.2-1.5 2.5-1.2 3.7.6',
  short: 'M0 0.8c1.5-2.8 2.9-2.4 3.7.4.6 2 1.6 2.1 2.7.3 1-1.6 2.2-1.2 3.1.6',
} as const;

const CARRIER = 'ТОВ «КОРМО-ТРАНС-ЛОГІСТИК», 37380270';
const LOADING_POINT = 'м. Вільнянськ, вул. Заводська, 3';
/** Р-26-3312's loading at «Дніпро-Корм» — the gross the weigh ticket of the same morning prints (39 080 кг). */
const LOADING_3312 = { gross: '39,1', arrival: '07:48', departure: '08:40', idle: '—' };
const ZLAGODA_KEEPER = 'завідувач складу, Мельничук О.';
/** The other two consignees have no named keeper anywhere in the seed, so their copy carries the ROLE and a
 *  signature — which is what most of these sheets carry in life — rather than a person this mock invented. */
const KEEPER = 'комірник';

const PAVLO = { vehicle: 'Scania R450, АР 1234 ВС', trailer: 'АР 7781 ХР', driver: 'Ватаманюк П.' };
const OLEH = { vehicle: 'Scania R500, АР 9012 МК', trailer: 'АР 4410 ХТ', driver: 'Кравчук О.' };
const HRYHORII = { vehicle: 'Scania R420, АР 7390 ЕВ', trailer: 'АР 1146 ХР', driver: 'Савенко Г.' };

/** Keyed by ТТН number. `received.at` is the hour the warehouse wrote on the sheet — for 004517 it is §6.11's own
 *  «10:30»; the others are minutes ahead of the driver's photo in §5.7.
 *
 *  Six of these fields are the seed's, copied here because `TTN_CATALOGUE` holds only what OCR reads off the printed
 *  front: the vehicle, the trailer, the driver and the two towns. `artefacts.test.tsx` pins all four against the
 *  seed's own trucks, trailers, drivers and places for every number below, so renaming a truck in `seed.ts` goes red
 *  there instead of printing the old plate on a drawn ТТН. */
export const TTN_PAPERS: Record<string, TtnPaper> = {
  '004517': { ...PAVLO, carrier: CARRIER, loading: LOADING_POINT, unloading: 'м. Синельникове',
    ops: LOADING_3312, received: { by: ZLAGODA_KEEPER, at: '10:30' } },
  '004518': { ...PAVLO, carrier: CARRIER, loading: LOADING_POINT, unloading: 'с. Балабине',
    ops: LOADING_3312, received: { by: KEEPER, at: '15:05' } },
  '004533': { ...OLEH, carrier: CARRIER, loading: LOADING_POINT, unloading: 'м. Павлоград',
    ops: null, received: { by: KEEPER, at: '11:00' } },
  '004655': { ...HRYHORII, carrier: CARRIER, loading: LOADING_POINT, unloading: 'м. Синельникове',
    ops: null, received: { by: ZLAGODA_KEEPER, at: '10:15' } },
  '004671': { ...HRYHORII, carrier: CARRIER, loading: LOADING_POINT, unloading: 'м. Павлоград',
    ops: null, received: { by: KEEPER, at: '15:00' } },
};

const BLANK_PAPER: TtnPaper = { carrier: CARRIER, vehicle: '', trailer: '', driver: '', loading: '', unloading: '',
  ops: null, received: { by: KEEPER, at: '' } };

const RECEIPTS: Record<string, ReceiptPaper> = {
  'receipt-okko-58213': {
    label: 'Чек ОККО № 58213', brand: 'ТОВ «ОККО-Драйв»', station: 'АЗС траса Н-08, Вільнянськ',
    rro: 'ФН РРО 3000211458', no: 'ЧЕК № 58213', item: 'ДП Євро5 250,00 л × 91,20 = 22 800,00',
    pay: 'БЕЗГОТІВКОВА · Картка ****4417', sum: 'СУМА 22 800,00 ГРН', vat: 'ПДВ 20 % 3 800,00',
    at: '21.09.2026 08:57', qr: 'okko.ua/f/3000211458/58213',
  },
  'receipt-wog-30744': {
    label: 'Чек WOG № 30744', brand: 'WOG', station: 'АЗС Синельникове', rro: null, no: 'ЧЕК № 30744',
    item: 'ДП 200,00 л × 91,20 = 18 240,00', pay: 'Картка ****6032', sum: 'СУМА 18 240,00 ГРН', vat: null,
    at: '21.09.2026 12:01', qr: 'wog.ua/f/30744',
  },
};

const TICKETS: Record<string, TicketPaper> = {
  'weigh-ticket-3317': {
    label: 'Ваговий талон № 3317', title: 'ВАГОВИЙ ТАЛОН № 3317', owner: 'ТОВ «Дніпро-Корм»',
    at: '21.09.2026 08:31', plates: 'АР 1234 ВС / АР 7781 ХР',
    rows: [['Брутто', '39 080 кг'], ['Тара', '14 680 кг'], ['Нетто', '24 400 кг']],
    scales: 'Ваги ВТ-60, клас III',
  },
};

const ACTS: Record<string, ActPaper> = {
  'act-214': {
    label: 'Акт № 214', title: 'АКТ № 214 про розбіжність', at: '16.09.2026', place: 'Елеватор «Хлібна Гавань»',
    rows: [['Відвантажено за ТТН', '24,200 т'], ['Прийнято фактично', '23,980 т'], ['Розбіжність', '−0,220 т']],
    note: 'Особливі відмітки:', hand: 'Не згоден',
  },
};

/* ── the plan: one variant → one component and its props ────────────────── */

export type ArtefactPlan =
  | { kind: 'CLUSTER'; component: 'ClusterArt'; props: { digits: string; glare: boolean; dark: boolean; time: string } }
  | { kind: 'TTN_FRONT'; component: 'TtnFront'; props: { paper: TtnPaper; print: TtnPrint; label: string } }
  | { kind: 'TTN_BACK'; component: 'TtnBack'; props: { paper: TtnPaper; print: TtnPrint; label: string; soft: boolean } }
  | { kind: 'TTN_SIGNED'; component: 'TtnSigned'; props: { paper: TtnPaper; print: TtnPrint; label: string } }
  | { kind: 'RECEIPT'; component: 'ReceiptArt'; props: { receipt: ReceiptPaper } }
  | { kind: 'WEIGH_TICKET'; component: 'WeighTicket'; props: { ticket: TicketPaper } }
  | { kind: 'ACT'; component: 'ActArt'; props: { act: ActPaper } };

/** «412355» — the odometer §6.11 draws when a cluster variant carries no digits of its own. */
const CLUSTER_DIGITS = '412355';
/** §6.11's own display, for a cluster no script photographs (a retake, a fixture, an invented variant). */
const CLUSTER_CLOCK = '08:57';
const UNKNOWN_LABEL = 'Документ (імітація)';

/** Odometer digits → the hour SCRIPT takes that photograph, built once from the script's own `PageTemplate.at`
 *  (§5.7). Keyed by the DIGITS rather than the whole variant, so `cluster:412391:glare` is still S-06's 06:10; the
 *  first page wins, because a second photograph of the same reading is the same minute of the same day. */
const CLUSTER_CLOCKS: ReadonlyMap<string, string> = (() => {
  const clocks = new Map<string, string>();
  const pages = SCRIPT.flatMap((entry) => (entry.step.kind === 'record' ? entry.step.records : []))
    .flatMap((record) => record.pages)
    .filter((page) => page.artefact === 'CLUSTER');
  for (const page of pages) {
    const digits = parseVariant(page.variant).digits ?? '';
    if (digits !== '' && !clocks.has(digits)) clocks.set(digits, fmtTime(page.at));
  }
  return clocks;
})();

/** The number inside `ttn-004517-front`. A base that is not a ТТН at all has none, and draws a blank form. */
function ttnNoOf(base: string): string {
  return base.startsWith('ttn-') ? base.split('-')[1] ?? '' : '';
}

function printOf(no: string): TtnPrint {
  const row = TTN_CATALOGUE[no];
  const text = (field: 'date' | 'shipper' | 'consignee' | 'cargo' | 'mass' | 'seals'): string => row?.[field] ?? '';
  return { no, date: text('date'), shipper: text('shipper'), consignee: text('consignee'), cargo: text('cargo'),
    mass: text('mass'), compartments: row?.compartments ?? null, seals: text('seals') };
}

function paperOf(no: string): TtnPaper {
  return TTN_PAPERS[no] ?? BLANK_PAPER;
}

function ttnLabel(no: string, side: string): string {
  return no === '' ? UNKNOWN_LABEL : `ТТН ${no}, ${side}`;
}

/** The one lookup: a variant string and the page's own value (the odometer a cluster photo was taken at) become the
 *  component to draw and everything it needs. Nothing else in this kit decides what a variant means. */
export function planFor(variant: string, value: string | null): ArtefactPlan {
  const v = parseVariant(variant);
  const kind = kindOfBase(v.base);
  if (kind === 'CLUSTER') {
    // The clock follows the VARIANT (which photograph this is), never `value` (what the office later read off it).
    return { kind, component: 'ClusterArt',
      props: { digits: value ?? v.digits ?? CLUSTER_DIGITS, glare: v.glare, dark: v.dark,
        time: CLUSTER_CLOCKS.get(v.digits ?? '') ?? CLUSTER_CLOCK } };
  }
  if (kind === 'RECEIPT') {
    const receipt = RECEIPTS[v.base];
    return { kind, component: 'ReceiptArt', props: { receipt: receipt ?? blankReceipt(v.base) } };
  }
  if (kind === 'WEIGH_TICKET') {
    const ticket = TICKETS[v.base];
    return { kind, component: 'WeighTicket', props: { ticket: ticket ?? blankTicket() } };
  }
  if (kind === 'ACT') {
    const act = ACTS[v.base];
    return { kind, component: 'ActArt', props: { act: act ?? blankAct() } };
  }
  const no = ttnNoOf(v.base);
  const print = printOf(no);
  const paper = paperOf(no);
  if (kind === 'TTN_BACK') {
    return { kind, component: 'TtnBack', props: { paper, print, label: ttnLabel(no, 'зворотний бік'), soft: v.soft } };
  }
  if (kind === 'TTN_SIGNED') {
    return { kind, component: 'TtnSigned', props: { paper, print, label: ttnLabel(no, 'примірник 3') } };
  }
  return { kind, component: 'TtnFront', props: { paper, print, label: ttnLabel(no, 'лицьовий бік') } };
}

/** I-15: the artefact kind of a variant, read off the same plan the drawing is made from — so the frame guide, the
 *  «Ось так» example and the picture on screen can never disagree about what the driver is photographing. */
export function artefactKindOf(variant: string): ArtefactKind {
  return planFor(variant, null).kind;
}

function blankReceipt(base: string): ReceiptPaper {
  return { label: UNKNOWN_LABEL, brand: '', station: '', rro: null, no: base, item: '', pay: '', sum: '', vat: null,
    at: '', qr: base };
}

function blankTicket(): TicketPaper {
  return { label: UNKNOWN_LABEL, title: 'ВАГОВИЙ ТАЛОН', owner: '', at: '', plates: '', rows: [], scales: '' };
}

function blankAct(): ActPaper {
  return { label: UNKNOWN_LABEL, title: 'АКТ', at: '', place: '', rows: [], note: 'Особливі відмітки:', hand: '' };
}
