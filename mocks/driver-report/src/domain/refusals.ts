// mocks/driver-report/src/domain/refusals.ts
/** The office's refusals as pure rules over values (§7.5): a handwritten time off the back of a ТТН, an odometer the
 *  office types over the driver's, a day already confirmed. Each returns the refusal or `null`, and the handler that
 *  calls it writes its own `fail('<operation>', r.code, r.message, r.ctx)` — the literal code lives HERE, in a rule
 *  module, which is what lets `contract:complete` credit it to that operation.
 *
 *  Only the office meets these. A driver's write is never refused for what it says: an odd value lands with a flag
 *  (§7.3, §7.5). The shape of the body (a string, an int) is the contract's `shape()`; a rule here answers only "is
 *  this a legal value", never "is this the right shape". */
import { gt, toInt } from './num';

export type Refusal<C extends string> = { code: C; message: string; ctx: Record<string, unknown> };

/** The field's own sentence (§4.2 C-04, C-05, §7.5) — the same words the screen's SAYS table shows. */
const TIME_WORDS = 'Час — чотири цифри, наприклад 0748.';
const ODOMETER_WORDS = 'Лише цифри, до 7 знаків.';
const CONFIRMED_WORDS = 'День уже підтверджено — зміни неможливі без «Відкрити для виправлення».';

const TIME = /^\d{4}$/;
const ODOMETER = /^\d{1,7}$/;

/** A time is typed as four digits, «0748» → 07:48; hours 00–23, minutes 00–59. */
export function badTime(value: string): Refusal<'VALUE_INVALID'> | null {
  const ok = TIME.test(value) && !gt(toInt(value.slice(0, 2)), 23) && !gt(toInt(value.slice(2, 4)), 59);
  return ok ? null : { code: 'VALUE_INVALID', message: TIME_WORDS, ctx: { field: 'time', value } };
}

/** An odometer is one to seven digits, nothing else: no spaces, no separators, no sign. */
export function badOdometer(value: string): Refusal<'VALUE_INVALID'> | null {
  return ODOMETER.test(value) ? null : { code: 'VALUE_INVALID', message: ODOMETER_WORDS, ctx: { field: 'odometer', value } };
}

/** A confirmed day refuses every change until it is opened for correction (P1). */
export function dayConfirmed(day: { status: string }): Refusal<'DAY_CONFIRMED'> | null {
  return day.status === 'CONFIRMED' ? { code: 'DAY_CONFIRMED', message: CONFIRMED_WORDS, ctx: {} } : null;
}
