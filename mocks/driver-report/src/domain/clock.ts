// mocks/driver-report/src/domain/clock.ts
/** Every instant in the mock is a UTC ISO string; every wall time is authored in Kyiv and converted ONCE, here
 *  (§5.8, §7.1). Nothing reads the process time zone: each conversion goes through an Intl formatter pinned to
 *  Europe/Kyiv, so the suite gives the same answers under TZ=UTC and TZ=Europe/Warsaw. */
import { asBusinessDate, asInstant, type BusinessDate, type Instant } from '@agency/mock';
import { intDiv, lt, toInt } from './num';

export const DEMO_DATE: BusinessDate = asBusinessDate('2026-09-21');
const TZ = 'Europe/Kyiv';
const PARTS = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function wall(ms: number): { stamp: string; y: string; mo: string; d: string; h: string; mi: string; s: string; wd: string } {
  const p = Object.fromEntries(PARTS.formatToParts(new Date(ms)).map((x) => [x.type, x.value])) as Record<string, string>;
  const h = p.hour === '24' ? '00' : (p.hour ?? '00');
  return { stamp: `${p.year}-${p.month}-${p.day} ${h}:${p.minute}:${p.second}`, y: p.year ?? '', mo: p.month ?? '',
    d: p.day ?? '', h, mi: p.minute ?? '', s: p.second ?? '', wd: p.weekday ?? 'Sun' };
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/;
/** Kyiv wall time 'YYYY-MM-DD HH:MM' or 'YYYY-MM-DD HH:MM:SS' → UTC instant 'YYYY-MM-DDTHH:MM:SS.000Z'.
 *  DST-correct; an ambiguous wall time resolves to the EARLIER instant; a non-existent one throws. */
export function kyiv(local: string): Instant {
  const m = LOCAL.exec(local);
  if (!m) throw new Error(`kyiv: "${local}" is not 'YYYY-MM-DD HH:MM[:SS]'`);
  const [, y, mo, d, h, mi, s = '00'] = m as unknown as [string, string, string, string, string, string, string?];
  const asUtc = Date.UTC(toInt(y), toInt(mo) - 1, toInt(d), toInt(h), toInt(mi), toInt(s));
  const want = `${y}-${mo}-${d} ${h}:${mi}:${s}`;
  // +03:00 (summer) first, so an ambiguous autumn wall time resolves to the earlier instant.
  const hit = [asUtc - 10_800_000, asUtc - 7_200_000].find((ms) => wall(ms).stamp === want);
  if (hit === undefined) throw new Error(`kyiv: ${local} does not exist in ${TZ}`);
  return asInstant(new Date(hit).toISOString());
}
/** Shorthand for kyiv(`${DEMO_DATE} ${hm}`): demo('05:20') → '2026-09-21T02:20:00.000Z'. */
export const demo = (hm: string): Instant => kyiv(`${DEMO_DATE} ${hm}`);

/** The Kyiv calendar date an instant falls on. */
export function businessDate(at: Instant): BusinessDate {
  const w = wall(Date.parse(at));
  return asBusinessDate(`${w.y}-${w.mo}-${w.d}`);
}
/** Kyiv wall-clock parts of an instant; `wd` is 0 = нд … 6 = сб. */
export function kyivParts(at: Instant): { y: number; mo: number; d: number; h: number; mi: number; s: number; wd: number } {
  const w = wall(Date.parse(at));
  return { y: toInt(w.y), mo: toInt(w.mo), d: toInt(w.d), h: toInt(w.h), mi: toInt(w.mi), s: toInt(w.s),
    wd: WEEKDAYS.indexOf(w.wd) };
}
function wholeUnits(ms: number, unit: number): number {
  return lt(ms, 0) ? -intDiv(-ms, unit) : intDiv(ms, unit);
}
/** Whole minutes, truncated toward zero, to − from. */
export const minutesBetween = (from: Instant, to: Instant): number => wholeUnits(Date.parse(to) - Date.parse(from), 60_000);
export const secondsBetween = (from: Instant, to: Instant): number => wholeUnits(Date.parse(to) - Date.parse(from), 1_000);
export function addMinutes(at: Instant, minutes: number): Instant {
  const d = new Date(Date.parse(at));
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return asInstant(d.toISOString());
}
export function addSeconds(at: Instant, seconds: number): Instant {
  const d = new Date(Date.parse(at));
  d.setUTCSeconds(d.getUTCSeconds() + seconds);
  return asInstant(d.toISOString());
}
export const cmpInstant = (a: Instant, b: Instant): -1 | 0 | 1 => Math.sign(Date.parse(a) - Date.parse(b)) as -1 | 0 | 1;
export const isBefore = (a: Instant, b: Instant): boolean => cmpInstant(a, b) === -1;
export const atOrBefore = (a: Instant, b: Instant): boolean => cmpInstant(a, b) !== 1;
const utcOf = (date: BusinessDate, days = 0): number =>
  Date.UTC(toInt(date.slice(0, 4)), toInt(date.slice(5, 7)) - 1, toInt(date.slice(8, 10)) + days);
/** Calendar days, to − from. */
export const daysBetween = (from: BusinessDate, to: BusinessDate): number => wholeUnits(utcOf(to) - utcOf(from), 86_400_000);
export const addDays = (date: BusinessDate, days: number): BusinessDate =>
  asBusinessDate(new Date(utcOf(date, days)).toISOString().slice(0, 10));
