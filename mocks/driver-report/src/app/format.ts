// mocks/driver-report/src/app/format.ts
/** Every number, time and plural the client sees (§0.1, §6.12). Times are UTC instants rendered in Europe/Kyiv;
 *  decimals are strings rendered by string operations only — no Number(), no toFixed. */
import { intDiv, lt } from '../domain/num';

export const NBSP = ' ';
export const MINUS = '−';
const TZ = 'Europe/Kyiv';
const HM = new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DMY = new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const WD = new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, weekday: 'short' });
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A business date is noon in Kyiv, so no zone arithmetic can move it across midnight. */
const at = (v: string): Date => new Date(DATE_ONLY.test(v) ? `${v}T09:00:00.000Z` : v);
const parts = (v: string) => Object.fromEntries(DMY.formatToParts(at(v)).map((p) => [p.type, p.value])) as Record<string, string>;

/** «05:20» (Kyiv). */
export const fmtTime = (v: string): string => HM.format(at(v));
/** «21.09». */
export function fmtDayMonth(v: string): string { const p = parts(v); return `${p.day}.${p.month}`; }
/** «21.09.2026». */
export function fmtDate(v: string): string { const p = parts(v); return `${p.day}.${p.month}.${p.year}`; }
/** «21.09 08:57». */
export const fmtDateTime = (v: string): string => `${fmtDayMonth(v)} ${fmtTime(v)}`;
/** «21.09.26 08:57». */
export function fmtDateTimeYear(v: string): string { const p = parts(v); return `${p.day}.${p.month}.${(p.year ?? '').slice(2)} ${fmtTime(v)}`; }
/** «пн 21.09». */
export const fmtDay = (v: string): string => `${WD.format(at(v))} ${fmtDayMonth(v)}`;
/** today → «HH:MM»; this year → «dd.mm HH:MM»; else «dd.mm.yy HH:MM». `today` is the server's business date. */
export function fmtWhen(v: string, today: string): string {
  const p = parts(v);
  const day = `${p.year}-${p.month}-${p.day}`;
  if (day === today) return fmtTime(v);
  return p.year === today.slice(0, 4) ? fmtDateTime(v) : fmtDateTimeYear(v);
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}
function decimal(v: string): string {
  const negative = v.startsWith('-');
  const [whole = '0', frac] = (negative ? v.slice(1) : v).split('.');
  return `${negative ? MINUS : ''}${group(whole)}${frac === undefined ? '' : `,${frac}`}`;
}
/** «412 355» | «—». */
export const fmtKm = (km: number | null): string => (km === null ? '—' : decimal(String(km)));
/** «22 800,00» | «—» (any scale, string ops only). */
export const fmtDec = (v: string | null): string => (v === null ? '—' : decimal(v));
/** «31,8» | «—». */
export const fmtRate = fmtDec;
/** «12,000» · «24,4» | «—». */
export const fmtMass = fmtDec;
/** A stored tonnage as a WAYBILL prints it: «24.400» → «24,4», «12.000» → «12» | «—» (§4.2 C-08).
 *
 *  The scale belongs to the store and the tonnage to the document, so the trailing zeros come off HERE and not in a
 *  page: `LegRow.mass` is a Dec3, and every other number a screen shows arrives finished. String operations only —
 *  no coercion, no arithmetic — which is what keeps this legal in the layer that renders it. */
export function fmtTonnes(v: string | null): string {
  if (v === null) return '—';
  return fmtDec(v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v);
}
/** «−0,6 %» · «+5,9 %» · «0,0 %» | «—». */
export function fmtPct(v: string | null): string {
  if (v === null) return '—';
  const zero = /^-?0(\.0+)?$/.test(v);
  const sign = zero || v.startsWith('-') ? '' : '+';
  return `${sign}${decimal(zero ? v.replace('-', '') : v)}${NBSP}%`;
}
/** «10 год 42 хв» · «18 хв» · «2 год» · «0 хв». */
export function fmtDur(minutes: number): string {
  const h = intDiv(minutes, 60);
  const m = minutes % 60;
  if (h === 0) return `${m} хв`;
  return m === 0 ? `${h} год` : `${h} год ${m} хв`;
}
/** «1:38» · «0:18» (timers only). */
export function fmtTimer(minutes: number): string {
  const m = minutes % 60;
  return `${intDiv(minutes, 60)}:${String(m).padStart(2, '0')}`;
}
/** 0 → «щойно»; under an hour → «N хв»; else fmtDur. */
export function fmtAgo(minutes: number): string {
  if (minutes === 0) return 'щойно';
  return lt(minutes, 60) ? `${minutes} хв` : fmtDur(minutes);
}
/** «483920» → «483 920». */
export const fmtCode = (code: string): string => code.replace(/^(\d{3})(\d{3})$/, `$1${NBSP}$2`);
/** The form only: plural(58, ['день', 'дні', 'днів']) → «днів». */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const tens = n % 100;
  const ones = n % 10;
  if (ones === 1 && tens !== 11) return forms[0];
  if ([2, 3, 4].includes(ones) && ![12, 13, 14].includes(tens)) return forms[1];
  return forms[2];
}
/** «3 записи». */
export const pluralN = (n: number, forms: readonly [string, string, string]): string => `${n} ${plural(n, forms)}`;
/** 700000 → «0,7 МБ». */
export function fmtBytes(bytes: number): string {
  const tenths = intDiv(bytes + 50_000, 100_000);
  return `${intDiv(tenths, 10)},${tenths % 10} МБ`;
}
